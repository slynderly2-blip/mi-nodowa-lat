import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Obtener saldo de jugador desde Minecraft
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

// Sincronizar saldo desde el Scoreboard de Minecraft
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

// Obtener entregas pendientes para un jugador o globales
router.get("/pending-deliveries", (req, res) => {
  const player = (req.query.player || "").trim().toLowerCase();
  let pendings = player
    ? db.deliveries.filter(d => ((d.username || d.targetGamertag || "").toLowerCase() === player) && d.status === "PENDING")
    : db.deliveries.filter(d => d.status === "PENDING");

  // Filtrar comandos de OP/deop
  pendings = pendings.filter(d => {
    const cmd = (d.command || "").toLowerCase();
    return !cmd.startsWith("deop ") && !cmd.startsWith("op ") && !cmd.includes("rango op") && !cmd.includes("renta op") && !cmd.startsWith("gamemode s");
  });

  res.json({ ok: true, deliveries: pendings });
});

// Confirmar entrega ejecutada exitosamente en Minecraft
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

// Sincronizar lista de jugadores activos
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

export default router;
