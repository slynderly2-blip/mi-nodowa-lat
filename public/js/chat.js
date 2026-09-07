// chat.js — Messenger: conversaciones, mensajes, borrar chat
import { state } from './state.js';
import { showToast, openModal, escapeHtml, formatChatTime } from './utils.js';

let activeChatPartner    = null;
let activeConversationId = null;

// ── Exponer referencia para social.js ──────────────────────────────────────
window.__chatModule = { loadConversations };

// ── Badge de mensajes no leídos ────────────────────────────────────────────
export function updateSocialBadge(count) {
  ["badge-social", "badge-social-mobile", "subtab-chat-badge"].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) { badge.style.display = "inline-block"; badge.textContent = count > 99 ? "99+" : count; }
    else             badge.style.display = "none";
  });
}

// ── Lista de conversaciones ────────────────────────────────────────────────
export async function loadConversations() {
  const { currentUser } = state;
  const listEl = document.getElementById("conversations-list");
  if (!listEl) return;

  if (!currentUser) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem 0.5rem; color: var(--text-muted);">
        <div style="font-size: 1.8rem; margin-bottom: 0.3rem;">💬</div>
        <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem;">Inicia sesión para chatear</div>
        <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-login')">Iniciar Sesión</button>
      </div>
    `;
    return;
  }

  try {
    const res  = await fetch(`/api/social/conversations/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (!data.ok) return;

    const convs      = data.conversations || [];
    let   totalUnread = 0;

    if (convs.length === 0) {
      listEl.innerHTML = `<div class="messenger-empty-threads">No tienes chats activos aún.<br><small style="color:var(--text-subtle);">Haz clic en "Buscar" para hablar con alguien.</small></div>`;
    } else {
      listEl.innerHTML = convs.map(c => {
        totalUnread += (c.unreadCount || 0);
        const isActive = activeChatPartner && activeChatPartner.toLowerCase() === c.partner.username.toLowerCase();
        const timeStr  = c.lastTimestamp ? formatChatTime(c.lastTimestamp) : "";
        return `
          <div class="thread-item ${isActive ? 'active' : ''}" onclick="openChatWith('${c.partner.username}')">
            <img src="${c.partner.avatarUrl}" alt="${c.partner.displayName}" class="thread-avatar">
            <div class="thread-info">
              <div class="thread-top">
                <span class="thread-name">${c.partner.displayName}</span>
                <span class="thread-time">${timeStr}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="thread-preview">${escapeHtml(c.lastMessage || '')}</span>
                ${c.unreadCount > 0 ? `<span class="thread-unread-badge">${c.unreadCount}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
    updateSocialBadge(totalUnread);
  } catch (e) {
    console.error("Error al cargar conversaciones:", e);
  }
}

// ── Abrir chat con un jugador ──────────────────────────────────────────────
export async function openChatWith(partnerUsername) {
  const { currentUser } = state;
  if (!currentUser) return openModal("modal-login");
  if (currentUser.toLowerCase() === partnerUsername.toLowerCase()) {
    return showToast("No puedes chatear contigo mismo.");
  }

  // Activar pestaña Comunidad
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "social"));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
  const viewSocial = document.getElementById("view-social");
  if (viewSocial) viewSocial.classList.add("active");

  const { switchSocialSubTab } = await import('./social.js');
  switchSocialSubTab("chat");

  activeChatPartner = partnerUsername;

  const messengerContainer = document.querySelector(".messenger-container");
  if (messengerContainer) messengerContainer.classList.add("mobile-chat-open");

  const emptyState = document.getElementById("chat-empty-state");
  const activeBox  = document.getElementById("chat-active-box");
  if (emptyState) emptyState.style.display = "none";
  if (activeBox)  activeBox.style.display  = "flex";

  document.getElementById("chat-active-name").textContent   = partnerUsername;
  document.getElementById("chat-active-status").textContent = "En línea";

  const avatarEl      = document.getElementById("chat-active-avatar");
  const existingThread= document.querySelector(`.thread-item img[alt="${partnerUsername}"]`);
  if (existingThread && existingThread.src && !existingThread.src.includes("mc-heads")) {
    avatarEl.src = existingThread.src;
  } else {
    avatarEl.src = `https://mc-heads.net/avatar/${encodeURIComponent(partnerUsername)}/40`;
    fetch(`/api/players/profile/${encodeURIComponent(partnerUsername)}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.user && d.user.avatarUrl) avatarEl.src = d.user.avatarUrl; })
      .catch(() => {});
  }

  await fetchChatMessages(partnerUsername);
  loadConversations();
}

export function closeChatMobile() {
  const mc = document.querySelector(".messenger-container");
  if (mc) mc.classList.remove("mobile-chat-open");
}

// ── Cargar mensajes ────────────────────────────────────────────────────────
async function fetchChatMessages(partnerUsername) {
  const body = document.getElementById("chat-messages-container");
  if (!body) return;
  try {
    const res  = await fetch(`/api/social/messages?user1=${encodeURIComponent(state.currentUser)}&user2=${encodeURIComponent(partnerUsername)}`);
    const data = await res.json();
    if (data.ok) {
      activeConversationId = data.conversationId;
      renderChatMessages(data.messages || []);
    }
  } catch (e) {
    console.error("Error al cargar mensajes:", e);
  }
}

function renderChatMessages(messages) {
  const body = document.getElementById("chat-messages-container");
  if (!body) return;

  if (messages.length === 0) {
    body.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin:auto; font-size:0.85rem;">Inicia la conversación saludando a <strong>${activeChatPartner}</strong>.</div>`;
    return;
  }

  body.innerHTML = messages.map(m => {
    const isMine = m.sender.toLowerCase() === state.currentUser.toLowerCase();
    const time   = formatChatTime(m.timestamp);
    return `
      <div class="chat-bubble-row ${isMine ? 'mine' : 'theirs'}" id="msg-${m.id}">
        <div class="chat-bubble">${escapeHtml(m.text)}</div>
        <div class="chat-bubble-meta">
          <span>${time}</span>
          ${isMine ? `<button class="chat-del-btn" onclick="deleteMessage('${m.id}')" title="Eliminar mensaje">&times;</button>` : ''}
        </div>
      </div>
    `;
  }).join("");

  body.scrollTop = body.scrollHeight;
}

export function appendChatMessage(message) {
  if (!message || !message.id) return;
  const body = document.getElementById("chat-messages-container");
  if (!body) return;
  if (document.getElementById(`msg-${message.id}`)) return; // evitar duplicados

  const isMine = message.sender.toLowerCase() === state.currentUser.toLowerCase();
  const time   = formatChatTime(message.timestamp);

  const row = document.createElement("div");
  row.className = `chat-bubble-row ${isMine ? 'mine' : 'theirs'}`;
  row.id        = `msg-${message.id}`;
  row.innerHTML = `
    <div class="chat-bubble">${escapeHtml(message.text)}</div>
    <div class="chat-bubble-meta">
      <span>${time}</span>
      ${isMine ? `<button class="chat-del-btn" onclick="deleteMessage('${message.id}')" title="Eliminar mensaje">&times;</button>` : ''}
    </div>
  `;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

// ── Eliminar mensaje ───────────────────────────────────────────────────────
export async function deleteMessage(messageId) {
  if (!state.currentUser || !activeChatPartner) return;
  try {
    const res  = await fetch(`/api/social/message/${messageId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: state.currentUser, partner: activeChatPartner })
    });
    const data = await res.json();
    if (data.ok) {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) el.remove();
      loadConversations();
    }
  } catch (e) {}
}

// ── Inicializar event listeners ────────────────────────────────────────────
export function initChat() {
  // Formulario enviar mensaje
  const chatForm = document.getElementById("chat-send-form");
  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.currentUser || !activeChatPartner) return;

      const input = document.getElementById("chat-text-input");
      const text  = (input.value || "").trim();
      if (!text) return;

      input.value = "";
      input.focus();

      try {
        const res  = await fetch("/api/social/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sender: state.currentUser, recipient: activeChatPartner, text })
        });
        const data = await res.json();
        if (data.ok && data.message) {
          appendChatMessage(data.message);
          loadConversations();
        } else {
          showToast(data.error || "No se pudo enviar el mensaje");
        }
      } catch (e) {
        showToast("Error de conexión al enviar mensaje");
      }
    });
  }

  // Borrar chat completo
  const btnClearChat = document.getElementById("btn-clear-active-chat");
  if (btnClearChat) {
    btnClearChat.onclick = async () => {
      if (!state.currentUser || !activeChatPartner) return;
      if (!confirm(`¿Estás seguro de que deseas borrar toda la conversación con ${activeChatPartner}?`)) return;
      try {
        const res  = await fetch("/api/social/chat", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: state.currentUser, partner: activeChatPartner })
        });
        const data = await res.json();
        if (data.ok) {
          showToast("Conversación borrada con éxito.");
          const body = document.getElementById("chat-messages-container");
          if (body) body.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin:auto; font-size:0.85rem;">Conversación eliminada.</div>`;
          loadConversations();
        } else {
          showToast(data.error || "Error al borrar chat");
        }
      } catch (e) { showToast("Error de conexión"); }
    };
  }

  // Ver perfil del partner
  const btnViewProfile = document.getElementById("btn-view-chat-profile");
  if (btnViewProfile) {
    btnViewProfile.onclick = () => {
      if (!activeChatPartner) return;
      import('./profile.js').then(m => m.openProfile(activeChatPartner));
    };
  }

  // Exponer globales
  window.openChatWith    = openChatWith;
  window.closeChatMobile = closeChatMobile;
  window.deleteMessage   = deleteMessage;

  // Para acceso desde websocket.js
  window.__chat = {
    activeChatPartner:    () => activeChatPartner,
    activeConversationId: () => activeConversationId,
    appendChatMessage,
    loadConversations,
    updateSocialBadge
  };
}
