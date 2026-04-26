<?php
require_once __DIR__ . '/init.php';

//functii validare
//valideaza id-ul unei rute - litere, cifre, underscore, cratima
function validateRouteId($routeId)
{
    return preg_match('/^[a-zA-Z0-9_-]+$/', $routeId);
}

//verifica directia - 0 sau 1
function validateDirection($direction)
{
    return $direction === '0' || $direction === '1';
}

//verifica id-ul unei statii
function validateStopId($stopId)
{
    // Elimină prefixul node/ înainte de validare
    $cleanId = preg_replace('/^node\//', '', $stopId);

    // Validare doar pentru partea numerică
    if (preg_match('/^[0-9]+$/', $cleanId)) {
        return true;
    }

    // Validare originală pentru alte cazuri
    $clean = preg_replace('/[^a-zA-Z0-9_\-]/', '', $stopId);
    return $clean === $stopId && strlen($stopId) <= 50;
}

//verifica existanta rutei in db
function routeExistsInDatabase($pdo, $routeId)
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM gtfs_routes WHERE route_id = ?");
    $stmt->execute([$routeId]);
    return $stmt->fetchColumn() > 0;
}

//verifica existanta statiei in db
function stopExistsInDatabase($pdo, $stopId)
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM gtfs_stops WHERE stop_id = ?");
    $stmt->execute([$stopId]);
    return $stmt->fetchColumn() > 0;
}

//procesare actiune
try {

    $action = $_GET['action'] ?? '';

    //rate limiting in functie de actiune
    switch ($action) {
        case 'get_routes':
            checkRateLimit('bus_read', 10000, 1);
            break;
        case 'get_route_shape':
        case 'get_stops_for_route':
            checkRateLimit('bus_read', 10000, 1);
            break;
        case 'get_all_stops':
            checkRateLimit('bus_all_stops', 1000, 10);
            break;
        case 'get_batch_stops':
            checkRateLimit('bus_batch', 10000, 1);
            break;
        case 'get_next_bus':
            checkRateLimit('bus_next', 20000, 1);
            break;
    }

    switch ($action) {
        //obtine toate liniile de autobuz
        case 'get_routes':
            $stmt = $pdo->query("SELECT route_id, route_short_name, route_long_name, route_color FROM gtfs_routes ORDER BY route_short_name ASC");
            $routes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(["success" => true, "routes" => $routes]);
            break;

        //geometria traseului - deseneaza ruta pe harta
        case 'get_route_shape':
            $route_id = $_GET['route_id'] ?? '';
            $direction = $_GET['direction'] ?? '0';

            //validare
            if (!validateRouteId($route_id)) {
                echo json_encode(["success" => false, "message" => "ID rută invalid"]);
                exit;
            }

            if (!routeExistsInDatabase($pdo, $route_id)) {
                echo json_encode(["success" => false, "message" => "Ruta nu există"]);
                exit;
            }

            if (!validateDirection($direction)) {
                $direction = '0';
            }

            //cauta shape_id pt ruta si directia selectata
            $stmt = $pdo->prepare("SELECT DISTINCT shape_id FROM gtfs_trips 
                           WHERE route_id = ? 
                           AND direction_id = ? 
                           AND shape_id IS NOT NULL 
                           LIMIT 1");
            $stmt->execute([$route_id, $direction]);
            $row = $stmt->fetch();
            $shape_id = $row['shape_id'] ?? null;

            if (!$shape_id) {
                echo json_encode(["success" => false, "message" => "Nu s-a găsit geometria traseului."]);
                exit;
            }

            //obtine punctele traseului
            $stmt = $pdo->prepare("SELECT shape_pt_lat, shape_pt_lon FROM gtfs_shapes WHERE shape_id = ? ORDER BY shape_pt_sequence ASC");
            $stmt->execute([$shape_id]);
            $points = $stmt->fetchAll(PDO::FETCH_ASSOC);

            //obtine culoarea rutei
            $stmt = $pdo->prepare("SELECT route_color FROM gtfs_routes WHERE route_id = ? LIMIT 1");
            $stmt->execute([$route_id]);
            $colorRow = $stmt->fetch();

            echo json_encode([
                "success" => true,
                "points" => $points,
                "color" => $colorRow['route_color'] ?? '4e5044'
            ]);
            break;
        //statii pentru o ruta/directie
        case 'get_stops_for_route':
            $route_id = $_GET['route_id'] ?? '';
            $direction = $_GET['direction'] ?? '0';

            if (!validateRouteId($route_id)) {
                echo json_encode(["success" => false, "message" => "ID rută invalid"]);
                exit;
            }

            if (!routeExistsInDatabase($pdo, $route_id)) {
                echo json_encode(["success" => false, "message" => "Ruta nu există"]);
                exit;
            }

            if (!validateDirection($direction)) {
                $direction = '0';
            }

            //selecteaza statiile unice dintr-un singur trip pt acea linie
            $sql = "SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
            FROM gtfs_stops s
            JOIN gtfs_stop_times st ON s.stop_id = st.stop_id
            JOIN gtfs_trips t ON st.trip_id = t.trip_id
            WHERE t.route_id = ? AND t.direction_id = ?
            AND t.trip_id = (
                SELECT trip_id FROM gtfs_trips 
                WHERE route_id = ? AND direction_id = ? 
                LIMIT 1
            )
            ORDER BY st.stop_sequence ASC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$route_id, $direction, $route_id, $direction]);
            $stops = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(["success" => true, "stops" => $stops]);
            break;
        //urmatoarele sosiri dintr-o statie (sosiri live)
        case 'get_next_bus':
            $stop_id = $_GET['stop_id'] ?? '';

            if (!validateStopId($stop_id)) {
                echo json_encode(["success" => false, "message" => "ID stație invalid"]);
                exit;
            }

            if (!stopExistsInDatabase($pdo, $stop_id)) {
                echo json_encode(["success" => false, "message" => "Stația nu există"]);
                exit;
            }

            //determina ziua
            $dayOfWeek = date('N');

            if ($dayOfWeek <= 5) {
                $servicePattern = '%Mo-Fr%';
            } elseif ($dayOfWeek == 6) {
                $servicePattern = '%Sa%';
            } else {
                $servicePattern = '%Su%';
            }

            $sql = "SELECT 
                r.route_short_name, 
                r.route_color,
                r.route_id,
                t.direction_id,
                st.arrival_time,
                t.trip_id,
                t.service_id
            FROM gtfs_stop_times st
            JOIN gtfs_trips t ON st.trip_id = t.trip_id
            JOIN gtfs_routes r ON t.route_id = r.route_id
            WHERE st.stop_id = ? 
            AND t.service_id LIKE ?
            AND (
                st.arrival_time > CURTIME()
                OR
                (st.arrival_time < '04:00:00' AND st.arrival_time > '00:00:00')
            )
            ORDER BY 
                CASE WHEN st.arrival_time > CURTIME() THEN 0 ELSE 1 END,
                st.arrival_time ASC
            LIMIT 10";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$stop_id, $servicePattern]);
            $arrivals = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(["success" => true, "arrivals" => $arrivals]);
            break;
        //fallbacl - toate statiile
        case 'get_all_stops':
            $stmt = $pdo->query("SELECT stop_id, stop_name, stop_lat, stop_lon FROM gtfs_stops");
            $stops = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(["success" => true, "stops" => $stops]);
            break;

        //toate statiile pentru o ruta
        case 'get_stops_for_route_full':
            $route_id = $_GET['route_id'] ?? '';
            $direction = $_GET['direction'] ?? '0';

            if (!validateRouteId($route_id)) {
                echo json_encode(["success" => false, "message" => "ID rută invalid"]);
                exit;
            }

            if (!routeExistsInDatabase($pdo, $route_id)) {
                echo json_encode(["success" => false, "message" => "Ruta nu există"]);
                exit;
            }

            //gaseste un trip_id reprezentativ pentru ruta si directie
            $tripSql = "SELECT trip_id FROM gtfs_trips 
                WHERE route_id = ? AND direction_id = ? 
                LIMIT 1";

            $stmt = $pdo->prepare($tripSql);
            $stmt->execute([$route_id, $direction]);
            $tripRow = $stmt->fetch();

            if (!$tripRow) {
                echo json_encode(["success" => false, "message" => "Nu s-a găsit niciun trip pentru această rută/direcție."]);
                exit;
            }

            $trip_id = $tripRow['trip_id'];

            //obtine toate statiile pt acest trip
            $sql = "SELECT 
                st.stop_sequence, 
                s.stop_id, 
                s.stop_name, 
                s.stop_lat, 
                s.stop_lon 
            FROM gtfs_stop_times st
            JOIN gtfs_stops s ON st.stop_id = s.stop_id
            WHERE st.trip_id = ?
            ORDER BY st.stop_sequence ASC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$trip_id]);
            $stops = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(["success" => true, "stops" => $stops]);
            break;
        //statii pt mai multe rute simultan
        case 'get_batch_stops':
            $routeIds = $_GET['route_ids'] ?? '';
            $directions = $_GET['directions'] ?? '0,1';

            if (empty($routeIds)) {
                echo json_encode(["success" => false, "message" => "Lipsă route_ids"]);
                exit;
            }

            //validare si curatare routeIds
            $routeArray = explode(',', $routeIds);
            $routeArray = array_map('trim', $routeArray);

            //filtrare rute: trebuie sa treaca de validare si să existe în DB
            $validRouteIds = [];
            foreach ($routeArray as $id) {
                if (validateRouteId($id) && routeExistsInDatabase($pdo, $id)) {
                    $validRouteIds[] = $id;
                }
            }

            //elimina duplicatele
            $validRouteIds = array_unique($validRouteIds);

            if (count($validRouteIds) > 100) {
                echo json_encode(["success" => false, "message" => "Prea multe rute cerute (max 100)"]);
                exit;
            }

            //validare și curtaare directions
            $dirArray = explode(',', $directions);
            $validDirections = [];
            foreach ($dirArray as $dir) {
                $dir = trim($dir);
                if (validateDirection($dir)) {
                    $validDirections[] = $dir;
                }
            }
            $validDirections = array_unique($validDirections);

            if (empty($validRouteIds) || empty($validDirections)) {
                echo json_encode(["success" => false, "message" => "Date invalide"]);
                exit;
            }

            //construim query-ul cu numarul corect de placeholder-i '?'
            $routePlaceholders = implode(',', array_fill(0, count($validRouteIds), '?'));
            $dirPlaceholders = implode(',', array_fill(0, count($validDirections), '?'));

            //query-ul nu mai contine variabile concatenate, ci doar '?'.
            //pentru că PDO va trata '?' ca locuri pentru parametri.
            $sql = "
                SELECT 
                    t.route_id,
                    t.direction_id,
                    st.stop_sequence,
                    s.stop_id,
                    s.stop_name,
                    s.stop_lat,
                    s.stop_lon
                FROM gtfs_stop_times st
                JOIN gtfs_stops s ON st.stop_id = s.stop_id
                JOIN gtfs_trips t ON st.trip_id = t.trip_id
                WHERE (t.route_id, t.direction_id, t.trip_id) IN (
                    SELECT route_id, direction_id, MIN(trip_id)
                    FROM gtfs_trips
                    WHERE route_id IN ($routePlaceholders)
                    AND direction_id IN ($dirPlaceholders)
                    GROUP BY route_id, direction_id
                )
                ORDER BY t.route_id, t.direction_id, st.stop_sequence ASC
            ";

            //pregatim statement-ul. PDO va vedea $sql ca pe un sablon sigur.
            $stmt = $pdo->prepare($sql);

            //combinam array-urile cu valorile validate intr-un singur array de parametri.
            //ordinea este importanta - mai intai toate route_id-urile, apoi toate direction-urile.
            $params = array_merge($validRouteIds, $validDirections);

            //executam query-ul, pasand parametrii reali separat.
            //PDO se asigura ca valorile sunt tratate doar ca date, nu ca si cod SQL.
            $stmt->execute($params);

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            //proceseaza rezultatele
            $results = [];
            foreach ($rows as $row) {
                $key = $row['route_id'] . '_' . $row['direction_id'];
                if (!isset($results[$key])) {
                    $results[$key] = [
                        'route_id' => $row['route_id'],
                        'direction' => $row['direction_id'],
                        'stops' => []
                    ];
                }
                $results[$key]['stops'][] = [
                    'stop_sequence' => $row['stop_sequence'],
                    'stop_id' => $row['stop_id'],
                    'stop_name' => $row['stop_name'],
                    'stop_lat' => $row['stop_lat'],
                    'stop_lon' => $row['stop_lon']
                ];
            }

            echo json_encode([
                "success" => true,
                "batch_results" => array_values($results)
            ]);
            break;
        default:
            echo json_encode(["success" => false, "message" => "Acțiune necunoscută: " . $action]);
            break;
    }
} catch (Exception $e) {
    error_log("Bus API error: " . $e->getMessage() . " in " . $e->getFile() . " line " . $e->getLine());
    echo json_encode(["success" => false, "message" => "Eroare la procesarea cererii"]);
}
