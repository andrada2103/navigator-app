<?php
//import date gtfs ratbv - din fisiere text in baza de date in tabele - folderul gtfs_data
//permite rularea nelimitata pt fisiere mari
set_time_limit(0);
//activeaza erorile pt debug
error_reporting(E_ALL);
ini_set('display_errors', 1);

//fisiere config
require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/backend/cors_config.php';

//verfifica conexiunea la db
if (!isset($pdo)) {
    die("❌ Eroare de conexiune la baza de date");
}

$pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

//importa un fisier gtfs specific intr-un tabel specific
function importFile($pdo, $file, $table, $cols)
{
    //verifica daca exista fisierul
    if (!file_exists($file)) {
        echo "❌ Fișierul <b>$file</b> nu există!<br>";
        return;
    }

    //goleste tabelul inainte de import
    $pdo->exec("TRUNCATE TABLE $table");

    $handle = fopen($file, "r");
    if (!$handle) {
        echo "Nu am putut deschide fișierul <b>$file</b>!<br>";
        return 0;
    }

    //citeste headerele si le curata de carac speciale
    $headers = fgetcsv($handle);
    foreach ($headers as $key => $val) {
        $headers[$key] = preg_replace('/[\x00-\x1F\x80-\xFF]/', '', trim($val));
    }

    //creeaza un mapping header - index 
    $mapping = array_flip($headers);

    //pregateste interogarea SQL
    $placeholders = implode(',', array_fill(0, count($cols), '?'));
    $sql = "INSERT IGNORE INTO $table (" . implode(',', $cols) . ") VALUES ($placeholders)";
    $stmt = $pdo->prepare($sql);

    $count = 0;
    while (($row = fgetcsv($handle)) !== false) {
        $data = [];
        foreach ($cols as $col) {
            //daca nu exista coloana in fisier - null
            if (!isset($mapping[$col])) {
                $data[] = null;
                continue;
            }
            $index = $mapping[$col];
            $data[] = (isset($row[$index]) && $row[$index] !== '') ? $row[$index] : null;
        }

        try {
            $stmt->execute($data);
            $count++;
        } catch (PDOException $e) {
            //ignora duplicatele 
        }
    }
    fclose($handle);
    echo "✅ Succes: Importat $count rânduri în tabelul <b>$table</b>!<br>";
}

//dezactiveaza verificarile de chei externe pt a permite truncate
$pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

//verfica daca exista fisierlee inainte de import 
$gtfsFiles = [
    'stops' => __DIR__ . "/gtfs_data/stops.txt",
    'routes' => __DIR__ . "/gtfs_data/routes.txt",
    'trips' => __DIR__ . "/gtfs_data/trips.txt",
    'stop_times' => __DIR__ . "/gtfs_data/stop_times.txt",
    'shapes' => __DIR__ . "/gtfs_data/shapes.txt"
];

$missingFiles = [];
foreach ($gtfsFiles as $name => $path) {
    if (!file_exists($path)) {
        $missingFiles[] = $name;
    }
}

if (!empty($missingFiles)) {
    echo "Următoarele fișiere GTFS lipsă: " . implode(', ', $missingFiles) . "<br>";
    echo "Importul continuă cu fișierele disponibile.<br>";
}

//statii
importFile($pdo, __DIR__ . "/gtfs_data/stops.txt", "gtfs_stops", ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']);

//rute
importFile($pdo, __DIR__ . "/gtfs_data/routes.txt", "gtfs_routes", ['route_id', 'route_short_name', 'route_long_name', 'route_color']);

//trips 
importFile($pdo, __DIR__ . "/gtfs_data/trips.txt", "gtfs_trips", ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']);

//stop times
importFile($pdo, __DIR__ . "/gtfs_data/stop_times.txt", "gtfs_stop_times", ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']);

//shapes
importFile($pdo, __DIR__ . "/gtfs_data/shapes.txt", "gtfs_shapes", ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']);

//reactivam verificarile de integritate
$pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

echo "<br><b>Importul GTFS a fost finalizat cu succes</b>";
