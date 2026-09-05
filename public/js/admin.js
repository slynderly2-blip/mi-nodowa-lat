// ── Panel Administrativo Modular, Reactivo y Minimalista ─────────
import { apiRequest, showToast, escapeHtml, formatCoins } from "./api.js";
import { socket } from "./ws.js";

let adminToken = localStorage.getItem("nodowa_admin_token") || null;
let currentAdminTab = "orders";
let allAdminPlayers = [];

document.addEventListener("DOMContentLoaded", () => {
  renderAdminIcons();
  setupAdminAuth();
  setupAdminNavigation();
  setupAdminForms();
  setupAdminWebSocket();

  if (adminToken) {
    showAdminPanel();
  }
});

function renderAdminIcons(container = document) {
  const slots = container.querySelectorAll(".icon-slot");
  slots.forEach(slot => {
    const iconName = slot.getAttribute("data-icon");
    if (iconName && typeof window.getIcon === "function") {
      slot.innerHTML = window.getIcon(iconName);
    }
  });
}

// ── 1. AUTENTICACIÓN ADMIN ─────────────────────────────────────
function setupAdminAuth() {
  document.getElementById("form-admin-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("admin-pass-input")?.value.trim();
    if (!pass) return showToast("Ingresa la contraseña", "error");

    const res = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: pass })
    });

    if (res.ok && res.token) {
      adminToken = res.token;
      localStorage.setItem("nodowa_admin_token", adminToken);
      showToast("¡Sesión administrativa iniciada!", "success");
      showAdminPanel();
    } else {
      showToast(res.error || "Contraseña incorrecta", "error");
    }
  });
}

function showAdminPanel() {
  document.getElementById("admin-login-view").style.display = "none";
  document.getElementById("admin-panel-view").style.display = "block";
  document.getElementById("btn-admin-logout").style.display = "inline-flex";

  loadAdminStats();
  switchAdminTab("orders");
}

export function adminLogout() {
  adminToken = null;
  localStorage.removeItem("nodowa_admin_token");
  document.getElementById("admin-login-view").style.display = "block";
  document.getElementById("admin-panel-view").style.display = "none";
  document.getElementById("btn-admin-logout").style.display = "none";
  showToast("Sesión cerrada.", "info");
}

// ── 2. NAVEGACIÓN Y MÉTRICAS ───────────────────────────────────
function setupAdminNavigation() {
  document.querySelectorAll("[data-admin-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-admin-tab");
      switchAdminTab(target);
    });
  });
}

function switchAdminTab(tabId) {
  currentAdminTab = tabId;

  document.querySelectorAll("[data-admin-tab]").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-admin-tab") === tabId);
  });

  document.querySelectorAll(".admin-tab-view").forEach(v => {
    v.classList.remove("active");
    v.style.display = "none";
  });

  const activeView = document.getElementById(`admin-view-${tabId}`);
  if (activeView) {
    activeView.classList.add("active");
    activeView.style.display = "block";
  }

  if (tabId === "orders") loadAdminOrders();
  else if (tabId === "catalog") loadAdminCatalog();
  else if (tabId === "players") loadAdminPlayers();
  else if (tabId === "delivery-issues") loadAdminDeliveryIssues();
  else if (tabId === "qr") loadAdminQR();
  else if (tabId === "reports") loadAdminReports();

  renderAdminIcons();
}

async function loadAdminStats() {
  const res = await apiRequest("/api/admin/stats");
  if (res.ok && res.stats) {
    const s = res.stats;
    document.getElementById("stat-pending-orders").textContent = s.pendingOrders;
    document.getElementById("stat-total-sales").textContent = `$${s.totalSalesUsdt.toFixed(2)}`;
    document.getElementById("stat-total-users").textContent = s.totalUsers;
    document.getElementById("stat-total-coins").textContent = formatCoins(s.totalCoins);

    // Badge de reclamos pendientes
    const badgeIssues = document.getElementById("badge-delivery-issues");
    if (badgeIssues) {
      if (s.pendingDeliveryIssues > 0) {
        badgeIssues.textContent = s.pendingDeliveryIssues;
        badgeIssues.style.display = "inline-block";
      } else {
        badgeIssues.style.display = "none";
      }
    }
  }
}

// ── 3. COMPROBANTES Y ÓRDENES BINANCE ──────────────────────────
async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-table");
  if (!tbody) return;

  const res = await apiRequest("/api/admin/orders");
  if (res.ok && res.orders) {
    if (res.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center; padding:2rem;">No hay órdenes registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.orders.map(o => {
      const isPending = o.status === "PENDING";
      const badge = o.status === "APPROVED"
        ? `<span class="badge text-emerald" style="background: rgba(16, 185, 129, 0.15);">APROBADO</span>`
        : o.status === "REJECTED"
        ? `<span class="badge text-rose" style="background: rgba(244, 63, 94, 0.15);">RECHAZADO</span>`
        : `<span class="badge text-amber" style="background: rgba(245, 158, 11, 0.15);">PENDIENTE</span>`;

      return `
        <tr>
          <td class="mono text-muted" style="font-size:0.8rem;">${new Date(o.createdAt).toLocaleDateString()}</td>
          <td><strong>${escapeHtml(o.username)}</strong></td>
          <td>${escapeHtml(o.itemTitle)}</td>
          <td class="mono text-emerald" style="font-weight:700;">$${Number(o.priceUsdt || 0).toFixed(2)}</td>
          <td class="mono" style="font-size:0.75rem;">${escapeHtml(o.txid || '—')}</td>
          <td>
            ${o.receiptImage ? `<a href="${o.receiptImage}" target="_blank"><img src="${o.receiptImage}" class="receipt-thumb"></a>` : '—'}
          </td>
          <td>${badge}</td>
          <td>
            ${isPending ? `
              <div style="display:flex; gap:0.4rem;">
                <button class="cat-btn" style="color:#10b981;" onclick="approveOrder('${o.id}')">Aprobar</button>
                <button class="cat-btn" style="color:#ef4444;" onclick="rejectOrder('${o.id}')">Rechazar</button>
              </div>
            ` : `<span class="text-muted" style="font-size:0.8rem;">Procesado</span>`}
          </td>
        </tr>
      `;
    }).join("");
    renderAdminIcons(tbody);
  }
}

window.approveOrder = async function(orderId) {
  const note = prompt("Nota opcional de aprobación:", "Aprobado por el Administrador");
  const res = await apiRequest("/api/admin/orders/approve", {
    method: "POST",
    body: JSON.stringify({ orderId, note })
  });
  if (res.ok) {
    showToast("¡Orden aprobada exitosamente!", "success");
    loadAdminOrders();
    loadAdminStats();
  } else {
    showToast(res.error || "Error al aprobar.", "error");
  }
};

window.rejectOrder = async function(orderId) {
  const reason = prompt("Motivo de rechazo:", "Comprobante no válido o TXID duplicado");
  const res = await apiRequest("/api/admin/orders/reject", {
    method: "POST",
    body: JSON.stringify({ orderId, reason })
  });
  if (res.ok) {
    showToast("Orden rechazada.", "info");
    loadAdminOrders();
    loadAdminStats();
  } else {
    showToast(res.error || "Error al rechazar.", "error");
  }
};

// ── 4. RECLAMOS DE ENTREGAS ("NO RECIBÍ MI PRODUCTO") ──────────
async function loadAdminDeliveryIssues() {
  const tbody = document.getElementById("admin-delivery-issues-table");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center; padding:2rem;">Cargando reclamos...</td></tr>`;

  const res = await apiRequest("/api/admin/delivery-issues");
  if (res.ok && res.issues) {
    if (res.issues.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center; padding:2rem;">No hay reclamos de entregas pendientes. ¡Todo en orden!</td></tr>`;
      return;
    }

    tbody.innerHTML = res.issues.map(iss => {
      const isPending = iss.status === "PENDING";
      const badge = iss.status === "REDELIVERED"
        ? `<span class="badge text-cyan" style="background:rgba(6, 182, 212, 0.15);">RE-ENTREGADO</span>`
        : iss.status === "RESOLVED"
        ? `<span class="badge text-emerald" style="background:rgba(16, 185, 129, 0.15);">RESUELTO</span>`
        : iss.status === "DISMISSED"
        ? `<span class="badge text-muted" style="background:rgba(100, 116, 139, 0.15);">DESESTIMADO</span>`
        : `<span class="badge text-rose" style="background:rgba(239, 68, 68, 0.15); font-weight:800;">PENDIENTE</span>`;

      return `
        <tr>
          <td class="mono text-muted" style="font-size:0.8rem;">${new Date(iss.createdAt).toLocaleDateString()}</td>
          <td><strong style="color:var(--text-main);">${escapeHtml(iss.player)}</strong></td>
          <td><strong>${escapeHtml(iss.itemTitle)}</strong></td>
          <td class="mono text-muted" style="font-size:0.75rem;">${escapeHtml(iss.command || 'Manual')}</td>
          <td style="max-width:260px; font-size:0.85rem; color:#b91c1c; font-weight:600;">
            ${escapeHtml(iss.note || 'El jugador reportó no haber recibido su ítem.')}
          </td>
          <td>${badge}</td>
          <td>
            ${isPending ? `
              <div style="display:flex; gap:0.4rem;">
                <button class="cat-btn" style="background:rgba(16, 185, 129, 0.15); color:#10b981; font-weight:700;" onclick="handleDeliveryIssueAction('${iss.id}', 'redeliver')">
                  🔄 Re-entregar
                </button>
                <button class="cat-btn" style="color:#0284c7;" onclick="handleDeliveryIssueAction('${iss.id}', 'resolve')">
                  ✓ Resolver
                </button>
                <button class="cat-btn" style="color:#64748b;" onclick="handleDeliveryIssueAction('${iss.id}', 'dismiss')">
                  ✕
                </button>
              </div>
            ` : `<span class="text-muted" style="font-size:0.8rem;">${escapeHtml(iss.adminNote || 'Completado')}</span>`}
          </td>
        </tr>
      `;
    }).join("");
    renderAdminIcons(tbody);
  }
}

window.handleDeliveryIssueAction = async function(issueId, action) {
  const res = await apiRequest("/api/admin/delivery-issues/action", {
    method: "POST",
    body: JSON.stringify({ issueId, action })
  });

  if (res.ok) {
    showToast(res.message, "success");
    loadAdminDeliveryIssues();
    loadAdminStats();
  } else {
    showToast(res.error || "No se pudo actualizar el reclamo.", "error");
  }
};

// ── 5. CATÁLOGO DE TIENDA ──────────────────────────────────────
async function loadAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-table");
  if (!tbody) return;

  const res = await apiRequest("/api/store/items");
  if (res.ok && res.items) {
    tbody.innerHTML = res.items.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td><span class="badge" style="background:var(--purple-100); color:var(--purple-700);">${escapeHtml(item.category || 'items')}</span></td>
        <td class="mono text-purple">${formatCoins(item.priceCoins)}</td>
        <td class="mono text-emerald">$${Number(item.priceUsdt || 0).toFixed(2)}</td>
        <td class="mono text-muted" style="font-size:0.75rem;">${escapeHtml(item.command || '—')}</td>
        <td>
          <button class="cat-btn" style="color:#ef4444;" onclick="deleteStoreItem('${item.id}')">Eliminar</button>
        </td>
      </tr>
    `).join("");
    renderAdminIcons(tbody);
  }
}

window.deleteStoreItem = async function(itemId) {
  if (!confirm("¿Eliminar este artículo del catálogo?")) return;
  const res = await apiRequest("/api/admin/store/delete-item", {
    method: "POST",
    body: JSON.stringify({ itemId })
  });
  if (res.ok) {
    showToast("Artículo eliminado.", "success");
    loadAdminCatalog();
  } else {
    showToast(res.error || "Error al eliminar", "error");
  }
};

// ── 6. BALANCES DE JUGADORES ───────────────────────────────────
async function loadAdminPlayers() {
  const tbody = document.getElementById("admin-players-table-body");
  if (!tbody) return;

  const res = await apiRequest("/api/players/public");
  if (res.ok && res.players) {
    allAdminPlayers = res.players;
    renderAdminPlayersList(allAdminPlayers);
  }
}

function renderAdminPlayersList(list) {
  const tbody = document.getElementById("admin-players-table-body");
  if (!tbody) return;

  tbody.innerHTML = list.map((p, idx) => `
    <tr>
      <td class="text-muted mono" style="font-size:0.8rem;">#${idx + 1}</td>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <img src="https://mc-heads.net/avatar/${encodeURIComponent(p.username)}/24" style="width:24px; height:24px; border-radius:4px;">
          <strong>${escapeHtml(p.username)}</strong>
        </div>
      </td>
      <td class="mono text-purple" style="font-weight:700;">${formatCoins(p.wallet)}</td>
      <td class="mono text-emerald" style="font-weight:700;">${formatCoins(p.bank)}</td>
      <td class="mono" style="font-weight:800;">${formatCoins(p.totalFortune)}</td>
      <td>
        <button class="cat-btn" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="quickAdjustBalance('${escapeHtml(p.username)}')">
          Ajustar Saldo
        </button>
      </td>
    </tr>
  `).join("");
}

window.quickAdjustBalance = function(username) {
  document.getElementById("admin-player-name").value = username;
  document.getElementById("admin-player-amount").focus();
};

window.filterAdminPlayers = function(query) {
  const q = query.trim().toLowerCase();
  const filtered = allAdminPlayers.filter(p => p.username.toLowerCase().includes(q));
  renderAdminPlayersList(filtered);
};

// ── 7. AJUSTES Y REPORTES ──────────────────────────────────────
async function loadAdminQR() {
  const res = await apiRequest("/api/orders/binance-info");
  if (res.ok && res.binance) {
    const b = res.binance;
    document.getElementById("admin-qr-payid").value = b.payId || "";
    document.getElementById("admin-qr-address").value = b.walletAddress || "";
    document.getElementById("admin-qr-instruction").value = b.instruction || "";
    if (b.qrImage) document.getElementById("admin-preview-qr").src = b.qrImage;
  }
}

async function loadAdminReports() {
  const tbody = document.getElementById("admin-reports-table-body");
  if (!tbody) return;

  const res = await apiRequest("/api/admin/reports");
  if (res.ok && res.reports) {
    if (res.reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:2rem;">No hay denuncias de jugadores registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.reports.map(r => `
      <tr>
        <td class="mono text-muted" style="font-size:0.8rem;">${new Date(r.createdAt).toLocaleDateString()}</td>
        <td><strong>${escapeHtml(r.author)}</strong></td>
        <td><strong style="color:#ef4444;">${escapeHtml(r.targetUser)}</strong></td>
        <td style="max-width:250px; font-size:0.85rem;">${escapeHtml(r.comment || '—')}</td>
        <td><span class="badge" style="background:${r.status === 'RESOLVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};">${r.status || 'PENDING'}</span></td>
        <td>
          ${r.status !== 'RESOLVED' ? `<button class="cat-btn" style="color:#10b981;" onclick="resolveUserReport('${r.id}')">Resolver</button>` : '—'}
        </td>
      </tr>
    `).join("");
  }
}

window.resolveUserReport = async function(reportId) {
  const res = await apiRequest("/api/admin/reports/resolve", {
    method: "POST",
    body: JSON.stringify({ reportId, status: "RESOLVED" })
  });
  if (res.ok) {
    showToast("Reporte resuelto.", "success");
    loadAdminReports();
  }
};

// ── 8. CONFIGURACIÓN DE FORMULARIOS ────────────────────────────
function setupAdminForms() {
  // Guardar Artículo en Tienda
  document.getElementById("form-create-item")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("item-name")?.value.trim();
    const category = document.getElementById("item-category")?.value;
    const priceCoins = document.getElementById("item-price-coins")?.value;
    const priceUsdt = document.getElementById("item-price-usdt")?.value;
    const giveCoins = document.getElementById("item-give-coins")?.value;
    const command = document.getElementById("item-command")?.value.trim();
    const description = document.getElementById("item-desc")?.value.trim();
    const badge = document.getElementById("item-badge")?.value.trim();
    const iconType = document.getElementById("item-icon-type")?.value || "box";

    const res = await apiRequest("/api/admin/store/save-item", {
      method: "POST",
      body: JSON.stringify({ name, category, priceCoins, priceUsdt, giveCoins, command, description, badge, iconType })
    });

    if (res.ok) {
      showToast("¡Artículo guardado en el catálogo!", "success");
      loadAdminCatalog();
      e.target.reset();
    } else {
      showToast(res.error || "No se pudo guardar.", "error");
    }
  });

  // Ajustar Saldo de Jugador
  document.getElementById("form-adjust-player-balance")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("admin-player-name")?.value.trim();
    const action = document.getElementById("admin-player-action")?.value;
    const amount = document.getElementById("admin-player-amount")?.value;

    const res = await apiRequest("/api/admin/player/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ username, action, amount })
    });

    if (res.ok) {
      showToast("Saldo actualizado correctamente.", "success");
      loadAdminPlayers();
      loadAdminStats();
      document.getElementById("admin-player-amount").value = "";
    } else {
      showToast(res.error || "Error al actualizar saldo.", "error");
    }
  });

  // Actualizar datos de Binance Pay
  document.getElementById("form-update-qr")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payId = document.getElementById("admin-qr-payid")?.value.trim();
    const walletAddress = document.getElementById("admin-qr-address")?.value.trim();
    const instruction = document.getElementById("admin-qr-instruction")?.value.trim();
    const fileInput = document.getElementById("admin-qr-file");

    const formData = new FormData();
    if (payId) formData.append("payId", payId);
    if (walletAddress) formData.append("walletAddress", walletAddress);
    if (instruction) formData.append("instruction", instruction);
    if (fileInput?.files[0]) formData.append("qrImage", fileInput.files[0]);

    const res = await apiRequest("/api/admin/qr/update", {
      method: "POST",
      body: formData,
      isFormData: true
    });

    if (res.ok) {
      showToast("Datos de Binance Pay actualizados.", "success");
      loadAdminQR();
    } else {
      showToast(res.error || "No se pudo actualizar.", "error");
    }
  });
}

function setupAdminWebSocket() {
  socket.on("NEW_ORDER", (order) => {
    showToast(`🔔 Nueva orden Binance de ${order.username} ($${order.priceUsdt} USDT)`, "info");
    loadAdminStats();
    if (currentAdminTab === "orders") loadAdminOrders();
  });

  socket.on("NEW_DELIVERY_ISSUE", (iss) => {
    showToast(`⚠️ Nuevo reclamo: ${iss.player} no recibió "${iss.itemTitle}"`, "error");
    loadAdminStats();
    if (currentAdminTab === "delivery-issues") loadAdminDeliveryIssues();
  });
}

window.adminLogout = adminLogout;
