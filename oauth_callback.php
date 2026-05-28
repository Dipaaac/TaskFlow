<?php
// ============================================================
// oauth_callback.php - Gestisce il callback di Google OAuth2
// ============================================================
//
// Flusso:
//  1. Google reindirizza qui con ?code=... dopo che l'utente acconsente
//  2. Scambiamo il code con un access_token
//  3. Recuperiamo il profilo Google dell'utente
//  4. Creiamo o aggiorniamo l'utente nel DB
//  5. Avviamo la sessione e reindirizziamo alla dashboard
//
require_once 'config.php';

// Avvia la sessione sicura
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_samesite', 'Lax'); // Lax invece di Strict per permettere il redirect OAuth
    session_set_cookie_params(SESSION_LIFETIME);
    session_start();
}

// ── Verifica state CSRF ──
// Google rimanda indietro il parametro ?state= che avevamo impostato
$stateReceived = $_GET['state'] ?? '';
$stateExpected = $_SESSION['oauth_state'] ?? '';

if (empty($stateExpected) || !hash_equals($stateExpected, $stateReceived)) {
    die('Errore di sicurezza: state OAuth non valido. <a href="index.html">Torna al login</a>');
}
// Consuma lo state (usabile una sola volta)
unset($_SESSION['oauth_state']);

// ── Controlla errori restituiti da Google ──
if (isset($_GET['error'])) {
    $err = htmlspecialchars($_GET['error']);
    die("Google ha rifiutato l'accesso: $err. <a href='index.html'>Torna al login</a>");
}

$code = $_GET['code'] ?? '';
if (empty($code)) {
    die('Codice OAuth mancante. <a href="index.html">Torna al login</a>');
}

// ── Scambio code -> access_token ──
$tokenEndpoint = 'https://oauth2.googleapis.com/token';
$postData = http_build_query([
    'code'          => $code,
    'client_id'     => GOOGLE_CLIENT_ID,
    'client_secret' => GOOGLE_CLIENT_SECRET,
    'redirect_uri'  => GOOGLE_REDIRECT_URI,
    'grant_type'    => 'authorization_code',
]);

$context = stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $postData,
        'timeout' => 10,
    ],
]);

$tokenResponse = @file_get_contents($tokenEndpoint, false, $context);
if ($tokenResponse === false) {
    die('Impossibile contattare il server Google. <a href="index.html">Riprova</a>');
}

$tokenData = json_decode($tokenResponse, true);

if (!isset($tokenData['access_token'])) {
    error_log('OAuth token error: ' . $tokenResponse);
    die('Errore durante il recupero del token. <a href="index.html">Riprova</a>');
}

$accessToken = $tokenData['access_token'];

// ── Recupera il profilo utente da Google ──
$profileEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo';
$profileContext  = stream_context_create([
    'http' => [
        'method'  => 'GET',
        'header'  => "Authorization: Bearer $accessToken\r\n",
        'timeout' => 10,
    ],
]);

$profileResponse = @file_get_contents($profileEndpoint, false, $profileContext);
if ($profileResponse === false) {
    die('Impossibile recuperare il profilo Google. <a href="index.html">Riprova</a>');
}

$profile = json_decode($profileResponse, true);

if (empty($profile['id']) || empty($profile['email'])) {
    die('Profilo Google non valido. <a href="index.html">Riprova</a>');
}

$googleId = $profile['id'];
$email    = $profile['email'];
$name     = $profile['name'] ?? $profile['given_name'] ?? explode('@', $email)[0];

// ── Crea o aggiorna l'utente nel database ──
$db = getDB();

// Cerca l'utente per google_id
$stmt = $db->prepare('SELECT id, username FROM users WHERE google_id = ?');
$stmt->bind_param('s', $googleId);
$stmt->execute();
$result = $stmt->get_result();
$user   = $result->fetch_assoc();
$stmt->close();

if ($user) {
    // Utente esistente -> aggiorna email se cambiata
    $stmt = $db->prepare('UPDATE users SET email = ? WHERE id = ?');
    $stmt->bind_param('si', $email, $user['id']);
    $stmt->execute();
    $stmt->close();

    $userId   = $user['id'];
    $username = $user['username'];

} else {
    // Nuovo utente Google -> genera username univoco dall'email
    $baseUsername = preg_replace('/[^a-zA-Z0-9_]/', '_', explode('@', $email)[0]);
    $baseUsername = substr($baseUsername, 0, 45); // Lascia spazio per suffisso numerico

    $username = $baseUsername;
    $counter  = 1;

    // Assicura unicità dell'username
    while (true) {
        $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();

        if (!$exists) break;
        $username = $baseUsername . '_' . $counter++;
    }

    // Inserisce il nuovo utente (password sempre NULL per utenti OAuth)
    $stmt = $db->prepare(
        'INSERT INTO users (username, email, google_id, password) VALUES (?, ?, ?, NULL)'
    );
    $stmt->bind_param('sss', $username, $email, $googleId);
    $stmt->execute();
    $userId = $stmt->insert_id;
    $stmt->close();
}

// ── Avvia la sessione autenticata ──
session_regenerate_id(true);
$_SESSION['user_id']  = $userId;
$_SESSION['username'] = $username;
$_SESSION['auth_via'] = 'google'; // Per tracciare il metodo di login

// Reindirizza alla dashboard
header('Location: dashboard.html');
exit();
