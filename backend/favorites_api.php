<?php
require_once __DIR__ . '/init.php';

function sanitizeInput($data)
{
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

//validare coordonate gps lat = (-90, 90), lng = (-180, 180)
function validateCoordinates($lat, $lng)
{
    return is_numeric($lat) && is_numeric($lng) &&
        $lat >= -90 && $lat <= 90 &&
        $lng >= -180 && $lng <= 180;
}

//validare categorie
function validateCategory($category)
{
    $validCategories = ['favorite', 'home', 'work'];
    return in_array($category, $validCategories);
}

//verifica autentificarea
if (!isset($_SESSION['user_id'])) {
    error_log("Favorites API: Unauthorized access - no user_id in session");
    echo json_encode(['success' => false, 'message' => 'Acces neautorizat']);
    exit;
}

$action = $_GET['action'] ?? '';

//aplica rate limiting
switch ($action) {
    case 'get':
        checkRateLimit('favorites_get', 30, 1);
        break;
    case 'add':
        checkRateLimit('favorites_add', 10, 1);
        break;
    case 'delete':
        checkRateLimit('favorites_delete', 10, 1);
        break;
    case 'sync':
        checkRateLimit('favorites_sync', 5, 10);
        break;
}

//proceseaza actiunea
try {
    switch ($action) {
        //obstine favoritele utilizatorului
        case 'get':
            $stmt = $pdo->prepare("SELECT * FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC");
            $stmt->execute([$_SESSION['user_id']]);
            $favorites = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'favorites' => $favorites]);
            break;

        //adauga o locatie favorita
        case 'add':
            $data = json_decode(file_get_contents('php://input'), true);

            //validare date
            if (!$data) {
                echo json_encode(['success' => false, 'message' => 'Date invalide']);
                break;
            }

            $name = sanitizeInput($data['name'] ?? '');
            $address = sanitizeInput($data['address'] ?? '');
            $lat = $data['lat'] ?? null;
            $lng = $data['lng'] ?? null;
            $category = $data['category'] ?? 'favorite';

            //validari
            if (empty($name) || strlen($name) < 2) {
                echo json_encode(['success' => false, 'message' => 'Numele trebuie să aibă minim 2 caractere']);
                break;
            }

            if (empty($address)) {
                echo json_encode(['success' => false, 'message' => 'Adresa este obligatorie']);
                break;
            }

            if (!validateCoordinates($lat, $lng)) {
                echo json_encode(['success' => false, 'message' => 'Coordonate invalide']);
                break;
            }

            //seteaza categoria implicit dacaq e invalida
            if (!validateCategory($category)) {
                $category = 'favorite';
            }

            $stmt = $pdo->prepare("INSERT INTO user_favorites (user_id, name, address, lat, lng, category) VALUES (?, ?, ?, ?, ?, ?)");
            $result = $stmt->execute([
                $_SESSION['user_id'],
                $name,
                $address,
                $lat,
                $lng,
                $category
            ]);

            if ($result) {
                $newId = $pdo->lastInsertId();
                echo json_encode([
                    'success' => true,
                    'id' => $newId,
                    'message' => 'Loc adăugat cu succes'
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Adăugare eșuată']);
            }
            break;

        //sterge locatie favorita    
        case 'delete':
            $data = json_decode(file_get_contents('php://input'), true);
            $favoriteId = $data['id'] ?? $_GET['id'] ?? null;

            //validare id
            if (!$favoriteId || !is_numeric($favoriteId)) {
                echo json_encode(['success' => false, 'message' => 'ID invalid']);
                break;
            }

            $favoriteId = (int)$favoriteId;

            $stmt = $pdo->prepare("DELETE FROM user_favorites WHERE id = ? AND user_id = ?");
            $result = $stmt->execute([$favoriteId, $_SESSION['user_id']]);

            if ($result && $stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Loc șters cu succes']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Locul nu a fost găsit sau nu ai permisiunea să-l ștergi']);
            }
            break;

        //sincronizeaza favoritele din localStorage cu db
        case 'sync':
            $data = json_decode(file_get_contents('php://input'), true);
            $localFavorites = $data['favorites'] ?? [];

            if (!is_array($localFavorites)) {
                echo json_encode(['success' => false, 'message' => 'Date invalide']);
                break;
            }

            $added = 0;
            $errors = 0;

            foreach ($localFavorites as $fav) {
                //validare date in sync
                if (!isset($fav['name'], $fav['address'], $fav['lat'], $fav['lng'])) {
                    $errors++;
                    continue;
                }

                $name = sanitizeInput($fav['name']);
                $address = sanitizeInput($fav['address']);
                $lat = $fav['lat'];
                $lng = $fav['lng'];
                $category = $fav['category'] ?? 'favorite';

                if (!validateCoordinates($lat, $lng)) {
                    $errors++;
                    continue;
                }

                if (!validateCategory($category)) {
                    $category = 'favorite';
                }

                //verifica daca exista deja datele pentru prevenirea duplicatelor
                $checkStmt = $pdo->prepare("SELECT id FROM user_favorites WHERE user_id = ? AND name = ? AND address = ?");
                $checkStmt->execute([$_SESSION['user_id'], $name, $address]);

                if (!$checkStmt->fetch()) {
                    $insertStmt = $pdo->prepare("INSERT INTO user_favorites (user_id, name, address, lat, lng, category) VALUES (?, ?, ?, ?, ?, ?)");
                    $insertResult = $insertStmt->execute([
                        $_SESSION['user_id'],
                        $name,
                        $address,
                        $lat,
                        $lng,
                        $category
                    ]);

                    if ($insertResult) {
                        $added++;
                    } else {
                        $errors++;
                    }
                }
            }

            echo json_encode([
                'success' => true,
                'added' => $added,
                'errors' => $errors,
                'message' => "Sincronizare completă: $added adăugate, $errors erori"
            ]);
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Acțiune invalidă']);
    }
} catch (Exception $e) {
    error_log("Favorites API error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Eroare la procesarea cererii']);
}
