'use strict';
/**
 * src/config/database.js
 * Conexión SQLite usando sql.js (puro WebAssembly, sin compilación nativa)
 * Sincrónico, WAL mode para mayor rendimiento concurrente.
 */

const path = require('path');
const fs   = require('fs');
const cfg  = require('./index');

let _db   = null;
let SQL   = null;
let _dbPath = null;

/**
 * Inicializa la base de datos SQLite.
 * Aplica el schema si la DB es nueva.
 */
async function initDB() {
  if (_db) return _db;

  // sql.js debe cargarse async
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  _dbPath = path.resolve(cfg.db.path);
  const dbDir = path.dirname(_dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  // Cargar DB existente o crear nueva
  if (fs.existsSync(_dbPath)) {
    const fileBuffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  // Aplicar pragmas y schema
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

  // Auto-guardar en disco cada 5 segundos
  const persistTimer = setInterval(persistDB, 5000);
  if (persistTimer.unref) persistTimer.unref();
  // Guardar al salir
  process.on('beforeExit', persistDB);
  process.on('SIGINT',     () => { try { persistDB(); } catch (_) {} process.exit(0); });
  process.on('SIGTERM',    () => { try { persistDB(); } catch (_) {} process.exit(0); });

  console.log(`[DB] SQLite iniciado: ${_dbPath}`);
  return _db;
}

function persistDB() {
  if (!_db || !_dbPath) return;
  try {
    const data = _db.export();
    const buf  = Buffer.from(data);
    // Escritura atómica: escribir temp, luego renombrar
    const tmp = _dbPath + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, _dbPath);
  } catch (e) {
    console.error('[DB] Error al persistir:', e.message);
  }
}

/**
 * Obtiene la instancia DB (debe llamarse después de initDB())
 */
function getDB() {
  if (!_db) throw new Error('DB no inicializada. Llama a initDB() primero.');
  return _db;
}

// ── Helpers de query ─────────────────────────────────────────────────────────

/**
 * Ejecuta un SELECT y retorna array de objetos
 * @param {string} sql
 * @param {any[]} params
 */
function query(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Ejecuta INSERT/UPDATE/DELETE
 */
function run(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  // Retorna { changes, lastInsertRowid } aprox.
  const changes = db.getRowsModified();
  return { changes };
}

/**
 * Retorna una sola fila o null
 */
function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] ?? null;
}

/**
 * Ejecuta múltiples statements en una transacción
 */
function transaction(fn) {
  const db = getDB();
  db.run('BEGIN');
  try {
    const result = fn(db);
    db.run('COMMIT');
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

module.exports = { initDB, getDB, query, run, get, transaction, persistDB };
