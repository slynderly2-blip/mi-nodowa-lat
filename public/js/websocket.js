// websocket.js — WebSocket en tiempo real (reconexión automática)
import { state } from './state.js';
import { showToast } from './utils.js';
import { completeAuth } from './auth.js';

let wsInstance = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

export function initWS() {
  if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws;
  try {
    ws = new WebSocket(`${protocol}//${location.host}`);
    wsInstance = ws;
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
  };

  ws.onerror = (e) => {
    // Manejo de error silencioso para proxies o reversas que no soporten WS
  };

  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      const eventType = msg.type || msg.event;

      if (eventType === 'USER_LINKED') {
        const isTarget =
          (state.pendingSessionToken && msg.sessionToken === state.pendingSessionToken) ||
          (state.pendingAuthUsername && (
            (msg.username && msg.username.toLowerCase() === state.pendingAuthUsername.toLowerCase()) ||
            (msg.displayName && msg.displayName.toLowerCase() === state.pendingAuthUsername.toLowerCase())
          ));
        if (isTarget && msg.user) {
          completeAuth(msg.user, msg.welcomeBonus || 0);
        }
      }

      else if (eventType === 'STORE_UPDATED') {
        const { loadStore } = await import('./store.js');
        loadStore();
      }

      else if (eventType === 'STATS_UPDATED' && state.currentUser &&
        msg.username?.toLowerCase() === state.currentUser.toLowerCase()) {
        const stats = msg.stats || {};
        const pPvp = document.getElementById('profile-stat-pvp');
        if (pPvp) pPvp.textContent = (stats.killsPvp || 0).toLocaleString();
        const pMobs = document.getElementById('profile-stat-mobs');
        if (pMobs) pMobs.textContent = (stats.killsTotalMobs || 0).toLocaleString();
        const pDia = document.getElementById('profile-stat-diamond');
        if (pDia) pDia.textContent = (stats.minedDiamond || 0).toLocaleString();
        const pMin = document.getElementById('profile-stat-mined');
        if (pMin) pMin.textContent = (stats.minedTotal || 0).toLocaleString();
        const pTier = document.getElementById('profile-tier-badge');
        if (pTier) pTier.textContent = msg.equippedRank || stats.equippedRank || stats.tier || 'NOVICIO';
        const pTitle = document.getElementById('profile-active-title');
        const titleName = msg.selectedTitle || stats.activeTitle || 'Novato';
        if (pTitle) pTitle.textContent = `Título: [${titleName}]`;
        const pCount = document.getElementById('profile-titles-count');
        if (pCount) pCount.textContent = `${stats.unlockedCount || 0} / 34 Títulos`;
      }

      else if (eventType === 'CHAT_MESSAGE' && state.currentUser) {
        const { appendChatMessage, loadConversations } = await import('./chat.js');
        const m = msg.message;
        if (m) {
          const isForMe = m.recipient?.toLowerCase() === state.currentUser.toLowerCase();
          const isFromMe = m.sender?.toLowerCase() === state.currentUser.toLowerCase();
          if (isForMe || isFromMe) {
            const { activeChatPartner } = await import('./chat.js');
            if (activeChatPartner && (
              activeChatPartner.toLowerCase() === m.sender?.toLowerCase() ||
              activeChatPartner.toLowerCase() === m.recipient?.toLowerCase()
            )) {
              appendChatMessage(m);
            } else if (isForMe) {
              showToast(`Nuevo mensaje de ${m.sender}`);
            }
            loadConversations();
          }
        }
      }

      else if (eventType === 'CHAT_CLEARED') {
        const { activeConversationId, loadConversations } = await import('./chat.js');
        if (activeConversationId === msg.conversationId) {
          const body = document.getElementById('chat-messages-container');
          if (body) body.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin:auto; font-size:0.85rem;">Conversación eliminada.</div>`;
        }
        loadConversations();
      }

      else if (eventType === 'CHAT_MESSAGE_DELETED') {
        const { loadConversations } = await import('./chat.js');
        const el = document.getElementById(`msg-${msg.messageId}`);
        if (el) el.remove();
        loadConversations();
      }

      else if (eventType === 'FRIEND_REQUEST' && state.currentUser) {
        const { loadFriendRequests, loadPlayers } = await import('./social.js');
        if (msg.target?.toLowerCase() === state.currentUser.toLowerCase()) {
          showToast(`¡${msg.sender} te envió una solicitud de amistad!`);
          loadFriendRequests();
          loadPlayers();
        }
      }

      else if (eventType === 'FRIEND_ACCEPTED' && state.currentUser) {
        const { loadPlayers, loadFriendRequests } = await import('./social.js');
        const u1 = (msg.user1 || '').toLowerCase();
        const u2 = (msg.user2 || '').toLowerCase();
        const cLow = state.currentUser.toLowerCase();
        if (u1 === cLow || u2 === cLow) {
          const other = u1 === cLow ? msg.user2 : msg.user1;
          showToast(`¡Ahora eres amigo de ${other}!`);
          loadPlayers();
          loadFriendRequests();
        }
      }

      else if (
        eventType === 'P2P_NEW_LISTING' ||
        eventType === 'P2P_BOUGHT' ||
        eventType === 'P2P_DELETED'
      ) {
        const { loadMarket } = await import('./market.js');
        loadMarket();
      }

      else if (
        eventType === 'BALANCE_UPDATE' &&
        state.currentUser &&
        msg.data?.username?.toLowerCase() === state.currentUser.toLowerCase()
      ) {
        const { loadBalance } = await import('./wallet.js');
        loadBalance();
      }

      else if (eventType === 'NEW_ORDER' || eventType === 'ORDER_APPROVED') {
        if (state.currentUser) {
          const { loadBalance } = await import('./wallet.js');
          loadBalance();
        }
      }
    } catch (err) {}
  };

  ws.onclose = () => {
    wsInstance = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(30000, 4000 * Math.pow(1.4, Math.min(reconnectAttempts, 5)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWS();
  }, delay);
}
