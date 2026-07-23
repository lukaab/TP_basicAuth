const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'database.db'));

db.pragma('foreign_keys = ON');

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();

function addColumnIfMissing(tableName, columnName, sql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.prepare(sql).run();
  }
}

addColumnIfMissing(
  'users',
  'two_factor_secret',
  'ALTER TABLE users ADD COLUMN two_factor_secret TEXT'
);

addColumnIfMissing(
  'users',
  'two_factor_enabled',
  'ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0'
);

module.exports = db;