<?php
define('TESTING_MODE', true);
header('Content-Type: text/plain');
echo "Test validare coordonate\n\n";

function validateCoordinates($lat, $lng)
{
    return is_numeric($lat) && is_numeric($lng) &&
        $lat >= -90 && $lat <= 90 &&
        $lng >= -180 && $lng <= 180;
}

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

runTest("Coordonate valide - Brașov", validateCoordinates(45.65, 25.60) === true);
runTest("Latitudine prea mare (>90)", validateCoordinates(100, 25.60) === false);
runTest("Latitudine prea mică (<-90)", validateCoordinates(-100, 25.60) === false);
runTest("Longitudine prea mare (>180)", validateCoordinates(45.65, 200) === false);
runTest("Longitudine prea mică (<-180)", validateCoordinates(45.65, -200) === false);
runTest("Latitudine string invalid", validateCoordinates("abc", 25.60) === false);
runTest("Longitudine string invalid", validateCoordinates(45.65, "abc") === false);
runTest("Null values", validateCoordinates(null, null) === false);

echo "Trecute: $passed\n";
echo "Eșuate: $failed\n";
