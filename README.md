# TaskFlow — To-Do List con Autenticazione
### Progetto di fine quinta superiore | HTML · CSS · JavaScript · PHP · MySQL

---

## 📁 Struttura File

```
todo_app/
├── index.html      	→ Pagina login/registrazione
├── dashboard.html  	→ Dashboard con lista task
├── style.css       	→ Stile completo (tema dark/light, responsive)
├── script.js       	→ Logica frontend (AJAX, drag-and-drop, validazione)
├── config.php      	→ Connessione al database MySQL
├── api.php         	→ API REST completa (CRUD task + autenticazione)
├── database.sql    	→ Script per creare DB e tabelle
├── oauth_callback.php	→ Gestisce il callback di Google sfruttando il protocollo OAuth2
├── oauth_google.php 	→ Avvia il flusso di login con Google
├── .env 				→ File di configurazione
└── README.md       	→ Queste istruzioni
```

---

## ⚙️ Requisiti

- **XAMPP** con:
  - Apache 2.4+
  - PHP 8.0+
  - MySQL 5.7+ / MariaDB 10+
- Browser (Chrome, Firefox, Edge, Safari)

---

## 🚀 Setup Passo-Passo

### 1. Copia i file nella cartella di XAMPP

Copia l'intera cartella `todo_app` dentro:
```
C:\xampp\htdocs\todo_app\        (Windows)
/Applications/XAMPP/htdocs/todo_app/   (Mac)
/opt/lampp/htdocs/todo_app/      (Linux)
```

### 2. Avvia XAMPP

Apri il **XAMPP Control Panel** e avvia:
- ✅ **Apache** (server web PHP)
- ✅ **MySQL** (database)

### 3. Crea il Database

**Opzione A — phpMyAdmin (consigliato):**
1. Apri il browser e vai su `http://localhost/phpmyadmin`
2. Clicca su "**Nuovo**" nel pannello sinistro
3. Scrivi `todo_app` come nome database → clicca "**Crea**"
4. Clicca sul database `todo_app` appena creato
5. Vai sulla scheda "**SQL**"
6. Copia e incolla il contenuto di `database.sql`
7. Clicca "**Esegui**"

**Opzione B — Riga di comando:**
```bash
mysql -u root -p < C:\xampp\htdocs\todo_app\database.sql
```

### 4. Configura la Connessione DB

Apri `config.php` e verifica/modifica:
```php
define('DB_HOST', 'localhost');   // Di solito localhost
define('DB_USER', 'root');        // Utente MySQL (XAMPP default: root)
define('DB_PASS', '');            // Password (XAMPP default: vuota)
define('DB_NAME', 'todo_app');    // Nome database
```

> ⚠️ **Nota:** Se hai impostato una password per MySQL in XAMPP, inseriscila in `DB_PASS`.

### 5. Apri l'Applicazione

Vai su: **`http://localhost/todo_app/index.html`**

---

## 🧪 Come Testare

1. **Registrazione:** Crea un nuovo account dalla pagina di login
2. **Login:** Accedi con le credenziali create
3. **Aggiungi task:** Scrivi un task e premi `Invio` o il bottone `+`
4. **Completa task:** Clicca sulla checkbox del task
5. **Modifica task:** Clicca sull'icona matita `✎`
6. **Elimina task:** Clicca sulla `✕` e conferma
7. **Riordina:** Trascina i task con il handle `⠿`
8. **Filtra:** Usa i bottoni "Tutti / Da fare / Completati"
9. **Cerca:** Usa la barra di ricerca
10. **Tema:** Clicca sull'icona ☀️/🌙 per cambiare tema
11. **Logout:** Clicca sul tuo username → "Esci"

---

## 🔍 Verifica Database in phpMyAdmin

Dopo aver usato l'app, puoi verificare i dati:
```sql
-- Vedi utenti registrati
SELECT id, username, created_at FROM users;

-- Vedi task di tutti gli utenti
SELECT t.id, u.username, t.task_text, t.completed, t.created_at
FROM tasks t
JOIN users u ON t.user_id = u.id
ORDER BY t.created_at DESC;
```

---

## 🔐 Autenticazione con Google (OAuth2)

Il progetto supporta il login tramite Google OAuth2. Gli utenti possono accedere cliccando il pulsante **"Accedi con Google"** senza dover scegliere username e password.

### Setup Google Cloud Console

**1. Crea un progetto Google Cloud**
- Vai su [https://console.cloud.google.com/](https://console.cloud.google.com/)
- Crea un nuovo progetto oppure selezionane uno esistente

**2. Configura la schermata di consenso OAuth**
- Vai su **API e servizi → Schermata consenso OAuth**
- Seleziona **Esterno** → Crea
- Compila: nome app (`TaskFlow`), email di supporto, email sviluppatore
- Salva e continua (le sezioni scopi e utenti di test si possono lasciare vuote in sviluppo)

**3. Crea le credenziali**
- Vai su **API e servizi → Credenziali → + Crea credenziali → ID client OAuth**
- Tipo di applicazione: **Applicazione web**
- Nome: `TaskFlow localhost`
- In **URI di reindirizzamento autorizzati** aggiungi:
  ```
  http://localhost/todo_app/oauth_callback.php
  ```
- Clicca **Crea** e copia **Client ID** e **Client Secret**

**4. Configura `config.php`**
```php
define('GOOGLE_CLIENT_ID',     'xxxxxxxxxxxx.apps.googleusercontent.com');
define('GOOGLE_CLIENT_SECRET', 'GOCSPX-xxxxxxxxxxxxxxxxxx');
define('GOOGLE_REDIRECT_URI',  'http://localhost/todo_app/oauth_callback.php');
```

**5. Aggiorna il database**
Se stai partendo da zero, esegui `database.sql` normalmente (la tabella `users` include già le colonne OAuth).

Se invece hai un DB già esistente, esegui questa migrazione:
```sql
ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL UNIQUE AFTER password;
ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER email;
```

### Nuovi file aggiunti

| File 					| Descrizione 											|
|-----------------------|-------------------------------------------------------|
| `oauth_google.php` 	| Avvia il flusso OAuth (reindirizza a Google) 			|
| `oauth_callback.php` 	| Riceve il callback da Google, crea/aggiorna l'utente 	|

### Come funziona internamente

```
[Utente clicca "Accedi con Google"]
        ↓
oauth_google.php  → genera state CSRF → redirect a accounts.google.com
        ↓
[Utente autorizza l'app su Google]
        ↓
oauth_callback.php  → verifica state → scambia code con token → recupera profilo
        ↓
[Utente nel DB?]  NO → crea account con username da email
                  SÌ → aggiorna email se cambiata
        ↓
session_regenerate_id() → $_SESSION['user_id'] + username
        ↓
redirect a dashboard.html
```

---



| Feature 				| Dettaglio 										|
|-----------------------|---------------------------------------------------|
| Password hashing 		| `password_hash()` con bcrypt (costo 12) 			|
| SQL Injection 		| Prepared statements con `?` parametrici 			|
| XSS 					| `escapeHtml()` JS + output sanificato 			|
| CSRF (form) 			| Sessioni PHP con `SameSite=Strict` 				|
| CSRF (OAuth) 			| State token casuale `bin2hex(random_bytes(16))` 	|
| Session fixation 		| `session_regenerate_id(true)` al login 			|
| Accesso diretto file 	| Blocco in `config.php` 							|
| Autorizzazione task 	| Ogni query verifica `user_id` della sessione 		|
| OAuth token 			| Scambio server-to-server 							|

---

## 🐛 Troubleshooting

### "Errore di connessione al database"
- Verifica che MySQL sia avviato in XAMPP
- Controlla `DB_USER`, `DB_PASS`, `DB_NAME` in `config.php`
- Assicurati di aver eseguito `database.sql`

### Pagina bianca o errore 500
- Abilita il display degli errori PHP:
  In `config.php` aggiungi all'inizio:
  ```php
  ini_set('display_errors', 1);
  error_reporting(E_ALL);
  ```

### "Sessione scaduta" subito
- Verifica che `session.cookie_httponly` sia abilitato in `php.ini`
- Prova a svuotare i cookie del browser

### Il drag-and-drop non funziona
- Funziona solo nel filtro "Tutti" e senza ricerca attiva
- Richiede un browser moderno con HTML5 drag API

---

## 📚 Tecnologie e Concetti Usati

**Frontend:**
- HTML5 semantico (ARIA roles, accessibilità)
- CSS3: Custom Properties, Flexbox, Grid, animazioni, media queries
- JavaScript ES6+: async/await, fetch API, DOM manipulation
- HTML5 Drag and Drop API
- localStorage per fallback offline

**Backend:**
- PHP 8+ OOP: `mysqli`, prepared statements
- Sessioni PHP sicure
- Architettura REST-like con singolo endpoint (`api.php`)
- Pattern Singleton per la connessione DB

**Database:**
- MySQL
- Relazioni con Foreign Key
- Indici per ottimizzazione query

---

## 📝 Questo progetto dimostra la conoscenza di:

- Full-stack development con tecnologie web standard
- Sicurezza applicativa
- UX/UI design responsive e accessibile
- Architettura client-server con API
- Gestione database relazionale

---

*TaskFlow — Progetto scolastico 2025/2026*
