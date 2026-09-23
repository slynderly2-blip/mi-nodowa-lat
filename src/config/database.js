'use strict';
/**
 * src/config/database.js
 * Conexión SQLite usando sql.js (puro WebAssembly, sin compilación nativa).
 *
 * Estrategia de persistencia:
 *  - Cada run() o transaction() marca _dirty = true
 *  - Un timer de 500ms escribe al disco si hay cambios pendientes
 *  - Al exit/SIGINT/SIGTERM escribe inmediatamente
 *  - Escritura atómica: escribe a .tmp y renombra
 */

const path = require('path');
const fs   = require('fs');
const cfg  = require('./index');

let _db     = null;
let SQL     = null;
let _dbPath = null;
let _dirty  = false;
let _persistTimer = null;

/* ── Inicialización ──────────────────────────────────────────────────────── */
async function initDB() {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  _dbPath = path.resolve(cfg.db.path);
  const dbDir = path.dirname(_dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (fs.existsSync(_dbPath)) {
    const fileBuffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _db.run('PRAGMA foreign_keys = ON;');
  _db.run('PRAGMA synchronous = NORMAL;');

  const schemaPath = path.join(__dirname, '../../migrations/001_schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8')
      .split('\n')
      .filter(l => !l.trim().startsWith('PRAGMA journal_mode'))
      .join('\n');
    _db.run(schema);
  }

  // Timer de flush: escribe al disco si hay cambios cada 500ms
  _persistTimer = setInterval(() => {
    if (_dirty) persistDB();
  }, 500);
  _persistTimer.unref(); // no bloquear el event loop al cerrar

  // Flush inmediato al salir
  process.on('exit',    persistDB);
  process.on('SIGINT',  () => { persistDB(); process.exit(0); });
  process.on('SIGTERM', () => { persistDB(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    console.error('[DB] Excepción no capturada, guardando DB:', err.message);
    persistDB();
    process.exit(1);
  });

  console.log(`[DB] SQLite iniciado: ${_dbPath}`);
  return _db;
}

/* ── Persistencia ────────────────────────────────────────────────────────── */
function persistDB() {
  if (!_db || !_dbPath || !_dirty) return;
  try {
    const data = _db.export();
    const buf  = Buffer.from(data);
    const tmp  = _dbPath + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, _dbPath);
    _dirty = false;
  } catch (e) {
    console.error('[DB] Error al persistir:', e.message);
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getDB() {
  if (!_db) throw new Error('DB no inicializada. Llama a initDB() primero.');
  return _db;
}

/** SELECT — retorna array de objetos */
function query(sql, params = []) {
  const db   = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** INSERT / UPDATE / DELETE */
function run(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  _dirty = true;
  return { changes: db.getRowsModified() };
}

/** Retorna una sola fila o null */
function get(sql, params = []) {
  return query(sql, params)[0] ?? null;
}

/** Múltiples operaciones en una transacción atómica */
function transaction(fn) {
  const db = getDB();
  db.run('BEGIN');
  try {
    const result = fn(db);
    db.run('COMMIT');
    _dirty = true;
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

module.exports = { initDB, getDB, query, run, get, transaction, persistDB };
