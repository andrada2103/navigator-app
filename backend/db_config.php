<?php

//configuratia conexiunii la baza de date
//foloseste clasa Database cu implementare singleton pentru gestionarea conexiunii PDO
require_once __DIR__ . '/backend/cors_config.php';
require_once __DIR__ . '/backend/core/Database.php';

//verifica daca Database exista
if (!class_exists('Database')) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => 'Eroare de configurare: clasa Database nu a fost găsită'
    ]);
    exit;
}

try {
    //obtine instanta unica a conexiunii PDO
    $pdo = Database::getInstance()->getConnection();

    //seteaza explicit encoding-ul UTF-8 pt conexiune
    $pdo->exec("SET NAMES utf8mb4");
    $pdo->exec("SET CHARACTER SET utf8mb4");
} catch (Exception $e) {
    //logheaza eroarea pe server
    error_log("Database connection error: " . $e->getMessage());

    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => 'Eroare de conexiune la baza de date'
    ]);
    exit;
}
