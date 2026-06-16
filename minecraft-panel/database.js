const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'accounts.db'));

// Create / migrate tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT NOT NULL UNIQUE,
    password              TEXT NOT NULL,
    email                 TEXT,
    reset_token           TEXT,
    reset_token_expires   INTEGER,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mc_accounts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT NOT NULL,
    email            TEXT,
    password         TEXT,
    proxy_host       TEXT,
    proxy_port       TEXT,
    proxy_user       TEXT,
    proxy_pass       TEXT,
    status           TEXT DEFAULT 'unknown',
    notes            TEXT,
    bot_status       TEXT DEFAULT 'offline',
    bot_last_error   TEXT,
    bot_queue_pos    INTEGER,
    bot_connected_at DATETIME,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bot_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    event      TEXT NOT NULL,
    message    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add new columns to existing tables if upgrading from older schema
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('email'))               db.exec("ALTER TABLE users ADD COLUMN email TEXT");
if (!userCols.includes('reset_token'))         db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
if (!userCols.includes('reset_token_expires')) db.exec("ALTER TABLE users ADD COLUMN reset_token_expires INTEGER");

const accCols = db.prepare("PRAGMA table_info(mc_accounts)").all().map(c => c.name);
if (!accCols.includes('bot_status'))       db.exec("ALTER TABLE mc_accounts ADD COLUMN bot_status TEXT DEFAULT 'offline'");
if (!accCols.includes('bot_last_error'))   db.exec("ALTER TABLE mc_accounts ADD COLUMN bot_last_error TEXT");
if (!accCols.includes('bot_queue_pos'))    db.exec("ALTER TABLE mc_accounts ADD COLUMN bot_queue_pos INTEGER");
if (!accCols.includes('bot_connected_at')) db.exec("ALTER TABLE mc_accounts ADD COLUMN bot_connected_at DATETIME");

// Seed default admin user if none exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created — username: admin  password: admin123');
  console.log('IMPORTANT: Change this password after your first login!');
}

module.exports = db;
