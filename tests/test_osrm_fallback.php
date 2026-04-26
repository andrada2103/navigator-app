<?php
// backend/tests/test_osrm_fallback.php

define('TESTING_MODE', true);
require_once __DIR__ . '/../../backend/routing_graph_api.php';
require_once __DIR__ . '/../../backend/OSRMClient.php';
require_once __DIR__ . '/../../backend/brasov_city_boundary.php';

echo "=== TESTE FALLBACK OSRM ===\n\n";

$passed = 0;
$failed = 0;

function runTest($name, $condition)
{
    global $passed, $failed;
    if ($condition) {
        echo "Pass: $name\n";
        $passed++;
    } else {
        echo "Fall: $name\n";
        $failed++;
    }
}

function shouldUseCustomGraph($startLat, $startLng, $endLat, $endLng)
{
    $boundary = BrasovCityBoundary::getInstance();
    $startInCity = $boundary->isPointInCity($startLat, $startLng);
    $endInCity = $boundary->isPointInCity($endLat, $endLng);

    return $startInCity && $endInCity;
}

// ===== TEST 1: punct în Brașov =====
$inBrasov = BrasovCityBoundary::getInstance()->isPointInCity(45.6508, 25.5887);
runTest("Punct în centrul Brașovului este în oraș", $inBrasov === true);

// ===== TEST 2: punct în afara Brașovului =====
$outBrasov = BrasovCityBoundary::getInstance()->isPointInCity(45.7983, 24.9731); // Făgăraș aprox.
runTest("Punct în afara Brașovului este în afara orașului", $outBrasov === false);

// ===== TEST 3: ambele puncte în oraș => A* =====
$useAStar = shouldUseCustomGraph(45.6508, 25.5887, 45.6732, 25.6365);
runTest("Două puncte din Brașov folosesc graful urban (A*)", $useAStar === true);

// ===== TEST 4: un punct în afara orașului => OSRM =====
$useAStar = shouldUseCustomGraph(45.6508, 25.5887, 45.7983, 24.9731);
runTest("Dacă un punct este în afara orașului se folosește fallback OSRM", $useAStar === false);

// ===== TEST 5: ambele puncte în afara orașului => OSRM =====
$useAStar = shouldUseCustomGraph(45.7983, 24.9731, 45.6436, 25.5886); // Făgăraș -> Brașov-ish / adaptabil
runTest("Dacă punctele nu sunt ambele în oraș, nu se folosește A*", $useAStar === false);

// ===== TEST 6: apel direct OSRM driving =====
$osrm = new OSRMClient();
$osrmData = $osrm->getRoute(45.6508, 25.5887, 45.7983, 24.9731, 'driving');

runTest(
    "OSRM driving răspunde cu date valide",
    is_array($osrmData) && isset($osrmData['routes'][0])
);

// ===== TEST 7: formatResponse() pentru driving =====
if ($osrmData && isset($osrmData['routes'][0])) {
    $formatted = $osrm->formatResponse($osrmData, 'driving');

    runTest(
        "OSRM formatResponse(driving) returnează structură validă",
        isset($formatted['success']) &&
            $formatted['success'] === true &&
            isset($formatted['routes']['optimal']['geojson']) &&
            isset($formatted['routes']['optimal']['properties']['total_distance']) &&
            isset($formatted['routes']['optimal']['properties']['total_time']) &&
            $formatted['routes']['optimal']['properties']['source'] === 'osrm'
    );
} else {
    runTest("OSRM formatResponse(driving) returnează structură validă", false);
}

// ===== TEST 8: apel direct OSRM walking =====
$osrmWalk = $osrm->getRoute(45.6508, 25.5887, 45.6518, 25.5900, 'foot');

runTest(
    "OSRM walking răspunde cu date valide",
    is_array($osrmWalk) && isset($osrmWalk['routes'][0])
);

// ===== TEST 9: formatResponse() pentru walking =====
if ($osrmWalk && isset($osrmWalk['routes'][0])) {
    $formattedWalk = $osrm->formatResponse($osrmWalk, 'walking');

    runTest(
        "OSRM formatResponse(walking) returnează structură validă",
        isset($formattedWalk['success']) &&
            $formattedWalk['success'] === true &&
            isset($formattedWalk['routes']['optimal']['geojson']) &&
            isset($formattedWalk['routes']['optimal']['properties']['total_distance']) &&
            isset($formattedWalk['routes']['optimal']['properties']['total_time']) &&
            $formattedWalk['routes']['optimal']['properties']['source'] === 'osrm'
    );
} else {
    runTest("OSRM formatResponse(walking) returnează structură validă", false);
}

echo "Trecute: $passed\n";
echo "Eșuate: $failed\n";
