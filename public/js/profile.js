// profile.js — Modal perfil, editar bio y redes sociales, avatar
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

export async function openProfile(targetUser) {
  const userToLoad = targetUser || state.currentUser;
  if (!userToLoad) return openModal("modal-login");

  const isSelf = state.currentUser && userToLoad.toLowerCase() === state.currentUser.toLowerCase();

  const avatarImg     = document.getElementById("profile-avatar-img");
  const avatarEditBtn = document.getElementById("btn-open-avatar-modal");
  const ownActions    = document.getElementById("profile-own-actions");
  const otherActions  = document.getElementById("profile-other-actions");
  const editBioShortcut = document.getElementById("btn-edit-bio-shortcut");

  if (avatarEditBtn)  avatarEditBtn.style.display  = isSelf ? "flex"  : "none";
  if (ownActions)     ownActions.style.display     = isSelf ? "flex"  : "none";
  if (otherActions)   otherActions.style.display   = isSelf ? "none"  : "flex";
  if (editBioShortcut) editBioShortcut.style.display = isSelf ? "inline-block" : "none";

  document.getElementById("profile-gamertag").textContent = userToLoad;
  if (avatarImg) avatarImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(userToLoad)}/100`;

  if (!isSelf) {
    const btnChat     = document.getElementById("btn-other-profile-chat");
    const btnTransfer = document.getElementById("btn-other-profile-transfer");
    const btnFriend   = document.getElementById("btn-other-profile-friend");
    if (btnChat)     btnChat.onclick     = () => { closeModal("modal-profile"); window.openChatWith(userToLoad); };
    if (btnTransfer) btnTransfer.onclick = () => { closeModal("modal-profile"); window.openQuickTransfer(userToLoad); };
    if (btnFriend)   btnFriend.onclick   = () => window.sendFriendRequest(userToLoad);
  }

  openModal("modal-profile");

  try {
    const res  = await fetch(`/api/players/profile/${encodeURIComponent(userToLoad)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      const u = data.user;
      if (isSelf) {
        state.userProfileData = u;
        if (u.avatarUrl) {
          state.currentUserAvatar = u.avatarUrl;
          localStorage.setItem("nodowa_avatar", state.currentUserAvatar);
          const hImg = document.getElementById("header-avatar-img");
          if (hImg) hImg.src = state.currentUserAvatar;
        }
      }

      if (avatarImg && u.avatarUrl) avatarImg.src = u.avatarUrl;

      // Estado vinculado
      const chipLinked = document.getElementById("profile-chip-linked");
      const textLinked = document.getElementById("profile-linked-text");
      if (chipLinked && textLinked) {
        if (u.linked) {
          chipLinked.className          = "chip chip-linked";
          chipLinked.style.background   = "";
          chipLinked.style.color        = "";
          textLinked.textContent        = "Vinculado Bedrock";
        } else {
          chipLinked.className          = "chip chip-tier";
          chipLinked.style.background   = "var(--red-light)";
          chipLinked.style.color        = "var(--red)";
          textLinked.textContent        = "No Vinculado";
        }
      }

      // Rango y título
      const stats     = u.stats || {};
      const tierBadge = document.getElementById("profile-tier-badge");
      if (tierBadge) tierBadge.textContent = u.equippedRank || stats.equippedRank || stats.tier || "NOVICIO";

      const activeTitle = document.getElementById("profile-active-title");
      const titleName   = u.selectedTitle || stats.activeTitle || "Novato";
      if (activeTitle) activeTitle.textContent = `Título: [${titleName}]`;

      // Bio
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

      renderProfileSocials(u.socialLinks || {});

      // Balances
      document.getElementById("profile-wallet-val").textContent = `${(u.wallet || 0).toLocaleString()} NC`;
      document.getElementById("profile-bank-val").textContent   = `${(u.bank   || 0).toLocaleString()} NC`;

      // Stats
      const titlesCount = document.getElementById("profile-titles-count");
      if (titlesCount) titlesCount.textContent = `${stats.unlockedCount || 0} / 34 Títulos`;
      document.getElementById("profile-stat-pvp").textContent     = (stats.killsPvp      || 0).toLocaleString();
      document.getElementById("profile-stat-mobs").textContent    = (stats.killsTotalMobs|| 0).toLocaleString();
      document.getElementById("profile-stat-diamond").textContent = (stats.minedDiamond  || 0).toLocaleString();
      document.getElementById("profile-stat-mined").textContent   = (stats.minedTotal    || 0).toLocaleString();
    }
  } catch (err) {
    console.error("Error al cargar perfil:", err);
  }
}

function renderProfileSocials(socials) {
  const container = document.getElementById("profile-socials-row");
  if (!container) return;

  const valid = [];
  if (socials.discord) {
    const isUrl = socials.discord.startsWith("http");
    valid.push(`<span class="social-pill-link" ${isUrl ? `onclick="window.open('${socials.discord}', '_blank')"` : `onclick="navigator.clipboard.writeText('${socials.discord}'); showToast('Discord copiado: ${socials.discord}');"`} style="cursor:pointer;" title="Discord">💬 Discord: ${escapeHtml(socials.discord.replace(/^https?:\/\//, ''))}</span>`);
  }
  if (socials.youtube)   valid.push(`<a href="${socials.youtube}"   target="_blank" rel="noopener" class="social-pill-link" style="color:#ef4444;">📺 YouTube</a>`);
  if (socials.tiktok)    valid.push(`<a href="${socials.tiktok}"    target="_blank" rel="noopener" class="social-pill-link">🎵 TikTok</a>`);
  if (socials.twitch)    valid.push(`<a href="${socials.twitch}"    target="_blank" rel="noopener" class="social-pill-link" style="color:#9333ea;">🎮 Twitch</a>`);
  if (socials.instagram) valid.push(`<a href="${socials.instagram}" target="_blank" rel="noopener" class="social-pill-link" style="color:#ec4899;">📸 Instagram</a>`);
  if (socials.twitter)   valid.push(`<a href="${socials.twitter}"   target="_blank" rel="noopener" class="social-pill-link">✖️ X / Twitter</a>`);

  container.innerHTML = valid.length > 0
    ? valid.join("")
    : `<small style="color:var(--text-subtle); font-size:0.75rem;">Sin redes sociales vinculadas</small>`;
}

function openEditProfileModal() {
  if (!state.currentUser) return openModal("modal-login");
  const socials = (state.userProfileData && state.userProfileData.socialLinks) || {};
  const setVal  = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };

  setVal("edit-profile-bio",      (state.userProfileData && state.userProfileData.bio) || "");
  setVal("edit-social-discord",   socials.discord   || "");
  setVal("edit-social-youtube",   socials.youtube   || "");
  setVal("edit-social-tiktok",    socials.tiktok    || "");
  setVal("edit-social-twitch",    socials.twitch    || "");
  setVal("edit-social-instagram", socials.instagram || "");
  setVal("edit-social-twitter",   socials.twitter   || "");
  openModal("modal-edit-profile");
}

async function saveAvatar(avatarUrl) {
  try {
    const res  = await fetch("/api/players/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: state.currentUser, avatarUrl })
    });
    const data = await res.json();
    if (data.ok) {
      state.currentUserAvatar = data.avatarUrl;
      localStorage.setItem("nodowa_avatar", state.currentUserAvatar);
      const hImg = document.getElementById("header-avatar-img");
      const pImg = document.getElementById("profile-avatar-img");
      if (hImg) hImg.src = state.currentUserAvatar;
      if (pImg) pImg.src = state.currentUserAvatar;
      closeModal("modal-avatar");
      showToast("Foto de perfil actualizada con éxito.");
    } else {
      showToast(data.error || "No se pudo actualizar la foto");
    }
  } catch (err) {
    showToast("Error de conexión al guardar foto");
  }
}

export function initProfile() {
  document.getElementById("btn-open-edit-profile")?.addEventListener("click", openEditProfileModal);
  document.getElementById("btn-edit-bio-shortcut")?.addEventListener("click", openEditProfileModal);

  document.getElementById("edit-profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const bio = document.getElementById("edit-profile-bio").value.trim();
    const socialLinks = {
      discord:   document.getElementById("edit-social-discord").value.trim(),
      youtube:   document.getElementById("edit-social-youtube").value.trim(),
      tiktok:    document.getElementById("edit-social-tiktok").value.trim(),
      twitch:    document.getElementById("edit-social-twitch").value.trim(),
      instagram: document.getElementById("edit-social-instagram").value.trim(),
      twitter:   document.getElementById("edit-social-twitter").value.trim()
    };
    try {
      const res  = await fetch("/api/players/profile/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: state.currentUser, bio, socialLinks })
      });
      const data = await res.json();
      if (data.ok) {
        if (state.userProfileData) { state.userProfileData.bio = data.bio; state.userProfileData.socialLinks = data.socialLinks; }
        closeModal("modal-edit-profile");
        showToast("Perfil actualizado correctamente");
        openProfile(state.currentUser);
      } else { showToast(data.error || "No se pudo actualizar el perfil"); }
    } catch (err) { showToast("Error de conexión al guardar"); }
  });

  document.getElementById("btn-open-avatar-modal")?.addEventListener("click", () => openModal("modal-avatar"));

  document.getElementById("btn-avatar-minecraft")?.addEventListener("click", async () => {
    if (!state.currentUser) return;
    await saveAvatar(`https://mc-heads.net/avatar/${encodeURIComponent(state.currentUser)}/128`);
  });

  document.getElementById("avatar-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const fileInput = document.getElementById("avatar-file-input");
    const urlInput  = document.getElementById("avatar-url-input");
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = async (ev) => await saveAvatar(ev.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    } else if (urlInput && urlInput.value.trim()) {
      await saveAvatar(urlInput.value.trim());
    } else {
      showToast("Selecciona una imagen o ingresa una URL");
    }
  });

  window.openProfile = openProfile;
}

export const initProfileListeners = initProfile;

