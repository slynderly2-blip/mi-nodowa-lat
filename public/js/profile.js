// profile.js — Modal perfil, editar bio, redes sociales y foto de perfil
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

let pendingAvatarFile = null;
let pendingAvatarUrl = null;

export async function openProfile(targetUser) {
  const userToLoad = targetUser || state.currentUser;
  if (!userToLoad) return openModal("modal-login");

  const isSelf = state.currentUser && userToLoad.toLowerCase() === state.currentUser.toLowerCase();

  // Si es el propio usuario, abrimos el modal de edición de perfil y foto
  if (isSelf) {
    const preview = document.getElementById("profile-modal-avatar-preview");
    const bioInput = document.getElementById("profile-bio-input");
    const discordInput = document.getElementById("profile-social-discord");

    if (preview) {
      preview.src = state.currentUserAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(userToLoad)}/80`;
    }

    try {
      const res = await fetch(`/api/players/profile/${encodeURIComponent(userToLoad)}`);
      const data = await res.json();
      if (data.ok && data.user) {
        const u = data.user;
        if (preview && u.avatarUrl) preview.src = u.avatarUrl;
        if (bioInput) bioInput.value = u.bio || "";
        if (discordInput) discordInput.value = (u.socialLinks && u.socialLinks.discord) || "";
      }
    } catch (err) {}

    pendingAvatarFile = null;
    pendingAvatarUrl = null;
    openModal("modal-profile");
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

