import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Consultar buzón de entregas de un jugador
router.get("/", (req, res) => {
  try {
    const uname = (req.query.username || "").trim().toLowerCase();
    let list = uname
      ? (db.deliveries || []).filter(d => (d.username || d.targetGamertag || "").toLowerCase() === uname)
      : (db.deliveries || []);

    // Excluir comandos residuales
    list = list.filter(d => {
      const cmd = (d.command || "").toLowerCase();
      return !cmd.startsWith("deop ") && !cmd.startsWith("op ") && !cmd.includes("rango op") && !cmd.includes("renta op") && !cmd.startsWith("gamemode s");
    });

    res.json({ ok: true, deliveries: list.slice(0, 50) });
  } catch (err) {
    console.error("[Deliveries] Error al obtener buzón:", err);
    res.status(500).json({ ok: false, error: err.message, deliveries: [] });
  }
});

// Reportar "No recibí mi producto"
router.post("/report-issue", (req, res) => {
  try {
    const { deliveryId, username, note } = req.body;
    if (!deliveryId) return res.status(400).json({ ok: false, error: "Identificador de entrega requerido" });

    const delivery = (db.deliveries || []).find(d => d.id === deliveryId);
    if (!delivery) return res.status(404).json({ ok: false, error: "Entrega no encontrada" });

    const player = (username || delivery.username || "Desconocido").trim();
    const cleanNote = (note || "").trim();

    delivery.reportedIssue = true;
    delivery.issueReportedAt = new Date().toISOString();
    delivery.issueNote = cleanNote;

    const issue = {
      id: "diss_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      deliveryId: delivery.id,
      player,
      itemTitle: delivery.itemTitle || "Artículo",
      command: delivery.command || "",
      note: cleanNote || "El jugador reportó que no recibió su producto en el juego.",
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(db.deliveryIssues)) db.deliveryIssues = [];
    db.deliveryIssues.unshift(issue);
    saveDb();

    broadcastWs("NEW_DELIVERY_ISSUE", issue);
    console.log(`[Reclamo] Jugador ${player} reportó no haber recibido: ${issue.itemTitle}`);

    res.json({ ok: true, message: "Reporte enviado al administrador exitosamente.", issue });
  } catch (err) {
    console.error("[Deliveries] Error al procesar reporte:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
