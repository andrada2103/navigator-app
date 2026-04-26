<?php
require_once __DIR__ . '/init.php';

//validare email
function validateEmail($email)
{
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

//sanitizeaza - prevenire XSS
function sanitizeInput($data)
{
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

//validare parola
function validatePassword($password)
{
    //minim 8 caractere
    return strlen($password) >= 8 &&
        preg_match('/[A-Za-z]/', $password) &&
        preg_match('/[0-9]/', $password);
}

if (php_sapi_name() !== 'cli' && !defined('TESTING_MODE')) {
    //obtine datele din input, JSON sau POST
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    //daca nu gaseste actiunea in body, cauta in GET
    if (empty($input['action']) && isset($_GET['action'])) {
        $input['action'] = $_GET['action'];
    }

    $action = $input['action'] ?? '';

    //resgister - utilizator nou
    if ($action === 'register') {
        checkRateLimit('register', 3, 10);
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        $name = $input['name'] ?? '';

        error_log("Register attempt for: " . $email);

        //validare email
        if (!validateEmail($email)) {
            echo json_encode(['success' => false, 'message' => 'Email invalid']);
            exit;
        }

        //validare parola
        if (!validatePassword($password)) {
            echo json_encode(['success' => false, 'message' => 'Parola trebuie să aibă minim 8 caractere, o literă și o cifră']);
            exit;
        }

        //sanitizare nume
        $name = sanitizeInput($name);

        if (empty($email) || empty($password)) {
            echo json_encode(['success' => false, 'message' => 'Email și parolă sunt obligatorii']);
            exit;
        }

        //verifica daca email-ul exista deja
        try {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);

            if ($stmt->fetch()) {
                echo json_encode(['success' => false, 'message' => 'Emailul există deja']);
                exit;
            }

            //hash parola
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

            //insereaza utilizatorul
            $stmt = $pdo->prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
            if ($stmt->execute([$email, $hashedPassword, $name])) {
                echo json_encode(['success' => true, 'message' => 'Înregistrare reușită']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Înregistrare eșuată']);
            }
        } catch (Exception $e) {
            error_log("Register error: " . $e->getMessage());
            echo json_encode(['success' => false, 'message' => 'Eroare la înregistrare']);
        }
        //login - utilizator vechi
    } elseif ($action === 'login') {
        checkRateLimit('login', 5, 1);
        $email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
        $password = $input['password'] ?? '';

        error_log("Login attempt for: " . ($email ?: 'invalid'));

        if (!$email) {
            echo json_encode(['success' => false, 'message' => 'Email invalid']);
            exit;
        }

        if (empty($password)) {
            echo json_encode(['success' => false, 'message' => 'Parola este obligatorie']);
            exit;
        }

        if (empty($email) || empty($password)) {
            echo json_encode(['success' => false, 'message' => 'Email și parolă sunt obligatorii']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT id, email, password, name FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && password_verify($password, $user['password'])) {
                //salveaza in sesiune
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['user_email'] = $user['email'];
                $_SESSION['user_name'] = $user['name'];

                error_log("Login successful for user ID: " . $user['id']);

                echo json_encode([
                    'success' => true,
                    'message' => 'Autentificare reușită',
                    'user' => [
                        'id' => $user['id'],
                        'email' => $user['email'],
                        'name' => $user['name']
                    ]
                ]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Email sau parolă incorectă']);
            }
        } catch (Exception $e) {
            error_log("Login error: " . $e->getMessage()); //doar in log
            echo json_encode(['success' => false, 'message' => 'Eroare la autentificare']);
        }
        //logout - deconectare
    } elseif ($action === 'logout') {
        checkRateLimit('logout', 10, 1);
        //sterge sesiunea
        $_SESSION = array();
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params["path"],
                $params["domain"],
                $params["secure"],
                $params["httponly"]
            );
        }
        session_destroy();

        echo json_encode(['success' => true, 'message' => 'Deconectare reușită']);
        //verifica daca utilizatorul este autentificat
    } elseif ($action === 'check_session') {
        if (isset($_SESSION['user_id'])) {
            echo json_encode([
                'success' => true,
                'logged_in' => true,
                'user' => [
                    'id' => $_SESSION['user_id'],
                    'email' => $_SESSION['user_email'],
                    'name' => $_SESSION['user_name']
                ]
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'logged_in' => false
            ]);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Acțiune invalidă: ' . $action]);
    }
}
