<?php

/**
 * Configurare CORS unificată pentru toate API-urile
 */

// Definește originile permise
$allowedOrigins = [
    'http://localhost',
    'http://localhost:80',
    'http://localhost:3307',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'http://127.0.0.1:3307',
    'http://192.168.1.131',
    'http://192.168.1.131:80',
    'https://oversoftly-hydraulic-reginald.ngrok-free.dev'
];

// Setează CORS headers
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

// Headere generale
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 3600'); // Cache preflight pentru 1 oră

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

//log pentru debugging
if (isset($_SERVER['HTTP_ORIGIN'])) {
    error_log("CORS: Request from " . $_SERVER['HTTP_ORIGIN'] . " to " . $_SERVER['REQUEST_URI']);
}
