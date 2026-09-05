// ── Cliente API y Notificaciones Toast Ultraligero ─────────────

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatCoins(num) {
  return (Math.floor(Number(num) || 0)).toLocaleString("es-ES") + " NC";
}

export function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
  toast.innerHTML = `<span style="font-weight:700; margin-right:8px;">${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

export async function apiRequest(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const adminToken = localStorage.getItem("nodowa_admin_token");
  if (adminToken) headers["x-admin-token"] = adminToken;

  try {
    const res = await fetch(url, { ...options, credentials: "omit", headers: options.isFormData ? (delete headers["Content-Type"], headers) : headers });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`[API Error] ${url}:`, err);
    return { ok: false, error: "Error de comunicación con el servidor." };
  }
}
