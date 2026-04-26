<?php
// backend/OSRMClient.php

class OSRMClient
{
    private $baseUrl;

    /**
     * @param string $baseUrl - URL-ul serverului OSRM (public sau local)
     */
    public function __construct($baseUrl = 'http://router.project-osrm.org')
    {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /**
     * Calculează o rută între două puncte
     */
    public function getRoute($startLat, $startLng, $endLat, $endLng, $profile = 'driving')
    {
        $url = $this->baseUrl . "/route/v1/{$profile}/" .
            "{$startLng},{$startLat};{$endLng},{$endLat}" .
            "?overview=full&geometries=geojson&steps=true&annotations=true";

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Navigator-App/1.0');

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_error($ch)) {
            error_log("OSRM cURL error: " . curl_error($ch));
            curl_close($ch);
            return null;
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            error_log("OSRM HTTP error: $httpCode");
            return null;
        }

        return json_decode($response, true);
    }

    /**
     * Formatează răspunsul OSRM în același format ca al tău
     */
    public function formatResponse($osrmData, $profile = 'driving')
    {
        if (!$osrmData || !isset($osrmData['routes'][0])) {
            return null;
        }

        $route = $osrmData['routes'][0];

        // Profile descriptions
        $profiles = [
            'driving' => 'Rută județeană (mașină)',
            'walking' => 'Rută județeană (pietonal)',
            'cycling' => 'Rută județeană (bicicletă)'
        ];

        // Distanța în km, durata în minute
        $distance = $route['distance'] / 1000;
        $duration = $route['duration'] / 60;

        return [
            'success' => true,
            'routes' => [
                'optimal' => [
                    'geojson' => $route['geometry'],
                    'properties' => [
                        'total_distance' => $distance,
                        'total_time' => $duration,
                        'description' => $profiles[$profile] ?? 'Rută județeană',
                        'source' => 'osrm'
                    ]
                ]
            ],
            'stats' => [
                'source' => 'osrm',
                'execution_time_ms' => 0,
                'nodes_visited' => 0,
                'algorithm' => 'OSRM (Contraction Hierarchies)'
            ]
        ];
    }
}
