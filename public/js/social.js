// social.js — Jugadores, amigos y solicitudes de amistad
import { state } from './state.js';
import { showToast, openModal, escapeHtml } from './utils.js';

let currentSocialSubTab  = "players";
let currentPlayersFilter = "all";
let playersSearchTerm    = "";

export function loadSocial() {
  if (currentSocialSubTab === "players") {
    loadPlayers();
    loadFriendRequests();
  } else {
    const { loadConversations } = /** @type {any} */ (window.__chatModule);
    if (loadConversations) loadConversations();
  }
}

export function switchSocialSubTab(subTab) {
  currentSocialSubTab = subTab;
  const pBtn   = document.getElementById("subtab-players-btn");
  const cBtn   = document.getElementById("subtab-chat-btn");
  const pPanel = document.getElementById("social-panel-players");
  const cPanel = document.getElementById("social-panel-chat");

  if (pBtn)   pBtn.classList.toggle("active",   subTab === "players");
  if (cBtn)   cBtn.classList.toggle("active",   subTab === "chat");
  if (pPanel) pPanel.classList.toggle("active", subTab === "players");
  if (cPanel) cPanel.classList.toggle("active", subTab === "chat");

  if (subTab === "players") { loadPlayers(); loadFriendRequests(); }
  else {
    import('./chat.js').then(m => m.loadConversations());
  }
}

export function setPlayersFilter(filter) {
  currentPlayersFilter = filter;
  ["all","linked","unlinked","friends"].forEach(f => {
    const btn = document.getElementById(`filter-players-${f}`);
    if (btn) btn.classList.toggle("active", filter === f);
  });
  loadPlayers();
}

export function clearPlayersSearch() {
  const el = document.getElementById("players-search-input");
  if (el) el.value = "";
  playersSearchTerm = "";
  loadPlayers();
}

export async function loadPlayers() {
  const grid = document.getElementById("players-grid");
  if (!grid) return;
  try {
    const params = new URLSearchParams();
    if (playersSearchTerm)           params.append("search",      playersSearchTerm);
    if (currentPlayersFilter !== "all") params.append("filter",   currentPlayersFilter);
    if (state.currentUser)           params.append("currentUser", state.currentUser);

    const res  = await fetch(`/api/social/players?${params.toString()}`);
    const data = await res.json();
    if (data.ok) renderPlayers(data.players || []);
  } catch (err) {
    console.error("Error al cargar jugadores:", err);
  }
}

function renderPlayers(players) {
  const grid = document.getElementById("players-grid");
  if (!grid) return;

  if (players.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3>No se encontraron jugadores</h3>
        <p>Intenta con otro Gamertag o cambia de filtro.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = players.map(p => {
    const stats      = p.stats || {};
    const kills      = (stats.killsPvp   || 0).toLocaleString();
    const blocks     = (stats.minedTotal || 0).toLocaleString();
    const isFriend   = p.friendship === "friends";
    const isIncoming = p.friendship === "incoming";
    const isOutgoing = p.friendship === "outgoing";
    const isMe       = state.currentUser && (p.username.toLowerCase() === state.currentUser.toLowerCase());

    let actionBtnHtml = "";
    if (!state.currentUser) {
      actionBtnHtml = `<button type="button" class="btn btn-secondary btn-block" onclick="openModal('modal-login')">Conectar</button>`;
    } else if (isMe) {
      actionBtnHtml = `
        <button type="button" class="btn btn-secondary btn-block" onclick="openProfile('${p.username}')" style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Mi Perfil</span>
        </button>`;
    } else if (isFriend) {
      actionBtnHtml = `
        <button type="button" class="btn btn-primary" style="flex:2; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="openChatWith('${p.username}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </button>
        <button type="button" class="btn btn-danger-soft" style="flex:1; display:flex; align-items:center; justify-content:center;" onclick="removeFriend('${p.username}')" title="Eliminar Amigo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
    } else if (isIncoming) {
      actionBtnHtml = `
        <button type="button" class="btn btn-primary btn-block" onclick="loadFriendRequests()" style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Responder Solicitud</span>
        </button>`;
    } else if (isOutgoing) {
      actionBtnHtml = `
        <button type="button" class="btn btn-secondary btn-block" disabled style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Solicitud Enviada</span>
        </button>`;
    } else {
      actionBtnHtml = `
        <button type="button" class="btn btn-primary" style="flex:2; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="sendFriendRequest('${p.username}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Añadir</span>
        </button>
        <button type="button" class="btn btn-secondary" style="flex:1; display:flex; align-items:center; justify-content:center;" onclick="openChatWith('${p.username}')" title="Enviar Mensaje Directo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>`;
    }

    const isLinked  = !!p.linked;
    const cardClass = isLinked ? "player-card linked" : "player-card unlinked";
    const statusDot = isLinked
      ? `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--emerald); margin-left:4px; vertical-align:middle;" title="Vinculado a Bedrock"></span>`
      : `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--text-subtle); margin-left:4px; vertical-align:middle;" title="No vinculado"></span>`;

    return `
      <div class="${cardClass}">
        <div class="player-card-header" onclick="openProfile('${p.username}')" style="cursor:pointer;" title="Toca para ver el perfil completo de ${p.displayName}">
          <img src="${p.avatarUrl}" alt="${p.displayName}" class="player-card-avatar">
          <div class="player-card-info">
            <div class="player-card-name">${p.displayName}${statusDot}</div>
            <div class="player-card-title">${p.selectedTitle ? `[${p.selectedTitle}]` : (isLinked ? 'Jugador Bedrock' : 'Sin vincular')}</div>
          </div>
        </div>
        <div class="player-card-stats" onclick="openProfile('${p.username}')" style="cursor:pointer;">
          <div class="player-card-stat-item">PvP Kills: <strong>${kills}</strong></div>
          <div class="player-card-stat-item">Bloques: <strong>${blocks}</strong></div>
        </div>
        <div class="player-card-actions">${actionBtnHtml}</div>
      </div>
    `;
  }).join("");
}

export async function loadFriendRequests() {
  const { currentUser } = state;
  if (!currentUser) return;
  try {
    const res  = await fetch(`/api/social/friends/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const box  = document.getElementById("incoming-requests-box");
    const grid = document.getElementById("incoming-requests-grid");

    if (data.ok && data.incomingRequests && data.incomingRequests.length > 0) {
      if (box)  box.style.display = "block";
      if (grid) {
        grid.innerHTML = data.incomingRequests.map(r => `
          <div class="card" style="padding:0.85rem 1rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(r.sender)}/36" alt="${r.sender}" style="width:36px; height:36px; border-radius:50%;">
                <div>
                  <strong style="font-size:0.9rem;">${r.sender}</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Te envió solicitud</div>
                </div>
              </div>
              <div style="display:flex; gap:0.4rem;">
                <button class="btn btn-tiktok btn-sm" onclick="respondFriendRequest('${r.id}', 'ACCEPT')">Aceptar</button>
                <button class="btn btn-danger-soft btn-sm" onclick="respondFriendRequest('${r.id}', 'REJECT')">Rechazar</button>
              </div>
            </div>
          </div>
        `).join("");
      }
    } else {
      if (box) box.style.display = "none";
    }
  } catch (e) {
    console.error("Error al cargar solicitudes:", e);
  }
}

export async function sendFriendRequest(targetUsername) {
  const { currentUser } = state;
  if (!currentUser) return openModal("modal-login");
  try {
    const res  = await fetch("/api/social/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: currentUser, target: targetUsername })
    });
    const data = await res.json();
    if (data.ok) { showToast(data.message || "Solicitud de amistad enviada."); loadPlayers(); }
    else showToast(data.error || "No se pudo enviar la solicitud");
  } catch (e) { showToast("Error de conexión"); }
}

export async function respondFriendRequest(requestId, action) {
  const { currentUser } = state;
  if (!currentUser) return;
  try {
    const res  = await fetch("/api/social/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, requestId, action })
    });
    const data = await res.json();
    if (data.ok) { showToast(data.message); loadFriendRequests(); loadPlayers(); }
    else showToast(data.error || "Error al responder solicitud");
  } catch (e) { showToast("Error de conexión"); }
}

export async function removeFriend(friendUsername) {
  const { currentUser } = state;
  if (!currentUser) return;
  if (!confirm(`¿Eliminar a ${friendUsername} de tus amigos?`)) return;
  try {
    const res  = await fetch("/api/social/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, friendUsername })
    });
    const data = await res.json();
    if (data.ok) { showToast(data.message); loadPlayers(); }
    else showToast(data.error || "Error al eliminar");
  } catch (e) { showToast("Error de conexión"); }
}

export function viewOtherPlayerProfile(uname) {
  if (window.navigateTo) window.navigateTo('/' + encodeURIComponent(uname));
}

export function initSocial() {
  const searchInput = document.getElementById("players-search-input");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { playersSearchTerm = e.target.value.trim(); loadPlayers(); }, 250);
    });
  }

  window.viewOtherPlayerProfile = viewOtherPlayerProfile;
  window.switchSocialSubTab   = switchSocialSubTab;
  window.setPlayersFilter     = setPlayersFilter;
  window.clearPlayersSearch   = clearPlayersSearch;
  window.sendFriendRequest    = sendFriendRequest;
  window.respondFriendRequest = respondFriendRequest;
  window.removeFriend         = removeFriend;
  window.loadFriendRequests   = loadFriendRequests;
}

