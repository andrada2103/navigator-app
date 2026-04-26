<?php
//backend/routing_graph_api.php

ini_set('display_errors', 0);
error_reporting(E_ALL);

//configurare CORS
$allowedOrigins = [
    'http://localhost',
    'http://localhost:80',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'http://192.168.1.131',
    'http://192.168.1.131:80',
    'https://oversoftly-hydraulic-reginald.ngrok-free.dev'
];

if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    } else {
        header('Access-Control-Allow-Origin: http://localhost');
    }
} else {
    header('Access-Control-Allow-Origin: http://localhost');
}

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit(0);
}


define('GRAPH_FILE', __DIR__ . '/brasov_graph.json');
define('USE_CACHING', true);
define('CACHE_DIR', __DIR__ . '/cache/');

require_once __DIR__ . '/brasov_city_boundary.php';
require_once __DIR__ . '/OSRMClient.php';

if (!file_exists(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0777, true);
}

function debugToFile($message)
{
    file_put_contents(__DIR__ . '/debug.log', date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL, FILE_APPEND);
}

function sendJSON($data)
{
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

//clasa pentru graf
class RoutingGraph
{
    private static $instance = null;
    private $nodes = [];
    private $edges = [];
    private $adjacencyList = [];
    private $nodeIndex = [];
    private $nodeGrid = [];
    private $loadTime = 0;

    private function __construct()
    {
        $start = microtime(true);
        $this->loadGraph();
        $this->loadTime = microtime(true) - $start;
    }

    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function loadGraph()
    {
        $cacheFile = CACHE_DIR . 'graph_cache.php';

        if (USE_CACHING && file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
            $this->loadFromCache($cacheFile);
            error_log("Graf încărcat din cache în {$this->loadTime}s");
            return;
        }

        if (!file_exists(GRAPH_FILE)) {
            error_log("Graph file not found: " . GRAPH_FILE);
            return;
        }

        error_log("Se încarcă graful din JSON...");
        $json = file_get_contents(GRAPH_FILE);
        $data = json_decode($json, true);

        if (!$data) {
            error_log("Invalid graph JSON");
            return;
        }

        // Indexează nodurile
        foreach ($data['nodes'] as $node) {
            $this->nodes[$node['id']] = $node;

            // Adaugă în grilă pentru căutare rapidă
            $gridX = floor($node['lat'] * 100);
            $gridY = floor($node['lng'] * 100);
            if (!isset($this->nodeGrid[$gridX][$gridY])) {
                $this->nodeGrid[$gridX][$gridY] = [];
            }
            $this->nodeGrid[$gridX][$gridY][] = $node['id'];

            $this->nodeIndex[] = [
                'id' => $node['id'],
                'lat' => $node['lat'],
                'lng' => $node['lng']
            ];
        }

        // Construiește lista de adiacență și păstrează muchiile
        foreach ($data['edges'] as $edge) {
            $from = $edge['from'];
            $to = $edge['to'];

            // Păstrează muchia pentru referință
            $this->edges[] = $edge;

            if (!isset($this->adjacencyList[$from])) {
                $this->adjacencyList[$from] = [];
            }

            $this->adjacencyList[$from][] = [
                'to' => $to,
                'distance_km' => $edge['distance_km'],
                'time_min' => $edge['time_min'],
                'walking_cost' => $edge['walking_cost'] ?? $edge['distance_km'],
                'cycling_cost' => $edge['cycling_cost'] ?? $edge['distance_km'],
                'weight_safe' => $edge['weight_safe'] ?? $edge['time_min'],
                'safety_score' => $edge['safety_score'] ?? 5,
                'highway' => $edge['highway'] ?? 'unknown',
                'name' => $edge['name'] ?? '',
                'car_allowed' => $edge['car_allowed'] ?? true
            ];

            // Muchie bidirecțională (dacă nu e sens unic)
            if (!isset($edge['oneway']) || !$edge['oneway']) {
                if (!isset($this->adjacencyList[$to])) {
                    $this->adjacencyList[$to] = [];
                }
                $this->adjacencyList[$to][] = [
                    'to' => $from,
                    'distance_km' => $edge['distance_km'],
                    'time_min' => $edge['time_min'],
                    'walking_cost' => $edge['walking_cost'] ?? $edge['distance_km'],
                    'cycling_cost' => $edge['cycling_cost'] ?? $edge['distance_km'],
                    'weight_safe' => $edge['weight_safe'] ?? $edge['time_min'],
                    'safety_score' => $edge['safety_score'] ?? 5,
                    'highway' => $edge['highway'] ?? 'unknown',
                    'name' => $edge['name'] ?? '',
                    'car_allowed' => $edge['car_allowed'] ?? true
                ];
            }
        }

        // Salvează în cache
        $this->saveToCache($cacheFile);

        error_log("Graf încărcat: " . count($this->nodes) . " noduri, " . count($this->edges) . " muchii în {$this->loadTime}s");
    }

    private function saveToCache($cacheFile)
    {
        $cache = [
            'nodes' => $this->nodes,
            'nodeIndex' => $this->nodeIndex,
            'adjacencyList' => $this->adjacencyList,
            'nodeGrid' => $this->nodeGrid,
            'edges' => $this->edges,
            'timestamp' => time()
        ];

        file_put_contents($cacheFile, '<?php return ' . var_export($cache, true) . ';');
    }

    private function loadFromCache($cacheFile)
    {
        $cache = include $cacheFile;
        $this->nodes = $cache['nodes'];
        $this->nodeIndex = $cache['nodeIndex'];
        $this->adjacencyList = $cache['adjacencyList'];
        $this->nodeGrid = $cache['nodeGrid'];
        $this->edges = $cache['edges'];
    }

    public function findNearestNode($lat, $lng, $maxDistance = 3.0, $transportType = 'driving')
    {
        $closest = null;
        $minDist = INF;

        // Caută în celula curentă și în celulele vecine
        $gridX = floor($lat * 100);
        $gridY = floor($lng * 100);

        for ($dx = -2; $dx <= 2; $dx++) {
            for ($dy = -2; $dy <= 2; $dy++) {
                $cellX = $gridX + $dx;
                $cellY = $gridY + $dy;

                if (isset($this->nodeGrid[$cellX][$cellY])) {
                    foreach ($this->nodeGrid[$cellX][$cellY] as $nodeId) {
                        $node = $this->nodes[$nodeId];

                        // Verifică dacă nodul e accesibil pentru transportul cerut
                        if (!$this->isNodeAccessibleForTransport($nodeId, $transportType)) {
                            continue;
                        }

                        $dist = $this->haversineDistance($lat, $lng, $node['lat'], $node['lng']);
                        if ($dist < $minDist && $dist <= $maxDistance) {
                            $minDist = $dist;
                            $closest = $nodeId;
                        }
                    }
                }
            }
        }

        // Dacă nu găsește, caută în toate nodurile
        if (!$closest) {
            foreach ($this->nodeIndex as $node) {
                if (!$this->isNodeAccessibleForTransport($node['id'], $transportType)) {
                    continue;
                }

                $dist = $this->haversineDistance($lat, $lng, $node['lat'], $node['lng']);
                if ($dist < $minDist && $dist <= $maxDistance * 2) {
                    $minDist = $dist;
                    $closest = $node['id'];
                }
            }
        }

        return $closest;
    }

    private function isNodeAccessibleForTransport($nodeId, $transportType)
    {
        $neighbors = $this->getAdjacent($nodeId);

        foreach ($neighbors as $edge) {
            if ($transportType === 'driving') {
                if (isset($edge['car_allowed']) && $edge['car_allowed'] === true) {
                    return true;
                }

                $highway = $edge['highway'] ?? '';
                if (is_array($highway)) {
                    $highway = $highway[0] ?? '';
                }

                // Verifică dacă e un tip de drum permis
                $car_allowed_types = ['residential', 'service', 'tertiary', 'secondary', 'primary', 'living_street'];
                if (in_array($highway, $car_allowed_types)) {
                    return true;
                }
            } else {
                // Pentru walking/cycling, orice nod e ok
                return true;
            }
        }

        return false;
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

    public function getAdjacent($nodeId)
    {
        return $this->adjacencyList[$nodeId] ?? [];
    }

    public function getNodeCoords($nodeId)
    {
        $node = $this->nodes[$nodeId] ?? null;
        if ($node) {
            return ['lat' => $node['lat'], 'lng' => $node['lng']];
        }
        return null;
    }

    public function getEdges()
    {
        return $this->edges;
    }

    public function getStats()
    {
        return [
            'nodes' => count($this->nodes),
            'edges' => count($this->edges),
            'load_time' => round($this->loadTime, 3)
        ];
    }
}

//algoritm de rutare
class PathFinder
{
    private $graph;

    public function __construct($graph)
    {
        $this->graph = $graph;
    }

    // Verifică dacă o muchie e permisă pentru un anumit mod de transport
    private function isEdgeAllowedForTransport($edge, $transportType)
    {

        $highway = $edge['highway'] ?? '';

        // Verifică explicit dacă există flag-ul car_allowed din generator
        if ($transportType === 'driving') {
            // PRIORITATE 1: Dacă generatorul a marcat explicit ca interzis
            if (isset($edge['car_allowed']) && $edge['car_allowed'] === false) {
                return false;
            }

            // PRIORITATE 2: Dacă e marcat ca permis explicit
            if (isset($edge['car_allowed']) && $edge['car_allowed'] === true) {
                return true;
            }
        }

        // Tipuri de drumuri PROBLEMATICE - dar le permitem cu PENALIZARE MARE
        $problematic_highways = [
            'pedestrian',
            'footway',
            'path',
            'steps',
            'cycleway',
            'bridleway',
            'track'
        ];

        switch ($transportType) {
            case 'driving':
                // NU mai interzicem complet aceste tipuri
                if (in_array($highway, $problematic_highways)) {
                    // Astfel algoritmul le va evita DOAR dacă există alternativă
                    return true; // Permitem accesul, dar cu penalizare mai jos
                }
                return true;

            case 'cycling':
                // La fel pentru bicicletă - permitem dar penalizăm
                $bike_forbidden = ['motorway', 'motorway_link', 'trunk', 'trunk_link'];
                if (in_array($highway, $bike_forbidden)) {
                    return false;
                }
                return true;

            case 'walking':
                $walking_forbidden = ['motorway', 'motorway_link', 'trunk', 'trunk_link'];

                // Adaugă scările doar dacă există alternativă
                $highway = $edge['highway'] ?? '';
                if (is_array($highway)) {
                    if (in_array('steps', $highway)) {
                        // Verifică dacă există altă cale în apropiere
                        // Pentru moment, return false
                        return false;
                    }
                }

                if (in_array($highway, $walking_forbidden)) {
                    return false;
                }
                return true;

            default:
                return true;
        }
    }

    private function logRouteAnalysis($pathResult, $startNode, $endNode, $transportType)
    {
        $logFile = __DIR__ . '/route_analysis.log';
        $timestamp = date('Y-m-d H:i:s');

        file_put_contents($logFile, "\n[$timestamp] ANALIZĂ RUTĂ $transportType\n", FILE_APPEND);
        file_put_contents($logFile, "Start: $startNode, Destinație: $endNode\n", FILE_APPEND);
        file_put_contents($logFile, "Lungime traseu: " . count($pathResult['path']) . " segmente\n", FILE_APPEND);

        // Identifică punctele de decizie importante
        $decisionPoints = [];
        foreach ($pathResult['path'] as $segment) {
            $from = $segment['from'];
            $to = $segment['to'];
            $fromCoords = $this->graph->getNodeCoords($from);

            // Verifică dacă e în zona intersecției
            $intersectieLat = 45.658372;
            $intersectieLng = 25.593370;
            $dist = $this->graph->haversineDistance(
                $fromCoords['lat'],
                $fromCoords['lng'],
                $intersectieLat,
                $intersectieLng
            );

            if ($dist < 0.1) { // 100m
                $decisionPoints[] = [
                    'nod' => $from,
                    'coords' => $fromCoords,
                    'distanta_intersectie' => round($dist * 1000, 0) . 'm'
                ];
            }
        }

        if (!empty($decisionPoints)) {
            file_put_contents($logFile, "Puncte de decizie în zona intersecției:\n", FILE_APPEND);
            foreach ($decisionPoints as $dp) {
                file_put_contents($logFile, "  - Nod {$dp['nod']} la [{$dp['coords']['lat']},{$dp['coords']['lng']}] ({$dp['distanta_intersectie']} de intersecție)\n", FILE_APPEND);
            }
        }

        file_put_contents($logFile, "----------------------------------------\n", FILE_APPEND);
    }

    private function isEdgeBlocked($fromNode, $toNode)
    {
        static $blockedEdges = null;
        static $hasAnyBlocks = null;

        if ($blockedEdges === null) {
            $blockedEdges = [];
            $hasAnyBlocks = false;
            $blockFile = __DIR__ . '/blocked_roads.json';

            if (file_exists($blockFile)) {
                $json = file_get_contents($blockFile);
                $data = json_decode($json, true);

                if ($data && isset($data['blocked_edges'])) {
                    foreach ($data['blocked_edges'] as $block) {
                        if (!empty($block['active'])) {
                            $hasAnyBlocks = true;
                            $blockedEdges[$block['from'] . '_' . $block['to']] = true;
                            $blockedEdges[$block['to'] . '_' . $block['from']] = true;
                        }
                    }
                }
            }
        }

        //Dacă nu există niciun blocaj, return direct false (fără căutare)
        if (!$hasAnyBlocks) {
            return false;
        }

        return isset($blockedEdges[$fromNode . '_' . $toNode]);
    }
    //A* cu statistici și suport pentru moduri de transport

    public function aStarWithStats($startNode, $endNode, $weightField, $transportType = 'driving')
    {


        $startTime = microtime(true);
        $nodesVisited = 0;


        $endCoords = $this->graph->getNodeCoords($endNode);
        if (!$endCoords) return null;

        $dist = [];
        $heuristic = [];
        $prev = [];
        $visited = [];
        $pq = new SplPriorityQueue();

        $dist[$startNode] = 0;
        $heuristic[$startNode] = $this->heuristic($startNode, $endCoords);
        $pq->insert($startNode, - ($dist[$startNode] + $heuristic[$startNode]));


        $iterations = 0;
        $maxIterations = 20000;

        while (!$pq->isEmpty() && $iterations++ < $maxIterations) {
            $current = $pq->extract();
            $nodesVisited++;



            if ($current === $endNode) {
                break;
            }

            if (isset($visited[$current])) {
                continue;
            }
            $visited[$current] = true;

            $neighbors = $this->graph->getAdjacent($current);
            foreach ($neighbors as $edge) {
                $to = $edge['to'];

                if (!$this->isEdgeAllowedForTransport($edge, $transportType)) {
                    continue;
                }

                // Abia apoi verifică blocajele
                if ($this->isEdgeBlocked($current, $to)) {
                    continue;
                }

                if ($transportType === 'walking') {
                    // Folosește funcția nouă pentru walking
                    $weight = $this->calculateWalkingDifficulty($current, $to, $edge);
                } elseif ($transportType === 'cycling') {
                    // Folosește funcția nouă pentru cycling
                    $weight = $this->calculateCyclingDifficulty($current, $to, $edge);
                } else {
                    // Pentru driving, folosește weight-ul din date
                    if ($weightField === 'balanced') {
                        // Rută ponderată: combină distanța + timpul + weight_safe (formula originală)
                        $distWeight = $edge['distance_km'];
                        $timeWeight = $edge['time_min'];

                        // Folosește weight_safe - formula TA originală din Python
                        // weight_safe = distance_km * (1 + risk_factor * 0.15)
                        $safeWeight = $edge['weight_safe'] ?? $edge['distance_km'];

                        // Normalizare (valori maxime estimate pentru o muchie)
                        $normDist = min($distWeight / 5, 1.0);       // max 5km
                        $normTime = min($timeWeight / 30, 1.0);     // max 30 minute
                        $normSafe = min($safeWeight / 10, 1.0);     // max 10 (aprox.)

                        // Ponderi egale între cele 3 criterii
                        $weight = 0.34 * $normDist + 0.33 * $normTime + 0.33 * $normSafe;
                        $weight = max(0.001, $weight);
                    } else {
                        $weight = $edge[$weightField] ?? $edge['distance_km'];
                    }

                    // ===== SIMULARE TRAFIC PENTRU ORE DE VÂRF =====
                    // aplică doar pentru mașină (driving)
                    if ($transportType === 'driving' && $weightField === 'time_min') {
                        $hour = (int)date('H');
                        $isRushHour = in_array($hour, [7, 8, 14, 15, 17, 18]);

                        if ($isRushHour) {
                            $highway = $edge['highway'] ?? 'secondary';
                            $mainRoads = ['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'motorway'];

                            if (in_array($highway, $mainRoads)) {
                                $weight = $weight * 2.5;
                            } else {
                                $weight = $weight * 1.5;
                            }
                        }
                    }
                }


                // PENALIZĂRI pentru mașină
                if ($transportType === 'driving' && $weightField === 'balanced') {
                    $highway = $edge['highway'] ?? '';

                    // Penalizare pentru bulevarde și drumuri principale (nesigure)
                    $unsafe_highways = ['primary', 'secondary', 'trunk', 'motorway'];
                    if (in_array($highway, $unsafe_highways)) {
                        $weight *= 1.5;  // un bulevard de 1 km devine = 1.5 km în cost
                    }

                    // Penalizare pentru tipuri complet nepotrivite (practic interzise)
                    $forbidden_highways = ['pedestrian', 'footway', 'steps', 'cycleway', 'bridleway'];
                    if (in_array($highway, $forbidden_highways)) {
                        $weight *= 100;
                    }

                    // Opțional: bonus pentru străzi rezidențiale (le face și mai atractive)
                    if ($highway === 'living_street' || $highway === 'residential') {
                        $weight *= 0.8;  // 1 km devine = 0.8 km în cost (BONUS!)
                    }
                }

                // PENALIZĂRI pentru bicicletă
                if ($transportType === 'cycling') {
                    $highway = $edge['highway'] ?? '';

                    // Penalizare pentru zone pietonale
                    if ($highway === 'pedestrian' || $highway === 'footway') {
                        $weight *= 4.0; // Evită zonele exclusiv pietonale
                    }

                    // Penalizare pentru scări (dacă au scăpat)
                    if ($highway === 'steps') {
                        continue; // Interzis total pentru bicicletă
                    }
                }

                // Verifică dacă weight e finit
                if ($weight === INF || $weight > 99999) {
                    continue;
                }

                $newDist = $dist[$current] + $weight;

                if (!isset($dist[$to]) || $newDist < $dist[$to]) {
                    $dist[$to] = $newDist;
                    $heuristic[$to] = $this->heuristic($to, $endCoords);
                    $prev[$to] = ['from' => $current, 'edge' => $edge];

                    $priority = $newDist + $heuristic[$to];
                    $pq->insert($to, -$priority);
                }
            }
        }

        $executionTime = microtime(true) - $startTime;
        $pathResult = $this->reconstructPath($prev, $startNode, $endNode, $dist[$endNode] ?? INF);

        if ($pathResult) {
            $pathResult['stats'] = [
                'execution_time_ms' => round($executionTime * 1000, 2),
                'nodes_visited' => $nodesVisited,
                'algorithm' => 'A*',
                'transport' => $transportType
            ];
        }


        if ($pathResult) {
            $this->logRouteAnalysis($pathResult, $startNode, $endNode, $transportType);
        }
        return $pathResult;
    }

    //Funcția euristică (distanța Haversine)

    private function heuristic($nodeId, $targetCoords)
    {
        $nodeCoords = $this->graph->getNodeCoords($nodeId);
        if (!$nodeCoords) return 0;

        return $this->graph->haversineDistance(
            $nodeCoords['lat'],
            $nodeCoords['lng'],
            $targetCoords['lat'],
            $targetCoords['lng']
        );
    }


    //Reconstruiește calea pentru A* standard

    private function reconstructPath($prev, $start, $end, $totalCost)
    {
        if ($totalCost === INF) {
            return null;
        }

        $path = [];
        $current = $end;

        while ($current !== $start) {
            if (!isset($prev[$current])) {
                return null;
            }
            $step = $prev[$current];
            array_unshift($path, [
                'from' => $step['from'],
                'to' => $current,
                'edge' => $step['edge']
            ]);
            $current = $step['from'];
        }

        return [
            'path' => $path,
            'total_cost' => $totalCost,
            'from' => $start,
            'to' => $end
        ];
    }

    //Convertește rezultatul căii în GeoJSON

    public function pathToGeoJson($pathResult)
    {
        if (!$pathResult) return null;

        $allCoordinates = [];
        $path = $pathResult['path'];
        $edges = $this->graph->getEdges();

        // Construiește un index pentru căutare rapidă a muchiilor
        $edgeIndex = [];
        foreach ($edges as $edge) {
            $key = $edge['from'] . '_' . $edge['to'];
            $edgeIndex[$key] = $edge;
            if (!isset($edge['oneway']) || !$edge['oneway']) {
                $keyRev = $edge['to'] . '_' . $edge['from'];
                $edgeIndex[$keyRev] = $edge;
            }
        }

        $firstSegment = true;

        foreach ($path as $segment) {
            $from = $segment['from'];
            $to = $segment['to'];

            $key = $from . '_' . $to;
            $foundEdge = $edgeIndex[$key] ?? null;

            if ($foundEdge && isset($foundEdge['geometry']) && !empty($foundEdge['geometry'])) {
                $coords = $foundEdge['geometry'];

                // Dacă muchia e inversată în index, inversează coordonatele
                if ($foundEdge['from'] != $from) {
                    $coords = array_reverse($coords);
                }

                // Pentru primul segment, adăugăm toate punctele
                if ($firstSegment) {
                    foreach ($coords as $coord) {
                        $allCoordinates[] = [$coord[1], $coord[0]];
                    }
                    $firstSegment = false;
                } else {
                    // Pentru următoarele segmente, sărim primul punct (care e deja adăugat)
                    for ($j = 1; $j < count($coords); $j++) {
                        $allCoordinates[] = [$coords[$j][1], $coords[$j][0]];
                    }
                }
            } else {
                // Fallback: linie dreaptă
                $fromCoords = $this->graph->getNodeCoords($from);
                $toCoords = $this->graph->getNodeCoords($to);

                if ($fromCoords && $toCoords) {
                    if ($firstSegment) {
                        $allCoordinates[] = [$fromCoords['lng'], $fromCoords['lat']];
                        $firstSegment = false;
                    }
                    $allCoordinates[] = [$toCoords['lng'], $toCoords['lat']];
                }
            }
        }

        // Elimină duplicatele consecutive
        $unique = [];
        $last = null;
        foreach ($allCoordinates as $coord) {
            if ($last === null || $coord[0] != $last[0] || $coord[1] != $last[1]) {
                $unique[] = $coord;
                $last = $coord;
            }
        }

        return [
            'type' => 'Feature',
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => $unique
            ],
            'properties' => [
                'total_cost' => $pathResult['total_cost']
            ]
        ];
    }

    private function calculateTimeWithTraffic($path)
    {
        $totalTime = 0;
        $hour = (int)date('H');
        $isRushHour = in_array($hour, [7, 8, 14, 15, 17, 18]);

        foreach ($path as $segment) {
            $baseTime = $segment['edge']['time_min'] ?? ($segment['edge']['distance_km'] * 2);

            if ($isRushHour) {
                $highway = $segment['edge']['highway'] ?? 'secondary';
                $mainRoads = ['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'motorway'];
                if (in_array($highway, $mainRoads)) {
                    $baseTime *= 2.5;
                } else {
                    $baseTime *= 1.5;
                }
            }
            $totalTime += $baseTime;
        }
        return $totalTime;
    }

    /**
     * Calculează scorul mediu de siguranță pentru o rută
     * @param array $path - array cu segmentele rutei (de la aStarWithStats)
     * @return float - scor între 1 și 10
     */
    private function calculateSafetyScore($path)
    {
        if (empty($path)) {
            return 5.0; // valoare implicită
        }

        $totalWeightedScore = 0;
        $totalDistance = 0;

        foreach ($path as $segment) {
            $distance = $segment['edge']['distance_km'];
            $safetyScore = $segment['edge']['safety_score'] ?? 5; // implicit 5 dacă lipsește

            $totalWeightedScore += $distance * $safetyScore;
            $totalDistance += $distance;
        }

        if ($totalDistance == 0) {
            return 5.0;
        }

        return round($totalWeightedScore / $totalDistance, 1);
    }
    //Rulează toate cele 3 rute pentru mașină (optimă, rapidă, sigură)

    // În funcția compareCarRoutes()
    public function compareCarRoutes($startNode, $endNode)
    {
        $results = [];
        $stats = [];

        // 1. Rută optimă (distanță)
        $optimalResult = $this->aStarWithStats($startNode, $endNode, 'distance_km', 'driving');
        if ($optimalResult) {
            $actualDistance = 0;
            foreach ($optimalResult['path'] as $segment) {
                $actualDistance += $segment['edge']['distance_km'];
            }
            $actualTime = $this->calculateTimeWithTraffic($optimalResult['path']);
            $safetyScore = $this->calculateSafetyScore($optimalResult['path']); // ← ADAUGAT

            $results['optimal'] = [
                'geojson' => $this->pathToGeoJson($optimalResult),
                'properties' => [
                    'total_distance' => $actualDistance,
                    'total_time' => $actualTime,
                    'total_cost_algorithm' => $optimalResult['total_cost'],
                    'safety_score' => $safetyScore, // ← ADAUGAT
                    'description' => 'Rută optimă (cea mai scurtă)'
                ]
            ];
            $stats['optimal'] = $optimalResult['stats'];
        }

        // 2. Rută rapidă (timp)
        $fastestResult = $this->aStarWithStats($startNode, $endNode, 'time_min', 'driving');
        if ($fastestResult) {
            $actualDistance = 0;
            foreach ($fastestResult['path'] as $segment) {
                $actualDistance += $segment['edge']['distance_km'];
            }
            $actualTime = $this->calculateTimeWithTraffic($fastestResult['path']);
            $safetyScore = $this->calculateSafetyScore($fastestResult['path']); // ← ADAUGAT

            $results['fastest'] = [
                'geojson' => $this->pathToGeoJson($fastestResult),
                'properties' => [
                    'total_distance' => $actualDistance,
                    'total_time' => $actualTime,
                    'total_cost_algorithm' => $fastestResult['total_cost'],
                    'safety_score' => $safetyScore, // ← ADAUGAT
                    'description' => 'Rută rapidă (cel mai puțin timp)'
                ]
            ];
            $stats['fastest'] = $fastestResult['stats'];
        }

        // 3. Rută ponderată (distanță + timp + siguranță)
        $balancedResult = $this->aStarWithStats($startNode, $endNode, 'balanced', 'driving');
        if ($balancedResult) {
            $actualDistance = 0;
            foreach ($balancedResult['path'] as $segment) {
                $actualDistance += $segment['edge']['distance_km'];
            }
            $actualTime = $this->calculateTimeWithTraffic($balancedResult['path']);
            $safetyScore = $this->calculateSafetyScore($balancedResult['path']); // ← ADAUGAT

            $results['balanced'] = [
                'geojson' => $this->pathToGeoJson($balancedResult),
                'properties' => [
                    'total_distance' => $actualDistance,
                    'total_time' => $actualTime,
                    'total_cost_algorithm' => $balancedResult['total_cost'],
                    'safety_score' => $safetyScore, // ← ADAUGAT
                    'description' => 'Rută ponderată (distanță + timp + siguranță)'
                ]
            ];
            $stats['balanced'] = $balancedResult['stats'];
        }

        return ['routes' => $results, 'stats' => $stats];
    }
    /**
     * Calculează factorul de pantă/șerpuire pentru un segment
     * Returnează un factor >= 1, unde 1 = drept și plat
     */
    private function calculateTerrainFactor($fromNode, $toNode, $roadDistance)
    {
        $fromCoords = $this->graph->getNodeCoords($fromNode);
        $toCoords = $this->graph->getNodeCoords($toNode);

        if (!$fromCoords || !$toCoords) {
            return 1.0;
        }

        // Distanța euclidiană (în linie dreaptă) în km
        $euclideanDistance = $this->graph->haversineDistance(
            $fromCoords['lat'],
            $fromCoords['lng'],
            $toCoords['lat'],
            $toCoords['lng']
        );

        if ($euclideanDistance == 0) {
            return 1.0;
        }

        // Factorul de șerpuire = drum real / linie dreaptă
        // Cu cât e mai mare, cu atât drumul e mai șerpuit
        $windingFactor = $roadDistance / $euclideanDistance;

        // Limităm factorul să nu fie absurd (max 3 = de 3x mai lung)
        $windingFactor = min($windingFactor, 3.0);

        return $windingFactor;
    }

    //Estimează dificultatea pentru pietoni/bicicliști bazat pe geometrie

    private function calculateWalkingDifficulty($fromNode, $toNode, $edge)
    {
        $roadDistance = $edge['distance_km'];

        // DEBUG - vezi ce muchii sunt folosite
        $highway = $edge['highway'] ?? 'unknown';
        if (is_array($highway)) {
            $highway = implode(',', $highway);
        }

        // Dacă sunt scări, loghează-le
        if (strpos($highway, 'steps') !== false) {
            $fromCoords = $this->graph->getNodeCoords($fromNode);
            $toCoords = $this->graph->getNodeCoords($toNode);
            error_log(" SCĂRI detectate: de la $fromNode la $toNode, distanță=$roadDistance km");
            error_log(" Coordonate: [{$fromCoords['lat']},{$fromCoords['lng']}] -> [{$toCoords['lat']},{$toCoords['lng']}]");
        }

        // Factor de șerpuire - drumurile șerpuite sunt mai grele
        $windingFactor = $this->calculateTerrainFactor($fromNode, $toNode, $roadDistance);

        // Tipul drumului (din date)
        $highway = $edge['highway'] ?? 'unknown';
        if (is_array($highway)) {
            $highway = $highway[0] ?? 'unknown';
        }

        // Factor pentru tipul drumului
        $highwayFactor = 1.0;
        switch ($highway) {
            case 'steps':
                $highwayFactor = 3.0; // Scări - foarte greu
                break;
            case 'footway':
            case 'pedestrian':
                $highwayFactor = 1.2; // Trotuare/zone pietonale - ușor mai greu decât strada
                break;
            case 'path':
            case 'track':
                $highwayFactor = 1.5; // Poteci - mai greu
                break;
            case 'residential':
            case 'living_street':
                $highwayFactor = 1.0; // Străzi liniștite - normal
                break;
            default:
                $highwayFactor = 1.1; // Altele
        }

        // Cost final = distanță * (șerpuire^1.5) * factor_drum
        // șerpuire la putere 1.5 ca să penalizăm mai mult drumurile întortocheate
        return $roadDistance * pow($windingFactor, 1.5) * $highwayFactor;
    }

    //Estimează dificultatea pentru bicicliști

    private function calculateCyclingDifficulty($fromNode, $toNode, $edge)
    {
        $roadDistance = $edge['distance_km'];

        // Pentru bicicletă, șerpuirea e și mai importantă
        $windingFactor = $this->calculateTerrainFactor($fromNode, $toNode, $roadDistance);

        $highway = $edge['highway'] ?? 'unknown';
        if (is_array($highway)) {
            $highway = $highway[0] ?? 'unknown';
        }

        $highwayFactor = 1.0;
        switch ($highway) {
            case 'steps':
                return 999999; // Interzis pentru bicicletă
            case 'footway':
            case 'pedestrian':
                $highwayFactor = 2.0; // Zone pietonale - de evitat
                break;
            case 'cycleway':
                $highwayFactor = 0.8; // Piste - bonus
                break;
            case 'residential':
            case 'living_street':
                $highwayFactor = 1.0; // Străzi liniștite - ideal
                break;
            case 'path':
            case 'track':
                $highwayFactor = 1.3; // Poteci - OK
                break;
            default:
                $highwayFactor = 1.2;
        }

        // Pentru bicicletă, șerpuirea e mai importantă (putere 2)
        return $roadDistance * pow($windingFactor, 2.0) * $highwayFactor;
    }
}

if (php_sapi_name() !== 'cli' && !defined('TESTING_MODE')) {
    // ===== API ENDPOINTS =====
    $action = $_GET['action'] ?? '';

    try {
        $graph = RoutingGraph::getInstance();
        $finder = new PathFinder($graph);

        switch ($action) {
            case 'stats':
                sendJSON([
                    'success' => true,
                    'stats' => $graph->getStats()
                ]);
                break;

            case 'route':
                $input = file_get_contents('php://input');
                $data = json_decode($input, true);

                if (!$data) {
                    sendJSON(['success' => false, 'message' => 'Date invalide']);
                }

                $startLat = $data['start']['lat'] ?? null;
                $startLng = $data['start']['lng'] ?? null;
                $endLat = $data['end']['lat'] ?? null;
                $endLng = $data['end']['lng'] ?? null;
                $transport = $data['transport'] ?? 'driving';
                $useCustomGraph = $data['use_custom_graph'] ?? null;

                if (!$startLat || !$startLng || !$endLat || !$endLng) {
                    sendJSON(['success' => false, 'message' => 'Coordonate lipsă']);
                }

                // === DECIZIE: Folosim A* (graf propriu) sau OSRM? ===
                $boundary = BrasovCityBoundary::getInstance();

                // Dacă frontend-ul nu specifică, decidem automat
                if ($useCustomGraph === null) {
                    $startInCity = $boundary->isPointInCity($startLat, $startLng);
                    $endInCity = $boundary->isPointInCity($endLat, $endLng);

                    // Folosim A* doar dacă AMBELE puncte sunt în oraș
                    $useCustomGraph = $startInCity && $endInCity;
                }

                error_log("🚦 Decizie rutare: " . ($useCustomGraph ? 'A* (urban)' : 'OSRM (județean)'));

                if ($useCustomGraph) {
                    // === RUTARE CU GRAFUL TĂU (A*) ===
                    $startNode = $graph->findNearestNode($startLat, $startLng, 3.0, $transport);
                    $endNode = $graph->findNearestNode($endLat, $endLng, 3.0, $transport);

                    if (!$startNode || !$endNode) {
                        $startNode = $graph->findNearestNode($startLat, $startLng, 5.0);
                        $endNode = $graph->findNearestNode($endLat, $endLng, 5.0);
                    }

                    if (!$startNode || !$endNode) {
                        sendJSON(['success' => false, 'message' => 'Nu s-au putut găsi puncte de plecare/sosire în graf']);
                    }

                    // Pentru mașină, returnăm toate cele 3 rute
                    if ($transport === 'driving') {
                        $result = $finder->compareCarRoutes($startNode, $endNode);
                        $result['success'] = true;
                        $result['routing_source'] = 'astar';
                        sendJSON($result);
                    }
                    // Pentru mers pe jos și bicicletă
                    else {
                        $weightField = match ($transport) {
                            'walking' => 'walking_cost',
                            'cycling' => 'cycling_cost',
                            default => 'distance_km'
                        };

                        $pathResult = $finder->aStarWithStats($startNode, $endNode, $weightField, $transport);

                        if ($pathResult) {
                            // Calculează distanța și timpul real
                            $actualDistance = 0;
                            $actualTime = 0;
                            foreach ($pathResult['path'] as $segment) {
                                $actualDistance += $segment['edge']['distance_km'];

                                if ($transport === 'walking') {
                                    $actualTime += $segment['edge']['distance_km'] * 12;
                                } else if ($transport === 'cycling') {
                                    $actualTime += $segment['edge']['distance_km'] * 4;
                                } else {
                                    $actualTime += $segment['edge']['time_min'] ?? ($segment['edge']['distance_km'] * 2);
                                }
                            }

                            sendJSON([
                                'success' => true,
                                'geojson' => $finder->pathToGeoJson($pathResult),
                                'total_distance' => $actualDistance,
                                'total_time' => $actualTime,
                                'total_cost' => $pathResult['total_cost'],
                                'stats' => $pathResult['stats'],
                                'routing_source' => 'astar'
                            ]);
                        } else {
                            sendJSON(['success' => false, 'message' => 'Nu s-a găsit nicio rută în oraș']);
                        }
                    }
                } else {
                    // === RUTARE CU OSRM (JUDET) ===
                    $osrm = new OSRMClient(); // Folosește serverul public

                    // Mapează tipul de transport pentru OSRM
                    $osrmProfile = match ($transport) {
                        'walking' => 'foot',
                        'cycling' => 'bike',
                        default => 'driving'
                    };

                    $osrmData = $osrm->getRoute($startLat, $startLng, $endLat, $endLng, $osrmProfile);

                    if ($osrmData) {
                        $result = $osrm->formatResponse($osrmData, $transport);
                        $result['routing_source'] = 'osrm';

                        // Pentru walking/cycling, OSRM returnează o singură rută
                        // O punem în același format ca și pentru driving
                        if ($transport !== 'driving') {
                            $result['geojson'] = $result['routes']['optimal']['geojson'];
                            $result['total_distance'] = $result['routes']['optimal']['properties']['total_distance'];
                            $result['total_time'] = $result['routes']['optimal']['properties']['total_time'];
                        }

                        sendJSON($result);
                    } else {
                        sendJSON(['success' => false, 'message' => 'Nu s-a putut calcula ruta județeană']);
                    }
                }
                break;
            case 'test_boundary':
                $input = file_get_contents('php://input');
                $data = json_decode($input, true);

                $lat = $data['lat'] ?? null;
                $lng = $data['lng'] ?? null;

                if (!$lat || !$lng) {
                    sendJSON(['success' => false, 'message' => 'Coordonate lipsă']);
                }

                $boundary = BrasovCityBoundary::getInstance();
                $inCity = $boundary->isPointInCity($lat, $lng);

                sendJSON([
                    'success' => true,
                    'in_city' => $inCity,
                    'lat' => $lat,
                    'lng' => $lng,
                    'bbox' => $boundary->getBBox()
                ]);
                break;

            case 'toggle_block':
                $data = json_decode(file_get_contents('php://input'), true);
                $blockId = $data['block_id'] ?? '';
                $active = $data['active'] ?? false;

                $blockFile = __DIR__ . '/blocked_roads.json';

                if (!file_exists($blockFile)) {
                    sendJSON(['success' => false, 'message' => 'Fișierul nu există']);
                    break;
                }

                $json = file_get_contents($blockFile);
                $blocks = json_decode($json, true);

                if (!$blocks || !isset($blocks['blocked_edges'])) {
                    sendJSON(['success' => false, 'message' => 'Format invalid']);
                    break;
                }

                $found = false;
                foreach ($blocks['blocked_edges'] as &$block) {
                    if ($block['id'] == $blockId) {
                        $block['active'] = $active;
                        $found = true;
                        break;
                    }
                }

                if (!$found) {
                    sendJSON(['success' => false, 'message' => 'Blocaj negăsit']);
                    break;
                }

                file_put_contents($blockFile, json_encode($blocks, JSON_PRETTY_PRINT));
                sendJSON(['success' => true]);
                break;

            default:
                sendJSON(['success' => false, 'message' => 'Acțiune invalidă: ' . $action]);
        }
    } catch (Exception $e) {
        error_log("Routing API error: " . $e->getMessage());
        sendJSON(['success' => false, 'message' => 'Eroare server: ' . $e->getMessage()]);
    }
}
