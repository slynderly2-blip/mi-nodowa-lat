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

// 3. Catálogo Tienda
async function loadAdminCatalog() {
  const tbody = document.getElementById("admin-catalog-tbody");
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    const items = data.items || [];

    tbody.innerHTML = items.map(i => `
      <tr>
        <td><strong>${i.name}</strong></td>
        <td><span class="badge">${i.category}</span></td>
        <td>🪙 ${i.priceCoins.toLocaleString()} NC</td>
        <td>💵 $${i.priceUsdt.toFixed(2)} USDT</td>
        <td style="font-family:monospace; font-size:0.8rem;">${i.command || "N/A"}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteCatalogItem('${i.id}')">Eliminar</button>
        </td>
      </tr>
    `).join("");
  } catch (e) {}
}

document.getElementById("add-item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("item-name").value.trim();
  const priceCoins = document.getElementById("item-price-coins").value;
  const priceUsdt = document.getElementById("item-price-usdt").value;
  const command = document.getElementById("item-command").value.trim();
  const giveCoins = document.getElementById("item-give-coins").value;
  const description = document.getElementById("item-desc").value.trim();

  try {
    const res = await fetch("/api/admin/store/save-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ name, priceCoins, priceUsdt, command, giveCoins, description })
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

// 4. Configuración Binance
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

// Inicialización
checkAdminState();
