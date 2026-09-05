import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Registro en memoria de addons conectados
const registeredAddons = {};

// 1. Registro y Heartbeat de Addons (Permite conectar múltiples addons: Economy, Claims, Clans, Quests, etc.)
router.post("/register", (req, res) => {
  const { addonId, name, version, capabilities } = req.body;
  if (!addonId) return res.status(400).json({ ok: false, error: "addonId requerido" });

  registeredAddons[addonId] = {
    addonId,
    name: name || addonId,
    version: version || "1.0.0",
    capabilities: capabilities || [],
    lastHeartbeat: Date.now(),
    status: "ONLINE"
  };

  broadcastWs("ADDON_STATUS", { addonId, status: "ONLINE", name });
  res.json({ ok: true, message: `Addon "${addonId}" registrado correctamente.` });
});

router.post("/heartbeat", (req, res) => {
  const { addonId, stats } = req.body;
  if (!addonId) return res.status(400).json({ ok: false, error: "addonId requerido" });

  if (!registeredAddons[addonId]) {
    registeredAddons[addonId] = { addonId, lastHeartbeat: Date.now(), status: "ONLINE" };
  } else {
    registeredAddons[addonId].lastHeartbeat = Date.now();
    registeredAddons[addonId].status = "ONLINE";
    if (stats) registeredAddons[addonId].stats = stats;
  }

  res.json({ ok: true, timestamp: Date.now() });
});

// Listar todos los addons conectados y su salud
router.get("/status", (req, res) => {
  const now = Date.now();
  const list = Object.values(registeredAddons).map(a => {
    const isAlive = (now - a.lastHeartbeat) < 60000; // 60s timeout
    return { ...a, status: isAlive ? "ONLINE" : "OFFLINE" };
  });
  res.json({ ok: true, addons: list });
});

// 2. Puente de Eventos Universal (Cualquier addon puede enviar eventos a la web)
router.post("/event", (req, res) => {
  const { addonId, event, player, data } = req.body;
  if (!event) return res.status(400).json({ ok: false, error: "Evento requerido" });

  // Si el evento incluye recompensas económicas directas
  if (data && data.rewardCoins && player) {
    const user = getOrCreateUser(player);
    const reward = Math.floor(Number(data.rewardCoins));
    if (reward > 0) {
      user.wallet = (user.wallet || 0) + reward;
      user.updatedAt = new Date().toISOString();
      if (!db.transactions) db.transactions = [];
      db.transactions.push({
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        type: "ADDON_REWARD",
        username: user.username,
        addonId: addonId || "custom_addon",
        amount: reward,
        reason: data.reason || event,
        timestamp: new Date().toISOString()
      });
      saveDb();
      broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
    }
  }

  // Notificar a todos los clientes web del evento
  broadcastWs("ADDON_EVENT", { addonId: addonId || "general", event, player, data, timestamp: Date.now() });
  res.json({ ok: true, received: true });
});

// 3. Obtener saldo de jugador desde Minecraft
router.get("/get-balance", (req, res) => {
  const player = (req.query.player || "").trim();
  if (!player) return res.status(400).json({ ok: false, error: "Gamertag requerido" });

  const user = getOrCreateUser(player);
  res.json({
    ok: true,
    username: user.displayName || user.username,
    wallet: Math.floor(user.wallet || 0),
    bank: Math.floor(user.bank || 0),
    total: Math.floor((user.wallet || 0) + (user.bank || 0))
  });
});

// 4. Sincronizar saldo desde el Scoreboard de Minecraft
router.post("/sync-balance", (req, res) => {
  const { player, balance } = req.body;
  if (!player || balance === undefined) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const user = getOrCreateUser(player);
  user.wallet = Math.max(0, Math.floor(Number(balance)));
  user.updatedAt = new Date().toISOString();
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({ ok: true, wallet: user.wallet });
});

// 5. Recompensa / Cobro Genérico de Economía para cualquier Addon
router.post("/economy/transaction", (req, res) => {
  const { player, amount, reason, addonId } = req.body;
  if (!player || amount === undefined) return res.status(400).json({ ok: false, error: "Parámetros incompletos" });

  const user = getOrCreateUser(player);
  const delta = Math.floor(Number(amount));

  if (delta < 0 && (user.wallet + delta < 0)) {
    return res.status(400).json({ ok: false, error: "Saldo insuficiente" });
  }

  user.wallet = Math.max(0, user.wallet + delta);
  user.updatedAt = new Date().toISOString();

  if (!db.transactions) db.transactions = [];
  db.transactions.push({
    id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: delta >= 0 ? "ADDON_REWARD" : "ADDON_CHARGE",
    username: user.username,
    addonId: addonId || "generic",
    amount: delta,
    reason: reason || "Transacción de Addon",
    timestamp: new Date().toISOString()
  });
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet });
  res.json({ ok: true, wallet: user.wallet, delta });
});

// 6. Entregas pendientes (Comandos a despachar en el servidor)
router.get("/pending-deliveries", (req, res) => {
  const player = (req.query.player || "").trim().toLowerCase();
  let pendings = player
    ? db.deliveries.filter(d => ((d.username || d.targetGamertag || "").toLowerCase() === player) && d.status === "PENDING")
    : db.deliveries.filter(d => d.status === "PENDING");

  // Filtrar comandos prohibidos de OP
  pendings = pendings.filter(d => {
    const cmd = (d.command || "").toLowerCase();
    return !cmd.startsWith("deop ") && !cmd.startsWith("op ") && !cmd.includes("rango op") && !cmd.includes("renta op") && !cmd.startsWith("gamemode s");
  });

  res.json({ ok: true, deliveries: pendings });
});

// 7. Confirmar entrega ejecutada exitosamente en Minecraft
router.post("/ack-delivery", (req, res) => {
  const { deliveryId } = req.body;
  if (!deliveryId) return res.status(400).json({ ok: false, error: "deliveryId requerido" });

  const item = db.deliveries.find(d => d.id === deliveryId);
  if (!item) return res.status(404).json({ ok: false, error: "Entrega no encontrada" });

  item.status = "DELIVERED";
  item.deliveredAt = new Date().toISOString();
  saveDb();

  broadcastWs("DELIVERY_UPDATED", item);
  res.json({ ok: true, delivery: item });
});

// 8. Sincronizar lista de jugadores activos
router.post("/sync-players", (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.status(400).json({ ok: false, error: "Formato de jugadores inválido" });

  let count = 0;
  for (const p of players) {
    const name = typeof p === "string" ? p : p.name;
    if (name) {
      getOrCreateUser(name);
      count++;
    }
  }
  res.json({ ok: true, synced: count });
});

// 9. Sincronizar estadísticas y títulos desde nodowa_titles_addon
router.post("/sync-stats", (req, res) => {
  const { player, stats } = req.body;
  if (!player || !stats) return res.status(400).json({ ok: false, error: "Parámetros incompletos" });

  const user = getOrCreateUser(player);
  const activeTitle = stats.activeTitle || user.selectedTitle || user.stats?.activeTitle || "Novato";
  const tier = stats.tier || user.stats?.tier || "NOVICIO";
  const equippedRank = stats.equippedRank || tier;

  user.selectedTitle = activeTitle;
  user.equippedRank = equippedRank;
  user.stats = {
    killsPvp: Number(stats.killsPvp || 0),
    killsTotalMobs: Number(stats.killsTotalMobs || 0),
    minedDiamond: Number(stats.minedDiamond || 0),
    minedDebris: Number(stats.minedDebris || 0),
    minedTotal: Number(stats.minedTotal || 0),
    activeTitle,
    activeTitleTag: stats.activeTitleTag || `[${activeTitle}]`,
    unlockedCount: Number(stats.unlockedCount || 0),
    tier,
    equippedRank,
    lastSyncedAt: new Date().toISOString()
  };
  user.updatedAt = new Date().toISOString();
  saveDb();

  broadcastWs("STATS_UPDATED", {
    username: user.username,
    selectedTitle: user.selectedTitle,
    equippedRank: user.equippedRank,
    stats: user.stats
  });
  res.json({ ok: true, stats: user.stats, selectedTitle: user.selectedTitle, equippedRank: user.equippedRank });
});

export default router;
