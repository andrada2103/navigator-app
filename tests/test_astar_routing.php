<?php
// backend/tests/test_astar_routing.php

define('TESTING_MODE', true);
require_once __DIR__ . '/../../backend/routing_graph_api.php';

echo "Test rutare A*\n\n";

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

function assertRouteExists($result, $key)
{
    return isset($result['routes'][$key]) &&
        isset($result['routes'][$key]['geojson']) &&
        isset($result['routes'][$key]['properties']);
}

function routeContainsEdge($pathResult, $fromNode, $toNode)
{
    if (!$pathResult || !isset($pathResult['path']) || !is_array($pathResult['path'])) {
        return false;
    }

    foreach ($pathResult['path'] as $segment) {
        if (
            isset($segment['from'], $segment['to']) &&
            (
                ((int)$segment['from'] === (int)$fromNode && (int)$segment['to'] === (int)$toNode) ||
                ((int)$segment['from'] === (int)$toNode && (int)$segment['to'] === (int)$fromNode)
            )
        ) {
            return true;
        }
    }

    return false;
}

// ===== SETUP =====
$graph = RoutingGraph::getInstance();
$finder = new PathFinder($graph);

// puncte reale din Brașov
$startNode = $graph->findNearestNode(45.6508, 25.5887, 3.0, 'driving');
$endNode   = $graph->findNearestNode(45.6732, 25.6365, 3.0, 'driving');

runTest("Există nod start valid", $startNode !== null);
runTest("Există nod destinație valid", $endNode !== null);

if (!$startNode || !$endNode) {
    echo "\nNu s-au putut găsi nodurile de test. Oprire.\n";
    exit(1);
}

// ===== TEST 1: start = destinație =====
$sameResult = $finder->compareCarRoutes($startNode, $startNode);

runTest(
    "A* - același punct produce răspuns valid",
    is_array($sameResult) && isset($sameResult['routes'])
);

// ===== TEST 2: există cele 3 rute =====
$result = $finder->compareCarRoutes($startNode, $endNode);

runTest("A* - există ruta shortest/optimal", assertRouteExists($result, 'optimal'));
runTest("A* - există ruta fastest", assertRouteExists($result, 'fastest'));
runTest("A* - există ruta balanced", assertRouteExists($result, 'balanced'));

// ===== TEST 3: shortest are distanța minimă =====
if (assertRouteExists($result, 'optimal') && assertRouteExists($result, 'fastest') && assertRouteExists($result, 'balanced')) {
    $shortestDist = $result['routes']['optimal']['properties']['total_distance'];
    $fastestDist  = $result['routes']['fastest']['properties']['total_distance'];
    $balancedDist = $result['routes']['balanced']['properties']['total_distance'];

    runTest(
        "A* - ruta shortest are distanța minimă",
        $shortestDist <= $fastestDist + 0.1 &&
            $shortestDist <= $balancedDist + 0.1
    );
} else {
    runTest("A* - ruta shortest are distanța minimă", false);
}

// ===== TEST 4: fastest are timpul minim =====
if (assertRouteExists($result, 'optimal') && assertRouteExists($result, 'fastest') && assertRouteExists($result, 'balanced')) {
    $shortestTime = $result['routes']['optimal']['properties']['total_time'];
    $fastestTime  = $result['routes']['fastest']['properties']['total_time'];
    $balancedTime = $result['routes']['balanced']['properties']['total_time'];

    runTest(
        "A* - ruta fastest are timpul minim",
        $fastestTime <= $shortestTime + 0.1 &&
            $fastestTime <= $balancedTime + 0.1
    );
} else {
    runTest("A* - ruta fastest are timpul minim", false);
}

// ===== TEST 5: balanced are proprietăți valide =====
if (assertRouteExists($result, 'balanced')) {
    $props = $result['routes']['balanced']['properties'];

    runTest(
        "A* - ruta balanced are proprietăți valide",
        isset($props['total_distance'], $props['total_time'], $props['total_cost_algorithm'], $props['safety_score']) &&
            $props['total_distance'] > 0 &&
            $props['total_time'] > 0 &&
            $props['total_cost_algorithm'] > 0 &&
            $props['safety_score'] >= 1 &&
            $props['safety_score'] <= 10
    );
} else {
    runTest("A* - ruta balanced are proprietăți valide", false);
}

// ===== TEST 6: balanced are scor valid =====
if (assertRouteExists($result, 'balanced')) {
    $balancedSafety = $result['routes']['balanced']['properties']['safety_score'];

    runTest(
        "A* - ruta balanced are scor de siguranță valid",
        $balancedSafety >= 1 && $balancedSafety <= 10
    );
} else {
    runTest("A* - ruta balanced are scor de siguranță valid", false);
}

// ===== TEST 7: rută validă între două puncte reale =====
runTest(
    "A* - rută validă între două puncte reale din Brașov",
    assertRouteExists($result, 'optimal') &&
        $result['routes']['optimal']['properties']['total_distance'] > 0
);

// ===== TEST 8: muchia blocată deja activă este evitată =====
// În blocked_roads.json, bulevardul_vlahuta este activ
$blockedFrom = 2578917719;
$blockedTo   = 11499996491;

$blockedPath = $finder->aStarWithStats($blockedFrom, $blockedTo, 'distance_km', 'driving');

runTest(
    "A* - muchia blocată activă este evitată",
    $blockedPath === null || !routeContainsEdge($blockedPath, $blockedFrom, $blockedTo)
);

echo "Trecute: $passed\n";
echo "Eșuate: $failed\n";
echo "Total: " . ($passed + $failed) . "\n";
