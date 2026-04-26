<?php
// backend/core/Database.php

class Database
{
    private static $instance = null;
    private $pdo = null;
    private $config = [];

    // Constructor privat - nu poate fi apelat din exterior
    private function __construct()
    {
        // Încarcă configurația
        $this->config = require __DIR__ . '/../config/database.php';
        $this->connect();
    }

    // Interzicem clonarea
    private function __clone() {}

    // Interzicem deserializarea
    public function __wakeup() {}

    // Conectare la baza de date
    private function connect()
    {
        try {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $this->config['host'],
                $this->config['dbname'],
                $this->config['charset']
            );

            $this->pdo = new PDO(
                $dsn,
                $this->config['username'],
                $this->config['password']
            );

            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("Database connection failed: " . $e->getMessage());
            throw new Exception('Eroare de conexiune la baza de date');
        }
    }

    // Obține instanța unică
    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    // Obține conexiunea PDO
    public function getConnection()
    {
        // Verifică dacă conexiunea e încă activă
        try {
            $this->pdo->query('SELECT 1');
        } catch (PDOException $e) {
            // Reconectare dacă s-a pierdut conexiunea
            $this->connect();
        }

        return $this->pdo;
    }

    // Pentru debugging - statistici
    public function getStats()
    {
        return [
            'connected' => ($this->pdo !== null),
            'config' => [
                'host' => $this->config['host'],
                'database' => $this->config['dbname'],
                'charset' => $this->config['charset']
            ]
        ];
    }
}
