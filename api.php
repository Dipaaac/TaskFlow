<?php
// ============================================================
// api.php - Endpoint unico per tutte le operazioni CRUD
// ============================================================
//
// Gestisce le seguenti rotte (basate su $_GET['action']):
//
//  POST   action=login        -> Login utente
//  POST   action=register     -> Registrazione utente
//  POST   action=logout       -> Logout utente
//  GET    action=tasks        -> Lista task dell'utente loggato
//  POST   action=add_task     -> Aggiunge un nuovo task
//  POST   action=toggle_task  -> Toggle completato/da fare
//  POST   action=edit_task    -> Modifica testo del task
//  POST   action=delete_task  -> Elimina un task
//  POST   action=reorder      -> Aggiorna posizioni dopo drag-and-drop

require_once 'config.php';

// Avvia la sessione
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_samesite', 'Lax'); // Cambiato da Strict a Lax per permettere di lavorare con OAuth2
    session_set_cookie_params(SESSION_LIFETIME);
    session_start();
}

// Header JSON
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$action = $_GET['action'] ?? '';
switch ($action) {

    // LOGIN: autentica l'utente e salva la sessione
    case 'login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => 'Metodo non consentito.'], 405);
        }

        // Legge e purifica l'input dal body JSON
        $body     = json_decode(file_get_contents('php://input'), true);
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        if (empty($username) || empty($password)) {
            jsonResponse(['success' => false, 'message' => 'Username e password sono obbligatori.'], 400);
        }

        $db   = getDB();
        $stmt = $db->prepare('SELECT id, password FROM users WHERE username = ?');
        $stmt->bind_param('s', $username); // 's' sta per string
        $stmt->execute();
        $result = $stmt->get_result();
        $user   = $result->fetch_assoc();
        $stmt->close();

        // password_verify è sicuro contro timing attacks
        if (!$user || !password_verify($password, $user['password'])) {
            jsonResponse(['success' => false, 'message' => 'Credenziali non valide.'], 401);
        }

        // Rigenera l'ID sessione
        session_regenerate_id(true);
        $_SESSION['user_id']  = $user['id'];
        $_SESSION['username'] = $username;

        // login
        jsonResponse(['success' => true, 'message' => 'Login effettuato.', 'username' => $username]);
        break;

    // REGISTER: crea un nuovo account utente
    case 'register':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => 'Metodo non consentito.'], 405);
        }

        $body     = json_decode(file_get_contents('php://input'), true);
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        // Validazione: username tra 3 e 50 caratteri, alfanumerico
        if (strlen($username) < 3 || strlen($username) > 50) {
            jsonResponse(['success' => false, 'message' => 'Username deve essere tra 3 e 50 caratteri.'], 400);
        }
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
            jsonResponse(['success' => false, 'message' => 'Username può contenere solo lettere, numeri e underscore.'], 400);
        }
        // Password: minimo 6 caratteri
        if (strlen($password) < 6) {
            jsonResponse(['success' => false, 'message' => 'La password deve essere di almeno 6 caratteri.'], 400);
        }

        $db = getDB();

        // Controlla se l'username è già in uso
        $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $stmt->store_result();

        // Se già in uso
        if ($stmt->num_rows > 0) {
            $stmt->close();
            jsonResponse(['success' => false, 'message' => 'Username già in uso. Scegline un altro.'], 409);
        }
        $stmt->close();

        // Hash della password con bcrypt (costo 12 = buon compromesso sicurezza/performance)
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        // Nuovo utente nel db
        $stmt = $db->prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        $stmt->bind_param('ss', $username, $hashedPassword);
        $stmt->execute();
        $newUserId = $stmt->insert_id; // ID nuovo utente
        $stmt->close();

        // Login automatico 
        session_regenerate_id(true);
        $_SESSION['user_id']  = $newUserId;
        $_SESSION['username'] = $username;

        jsonResponse(['success' => true, 'message' => 'Registrazione completata!', 'username' => $username], 201);
        break;

    // LOGOUT: distrugge la sessione
    case 'logout':
        $_SESSION = [];

        // Cancella il cookie di sessione dal browser
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(), '',
                time() - 42000,
                $params['path'], $params['domain'],
                $params['secure'], $params['httponly']
            );
        }
        session_destroy();

        jsonResponse(['success' => true, 'message' => 'Logout effettuato.']);
        break;

    // GET TASKS: restituisce tutti i task dell'utente loggato
    case 'tasks':
        $userId = requireAuth(); // Verifica login (error 401 se non loggato)

        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT id, task_text, completed, position, due_datetime, created_at
             FROM tasks
             WHERE user_id = ?
             ORDER BY position ASC, created_at ASC'
        );
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        // Raccoglie tutti i task in un array associativo
        $tasks = [];
        while ($row = $result->fetch_assoc()) {
            $tasks[] = [
                'id'           => (int) $row['id'],
                'text'         => $row['task_text'],
                'completed'    => (bool) $row['completed'],
                'position'     => (int) $row['position'],
                'due_datetime' => $row['due_datetime'],  // NULL oppure like "YYYY-MM-DD HH:MM:SS"
                'created_at'   => $row['created_at'],
            ];
        }
        $stmt->close();

        jsonResponse(['success' => true, 'tasks' => $tasks, 'username' => $_SESSION['username'] ?? '']);
        break;

    // ADD TASK: aggiunge un nuovo task
    case 'add_task':
        $userId = requireAuth();

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => 'Metodo non consentito.'], 405);
        }

        $body     = json_decode(file_get_contents('php://input'), true);
        $taskText = trim($body['text'] ?? '');

        // Validazione testo
        if (empty($taskText)) {
            jsonResponse(['success' => false, 'message' => 'Il testo del task non può essere vuoto.'], 400);
        }
        if (strlen($taskText) > 500) {
            jsonResponse(['success' => false, 'message' => 'Il task è troppo lungo (max 500 caratteri).'], 400);
        }

        // Gestione due_datetime (opzionale: stringa "YYYY-MM-DDTHH:MM" -> converte in "YYYY-MM-DD HH:MM:SS")
        $dueDatetime = null;
        $rawDue = trim($body['due_datetime'] ?? '');
        if ($rawDue !== '') {
            // Accetta sia "YYYY-MM-DDTHH:MM" (formato input HTML) sia "YYYY-MM-DD HH:MM"
            $rawDue = str_replace('T', ' ', $rawDue);
            // Valida il formato con una regex e poi con DateTime
            if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $rawDue)) {
                jsonResponse(['success' => false, 'message' => 'Formato data/ora non valido. Usa YYYY-MM-DD HH:MM.'], 400);
            }
            $dt = DateTime::createFromFormat('Y-m-d H:i', $rawDue);
            if (!$dt || $dt->format('Y-m-d H:i') !== $rawDue) {
                jsonResponse(['success' => false, 'message' => 'Data/ora non valida.'], 400);
            }
            $dueDatetime = $dt->format('Y-m-d H:i:s'); // Normalizza in secondi
        }

        $db = getDB();

        // Calcola la posizione: mette il nuovo task in fondo alla lista
        $stmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE user_id = ?');
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $pos = $stmt->get_result()->fetch_assoc()['next_pos'];
        $stmt->close();

        // Inserisce il task con due_datetime (può essere NULL)
        $stmt = $db->prepare('INSERT INTO tasks (user_id, task_text, position, due_datetime) VALUES (?, ?, ?, ?)');
        $stmt->bind_param('isis', $userId, $taskText, $pos, $dueDatetime);
        $stmt->execute();
        $newId = $stmt->insert_id;
        $stmt->close();

        jsonResponse([
            'success' => true,
            'message' => 'Task aggiunto.',
            'task' => [
                'id'           => $newId,
                'text'         => $taskText,
                'completed'    => false,
                'position'     => (int) $pos,
                'due_datetime' => $dueDatetime,
            ]
        ], 201);
        break;

    // TOGGLE TASK: completato/da fare
    case 'toggle_task':
        $userId = requireAuth();

        $body   = json_decode(file_get_contents('php://input'), true);
        $taskId = (int) ($body['id'] ?? 0);

        if ($taskId <= 0) {
            jsonResponse(['success' => false, 'message' => 'ID task non valido.'], 400);
        }

        $db = getDB();

        // Aggiorna solo se il task appartiene all'utente loggato
        $stmt = $db->prepare(
            'UPDATE tasks SET completed = NOT completed WHERE id = ? AND user_id = ?'
        );
        $stmt->bind_param('ii', $taskId, $userId);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse(['success' => false, 'message' => 'Task non trovato.'], 404);
        }

        // Legge il nuovo stato
        $stmt = $db->prepare('SELECT completed FROM tasks WHERE id = ?');
        $stmt->bind_param('i', $taskId);
        $stmt->execute();
        $newCompleted = (bool) $stmt->get_result()->fetch_assoc()['completed'];
        $stmt->close();

        jsonResponse(['success' => true, 'completed' => $newCompleted]);
        break;

    // EDIT TASK: modifica il testo di un task
    case 'edit_task':
        $userId = requireAuth();

        $body     = json_decode(file_get_contents('php://input'), true);
        $taskId   = (int) ($body['id'] ?? 0);
        $taskText = trim($body['text'] ?? '');

        if ($taskId <= 0) {
            jsonResponse(['success' => false, 'message' => 'ID task non valido.'], 400);
        }
        if (empty($taskText)) {
            jsonResponse(['success' => false, 'message' => 'Il testo del task non può essere vuoto.'], 400);
        }
        if (strlen($taskText) > 500) {
            jsonResponse(['success' => false, 'message' => 'Il task è troppo lungo (max 500 caratteri).'], 400);
        }

        // Gestione due_datetime in edit -> chiave presente nel body = aggiorna | assente = non toccare
        $updateDue    = array_key_exists('due_datetime', $body);
        $dueDatetime  = null;

        if ($updateDue) {
            $rawDue = trim($body['due_datetime'] ?? '');
            if ($rawDue !== '') {
                $rawDue = str_replace('T', ' ', $rawDue);
                if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $rawDue)) {
                    jsonResponse(['success' => false, 'message' => 'Formato data/ora non valido.'], 400);
                }
                $dt = DateTime::createFromFormat('Y-m-d H:i', $rawDue);
                if (!$dt || $dt->format('Y-m-d H:i') !== $rawDue) {
                    jsonResponse(['success' => false, 'message' => 'Data/ora non valida.'], 400);
                }
                $dueDatetime = $dt->format('Y-m-d H:i:s');
            }
            // Se $rawDue è stringa vuota, $dueDatetime rimane NULL -> rimuove la scadenza
        }

        $db = getDB();

        if ($updateDue) {
            // Aggiorna sia testo che scadenza
            $stmt = $db->prepare('UPDATE tasks SET task_text = ?, due_datetime = ? WHERE id = ? AND user_id = ?');
            $stmt->bind_param('ssii', $taskText, $dueDatetime, $taskId, $userId);
        } else {
            // Aggiorna solo il testo
            $stmt = $db->prepare('UPDATE tasks SET task_text = ? WHERE id = ? AND user_id = ?');
            $stmt->bind_param('sii', $taskText, $taskId, $userId);
        }

        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse(['success' => false, 'message' => 'Task non trovato.'], 404);
        }

        jsonResponse([
            'success'      => true,
            'message'      => 'Task modificato.',
            'text'         => $taskText,
            'due_datetime' => $dueDatetime,
        ]);
        break;

    // DELETE TASK: elimina un task
    case 'delete_task':
        $userId = requireAuth();

        $body   = json_decode(file_get_contents('php://input'), true);
        $taskId = (int) ($body['id'] ?? 0);

        if ($taskId <= 0) {
            jsonResponse(['success' => false, 'message' => 'ID task non valido.'], 400);
        }

        $db   = getDB();
        $stmt = $db->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
        $stmt->bind_param('ii', $taskId, $userId);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse(['success' => false, 'message' => 'Task non trovato.'], 404);
        }

        jsonResponse(['success' => true, 'message' => 'Task eliminato.']);
        break;

    // REORDER: aggiorna le posizioni dopo drag-and-drop
    case 'reorder':
        $userId = requireAuth();

        $body  = json_decode(file_get_contents('php://input'), true);
        $order = $body['order'] ?? [];

        if (!is_array($order) || empty($order)) {
            jsonResponse(['success' => false, 'message' => 'Ordine non valido.'], 400);
        }

        $db = getDB();
        // Aggiorna la posizione di ogni task nell'ordine corretto
        $stmt = $db->prepare('UPDATE tasks SET position = ? WHERE id = ? AND user_id = ?');

        foreach ($order as $position => $taskId) {
            $taskId   = (int) $taskId;
            $position = (int) $position;
            $stmt->bind_param('iii', $position, $taskId, $userId);
            $stmt->execute();
        }
        $stmt->close();

        jsonResponse(['success' => true, 'message' => 'Ordine aggiornato.']);
        break;

    // CHECK AUTH: controlla se l'utente è loggato (dashboard.html)
    case 'check_auth':
        if (!empty($_SESSION['user_id'])) {
            jsonResponse([
                'success'  => true,
                'loggedIn' => true,
                'username' => $_SESSION['username'] ?? ''
            ]);
        } else {
            jsonResponse(['success' => true, 'loggedIn' => false]);
        }
        break;

    // Azione non riconosciuta, errore
    default:
        jsonResponse(['success' => false, 'message' => "Azione '$action' non riconosciuta."], 400);
        break;
}
