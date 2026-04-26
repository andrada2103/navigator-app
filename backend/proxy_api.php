<?php
// backend/proxy_api.php
require_once 'cors_config.php';
require_once './config.php';

session_start();

$action = $_GET['action'] ?? '';

// === FUNCȚIE PENTRU REQUEST-URI EXTERNE ===
function proxyRequest($url, $contentType = 'application/json')
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $isLocalhost = ($_SERVER['SERVER_NAME'] === 'localhost' || $_SERVER['SERVER_NAME'] === '127.0.0.1');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, !$isLocalhost);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10); // Timeout după 10 secunde
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Navigator-App/1.0');

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if (curl_error($ch)) {
        error_log("Proxy cURL error: " . curl_error($ch));
        curl_close($ch);
        http_response_code(500);
        return json_encode(['error' => 'Eroare de conexiune']);
    }

    curl_close($ch);

    if ($httpCode !== 200) {
        error_log("Proxy API error: HTTP $httpCode for URL: $url");
        http_response_code($httpCode);
        return json_encode(['error' => 'Eroare la API-ul extern']);
    }

    header("Content-Type: $contentType");
    return $response;
}

// === RUTELE PROXY ===
switch ($action) {
    // 1. Căutare adrese (geocoding)
    case 'geocode':
        $query = $_GET['query'] ?? '';
        if (empty($query)) {
            http_response_code(400);
            echo json_encode(['error' => 'Query lipsă']);
            exit;
        }

        $apiKey = Config::get('GEOAPIFY_API_KEY');
        if (!$apiKey) {
            error_log("GEOAPIFY_API_KEY lipsă în .env");
            http_response_code(500);
            echo json_encode(['error' => 'Configurare server invalidă']);
            exit;
        }

        $url = "https://api.geoapify.com/v1/geocode/search?text=" . urlencode($query) .
            "&lang=ro&limit=8&apiKey=" . $apiKey;

        echo proxyRequest($url);
        break;

    // 2. Reverse geocoding (coordonate -> adresă)
    case 'reverse_geocode':
        $lat = $_GET['lat'] ?? '';
        $lon = $_GET['lon'] ?? '';

        if (empty($lat) || empty($lon) || !is_numeric($lat) || !is_numeric($lon)) {
            http_response_code(400);
            echo json_encode(['error' => 'Coordonate invalide']);
            exit;
        }

        $apiKey = Config::get('GEOAPIFY_API_KEY');
        if (!$apiKey) {
            error_log("GEOAPIFY_API_KEY lipsă în .env");
            http_response_code(500);
            echo json_encode(['error' => 'Configurare server invalidă']);
            exit;
        }

        $url = "https://api.geoapify.com/v1/geocode/reverse?lat={$lat}&lon={$lon}&lang=ro&apiKey=" . $apiKey;

        echo proxyRequest($url);
        break;

    // 3. Căutare orașe (pentru vreme)
    case 'search_cities':
        $query = $_GET['query'] ?? '';
        if (empty($query)) {
            http_response_code(400);
            echo json_encode(['error' => 'Query lipsă']);
            exit;
        }

        $apiKey = Config::get('GEOAPIFY_API_KEY');
        if (!$apiKey) {
            error_log("GEOAPIFY_API_KEY lipsă în .env");
            http_response_code(500);
            echo json_encode(['error' => 'Configurare server invalidă']);
            exit;
        }

        $url = "https://api.geoapify.com/v1/geocode/search?text=" . urlencode($query) .
            "&type=city&lang=ro&limit=5&apiKey=" . $apiKey;

        echo proxyRequest($url);
        break;

    // 4. Trafic TomTom (imagine)
    case 'tomtom_traffic':
        $z = $_GET['z'] ?? '';
        $x = $_GET['x'] ?? '';
        $y = $_GET['y'] ?? '';

        if (empty($z) || empty($x) || empty($y)) {
            http_response_code(400);
            exit;
        }

        $apiKey = Config::get('TOMTOM_API_KEY');
        if (!$apiKey) {
            error_log("TOMTOM_API_KEY lipsă în .env");
            // Returnează o imagine transparentă în loc de eroare
            $im = imagecreatetruecolor(256, 256);
            imagesavealpha($im, true);
            $transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
            imagefill($im, 0, 0, $transparent);
            header('Content-Type: image/png');
            imagepng($im);
            imagedestroy($im);
            exit;
        }

        $url = "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{$z}/{$x}/{$y}.png?key=" . $apiKey;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $isLocalhost = ($_SERVER['SERVER_NAME'] === 'localhost' || $_SERVER['SERVER_NAME'] === '127.0.0.1');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, !$isLocalhost);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $image = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            header('Content-Type: image/png');
            echo $image;
        } else {
            // Imagine transparentă la eroare
            $im = imagecreatetruecolor(256, 256);
            imagesavealpha($im, true);
            $transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
            imagefill($im, 0, 0, $transparent);
            header('Content-Type: image/png');
            imagepng($im);
            imagedestroy($im);
        }
        break;

    // Acțiune invalidă
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acțiune invalidă']);
}
