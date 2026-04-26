<?php
// backend/config.php
class Config
{
    private static $config = [];
    private static $loaded = false;

    public static function load()
    {
        if (self::$loaded) return;

        $envFile = __DIR__ . '/.env';
        if (!file_exists($envFile)) {
            error_log("ERROR: .env file not found in " . __DIR__);
            self::$loaded = true;
            return;
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            // Ignoră comentariile
            if (strpos(trim($line), '#') === 0) continue;

            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                self::$config[trim($key)] = trim($value);
            }
        }

        self::$loaded = true;
    }

    public static function get($key, $default = null)
    {
        self::load();
        return self::$config[$key] ?? $default;
    }
}
