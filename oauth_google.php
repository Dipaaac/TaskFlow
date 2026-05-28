<?php
// ============================================================
// oauth_google.php - Avvia il flusso di login con Google
// ============================================================
//
// Questo script:
//  1. Genera un token CSRF casuale (state) e lo salva in sessione
//  2. Costruisce l'URL di autorizzazione Google
//  3. Reindirizza il browser a Google per il consenso
//
require_once 'config.php';

// Avvia la sessione sicura (necessaria per salvare lo state CSRF)
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_samesite', 'Lax');
    session_set_cookie_params(SESSION_LIFETIME);
    session_start();
}

// Genera e salva lo state anti-CSRF (token casuale)
$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;

// Parametri della richiesta OAuth2
$params = http_build_query([
    'client_id'     => GOOGLE_CLIENT_ID,
    'redirect_uri'  => GOOGLE_REDIRECT_URI,
    'response_type' => 'code',
    'scope'         => 'openid email profile',
    'state'         => $state,
    'access_type'   => 'offline',   // 'offline' se vuoi il refresh_token
    'prompt'        => 'select_account', // Mostra sempre il selettore account Google
]);

$authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . $params;

// Reindirizza a Google
header('Location: ' . $authUrl);
exit();
