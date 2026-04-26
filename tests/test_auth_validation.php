<?php
// backend/tests/test_auth_validation.php
define('TESTING_MODE', true);
require_once __DIR__ . '/../../auth.php';

echo "Test autentificare\n\n";

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

// Test 1.1: Testează direct filter_var (nu prin funcția wrapper)
$emailValid = filter_var("ana@example.com", FILTER_VALIDATE_EMAIL);
runTest("filter_var() - email valid", $emailValid !== false);

// Test 1.2: Validare email invalid (lipsă @)
runTest("validateEmail() - email invalid fără @", validateEmail("ana.example.com") === false);

// Test 1.3: Validare email invalid (caractere speciale)
runTest("validateEmail() - email invalid caractere", validateEmail("ana@ex@ample.com") === false);

// Test 1.4: Parolă validă (minim 8 caractere, literă și cifră)
runTest("validatePassword() - parolă validă", validatePassword("parola123") === true);

// Test 1.5: Parolă prea scurtă
runTest("validatePassword() - parolă scurtă", validatePassword("123") === false);

// Test 1.6: Parolă fără cifră
runTest("validatePassword() - parolă fără cifră", validatePassword("parolafara") === false);

// Test 1.7: Parolă fără literă
runTest("validatePassword() - parolă fără literă", validatePassword("12345678") === false);

// Test 1.8: Sanitizare XSS - verifica securitatea
$sanitized = sanitizeInput("<script>alert('xss')</script>");
$noAngleBrackets = strpos($sanitized, '<') === false && strpos($sanitized, '>') === false;
$contentPreserved = strpos($sanitized, 'alert') !== false && strpos($sanitized, 'xss') !== false;

runTest("sanitizeInput() - elimină caracterele < și >", $noAngleBrackets);
runTest("sanitizeInput() - păstrează conținutul inofensiv", $contentPreserved);

// Test 1.9: Sanitizare - păstrează text normal
runTest(
    "sanitizeInput() - păstrează text normal",
    sanitizeInput("Text normal") === "Text normal"
);

// Test 1.10: Sanitizare - transformă caractere speciale
runTest(
    "sanitizeInput() - transformă & < > în entități",
    sanitizeInput("a & b < c > d") === "a &amp; b &lt; c &gt; d"
);
echo "Trecute: $passed\n";
echo "Eșuate: $failed\n";
echo "Total: " . ($passed + $failed) . "\n";
