/**
 * script.js — TaskFlow: Frontend Completo
 * ============================================================
 * Gestisce:
 *  - Autenticazione (login, registrazione, logout)
 *  - CRUD task via AJAX (fetch API)
 *  - Drag-and-drop (HTML5 API)
 *  - Filtri e ricerca
 *  - Dark/Light theme toggle + persistenza in localStorage
 *  - Validazione form client-side
 *  - Toast notifiche
 *  - localStorage come fallback offline
 * ============================================================
 */


// ============================================================
// 1. CONFIGURAZIONE
// ============================================================

const API_URL = 'api.php';

// Stato globale dell'applicazione 
const AppState = {
    tasks:         [],      // Array di tutti i task caricati dal server
    currentFilter: 'all',   // Filtro attivo: 'all' | 'pending' | 'completed' | 'overdue' | 'today'
    searchQuery:   '',       // Testo della ricerca
    isDragging:    null,     // Elemento task in fase di drag
    dragOverItem:  null,     // Elemento task sotto il cursore durante drag
    isOffline:     false,    // True se la richiesta API ha fallito -> usa localStorage
};

// ============================================================
// 2. TEMA DARK / LIGHT
// ============================================================

/**
 * Inizializza il tema salvato in localStorage.
 * Chiamato sia in index.html che in dashboard.html.
 */
function initTheme() {
    const savedTheme = localStorage.getItem('taskflow_theme') || 'light';
    applyTheme(savedTheme);
    updateThemeButton(savedTheme);
}

/**
 * Applica il tema al <body>.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
}

/**
 * Aggiorna l'emoji sul bottone toggle tema.
 * @param {'dark'|'light'} theme
 */
function updateThemeButton(theme) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const icon = btn.querySelector('.theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.title = theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro';
}

/**
 * Alterna tra tema dark e light.
 * Collegato al click del bottone #themeToggle in entrambe le pagine.
 */
function toggleTheme() {
    const isDark  = document.body.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    updateThemeButton(newTheme);
    localStorage.setItem('taskflow_theme', newTheme);
}

// Collega il bottone tema (deve funzionare su entrambe le pagine)
document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
});

// ============================================================
// 3. HELPER: RICHIESTE AJAX
// ============================================================

/**
 * Funzione generica per chiamate all'API PHP.
 * @param {string} action  - Parametro ?action= dell'endpoint
 * @param {string} method  - Metodo HTTP (GET, POST, PUT, DELETE)
 * @param {object} body    - Dati da inviare nel body (JSON)
 * @returns {Promise<object>} - La risposta JSON del server
 */
async function apiCall(action, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        // Invia i cookie di sessione con ogni richiesta
        credentials: 'same-origin',
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_URL}?action=${action}`, options);
        const data     = await response.json();

        // Se il server risponde 401 (non autenticato), torna al login
        if (response.status === 401) {
            showToast('Sessione scaduta. Effettua di nuovo il login.', 'error');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            return null;
        }

        return data;

    } catch (error) {
        // Errore di rete → attiva modalità offline con localStorage
        console.warn('API non raggiungibile, uso localStorage come fallback:', error);
        AppState.isOffline = true;
        return null;
    }
}

// ============================================================
// 4. AUTENTICAZIONE
// ============================================================

/**
 * Controlla se l'utente è già loggato (nella pagina index.html).
 * Se sì, reindirizza direttamente alla dashboard.
 */
async function checkIfAlreadyLogged() {
    const data = await apiCall('check_auth', 'GET');
    if (data && data.loggedIn) {
        window.location.href = 'dashboard.html';
    }
}

/**
 * Gestisce il login.
 * Collegato al bottone "Accedi" in index.html.
 */
async function handleLogin() {
    // Legge i valori dai campi
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    // Nasconde eventuali errori precedenti
    clearFieldErrors('login');
    hideAlert('loginAlert');

    // Validazione client-side
    let valid = true;

    if (!username) {
        showFieldError('loginUsernameError', 'Inserisci il tuo username.');
        document.getElementById('loginUsername').classList.add('error');
        valid = false;
    }
    if (!password) {
        showFieldError('loginPasswordError', 'Inserisci la password.');
        document.getElementById('loginPassword').classList.add('error');
        valid = false;
    }

    if (!valid) return;

    // Mostra stato caricamento sul bottone
    setButtonLoading('loginBtn', true);

    // Chiamata API
    const data = await apiCall('login', 'POST', { username, password });

    setButtonLoading('loginBtn', false);

    if (!data) {
        showAlert('loginAlert', 'Errore di connessione. Controlla XAMPP.', 'error');
        return;
    }

    if (data.success) {
        showAlert('loginAlert', `Benvenuto, ${data.username}! Reindirizzamento...`, 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
    } else {
        showAlert('loginAlert', data.message || 'Credenziali non valide.', 'error');
        document.getElementById('loginPassword').value = ''; // Pulisce la password
    }
}

/**
 * Gestisce la registrazione.
 * Collegato al bottone "Crea Account" in index.html.
 */
async function handleRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm  = document.getElementById('regConfirm').value;

    clearFieldErrors('reg');
    hideAlert('registerAlert');

    // Validazione avanzata client-side
    let valid = true;

    if (!username) {
        showFieldError('regUsernameError', 'Inserisci un username.');
        valid = false;
    } else if (username.length < 3) {
        showFieldError('regUsernameError', 'Username troppo corto (min. 3 caratteri).');
        valid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showFieldError('regUsernameError', 'Usa solo lettere, numeri e underscore.');
        valid = false;
    }

    if (!password) {
        showFieldError('regPasswordError', 'Inserisci una password.');
        valid = false;
    } else if (password.length < 6) {
        showFieldError('regPasswordError', 'Password troppo corta (min. 6 caratteri).');
        valid = false;
    }

    if (password && confirm !== password) {
        showFieldError('regConfirmError', 'Le password non corrispondono.');
        valid = false;
    }

    if (!valid) return;

    setButtonLoading('registerBtn', true);

    const data = await apiCall('register', 'POST', { username, password });

    setButtonLoading('registerBtn', false);

    if (!data) {
        showAlert('registerAlert', 'Errore di connessione. Controlla XAMPP.', 'error');
        return;
    }

    if (data.success) {
        showAlert('registerAlert', 'Account creato! Accesso in corso...', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } else {
        showAlert('registerAlert', data.message || 'Errore durante la registrazione.', 'error');
    }
}

/**
 * Gestisce il logout.
 * Collegato al bottone "Esci" nel menu utente della dashboard.
 */
async function handleLogout() {
    await apiCall('logout', 'POST');
    // Pulisce anche il localStorage
    localStorage.removeItem('taskflow_tasks_offline');
    window.location.href = 'index.html';
}

// ============================================================
// 5. INIZIALIZZAZIONE DASHBOARD
// ============================================================

/**
 * Inizializza la dashboard:
 * verifica il login, mostra username, carica i task.
 * Chiamato in dashboard.html.
 */
async function initDashboard() {
    // 1. Verifica che l'utente sia loggato
    const authData = await apiCall('check_auth', 'GET');

    if (!authData || !authData.loggedIn) {
        // Non loggato → reindirizza al login
        window.location.href = 'index.html';
        return;
    }

    // 2. Mostra username nell'header
    const username = authData.username;
    setTextContent('headerUsername', username);
    setTextContent('dropdownUsername', username);
    setTextContent('userAvatar', username.charAt(0).toUpperCase());

    // 3. Carica i task
    await loadTasks();
}

// ============================================================
// 6. CRUD TASK
// ============================================================

/**
 * Carica tutti i task dell'utente dal server.
 * In caso di errore, usa i task salvati in localStorage (fallback offline).
 */
async function loadTasks() {
    showElement('loadingState');
    hideElement('emptyState');

    const data = await apiCall('tasks', 'GET');

    hideElement('loadingState');

    if (data && data.success) {
        AppState.tasks = data.tasks;
        // Salva in localStorage come backup
        localStorage.setItem('taskflow_tasks_offline', JSON.stringify(data.tasks));
    } else {
        // Fallback: carica da localStorage
        const cached = localStorage.getItem('taskflow_tasks_offline');
        if (cached) {
            AppState.tasks = JSON.parse(cached);
            showToast('Modalità offline: dati potrebbero non essere aggiornati.', 'info');
        } else {
            AppState.tasks = [];
        }
    }

    renderTasks();
    updateStats();
}

/**
 * Aggiunge un nuovo task.
 * Collegato al bottone "+" e al tasto Invio nell'input.
 */
async function handleAddTask() {
    const input    = document.getElementById('newTaskInput');
    const taskText = input.value.trim();
    const errorEl  = document.getElementById('newTaskError');

    // Valida client-side
    errorEl.textContent = '';
    input.classList.remove('error');

    if (!taskText) {
        errorEl.textContent = 'Il task non può essere vuoto.';
        input.classList.add('error');
        // Animazione shake sull'input
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
        return;
    }

    if (taskText.length > 500) {
        errorEl.textContent = 'Il task è troppo lungo (max 500 caratteri).';
        input.classList.add('error');
        return;
    }

    // Legge data e ora scadenza (opzionali)
    const dueDatetime = readDueInputs('newTaskDate', 'newTaskTime');

    // Ottimistic UI: aggiunge il task localmente prima della risposta del server
    const tempTask = {
        id:           Date.now(), // ID temporaneo
        text:         taskText,
        completed:    false,
        position:     AppState.tasks.length,
        due_datetime: dueDatetime,
        isTemp:       true,       // Flag per identificarlo come temporaneo
    };

    AppState.tasks.push(tempTask);
    input.value = '';
    document.getElementById('taskCharCount').textContent = '0/500';
    clearDueInputs(); // Svuota anche i campi data/ora
    renderTasks();
    updateStats();
    input.focus();

    // Chiama l'API
    const data = await apiCall('add_task', 'POST', { text: taskText, due_datetime: dueDatetime || '' });

    if (data && data.success) {
        // Sostituisce il task temporaneo con quello reale dal server
        const idx = AppState.tasks.findIndex(t => t.isTemp);
        if (idx !== -1) {
            AppState.tasks[idx] = data.task;
        }
        renderTasks();
        saveToLocalStorage();
        showToast('Task aggiunto! ✓', 'success');
    } else {
        // Rimuove il task temporaneo in caso di errore
        AppState.tasks = AppState.tasks.filter(t => !t.isTemp);
        renderTasks();
        updateStats();
        showToast(data?.message || 'Errore durante l\'aggiunta del task.', 'error');
    }
}

/**
 * Alterna lo stato completato/da fare di un task.
 * @param {number} taskId
 */
async function handleToggleTask(taskId) {
    // Ottimistic UI: cambia stato localmente subito
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    renderTasks();
    updateStats();

    const data = await apiCall('toggle_task', 'POST', { id: taskId });

    if (data && data.success) {
        task.completed = data.completed; // Usa il valore reale dal server
        renderTasks();
        updateStats();
        saveToLocalStorage();
    } else {
        // Rollback in caso di errore
        task.completed = !task.completed;
        renderTasks();
        updateStats();
        showToast('Errore durante l\'aggiornamento.', 'error');
    }
}

/**
 * Apre il modal di modifica per un task (con campi testo + data/ora).
 * @param {number} taskId
 */
function startEditTask(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Popola il modal con i valori correnti del task
    document.getElementById('editTaskText').value = task.text;
    document.getElementById('editTaskError').textContent = '';

    // Popola i campi data/ora se il task ha una scadenza
    if (task.due_datetime) {
        // due_datetime arriva come "YYYY-MM-DD HH:MM:SS" dal PHP
        const [datePart, timePart] = task.due_datetime.split(' ');
        document.getElementById('editTaskDate').value = datePart || '';
        // Prende solo HH:MM (senza secondi) per l'input time
        document.getElementById('editTaskTime').value = timePart ? timePart.slice(0, 5) : '';
    } else {
        document.getElementById('editTaskDate').value = '';
        document.getElementById('editTaskTime').value = '';
    }

    // Collega il bottone Salva a questo specifico taskId
    const confirmBtn = document.getElementById('confirmEditBtn');
    confirmBtn.onclick = () => saveEditTask(taskId);

    // Apri il modal
    document.getElementById('editModal').classList.add('open');

    // Focus sul campo testo
    setTimeout(() => document.getElementById('editTaskText').focus(), 80);
}

/** Svuota i campi data/ora nel modal di modifica. */
function clearEditDueInputs() {
    document.getElementById('editTaskDate').value = '';
    document.getElementById('editTaskTime').value = '';
}

/** Chiude il modal di modifica. */
function closeEditModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('editModal').classList.remove('open');
    setButtonLoading('confirmEditBtn', false);
}

/**
 * Salva le modifiche (testo + scadenza) tramite API.
 * @param {number} taskId
 */
async function saveEditTask(taskId) {
    const newText = document.getElementById('editTaskText').value.trim();
    const errorEl = document.getElementById('editTaskError');
    errorEl.textContent = '';

    if (!newText) {
        errorEl.textContent = 'Il testo non può essere vuoto.';
        document.getElementById('editTaskText').focus();
        return;
    }

    // Legge data/ora dal modal
    const dueDatetime = readDueInputs('editTaskDate', 'editTaskTime');

    setButtonLoading('confirmEditBtn', true);

    const data = await apiCall('edit_task', 'POST', {
        id:           taskId,
        text:         newText,
        due_datetime: dueDatetime !== null ? (dueDatetime || '') : undefined,
    });

    setButtonLoading('confirmEditBtn', false);

    if (data && data.success) {
        const task = AppState.tasks.find(t => t.id === taskId);
        if (task) {
            task.text         = newText;
            task.due_datetime = data.due_datetime ?? null;
        }
        closeEditModal();
        renderTasks();
        saveToLocalStorage();
        showToast('Task modificato!', 'success');
    } else {
        errorEl.textContent = data?.message || 'Errore durante la modifica.';
    }
}

/**
 * Mostra il modal di conferma eliminazione.
 * @param {number} taskId
 */
function confirmDeleteTask(taskId) {
    const modal = document.getElementById('deleteModal');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (!modal || !confirmBtn) return;

    // Collega il bottone "Elimina" all'ID task specifico
    confirmBtn.onclick = () => handleDeleteTask(taskId);

    modal.classList.add('open');
    confirmBtn.focus();
}

/**
 * Elimina un task.
 * @param {number} taskId
 */
async function handleDeleteTask(taskId) {
    closeDeleteModal();

    // Anima l'elemento prima di rimuoverlo
    const taskEl = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskEl) {
        taskEl.classList.add('removing');
        await new Promise(r => setTimeout(r, 250)); // Aspetta l'animazione
    }

    // Rimuove dallo stato locale (ottimistic UI)
    AppState.tasks = AppState.tasks.filter(t => t.id !== taskId);
    renderTasks();
    updateStats();

    const data = await apiCall('delete_task', 'POST', { id: taskId });

    if (data && data.success) {
        saveToLocalStorage();
        showToast('Task eliminato.', 'info');
    } else {
        // Rollback: ricarica i task dal server
        showToast('Errore durante l\'eliminazione.', 'error');
        await loadTasks();
    }
}

/**
 * Elimina tutti i task completati.
 */
async function handleClearCompleted() {
    const completed = AppState.tasks.filter(t => t.completed);
    if (completed.length === 0) {
        showToast('Nessun task completato da eliminare.', 'info');
        return;
    }

    // Rimuove ogni task completato
    for (const task of completed) {
        AppState.tasks = AppState.tasks.filter(t => t.id !== task.id);
        await apiCall('delete_task', 'POST', { id: task.id });
    }

    renderTasks();
    updateStats();
    saveToLocalStorage();
    showToast(`${completed.length} task eliminati.`, 'success');
}

// ============================================================
// 7. RENDER LISTA TASK
// ============================================================

/**
 * Renderizza la lista task applicando filtri e ricerca.
 * Viene chiamata ogni volta che lo stato cambia.
 */
function renderTasks() {
    const listEl    = document.getElementById('taskList');
    const emptyEl   = document.getElementById('emptyState');
    const emptyDesc = document.getElementById('emptyDesc');
    const dndHint   = document.getElementById('dndHint');

    if (!listEl) return;

    // Filtra i task
    let filtered = AppState.tasks.filter(task => {
        const now     = new Date();
        const dueDate = task.due_datetime ? new Date(task.due_datetime.replace(' ', 'T')) : null;

        // Applica filtro stato
        if (AppState.currentFilter === 'pending'   && task.completed)  return false;
        if (AppState.currentFilter === 'completed' && !task.completed) return false;

        // Filtro "scaduti": ha scadenza, non completato, data passata
        if (AppState.currentFilter === 'overdue') {
            if (task.completed) return false;
            if (!dueDate || dueDate > now) return false;
        }

        // Filtro "oggi": scadenza entro la giornata corrente (non ancora completato)
        if (AppState.currentFilter === 'today') {
            if (task.completed) return false;
            if (!dueDate) return false;
            const todayEnd = new Date(now);
            todayEnd.setHours(23, 59, 59, 999);
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            if (dueDate < todayStart || dueDate > todayEnd) return false;
        }

        // Applica ricerca
        if (AppState.searchQuery) {
            const q = AppState.searchQuery.toLowerCase();
            if (!task.text.toLowerCase().includes(q)) return false;
        }

        return true;
    });

    // Mostra stato vuoto se non ci sono task
    if (filtered.length === 0) {
        listEl.innerHTML = '';
        showElement('emptyState');
        if (dndHint) dndHint.style.display = 'none';

        // Messaggio contestuale
        if (AppState.tasks.length === 0) {
            emptyDesc.textContent = 'Aggiungi il tuo primo task sopra!';
        } else if (AppState.searchQuery) {
            emptyDesc.textContent = `Nessun risultato per "${AppState.searchQuery}".`;
        } else if (AppState.currentFilter === 'pending') {
            emptyDesc.textContent = 'Tutti i task sono completati! 🎉';
        } else {
            emptyDesc.textContent = 'Nessun task completato ancora.';
        }
        return;
    }

    hideElement('emptyState');
    if (dndHint) dndHint.style.display = filtered.length > 1 ? 'block' : 'none';

    // Genera HTML per ogni task
    listEl.innerHTML = filtered.map(task => renderTaskItem(task)).join('');

    // Collega eventi drag-and-drop ai task renderizzati
    if (AppState.currentFilter === 'all' && !AppState.searchQuery) {
        attachDragEvents();
    }
}

/**
 * Genera l'HTML per un singolo task.
 * @param {object} task
 * @returns {string} HTML string
 */
function renderTaskItem(task) {
    const completedClass = task.completed ? 'completed' : '';
    const checkIcon      = task.completed ? '✓' : '';
    const dateStr        = task.created_at
        ? new Date(task.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'short' })
        : '';

    // Genera il badge scadenza (se presente)
    const dueBadgeHtml = task.due_datetime ? renderDueBadge(task) : '';

    // Classi extra per task scaduti/oggi
    const dueClass = !task.completed && task.due_datetime
        ? getDueClass(task.due_datetime)
        : '';

    return `
        <li class="task-item ${completedClass} ${dueClass}"
            data-task-id="${task.id}"
            draggable="true"
            role="listitem">

            <!-- Handle per drag-and-drop -->
            <span class="drag-handle" title="Trascina per riordinare"
                  aria-label="Trascina task">⠿</span>

            <!-- Checkbox personalizzata -->
            <div class="task-checkbox"
                 role="checkbox"
                 aria-checked="${task.completed}"
                 tabindex="0"
                 title="${task.completed ? 'Segna come da fare' : 'Segna come completato'}"
                 onclick="handleToggleTask(${task.id})"
                 onkeydown="if(event.key==='Enter'||event.key===' ')handleToggleTask(${task.id})">
                ${checkIcon}
            </div>

            <!-- Testo del task -->
            <span class="task-text">${escapeHtml(task.text)}</span>

            <!-- Badge scadenza (data + ora) -->
            ${dueBadgeHtml}

            <!-- Data creazione (visibile su desktop) -->
            ${dateStr ? `<span class="task-date" title="Creato il">${dateStr}</span>` : ''}

            <!-- Pulsanti azione -->
            <div class="task-actions">
                <button class="task-action-btn"
                        onclick="startEditTask(${task.id})"
                        title="Modifica task"
                        aria-label="Modifica task">
                    ✎
                </button>
                <button class="task-action-btn delete-btn"
                        onclick="confirmDeleteTask(${task.id})"
                        title="Elimina task"
                        aria-label="Elimina task">
                    ✕
                </button>
            </div>
        </li>
    `;
}

/**
 * Genera l'HTML del badge scadenza con lo stato corretto (normale/oggi/scaduto).
 * @param {object} task
 * @returns {string}
 */
function renderDueBadge(task) {
    if (!task.due_datetime) return '';

    const due    = new Date(task.due_datetime.replace(' ', 'T'));
    const now    = new Date();
    const diffMs = due - now;
    const diffH  = diffMs / (1000 * 60 * 60);

    let badgeClass = 'due-normal';
    let icon       = '🕐';

    if (!task.completed) {
        if (diffMs < 0) {
            badgeClass = 'due-overdue';
            icon       = '⚠️';
        } else if (diffH <= 1) {
            badgeClass = 'due-soon';
            icon       = '⏰';
        } else if (isToday(due)) {
            badgeClass = 'due-today';
            icon       = '📅';
        }
    }

    const label = formatDueDatetime(due);

    return `<span class="task-due-badge ${badgeClass}" title="Scadenza: ${label}">
                ${icon} ${label}
            </span>`;
}

/**
 * Restituisce la classe CSS extra da applicare al task in base alla scadenza.
 * @param {string} dueDatetimeStr
 * @returns {string}
 */
function getDueClass(dueDatetimeStr) {
    const due    = new Date(dueDatetimeStr.replace(' ', 'T'));
    const now    = new Date();
    const diffMs = due - now;
    if (diffMs < 0)    return 'is-overdue';
    if (isToday(due))  return 'is-today';
    return '';
}

// ============================================================
// 8. AGGIORNAMENTO STATISTICHE
// ============================================================

/**
 * Aggiorna i contatori e la barra di progresso.
 */
function updateStats() {
    const total     = AppState.tasks.length;
    const completed = AppState.tasks.filter(t => t.completed).length;
    const pending   = total - completed;
    const percent   = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Aggiorna i numeri
    setTextContent('statTotalNum',   total);
    setTextContent('statPendingNum', pending);
    setTextContent('statDoneNum',    completed);
    setTextContent('pendingCount',   pending);
    setTextContent('progressPercent', percent + '%');

    // Aggiorna la barra di progresso
    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = percent + '%';
}

// ============================================================
// 9. FILTRI E RICERCA
// ============================================================

/**
 * Imposta il filtro attivo e ri-renderizza.
 * @param {'all'|'pending'|'completed'|'overdue'|'today'} filter
 */
function setFilter(filter) {
    AppState.currentFilter = filter;

    // Aggiorna la classe "active" sui bottoni filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderTasks();
}

/**
 * Gestisce la ricerca in tempo reale.
 * Collegato all'evento oninput del campo ricerca.
 */
function handleSearch() {
    const input = document.getElementById('searchInput');
    AppState.searchQuery = input ? input.value : '';
    renderTasks();
}

// ============================================================
// 10. DRAG AND DROP
// ============================================================

/** Collega gli event listener HTML5 drag-and-drop a ogni task. */
function attachDragEvents() {
    const items = document.querySelectorAll('.task-item[draggable="true"]');

    items.forEach(item => {
        item.addEventListener('dragstart', onDragStart);
        item.addEventListener('dragend',   onDragEnd);
        item.addEventListener('dragenter', onDragEnter);
        item.addEventListener('dragleave', onDragLeave);
    });
}

/** Inizio trascinamento: salva l'elemento nel stato. */
function onDragStart(e) {
    AppState.isDragging = this;
    this.classList.add('dragging');
    // Dati trascinati (ID del task)
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.taskId);
}

/** Fine trascinamento: rimuove la classe. */
function onDragEnd() {
    this.classList.remove('dragging');
    // Rimuove drag-over da tutti
    document.querySelectorAll('.task-item').forEach(i => i.classList.remove('drag-over'));
    AppState.isDragging  = null;
    AppState.dragOverItem = null;
}

/** Elemento sotto il cursore: evidenzia. */
function onDragEnter(e) {
    e.preventDefault();
    if (this !== AppState.isDragging) {
        this.classList.add('drag-over');
        AppState.dragOverItem = this;
    }
}

/** Elemento lasciato: rimuove evidenziazione. */
function onDragLeave() {
    this.classList.remove('drag-over');
}

/** Permette il drop (necessario per HTML5 drag-and-drop). */
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

/** Drop: riposiziona il task e aggiorna il server. */
function onDrop(e) {
    e.preventDefault();
    if (!AppState.isDragging || !AppState.dragOverItem) return;
    if (AppState.isDragging === AppState.dragOverItem) return;

    const draggedId = parseInt(AppState.isDragging.dataset.taskId);
    const targetId  = parseInt(AppState.dragOverItem.dataset.taskId);

    // Trova gli indici nell'array dello stato
    const draggedIdx = AppState.tasks.findIndex(t => t.id === draggedId);
    const targetIdx  = AppState.tasks.findIndex(t => t.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    // Rimuove l'elemento trascinato e lo inserisce nella nuova posizione
    const [draggedTask] = AppState.tasks.splice(draggedIdx, 1);
    AppState.tasks.splice(targetIdx, 0, draggedTask);

    // Aggiorna le posizioni nell'array
    AppState.tasks.forEach((task, index) => {
        task.position = index;
    });

    renderTasks();
    updateStats();

    // Invia il nuovo ordine al server
    const newOrder = AppState.tasks.map(t => t.id);
    apiCall('reorder', 'POST', { order: newOrder }).then(() => {
        saveToLocalStorage();
    });
}

// ============================================================
// 11. VALIDAZIONE FORM (helper per index.html)
// ============================================================

/** Aggiorna il contatore caratteri e valida in tempo reale il campo username. */
function validateUsernameField() {
    const input = document.getElementById('regUsername');
    if (!input) return;

    const val = input.value;
    setTextContent('regUsernameCount', `${val.length}/50`);

    if (val.length > 0 && !/^[a-zA-Z0-9_]+$/.test(val)) {
        showFieldError('regUsernameError', 'Solo lettere, numeri e underscore.');
    } else {
        clearFieldError('regUsernameError');
    }
}

/** Calcola e mostra la forza della password. */
function checkPasswordStrength() {
    const input    = document.getElementById('regPassword');
    const bar      = document.getElementById('strengthBar');
    const label    = document.getElementById('strengthLabel');
    if (!input || !bar || !label) return;

    const pwd      = input.value;
    let score      = 0;

    if (pwd.length >= 6)  score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++; // Caratteri speciali

    // Imposta colore e label in base al punteggio
    const levels = [
        { width: '0%',   color: 'var(--border)',   text: '' },
        { width: '20%',  color: 'var(--danger)',    text: 'Molto debole' },
        { width: '40%',  color: 'var(--warning)',   text: 'Debole' },
        { width: '60%',  color: 'var(--info)',      text: 'Discreta' },
        { width: '80%',  color: 'var(--success)',   text: 'Forte' },
        { width: '100%', color: '#16a34a',          text: 'Molto forte' },
    ];

    const level = pwd.length === 0 ? levels[0] : levels[Math.min(score, 5)];

    bar.style.setProperty('--strength-width',  level.width);
    bar.style.setProperty('--strength-color',  level.color);
    bar.style.color = level.color;
    label.style.color = level.color;
    label.textContent = level.text;
}

/** Alterna visibilità password (campo login o registrazione). */
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

/** Alterna tra tab login e registrazione. */
function switchTab(tab) {
    const panels   = document.querySelectorAll('.auth-panel');
    const tabs     = document.querySelectorAll('.auth-tab');
    const indicator = document.getElementById('tabIndicator');

    panels.forEach(p => p.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));

    document.getElementById(`panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');

    // Sposta l'indicatore del tab
    if (indicator) {
        indicator.classList.toggle('right', tab === 'register');
    }

    // Aggiorna aria-selected
    document.getElementById('tabLogin').setAttribute('aria-selected',    tab === 'login');
    document.getElementById('tabRegister').setAttribute('aria-selected', tab === 'register');
}

// ============================================================
// 12. TOAST NOTIFICHE
// ============================================================

/**
 * Mostra una notifica toast temporanea.
 * @param {string} message - Testo del messaggio
 * @param {'success'|'error'|'info'} type - Tipo di toast
 * @param {number} duration - Durata in millisecondi (default: 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    // Limite massimo 3 toast: rimuove il più vecchio se superato
    const existing = container.querySelectorAll('.toast:not(.removing)');
    if (existing.length >= 3) {
        const oldest = existing[0];
        oldest.classList.add('removing');
        setTimeout(() => { if (oldest.parentNode) oldest.parentNode.removeChild(oldest); }, 300);
    }
    // Icone per tipo
    const icons = { success: '✓', error: '✕', info: 'ℹ' };

    // Crea il toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Rimuove il toast dopo la durata specificata
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, duration);
}

// ============================================================
// 13. MODAL
// ============================================================

/** Chiude il modal di conferma eliminazione. */
function closeDeleteModal(event) {
    // Se è stato cliccato l'overlay (non la card), chiudi
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.remove('open');
}

// ============================================================
// 14. MENU UTENTE
// ============================================================

/** Toggle del menu dropdown utente. */
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    const btn      = document.getElementById('userBtn');
    if (!dropdown || !btn) return;

    const isOpen = dropdown.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
}

// ============================================================
// 15. LOCALSTORAGE FALLBACK
// ============================================================

/** Salva i task correnti in localStorage come backup. */
function saveToLocalStorage() {
    localStorage.setItem('taskflow_tasks_offline', JSON.stringify(AppState.tasks));
}

// ============================================================
// 16. FUNZIONI HELPER GENERICHE
// ============================================================

/** Mostra un messaggio di errore sotto un campo del form. */
function showFieldError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = message;
}

/** Cancella il messaggio di errore di un campo. */
function clearFieldError(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = '';
}

/** Cancella tutti gli errori dei campi con un dato prefisso. */
function clearFieldErrors(prefix) {
    ['UsernameError', 'PasswordError', 'ConfirmError'].forEach(suffix => {
        clearFieldError(prefix + suffix);
    });
    // Rimuove le classi error dagli input
    document.querySelectorAll('.form-input.error').forEach(el => {
        el.classList.remove('error');
    });
}

/** Mostra un alert (successo/errore) nella pagina. */
function showAlert(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `alert ${type}`;
}

/** Nasconde un alert. */
function hideAlert(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = 'none';
}

/** Mostra un elemento (rimuove la classe 'hidden'). */
function showElement(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.remove('hidden');
}

/** Nasconde un elemento (aggiunge la classe 'hidden'). */
function hideElement(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('hidden');
}

/** Imposta il testo di un elemento. */
function setTextContent(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

/** Attiva/disattiva lo stato di caricamento di un bottone. */
function setButtonLoading(buttonId, loading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
}

/**
 * Escapa caratteri HTML speciali per prevenire XSS.
 * Fondamentale quando si mostra testo inserito dall'utente nel DOM.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ============================================================
// 17. HELPER DATA/ORA SCADENZA
// ============================================================

/**
 * Legge i campi data e ora e li combina in una stringa "YYYY-MM-DDTHH:MM"
 * compatibile con il backend PHP.
 * Restituisce la stringa se entrambi i campi sono valorizzati,
 * stringa vuota se solo la data è presente (ora default "00:00"),
 * null se nessun campo è valorizzato.
 *
 * @param {string} dateInputId  - ID dell'input type="date"
 * @param {string} timeInputId  - ID dell'input type="time"
 * @returns {string|null}
 */
function readDueInputs(dateInputId, timeInputId) {
    const dateEl = document.getElementById(dateInputId);
    const timeEl = document.getElementById(timeInputId);
    if (!dateEl) return null;

    const dateVal = dateEl.value; // "YYYY-MM-DD" o ""
    const timeVal = timeEl ? timeEl.value : ''; // "HH:MM" o ""

    if (!dateVal) return null; // Nessuna data → nessuna scadenza

    // Se c'è la data ma non l'ora, usa mezzanotte come default
    const time = timeVal || '00:00';
    return `${dateVal}T${time}`; // "2025-06-15T14:30"
}

/**
 * Svuota i campi data/ora nella sezione "Aggiungi task".
 */
function clearDueInputs() {
    const d = document.getElementById('newTaskDate');
    const t = document.getElementById('newTaskTime');
    if (d) d.value = '';
    if (t) t.value = '';
}

/**
 * Formatta un oggetto Date in una stringa leggibile in italiano.
 * Es: "15 giu, 14:30" oppure "ieri 09:00" oppure "tra 45 min"
 * @param {Date} date
 * @returns {string}
 */
function formatDueDatetime(date) {
    const now    = new Date();
    const diffMs = date - now;
    const diffM  = Math.round(diffMs / 60000); // Differenza in minuti

    // Formatta l'ora sempre come "HH:MM"
    const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    // Se scaduta
    if (diffMs < 0) {
        const absDiffM = Math.abs(diffM);
        if (absDiffM < 60)  return `${absDiffM} min fa`;
        if (absDiffM < 120) return `1 ora fa`;

        // Formatta data passata
        const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
        return `${dateStr} ${timeStr}`;
    }

    // Se scade entro i prossimi 60 minuti
    if (diffM <= 60) {
        if (diffM <= 1)  return 'tra pochi secondi';
        if (diffM < 60)  return `tra ${diffM} min`;
        return `tra 1 ora`;
    }

    // Se scade oggi
    if (isToday(date)) return `oggi ${timeStr}`;

    // Se scade domani
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(date, tomorrow)) return `domani ${timeStr}`;

    // Altrimenti: "15 giu, 14:30"
    const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    return `${dateStr} ${timeStr}`;
}

/**
 * Controlla se una data è oggi.
 * @param {Date} date
 * @returns {boolean}
 */
function isToday(date) {
    const now = new Date();
    return isSameDay(date, now);
}

/**
 * Controlla se due Date sono nello stesso giorno.
 * @param {Date} a
 * @param {Date} b
 * @returns {boolean}
 */
function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
}

