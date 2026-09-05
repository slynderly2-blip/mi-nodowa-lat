// Nodowa Network - Client Application (Minimal & Modular)
let currentUser = localStorage.getItem("nodowa_user") || null;
let userData = { wallet: 0, bank: 0 };
let storeItems = [];
let selectedItem = null;
let binanceConfig = null;

// Auth & User State (Vinculación segura mediante /link)
let pendingAuthCode = null;
let pendingAuthUsername = null;
let pendingSessionToken = localStorage.getItem("nodowa_session_token") || null;
let authCountdownInterval = null;
let authPollingInterval = null;

// Helper: Toast Notifications
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = "none"; }, 3500);
}

// Helper: Modals
window.openModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
};
window.closeModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
};

// Search Handlers
window.clearSearch = () => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = "";
    if (typeof renderStore === "function") renderStore();
    searchInput.focus();
  }
};

window.setSearchTag = (tag) => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = tag;
    if (typeof renderStore === "function") renderStore();
    searchInput.focus();
  }
};

// Tabs Navigation (Desktop cabecera y Mobile barra inferior sincronizados)
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById(`view-${tabName}`);
    if (target) target.classList.add("active");

    if (tabName === "store") loadStore();
    else if (tabName === "market") loadMarket();
    else if (tabName === "social") loadSocial();
    else if (tabName === "wallet") loadBalance();
    else if (tabName === "deliveries") loadDeliveries();
    else if (tabName === "leaderboard") loadLeaderboard();

    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

// Helper de Íconos SVG para Artículos
function getItemSvg(category, iconType) {
  if (category === "coins" || iconType === "coins") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`;
  }
  if (category === "ranks" || iconType === "shield") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }
  if (category === "crates" || iconType === "key") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
  }
  if (category === "kits" || iconType === "sword") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
}

let currentUserAvatar = localStorage.getItem("nodowa_avatar") || null;
let userProfileData = null;

// Auth UI (Avatar Interactivo en Cabecera)
function updateAuthUI() {
  const container = document.getElementById("user-widget");
  if (currentUser) {
    const avatar = currentUserAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(currentUser)}/64`;
    container.innerHTML = `
      <button class="profile-header-btn" id="btn-open-profile" title="Ver mi perfil">
        <div class="avatar-circle">
          <img id="header-avatar-img" src="${avatar}" alt="Avatar">
          <span class="online-indicator"></span>
        </div>
        <div class="profile-header-info">
          <span class="profile-header-name">${currentUser}</span>
          <span class="profile-header-coins" id="header-coins-pill">${userData.wallet.toLocaleString()} NC</span>
        </div>
      </button>
    `;
    document.getElementById("btn-open-profile").onclick = () => window.openProfile(currentUser);
    loadBalance();
    loadConversations();
    loadFriendRequests();
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btn-login">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Iniciar Sesión</span>
      </button>
    `;
    document.getElementById("btn-login").onclick = () => {
      resetAuthModal();
      openModal("modal-login");
    };
  }
}

// Modal Perfil de Jugador (Estadísticas RPG conectadas al addon de títulos)
window.openProfile = async (targetUser) => {
  const userToLoad = targetUser || currentUser;
  if (!userToLoad) return openModal("modal-login");

  const isSelf = currentUser && userToLoad.toLowerCase() === currentUser.toLowerCase();

  const avatarImg = document.getElementById("profile-avatar-img");
  const avatarEditBtn = document.getElementById("btn-open-avatar-modal");
  const ownActions = document.getElementById("profile-own-actions");
  const otherActions = document.getElementById("profile-other-actions");
  const editBioShortcut = document.getElementById("btn-edit-bio-shortcut");

  if (avatarEditBtn) avatarEditBtn.style.display = isSelf ? "flex" : "none";
  if (ownActions) ownActions.style.display = isSelf ? "flex" : "none";
  if (otherActions) otherActions.style.display = isSelf ? "none" : "flex";
  if (editBioShortcut) editBioShortcut.style.display = isSelf ? "inline-block" : "none";

  document.getElementById("profile-gamertag").textContent = userToLoad;
  if (avatarImg) avatarImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(userToLoad)}/100`;

  // Configurar botones de acción si es otro jugador
  if (!isSelf) {
    const btnChat = document.getElementById("btn-other-profile-chat");
    if (btnChat) {
      btnChat.onclick = () => {
        closeModal("modal-profile");
        openChatWith(userToLoad);
      };
    }
    const btnFriend = document.getElementById("btn-other-profile-friend");
    if (btnFriend) {
      btnFriend.onclick = () => {
        sendFriendRequest(userToLoad);
      };
    }
  }

  openModal("modal-profile");

  try {
    const res = await fetch(`/api/players/profile/${encodeURIComponent(userToLoad)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      const u = data.user;
      if (isSelf) {
        userProfileData = u;
        if (u.avatarUrl) {
          currentUserAvatar = u.avatarUrl;
          localStorage.setItem("nodowa_avatar", currentUserAvatar);
          const hImg = document.getElementById("header-avatar-img");
          if (hImg) hImg.src = currentUserAvatar;
        }
      }

      if (avatarImg && u.avatarUrl) avatarImg.src = u.avatarUrl;

      // Estado vinculado
      const chipLinked = document.getElementById("profile-chip-linked");
      const textLinked = document.getElementById("profile-linked-text");
      if (chipLinked && textLinked) {
        if (u.linked) {
          chipLinked.className = "chip chip-linked";
          textLinked.textContent = "Vinculado Bedrock";
        } else {
          chipLinked.className = "chip chip-tier";
          chipLinked.style.background = "var(--red-light)";
          chipLinked.style.color = "var(--red)";
          textLinked.textContent = "No Vinculado";
        }
      }

      // Rangos y Títulos
      const stats = u.stats || {};
      const tierBadge = document.getElementById("profile-tier-badge");
      if (tierBadge) tierBadge.textContent = u.equippedRank || stats.equippedRank || stats.tier || "NOVICIO";

      const activeTitle = document.getElementById("profile-active-title");
      const titleName = u.selectedTitle || stats.activeTitle || "Novato";
      if (activeTitle) activeTitle.textContent = `Título: [${titleName}]`;

      // Biografía
      const bioText = document.getElementById("profile-bio-text");
      if (bioText) {
        if (u.bio && u.bio.trim()) {
          bioText.textContent = u.bio;
        } else {
          bioText.innerHTML = isSelf 
            ? `<em>Aún no has añadido una biografía. ¡Haz clic en "Editar" para presentarte ante la comunidad!</em>`
            : `<em>Este jugador aún no ha escrito su biografía.</em>`;
        }
      }

      // Redes Sociales
      renderProfileSocials(u.socialLinks || {});

      // Balances
      document.getElementById("profile-wallet-val").textContent = `${(u.wallet || 0).toLocaleString()} NC`;
      document.getElementById("profile-bank-val").textContent = `${(u.bank || 0).toLocaleString()} NC`;

      // Estadísticas
      const titlesCount = document.getElementById("profile-titles-count");
      if (titlesCount) titlesCount.textContent = `${stats.unlockedCount || 0} / 34 Títulos`;

      document.getElementById("profile-stat-pvp").textContent = (stats.killsPvp || 0).toLocaleString();
      document.getElementById("profile-stat-mobs").textContent = (stats.killsTotalMobs || 0).toLocaleString();
      document.getElementById("profile-stat-diamond").textContent = (stats.minedDiamond || 0).toLocaleString();
      document.getElementById("profile-stat-mined").textContent = (stats.minedTotal || 0).toLocaleString();
    }
  } catch (err) {
    console.error("Error al cargar perfil:", err);
  }
};

function renderProfileSocials(socials) {
  const container = document.getElementById("profile-socials-row");
  if (!container) return;

  const valid = [];
  if (socials.discord) {
    const isUrl = socials.discord.startsWith("http");
    valid.push(`<span class="social-pill-link" ${isUrl ? `onclick="window.open('${socials.discord}', '_blank')"` : `onclick="navigator.clipboard.writeText('${socials.discord}'); showToast('Discord copiado: ${socials.discord}');"`} style="cursor:pointer;" title="Discord">💬 Discord: ${escapeHtml(socials.discord.replace(/^https?:\/\//, ''))}</span>`);
  }
  if (socials.youtube) {
    valid.push(`<a href="${socials.youtube}" target="_blank" rel="noopener" class="social-pill-link" style="color:#ef4444;">📺 YouTube</a>`);
  }
  if (socials.tiktok) {
    valid.push(`<a href="${socials.tiktok}" target="_blank" rel="noopener" class="social-pill-link">🎵 TikTok</a>`);
  }
  if (socials.twitch) {
    valid.push(`<a href="${socials.twitch}" target="_blank" rel="noopener" class="social-pill-link" style="color:#9333ea;">🎮 Twitch</a>`);
  }
  if (socials.instagram) {
    valid.push(`<a href="${socials.instagram}" target="_blank" rel="noopener" class="social-pill-link" style="color:#ec4899;">📸 Instagram</a>`);
  }
  if (socials.twitter) {
    valid.push(`<a href="${socials.twitter}" target="_blank" rel="noopener" class="social-pill-link">✖️ X / Twitter</a>`);
  }

  container.innerHTML = valid.length > 0 ? valid.join("") : `<small style="color:var(--text-subtle); font-size:0.75rem;">Sin redes sociales vinculadas</small>`;
}

async function logoutUser() {
  const sessionToken = localStorage.getItem("nodowa_session_token");
  if (sessionToken) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken })
      });
    } catch (_) {}
  }
  localStorage.removeItem("nodowa_user");
  localStorage.removeItem("nodowa_session_token");
  localStorage.removeItem("nodowa_avatar");
  currentUser = null;
  currentUserAvatar = null;
  pendingSessionToken = null;
  userData = { wallet: 0, bank: 0 };
  closeModal("modal-profile");
  updateAuthUI();
  showToast("Sesión cerrada.");
}

document.getElementById("btn-profile-logout")?.addEventListener("click", logoutUser);

document.getElementById("btn-profile-wallet")?.addEventListener("click", () => {
  closeModal("modal-profile");
  const walletTab = document.querySelector(`.tab-btn[data-tab="wallet"]`);
  if (walletTab) walletTab.click();
});

// Apertura y guardado de Modal Editar Perfil (Biografía y Redes)
function openEditProfileModal() {
  if (!currentUser) return openModal("modal-login");
  const bioInput = document.getElementById("edit-profile-bio");
  const discordInput = document.getElementById("edit-social-discord");
  const ytInput = document.getElementById("edit-social-youtube");
  const ttInput = document.getElementById("edit-social-tiktok");
  const twitchInput = document.getElementById("edit-social-twitch");
  const igInput = document.getElementById("edit-social-instagram");
  const twInput = document.getElementById("edit-social-twitter");

  const socials = (userProfileData && userProfileData.socialLinks) || {};
  if (bioInput) bioInput.value = (userProfileData && userProfileData.bio) || "";
  if (discordInput) discordInput.value = socials.discord || "";
  if (ytInput) ytInput.value = socials.youtube || "";
  if (ttInput) ttInput.value = socials.tiktok || "";
  if (twitchInput) twitchInput.value = socials.twitch || "";
  if (igInput) igInput.value = socials.instagram || "";
  if (twInput) twInput.value = socials.twitter || "";

  openModal("modal-edit-profile");
}

document.getElementById("btn-open-edit-profile")?.addEventListener("click", openEditProfileModal);
document.getElementById("btn-edit-bio-shortcut")?.addEventListener("click", openEditProfileModal);

document.getElementById("edit-profile-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const bio = document.getElementById("edit-profile-bio").value.trim();
  const socialLinks = {
    discord: document.getElementById("edit-social-discord").value.trim(),
    youtube: document.getElementById("edit-social-youtube").value.trim(),
    tiktok: document.getElementById("edit-social-tiktok").value.trim(),
    twitch: document.getElementById("edit-social-twitch").value.trim(),
    instagram: document.getElementById("edit-social-instagram").value.trim(),
    twitter: document.getElementById("edit-social-twitter").value.trim()
  };

  try {
    const res = await fetch("/api/players/profile/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, bio, socialLinks })
    });
    const data = await res.json();
    if (data.ok) {
      if (userProfileData) {
        userProfileData.bio = data.bio;
        userProfileData.socialLinks = data.socialLinks;
      }
      closeModal("modal-edit-profile");
      showToast("Perfil actualizado correctamente");
      openProfile(currentUser);
    } else {
      showToast(data.error || "No se pudo actualizar el perfil");
    }
  } catch (err) {
    showToast("Error de conexión al guardar");
  }
});

document.getElementById("btn-open-avatar-modal")?.addEventListener("click", () => {
  openModal("modal-avatar");
});

document.getElementById("btn-avatar-minecraft")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const mcAvatar = `https://mc-heads.net/avatar/${encodeURIComponent(currentUser)}/128`;
  await saveAvatar(mcAvatar);
});

document.getElementById("avatar-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const fileInput = document.getElementById("avatar-file-input");
  const urlInput = document.getElementById("avatar-url-input");

  if (fileInput && fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await saveAvatar(ev.target.result);
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else if (urlInput && urlInput.value.trim()) {
    await saveAvatar(urlInput.value.trim());
  } else {
    showToast("Selecciona una imagen o ingresa una URL");
  }
});

async function saveAvatar(avatarUrl) {
  try {
    const res = await fetch("/api/players/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, avatarUrl })
    });
    const data = await res.json();
    if (data.ok) {
      currentUserAvatar = data.avatarUrl;
      localStorage.setItem("nodowa_avatar", currentUserAvatar);
      
      const hImg = document.getElementById("header-avatar-img");
      if (hImg) hImg.src = currentUserAvatar;
      const pImg = document.getElementById("profile-avatar-img");
      if (pImg) pImg.src = currentUserAvatar;

      closeModal("modal-avatar");
      showToast("Foto de perfil actualizada con éxito.");
    } else {
      showToast(data.error || "No se pudo actualizar la foto");
    }
  } catch (err) {
    showToast("Error de conexión al guardar foto");
  }
}

function resetAuthModal() {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);
  pendingAuthCode = null;
  pendingAuthUsername = null;
  const s1 = document.getElementById("auth-step-1");
  const s2 = document.getElementById("auth-step-2");
  if (s1) s1.style.display = "block";
  if (s2) s2.style.display = "none";
}

// Paso 1: Solicitar código /link
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uname = document.getElementById("login-username").value.trim();
  if (!uname) return showToast("Ingresa tu Gamertag de Minecraft");

  const btn = document.getElementById("btn-request-link");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname })
    });
    const data = await res.json();
    if (data.ok) {
      pendingAuthCode = data.code;
      pendingAuthUsername = uname;
      pendingSessionToken = data.sessionToken;
      localStorage.setItem("nodowa_session_token", data.sessionToken);

      document.getElementById("auth-target-player").textContent = uname;
      document.getElementById("auth-code-text").textContent = `/link ${data.code}`;
      document.getElementById("auth-step-1").style.display = "none";
      document.getElementById("auth-step-2").style.display = "block";

      startAuthCountdown(data.expiresAt);
      showToast("Código generado. Escríbelo en Minecraft.");
    } else {
      showToast(data.error || "No se pudo generar el código");
    }
  } catch (err) {
    showToast("Error de conexión al generar código");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Copiar comando /link
document.getElementById("btn-copy-code")?.addEventListener("click", () => {
  if (!pendingAuthCode) return;
  const cmd = `/link ${pendingAuthCode}`;
  navigator.clipboard.writeText(cmd).then(() => {
    showToast(`Comando copiado: "${cmd}"`);
  }).catch(() => {
    showToast(`Comando: ${cmd}`);
  });
});

// Volver al paso 1
document.getElementById("btn-cancel-link")?.addEventListener("click", () => {
  resetAuthModal();
});

function startAuthCountdown(expiresAt) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  const timerEl = document.getElementById("auth-timer-countdown");

  authCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timerEl) {
      timerEl.textContent = `Expira en: ${formatted}`;
    }

    if (remaining <= 0) {
      clearInterval(authCountdownInterval);
      clearInterval(authPollingInterval);
      if (timerEl) timerEl.textContent = "Código expirado. Genera uno nuevo.";
    }
  }, 1000);

  authPollingInterval = setInterval(async () => {
    if (!pendingAuthCode) return;
    try {
      const res = await fetch(`/api/auth/check-link-status?code=${pendingAuthCode}&sessionToken=${pendingSessionToken || ''}`);
      const data = await res.json();
      if (data.ok && data.verified) {
        completeAuth(data.user);
      }
    } catch (_) {}
  }, 2500);
}

function completeAuth(user) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  currentUser = user.displayName || user.username;
  userData.wallet = user.wallet || 0;
  userData.bank = user.bank || 0;

  localStorage.setItem("nodowa_user", currentUser);

  closeModal("modal-login");
  resetAuthModal();
  updateAuthUI();
  showToast(`Cuenta vinculada con éxito. Bienvenido, ${currentUser}`);
}

async function validateCurrentSession() {
  const sessionToken = localStorage.getItem("nodowa_session_token");
  if (!sessionToken) return;

  try {
    const res = await fetch("/api/auth/validate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken })
    });
    const data = await res.json();
    if (data.ok && data.user) {
      currentUser = data.user.displayName || data.user.username;
      userData.wallet = data.user.wallet || 0;
      userData.bank = data.user.bank || 0;
      localStorage.setItem("nodowa_user", currentUser);
      updateAuthUI();
    }
  } catch (_) {}
}

// Balance & Wallet
async function loadBalance() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/wallet/balance/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      userData.wallet = data.user.wallet || 0;
      userData.bank = data.user.bank || 0;
      const pill = document.getElementById("pill-coins");
      if (pill) pill.textContent = `${userData.wallet.toLocaleString()} NC`;
      const headerCoins = document.getElementById("header-coins-pill");
      if (headerCoins) headerCoins.textContent = `${userData.wallet.toLocaleString()} NC`;
      const pW = document.getElementById("profile-wallet-val");
      if (pW) pW.textContent = `${userData.wallet.toLocaleString()} NC`;
      const pB = document.getElementById("profile-bank-val");
      if (pB) pB.textContent = `${userData.bank.toLocaleString()} NC`;
      const wBal = document.getElementById("wallet-balance");
      if (wBal) wBal.textContent = `${userData.wallet.toLocaleString()} NC`;
      const bBal = document.getElementById("bank-balance");
      if (bBal) bBal.textContent = `${userData.bank.toLocaleString()} NC`;
    }

    // Cargar rendimiento de intereses bancarios
    loadBankInterest();
  } catch (err) {
    console.error("Error cargando saldo:", err);
  }
}

// 🏦 Sistema de Intereses Bancarios
async function loadBankInterest() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/wallet/interest/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok) {
      const estDaily = document.getElementById("interest-estimated-daily");
      if (estDaily) estDaily.textContent = `+${(data.estimatedDaily || 0).toLocaleString()} NC / día`;

      const pendVal = document.getElementById("interest-pending-val");
      if (pendVal) pendVal.textContent = `+${(data.pendingInterest || 0).toLocaleString()} NC`;

      const totEarned = document.getElementById("interest-total-earned");
      if (totEarned) totEarned.textContent = `${(data.totalEarned || 0).toLocaleString()} NC`;

      const btnClaim = document.getElementById("btn-claim-interest");
      if (btnClaim) {
        if (data.canClaim) {
          btnClaim.disabled = false;
          btnClaim.textContent = `🎁 Reclamar +${(data.pendingInterest || 0).toLocaleString()} NC en Intereses`;
          btnClaim.style.opacity = "1";
        } else {
          btnClaim.disabled = true;
          btnClaim.textContent = (data.pendingInterest > 0)
            ? `🎁 Generando intereses (+${data.pendingInterest} NC)`
            : `🎁 Generando intereses (Guarda NC en tu banco)`;
          btnClaim.style.opacity = "0.65";
        }
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar estado de intereses:", e);
  }
}

window.claimBankInterest = async () => {
  if (!currentUser) return openModal("modal-login");
  const btn = document.getElementById("btn-claim-interest");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/wallet/claim-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || `¡Has reclamado +${data.claimed} NC en intereses!`);
      loadBalance();
    } else {
      showToast(data.error || "No hay intereses suficientes para reclamar");
    }
  } catch (e) {
    showToast("Error de conexión al reclamar intereses");
  } finally {
    if (btn) btn.disabled = false;
  }
};

// 🏦 Operaciones Bancarias (Depositar / Retirar)
window.openBankActionModal = (type) => {
  if (!currentUser) return openModal("modal-login");

  const modal = document.getElementById("modal-bank-action");
  if (!modal) return;

  const typeInput = document.getElementById("bank-action-type");
  const titleEl = document.getElementById("bank-modal-title");
  const labelEl = document.getElementById("bank-modal-label");
  const submitBtn = document.getElementById("btn-bank-submit");
  const walletEl = document.getElementById("bank-modal-wallet");
  const bankEl = document.getElementById("bank-modal-bank");
  const amtInput = document.getElementById("bank-action-amount");

  typeInput.value = type;

  if (walletEl) walletEl.textContent = `${(userData.wallet || 0).toLocaleString()} NC`;
  if (bankEl) bankEl.textContent = `${(userData.bank || 0).toLocaleString()} NC`;

  if (type === "deposit") {
    titleEl.textContent = "📥 Depositar en Cuenta Bancaria";
    labelEl.textContent = "Cantidad a Depositar (NC)";
    submitBtn.textContent = "Confirmar Depósito";
    submitBtn.style.background = "linear-gradient(135deg, var(--primary) 0%, #6d28d9 100%)";
  } else {
    titleEl.textContent = "📤 Retirar a Billetera en Mano";
    labelEl.textContent = "Cantidad a Retirar (NC)";
    submitBtn.textContent = "Confirmar Retiro";
    submitBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
  }

  amtInput.value = "";
  openModal("modal-bank-action");
  setTimeout(() => amtInput.focus(), 150);
};

window.setBankPercentage = (pct) => {
  const type = document.getElementById("bank-action-type")?.value || "deposit";
  const max = type === "deposit" ? (userData.wallet || 0) : (userData.bank || 0);
  const amt = Math.floor(max * (pct / 100));
  const input = document.getElementById("bank-action-amount");
  if (input) {
    input.value = amt;
    input.focus();
  }
};

document.getElementById("bank-action-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return openModal("modal-login");

  const type = document.getElementById("bank-action-type").value;
  const amount = parseInt(document.getElementById("bank-action-amount").value);

  if (isNaN(amount) || amount <= 0) {
    return showToast("Ingresa un monto válido");
  }

  const endpoint = type === "deposit" ? "/api/wallet/deposit-bank" : "/api/wallet/withdraw-bank";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, amount })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-bank-action");
      showToast(data.message || "Operación realizada con éxito");
      loadBalance();
    } else {
      showToast(data.error || "Error al procesar operación");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

document.getElementById("transfer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return openModal("modal-login");

  const toUser = document.getElementById("transfer-to").value.trim();
  const amount = parseInt(document.getElementById("transfer-amount").value);
  const note = document.getElementById("transfer-note").value.trim();

  if (!toUser || isNaN(amount) || amount <= 0) return showToast("Datos inválidos");

  try {
    const res = await fetch("/api/wallet/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUser: currentUser, toUser, amount, note })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      document.getElementById("transfer-form").reset();
      loadBalance();
    } else {
      showToast(data.error || "Error en la transferencia");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// Store & Catalog
async function loadStore() {
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    if (data.ok) {
      storeItems = data.items || [];
      renderStore();
    }
  } catch (err) {
    console.error("Error cargando tienda:", err);
  }
}

function renderStore() {
  const grid = document.getElementById("store-grid");
  const storeTitle = document.getElementById("store-title");
  const storeSubtitle = document.getElementById("store-subtitle");
  const clearBtn = document.getElementById("search-clear-btn");
  const searchInput = document.getElementById("store-search");
  
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
  
  if (clearBtn) {
    clearBtn.style.display = query ? "flex" : "none";
  }

  let itemsToDisplay = [];

  if (!query) {
    // Por defecto: solo monedas
    itemsToDisplay = storeItems.filter(i => i.category === "coins" || (i.giveCoins && i.giveCoins > 0));
    if (storeTitle) storeTitle.textContent = "Paquetes de Nodocoins";
    if (storeSubtitle) storeSubtitle.textContent = "Acreditación instantánea en tu cuenta. Escribe en el buscador para ver otros productos.";
  } else {
    // Si busca: buscar en todo el catálogo
    itemsToDisplay = storeItems.filter(i => {
      const matchName = (i.name || "").toLowerCase().includes(query);
      const matchDesc = (i.description || "").toLowerCase().includes(query);
      const matchCategory = (i.category || "").toLowerCase().includes(query);
      const matchBadge = (i.badge || "").toLowerCase().includes(query);
      return matchName || matchDesc || matchCategory || matchBadge;
    });
    if (storeTitle) storeTitle.innerHTML = `Resultados para: <span style="color:var(--tiktok-red)">"${query}"</span>`;
    if (storeSubtitle) storeSubtitle.innerHTML = `Mostrando productos coincidentes. <button class="link-btn" onclick="clearSearch()">Ver solo monedas</button>`;
  }

  if (itemsToDisplay.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <h3>No encontramos productos para "${query}"</h3>
        <p>Prueba buscando "vip", "mvp", "llave", "kit" o vuelve al catálogo de monedas.</p>
        <button class="btn btn-secondary btn-sm" onclick="clearSearch()">Ver Monedas</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = itemsToDisplay.map(item => {
    const isCoin = item.category === "coins" || (item.giveCoins && item.giveCoins > 0);
    const iconSvg = getItemSvg(item.category, item.iconType);

    return `
      <div class="card ${isCoin ? 'coin-card' : ''}">
        <div class="card-top">
          <div class="card-icon-pill">${iconSvg}</div>
          ${item.badge ? `<span class="badge ${isCoin ? 'badge-coins' : 'badge-tiktok'}">${item.badge}</span>` : ""}
        </div>
        <div class="card-content">
          <h3 class="card-title">${item.name}</h3>
          <p class="card-desc">${item.description || "Artículo oficial para tu aventura en Nodowa Network."}</p>
        </div>
        <div class="card-footer">
          <div class="card-prices">
            ${item.priceCoins > 0 ? `<span class="price-coins">${item.priceCoins.toLocaleString()} <small>NC</small></span>` : ""}
            ${item.priceUsdt > 0 ? `<span class="price-usdt">$${item.priceUsdt.toFixed(2)} <small>USDT</small></span>` : ""}
          </div>
          <button class="btn btn-tiktok btn-block" onclick="startCheckout('${item.id}')">
            ${isCoin ? 'Recargar Monedas' : 'Comprar Producto'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.clearSearch = () => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = "";
    renderStore();
    searchInput.focus();
  }
};

window.setSearchTag = (tag) => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = tag;
    renderStore();
    searchInput.focus();
  }
};

const storeSearchEl = document.getElementById("store-search");
if (storeSearchEl) {
  storeSearchEl.addEventListener("input", renderStore);
}

// Checkout Modal
window.startCheckout = (itemId) => {
  if (!currentUser) return openModal("modal-login");
  selectedItem = storeItems.find(i => i.id === itemId);
  if (!selectedItem) return;

  document.getElementById("checkout-item-title").textContent = selectedItem.name;
  document.getElementById("checkout-item-desc").textContent = selectedItem.description || "";
  document.getElementById("binance-pay-section").style.display = "none";

  const btnCoins = document.getElementById("btn-pay-coins");
  if (selectedItem.priceCoins > 0) {
    btnCoins.style.display = "block";
    btnCoins.textContent = `Pagar ${selectedItem.priceCoins.toLocaleString()} NC`;
    btnCoins.onclick = () => buyWithCoins(selectedItem.id);
  } else {
    btnCoins.style.display = "none";
  }

  const btnBinance = document.getElementById("btn-pay-binance");
  if (selectedItem.priceUsdt > 0) {
    btnBinance.style.display = "block";
    btnBinance.textContent = `Pagar $${selectedItem.priceUsdt.toFixed(2)} USDT`;
    btnBinance.onclick = () => showBinanceSection();
  } else {
    btnBinance.style.display = "none";
  }

  openModal("modal-checkout");
};

async function buyWithCoins(itemId) {
  try {
    const res = await fetch("/api/store/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, itemId })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-checkout");
      loadBalance();

      // Desplegar modal explicativo con el comando /buzon
      const successTitle = document.getElementById("purchase-success-item-name");
      if (successTitle && selectedItem) {
        successTitle.textContent = selectedItem.name;
      }
      openModal("modal-purchase-success");
    } else {
      showToast(data.error || "No se pudo completar la compra");
    }
  } catch (err) {
    showToast("Error procesando compra");
  }
}

async function showBinanceSection() {
  const section = document.getElementById("binance-pay-section");
  section.style.display = "block";
  if (!binanceConfig) {
    try {
      const res = await fetch("/api/orders/binance-info");
      const data = await res.json();
      if (data.ok && data.binance) {
        binanceConfig = data.binance;
        if (binanceConfig.payId) document.getElementById("binance-payid").textContent = binanceConfig.payId;
        if (binanceConfig.walletAddress) document.getElementById("binance-wallet").textContent = binanceConfig.walletAddress;
        if (binanceConfig.qrImage) document.getElementById("binance-qr").src = binanceConfig.qrImage;
      }
    } catch (e) {}
  }
}

document.getElementById("binance-order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedItem || !currentUser) return;

  const txid = document.getElementById("order-txid").value.trim();
  const fileInput = document.getElementById("order-receipt");
  if (!fileInput.files || !fileInput.files[0]) return showToast("Sube tu comprobante de pago");

  const formData = new FormData();
  formData.append("username", currentUser);
  formData.append("itemId", selectedItem.id);
  formData.append("txid", txid);
  formData.append("receiptImage", fileInput.files[0]);

  try {
    showToast("Subiendo comprobante...");
    const res = await fetch("/api/orders/create", { method: "POST", body: formData });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-checkout");
      document.getElementById("binance-order-form").reset();
      showToast("Comprobante enviado. Será validado en breve.");
    } else {
      showToast(data.error || "Error al enviar comprobante");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// ============================================================
// MERCADO P2P ENTRE JUGADORES
// ============================================================
let currentMarketFilter = "all";
let marketSearchTerm = "";

window.setMarketFilter = (filter) => {
  currentMarketFilter = filter;
  const btnAll = document.getElementById("btn-market-filter-all");
  const btnMine = document.getElementById("btn-market-filter-mine");
  if (btnAll) btnAll.classList.toggle("active", filter === "all");
  if (btnMine) btnMine.classList.toggle("active", filter === "mine");
  loadMarket();
};

window.clearMarketSearch = () => {
  const el = document.getElementById("market-search");
  if (el) el.value = "";
  marketSearchTerm = "";
  loadMarket();
};

const marketSearchInput = document.getElementById("market-search");
if (marketSearchInput) {
  let timer;
  marketSearchInput.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      marketSearchTerm = e.target.value.trim();
      loadMarket();
    }, 250);
  });
}

async function loadMarket() {
  const grid = document.getElementById("market-grid");
  if (!grid) return;

  try {
    const params = new URLSearchParams();
    if (marketSearchTerm) params.append("search", marketSearchTerm);
    if (currentMarketFilter === "mine" && currentUser) {
      params.append("filter", "mine");
      params.append("username", currentUser);
    }

    const res = await fetch(`/api/market?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      renderMarket(data.market || data.offers || []);
    }
  } catch (err) {
    console.error("Error cargando mercado:", err);
  }
}

function renderMarket(offers) {
  const grid = document.getElementById("market-grid");
  if (!grid) return;

  if (!offers || offers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
        </div>
        <h3>No se encontraron ofertas</h3>
        <p>Sé el primero en publicar una oferta en el mercado o prueba con otra búsqueda.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = offers.map(o => {
    const isMine = currentUser && o.seller.toLowerCase() === currentUser.toLowerCase();
    const priceVal = o.price || o.priceCoins || 0;
    const sellerAvatar = `https://mc-heads.net/avatar/${encodeURIComponent(o.seller)}/32`;
    const itemLabel = o.itemType ? `${o.quantity > 1 ? `${o.quantity}x ` : ''}${o.itemType}` : '';

    return `
      <div class="card" style="padding:0;">
        <div style="padding:1rem 1rem 0.6rem 1rem;">
          <div style="font-size:1.45rem; font-weight:800; color:var(--tiktok-black); line-height:1.15; margin-bottom:0.3rem;">
            ${priceVal.toLocaleString()} <span style="font-size:0.9rem; font-weight:600; color:var(--text-muted);">NC</span>
          </div>
          <div style="font-size:0.95rem; font-weight:700; color:var(--text); margin-bottom:0.2rem;">${o.title}</div>
          ${itemLabel ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.25rem;">${itemLabel}</div>` : ''}
          ${o.description ? `<div style="font-size:0.82rem; color:var(--text-subtle); line-height:1.45; margin-top:0.4rem;">${o.description}</div>` : ''}
        </div>

        <div style="border-top:1px solid var(--border); padding:0.65rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.45rem; min-width:0;">
            <img src="${sellerAvatar}" alt="${o.seller}" style="width:24px; height:24px; border-radius:50%; flex-shrink:0;">
            <span style="font-size:0.82rem; font-weight:600; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${o.seller}</span>
          </div>
          ${isMine
            ? `<button class="btn btn-danger-soft btn-sm" onclick="deleteMarketListing('${o.id}')">Retirar</button>`
            : `<button class="btn btn-tiktok btn-sm" style="display:flex; align-items:center; gap:5px; flex-shrink:0;" onclick="openChatWith('${o.seller}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Chat</span>
              </button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

document.getElementById("btn-create-p2p").onclick = () => {
  if (!currentUser) return openModal("modal-login");
  openModal("modal-p2p");
};

document.getElementById("p2p-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const title = document.getElementById("p2p-title").value.trim();
  const itemType = (document.getElementById("p2p-item-type")?.value || "stone").trim();
  const quantity = parseInt(document.getElementById("p2p-quantity")?.value || "1");
  const price = parseInt(document.getElementById("p2p-price").value);
  const description = document.getElementById("p2p-desc").value.trim();

  try {
    const res = await fetch("/api/market/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: currentUser, title, itemType, quantity, price, description })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-p2p");
      document.getElementById("p2p-form").reset();
      showToast("Oferta publicada exitosamente.");
      loadMarket();
    } else {
      showToast(data.error || "Error al publicar");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

window.buyMarketOffer = async (listingId) => {
  if (!currentUser) return openModal("modal-login");
  if (!confirm("¿Deseas comprar esta oferta de mercado?")) return;

  try {
    const res = await fetch("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer: currentUser, listingId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || "Compra completada exitosamente.");
      loadBalance();
      loadMarket();
    } else {
      showToast(data.error || "Error en la compra");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

window.deleteMarketListing = async (listingId) => {
  if (!currentUser) return;
  if (!confirm("¿Deseas retirar tu publicación del mercado?")) return;
  try {
    const res = await fetch("/api/market/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, listingId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Publicación retirada.");
      loadMarket();
    } else {
      showToast(data.error || "Error al retirar publicación");
    }
  } catch (e) {
    showToast("Error de conexión");
  }
};

// ============================================================
// COMUNIDAD & MESSENGER EN TIEMPO REAL
// ============================================================
let currentSocialSubTab = "players";
let currentPlayersFilter = "all";
let playersSearchTerm = "";
let activeChatPartner = null;
let activeConversationId = null;

function loadSocial() {
  if (currentSocialSubTab === "players") {
    loadPlayers();
    loadFriendRequests();
  } else {
    loadConversations();
  }
}

window.switchSocialSubTab = (subTab) => {
  currentSocialSubTab = subTab;
  const pBtn = document.getElementById("subtab-players-btn");
  const cBtn = document.getElementById("subtab-chat-btn");
  const pPanel = document.getElementById("social-panel-players");
  const cPanel = document.getElementById("social-panel-chat");

  if (pBtn) pBtn.classList.toggle("active", subTab === "players");
  if (cBtn) cBtn.classList.toggle("active", subTab === "chat");
  if (pPanel) pPanel.classList.toggle("active", subTab === "players");
  if (cPanel) cPanel.classList.toggle("active", subTab === "chat");

  if (subTab === "players") {
    loadPlayers();
    loadFriendRequests();
  } else {
    loadConversations();
  }
};

window.setPlayersFilter = (filter) => {
  currentPlayersFilter = filter;
  const btnAll = document.getElementById("filter-players-all");
  const btnLinked = document.getElementById("filter-players-linked");
  const btnUnlinked = document.getElementById("filter-players-unlinked");
  const btnFriends = document.getElementById("filter-players-friends");
  if (btnAll) btnAll.classList.toggle("active", filter === "all");
  if (btnLinked) btnLinked.classList.toggle("active", filter === "linked");
  if (btnUnlinked) btnUnlinked.classList.toggle("active", filter === "unlinked");
  if (btnFriends) btnFriends.classList.toggle("active", filter === "friends");
  loadPlayers();
};

window.clearPlayersSearch = () => {
  const el = document.getElementById("players-search-input");
  if (el) el.value = "";
  playersSearchTerm = "";
  loadPlayers();
};

const playersSearchInput = document.getElementById("players-search-input");
if (playersSearchInput) {
  let timer;
  playersSearchInput.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      playersSearchTerm = e.target.value.trim();
      loadPlayers();
    }, 250);
  });
}

async function loadPlayers() {
  const grid = document.getElementById("players-grid");
  if (!grid) return;

  try {
    const params = new URLSearchParams();
    if (playersSearchTerm) params.append("search", playersSearchTerm);
    if (currentPlayersFilter !== "all") params.append("filter", currentPlayersFilter);
    if (currentUser) params.append("currentUser", currentUser);

    const res = await fetch(`/api/social/players?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      renderPlayers(data.players || []);
    }
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
    const stats = p.stats || {};
    const kills = (stats.killsPvp || 0).toLocaleString();
    const blocks = (stats.minedTotal || 0).toLocaleString();
    const isFriend = p.friendship === "friends";
    const isIncoming = p.friendship === "incoming";
    const isOutgoing = p.friendship === "outgoing";

    let actionBtnHtml = "";
    if (!currentUser) {
      actionBtnHtml = `<button class="btn btn-secondary btn-block" onclick="openModal('modal-login')">Conectar</button>`;
    } else if (isFriend) {
      actionBtnHtml = `
        <button class="btn btn-tiktok" style="flex:2; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="openChatWith('${p.username}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </button>
        <button class="btn btn-danger-soft" style="flex:1; display:flex; align-items:center; justify-content:center;" onclick="removeFriend('${p.username}')" title="Eliminar Amigo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
    } else if (isIncoming) {
      actionBtnHtml = `
        <button class="btn btn-tiktok btn-block" onclick="loadFriendRequests()">Responder Solicitud</button>
      `;
    } else if (isOutgoing) {
      actionBtnHtml = `
        <button class="btn btn-secondary btn-block" disabled>Solicitud Enviada</button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn btn-tiktok" style="flex:2; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="sendFriendRequest('${p.username}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Añadir</span>
        </button>
        <button class="btn btn-secondary" style="flex:1; display:flex; align-items:center; justify-content:center;" onclick="openChatWith('${p.username}')" title="Enviar Mensaje Directo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      `;
    }

    const isLinked = !!p.linked;
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
        <div class="player-card-stats" onclick="openProfile('${p.username}')" style="cursor:pointer;" title="Toca para ver estadísticas detalladas">
          <div class="player-card-stat-item">PvP Kills: <strong>${kills}</strong></div>
          <div class="player-card-stat-item">Bloques: <strong>${blocks}</strong></div>
        </div>
        <div class="player-card-actions">
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join("");
}

async function loadFriendRequests() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/social/friends/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const box = document.getElementById("incoming-requests-box");
    const grid = document.getElementById("incoming-requests-grid");

    if (data.ok && data.incomingRequests && data.incomingRequests.length > 0) {
      if (box) box.style.display = "block";
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

window.sendFriendRequest = async (targetUsername) => {
  if (!currentUser) return openModal("modal-login");
  try {
    const res = await fetch("/api/social/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: currentUser, target: targetUsername })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || "Solicitud de amistad enviada.");
      loadPlayers();
    } else {
      showToast(data.error || "No se pudo enviar la solicitud");
    }
  } catch (e) {
    showToast("Error de conexión");
  }
};

window.respondFriendRequest = async (requestId, action) => {
  if (!currentUser) return;
  try {
    const res = await fetch("/api/social/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, requestId, action })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadFriendRequests();
      loadPlayers();
    } else {
      showToast(data.error || "Error al responder solicitud");
    }
  } catch (e) {
    showToast("Error de conexión");
  }
};

window.removeFriend = async (friendUsername) => {
  if (!currentUser) return;
  if (!confirm(`¿Eliminar a ${friendUsername} de tus amigos?`)) return;
  try {
    const res = await fetch("/api/social/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, friendUsername })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadPlayers();
    } else {
      showToast(data.error || "Error al eliminar");
    }
  } catch (e) {
    showToast("Error de conexión");
  }
};

// ============================================================
// CHAT MESSENGER EN TIEMPO REAL
// ============================================================
async function loadConversations() {
  if (!currentUser) return;
  const listEl = document.getElementById("conversations-list");
  if (!listEl) return;

  try {
    const res = await fetch(`/api/social/conversations/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok) {
      const convs = data.conversations || [];
      let totalUnread = 0;

      if (convs.length === 0) {
        listEl.innerHTML = `<div class="messenger-empty-threads">No tienes chats activos aún.<br><small style="color:var(--text-subtle);">Haz clic en "Buscar" para hablar con alguien.</small></div>`;
      } else {
        listEl.innerHTML = convs.map(c => {
          totalUnread += (c.unreadCount || 0);
          const isActive = activeChatPartner && activeChatPartner.toLowerCase() === c.partner.username.toLowerCase();
          const timeStr = c.lastTimestamp ? formatChatTime(c.lastTimestamp) : "";

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
    }
  } catch (e) {
    console.error("Error al cargar conversaciones:", e);
  }
}

function updateSocialBadge(count) {
  const badgeDesktop = document.getElementById("badge-social");
  const badgeMobile = document.getElementById("badge-social-mobile");
  const badgeSubtab = document.getElementById("subtab-chat-badge");

  [badgeDesktop, badgeMobile, badgeSubtab].forEach(badge => {
    if (badge) {
      if (count > 0) {
        badge.style.display = "inline-block";
        badge.textContent = count > 99 ? "99+" : count;
      } else {
        badge.style.display = "none";
      }
    }
  });
}

function formatChatTime(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.openChatWith = async (partnerUsername) => {
  if (!currentUser) return openModal("modal-login");
  if (currentUser.toLowerCase() === partnerUsername.toLowerCase()) {
    return showToast("No puedes chatear contigo mismo.");
  }

  // Activar pestaña Comunidad
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "social"));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
  const viewSocial = document.getElementById("view-social");
  if (viewSocial) viewSocial.classList.add("active");

  switchSocialSubTab("chat");

  activeChatPartner = partnerUsername;

  // Adaptabilidad móvil
  const messengerContainer = document.querySelector(".messenger-container");
  if (messengerContainer) messengerContainer.classList.add("mobile-chat-open");

  // Mostrar área activa
  const emptyState = document.getElementById("chat-empty-state");
  const activeBox = document.getElementById("chat-active-box");
  if (emptyState) emptyState.style.display = "none";
  if (activeBox) activeBox.style.display = "flex";

  document.getElementById("chat-active-name").textContent = partnerUsername;
  document.getElementById("chat-active-avatar").src = `https://mc-heads.net/avatar/${encodeURIComponent(partnerUsername)}/40`;
  document.getElementById("chat-active-status").textContent = "En línea";

  await fetchChatMessages(partnerUsername);
  loadConversations();
};

window.closeChatMobile = () => {
  const messengerContainer = document.querySelector(".messenger-container");
  if (messengerContainer) messengerContainer.classList.remove("mobile-chat-open");
};

async function fetchChatMessages(partnerUsername) {
  const body = document.getElementById("chat-messages-container");
  if (!body) return;

  try {
    const res = await fetch(`/api/social/messages?user1=${encodeURIComponent(currentUser)}&user2=${encodeURIComponent(partnerUsername)}`);
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
    body.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); margin:auto; font-size:0.85rem;">
        Inicia la conversación saludando a <strong>${activeChatPartner}</strong>.
      </div>
    `;
    return;
  }

  body.innerHTML = messages.map(m => {
    const isMine = m.sender.toLowerCase() === currentUser.toLowerCase();
    const time = formatChatTime(m.timestamp);

    return `
      <div class="chat-bubble-row ${isMine ? 'mine' : 'theirs'}" id="msg-${m.id}">
        <div class="chat-bubble">
          ${escapeHtml(m.text)}
        </div>
        <div class="chat-bubble-meta">
          <span>${time}</span>
          ${isMine ? `<button class="chat-del-btn" onclick="deleteMessage('${m.id}')" title="Eliminar mensaje">&times;</button>` : ''}
        </div>
      </div>
    `;
  }).join("");

  body.scrollTop = body.scrollHeight;
}

// Enviar mensaje
const chatForm = document.getElementById("chat-send-form");
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser || !activeChatPartner) return;

    const input = document.getElementById("chat-text-input");
    const text = (input.value || "").trim();
    if (!text) return;

    input.value = "";
    input.focus();

    try {
      const res = await fetch("/api/social/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: currentUser, recipient: activeChatPartner, text })
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

function appendChatMessage(message) {
  if (!message || !message.id) return;
  const body = document.getElementById("chat-messages-container");
  if (!body) return;

  // Evitar mensajes duplicados si ya existen en el DOM
  if (document.getElementById(`msg-${message.id}`)) {
    return;
  }

  const isMine = message.sender.toLowerCase() === currentUser.toLowerCase();
  const time = formatChatTime(message.timestamp);

  const row = document.createElement("div");
  row.className = `chat-bubble-row ${isMine ? 'mine' : 'theirs'}`;
  row.id = `msg-${message.id}`;
  row.innerHTML = `
    <div class="chat-bubble">
      ${escapeHtml(message.text)}
    </div>
    <div class="chat-bubble-meta">
      <span>${time}</span>
      ${isMine ? `<button class="chat-del-btn" onclick="deleteMessage('${message.id}')" title="Eliminar mensaje">&times;</button>` : ''}
    </div>
  `;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

// Borrar chat completo ("borrar chat" estilo Messenger)
const btnClearChat = document.getElementById("btn-clear-active-chat");
if (btnClearChat) {
  btnClearChat.onclick = async () => {
    if (!currentUser || !activeChatPartner) return;
    if (!confirm(`¿Estás seguro de que deseas borrar toda la conversación con ${activeChatPartner}? Se eliminarán todos los mensajes.`)) {
      return;
    }

    try {
      const res = await fetch("/api/social/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, partner: activeChatPartner })
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
    } catch (e) {
      showToast("Error de conexión");
    }
  };
}

window.deleteMessage = async (messageId) => {
  if (!currentUser || !activeChatPartner) return;
  try {
    const res = await fetch(`/api/social/message/${messageId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, partner: activeChatPartner })
    });
    const data = await res.json();
    if (data.ok) {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) el.remove();
      loadConversations();
    }
  } catch (e) {}
};

// Ver perfil del jugador con el que se chatea
const btnViewChatProfile = document.getElementById("btn-view-chat-profile");
if (btnViewChatProfile) {
  btnViewChatProfile.onclick = () => {
    if (!activeChatPartner) return;
    viewOtherPlayerProfile(activeChatPartner);
  };
}

window.viewOtherPlayerProfile = async (targetUsername) => {
  try {
    const res = await fetch(`/api/players/profile/${encodeURIComponent(targetUsername)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      const u = data.user;
      document.getElementById("profile-gamertag").textContent = u.displayName || u.username;
      document.getElementById("profile-avatar-img").src = u.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/100`;
      document.getElementById("profile-wallet-val").textContent = `${(u.wallet || 0).toLocaleString()} NC`;
      document.getElementById("profile-bank-val").textContent = `${(u.bank || 0).toLocaleString()} NC`;

      const stats = u.stats || {};
      const tierBadge = document.getElementById("profile-tier-badge");
      if (tierBadge) tierBadge.textContent = u.equippedRank || stats.equippedRank || stats.tier || "NOVICIO";
      
      const activeTitle = document.getElementById("profile-active-title");
      const titleName = u.selectedTitle || stats.activeTitle || "Novato";
      if (activeTitle) activeTitle.textContent = `Título: [${titleName}]`;

      document.getElementById("profile-stat-pvp").textContent = (stats.killsPvp || 0).toLocaleString();
      document.getElementById("profile-stat-mobs").textContent = (stats.killsTotalMobs || 0).toLocaleString();
      document.getElementById("profile-stat-diamond").textContent = (stats.minedDiamond || 0).toLocaleString();
      document.getElementById("profile-stat-mined").textContent = (stats.minedTotal || 0).toLocaleString();

      openModal("modal-profile");
    }
  } catch (e) {
    showToast("No se pudo cargar el perfil");
  }
};

// Buzón & Entregas
async function loadDeliveries() {
  if (!currentUser) return;
  const tbody = document.getElementById("deliveries-tbody");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</td></tr>`;

  try {
    const res = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const list = data.deliveries || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes entregas pendientes en el buzón.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue = d.reportedIssue;
      let badgeHtml = isDelivered ? `<span class="badge success">Entregado</span>` : `<span class="badge warning">En Cola</span>`;
      if (hasIssue) badgeHtml = `<span class="badge danger">Reportado</span>`;

      return `
        <tr>
          <td><strong>${d.itemTitle || "Artículo"}</strong></td>
          <td style="font-size:0.82rem; color:var(--text-muted);">${new Date(d.createdAt).toLocaleString()}</td>
          <td>${badgeHtml}</td>
          <td>
            ${hasIssue
              ? `<span style="font-size:0.8rem; color:var(--red); font-weight:600;">En revisión</span>`
              : `<button class="btn btn-danger btn-sm" onclick="openReportModal('${d.id}')">Reportar Problema</button>`
            }
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--red);">Error al cargar entregas</td></tr>`;
  }
}

document.getElementById("btn-refresh-deliveries").onclick = loadDeliveries;

window.openReportModal = (deliveryId) => {
  document.getElementById("report-delivery-id").value = deliveryId;
  openModal("modal-report");
};

document.getElementById("report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const deliveryId = document.getElementById("report-delivery-id").value;
  const note = document.getElementById("report-note").value.trim();

  try {
    const res = await fetch("/api/deliveries/report-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId, username: currentUser, note })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-report");
      document.getElementById("report-form").reset();
      showToast("Reporte enviado al Administrador.");
      loadDeliveries();
    } else {
      showToast(data.error || "Error al enviar reporte");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// Top Ricos
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-tbody");
  try {
    const res = await fetch("/api/players/leaderboard");
    const data = await res.json();
    const list = data.leaderboard || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Sin datos de clasificación.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((p, idx) => `
      <tr>
        <td style="font-weight:700; color:${idx < 3 ? 'var(--tiktok-red)' : 'var(--text-muted)'};">${idx + 1}</td>
        <td><strong>${p.username}</strong></td>
        <td>${p.wallet.toLocaleString()} NC</td>
        <td>${p.bank.toLocaleString()} NC</td>
        <td style="font-weight:700; color:var(--emerald);">${p.total.toLocaleString()} NC</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red);">Error cargando ranking</td></tr>`;
  }
}

// WebSocket en tiempo real
function initWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const eventType = msg.type || msg.event;

      if (eventType === "USER_LINKED") {
        const isTarget = (pendingSessionToken && msg.sessionToken === pendingSessionToken) ||
                         (pendingAuthUsername && (
                           (msg.username && msg.username.toLowerCase() === pendingAuthUsername.toLowerCase()) ||
                           (msg.displayName && msg.displayName.toLowerCase() === pendingAuthUsername.toLowerCase())
                         ));
        if (isTarget && msg.user) {
          completeAuth(msg.user);
        }
      }
      else if (eventType === "STORE_UPDATED") loadStore();
      else if (eventType === "STATS_UPDATED" && currentUser && msg.username?.toLowerCase() === currentUser.toLowerCase()) {
        const stats = msg.stats || {};
        const pPvp = document.getElementById("profile-stat-pvp");
        if (pPvp) pPvp.textContent = (stats.killsPvp || 0).toLocaleString();
        const pMobs = document.getElementById("profile-stat-mobs");
        if (pMobs) pMobs.textContent = (stats.killsTotalMobs || 0).toLocaleString();
        const pDia = document.getElementById("profile-stat-diamond");
        if (pDia) pDia.textContent = (stats.minedDiamond || 0).toLocaleString();
        const pMin = document.getElementById("profile-stat-mined");
        if (pMin) pMin.textContent = (stats.minedTotal || 0).toLocaleString();
        const pTier = document.getElementById("profile-tier-badge");
        if (pTier) pTier.textContent = msg.equippedRank || stats.equippedRank || stats.tier || "NOVICIO";
        const pTitle = document.getElementById("profile-active-title");
        const titleName = msg.selectedTitle || stats.activeTitle || "Novato";
        if (pTitle) pTitle.textContent = `Título: [${titleName}]`;
        const pCount = document.getElementById("profile-titles-count");
        if (pCount) pCount.textContent = `${stats.unlockedCount || 0} / 34 Títulos`;
      }
      else if (eventType === "CHAT_MESSAGE" && currentUser) {
        const m = msg.message;
        if (m) {
          const isForMe = m.recipient?.toLowerCase() === currentUser.toLowerCase();
          const isFromMe = m.sender?.toLowerCase() === currentUser.toLowerCase();
          if (isForMe || isFromMe) {
            if (activeChatPartner && (activeChatPartner.toLowerCase() === m.sender?.toLowerCase() || activeChatPartner.toLowerCase() === m.recipient?.toLowerCase())) {
              appendChatMessage(m);
            } else if (isForMe) {
              showToast(`Nuevo mensaje de ${m.sender}`);
            }
            loadConversations();
          }
        }
      }
      else if (eventType === "CHAT_CLEARED") {
        if (activeConversationId === msg.conversationId) {
          const body = document.getElementById("chat-messages-container");
          if (body) body.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin:auto; font-size:0.85rem;">Conversación eliminada.</div>`;
        }
        loadConversations();
      }
      else if (eventType === "CHAT_MESSAGE_DELETED") {
        const el = document.getElementById(`msg-${msg.messageId}`);
        if (el) el.remove();
        loadConversations();
      }
      else if (eventType === "FRIEND_REQUEST" && currentUser) {
        if (msg.target?.toLowerCase() === currentUser.toLowerCase()) {
          showToast(`¡${msg.sender} te envió una solicitud de amistad!`);
          loadFriendRequests();
          loadPlayers();
        }
      }
      else if (eventType === "FRIEND_ACCEPTED" && currentUser) {
        const u1 = (msg.user1 || "").toLowerCase();
        const u2 = (msg.user2 || "").toLowerCase();
        const cLow = currentUser.toLowerCase();
        if (u1 === cLow || u2 === cLow) {
          const other = u1 === cLow ? msg.user2 : msg.user1;
          showToast(`¡Ahora eres amigo de ${other}!`);
          loadPlayers();
          loadFriendRequests();
        }
      }
      else if (eventType === "P2P_NEW_LISTING" || eventType === "P2P_BOUGHT" || eventType === "P2P_DELETED") {
        loadMarket();
      }
      else if (eventType === "BALANCE_UPDATE" && currentUser && msg.data?.username?.toLowerCase() === currentUser.toLowerCase()) {
        loadBalance();
      }
      else if (eventType === "NEW_ORDER" || eventType === "ORDER_APPROVED") {
        if (currentUser) loadBalance();
      }
    } catch (err) {}
  };

  ws.onclose = () => { setTimeout(initWS, 4000); };
}

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  validateCurrentSession();
  updateAuthUI();
  loadStore();
  initWS();
});
