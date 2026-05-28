<?php
// ============================================================
// config.php - Configurazione e connessione al database
// ============================================================

// Impedisce l'accesso diretto a questo file dal browser
if (basename($_SERVER['PHP_SELF']) === 'config.php') {
    http_response_code(403);
    die('Accesso negato.');
}

// Richiesta file .env
$lines = file(__DIR__ . '/.env');

foreach ($lines as $line) {
    if (trim($line) === '' || str_starts_with(trim($line), '#')) {
        continue;
    }

    list($name, $value) = explode('=', $line, 2);
    $_ENV[trim($name)] = trim($value);
}
// Uso .env: echo $_ENV['API_KEY'];

// Configurazione del database
define('DB_HOST', $_ENV['DB_HOST']);
define('DB_USER', $_ENV['DB_USER']);
define('DB_PASS', $_ENV['DB_PASS']);
define('DB_NAME', $_ENV['DB_NAME']);

define('SESSION_LIFETIME', 3600); // Durata sessione: 1 ora poi logout automatico

// Credenziali OAuth2 di Google
define('GOOGLE_CLIENT_ID', $_ENV['GOOGLE_CLIENT_ID']);
define('GOOGLE_CLIENT_SECRET', $_ENV['GOOGLE_CLIENT_SECRET']);
define('GOOGLE_REDIRECT_URI',  $_ENV['GOOGLE_REDIRECT_URI']);

// Connessione al database
function getDB(): mysqli {
    static $conn = null;

    if ($conn === null) {
        // mysqli_report lancia eccezioni in caso di errore
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        try {
            $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
            $conn->set_charset('utf8mb4');

        } catch (mysqli_sql_exception $e) {
            // Log dell'errore sul server (non visibile all'utente per sicurezza)
            error_log('Errore connessione al DataBase: ' . $e->getMessage());

            // Risposta JSON con errore generico
            header('Content-Type: application/json');
            http_response_code(500);
            die(json_encode([
                'success' => false,
                'message' => 'Errore di connessione al database. Controlla config.'
            ]));
        }
    }

    return $conn;
}


// Funzione helper: invia risposta JSON e termina lo script
function jsonResponse(array $data, int $statusCode = 200): void {
    header('Content-Type: application/json; charset=utf-8');
    // Permette richieste AJAX dalla stessa origine
    header('X-Content-Type-Options: nosniff');
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}


// Funzione helper: controlla se l'utente è autenticato
// Se non lo è, risponde con 401
function requireAuth(): int {
    if (session_status() === PHP_SESSION_NONE) {
        // Impostazioni sicurezza sessione
        ini_set('session.cookie_httponly', 1);
        ini_set('session.cookie_samesite', 'Lax'); // Modificato da Strict a Lax per permettere OAuth2
        session_set_cookie_params(SESSION_LIFETIME);
        session_start();
    }

    // check dell'id utente se è salvato in session
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'message' => 'Non autenticato. Effettua il login.'], 401);
    }

    return (int) $_SESSION['user_id'];
}
