// auth.js — Login, logout, sesión, vinculación, avatar
import { state } from './state.js';
import { showToast, openModal, closeModal } from './utils.js';

export let pendingAuthCode = null;
export let pendingAuthUsername = null;
export let authCountdownInterval = null;
export let authPollingInterval = null;

export function updateAuthUI() {
  const container = document.getElementById('user-widget');
  if (!container) return;

  if (state.currentUser) {
    const avatar = state.currentUserAvatar ||
      `https://mc-heads.net/avatar/${encodeURIComponent(state.currentUser)}/64`;
    container.innerHTML = `
      <div class="user-pill">
        <div style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" id="btn-header-profile" title="Ver mi perfil">
          <img id="header-avatar-img" src="${avatar}" alt="Avatar" class="user-pill-avatar">
          <span class="user-pill-name">${state.currentUser}</span>
          <span id="header-coins-pill" style="font-size:0.75rem; font-weight:800; color:var(--primary); white-space:nowrap;">${state.userData.wallet.toLocaleString()} NC</span>
        </div>
      </div>
    `;

    document.getElementById('btn-header-profile').onclick = () => {
      if (window.openProfile) window.openProfile(state.currentUser);
      else if (window.navigateTo) window.navigateTo('/' + encodeURIComponent(state.currentUser));
    };

    // Cargar datos iniciales del usuario
    import('./wallet.js').then(m => m.loadBalance());
    import('./chat.js').then(m => m.loadConversations());
    import('./social.js').then(m => m.loadFriendRequests());
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btn-login">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Iniciar Sesión</span>
      </button>
    `;
    document.getElementById('btn-login').onclick = () => {
      resetAuthModal();
      openModal('modal-login');
    };
  }
}

export function resetAuthModal() {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);
  pendingAuthCode = null;
  pendingAuthUsername = null;
  const s1 = document.getElementById('auth-step-1');
  const s2 = document.getElementById('auth-step-2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
}

export function completeAuth(user, welcomeBonus = 0) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  state.currentUser = user.displayName || user.username;
  state.userData.wallet = user.wallet || 0;
  state.userData.bank = user.bank || 0;

  localStorage.setItem('nodowa_user', state.currentUser);

  closeModal('modal-login');
  resetAuthModal();
  updateAuthUI();

  if (welcomeBonus > 0) {
    showToast(`¡Bienvenido ${state.currentUser}! Recibiste +${welcomeBonus.toLocaleString()} NC de bono por vincularte.`);
  } else {
    showToast(`Cuenta vinculada. Bienvenido de vuelta, ${state.currentUser}.`);
  }
}

export async function validateCurrentSession() {
  const sessionToken = localStorage.getItem('nodowa_session_token');
  if (!sessionToken) return;

  try {
    const res = await fetch('/api/auth/validate-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    });
    const data = await res.json();
    if (data.ok && data.user) {
      state.currentUser = data.user.displayName || data.user.username;
      state.userData.wallet = data.user.wallet || 0;
      state.userData.bank = data.user.bank || 0;
      localStorage.setItem('nodowa_user', state.currentUser);
      updateAuthUI();
    }
  } catch (_) {}
}

export async function logoutUser() {
  const sessionToken = localStorage.getItem('nodowa_session_token');
  if (sessionToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken })
      });
    } catch (_) {}
  }
  localStorage.removeItem('nodowa_user');
  localStorage.removeItem('nodowa_session_token');
  localStorage.removeItem('nodowa_avatar');
  state.currentUser = null;
  state.currentUserAvatar = null;
  state.pendingSessionToken = null;
  state.userData = { wallet: 0, bank: 0 };
  closeModal('modal-profile');
  updateAuthUI();
  showToast('Sesión cerrada.');
}

export async function saveAvatar(avatarUrl) {
  try {
    const res = await fetch('/api/players/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.currentUser, avatarUrl })
    });
    const data = await res.json();
    if (data.ok) {
      state.currentUserAvatar = data.avatarUrl;
      localStorage.setItem('nodowa_avatar', state.currentUserAvatar);

      const hImg = document.getElementById('header-avatar-img');
      if (hImg) hImg.src = state.currentUserAvatar;
      const pImg = document.getElementById('profile-avatar-img');
      if (pImg) pImg.src = state.currentUserAvatar;

      closeModal('modal-avatar');
      showToast('Foto de perfil actualizada con éxito.');
    } else {
      showToast(data.error || 'No se pudo actualizar la foto');
    }
  } catch (err) {
    showToast('Error de conexión al guardar foto');
  }
}

function startAuthCountdown(expiresAt) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  const timerEl = document.getElementById('auth-timer-countdown');

  authCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timerEl) timerEl.textContent = `Expira en: ${formatted}`;

    if (remaining <= 0) {
      clearInterval(authCountdownInterval);
      clearInterval(authPollingInterval);
      if (timerEl) timerEl.textContent = 'Código expirado. Genera uno nuevo.';
    }
  }, 1000);

  authPollingInterval = setInterval(async () => {
    if (!pendingAuthCode) return;
    try {
      const res = await fetch(
        `/api/auth/check-link-status?code=${pendingAuthCode}&sessionToken=${state.pendingSessionToken || ''}`
      );
      const data = await res.json();
      if (data.ok && data.verified) {
        completeAuth(data.user, data.welcomeBonus || 0);
      }
    } catch (_) {}
  }, 2500);
}

// ————————————————————————————
// Listeners de formularios de auth
// ————————————————————————————

export function initAuthListeners() {
  // Paso 1: Solicitar código /link
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uname = document.getElementById('login-username').value.trim();
    if (!uname) return showToast('Ingresa tu Gamertag de Minecraft');

    const btn = document.getElementById('btn-request-link');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname })
      });
      const data = await res.json();
      if (data.ok) {
        pendingAuthCode = data.code;
        pendingAuthUsername = uname;
        state.pendingSessionToken = data.sessionToken;
        localStorage.setItem('nodowa_session_token', data.sessionToken);

        document.getElementById('auth-target-player').textContent = uname;
        document.getElementById('auth-code-text').textContent = `/link ${data.code}`;
        document.getElementById('auth-step-1').style.display = 'none';
        document.getElementById('auth-step-2').style.display = 'block';

        startAuthCountdown(data.expiresAt);
        showToast('Código generado. Escríbelo en Minecraft.');
      } else {
        showToast(data.error || 'No se pudo generar el código');
      }
    } catch (err) {
      showToast('Error de conexión al generar código');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Copiar comando /link
  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    if (!pendingAuthCode) return;
    const cmd = `/link ${pendingAuthCode}`;
    navigator.clipboard.writeText(cmd)
      .then(() => showToast(`Comando copiado: "${cmd}"`))
      .catch(() => showToast(`Comando: ${cmd}`));
  });

  // Volver al paso 1
  document.getElementById('btn-cancel-link')?.addEventListener('click', resetAuthModal);

  // Logout
  document.getElementById('btn-profile-logout')?.addEventListener('click', logoutUser);

  // Ir a wallet desde perfil
  document.getElementById('btn-profile-wallet')?.addEventListener('click', () => {
    closeModal('modal-profile');
    const walletTab = document.querySelector('.tab-btn[data-tab="wallet"]');
    if (walletTab) walletTab.click();
  });

  // Avatar: usar skin de Minecraft
  document.getElementById('btn-avatar-minecraft')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    const mcAvatar = `https://mc-heads.net/avatar/${encodeURIComponent(state.currentUser)}/128`;
    await saveAvatar(mcAvatar);
  });

  // Avatar: subir archivo o URL
  document.getElementById('avatar-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;

    const fileInput = document.getElementById('avatar-file-input');
    const urlInput = document.getElementById('avatar-url-input');

    if (fileInput && fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = async (ev) => { await saveAvatar(ev.target.result); };
      reader.readAsDataURL(fileInput.files[0]);
    } else if (urlInput && urlInput.value.trim()) {
      await saveAvatar(urlInput.value.trim());
    } else {
      showToast('Selecciona una imagen o ingresa una URL');
    }
  });

  // Abrir modal avatar
  document.getElementById('btn-open-avatar-modal')?.addEventListener('click', () => {
    openModal('modal-avatar');
  });
}
