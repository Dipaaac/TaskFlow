-- ============================================================
-- SCRIPT DATABASE SQL - Applicazione To-Do List con Autenticazione
-- Progetto di fine quinta superiore
-- ============================================================
-- Istruzioni:
-- 1. Apri phpMyAdmin (http://localhost/phpmyadmin)
-- 2. Clicca su "Nuovo" per creare un database
-- 3. Oppure esegui direttamente questo script dalla scheda "SQL"
-- ============================================================

-- Crea il database se non esiste
CREATE DATABASE IF NOT EXISTS todo_app
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Seleziona il database
USE todo_app;

-- ============================================================
-- TABELLA: users
-- Contiene gli utenti registrati
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,   -- Chiave primaria auto-increment
    username    VARCHAR(50)  NOT NULL UNIQUE,              -- Username univoco (max 50 caratteri)
    password    VARCHAR(255) NULL,                         -- Password hashata (NULL per utenti Google OAuth)
    email       VARCHAR(255) NULL UNIQUE,                  -- Email (da Google OAuth)
    google_id   VARCHAR(100) NULL UNIQUE,                  -- ID Google (da OAuth2)
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP  -- Data registrazione
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELLA: tasks
-- Contiene i task di ogni utente
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,   -- Chiave primaria auto-increment
    user_id       INT UNSIGNED NOT NULL,                     -- FK verso users.id
    task_text     VARCHAR(500) NOT NULL,                     -- Testo del task (max 500 caratteri)
    completed     TINYINT(1)   NOT NULL DEFAULT 0,           -- 0 = da fare, 1 = completato
    position      INT UNSIGNED NOT NULL DEFAULT 0,           -- Posizione per drag-and-drop
    due_datetime  DATETIME     NULL DEFAULT NULL,            -- Scadenza con data e ora
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Data creazione
    -- Chiave esterna: se l'utente viene cancellato, cancella anche i suoi task (consistenza dei dati ACID)
    CONSTRAINT fk_tasks_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Velocizza le query "SELECT * FROM tasks WHERE user_id = ?"
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
-- Velocizza l'ordinamento per posizione
CREATE INDEX idx_tasks_position ON tasks(user_id, position);