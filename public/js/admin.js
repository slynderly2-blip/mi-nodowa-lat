// Lógica del Panel de Administración
let adminToken = localStorage.getItem("nodowa_admin_token") || null;
let currentAdminTab = "orders";
let cachedOrders = [];
let cachedCatalog = [];
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
  if (!confirm("¿Deseas APROBAR este pago y entregar los ítems/monedas al jugador?")) return;

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

async function rejectOrder(orderId) {
  const reason = prompt("Motivo del rechazo (ej. TXID no encontrado, monto incorrecto):", "Comprobante no válido");
  if (reason === null) return;

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
      cachedCatalog = data.items;
      tbody.innerHTML = cachedCatalog.map(item => `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td><span class="status-badge status-pending">${item.category}</span></td>
          <td class="mono text-gold">${item.priceCoins > 0 ? `${item.priceCoins} NC` : '—'}</td>
          <td class="mono text-cyan">${item.priceUsdt > 0 ? `$${item.priceUsdt.toFixed(2)} USDT` : '—'}</td>
          <td class="mono text-muted" style="font-size: 0.775rem;">${item.command || (item.giveCoins ? `+${item.giveCoins} Coins` : '—')}</td>
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
  } catch (e) {}
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
  if (!confirm("¿Seguro que deseas eliminar este artículo de la tienda?")) return;

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
      showAdminToast("Artículo eliminado", "info");
      loadAdminCatalog();
    }
  } catch (e) {}
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
        showAdminToast(`¡Saldo de ${username} actualizado a ${data.user.wallet} NC!`, "success");
        document.getElementById("admin-player-amount").value = "";
        loadAdminStats();
      } else {
        showAdminToast(data.error || "No se pudo ajustar saldo", "error");
      }
    } catch (e) {
      showAdminToast("Error en la solicitud", "error");
    }
  });
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

    renderIcons(tbody);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--accent-rose);">Error cargando reportes.</td></tr>`;
  }
}

async function resolveAdminReport(reportId, status) {
  const note = prompt("Nota administrativa o resolución:", "Reporte revisado y resuelto por administración");
  if (note === null) return;

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
  {
    "id": "rank_vip",
    "name": "Rango VIP (30 Días)",
    "category": "rangos",
    "priceCoins": 5000,
    "priceUsdt": 2.99,
    "description": "Prefijo [VIP] en chat, /fly en lobby, 3 sethomes y kit VIP cada 24h.",
    "iconType": "crown",
    "command": "lp user {player} parent add vip",
    "giveCoins": 0,
    "badge": "Popular"
  },
  {
    "id": "rank_vip_plus",
    "name": "Rango VIP+ (30 Días)",
    "category": "rangos",
    "priceCoins": 12000,
    "priceUsdt": 5.99,
    "description": "Prefijo [VIP+], acceso a /enderchest, 5 sethomes, kit VIP+ y 1,000 NC gratis.",
    "iconType": "crown",
    "command": "lp user {player} parent add vip_plus",
    "giveCoins": 1000,
    "badge": "Recomendado"
  },
  {
    "id": "rank_mvp",
    "name": "Rango MVP (30 Días)",
    "category": "rangos",
    "priceCoins": 25000,
    "priceUsdt": 9.99,
    "description": "Prefijo [MVP], /fly en supervivencia, 10 sethomes, kit MVP y 2,500 NC gratis.",
    "iconType": "crown",
    "command": "lp user {player} parent add mvp",
    "giveCoins": 2500,
    "badge": "Pro"
  },
  {
    "id": "rank_elite",
    "name": "Rango ELITE (Permanente)",
    "category": "rangos",
    "priceCoins": 55000,
    "priceUsdt": 19.99,
    "description": "Prefijo [ELITE] animado, todos los comandos /fly, /workbench, 20 sethomes y 5,000 NC.",
    "iconType": "crown",
    "command": "lp user {player} parent add elite",
    "giveCoins": 5000,
    "badge": "Leyenda"
  },
  {
    "id": "kit_warrior",
    "name": "Kit Guerrero Divino",
    "category": "kits",
    "priceCoins": 2000,
    "priceUsdt": 1.49,
    "description": "Armadura de Diamante Protección IV, Espada Filo V y 3 Manzanas Doradas.",
    "iconType": "shield",
    "command": "kit warrior {player}",
    "giveCoins": 0,
    "badge": "PvP"
  },
  {
    "id": "kit_miner",
    "name": "Kit Minero Estelar",
    "category": "kits",
    "priceCoins": 1500,
    "priceUsdt": 0.99,
    "description": "Pico de Netherite Eficiencia V y Fortuna III, 64 Antorchas y 5 Pociones de Visión Nocturna.",
    "iconType": "box",
    "command": "kit miner {player}",
    "giveCoins": 0,
    "badge": "Útil"
  },
  {
    "id": "kit_builder",
    "name": "Kit Maestro Constructor",
    "category": "kits",
    "priceCoins": 3000,
    "priceUsdt": 1.99,
    "description": "64 Bloques de Vidrio de Colores, 64 Cuarzo, 64 Piedra Pulida y Varita de Construcción.",
    "iconType": "box",
    "command": "kit builder {player}",
    "giveCoins": 0,
    "badge": "Build"
  },
  {
    "id": "key_mythic",
    "name": "Llave Cofre Mítico x3",
    "category": "keys",
    "priceCoins": 1200,
    "priceUsdt": 0.99,
    "description": "3 Llaves para abrir el Cofre Mítico en el Spawn. ¡Premios de hasta 10,000 NC!",
    "iconType": "key",
    "command": "crate givekey {player} mythic 3",
    "giveCoins": 0,
    "badge": "Suerte"
  },
  {
    "id": "key_bould",
    "name": "Llave Bóveda Real x1",
    "category": "keys",
    "priceCoins": 2500,
    "priceUsdt": 1.99,
    "description": "1 Llave Suprema de la Bóveda Real. ¡Garantiza armadura Netherite o rango temporal!",
    "iconType": "key",
    "command": "crate givekey {player} royal 1",
    "giveCoins": 0,
    "badge": "Épico"
  },
  {
    "id": "cmd_fly",
    "name": "Permiso /fly (Volar 30 Días)",
    "category": "comandos",
    "priceCoins": 8000,
    "priceUsdt": 3.99,
    "description": "Vuela libremente por el mundo Survival sin restricciones por 30 días.",
    "iconType": "zap",
    "command": "lp user {player} permission set temp ess.fly true 30d",
    "giveCoins": 0,
    "badge": "Vuelo"
  },
  {
    "id": "cmd_heal_feed",
    "name": "Comandos /heal y /feed",
    "category": "comandos",
    "priceCoins": 4000,
    "priceUsdt": 2.49,
    "description": "Recupera tu vida y comida al máximo al instante con un cooldown de 5 minutos.",
    "iconType": "zap",
    "command": "lp user {player} permission set ess.heal true",
    "giveCoins": 0,
    "badge": "Salud"
  },
  {
    "id": "item_elytra",
    "name": "Elytra + Irrompibilidad III",
    "category": "items",
    "priceCoins": 7000,
    "priceUsdt": 3.49,
    "description": "Alas de Elytra encantadas con Irrompibilidad III y Reparación Mending.",
    "iconType": "star",
    "command": "give {player} elytra{Enchantments:[{id:unbreaking,lvl:3},{id:mending,lvl:1}]} 1",
    "giveCoins": 0,
    "badge": "Top"
  },
  {
    "id": "pack_netherite",
    "name": "Pack 4 Lingotes de Netherite",
    "category": "items",
    "priceCoins": 5000,
    "priceUsdt": 2.99,
    "description": "4 Lingotes de Netherite puro para mejorar tu equipo completo a Netherite.",
    "iconType": "gem",
    "command": "give {player} netherite_ingot 4",
    "giveCoins": 0,
    "badge": "Recursos"
  },
  {
    "id": "coin_pack_small",
    "name": "Bolsa de 1,000 Nodocoins",
    "category": "coins",
    "priceCoins": 0,
    "priceUsdt": 0.99,
    "description": "Acredita 1,000 Nodocoins directamente a tu billetera en mano.",
    "iconType": "coins",
    "command": "",
    "giveCoins": 1000,
    "badge": "+1,000 NC"
  },
  {
    "id": "coin_pack_large",
    "name": "Cofre de 10,000 Nodocoins",
    "category": "coins",
    "priceCoins": 0,
    "priceUsdt": 7.99,
    "description": "Acredita 10,000 Nodocoins directos + 1,000 NC de Bono gratis.",
    "iconType": "coins",
    "command": "",
    "giveCoins": 11000,
    "badge": "+11,000 NC Bonus"
  }
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
