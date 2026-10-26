
const Database = require("better-sqlite3");
const path = require("path");

// Membuat atau membuka database SQLite
const dbPath = path.join(__dirname, "zero-trust.db");
const db = new Database(dbPath);

// Mengaktifkan pemeriksaan relasi antar tabel
db.pragma("foreign_keys = ON");

// Membuat tabel pengguna
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nim TEXT UNIQUE,
    nama TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('mahasiswa', 'dosen', 'admin')),
    aktif INTEGER NOT NULL DEFAULT 1
  );
`);

// Membuat tabel perangkat terdaftar
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    aktif INTEGER NOT NULL DEFAULT 1,
    UNIQUE (user_id, device_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Membuat tabel refresh token
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Membuat tabel audit log
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subject TEXT,
    endpoint TEXT NOT NULL,
    device_id TEXT,
    result TEXT NOT NULL CHECK (result IN ('allow', 'deny')),
    reason TEXT NOT NULL
  );
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS kelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_kelas TEXT NOT NULL UNIQUE,
    nama_kelas TEXT NOT NULL,
    dosen_id INTEGER NOT NULL,
    FOREIGN KEY (dosen_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS nilai (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mahasiswa_id INTEGER NOT NULL,
    kelas_id INTEGER NOT NULL,
    nilai_angka REAL,
    nilai_huruf TEXT,
    finalized INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (mahasiswa_id) REFERENCES users(id),
    FOREIGN KEY (kelas_id) REFERENCES kelas(id),
    UNIQUE (mahasiswa_id, kelas_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transkrip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mahasiswa_id INTEGER NOT NULL,
    kelas_id INTEGER NOT NULL,
    nilai_angka REAL NOT NULL,
    nilai_huruf TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (mahasiswa_id, kelas_id),
    FOREIGN KEY (mahasiswa_id) REFERENCES users(id),
    FOREIGN KEY (kelas_id) REFERENCES kelas(id)
  );
`);

console.log("Database Zero Trust berhasil disiapkan.");

module.exports = db;
