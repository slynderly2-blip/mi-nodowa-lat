import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// ── Mensajes no leídos (para badge) ──────────────────────────────────────────
router.get("/unread-count/:username", (req, res) => {
  const uname = (req.params.username || "").trim().toLowerCase();
  if (!uname) return res.status(400).json({ ok: false, count: 0 });

  const count = (db.messages || []).filter(
    m => (m.to || "").toLowerCase() === uname && !m.readAt
  ).length;

  res.json({ ok: true, count });
});

// ── Leer todos los mensajes del usuario ───────────────────────────────────────
router.get("/:username", (req, res) => {
  const uname = (req.params.username || "").trim().toLowerCase();
  if (!uname) return res.status(400).json({ ok: false, messages: [] });

  const msgs = (db.messages || [])
    .filter(m => (m.to || "").toLowerCase() === uname)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100);

  res.json({ ok: true, messages: msgs });
});

// ── Marcar mensajes como leídos ───────────────────────────────────────────────
router.post("/read", (req, res) => {
  const { username, messageIds } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido" });

  const uname = username.trim().toLowerCase();
  const now   = new Date().toISOString();
  const ids   = Array.isArray(messageIds) ? messageIds : null; // null = marcar todos

  let count = 0;
  for (const m of (db.messages || [])) {
    if ((m.to || "").toLowerCase() !== uname) continue;
    if (m.readAt) continue;
    if (ids && !ids.includes(m.id)) continue;
    m.readAt = now;
    count++;
  }

  if (count > 0) saveDb();
  res.json({ ok: true, marked: count });
});

// ── Eliminar (descartar) un mensaje ──────────────────────────────────────────
router.delete("/:messageId", (req, res) => {
  const { messageId } = req.params;
  const { username }  = req.query;
  if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido" });

  const uname  = username.trim().toLowerCase();
  const before = (db.messages || []).length;
  db.messages  = (db.messages || []).filter(
    m => !(m.id === messageId && (m.to || "").toLowerCase() === uname)
  );
  const removed = before - db.messages.length;
  if (removed > 0) saveDb();
  res.json({ ok: true, removed });
});

export default router;
