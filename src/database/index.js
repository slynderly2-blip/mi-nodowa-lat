import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";
import { getDefaultSchema } from "./defaultSchema.js";

const DB_FILE = path.join(CONFIG.DATA_DIR, "db.json");
const BACKUP_FILE = path.join(CONFIG.DATA_DIR, "db.backup.json");

// Asegurar existencia de directorios necesarios
if (!fs.existsSync(CONFIG.DATA_DIR)) fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG.UPLOADS_DIR)) fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });

export let db = getDefaultSchema(CONFIG.ADMIN_PASSWORD);

// Estado del motor de base de datos de alta concurrencia
let isDirty = false;
let isSaving = false;
let saveTimer = null;

export function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(data);
      db = Object.assign(getDefaultSchema(CONFIG.ADMIN_PASSWORD), parsed);

      // Crear copia de respaldo automática en frío
      try {
        fs.copyFileSync(DB_FILE, BACKUP_FILE);
      } catch (_) {}
    }

    if (!db.config) db.config = {};
    db.config.adminPassword = CONFIG.ADMIN_PASSWORD;

    // Inicializar colecciones para alto rendimiento
    if (!Array.isArray(db.storeItems)) db.storeItems = [];
    if (!Array.isArray(db.p2pMarket)) db.p2pMarket = [];
    if (!Array.isArray(db.orders)) db.orders = [];
    if (!Array.isArray(db.deliveries)) db.deliveries = [];
    if (!Array.isArray(db.deliveryIssues)) db.deliveryIssues = [];
    if (!Array.isArray(db.transactions)) db.transactions = [];
    if (!Array.isArray(db.ratings)) db.ratings = [];
    if (typeof db.users !== "object" || db.users === null) db.users = {};
    if (typeof db.linkTokens !== "object" || db.linkTokens === null) db.linkTokens = {};
    if (typeof db.sessions !== "object" || db.sessions === null) db.sessions = {};
    if (typeof db.friends !== "object" || db.friends === null) db.friends = {};
    if (!Array.isArray(db.friendRequests)) db.friendRequests = [];
    if (typeof db.chats !== "object" || db.chats === null) db.chats = {};

    console.log(`[Database] Motor de alto rendimiento inicializado. Jugadores: ${Object.keys(db.users).length}, Publicaciones P2P: ${db.p2pMarket.length}`);
  } catch (err) {
    console.error("[Database] Error al cargar db.json, usando esquema predeterminado:", err);
  }
}

/**
 * Guardado no bloqueante con debounce y cola atómica para soportar cientos de consultas por segundo
 */
export function saveDb() {
  isDirty = true;
  if (saveTimer) return; // Ya hay un flush programado

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await flushDb();
  }, 150); // Flush cada 150ms máximo
}

/**
 * Flush atómico asíncrono a disco
 */
export async function flushDb() {
  if (!isDirty || isSaving) return;
  isSaving = true;
  isDirty = false;

  const tempFile = DB_FILE + ".tmp";
  try {
    const serialized = JSON.stringify(db, null, 2);
    await fs.promises.writeFile(tempFile, serialized, "utf8");
    await fs.promises.rename(tempFile, DB_FILE);
  } catch (err) {
    console.error("[Database] Error en flush atómico:", err);
    isDirty = true; // Reintentar en siguiente ciclo
  } finally {
    isSaving = false;
    // Si hubo escrituras mientras se guardaba, reprogramar
    if (isDirty) {
      saveDb();
    }
  }
}

/**
 * Guardado síncrono inmediato para momentos críticos (ej. cierre de proceso)
 */
export function saveDbImmediate() {
  try {
    const tempFile = DB_FILE + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tempFile, DB_FILE);
    isDirty = false;
  } catch (err) {
    console.error("[Database] Error en saveDbImmediate:", err);
  }
}

// Asegurar persistencia limpia al apagar el proceso
process.on("SIGINT", () => {
  saveDbImmediate();
  process.exit(0);
});
process.on("SIGTERM", () => {
  saveDbImmediate();
  process.exit(0);
});

// Carga inicial
loadDb();
