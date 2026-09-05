// Nodowa Network - Admin Dashboard Controller (Minimal & Modular)
let adminToken = sessionStorage.getItem("admin_token") || null;

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = "none"; }, 3500);
}

window.openModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
};
window.closeModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
};

// Admin Auth
function checkAdminState() {
  const loginView = document.getElementById("admin-login-view");
  const dashView = document.getElementById("admin-dashboard-view");
  const btnLogout = document.getElementById("btn-admin-logout");

  if (adminToken) {
    loginView.style.display = "none";
    dashView.style.display = "block";
    btnLogout.style.display = "inline-flex";
    loadDashboardData();
  } else {
    loginView.style.display = "block";
    dashView.style.display = "none";
    btnLogout.style.display = "none";
  }
}

document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("admin-pass").value.trim();

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.ok && data.token) {
      adminToken = data.token;
      sessionStorage.setItem("admin_token", adminToken);
      checkAdminState();
      showToast("Acceso concedido al panel.");
    } else {
      showToast(data.error || "Contraseña inválida");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

document.getElementById("btn-admin-logout").onclick = () => {
  adminToken = null;
  sessionStorage.removeItem("admin_token");
  checkAdminState();
  showToast("Sesión cerrada.");
};

// Tabs
document.querySelectorAll("[data-atab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-atab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".admin-tab").forEach(t => t.style.display = "none");
    btn.classList.add("active");
    const target = document.getElementById(`atab-${btn.dataset.atab}`);
    if (target) target.style.display = "block";

    if (btn.dataset.atab === "code-catalog") loadRawCatalogEditor();
    if (btn.dataset.atab === "players") loadAdminPlayers();
    if (btn.dataset.atab === "catalog") loadAdminCatalog();
  });
});

// Load All Dashboard Data
async function loadDashboardData() {
  loadStats();
  loadAdminOrders();
  loadAdminIssues();
  loadAdminCatalog();
  loadAdminConfig();
}

async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats", { headers: { "x-admin-token": adminToken } });
    const data = await res.json();
    if (data.ok && data.stats) {
      document.getElementById("stat-users").textContent = data.stats.totalUsers;
      document.getElementById("stat-orders").textContent = data.stats.pendingOrders;
      document.getElementById("stat-issues").textContent = data.stats.pendingDeliveryIssues;
      document.getElementById("stat-usdt").textContent = `$${data.stats.totalSalesUsdt.toFixed(2)}`;
    }
  } catch (e) {}
}

// 1. Órdenes Binance
async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Cargando órdenes...</td></tr>`;

  try {
    const res = await fetch("/api/admin/orders", { headers: { "x-admin-token": adminToken } });
    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay órdenes registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      let badge = `<span class="badge warning">Pendiente</span>`;
      if (o.status === "APPROVED") badge = `<span class="badge success">Aprobada</span>`;
      if (o.status === "REJECTED") badge = `<span class="badge danger">Rechazada</span>`;

      return `
        <tr>
          <td style="font-family:monospace; font-size:0.8rem;">${o.id.slice(-6)}</td>
          <td><strong>🎮 ${o.username}</strong></td>
          <td>${o.itemTitle}</td>
          <td>$${o.priceUsdt.toFixed(2)} USDT</td>
          <td style="font-family:monospace; font-size:0.8rem;">${o.txid || "N/A"}</td>
          <td>
            ${o.receiptImage
              ? `<a href="${o.receiptImage}" target="_blank" class="btn btn-secondary btn-sm">Ver Comprobante</a>`
              : `<span style="color:var(--text-muted); font-size:0.8rem;">Sin imagen</span>`
            }
          </td>
          <td>${badge}</td>
          <td>
            ${o.status === "PENDING" ? `
              <button class="btn btn-success btn-sm" onclick="approveOrder('${o.id}')">✓ Aprobar</button>
              <button class="btn btn-danger btn-sm" onclick="rejectOrder('${o.id}')">✗ Rechazar</button>
            ` : `<span style="font-size:0.8rem; color:var(--text-muted);">Procesado</span>`}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--red);">Error al cargar órdenes</td></tr>`;
  }
}

window.approveOrder = async (orderId) => {
  if (!confirm("¿Aprobar orden y acreditar beneficios al jugador?")) return;
  try {
    const res = await fetch("/api/admin/orders/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("¡Orden aprobada y acreditada!");
      loadStats();
      loadAdminOrders();
    } else {
      showToast(data.error || "Error");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

window.rejectOrder = async (orderId) => {
  const reason = prompt("Motivo del rechazo:", "Comprobante inválido o no recibido");
  if (!reason) return;
  try {
    const res = await fetch("/api/admin/orders/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ orderId, reason })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Orden rechazada");
      loadStats();
      loadAdminOrders();
    } else {
      showToast(data.error || "Error");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

// 2. Reclamos de Entrega ("No recibí mi producto")
async function loadAdminIssues() {
  const tbody = document.getElementById("admin-issues-tbody");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando reclamos...</td></tr>`;

  try {
    const res = await fetch("/api/admin/delivery-issues", { headers: { "x-admin-token": adminToken } });
    const data = await res.json();
    const issues = data.issues || [];

    if (issues.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay reportes de entrega pendientes.</td></tr>`;
      return;
    }

    tbody.innerHTML = issues.map(i => {
      let badge = `<span class="badge danger">⚠️ Pendiente</span>`;
      if (i.status === "REDELIVERED") badge = `<span class="badge success">🔄 Re-encolado</span>`;
      if (i.status === "RESOLVED") badge = `<span class="badge success">✅ Resuelto</span>`;

      return `
        <tr>
          <td style="font-size:0.8rem; color:var(--text-muted);">${new Date(i.createdAt).toLocaleString()}</td>
          <td><strong>🎮 ${i.player}</strong></td>
          <td>${i.itemTitle}</td>
          <td style="font-family:monospace; font-size:0.8rem; color:var(--primary);">${i.command || "N/A"}</td>
          <td>${i.note || "Sin nota"}</td>
          <td>${badge}</td>
          <td>
            ${i.status === "PENDING" ? `
              <button class="btn btn-primary btn-sm" onclick="handleIssueAction('${i.id}', 'redeliver')">🔄 Re-encolar en MC</button>
              <button class="btn btn-success btn-sm" onclick="handleIssueAction('${i.id}', 'resolve')">✓ Resolver</button>
            ` : `<span style="font-size:0.8rem; color:var(--text-muted);">Finalizado</span>`}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--red);">Error al cargar reclamos</td></tr>`;
  }
}

window.handleIssueAction = async (issueId, action) => {
  try {
    const res = await fetch("/api/admin/delivery-issues/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ issueId, action })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || "Acción completada");
      loadStats();
      loadAdminIssues();
    } else {
      showToast(data.error || "Error");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

window.switchAdminSubTab = (tabName) => {
  document.querySelectorAll("[data-atab]").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".admin-tab").forEach(t => t.style.display = "none");
  const btn = document.querySelector(`[data-atab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  const target = document.getElementById(`atab-${tabName}`);
  if (target) target.style.display = "block";

  if (tabName === "code-catalog") loadRawCatalogEditor();
  if (tabName === "players") loadAdminPlayers();
};

// 3. Catálogo Tienda (Visual)
let cachedCatalogItems = [];

async function loadAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-tbody");
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    cachedCatalogItems = data.items || [];

    tbody.innerHTML = cachedCatalogItems.map(i => `
      <tr>
        <td><strong>${escapeHtml(i.name)}</strong></td>
        <td><span class="badge">${i.category}</span></td>
        <td>🪙 ${i.priceCoins.toLocaleString()} NC</td>
        <td>💵 $${i.priceUsdt.toFixed(2)} USDT</td>
        <td style="font-family:monospace; font-size:0.8rem;">${escapeHtml(i.command || "N/A")}</td>
        <td>
          <div style="display:flex; gap:0.35rem;">
            <button class="btn btn-secondary btn-sm" onclick="openEditItemModal('${i.id}')">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('${i.id}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (e) {}
}

window.openEditItemModal = (itemId) => {
  const item = cachedCatalogItems.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById("edit-item-id").value = item.id;
  document.getElementById("edit-item-name").value = item.name || "";
  document.getElementById("edit-item-category").value = item.category || "items";
  document.getElementById("edit-item-icon").value = item.iconType || "box";
  document.getElementById("edit-item-price-coins").value = item.priceCoins || 0;
  document.getElementById("edit-item-price-usdt").value = item.priceUsdt || 0;
  document.getElementById("edit-item-command").value = item.command || "";
  document.getElementById("edit-item-give-coins").value = item.giveCoins || 0;
  document.getElementById("edit-item-badge").value = item.badge || "";
  document.getElementById("edit-item-desc").value = item.description || "";

  openModal("modal-edit-item");
};

document.getElementById("edit-item-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit-item-id").value;
  const name = document.getElementById("edit-item-name").value.trim();
  const category = document.getElementById("edit-item-category").value;
  const iconType = document.getElementById("edit-item-icon").value;
  const priceCoins = document.getElementById("edit-item-price-coins").value;
  const priceUsdt = document.getElementById("edit-item-price-usdt").value;
  const command = document.getElementById("edit-item-command").value.trim();
  const giveCoins = document.getElementById("edit-item-give-coins").value;
  const badge = document.getElementById("edit-item-badge").value.trim();
  const description = document.getElementById("edit-item-desc").value.trim();

  try {
    const res = await fetch("/api/admin/store/save-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ id, name, category, iconType, priceCoins, priceUsdt, command, giveCoins, badge, description })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-edit-item");
      showToast("Artículo actualizado con éxito");
      loadAdminCatalog();
    } else {
      showToast(data.error || "Error al actualizar artículo");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

document.getElementById("add-item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("item-name").value.trim();
  const category = document.getElementById("item-category").value;
  const iconType = document.getElementById("item-icon").value;
  const priceCoins = document.getElementById("item-price-coins").value;
  const priceUsdt = document.getElementById("item-price-usdt").value;
  const command = document.getElementById("item-command").value.trim();
  const giveCoins = document.getElementById("item-give-coins").value;
  const badge = document.getElementById("item-badge").value.trim();
  const description = document.getElementById("item-desc").value.trim();

  try {
    const res = await fetch("/api/admin/store/save-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ name, category, iconType, priceCoins, priceUsdt, command, giveCoins, badge, description })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-add-item");
      document.getElementById("add-item-form").reset();
      showToast("Artículo agregado al catálogo");
      loadAdminCatalog();
    } else {
      showToast(data.error || "Error al guardar artículo");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

window.deleteCatalogItem = async (itemId) => {
  if (!confirm("¿Eliminar este artículo del catálogo?")) return;
  try {
    const res = await fetch("/api/admin/store/delete-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ itemId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Artículo eliminado");
      loadAdminCatalog();
    }
  } catch (e) {}
};

// 4. Editor de Catálogo en Código Directo (JSON)
async function loadRawCatalogEditor() {
  const editor = document.getElementById("raw-catalog-editor");
  const statusEl = document.getElementById("catalog-json-status");
  if (!editor) return;

  statusEl.textContent = "Cargando catálogo...";
  statusEl.style.color = "#8b949e";

  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    const items = data.items || [];
    editor.value = JSON.stringify(items, null, 2);
    statusEl.textContent = `Catálogo cargado (${items.length} artículos)`;
    statusEl.style.color = "#58a6ff";
  } catch (e) {
    statusEl.textContent = "Error al cargar catálogo";
    statusEl.style.color = "#f85149";
  }
}

document.getElementById("btn-format-catalog-json")?.addEventListener("click", () => {
  const editor = document.getElementById("raw-catalog-editor");
  const statusEl = document.getElementById("catalog-json-status");
  try {
    const parsed = JSON.parse(editor.value);
    editor.value = JSON.stringify(parsed, null, 2);
    statusEl.textContent = "Código JSON formateado correctamente";
    statusEl.style.color = "#3fb950";
  } catch (err) {
    statusEl.textContent = "Error de sintaxis JSON: " + err.message;
    statusEl.style.color = "#f85149";
    showToast("Error de sintaxis en el JSON");
  }
});

document.getElementById("btn-reload-catalog-json")?.addEventListener("click", () => {
  loadRawCatalogEditor();
  showToast("Catálogo recargado");
});

document.getElementById("btn-save-catalog-json")?.addEventListener("click", async () => {
  const editor = document.getElementById("raw-catalog-editor");
  const statusEl = document.getElementById("catalog-json-status");
  if (!editor) return;

  let parsed;
  try {
    parsed = JSON.parse(editor.value);
  } catch (err) {
    statusEl.textContent = "Error de sintaxis: " + err.message;
    statusEl.style.color = "#f85149";
    return showToast("Corrige el error de sintaxis JSON antes de guardar");
  }

  if (!Array.isArray(parsed)) {
    statusEl.textContent = "El JSON debe ser una lista [ ... ] de objetos";
    statusEl.style.color = "#f85149";
    return showToast("El JSON debe ser un arreglo [ ... ]");
  }

  try {
    statusEl.textContent = "Guardando en servidor...";
    const res = await fetch("/api/admin/store/raw-json", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ jsonContent: parsed })
    });
    const data = await res.json();
    if (data.ok) {
      statusEl.textContent = `Guardado exitoso (${data.items.length} artículos)`;
      statusEl.style.color = "#3fb950";
      showToast(data.message || "Catálogo guardado en código con éxito");
      loadAdminCatalog();
    } else {
      statusEl.textContent = "Error: " + (data.error || "No se pudo guardar");
      statusEl.style.color = "#f85149";
      showToast(data.error || "Error al guardar");
    }
  } catch (err) {
    statusEl.textContent = "Error de conexión al guardar";
    statusEl.style.color = "#f85149";
    showToast("Error de conexión");
  }
});

// 5. Gestión de Jugadores
let cachedAdminPlayers = [];

async function loadAdminPlayers() {
  const tbody = document.getElementById("admin-players-tbody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/players", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await res.json();
    if (data.ok) {
      cachedAdminPlayers = data.players || [];
      renderAdminPlayers(cachedAdminPlayers);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red); padding:1rem;">Error cargando jugadores</td></tr>`;
  }
}

function renderAdminPlayers(list) {
  const tbody = document.getElementById("admin-players-tbody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron jugadores</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <img src="${p.avatarUrl}" alt="${p.displayName}" style="width:32px; height:32px; border-radius:50%;">
          <div>
            <strong>${escapeHtml(p.displayName)}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.username)}</div>
          </div>
        </div>
      </td>
      <td>
        ${p.linked ? `<span class="badge" style="background:var(--emerald-light); color:var(--emerald);">✓ Vinculado Bedrock</span>` : `<span class="badge" style="background:var(--red-light); color:var(--red);">⚠️ No Vinculado</span>`}
      </td>
      <td>
        <span style="font-size:0.85rem; font-weight:700; color:var(--primary);">[${escapeHtml(p.selectedTitle || 'Novato')}]</span>
        <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(p.equippedRank || 'NOVICIO')}</div>
      </td>
      <td><strong>${(p.wallet || 0).toLocaleString()}</strong> <small>NC</small></td>
      <td><strong>${(p.bank || 0).toLocaleString()}</strong> <small>NC</small></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openAdjustBalanceModal('${p.username}', '${escapeHtml(p.displayName)}')">💰 Ajustar Saldo</button>
      </td>
    </tr>
  `).join("");
}

const adminPlayersSearch = document.getElementById("admin-players-search");
if (adminPlayersSearch) {
  adminPlayersSearch.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      renderAdminPlayers(cachedAdminPlayers);
    } else {
      const filtered = cachedAdminPlayers.filter(p => 
        p.username.toLowerCase().includes(term) || 
        p.displayName.toLowerCase().includes(term)
      );
      renderAdminPlayers(filtered);
    }
  });
}

window.openAdjustBalanceModal = (username, displayName) => {
  document.getElementById("adjust-user-target").value = username;
  document.getElementById("adjust-user-display").textContent = displayName || username;
  document.getElementById("adjust-amount").value = "";
  openModal("modal-adjust-balance");
};

document.getElementById("adjust-balance-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("adjust-user-target").value;
  const action = document.getElementById("adjust-action").value;
  const amount = document.getElementById("adjust-amount").value;

  try {
    const res = await fetch("/api/admin/player/adjust-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ username, action, amount })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-adjust-balance");
      showToast(`Saldo de ${username} actualizado a ${data.user.wallet.toLocaleString()} NC`);
      loadAdminPlayers();
      loadStats();
    } else {
      showToast(data.error || "Error al ajustar saldo");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// 6. Configuración Binance
async function loadAdminConfig() {
  try {
    const res = await fetch("/api/orders/binance-info");
    const data = await res.json();
    if (data.ok && data.binance) {
      document.getElementById("cfg-payid").value = data.binance.payId || "";
      document.getElementById("cfg-wallet").value = data.binance.walletAddress || "";
      document.getElementById("cfg-instruction").value = data.binance.instruction || "";
    }
  } catch (e) {}
}

document.getElementById("admin-config-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payId = document.getElementById("cfg-payid").value.trim();
  const walletAddress = document.getElementById("cfg-wallet").value.trim();
  const instruction = document.getElementById("cfg-instruction").value.trim();
  const fileInput = document.getElementById("cfg-qr-file");

  const formData = new FormData();
  formData.append("payId", payId);
  formData.append("walletAddress", walletAddress);
  formData.append("instruction", instruction);
  if (fileInput.files && fileInput.files[0]) {
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
      showToast("Configuración de Binance actualizada.");
    } else {
      showToast(data.error || "Error al actualizar");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Inicialización
checkAdminState();
