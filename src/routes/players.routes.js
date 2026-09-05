import { Router } from "express";
import { db, saveDb } from "../database/index.js";

const router = Router();

// Directorio público de jugadores
router.get("/public", (req, res) => {
  try {
    const search = (req.query.search || "").trim().toLowerCase();
    const status = req.query.status || "all";

    if (!Array.isArray(db.ratings)) db.ratings = [];

    let list = Object.values(db.users || {}).map(u => {
      const uname = (u.username || u.displayName || "").toLowerCase();
      const userRatings = db.ratings.filter(r => (r.targetUser || "").toLowerCase() === uname);
      const reviews = userRatings.filter(r => r.type === "REVIEW");
      const avgStars = reviews.length > 0
        ? (reviews.reduce((s, r) => s + Number(r.stars || 0), 0) / reviews.length).toFixed(1)
        : null;
      const totalFortune = Math.floor((u.wallet || 0) + (u.bank || 0));

      return {
        username: u.displayName || u.username,
        cleanUsername: uname,
        wallet: Math.floor(u.wallet || 0),
        bank: Math.floor(u.bank || 0),
        totalFortune,
        linked: !!(u.linked || u.linkedAt),
        rating: {
          avgStars: avgStars ? Number(avgStars) : null,
          totalReviews: reviews.length,
          totalReports: userRatings.filter(r => r.type === "REPORT").length
        }
      };
    });

    if (search) list = list.filter(p => p.username.toLowerCase().includes(search));
    if (status === "linked") list = list.filter(p => p.linked);
    if (status === "unlinked") list = list.filter(p => !p.linked);

    // Ordenar por fortuna descendente por defecto
    list.sort((a, b) => b.totalFortune - a.totalFortune);

    res.json({ ok: true, players: list.slice(0, 100) });
  } catch (err) {
    console.error("[Players] Error al listar jugadores:", err);
    res.status(500).json({ ok: false, error: err.message, players: [] });
  }
});

// Ranking Top Ricos
router.get("/leaderboard", (req, res) => {
  const top = Object.values(db.users || {})
    .map(u => ({
      username: u.displayName || u.username,
      wallet: Math.floor(u.wallet || 0),
      bank: Math.floor(u.bank || 0),
      total: Math.floor((u.wallet || 0) + (u.bank || 0))
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  res.json({ ok: true, leaderboard: top });
});

// Reseñas de un jugador
router.get("/reviews/:username", (req, res) => {
  const uname = req.params.username.trim().toLowerCase();
  const userRatings = (db.ratings || []).filter(r => (r.targetUser || "").toLowerCase() === uname);
  const reviews = userRatings.filter(r => r.type === "REVIEW");
  const avgStars = reviews.length > 0
    ? (reviews.reduce((s, r) => s + Number(r.stars || 0), 0) / reviews.length).toFixed(1)
    : null;

  res.json({
    ok: true,
    targetUser: req.params.username,
    avgStars: avgStars ? Number(avgStars) : null,
    totalReviews: reviews.length,
    reviews,
    reportsCount: userRatings.filter(r => r.type === "REPORT").length
  });
});

// Publicar reseña o reporte sobre un jugador
router.post("/reviews/submit", (req, res) => {
  const { author, targetUser, stars, comment, type } = req.body;
  if (!author || !targetUser) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  if (author.toLowerCase() === targetUser.toLowerCase()) {
    return res.status(400).json({ ok: false, error: "No puedes calificarte a ti mismo." });
  }

  const reviewType = type === "REPORT" ? "REPORT" : "REVIEW";
  const numStars = Math.max(1, Math.min(5, Math.floor(Number(stars) || 5)));

  const review = {
    id: "rev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    author: author.trim(),
    targetUser: targetUser.trim().toLowerCase(),
    stars: numStars,
    comment: (comment || "").trim(),
    type: reviewType,
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(db.ratings)) db.ratings = [];
  db.ratings.unshift(review);
  saveDb();

  res.json({ ok: true, message: reviewType === "REPORT" ? "Reporte registrado para revisión." : "¡Gracias por tu reseña!", review });
});

// Obtener perfil completo con estadísticas y títulos RPG
router.get("/profile/:username", (req, res) => {
  const uname = req.params.username.trim().toLowerCase();
  const user = db.users[uname];
  if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

  const defaultStats = {
    killsPvp: 0,
    killsTotalMobs: 0,
    minedDiamond: 0,
    minedDebris: 0,
    minedTotal: 0,
    activeTitle: "Novato",
    unlockedCount: 0,
    tier: "NOVICIO"
  };

  const stats = user.stats || defaultStats;
  const avatarUrl = user.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(user.displayName || user.username)}/100`;

  res.json({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName || user.username,
      wallet: Math.floor(user.wallet || 0),
      bank: Math.floor(user.bank || 0),
      totalFortune: Math.floor((user.wallet || 0) + (user.bank || 0)),
      linked: !!(user.linked || user.linkedAt),
      avatarUrl,
      stats
    }
  });
});

// Actualizar avatar de perfil
router.post("/avatar", (req, res) => {
  const { username, avatarUrl } = req.body;
  if (!username || !avatarUrl) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const uname = username.trim().toLowerCase();
  const user = db.users[uname];
  if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

  user.avatarUrl = avatarUrl;
  user.updatedAt = new Date().toISOString();
  saveDb();

  res.json({ ok: true, avatarUrl: user.avatarUrl, message: "Foto de perfil actualizada con éxito." });
});

export default router;
