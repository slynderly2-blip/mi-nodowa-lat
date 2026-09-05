import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";
import { getDefaultSchema } from "./defaultSchema.js";

const DB_FILE = path.join(CONFIG.DATA_DIR, "db.json");

// Asegurar existencia de directorios necesarios
if (!fs.existsSync(CONFIG.DATA_DIR)) fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG.UPLOADS_DIR)) fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });

export let db = getDefaultSchema(CONFIG.ADMIN_PASSWORD);

export function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(data);
      db = Object.assign(getDefaultSchema(CONFIG.ADMIN_PASSWORD), parsed);
    }
    // Asegurar siempre la contraseña administrativa configurada
    if (!db.config) db.config = {};
    db.config.adminPassword = CONFIG.ADMIN_PASSWORD;

    // Purgar tablas obsoletas
    delete db.staff;
    delete db.opRentals;

    // Normalizar arrays
    if (!Array.isArray(db.storeItems)) db.storeItems = [];
    if (!Array.isArray(db.p2pMarket)) db.p2pMarket = [];
    if (!Array.isArray(db.orders)) db.orders = [];
    if (!Array.isArray(db.deliveries)) db.deliveries = [];
    if (!Array.isArray(db.deliveryIssues)) db.deliveryIssues = [];
    if (!Array.isArray(db.transactions)) db.transactions = [];
    if (!Array.isArray(db.ratings)) db.ratings = [];
    if (typeof db.users !== "object" || db.users === null) db.users = {};
    if (typeof db.linkTokens !== "object" || db.linkTokens === null) db.linkTokens = {};

    // Normalizar entregas
    db.deliveries = db.deliveries.filter(d => {
      if (!d) return false;
      const cmd = (d.command || "").toLowerCase();
      if (cmd.startsWith("deop ") || cmd.startsWith("op ") || cmd.includes("rango op") || cmd.includes("renta op") || cmd.startsWith("gamemode s")) return false;
      return true;
    });

    for (const d of db.deliveries) {
      if (!d.username && d.targetGamertag) d.username = d.targetGamertag;
      if (!d.username) d.username = "Unknown";
    }

    console.log(`[Database] Cargado correctamente. Jugadores: ${Object.keys(db.users).length}, Artículos: ${db.storeItems.length}`);
  } catch (err) {
    console.error("[Database] Error al cargar db.json, usando esquema predeterminado:", err);
  }
}

export function saveDb() {
  try {
    const tempFile = DB_FILE + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("[Database] Error al guardar db.json:", err);
  }
}

// Carga inicial
loadDb();
