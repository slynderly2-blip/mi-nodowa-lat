// Lógica del Panel de Administración
let adminToken = localStorage.getItem("nodowa_admin_token") || null;
let currentAdminTab = "orders";
let cachedOrders = [];
let cachedCatalog = [];
let cachedAdminPlayers = [];
let selectedReceiptOrder = null;

document.addEventListener("DOMContentLoaded", () => {
  renderAdminIcons();
  setupAdminAuth();
  setupAdminTabs();
  setupQrForm();
  setupCatalogForm();
  setupBulkImportForm();
  setupPlayerBalanceForm();

  if (adminToken) {
    showAdminPanel();
  }
});

function renderAdminIcons(container = document) {
  const slots = container.querySelectorAll(".icon-slot");
  slots.forEach(slot => {
    const iconName = slot.getAttribute("data-icon");
    if (iconName && typeof getIcon === "function") {
      slot.innerHTML = getIcon(iconName);
    }
  });
}

function setupAdminAuth() {
  document.getElementById("form-admin-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("admin-pass-input").value;
    if (!pass) return showAdminToast("Ingresa la contraseña", "error");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();
      if (data.ok && data.token) {
        adminToken = data.token;
        localStorage.setItem("nodowa_admin_token", adminToken);
        showAdminToast("¡Sesión administrativa iniciada!", "success");
        showAdminPanel();
      } else {
        showAdminToast(data.error || "Clave incorrecta", "error");
      }
    } catch (err) {
      showAdminToast("Error de conexión", "error");
    }
  });
}

function showAdminPanel() {
  document.getElementById("admin-login-view").style.display = "none";
  document.getElementById("admin-panel-view").style.display = "block";
  document.getElementById("btn-admin-logout").style.display = "inline-flex";

  loadAdminStats();
  loadAdminOrders();
  loadAdminQrConfig();
  loadAdminCatalog();
}

function adminLogout() {
  adminToken = null;
  localStorage.removeItem("nodowa_admin_token");
  document.getElementById("admin-login-view").style.display = "block";
  document.getElementById("admin-panel-view").style.display = "none";
  document.getElementById("btn-admin-logout").style.display = "none";
  showAdminToast("Sesión cerrada", "info");
}

function setupAdminTabs() {
  const btns = document.querySelectorAll(".admin-nav-btn[data-admin-tab]");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".admin-tab-view").forEach(v => v.style.display = "none");

      btn.classList.add("active");
      const target = btn.getAttribute("data-admin-tab");
      currentAdminTab = target;
      const targetView = document.getElementById(`admin-view-${target}`);
      if (targetView) targetView.style.display = "block";

      if (target === "orders") loadAdminOrders();
      if (target === "qr") loadAdminQrConfig();
      if (target === "catalog") loadAdminCatalog();
      if (target === "players") loadAdminPlayers();
      if (target === "reports") loadAdminReports();
    });
  });
}

// ── Cargar Métricas ───────────────────────────────────────────
async function loadAdminStats() {
  try {
    const res = await fetch("/api/admin/stats", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await res.json();
    if (data.ok && data.stats) {
      document.getElementById("stat-pending-orders").innerText = data.stats.pendingOrders;
      document.getElementById("stat-total-sales").innerText = `$${data.stats.totalSalesUsdt.toFixed(2)}`;
      document.getElementById("stat-total-users").innerText = data.stats.totalUsers;
      document.getElementById("stat-total-coins").innerText = `${data.stats.totalCoins.toLocaleString()} NC`;
    }
  } catch (e) {}
}

// ── Comprobantes y Órdenes Binance ─────────────────────────────
async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-table");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/orders", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await res.json();
    if (data.ok) {
      cachedOrders = data.orders;
      if (cachedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align: center; padding: 2rem;">No hay órdenes ni comprobantes registrados.</td></tr>`;
        return;
      }

      tbody.innerHTML = cachedOrders.map(o => `
        <tr>
          <td class="mono text-muted" style="font-size: 0.8rem;">${new Date(o.createdAt).toLocaleDateString()} ${new Date(o.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
          <td><strong>${o.username}</strong></td>
          <td>${o.itemTitle}</td>
          <td class="mono text-cyan" style="font-weight: 700;">$${o.priceUsdt.toFixed(2)} USDT</td>
          <td class="mono text-muted" style="font-size: 0.775rem;">${o.txid}</td>
          <td>
            <img src="${o.receiptUrl}" class="receipt-thumb" onclick="openReceiptModal('${o.id}')" title="Ver comprobante completo" alt="Voucher">
          </td>
          <td>
            <span class="status-badge ${o.status === 'APPROVED' ? 'status-approved' : o.status === 'REJECTED' ? 'status-rejected' : 'status-pending'}">
              ${o.status === 'APPROVED' ? 'Aprobada' : o.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
            </span>
          </td>
          <td>
            ${o.status === 'PENDING' ? `
              <div style="display: flex; gap: 0.4rem;">
                <button class="cat-btn" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);" onclick="approveOrder('${o.id}')" title="Aprobar pago y entregar">
                  <span class="icon-slot" data-icon="check"></span> Aprobar
                </button>
                <button class="cat-btn" style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);" onclick="rejectOrder('${o.id}')" title="Rechazar comprobante">
                  <span class="icon-slot" data-icon="x"></span> Rechazar
                </button>
              </div>
            ` : `
              <span class="text-muted" style="font-size: 0.8rem;">${o.adminNote || 'Completada'}</span>
            `}
          </td>
        </tr>
      `).join("");

      renderAdminIcons(tbody);
    }
  } catch (e) {}
}

function openReceiptModal(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;
  selectedReceiptOrder = order;

  document.getElementById("receipt-full-img").src = order.receiptUrl;
  document.getElementById("receipt-modal-details").innerHTML = `
    <div><strong>Jugador:</strong> ${order.username} | <strong>Paquete:</strong> ${order.itemTitle}</div>
    <div><strong>TXID:</strong> ${order.txid} | <strong>Monto:</strong> $${order.priceUsdt.toFixed(2)} USDT</div>
  `;

  const btnApprove = document.getElementById("btn-approve-from-modal");
  const btnReject = document.getElementById("btn-reject-from-modal");

  if (order.status === "PENDING") {
    btnApprove.style.display = "inline-flex";
    btnReject.style.display = "inline-flex";
    btnApprove.onclick = () => { approveOrder(order.id); closeReceiptModal(); };
    btnReject.onclick = () => { rejectOrder(order.id); closeReceiptModal(); };
  } else {
    btnApprove.style.display = "none";
    btnReject.style.display = "none";
  }

  document.getElementById("modal-view-receipt").classList.add("active");
}

function closeReceiptModal() {
  document.getElementById("modal-view-receipt").classList.remove("active");
}

async function approveOrder(orderId) {
  try {
    const res = await fetch("/api/admin/orders/approve", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    if (data.ok) {
      showAdminToast("¡Orden aprobada exitosamente!", "success");
      loadAdminOrders();
      loadAdminStats();
    } else {
      showAdminToast(data.error || "No se pudo aprobar la orden", "error");
    }
  } catch (e) {
    showAdminToast("Error en la solicitud", "error");
  }
}

async function rejectOrder(orderId, reason = "Comprobante no válido o TXID no verificado") {
  try {
    const res = await fetch("/api/admin/orders/reject", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ orderId, reason })
    });
    const data = await res.json();
    if (data.ok) {
      showAdminToast("Orden rechazada", "info");
      loadAdminOrders();
      loadAdminStats();
    } else {
      showAdminToast(data.error || "No se pudo rechazar la orden", "error");
    }
  } catch (e) {
    showAdminToast("Error en la solicitud", "error");
  }
}

// ── Configurar QR y Pagos Binance ──────────────────────────────
async function loadAdminQrConfig() {
  try {
    const res = await fetch("/api/admin/config", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await res.json();
    if (data.ok && data.config && data.config.binance) {
      const b = data.config.binance;
      document.getElementById("admin-pay-id").value = b.payId || "";
      document.getElementById("admin-wallet-address").value = b.walletAddress || "";
      document.getElementById("admin-instruction").value = b.instruction || "";
      document.getElementById("admin-preview-qr").src = b.qrImage || "/uploads/default_qr.svg";
    }
  } catch (e) {}
}

function setupQrForm() {
  document.getElementById("form-update-qr")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payId = document.getElementById("admin-pay-id").value.trim();
    const walletAddress = document.getElementById("admin-wallet-address").value.trim();
    const instruction = document.getElementById("admin-instruction").value.trim();
    const fileInput = document.getElementById("admin-qr-file");

    const formData = new FormData();
    formData.append("payId", payId);
    formData.append("walletAddress", walletAddress);
    formData.append("instruction", instruction);
    if (fileInput.files[0]) {
      formData.append("qrImage", fileInput.files[0]);
    }

    try {
      const res = await fetch("/api/admin/qr/update", {
        method: "POST",
        headers: { "x-admin-token": adminToken },
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        showAdminToast("¡Configuración de Binance actualizada!", "success");
        loadAdminQrConfig();
      } else {
        showAdminToast(data.error || "Error al actualizar", "error");
      }
    } catch (err) {
      showAdminToast("Error al guardar cambios de Binance", "error");
    }
  });
}

// ── Catálogo de Tienda ─────────────────────────────────────────
async function loadAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-table");
  if (!tbody) return;

  try {
    const res = await fetch("/api/store/items");
    const data = await res.json();
    if (data.ok) {
      cachedCatalog = data.items || [];
      const searchVal = (document.getElementById("admin-catalog-search")?.value || "").trim().toLowerCase();
      renderAdminCatalogRows(searchVal);
    }
  } catch (e) {}
}

function renderAdminCatalogRows(query = "") {
  const tbody = document.getElementById("admin-catalog-table");
  const countSpan = document.getElementById("admin-catalog-count");
  if (!tbody) return;

  const filtered = !query
    ? cachedCatalog
    : cachedCatalog.filter(i => {
        const text = `${i.name} ${i.category} ${i.id} ${i.command || ''} ${i.description || ''}`.toLowerCase();
        return text.includes(query.toLowerCase());
      });

  if (countSpan) {
    countSpan.innerText = `Mostrando ${filtered.length} de ${cachedCatalog.length} artículos`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No se encontraron artículos con "${escapeHtmlAdmin(query)}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td><span class="status-badge status-pending">${item.category}</span></td>
      <td class="mono text-gold">${item.priceCoins > 0 ? `${item.priceCoins.toLocaleString()} NC` : '—'}</td>
      <td class="mono text-cyan">${item.priceUsdt > 0 ? `$${item.priceUsdt.toFixed(2)} USDT` : '—'}</td>
      <td class="mono text-muted" style="font-size: 0.775rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.command || (item.giveCoins ? `+${item.giveCoins.toLocaleString()} Coins` : '—')}</td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <button class="cat-btn" onclick="openEditItemModal('${item.id}')" title="Editar">
            <span class="icon-slot" data-icon="edit"></span>
          </button>
          <button class="cat-btn" style="color: var(--accent-rose);" onclick="deleteCatalogItem('${item.id}')" title="Eliminar">
            <span class="icon-slot" data-icon="trash"></span>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  renderAdminIcons(tbody);
}

function filterAdminCatalog(query) {
  renderAdminCatalogRows(query.trim());
}

function escapeHtmlAdmin(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function openCreateItemModal() {
  document.getElementById("item-modal-title").innerText = "Nuevo Artículo de Tienda";
  document.getElementById("form-save-store-item").reset();
  document.getElementById("item-input-id").value = "";
  document.getElementById("modal-edit-item").classList.add("active");
}

function openEditItemModal(itemId) {
  const item = cachedCatalog.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById("item-modal-title").innerText = "Editar Artículo";
  document.getElementById("item-input-id").value = item.id;
  document.getElementById("item-input-name").value = item.name;
  document.getElementById("item-input-category").value = item.category;
  document.getElementById("item-input-price-coins").value = item.priceCoins || 0;
  document.getElementById("item-input-price-usdt").value = item.priceUsdt || 0;
  document.getElementById("item-input-command").value = item.command || "";
  document.getElementById("item-input-give-coins").value = item.giveCoins || 0;
  document.getElementById("item-input-desc").value = item.description || "";
  document.getElementById("item-input-image-url").value = item.imageUrl || "";

  document.getElementById("modal-edit-item").classList.add("active");
}

function closeEditItemModal() {
  document.getElementById("modal-edit-item").classList.remove("active");
}

function setupCatalogForm() {
  document.getElementById("form-save-store-item")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("item-input-id").value;
    const name = document.getElementById("item-input-name").value.trim();
    const category = document.getElementById("item-input-category").value;
    const priceCoins = document.getElementById("item-input-price-coins").value;
    const priceUsdt = document.getElementById("item-input-price-usdt").value;
    const command = document.getElementById("item-input-command").value.trim();
    const giveCoins = document.getElementById("item-input-give-coins").value;
    const description = document.getElementById("item-input-desc").value.trim();
    const imageUrl = document.getElementById("item-input-image-url").value.trim();
    const imageFile = document.getElementById("item-input-image-file")?.files[0];

    const formData = new FormData();
    formData.append("id", id);
    formData.append("name", name);
    formData.append("category", category);
    formData.append("priceCoins", priceCoins);
    formData.append("priceUsdt", priceUsdt);
    if (command) formData.append("command", command);
    if (giveCoins) formData.append("giveCoins", giveCoins);
    if (description) formData.append("description", description);
    if (imageUrl) formData.append("imageUrl", imageUrl);
    if (imageFile) formData.append("image", imageFile);

    try {
      const res = await fetch("/api/admin/store/save-item", {
        method: "POST",
        headers: { 
          "x-admin-token": adminToken
        },
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        showAdminToast("¡Artículo guardado correctamente!", "success");
        closeEditItemModal();
        loadAdminCatalog();
      } else {
        showAdminToast(data.error || "Error al guardar artículo", "error");
      }
    } catch (err) {
      showAdminToast("Error de conexión", "error");
    }
  });
}

async function deleteCatalogItem(itemId) {
  try {
    const res = await fetch("/api/admin/store/delete-item", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ itemId })
    });
    const data = await res.json();
    if (data.ok) {
      showAdminToast("Artículo eliminado del catálogo", "info");
      loadAdminCatalog();
    } else {
      showAdminToast(data.error || "No se pudo eliminar el artículo", "error");
    }
  } catch (e) {
    showAdminToast("Error al eliminar artículo", "error");
  }
}

// ── Ajuste de Saldo de Jugadores ──────────────────────────────
function setupPlayerBalanceForm() {
  document.getElementById("form-adjust-player-balance")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("admin-player-name").value.trim();
    const action = document.getElementById("admin-player-action").value;
    const amount = document.getElementById("admin-player-amount").value;

    try {
      const res = await fetch("/api/admin/player/adjust-balance", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({ username, action, amount })
      });
      const data = await res.json();
      if (data.ok) {
        showAdminToast(`¡Saldo de ${username} actualizado a ${data.user.wallet.toLocaleString()} NC!`, "success");
        document.getElementById("admin-player-amount").value = "";
        loadAdminStats();
        loadAdminPlayers();
      } else {
        showAdminToast(data.error || "No se pudo ajustar saldo", "error");
      }
    } catch (e) {
      showAdminToast("Error en la solicitud", "error");
    }
  });
}

// ── Lista de Todos los Jugadores con Balances ─────────────────
async function loadAdminPlayers() {
  const tbody = document.getElementById("admin-players-table-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">Cargando jugadores...</td></tr>`;

  try {
    const res = await fetch("/api/admin/players", {
      headers: { "x-admin-token": adminToken }
    });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--accent-rose);">Error: Respuesta inválida del servidor (status ${res.status})</td></tr>`;
      return;
    }

    if (!res.ok || !data.ok) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--accent-rose);">Error del servidor: ${data.error || res.status}</td></tr>`;
      return;
    }

    if (!data.players || data.players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">No hay jugadores registrados aún.</td></tr>`;
      return;
    }

    cachedAdminPlayers = data.players.sort((a, b) => ((b.wallet || 0) + (b.bank || 0)) - ((a.wallet || 0) + (a.bank || 0)));
    const searchVal = (document.getElementById("admin-players-search")?.value || "").trim();
    renderAdminPlayersRows(searchVal);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--accent-rose);">Error de red: ${err.message}</td></tr>`;
  }
}

function renderAdminPlayersRows(query = "") {
  const tbody = document.getElementById("admin-players-table-body");
  const countSpan = document.getElementById("admin-players-count");
  if (!tbody) return;

  const filtered = !query
    ? cachedAdminPlayers
    : cachedAdminPlayers.filter(p => {
        const name = (p.username || p.player || "").toLowerCase();
        return name.includes(query.toLowerCase());
      });

  if (countSpan) {
    countSpan.innerText = `Mostrando ${filtered.length} de ${cachedAdminPlayers.length} jugadores`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">No se encontraron jugadores que coincidan con "${escapeHtmlAdmin(query)}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((p, i) => {
    const total = (p.wallet || 0) + (p.bank || 0);
    const name = p.username || p.player || "---";
    const linked = p.linkedAt
      ? `<span style="color:var(--accent-emerald);font-size:0.8rem;">✓ Vinculado</span>`
      : `<span style="color:var(--text-muted);font-size:0.8rem;">Sin vincular</span>`;
    const since = p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-ES") : "---";
    return `
      <tr>
        <td class="mono text-muted">${i + 1}</td>
        <td><strong class="text-purple">${name}</strong></td>
        <td class="mono" style="color:var(--accent-amber);">${(p.wallet || 0).toLocaleString()} NC</td>
        <td class="mono" style="color:var(--accent-cyan);">${(p.bank || 0).toLocaleString()} NC</td>
        <td class="mono"><strong>${total.toLocaleString()} NC</strong></td>
        <td>${linked}</td>
        <td class="text-muted" style="font-size:0.8rem;">${since}</td>
        <td>
          <button class="cat-btn" style="font-size:0.75rem;padding:4px 10px;"
            onclick="document.getElementById('admin-player-name').value='${name}';document.getElementById('admin-player-action').value='set';document.getElementById('admin-player-amount').focus();">
            ✏ Editar
          </button>
        </td>
      </tr>`;
  }).join("");

  renderAdminIcons(tbody);
}

function filterAdminPlayers(query) {
  renderAdminPlayersRows(query.trim());
}

// ── Gestión de Reportes Anti-Estafas ───────────────────────────
async function loadAdminReports() {
  const tbody = document.getElementById("admin-reports-table-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/reports", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await res.json();
    if (!data.ok || !data.reports || data.reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay reportes de estafas registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.reports.map(r => `
      <tr>
        <td class="mono text-muted" style="font-size: 0.8rem;">${new Date(r.createdAt).toLocaleString("es-ES")}</td>
        <td><strong class="text-purple">${r.reporter}</strong></td>
        <td><strong class="text-rose">${r.targetUser}</strong></td>
        <td><span class="badge" style="background: var(--purple-100); color: var(--purple-800);">${r.reason}</span></td>
        <td style="max-width: 250px;">
          <div>${r.description}</div>
          ${r.proof ? `<div class="mono text-muted" style="font-size: 0.75rem; margin-top: 4px;">Evidencia: ${r.proof}</div>` : ''}
        </td>
        <td>
          <span class="badge" style="background: ${r.status === 'OPEN' ? '#fee2e2' : '#dcfce7'}; color: ${r.status === 'OPEN' ? '#991b1b' : '#166534'};">
            ${r.status === 'OPEN' ? 'PENDIENTE' : 'RESUELTO'}
          </span>
        </td>
        <td>
          ${r.status === 'OPEN' ? `
            <button class="cat-btn" style="background: var(--accent-emerald); color: #fff;" onclick="resolveAdminReport('${r.id}', 'RESOLVED')">
              <span class="icon-slot" data-icon="check"></span> Resolver
            </button>
          ` : `<span class="text-muted" style="font-size: 0.8rem;">${r.adminNote || 'Atendido'}</span>`}
        </td>
      </tr>
    `).join("");

    renderAdminIcons(tbody);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--accent-rose);">Error cargando reportes.</td></tr>`;
  }
}

async function resolveAdminReport(reportId, status) {
  const note = "Reporte revisado y resuelto por administración";
  try {
    const res = await fetch("/api/admin/reports/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ reportId, status, note })
    });
    const data = await res.json();
    if (data.ok) {
      showAdminToast("Reporte resuelto correctamente", "success");
      loadAdminReports();
    } else {
      showAdminToast(data.error || "No se pudo resolver el reporte", "error");
    }
  } catch (_) {
    showAdminToast("Error en la solicitud", "error");
  }
}

function showAdminToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ── Carga Masiva de Productos (JSON / Preset Equilibrado) ──────
const OFFICIAL_PRESET_CATALOG = [
  // ── PAQUETES DE MONEDAS (10 PAQUETES) ──
  { "id": "coin_micro", "name": "Bolsa Micro (500 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 0.49, "description": "500 Nodocoins acreditados a tu billetera en mano.", "iconType": "coins", "command": "", "giveCoins": 500, "badge": "Básico" },
  { "id": "coin_bronce", "name": "Bolsa Bronce (1,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 0.99, "description": "1,000 Nodocoins directos a tu billetera.", "iconType": "coins", "command": "", "giveCoins": 1000, "badge": "Bronce" },
  { "id": "coin_plata", "name": "Bolsa Plata (2,200 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 1.99, "description": "2,000 NC + 200 NC de Bono gratis (+10%).", "iconType": "coins", "command": "", "giveCoins": 2200, "badge": "+10% Bonus" },
  { "id": "coin_oro", "name": "Cofre de Oro (4,600 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 3.99, "description": "4,000 NC + 600 NC de Bono gratis (+15%).", "iconType": "coins", "command": "", "giveCoins": 4600, "badge": "+15% Bonus" },
  { "id": "coin_diamante", "name": "Cofre Diamante (8,500 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 6.99, "description": "7,000 NC + 1,500 NC de Bono gratis (+20%).", "iconType": "coins", "command": "", "giveCoins": 8500, "badge": "+20% Bonus" },
  { "id": "coin_esmeralda", "name": "Cofre Esmeralda (13,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 9.99, "description": "10,000 NC + 3,000 NC de Bono gratis (+30%).", "iconType": "coins", "command": "", "giveCoins": 13000, "badge": "Popular" },
  { "id": "coin_netherite", "name": "Bóveda Netherite (20,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 14.99, "description": "15,000 NC + 5,000 NC de Bono gratis (+35%).", "iconType": "coins", "command": "", "giveCoins": 20000, "badge": "+35% Bonus" },
  { "id": "coin_rey", "name": "Bóveda Real (35,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 24.99, "description": "25,000 NC + 10,000 NC de Bono gratis (+40%).", "iconType": "coins", "command": "", "giveCoins": 35000, "badge": "Rey" },
  { "id": "coin_titan", "name": "Bóveda Titán (75,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 49.99, "description": "50,000 NC + 25,000 NC de Bono gratis (+50%).", "iconType": "coins", "command": "", "giveCoins": 75000, "badge": "Titán" },
  { "id": "coin_boveda", "name": "Bóveda Suprema (160,000 Nodocoins)", "category": "coins", "priceCoins": 0, "priceUsdt": 99.99, "description": "100,000 NC + 60,000 NC de Bono gratis (+60%).", "iconType": "coins", "command": "", "giveCoins": 160000, "badge": "Leyenda" },

  // ── COMIDA (8 ÍTEMS) ──
  { "id": "food_gapple_stack", "name": "Pack 64 Manzanas Doradas", "category": "items", "priceCoins": 3000, "priceUsdt": 1.99, "description": "64 Manzanas Doradas para combate y regeneración.", "iconType": "star", "command": "give {player} golden_apple 64", "giveCoins": 0, "badge": "PvP" },
  { "id": "food_god_apple", "name": "Pack 8 Manzanas Notched Encantadas", "category": "items", "priceCoins": 4500, "priceUsdt": 2.99, "description": "8 Manzanas Encantadas de muesca dorada de inmortalidad.", "iconType": "star", "command": "give {player} enchanted_golden_apple 8", "giveCoins": 0, "badge": "Épico" },
  { "id": "food_steak_stack", "name": "Pack 64 Filetes de Ternera", "category": "items", "priceCoins": 800, "priceUsdt": 0.49, "description": "64 Filetes asados para saciar el hambre al máximo.", "iconType": "box", "command": "give {player} cooked_beef 64", "giveCoins": 0, "badge": "Comida" },
  { "id": "food_pork_stack", "name": "Pack 64 Chuletas de Cerdo", "category": "items", "priceCoins": 800, "priceUsdt": 0.49, "description": "64 Chuletas cocinadas de alta nutrición.", "iconType": "box", "command": "give {player} cooked_porkchop 64", "giveCoins": 0, "badge": "Comida" },
  { "id": "food_golden_carrot", "name": "Pack 64 Zanahorias Doradas", "category": "items", "priceCoins": 1500, "priceUsdt": 0.99, "description": "64 Zanahorias Doradas de máxima saturación.", "iconType": "star", "command": "give {player} golden_carrot 64", "giveCoins": 0, "badge": "Top Comida" },
  { "id": "food_bread_stack", "name": "Pack 64 Panes de Trigo", "category": "items", "priceCoins": 500, "priceUsdt": 0.29, "description": "64 Panes recién horneados.", "iconType": "box", "command": "give {player} bread 64", "giveCoins": 0, "badge": "Básico" },
  { "id": "food_salmon_stack", "name": "Pack 64 Salmones Cocinados", "category": "items", "priceCoins": 600, "priceUsdt": 0.39, "description": "64 Salmones asados listos para comer.", "iconType": "box", "command": "give {player} cooked_salmon 64", "giveCoins": 0, "badge": "Comida" },
  { "id": "food_cake_stack", "name": "Pack 16 Pasteles / Tartas", "category": "items", "priceCoins": 900, "priceUsdt": 0.59, "description": "16 Pasteles deliciosos para tu base.", "iconType": "box", "command": "give {player} cake 16", "giveCoins": 0, "badge": "Fiesta" },

  // ── MINERALES Y RECURSOS BÁSICOS (9 ÍTEMS) ──
  { "id": "res_diamond_stack", "name": "Pack 64 Diamantes Puros", "category": "items", "priceCoins": 2500, "priceUsdt": 1.49, "description": "64 Diamantes sin procesar para armaduras y herramientas.", "iconType": "gem", "command": "give {player} diamond 64", "giveCoins": 0, "badge": "Mineral" },
  { "id": "res_iron_stack", "name": "Pack 64 Lingotes de Hierro", "category": "items", "priceCoins": 800, "priceUsdt": 0.49, "description": "64 Lingotes de Hierro forjado.", "iconType": "box", "command": "give {player} iron_ingot 64", "giveCoins": 0, "badge": "Mineral" },
  { "id": "res_gold_stack", "name": "Pack 64 Lingotes de Oro", "category": "items", "priceCoins": 1200, "priceUsdt": 0.79, "description": "64 Lingotes de Oro refinado.", "iconType": "gem", "command": "give {player} gold_ingot 64", "giveCoins": 0, "badge": "Mineral" },
  { "id": "res_emerald_stack", "name": "Pack 64 Esmeraldas", "category": "items", "priceCoins": 2000, "priceUsdt": 1.29, "description": "64 Esmeraldas para comerciar con aldeanos.", "iconType": "gem", "command": "give {player} emerald 64", "giveCoins": 0, "badge": "Trade" },
  { "id": "res_lapis_stack", "name": "Pack 64 Lapislázuli", "category": "items", "priceCoins": 600, "priceUsdt": 0.39, "description": "64 Lapislázuli para encantamientos.", "iconType": "gem", "command": "give {player} lapis_lazuli 64", "giveCoins": 0, "badge": "Magia" },
  { "id": "res_redstone_stack", "name": "Pack 64 Polvos de Redstone", "category": "items", "priceCoins": 600, "priceUsdt": 0.39, "description": "64 Polvos de Redstone para mecanismos.", "iconType": "zap", "command": "give {player} redstone 64", "giveCoins": 0, "badge": "Técnico" },
  { "id": "res_amethyst_stack", "name": "Pack 64 Fragmentos de Amatista", "category": "items", "priceCoins": 1400, "priceUsdt": 0.89, "description": "64 Fragmentos de Amatista de geodas.", "iconType": "gem", "command": "give {player} amethyst_shard 64", "giveCoins": 0, "badge": "Raro" },
  { "id": "res_coal_stack", "name": "Pack 64 Bloques de Carbón", "category": "items", "priceCoins": 750, "priceUsdt": 0.49, "description": "64 Bloques de Carbón de larga duración en hornos.", "iconType": "box", "command": "give {player} coal_block 64", "giveCoins": 0, "badge": "Energía" },
  { "id": "res_quartz_stack", "name": "Pack 64 Bloques de Cuarzo", "category": "items", "priceCoins": 1000, "priceUsdt": 0.69, "description": "64 Bloques de Cuarzo del Nether.", "iconType": "box", "command": "give {player} quartz_block 64", "giveCoins": 0, "badge": "Build" },

  // ── MATERIALES NETHER & END ÉPICOS (9 ÍTEMS) ──
  { "id": "res_netherite_ingot", "name": "Pack 4 Lingotes de Netherite", "category": "items", "priceCoins": 5000, "priceUsdt": 2.99, "description": "4 Lingotes de Netherite puro.", "iconType": "gem", "command": "give {player} netherite_ingot 4", "giveCoins": 0, "badge": "Épico" },
  { "id": "res_ancient_debris", "name": "Pack 8 Escombros Ancentrales", "category": "items", "priceCoins": 6000, "priceUsdt": 3.49, "description": "8 Escombros Ancentrales extraídos de las profundidades del Nether.", "iconType": "box", "command": "give {player} ancient_debris 8", "giveCoins": 0, "badge": "Raro" },
  { "id": "res_dragon_egg", "name": "1 Huevo de Dragón del End", "category": "items", "priceCoins": 18000, "priceUsdt": 9.99, "description": "Trofeo supremo y exclusivo del Dragón del End.", "iconType": "star", "command": "give {player} dragon_egg 1", "giveCoins": 0, "badge": "Exclusivo" },
  { "id": "res_nether_star", "name": "1 Estrella del Nether", "category": "items", "priceCoins": 8000, "priceUsdt": 4.99, "description": "Estrella del Wither para craftear Faros (Beacons).", "iconType": "star", "command": "give {player} nether_star 1", "giveCoins": 0, "badge": "Boss" },
  { "id": "res_blaze_rod", "name": "Pack 64 Varas de Blaze", "category": "items", "priceCoins": 1800, "priceUsdt": 1.19, "description": "64 Varas de Blaze para pociones y ojos de ender.", "iconType": "zap", "command": "give {player} blaze_rod 64", "giveCoins": 0, "badge": "Nether" },
  { "id": "res_ender_pearl", "name": "Pack 64 Perlas de Ender", "category": "items", "priceCoins": 1500, "priceUsdt": 0.99, "description": "64 Perlas de Ender para teletransportación rápida.", "iconType": "zap", "command": "give {player} ender_pearl 64", "giveCoins": 0, "badge": "Utilidad" },
  { "id": "res_ghast_tear", "name": "Pack 32 Lágrimas de Ghast", "category": "items", "priceCoins": 2200, "priceUsdt": 1.49, "description": "32 Lágrimas de Ghast para pociones de regeneración.", "iconType": "star", "command": "give {player} ghast_tear 32", "giveCoins": 0, "badge": "Pociones" },
  { "id": "res_shulker_shell", "name": "Pack 16 Caparazones de Shulker", "category": "items", "priceCoins": 4000, "priceUsdt": 2.49, "description": "16 Caparazones de Shulker para fabricar 8 cajas de almacenamiento.", "iconType": "box", "command": "give {player} shulker_shell 16", "giveCoins": 0, "badge": "End" },
  { "id": "res_wither_skull", "name": "Pack 3 Calaveras de Wither", "category": "items", "priceCoins": 6500, "priceUsdt": 3.99, "description": "3 Calaveras de Esqueleto Wither para invocar al Jefe Wither.", "iconType": "shield", "command": "give {player} wither_skeleton_skull 3", "giveCoins": 0, "badge": "Invocación" },

  // ── HERRAMIENTAS Y ARMAMENTO (9 ÍTEMS) ──
  { "id": "tool_elytra", "name": "Elytra + Irrompibilidad III + Mending", "category": "items", "priceCoins": 7000, "priceUsdt": 3.49, "description": "Alas de Elytra encantadas con Irrompibilidad III y Reparación Mending.", "iconType": "star", "command": "give {player} elytra{Enchantments:[{id:unbreaking,lvl:3},{id:mending,lvl:1}]} 1", "giveCoins": 0, "badge": "Vuelo Top" },
  { "id": "tool_netherite_pick", "name": "Pico Netherite (Eficiencia V + Fortuna III)", "category": "items", "priceCoins": 5500, "priceUsdt": 2.99, "description": "Pico de Netherite maxeado para minería masiva.", "iconType": "box", "command": "give {player} netherite_pickaxe{Enchantments:[{id:efficiency,lvl:5},{id:fortune,lvl:3},{id:unbreaking,lvl:3}]} 1", "giveCoins": 0, "badge": "Herramienta" },
  { "id": "tool_netherite_sword", "name": "Espada Netherite (Filo V + Aspecto Ígneo II)", "category": "items", "priceCoins": 5500, "priceUsdt": 2.99, "description": "Espada de Netherite con máximo daño de ataque.", "iconType": "shield", "command": "give {player} netherite_sword{Enchantments:[{id:sharpness,lvl:5},{id:fire_aspect,lvl:2},{id:unbreaking,lvl:3}]} 1", "giveCoins": 0, "badge": "Arma" },
  { "id": "tool_netherite_axe", "name": "Hacha Netherite (Eficiencia V + Toque de Seda)", "category": "items", "priceCoins": 4500, "priceUsdt": 2.49, "description": "Hacha de Netherite para tala de madera y combate.", "iconType": "box", "command": "give {player} netherite_axe{Enchantments:[{id:efficiency,lvl:5},{id:silk_touch,lvl:1},{id:unbreaking,lvl:3}]} 1", "giveCoins": 0, "badge": "Herramienta" },
  { "id": "tool_netherite_shovel", "name": "Pala Netherite (Eficiencia V + Irrompibilidad III)", "category": "items", "priceCoins": 3500, "priceUsdt": 1.99, "description": "Pala de Netherite para excavación ultrarrápida.", "iconType": "box", "command": "give {player} netherite_shovel{Enchantments:[{id:efficiency,lvl:5},{id:unbreaking,lvl:3}]} 1", "giveCoins": 0, "badge": "Herramienta" },
  { "id": "tool_bow_god", "name": "Arco Divino (Poder V + Fuego I + Infinito)", "category": "items", "priceCoins": 4500, "priceUsdt": 2.49, "description": "Arco legendario con flechas de fuego infinitas.", "iconType": "shield", "command": "give {player} bow{Enchantments:[{id:power,lvl:5},{id:flame,lvl:1},{id:infinity,lvl:1}]} 1", "giveCoins": 0, "badge": "Arma Distancia" },
  { "id": "tool_trident_god", "name": "Tridente con Lealtad III y Canalización", "category": "items", "priceCoins": 6500, "priceUsdt": 3.99, "description": "Tridente de rayo en tormentas que regresa a tu mano.", "iconType": "star", "command": "give {player} trident{Enchantments:[{id:loyalty,lvl:3},{id:channeling,lvl:1}]} 1", "giveCoins": 0, "badge": "Épico" },
  { "id": "tool_crossbow_god", "name": "Ballesta Carga Rápida III + Multidisparo", "category": "items", "priceCoins": 4000, "priceUsdt": 2.49, "description": "Ballesta de disparo séxtuple veloz.", "iconType": "shield", "command": "give {player} crossbow{Enchantments:[{id:quick_charge,lvl:3},{id:multishot,lvl:1}]} 1", "giveCoins": 0, "badge": "Arma" },
  { "id": "tool_fishing_rod", "name": "Caña Atraer III + Suerte Marina III", "category": "items", "priceCoins": 2500, "priceUsdt": 1.49, "description": "Caña de pescar suprema para conseguir tesoros.", "iconType": "star", "command": "give {player} fishing_rod{Enchantments:[{id:lure,lvl:3},{id:luck_of_the_sea,lvl:3}]} 1", "giveCoins": 0, "badge": "Pesca" },

  // ── ARMADURAS (6 ÍTEMS) ──
  { "id": "armor_netherite_helm", "name": "Casco Netherite (Protección IV + Respiración III)", "category": "items", "priceCoins": 4000, "priceUsdt": 2.49, "description": "Casco de Netherite encantado para supervivencia.", "iconType": "shield", "command": "give {player} netherite_helmet{Enchantments:[{id:protection,lvl:4},{id:respiration,lvl:3}]} 1", "giveCoins": 0, "badge": "Armadura" },
  { "id": "armor_netherite_chest", "name": "Pechera Netherite (Protección IV + Irrompibilidad III)", "category": "items", "priceCoins": 5000, "priceUsdt": 2.99, "description": "Pechera de Netherite blindada contra todo daño.", "iconType": "shield", "command": "give {player} netherite_chestplate{Enchantments:[{id:protection,lvl:4},{id:unbreaking,lvl:3}]} 1", "giveCoins": 0, "badge": "Armadura" },
  { "id": "armor_netherite_legs", "name": "Grebas Netherite (Protección IV)", "category": "items", "priceCoins": 4000, "priceUsdt": 2.49, "description": "Pantalones de Netherite con máxima protección.", "iconType": "shield", "command": "give {player} netherite_leggings{Enchantments:[{id:protection,lvl:4}]} 1", "giveCoins": 0, "badge": "Armadura" },
  { "id": "armor_netherite_boots", "name": "Botas Netherite (Protección IV + Caída Pluma IV)", "category": "items", "priceCoins": 4000, "priceUsdt": 2.49, "description": "Botas de Netherite anti-caídas.", "iconType": "shield", "command": "give {player} netherite_boots{Enchantments:[{id:protection,lvl:4},{id:feather_falling,lvl:4}]} 1", "giveCoins": 0, "badge": "Armadura" },
  { "id": "armor_diamond_chest", "name": "Pechera de Diamante (Protección IV)", "category": "items", "priceCoins": 2500, "priceUsdt": 1.49, "description": "Pechera de Diamante reforzada.", "iconType": "shield", "command": "give {player} diamond_chestplate{Enchantments:[{id:protection,lvl:4}]} 1", "giveCoins": 0, "badge": "Armadura" },
  { "id": "armor_diamond_boots", "name": "Botas de Diamante (Paso Helado II + Caída Pluma IV)", "category": "items", "priceCoins": 2500, "priceUsdt": 1.49, "description": "Botas de Diamante para congelar agua al caminar.", "iconType": "star", "command": "give {player} diamond_boots{Enchantments:[{id:frost_walker,lvl:2},{id:feather_falling,lvl:4}]} 1", "giveCoins": 0, "badge": "Hielo" },

  // ── POCIONES (6 ÍTEMS) ──
  { "id": "pot_strength_set", "name": "Pack 5 Pociones de Fuerza II (8:00)", "category": "items", "priceCoins": 1500, "priceUsdt": 0.99, "description": "5 Pociones para aumentar el daño cuerpo a cuerpo.", "iconType": "zap", "command": "give {player} potion{Potion:\"strong_strength\"} 5", "giveCoins": 0, "badge": "Buff" },
  { "id": "pot_swiftness_set", "name": "Pack 5 Pociones de Velocidad II (8:00)", "category": "items", "priceCoins": 1200, "priceUsdt": 0.79, "description": "5 Pociones de velocidad de movimiento rápida.", "iconType": "zap", "command": "give {player} potion{Potion:\"strong_swiftness\"} 5", "giveCoins": 0, "badge": "Buff" },
  { "id": "pot_night_vision", "name": "Pack 5 Pociones de Visión Nocturna", "category": "items", "priceCoins": 1000, "priceUsdt": 0.69, "description": "5 Pociones para ver en la oscuridad de cuevas.", "iconType": "zap", "command": "give {player} potion{Potion:\"long_night_vision\"} 5", "giveCoins": 0, "badge": "Buff" },
  { "id": "pot_regen_set", "name": "Pack 5 Pociones de Regeneración II", "category": "items", "priceCoins": 1500, "priceUsdt": 0.99, "description": "5 Pociones de cura continua en combate.", "iconType": "zap", "command": "give {player} potion{Potion:\"strong_regeneration\"} 5", "giveCoins": 0, "badge": "Buff" },
  { "id": "pot_slow_falling", "name": "Pack 5 Pociones de Caída Lenta", "category": "items", "priceCoins": 1000, "priceUsdt": 0.69, "description": "5 Pociones para flotar en el End y Nether.", "iconType": "zap", "command": "give {player} potion{Potion:\"long_slow_falling\"} 5", "giveCoins": 0, "badge": "Buff" },
  { "id": "pot_water_breathing", "name": "Pack 5 Pociones de Apnea / Agua", "category": "items", "priceCoins": 1000, "priceUsdt": 0.69, "description": "5 Pociones para respirar bajo el agua en océanos.", "iconType": "zap", "command": "give {player} potion{Potion:\"long_water_breathing\"} 5", "giveCoins": 0, "badge": "Buff" },

  // ── UTILIDADES Y BLOQUES ESPECIALES (6 ÍTEMS) ──
  { "id": "util_totem", "name": "1 Totem de la Inmortalidad (Totem of Undying)", "category": "items", "priceCoins": 3000, "priceUsdt": 1.99, "description": "Tótem que te salva de la muerte instantánea en combate o caídas.", "iconType": "star", "command": "give {player} totem_of_undying 1", "giveCoins": 0, "badge": "Salvavidas" },
  { "id": "util_ender_chest", "name": "1 Cofre de Ender + Pico de Seda", "category": "items", "priceCoins": 1500, "priceUsdt": 0.99, "description": "Cofre de Ender para llevar tu inventario privado a todas partes.", "iconType": "box", "command": "give {player} ender_chest 1", "giveCoins": 0, "badge": "Seguridad" },
  { "id": "util_beacon", "name": "1 Faro Mágico (Beacon)", "category": "items", "priceCoins": 8000, "priceUsdt": 4.99, "description": "Faro que otorga efectos de regeneración, prisa y fuerza en tu base.", "iconType": "star", "command": "give {player} beacon 1", "giveCoins": 0, "badge": "Base" },
  { "id": "util_anvil", "name": "1 Yunque de Hierro", "category": "items", "priceCoins": 800, "priceUsdt": 0.49, "description": "Yunque para reparar y combinar libros encantados.", "iconType": "box", "command": "give {player} anvil 1", "giveCoins": 0, "badge": "Utilidad" },
  { "id": "util_enchant_table", "name": "Mesa Encantamientos + 15 Estanterías", "category": "items", "priceCoins": 2500, "priceUsdt": 1.49, "description": "Set completo para encantar tus ítems al nivel 30.", "iconType": "star", "command": "give {player} enchanting_table 1", "giveCoins": 0, "badge": "Magia" },
  { "id": "util_shulker_box", "name": "1 Caja de Shulker Morada", "category": "items", "priceCoins": 3000, "priceUsdt": 1.99, "description": "Caja portátil para transportar 27 stacks extra de inventario.", "iconType": "box", "command": "give {player} purple_shulker_box 1", "giveCoins": 0, "badge": "Mochila" }
];

function openBulkImportModal() {
  const modal = document.getElementById("modal-bulk-import");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
  }
}

function closeBulkImportModal() {
  const modal = document.getElementById("modal-bulk-import");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

function loadOfficialPresetCatalog() {
  const textarea = document.getElementById("bulk-items-json");
  if (textarea) {
    textarea.value = JSON.stringify(OFFICIAL_PRESET_CATALOG, null, 2);
    showAdminToast("¡Catálogo Oficial Equilibrado cargado en el editor!", "info");
  }
}

function setupBulkImportForm() {
  document.getElementById("form-bulk-import")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawJson = document.getElementById("bulk-items-json").value.trim();
    const mode = document.getElementById("bulk-import-mode").value;

    if (!rawJson) return showAdminToast("Pega o carga una lista de productos en formato JSON", "error");

    let parsedItems = [];
    try {
      parsedItems = JSON.parse(rawJson);
      if (!Array.isArray(parsedItems)) throw new Error("Debe ser un arreglo de objetos JSON [...]");
    } catch (err) {
      return showAdminToast("Error en formato JSON: " + err.message, "error");
    }

    try {
      const res = await fetch("/api/admin/store/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({ items: parsedItems, mode })
      });

      const data = await res.json();
      if (data.ok) {
        showAdminToast(`¡${data.count} productos importados al catálogo exitosamente!`, "success");
        closeBulkImportModal();
        loadAdminCatalog();
      } else {
        showAdminToast(data.error || "No se pudo importar el catálogo", "error");
      }
    } catch (err) {
      showAdminToast("Error de comunicación al importar catálogo", "error");
    }
  });
}
