// profile.js — Modal perfil, editar bio, redes sociales y foto de perfil
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

let pendingAvatarFile = null;
let pendingAvatarUrl = null;

export async function openProfile(targetUser) {
  const userToLoad = targetUser || state.currentUser;
  if (!userToLoad) return openModal("modal-login");

  const isSelf = state.currentUser && userToLoad.toLowerCase() === state.currentUser.toLowerCase();

  // Si es el propio usuario, abrimos el modal de perfil con stats
  if (isSelf) {
    const preview     = document.getElementById("profile-modal-avatar-preview");
    const editPreview = document.getElementById("profile-edit-avatar-preview");
    const bioInput    = document.getElementById("profile-bio-input");
    const discordInput= document.getElementById("profile-social-discord");
    const nameEl      = document.getElementById("profile-gamertag-own");

    if (nameEl)    nameEl.textContent = state.currentUser;
    if (preview)   preview.src   = state.currentUserAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(userToLoad)}/80`;
    if (editPreview) editPreview.src = state.currentUserAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(userToLoad)}/64`;

    // Mostrar saldos ya disponibles en state
    const wVal = document.getElementById("profile-wallet-val");
    const bVal = document.getElementById("profile-bank-val");
    if (wVal) wVal.textContent = `${(state.userData.wallet || 0).toLocaleString()} NC`;
    if (bVal) bVal.textContent = `${(state.userData.bank   || 0).toLocaleString()} NC`;

    openModal("modal-profile");

    try {
      const res  = await fetch(`/api/players/profile/${encodeURIComponent(userToLoad)}`);
      const data = await res.json();
      if (data.ok && data.user) {
        const u = data.user;

        // Avatar
        if (u.avatarUrl) {
          state.currentUserAvatar = u.avatarUrl;
          localStorage.setItem("nodowa_avatar", u.avatarUrl);
          if (preview)    preview.src    = u.avatarUrl;
          if (editPreview) editPreview.src = u.avatarUrl;
          const hImg = document.getElementById("header-avatar-img");
          if (hImg) hImg.src = u.avatarUrl;
        }

        // Bio / Discord
        if (bioInput)     bioInput.value     = u.bio || "";
        if (discordInput) discordInput.value = (u.socialLinks && u.socialLinks.discord) || "";

        // Saldos actualizados
        if (wVal) wVal.textContent = `${(u.wallet || 0).toLocaleString()} NC`;
        if (bVal) bVal.textContent = `${(u.bank   || 0).toLocaleString()} NC`;

        // Rango y título
        const tierBadge   = document.getElementById("profile-tier-badge");
        const activeTitle = document.getElementById("profile-active-title");
        const titlesCount = document.getElementById("profile-titles-count");
        const stats       = u.stats || {};
        if (tierBadge)   tierBadge.textContent   = u.equippedRank || stats.equippedRank || stats.tier || "NOVICIO";
        if (activeTitle) activeTitle.textContent = `Título: [${u.selectedTitle || stats.activeTitle || "Novato"}]`;
        if (titlesCount) titlesCount.textContent = `${stats.unlockedCount || 0} / 34 Títulos`;

        // Stats de juego
        const setPvp  = document.getElementById("profile-stat-pvp");
        const setMobs = document.getElementById("profile-stat-mobs");
        const setDia  = document.getElementById("profile-stat-diamond");
        const setMin  = document.getElementById("profile-stat-mined");
        if (setPvp)  setPvp.textContent  = (stats.killsPvp      || 0).toLocaleString();
        if (setMobs) setMobs.textContent = (stats.killsTotalMobs || 0).toLocaleString();
        if (setDia)  setDia.textContent  = (stats.minedDiamond   || 0).toLocaleString();
        if (setMin)  setMin.textContent  = (stats.minedTotal     || 0).toLocaleString();
      }
    } catch (err) {}

    pendingAvatarFile = null;
    pendingAvatarUrl  = null;
    return;
  }

  // Si es otro usuario, redirigir a su tienda/perfil o abrir chat
  window.navigateTo(`/${encodeURIComponent(userToLoad)}`);
}

// Previsualizar foto de perfil seleccionada
export function previewAvatarFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  pendingAvatarFile = file;
  pendingAvatarUrl = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById("profile-modal-avatar-preview");
    if (preview) preview.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.previewAvatarFile = previewAvatarFile;

// Usar Skin oficial de Minecraft Bedrock
export function useMinecraftSkinAvatar() {
  if (!state.currentUser) return;
  const mcUrl = `https://mc-heads.net/avatar/${encodeURIComponent(state.currentUser)}/128`;
  pendingAvatarUrl = mcUrl;
  pendingAvatarFile = null;

  const preview = document.getElementById("profile-modal-avatar-preview");
  if (preview) preview.src = mcUrl;

  const fileInput = document.getElementById("profile-modal-avatar-file");
  if (fileInput) fileInput.value = "";

  showToast("Skin de Minecraft seleccionada.");
}
window.useMinecraftSkinAvatar = useMinecraftSkinAvatar;

// Guardar todos los cambios del perfil (foto + bio + redes)
export async function saveFullProfile(event) {
  if (event) event.preventDefault();
  if (!state.currentUser) return;

  const btn = document.getElementById("btn-save-profile");
  if (btn) btn.disabled = true;

  const bio = (document.getElementById("profile-bio-input")?.value || "").trim();
  const discord = (document.getElementById("profile-social-discord")?.value || "").trim();

  try {
    // 1. Guardar avatar si cambió
    if (pendingAvatarFile) {
      const fd = new FormData();
      fd.append("username", state.currentUser);
      fd.append("avatarFile", pendingAvatarFile);
      const resAv = await fetch("/api/players/avatar", { method: "POST", body: fd });
      const dataAv = await resAv.json();
      if (dataAv.ok && dataAv.avatarUrl) {
        state.currentUserAvatar = dataAv.avatarUrl;
        localStorage.setItem("nodowa_avatar", state.currentUserAvatar);
        const headerImg = document.getElementById("header-avatar-img");
        if (headerImg) headerImg.src = state.currentUserAvatar;
      }
    } else if (pendingAvatarUrl) {
      const resAv = await fetch("/api/players/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: state.currentUser, avatarUrl: pendingAvatarUrl })
      });
      const dataAv = await resAv.json();
      if (dataAv.ok && dataAv.avatarUrl) {
        state.currentUserAvatar = dataAv.avatarUrl;
        localStorage.setItem("nodowa_avatar", state.currentUserAvatar);
        const headerImg = document.getElementById("header-avatar-img");
        if (headerImg) headerImg.src = state.currentUserAvatar;
      }
    }

    // 2. Guardar bio y redes
    const resProf = await fetch("/api/players/profile/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: state.currentUser,
        bio,
        socialLinks: { discord }
      })
    });
    const dataProf = await resProf.json();

    if (dataProf.ok) {
      closeModal("modal-profile");
      showToast("✓ Perfil y foto actualizados con éxito.");
    } else {
      showToast(dataProf.error || "Error al actualizar perfil");
    }
  } catch (err) {
    showToast("Error de conexión al guardar cambios");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.saveFullProfile = saveFullProfile;
window.openProfile = openProfile;

export function initProfileListeners() {
  window.openProfile = openProfile;
}

