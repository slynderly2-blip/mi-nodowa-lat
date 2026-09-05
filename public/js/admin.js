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
let cachedOrders = [];
let ordersSearchQuery = "";

async function loadAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Cargando órdenes...</td></tr>`;

  try {
    const res = await fetch("/api/admin/orders", { headers: { "x-admin-token": adminToken } });
    const data = await res.json();
    cachedOrders = data.orders || [];
    renderAdminOrders();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--red);">Error al cargar órdenes</td></tr>`;
  }
}

function renderAdminOrders() {
  const tbody = document.getElementById("admin-orders-tbody");
  if (!tbody) return;

  let filtered = cachedOrders;
  if (ordersSearchQuery) {
    const q = ordersSearchQuery.toLowerCase();
    filtered = filtered.filter(o =>
      (o.username || "").toLowerCase().includes(q) ||
      (o.itemTitle || "").toLowerCase().includes(q) ||
      (o.txid || "").toLowerCase().includes(q) ||
      (o.id || "").toLowerCase().includes(q) ||
      (o.status || "").toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">${ordersSearchQuery ? `No hay órdenes que coincidan con "${ordersSearchQuery}"` : 'No hay órdenes registradas.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    let badge = `<span class="badge warning">Pendiente</span>`;
    if (o.status === "APPROVED") badge = `<span class="badge success">Aprobada</span>`;
    if (o.status === "REJECTED") badge = `<span class="badge danger">Rechazada</span>`;

    return `
      <tr>
        <td style="font-family:monospace; font-size:0.8rem;">${o.id.slice(-6)}</td>
        <td><strong>🎮 ${escapeHtml(o.username)}</strong></td>
        <td>${escapeHtml(o.itemTitle)}</td>
        <td>$${Number(o.priceUsdt || 0).toFixed(2)} USDT</td>
        <td style="font-family:monospace; font-size:0.8rem;">${escapeHtml(o.txid || "N/A")}</td>
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
}

document.getElementById("admin-orders-search")?.addEventListener("input", (e) => {
  ordersSearchQuery = e.target.value.trim();
  renderAdminOrders();
});

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
  const reason = prompt("Motivo del rechazo de la orden (opcional):", "Comprobante no válido");
  if (reason === null) return;
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

// 2. Reclamos de Entregas
let cachedIssues = [];
let issuesSearchQuery = "";

async function loadAdminIssues() {
  const tbody = document.getElementById("admin-issues-tbody");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando reclamos...</td></tr>`;

  try {
    const res = await fetch("/api/admin/delivery-issues", { headers: { "x-admin-token": adminToken } });
    const data = await res.json();
    cachedIssues = data.issues || [];
    renderAdminIssues();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--red);">Error al cargar reclamos</td></tr>`;
  }
}

function renderAdminIssues() {
  const tbody = document.getElementById("admin-issues-tbody");
  if (!tbody) return;

  let filtered = cachedIssues;
  if (issuesSearchQuery) {
    const q = issuesSearchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      (i.player || "").toLowerCase().includes(q) ||
      (i.itemTitle || "").toLowerCase().includes(q) ||
      (i.note || "").toLowerCase().includes(q) ||
      (i.command || "").toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">${issuesSearchQuery ? `No hay reportes que coincidan con "${issuesSearchQuery}"` : 'No hay reportes de entrega pendientes.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(i => {
    let badge = `<span class="badge danger">⚠️ Pendiente</span>`;
    if (i.status === "REDELIVERED") badge = `<span class="badge success">🔄 Re-encolado</span>`;
    if (i.status === "RESOLVED") badge = `<span class="badge success">✅ Resuelto</span>`;

    return `
      <tr>
        <td style="font-size:0.8rem; color:var(--text-muted);">${new Date(i.createdAt).toLocaleString()}</td>
        <td><strong>🎮 ${escapeHtml(i.player)}</strong></td>
        <td>${escapeHtml(i.itemTitle)}</td>
        <td style="font-family:monospace; font-size:0.8rem; color:var(--primary);">${escapeHtml(i.command || "N/A")}</td>
        <td>${escapeHtml(i.note || "Sin nota")}</td>
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
}

document.getElementById("admin-issues-search")?.addEventListener("input", (e) => {
  issuesSearchQuery = e.target.value.trim();
  renderAdminIssues();
});

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
  if (tabName === "catalog") loadAdminCatalog();
};

// 3. Catálogo Tienda (Visual)
let cachedCatalogItems = [];
let catalogSearchQuery = "";
let catalogCategoryFilter = "all";

async function loadAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-tbody");
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    cachedCatalogItems = data.items || [];
    renderAdminCatalog();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red);">Error cargando catálogo</td></tr>`;
  }
}

function renderAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-tbody");
  if (!tbody) return;

  let filtered = cachedCatalogItems;

  if (catalogCategoryFilter !== "all") {
    filtered = filtered.filter(i => (i.category || (i.giveCoins > 0 ? "coins" : "other")) === catalogCategoryFilter);
  }

  if (catalogSearchQuery) {
    const q = catalogSearchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q) ||
      (i.command || "").toLowerCase().includes(q) ||
      (i.description || "").toLowerCase().includes(q) ||
      (i.id || "").toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">${catalogSearchQuery ? `No hay productos que coincidan con "${catalogSearchQuery}"` : 'No hay artículos en esta categoría.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(i => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <strong>${escapeHtml(i.name)}</strong>
          ${i.badge ? `<span class="badge" style="font-size:0.68rem; background:var(--primary-light); color:var(--primary);">${escapeHtml(i.badge)}</span>` : ''}
        </div>
      </td>
      <td><span class="badge" style="background:var(--tiktok-gray);">${escapeHtml(i.category)}</span></td>
      <td>🪙 ${Number(i.priceCoins || 0).toLocaleString()} NC</td>
      <td>💵 $${Number(i.priceUsdt || 0).toFixed(2)} USDT</td>
      <td style="font-family:monospace; font-size:0.8rem; color:var(--primary);">${escapeHtml(i.command || "N/A")}</td>
      <td>
        <div style="display:flex; gap:0.35rem;">
          <button class="btn btn-primary btn-sm" onclick="openEditItemModal('${i.id}')" title="Editar este producto">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('${i.id}')" title="Eliminar del catálogo">🗑️</button>
        </div>
      </td>
    </tr>
  `).join("");
}

window.filterAdminCatalog = (cat) => {
  catalogCategoryFilter = cat;
  document.querySelectorAll("#admin-catalog-filter-pills .filter-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cfilter === cat);
  });
  renderAdminCatalog();
};

document.getElementById("admin-catalog-search")?.addEventListener("input", (e) => {
  catalogSearchQuery = e.target.value.trim();
  renderAdminCatalog();
});

window.openEditItemModal = (itemId) => {
  const item = cachedCatalogItems.find(i => i.id === itemId);
  if (!item) return showToast("Artículo no encontrado");

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
      showToast("¡Artículo actualizado con éxito!");
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
let currentAdminPlayerFilter = "all";

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
      const countBadge = document.getElementById("admin-players-count-badge");
      if (countBadge) countBadge.textContent = `${cachedAdminPlayers.length} Jugadores`;
      applyPlayerFilters();
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red); padding:1.5rem;">Error cargando jugadores</td></tr>`;
  }
}

function applyPlayerFilters() {
  const term = (document.getElementById("admin-players-search")?.value || "").trim().toLowerCase();
  
  let list = cachedAdminPlayers;

  // Filtro por estado
  if (currentAdminPlayerFilter === "linked") {
    list = list.filter(p => p.linked);
  } else if (currentAdminPlayerFilter === "unlinked") {
    list = list.filter(p => !p.linked);
  } else if (currentAdminPlayerFilter === "balance") {
    list = list.filter(p => (p.wallet || 0) > 0 || (p.bank || 0) > 0);
  }

  // Filtro por término de búsqueda
  if (term) {
    list = list.filter(p => 
      (p.username && p.username.toLowerCase().includes(term)) || 
      (p.displayName && p.displayName.toLowerCase().includes(term)) ||
      (p.equippedRank && p.equippedRank.toLowerCase().includes(term))
    );
  }

  renderAdminPlayers(list);
}

window.filterAdminPlayers = (type) => {
  currentAdminPlayerFilter = type;
  document.querySelectorAll(".admin-filter-pills .filter-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === type);
  });
  applyPlayerFilters();
};

function renderAdminPlayers(list) {
  const tbody = document.getElementById("admin-players-tbody");
  if (!tbody) return;

  const countBadge = document.getElementById("admin-players-count-badge");
  if (countBadge) {
    countBadge.textContent = `${list.length} de ${cachedAdminPlayers.length} Jugadores`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2.5rem; font-size:0.95rem;">No se encontraron jugadores con ese filtro</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const isSameName = !p.displayName || p.displayName.trim().toLowerCase() === (p.username || "").trim().toLowerCase();
    const displayNameHtml = escapeHtml(p.displayName || p.username);
    const usernameHtml = escapeHtml(p.username);
    const titleHtml = escapeHtml(p.selectedTitle || 'Novato');
    const rankHtml = escapeHtml(p.equippedRank || 'NOVICIO');
    const walletNum = p.wallet || 0;
    const bankNum = p.bank || 0;
    const avatar = p.avatarUrl || `https://mc-heads.net/avatar/${p.username}/64`;

    return `
    <tr class="admin-player-row" onclick="openAdjustBalanceModal('${escapeHtml(p.username)}', '${displayNameHtml}', ${walletNum}, ${bankNum}, '${avatar}')" title="Haz clic en cualquier parte de la fila para ajustar el saldo de ${displayNameHtml}">
      <td class="cell-player">
        <div class="admin-player-identity">
          <div class="admin-avatar-wrapper ${p.linked ? 'is-linked' : ''}">
            <img src="${avatar}" alt="${displayNameHtml}" class="admin-player-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/64'">
            ${p.linked ? '<span class="avatar-linked-dot" title="Vinculado a Minecraft Bedrock"></span>' : ''}
          </div>
          <div class="admin-player-names">
            <span class="admin-player-name">${displayNameHtml}</span>
            ${!isSameName ? `<span class="admin-player-gamertag">@${usernameHtml}</span>` : ''}
          </div>
        </div>
      </td>
      <td class="cell-status">
        ${p.linked 
          ? `<span class="admin-badge badge-linked"><span class="badge-dot"></span>✓ Bedrock Vinculado</span>` 
          : `<span class="admin-badge badge-unlinked"><span class="badge-dot"></span>⚠️ No Vinculado</span>`}
      </td>
      <td class="cell-rank">
        <div class="admin-rank-pill">
          <span class="rank-title">[${titleHtml}]</span>
          <span class="rank-role">${rankHtml}</span>
        </div>
      </td>
      <td class="cell-balance">
        <div class="admin-balance-val wallet">
          <span>🪙</span>
          <strong>${walletNum.toLocaleString()}</strong> <span class="currency-unit">NC</span>
        </div>
      </td>
      <td class="cell-balance">
        <div class="admin-balance-val bank">
          <span>🏦</span>
          <strong>${bankNum.toLocaleString()}</strong> <span class="currency-unit">NC</span>
        </div>
      </td>
      <td class="cell-actions" onclick="event.stopPropagation();">
        <button type="button" class="btn-adjust-balance" onclick="openAdjustBalanceModal('${escapeHtml(p.username)}', '${displayNameHtml}', ${walletNum}, ${bankNum}, '${avatar}')" title="Ajustar saldo">
          <span>💰</span>
          <span>Ajustar Saldo</span>
        </button>
      </td>
    </tr>
    `;
  }).join("");
}

const adminPlayersSearch = document.getElementById("admin-players-search");
if (adminPlayersSearch) {
  adminPlayersSearch.addEventListener("input", () => {
    applyPlayerFilters();
  });
}

// Modal Adjust Balance Helpers
window.selectAdjustAction = (action) => {
  const input = document.getElementById("adjust-action");
  if (input) input.value = action;
  document.querySelectorAll(".adjust-action-pills .btn-action-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.action === action);
  });
};

window.setAdjustAmount = (amount) => {
  const input = document.getElementById("adjust-amount");
  if (input) {
    input.value = amount;
    input.focus();
  }
};

window.openAdjustBalanceModal = (username, displayName, wallet = 0, bank = 0, avatarUrl = "") => {
  document.getElementById("adjust-user-target").value = username;
  document.getElementById("adjust-user-display").textContent = displayName || username;
  document.getElementById("adjust-user-gamertag").textContent = `@${username}`;
  
  const avatarEl = document.getElementById("adjust-user-avatar");
  if (avatarEl) {
    avatarEl.src = avatarUrl || `https://mc-heads.net/avatar/${username}/64`;
  }

  const walletEl = document.getElementById("adjust-user-current-wallet");
  if (walletEl) walletEl.textContent = `${wallet.toLocaleString()} NC`;

  const bankEl = document.getElementById("adjust-user-current-bank");
  if (bankEl) bankEl.textContent = `${bank.toLocaleString()} NC`;

  selectAdjustAction("add");
  document.getElementById("adjust-amount").value = "";
  openModal("modal-adjust-balance");

  setTimeout(() => {
    document.getElementById("adjust-amount")?.focus();
  }, 100);
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
