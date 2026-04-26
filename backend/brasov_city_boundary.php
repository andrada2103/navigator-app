<?php
// backend/brasov_city_boundary.php

class BrasovCityBoundary
{
    private static $instance = null;
    private $cityPolygon = null;
    private $bbox = null;

    private function __construct()
    {
        $this->loadBoundary();
    }

    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function loadBoundary()
    {
        $geojsonFile = __DIR__ . '/brasov.geojson';

        if (!file_exists($geojsonFile)) {
            error_log(" Nu s-a găsit fișierul brasov.geojson");
            // Fallback la bbox aproximativ
            $this->bbox = [
                'min_lat' => 45.58,
                'max_lat' => 45.68,
                'min_lng' => 25.53,
                'max_lng' => 25.66
            ];
            return;
        }

        $geojson = json_decode(file_get_contents($geojsonFile), true);

        // Extrage primul poligon (presupunem că e granița Brașovului)
        if (isset($geojson['features'][0]['geometry']['coordinates'][0])) {
            $this->cityPolygon = $geojson['features'][0]['geometry']['coordinates'][0];

            // Calculează bbox-ul din poligon
            $lats = [];
            $lngs = [];
            foreach ($this->cityPolygon as $point) {
                $lngs[] = $point[0];
                $lats[] = $point[1];
            }

            $this->bbox = [
                'min_lat' => min($lats),
                'max_lat' => max($lats),
                'min_lng' => min($lngs),
                'max_lng' => max($lngs)
            ];

            error_log("Graniță Brașov încărcată: " . count($this->cityPolygon) . " puncte");
            error_log("   BBox: lat [{$this->bbox['min_lat']} - {$this->bbox['max_lat']}], " .
                "lng [{$this->bbox['min_lng']} - {$this->bbox['max_lng']}]");
        }
    }

    /**
     * Verifică dacă un punct e în interiorul poligonului Brașovului
     * Folosește algoritmul ray-casting pentru precizie maximă
     */
    public function isPointInCity($lat, $lng)
    {
        // Verificare rapidă cu bbox
        if (!$this->isPointInBBox($lat, $lng)) {
            return false;
        }

        // Dacă nu avem poligon, returnăm true doar dacă e în bbox
        if (!$this->cityPolygon) {
            return true;
        }

        // Algoritmul ray-casting pentru poligon
        return $this->pointInPolygon($lng, $lat, $this->cityPolygon);
    }

    /**
     * Verifică dacă punctul e în bounding box (optimizare)
     */
    private function isPointInBBox($lat, $lng)
    {
        return $lat >= $this->bbox['min_lat'] &&
            $lat <= $this->bbox['max_lat'] &&
            $lng >= $this->bbox['min_lng'] &&
            $lng <= $this->bbox['max_lng'];
    }

    /**
     * Algoritmul ray-casting pentru a verifica dacă un punct e într-un poligon
     * @param float $x - longitudine
     * @param float $y - latitudine
     * @param array $poly - poligonul ca array de puncte [lng, lat]
     */
    private function pointInPolygon($x, $y, $poly)
    {
        $inside = false;
        $n = count($poly);

        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            $xi = $poly[$i][0];
            $yi = $poly[$i][1];
            $xj = $poly[$j][0];
            $yj = $poly[$j][1];

            $intersect = (($yi > $y) != ($yj > $y)) &&
                ($x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi);
            if ($intersect) {
                $inside = !$inside;
            }
        }

        return $inside;
    }

    /**
     * Obține centrul orașului (pentru fallback)
     */
    public function getCityCenter()
    {
        return [
            'lat' => ($this->bbox['min_lat'] + $this->bbox['max_lat']) / 2,
            'lng' => ($this->bbox['min_lng'] + $this->bbox['max_lng']) / 2
        ];
    }

    /**
     * Obține bbox-ul orașului
     */
    public function getBBox()
    {
        return $this->bbox;
    }
}
