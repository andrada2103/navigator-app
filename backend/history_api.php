<?php
require_once __DIR__ . '/init.php';

//functii de validare
function validateActionType($type)
{
    $validTypes = ['search', 'route', 'weather', 'bus', 'poi', 'favorite', 'report'];
    return in_array($type, $validTypes);
}

//valideaza coord gps - lat = (-90, 90), lng = (-180, 180), null permis
function validateCoordinates($lat, $lng)
{
    if ($lat === null || $lng === null) return true;
    return is_numeric($lat) && is_numeric($lng) &&
        $lat >= -90 && $lat <= 90 &&
        $lng >= -180 && $lng <= 180;
}

//sanitizeaza datele pentru prevenirea XSS
function sanitizeData($data)
{
    if (is_array($data)) {
        return array_map('sanitizeData', $data);
    }
    if (is_string($data)) {
        return htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
    }
    return $data;
}

//trimite eroare in format JSON
function sendError($message)
{
    $response = ['success' => false, 'message' => $message];
    echo json_encode($response);
    exit;
}

//verifica daca utilizatorul este autentificat
if (!isset($_SESSION['user_id'])) {
    error_log("history_api: User not authenticated");
    sendError('Neautorizat - nu ești autentificat');
}

error_log("history_api: User authenticated, ID: " . $_SESSION['user_id']);

$action = $_GET['action'] ?? '';
error_log("history_api: Action: " . $action);

//aplica rate limiting pentru fiecare actiune
switch ($action) {
    case 'add':
        checkRateLimit('history_add', 20, 1);
        break;
    case 'get':
        checkRateLimit('history_get', 30, 1);
        break;
    case 'clear':
        checkRateLimit('history_clear', 5, 10);
        break;
    case 'export':
        checkRateLimit('history_export', 5, 10);
        break;
}

//proceseaza actiunea
try {
    switch ($action) {
        //adauga o intrare in istoric
        case 'add':
            //pimeste datele
            $input = file_get_contents('php://input');
            error_log("history_api: Received data: " . $input);

            $data = json_decode($input, true);
            if (!$data) {
                sendError('Date invalide');
            }

            //validare actiune
            if (!isset($data['type']) || !validateActionType($data['type'])) {
                sendError('Tip acțiune invalid');
            }

            //validare coordonate
            $lat = $data['lat'] ?? null;
            $lng = $data['lng'] ?? null;
            if (!validateCoordinates($lat, $lng)) {
                sendError('Coordonate invalide');
            }

            //danitizare date
            $actionData = sanitizeData($data['data'] ?? []);

            //verfifica daca exista tabelul
            $stmt = $pdo->query("SHOW TABLES LIKE 'user_history'");
            if ($stmt->rowCount() == 0) {
                error_log("history_api: Table 'user_history' does not exist!");
                sendError('Eroare la salvarea istoricului');
            }

            //insereaza
            $stmt = $pdo->prepare("INSERT INTO user_history (user_id, action_type, action_data, location_lat, location_lng) VALUES (?, ?, ?, ?, ?)");
            $result = $stmt->execute([
                $_SESSION['user_id'],
                $data['type'],
                json_encode($actionData),
                $lat,
                $lng
            ]);

            if ($result) {
                error_log("history_api: Record inserted successfully");
                echo json_encode(['success' => true, 'message' => 'Acțiune salvată în istoric']);
            } else {
                error_log("history_api: Insert failed");
                sendError('Eroare la salvarea istoricului');
            }
            break;

        //obtine istoricul utilizatorului
        case 'get':
            $stmt = $pdo->prepare("SELECT * FROM user_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100");
            $stmt->execute([$_SESSION['user_id']]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            //formateaza pentru JS
            foreach ($history as &$item) {
                $item['action_data'] = json_decode($item['action_data'], true);
                $item['timestamp'] = $item['created_at'];
                $item['type'] = $item['action_type'];
                $item['location'] = $item['location_lat'] ? [
                    'lat' => floatval($item['location_lat']),
                    'lng' => floatval($item['location_lng'])
                ] : null;
                $item['id'] = $item['id'];
                $item['userId'] = $item['user_id'];
                $item['data'] = $item['action_data'];
            }

            error_log("history_api: Retrieved " . count($history) . " records");
            echo json_encode(['success' => true, 'history' => $history]);
            break;

        //sterge istoricul
        case 'clear':
            $stmt = $pdo->prepare("DELETE FROM user_history WHERE user_id = ?");
            $result = $stmt->execute([$_SESSION['user_id']]);

            if ($result) {
                error_log("history_api: Cleared history for user " . $_SESSION['user_id']);
                echo json_encode(['success' => true, 'message' => 'Istoric șters cu succes']);
            } else {
                sendError('Eroare la ștergerea istoricului');
            }
            break;

        case 'export':
            //exporta istoricul in format CSV
            $stmt = $pdo->prepare("SELECT * FROM user_history WHERE user_id = ? ORDER BY created_at DESC");
            $stmt->execute([$_SESSION['user_id']]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            //seteaza headerele pentru CSV
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename=istoric_' . date('Y-m-d') . '.csv');

            //deschide output-ul
            $output = fopen('php://output', 'w');

            //adauga BOM pnetru UTF-8 pentru diacritice
            fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

            //scrie headerele
            fputcsv($output, ['Data', 'Tip', 'Detalii', 'Locație']);

            //scrie datele
            foreach ($history as $item) {
                $data = json_decode($item['action_data'], true);
                $details = '';

                //formateaza datele in functie de tip
                switch ($item['action_type']) {
                    case 'search':
                        $details = "Căutare: " . ($data['query'] ?? '');
                        break;
                    case 'route':
                        $details = "De: " . ($data['from'] ?? '') . " → La: " . ($data['to'] ?? '');
                        break;
                    case 'weather':
                        $details = ($data['location'] ?? '') . " - " . ($data['temperature'] ?? '') . "°C";
                        break;
                    case 'bus':
                        $details = "Autobuz " . ($data['line'] ?? '') . " - Stația " . ($data['stop'] ?? '');
                        break;
                    case 'poi':
                        $details = ($data['name'] ?? '') . " (" . ($data['category'] ?? '') . ")";
                        break;
                    case 'favorite':
                        $details = "⭐ " . ($data['name'] ?? '');
                        break;
                    case 'report':
                        $details = "⚠️ " . ($data['category'] ?? '') . ": " . ($data['description'] ?? '');
                        break;
                    default:
                        $details = json_encode($data);
                }

                $location = $item['location_lat'] ? $item['location_lat'] . ', ' . $item['location_lng'] : '-';

                fputcsv($output, [
                    $item['created_at'],
                    $item['action_type'],
                    $details,
                    $location
                ]);
            }

            fclose($output);
            exit; //nu mai trimite nimic dupa CSV
            break;

        case 'sync':
            //sincronizeaza istoricul din localStorage cu db
            error_log("=== SYNC REQUEST RECEIVED ===");
            error_log("User ID: " . ($_SESSION['user_id'] ?? 'not set'));

            $input = json_decode(file_get_contents('php://input'), true);
            error_log("Input: " . print_r($input, true));

            $history = $input['history'] ?? [];
            error_log("History count: " . count($history));

            if (!is_array($history)) {
                error_log("Error: history is not an array");
                sendError('Date invalide');
            }

            $added = 0;
            $errors = 0;

            foreach ($history as $index => $item) {
                error_log("Processing item $index: " . print_r($item, true));
                try {
                    $type = $item['type'] ?? '';
                    $actionData = json_encode($item['data'] ?? []);
                    $lat = $item['location']['lat'] ?? null;
                    $lng = $item['location']['lng'] ?? null;

                    error_log("Inserting: user_id={$_SESSION['user_id']}, type=$type, lat=$lat, lng=$lng");

                    $stmt = $pdo->prepare("INSERT INTO user_history (user_id, action_type, action_data, location_lat, location_lng) VALUES (?, ?, ?, ?, ?)");
                    $result = $stmt->execute([
                        $_SESSION['user_id'],
                        $type,
                        $actionData,
                        $lat,
                        $lng
                    ]);

                    if ($result) {
                        $added++;
                        error_log("Item $index inserted successfully");
                    } else {
                        $errors++;
                        error_log("Item $index insert failed");
                    }
                } catch (Exception $e) {
                    error_log("Exception for item $index: " . $e->getMessage());
                    $errors++;
                }
            }

            error_log("Sync completed: added=$added, errors=$errors");
            echo json_encode([
                'success' => true,
                'added' => $added,
                'errors' => $errors,
                'message' => "Sincronizare completă: $added adăugate, $errors erori"
            ]);
            break;

        default:
            error_log("history_api: Invalid action: " . $action);
            sendError('Acțiune invalidă: ' . $action);
    }
} catch (Exception $e) {
    error_log("history_api: Exception: " . $e->getMessage());
    error_log("history_api: Stack trace: " . $e->getTraceAsString());
    sendError('Eroare internă');
}
