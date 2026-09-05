import { WebSocketServer, WebSocket } from "ws";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser } from "./economy.js";

let wss = null;

export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        handleWsMessage(ws, data);
      } catch (_) {}
    });
  });

  // Keep-alive heartbeat cada 30 segundos
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));
  console.log("[WebSocket] Servidor en tiempo real inicializado.");
  return wss;
}

function handleWsMessage(ws, data) {
  if (data.type === "LINK_VERIFY") {
    const code = (data.code || "").trim();
    const tokenData = db.linkTokens[code];
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      return ws.send(JSON.stringify({ type: "LINK_ERROR", message: "Código inválido o expirado" }));
    }

    const player = data.player || "Player";
    const user = getOrCreateUser(tokenData.username);
    user.linked = true;
    user.linkedAt = new Date().toISOString();
    user.displayName = player;
    delete db.linkTokens[code];
    saveDb();

    ws.send(JSON.stringify({ type: "LINK_SUCCESS", player, username: user.username }));
    broadcastWs("USER_LINKED", { username: user.username, user });
  } else if (data.type === "POLL_DELIVERIES") {
    const uname = (data.player || "").trim().toLowerCase();
    const pendings = (db.deliveries || []).filter(d => {
      const u = (d.username || d.targetGamertag || "").toLowerCase();
      return u === uname && d.status === "PENDING";
    });
    ws.send(JSON.stringify({ type: "DELIVERIES_RESULT", player: data.player, deliveries: pendings }));
  }
}

export function broadcastWs(type, payload = {}) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...payload, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
