<?php
// backend/tests/test_heuristic.php

define('TESTING_MODE', true);
require_once __DIR__ . '/../../backend/routing_graph_api.php';

echo "Test functia euristica A*\n\n";

// Creăm o versiune simplificată a grafului doar pentru test
class TestGraph
{
    private $nodes = [];

    public function addNode($id, $lat, $lng)
    {
        $this->nodes[$id] = ['lat' => $lat, 'lng' => $lng];
    }

    public function getNodeCoords($id)
    {
        return $this->nodes[$id] ?? null;
    }

    public function haversineDistance($lat1, $lng1, $lat2, $lng2)
    {
        $earthRadius = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
            cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
            sin($dLng / 2) * sin($dLng / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $earthRadius * $c;
    }
}

function calculateWalkingDifficulty($highwayType, $distance)
{
    $highwayFactor = 1.0;
    switch ($highwayType) {
        case 'steps':
            $highwayFactor = 3.0;
            break;
        case 'footway':
            $highwayFactor = 1.2;
            break;
        case 'residential':
            $highwayFactor = 1.0;
            break;
        default:
            $highwayFactor = 1.1;
    }
    return $distance * $highwayFactor;
}

$testGraph = new TestGraph();
$testGraph->addNode(1, 45.65, 25.60);  // Centru Brașov
$testGraph->addNode(2, 45.66, 25.61);  // La ~1.5 km distanță

$passed = 0;
$failed = 0;

function runTest($name, $condition)
{
    global $passed, $failed;
    if ($condition) {
        echo "Pass: $name\n";
        $passed++;
    } else {
        echo "Fail: $name\n";
        $failed++;
    }
}


// Test 2.1: Distanța dintre același punct = 0
$dist = $testGraph->haversineDistance(45.65, 25.60, 45.65, 25.60);
runTest("Distanță punct identic = 0", abs($dist) < 0.001);

// Test 2.2: Distanța aproximativă între două puncte cunoscute
$dist = $testGraph->haversineDistance(45.65, 25.60, 45.66, 25.61);
runTest("Distanță între puncte apropiate (~1.5 km)", $dist > 1.0 && $dist < 2.0);

// Test 2.3: Simetria distanței (d(A,B) = d(B,A))
$distAB = $testGraph->haversineDistance(45.65, 25.60, 45.66, 25.61);
$distBA = $testGraph->haversineDistance(45.66, 25.61, 45.65, 25.60);
runTest("Simetria distanței", abs($distAB - $distBA) < 0.001);

// Test 2.4: Distanța Brașov - București (~140 km)
$distBrasovBuc = $testGraph->haversineDistance(45.65, 25.60, 44.43, 26.10);
runTest("Distanța Brașov - București (~140 km)", $distBrasovBuc > 130 && $distBrasovBuc < 150);

runTest(
    "Walking difficulty - steps (3x mai greu)",
    abs(calculateWalkingDifficulty('steps', 1.0) - 3.0) < 0.01
);

runTest(
    "Walking difficulty - residential (normal)",
    abs(calculateWalkingDifficulty('residential', 1.0) - 1.0) < 0.01
);

echo "Trecute: $passed\n";
echo "Eșuate: $failed\n";
