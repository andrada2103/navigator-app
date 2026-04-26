<?php

//setari erori
ini_set('display_errors', 0);
error_reporting(E_ALL);

//setarea parametrii cookie-ului de sesiune
session_set_cookie_params([
    'lifetime' => 0,                 //pana la închiderea browserului
    'path' => '/',                    //tot domeniul
    'domain' => '',                    //host curent
    'secure' => false,                 //pe localhost e false (pe HTTPS ar fi true)
    'httponly' => true,                 //blochează accesul din JS
    'samesite' => 'Strict'              //protecție CSRF
]);

session_start();

require_once __DIR__ . '/backend/cors_config.php';
require_once __DIR__ . '/db_config.php';

//verifica conexiunea la baza de date
if (!isset($pdo)) {
    error_log("Database connection failed");
    echo json_encode(['success' => false, 'message' => 'Eroare de conexiune la baza de date']);
    exit;
}

//rate limiting
function checkRateLimit($actionType, $limit, $minutes = 1)
{
    $ip = $_SERVER['REMOTE_ADDR']; // IP-ul utilizatorului
    $key = 'rate_limit_' . $actionType . '_' . $ip;

    // Inițializăm sau citim datele existente
    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = [
            'count' => 0,
            'first_request' => time()
        ];
    }

    $data = $_SESSION[$key];
    $elapsed = time() - $data['first_request'];
    $windowSeconds = $minutes * 60; // convertim minute în secunde

    // Dacă a trecut fereastra de timp, resetăm
    if ($elapsed > $windowSeconds) {
        $data['count'] = 0;
        $data['first_request'] = time();
    }

    // Creștem contorul
    $data['count']++;

    // Verificăm limita
    if ($data['count'] > $limit) {
        http_response_code(429); // Too Many Requests
        echo json_encode(['success' => false, 'message' => 'Prea multe încercări. Încearcă din nou peste ' . $minutes . ' minut(e).']);
        exit;
    }

    $_SESSION[$key] = $data; // salvăm înapoi
}
