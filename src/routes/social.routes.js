import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

function getConvId(u1, u2) {
  return [u1.trim().toLowerCase(), u2.trim().toLowerCase()].sort().join("::");
}

/**
 * Listar y buscar jugadores con filtros
 * GET /api/social/players?search=abc&filter=all|linked|friends&currentUser=xyz
 */
router.get("/players", (req, res) => {
  const search = (req.query.search || "").trim().toLowerCase();
  const filter = (req.query.filter || "all").toLowerCase();
  const currentUser = (req.query.currentUser || "").trim().toLowerCase();

  const userFriends = (currentUser && db.friends && db.friends[currentUser]) ? db.friends[currentUser] : [];
  const friendSet = new Set(userFriends.map(f => f.toLowerCase()));

  const pendingIncoming = new Set(
    (db.friendRequests || [])
      .filter(r => r.status === "PENDING" && r.target.toLowerCase() === currentUser)
      .map(r => r.sender.toLowerCase())
  );

  const pendingOutgoing = new Set(
    (db.friendRequests || [])
      .filter(r => r.status === "PENDING" && r.sender.toLowerCase() === currentUser)
      .map(r => r.target.toLowerCase())
  );

  const allUsers = Object.values(db.users || {});

  const list = allUsers
    .filter(u => {
      const uName = (u.username || "").toLowerCase();
      const dName = (u.displayName || "").toLowerCase();
      if (currentUser && uName === currentUser) return false; // No listarse a sí mismo

      // Filtro de búsqueda
      if (search && !uName.includes(search) && !dName.includes(search)) {
        return false;
      }

      // Filtros de categoría
      if (filter === "linked" && !u.linked) return false;
      if (filter === "friends" && !friendSet.has(uName)) return false;

      return true;
    })
    .map(u => {
      const uName = (u.username || "").toLowerCase();
      let friendship = "none";
      if (friendSet.has(uName)) friendship = "friends";
      else if (pendingIncoming.has(uName)) friendship = "incoming";
      else if (pendingOutgoing.has(uName)) friendship = "outgoing";

      return {
        username: u.username,
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarUrl || `https://mc-heads.net/avatar/${u.displayName || u.username}/64`,
        linked: !!u.linked,
        wallet: u.wallet || 0,
        stats: u.stats || {},
        selectedTitle: u.selectedTitle || null,
        friendship
      };
    });

  res.json({ ok: true, players: list });
});

/**
 * Obtener amigos y solicitudes de un usuario
 * GET /api/social/friends/:username
 */
router.get("/friends/:username", (req, res) => {
  const username = (req.params.username || "").trim().toLowerCase();
  if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido" });

  const friendsList = (db.friends && db.friends[username]) || [];
  const incoming = (db.friendRequests || []).filter(
    r => r.status === "PENDING" && r.target.toLowerCase() === username
  );
  const outgoing = (db.friendRequests || []).filter(
    r => r.status === "PENDING" && r.sender.toLowerCase() === username
  );

  // Mapear info de los amigos
  const fullFriends = friendsList.map(fName => {
    const u = db.users[fName.toLowerCase()] || { username: fName, displayName: fName };
    return {
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: u.avatarUrl || `https://mc-heads.net/avatar/${u.displayName || u.username}/64`,
      linked: !!u.linked,
      selectedTitle: u.selectedTitle || null
    };
  });

  res.json({
    ok: true,
    friends: fullFriends,
    incomingRequests: incoming,
    outgoingRequests: outgoing
  });
});

/**
 * Enviar solicitud de amistad
 * POST /api/social/friends/request
 */
router.post("/friends/request", (req, res) => {
  const { sender, target } = req.body;
  if (!sender || !target) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const sLower = sender.trim().toLowerCase();
  const tLower = target.trim().toLowerCase();

  if (sLower === tLower) {
    return res.status(400).json({ ok: false, error: "No puedes enviarte solicitud a ti mismo." });
  }

  // Verificar si ya son amigos
  if (db.friends && db.friends[sLower] && db.friends[sLower].includes(tLower)) {
    return res.status(400).json({ ok: false, error: "Ya son amigos." });
  }

  if (!Array.isArray(db.friendRequests)) db.friendRequests = [];

  // Comprobar si ya hay una solicitud pendiente
  const existing = db.friendRequests.find(
    r => r.status === "PENDING" &&
    ((r.sender.toLowerCase() === sLower && r.target.toLowerCase() === tLower) ||
     (r.sender.toLowerCase() === tLower && r.target.toLowerCase() === sLower))
  );

  if (existing) {
    // Si la otra persona ya me había mandado una solicitud, auto-aceptarla
    if (existing.sender.toLowerCase() === tLower) {
      existing.status = "ACCEPTED";
      if (!db.friends) db.friends = {};
      if (!Array.isArray(db.friends[sLower])) db.friends[sLower] = [];
      if (!Array.isArray(db.friends[tLower])) db.friends[tLower] = [];

      if (!db.friends[sLower].includes(tLower)) db.friends[sLower].push(tLower);
      if (!db.friends[tLower].includes(sLower)) db.friends[tLower].push(sLower);

      saveDb();
      broadcastWs("FRIEND_ACCEPTED", { user1: sLower, user2: tLower });
      return res.json({ ok: true, status: "ACCEPTED", message: `¡Ahora eres amigo de ${target}!` });
    }
    return res.status(400).json({ ok: false, error: "Ya existe una solicitud pendiente entre ambos." });
  }

  const newRequest = {
    id: "freq_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    sender: sLower,
    target: tLower,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  db.friendRequests.unshift(newRequest);
  saveDb();

  broadcastWs("FRIEND_REQUEST", newRequest);
  res.json({ ok: true, status: "PENDING", message: `Solicitud enviada a ${target}.` });
});

/**
 * Responder solicitud de amistad (Aceptar / Rechazar)
 * POST /api/social/friends/respond
 */
router.post("/friends/respond", (req, res) => {
  const { username, requestId, action } = req.body;
  if (!username || !requestId || !action) {
    return res.status(400).json({ ok: false, error: "Datos incompletos" });
  }

  const uLower = username.trim().toLowerCase();
  const reqIdx = (db.friendRequests || []).findIndex(
    r => r.id === requestId && r.target.toLowerCase() === uLower && r.status === "PENDING"
  );

  if (reqIdx < 0) {
    return res.status(404).json({ ok: false, error: "Solicitud no encontrada o ya procesada." });
  }

  const request = db.friendRequests[reqIdx];
  const sLower = request.sender.toLowerCase();

  if (action === "ACCEPT") {
    request.status = "ACCEPTED";
    if (!db.friends) db.friends = {};
    if (!Array.isArray(db.friends[uLower])) db.friends[uLower] = [];
    if (!Array.isArray(db.friends[sLower])) db.friends[sLower] = [];

    if (!db.friends[uLower].includes(sLower)) db.friends[uLower].push(sLower);
    if (!db.friends[sLower].includes(uLower)) db.friends[sLower].push(uLower);

    saveDb();
    broadcastWs("FRIEND_ACCEPTED", { user1: uLower, user2: sLower });
    return res.json({ ok: true, message: `¡Solicitud aceptada! Ahora son amigos.` });
  } else {
    // RECHAZAR / ELIMINAR
    db.friendRequests.splice(reqIdx, 1);
    saveDb();
    broadcastWs("FRIEND_REJECTED", { requestId, target: uLower });
    return res.json({ ok: true, message: "Solicitud rechazada." });
  }
});

/**
 * Eliminar amigo
 * POST /api/social/friends/remove
 */
router.post("/friends/remove", (req, res) => {
  const { username, friendUsername } = req.body;
  if (!username || !friendUsername) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const uLower = username.trim().toLowerCase();
  const fLower = friendUsername.trim().toLowerCase();

  if (db.friends && db.friends[uLower]) {
    db.friends[uLower] = db.friends[uLower].filter(f => f.toLowerCase() !== fLower);
  }
  if (db.friends && db.friends[fLower]) {
    db.friends[fLower] = db.friends[fLower].filter(f => f.toLowerCase() !== uLower);
  }

  saveDb();
  broadcastWs("FRIEND_REMOVED", { user1: uLower, user2: fLower });
  res.json({ ok: true, message: `Amistad eliminada.` });
});

/* ============================================================
   SISTEMA DE CHAT ESTILO MESSENGER
   ============================================================ */

/**
 * Listar conversaciones activas de un usuario
 * GET /api/social/conversations/:username
 */
router.get("/conversations/:username", (req, res) => {
  const username = (req.params.username || "").trim().toLowerCase();
  if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido" });

  if (!db.chats) db.chats = {};

  const convList = [];

  for (const [convId, messages] of Object.entries(db.chats)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    const parts = convId.split("::");
    if (!parts.includes(username)) continue;

    const partnerUsername = parts[0] === username ? parts[1] : parts[0];
    const partnerUser = db.users[partnerUsername] || { username: partnerUsername, displayName: partnerUsername };

    const lastMsg = messages[messages.length - 1];
    const unreadCount = messages.filter(m => m.recipient.toLowerCase() === username && !m.read).length;

    convList.push({
      conversationId: convId,
      partner: {
        username: partnerUser.username,
        displayName: partnerUser.displayName || partnerUser.username,
        avatarUrl: partnerUser.avatarUrl || `https://mc-heads.net/avatar/${partnerUser.displayName || partnerUser.username}/64`,
        linked: !!partnerUser.linked
      },
      lastMessage: lastMsg.text,
      lastTimestamp: lastMsg.timestamp,
      lastSender: lastMsg.sender,
      unreadCount
    });
  }

  // Ordenar por mensaje más reciente
  convList.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));

  res.json({ ok: true, conversations: convList });
});

/**
 * Obtener historial de mensajes entre dos usuarios
 * GET /api/social/messages?user1=...&user2=...
 */
router.get("/messages", (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ ok: false, error: "Usuarios requeridos" });

  const u1Lower = user1.trim().toLowerCase();
  const u2Lower = user2.trim().toLowerCase();
  const convId = getConvId(u1Lower, u2Lower);

  if (!db.chats) db.chats = {};
  if (!Array.isArray(db.chats[convId])) db.chats[convId] = [];

  // Marcar como leídos los mensajes que envió user2 a user1
  let updatedRead = false;
  db.chats[convId].forEach(m => {
    if (m.recipient.toLowerCase() === u1Lower && !m.read) {
      m.read = true;
      updatedRead = true;
    }
  });

  if (updatedRead) saveDb();

  const partnerUser = db.users[u2Lower] || { username: u2Lower, displayName: u2Lower };

  res.json({
    ok: true,
    conversationId: convId,
    partner: {
      username: partnerUser.username,
      displayName: partnerUser.displayName || partnerUser.username,
      avatarUrl: partnerUser.avatarUrl || `https://mc-heads.net/avatar/${partnerUser.displayName || partnerUser.username}/64`,
      linked: !!partnerUser.linked
    },
    messages: db.chats[convId]
  });
});

/**
 * Enviar mensaje
 * POST /api/social/message
 */
router.post("/message", (req, res) => {
  const { sender, recipient, text } = req.body;
  if (!sender || !recipient || !text || !text.trim()) {
    return res.status(400).json({ ok: false, error: "Contenido del mensaje no válido" });
  }

  const sLower = sender.trim().toLowerCase();
  const rLower = recipient.trim().toLowerCase();
  const convId = getConvId(sLower, rLower);

  if (!db.chats) db.chats = {};
  if (!Array.isArray(db.chats[convId])) db.chats[convId] = [];

  const cleanText = text.trim().slice(0, 1000); // Límite seguro

  const newMsg = {
    id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    sender: sLower,
    recipient: rLower,
    text: cleanText,
    timestamp: new Date().toISOString(),
    read: false
  };

  db.chats[convId].push(newMsg);

  // Mantener historial a máximo 500 mensajes
  if (db.chats[convId].length > 500) {
    db.chats[convId] = db.chats[convId].slice(-500);
  }

  saveDb();

  broadcastWs("CHAT_MESSAGE", {
    conversationId: convId,
    message: newMsg
  });

  res.json({ ok: true, message: newMsg });
});

/**
 * Borrar chat completo (Función similar a Messenger)
 * DELETE /api/social/chat
 */
router.delete("/chat", (req, res) => {
  const { username, partner } = req.body;
  if (!username || !partner) return res.status(400).json({ ok: false, error: "Datos incompletos" });

  const uLower = username.trim().toLowerCase();
  const pLower = partner.trim().toLowerCase();
  const convId = getConvId(uLower, pLower);

  if (db.chats && db.chats[convId]) {
    db.chats[convId] = [];
    saveDb();
  }

  broadcastWs("CHAT_CLEARED", {
    conversationId: convId,
    clearedBy: uLower
  });

  res.json({ ok: true, message: "Conversación eliminada con éxito." });
});

/**
 * Borrar mensaje individual
 * DELETE /api/social/message/:id
 */
router.delete("/message/:id", (req, res) => {
  const { id } = req.params;
  const { username, partner } = req.body;

  if (!id || !username || !partner) {
    return res.status(400).json({ ok: false, error: "Datos incompletos" });
  }

  const uLower = username.trim().toLowerCase();
  const pLower = partner.trim().toLowerCase();
  const convId = getConvId(uLower, pLower);

  if (!db.chats || !Array.isArray(db.chats[convId])) {
    return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
  }

  const msgIdx = db.chats[convId].findIndex(m => m.id === id);
  if (msgIdx < 0) return res.status(404).json({ ok: false, error: "Mensaje no encontrado" });

  const msg = db.chats[convId][msgIdx];
  if (msg.sender.toLowerCase() !== uLower) {
    return res.status(403).json({ ok: false, error: "Solo puedes borrar tus propios mensajes" });
  }

  db.chats[convId].splice(msgIdx, 1);
  saveDb();

  broadcastWs("CHAT_MESSAGE_DELETED", {
    conversationId: convId,
    messageId: id
  });

  res.json({ ok: true, message: "Mensaje eliminado." });
});

export default router;
