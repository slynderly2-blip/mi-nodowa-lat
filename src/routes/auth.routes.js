import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser } from "../services/economy.js";

const router = Router();

// Solicitar código de vinculación con Minecraft (válido por 15 minutos)
router.post("/request-link", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Ingresa tu Gamertag" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const uname = username.trim().toLowerCase();

  db.linkTokens[code] = {
    username: uname,
    createdAt: Date.now(),
    expiresAt: Date.now() + (15 * 60 * 1000)
  };
  saveDb();

  res.json({
    ok: true,
    code,
    command: `!link ${code}`,
    expiresInSeconds: 900
  });
});

// Login directo con Gamertag
router.post("/login", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Gamertag requerido" });

  const user = getOrCreateUser(username);
  res.json({ ok: true, user });
});

export default router;
