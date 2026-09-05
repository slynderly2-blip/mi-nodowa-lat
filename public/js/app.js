// ── Nodowa Network - Frontend Modular & Minimalista (Tema Claro) ──
import { apiRequest, showToast, escapeHtml, formatCoins } from "./api.js";
import { socket } from "./ws.js";

// Estado Global
let currentUser = null;
let currentTab = "store";
let storeCatalog = [];

// Inicialización al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  setupNavigation();
  setupEventListeners();
  setupWebSocket();

  // Renderizar iconos iniciales
  renderIcons();

  // Cargar pestaña inicial
  switchTab("store");
});

export function renderIcons(container = document) {
  const slots = container.querySelectorAll(".icon-slot");
  slots.forEach(slot => {
    const iconName = slot.getAttribute("data-icon");
    if (iconName && typeof window.getIcon === "function") {
      slot.innerHTML = window.getIcon(iconName);
    }
  });
}

// ── 1. NAVEGACIÓN SPA ──────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Actualizar botones de navegación
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
  });

  // Mostrar vista correspondiente
  document.querySelectorAll(".tab-view").forEach(view => {
    view.classList.remove("active");
    view.style.display = "none";
  });

  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) {
    activeView.classList.add("active");
    activeView.style.display = "block";
  }

  // Cargar datos según la pestaña activa
  if (tabId === "store") loadStoreCatalog();
  else if (tabId === "bank") loadBankData();
  else if (tabId === "deliveries") loadDeliveries();
  else if (tabId === "market") loadMarketListings();
  else if (tabId === "players") loadPlayersRegistry();
  else if (tabId === "leaderboard") loadLeaderboard();

  renderIcons();
}

// ── 2. AUTENTICACIÓN Y SESIÓN DE JUGADOR ────────────────────────
function initAuth() {
  const stored = localStorage.getItem("nodowa_user");
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      updateUserUI();
    } catch (_) {
      currentUser = null;
    }
  }

  // Formulario Login
  document.getElementById("form-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("input-login-gamertag");
    const name = input?.value.trim();
    if (!name) return showToast("Ingresa tu Gamertag", "error");

    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: name })
    });

    if (res.ok && res.user) {
      currentUser = res.user;
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      updateUserUI();
      closeModal("modal-login");
      showToast(`¡Bienvenido, ${currentUser.displayName || currentUser.username}!`, "success");
      if (currentTab === "bank") loadBankData();
      if (currentTab === "deliveries") loadDeliveries();
    } else {
      showToast(res.error || "No se pudo iniciar sesión", "error");
    }
  });
}

function updateUserUI() {
  const authSection = document.getElementById("header-auth");
  const mobileAuth = document.getElementById("mobile-user-card");

  if (!authSection) return;

  if (currentUser) {
    const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(currentUser.username)}/32`;
    authSection.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem; background: var(--purple-50); padding: 0.35rem 0.75rem; border-radius: var(--radius-full); border: 1px solid var(--purple-200);">
        <img src="${avatarUrl}" onError="this.src='/uploads/default_qr.svg'" style="width: 28px; height: 28px; border-radius: 50%; background: #fff; object-fit: contain;">
        <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${escapeHtml(currentUser.displayName || currentUser.username)}</span>
        <span class="mono text-purple" style="font-size: 0.85rem; font-weight: 800;">${formatCoins(currentUser.wallet || 0)}</span>
        <button class="cat-btn" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="logout()">Salir</button>
      </div>
    `;

    if (mobileAuth) {
      mobileAuth.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div>
            <strong>${escapeHtml(currentUser.displayName || currentUser.username)}</strong>
            <div class="mono text-purple">${formatCoins(currentUser.wallet || 0)}</div>
          </div>
          <button class="cat-btn" onclick="logout()">Salir</button>
        </div>
      `;
    }
  } else {
    authSection.innerHTML = `
      <button class="btn-primary" onclick="openModal('modal-login')" style="padding: 0.5rem 1.15rem; font-size: 0.875rem;">
        <span class="icon-slot" data-icon="user"></span> Entrar con Gamertag
      </button>
    `;
    if (mobileAuth) {
      mobileAuth.innerHTML = `
        <button class="btn-primary" style="width:100%;" onclick="openModal('modal-login')">
          <span class="icon-slot" data-icon="user"></span> Entrar con Gamertag
        </button>
      `;
    }
  }
  renderIcons();
}

export function logout() {
  currentUser = null;
  localStorage.removeItem("nodowa_user");
  updateUserUI();
  showToast("Sesión cerrada.", "info");
  if (currentTab === "bank") loadBankData();
  if (currentTab === "deliveries") loadDeliveries();
}

// ── 3. TIENDA DE ARTÍCULOS Y COMPRAS ───────────────────────────
async function loadStoreCatalog() {
  const container = document.getElementById("store-catalog-grid");
  if (!container) return;

  const res = await apiRequest("/api/store/items");
  if (res.ok && res.items) {
    storeCatalog = res.items;
    renderStoreCatalog();
  }
}

function renderStoreCatalog(filterCategory = "all") {
  const container = document.getElementById("store-catalog-grid");
  if (!container) return;

  let filtered = storeCatalog;
  if (filterCategory !== "all") {
    filtered = filtered.filter(i => (i.category || "").toLowerCase() === filterCategory.toLowerCase());
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 3rem;">No hay artículos disponibles en esta categoría.</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isCoinsAvailable = item.priceCoins > 0;
    const isUsdtAvailable = item.priceUsdt > 0;

    return `
      <div class="card store-card">
        ${item.badge ? `<span class="store-badge">${escapeHtml(item.badge)}</span>` : ""}
        <div class="store-icon-wrap">
          <span class="icon-slot text-purple" data-icon="${item.iconType || 'box'}"></span>
        </div>
        <h3 style="font-size: 1.15rem; margin-bottom: 0.35rem;">${escapeHtml(item.name)}</h3>
        <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1.25rem; min-height: 40px;">${escapeHtml(item.description || "Ítem exclusivo de Nodowa Network.")}</p>
        
        <div style="margin-top: auto; display: flex; flex-direction: column; gap: 0.65rem;">
          ${isCoinsAvailable ? `
            <button class="btn-primary" style="width: 100%; justify-content: center;" onclick="promptBuyWithCoins('${item.id}')">
              <span class="icon-slot" data-icon="coins"></span> Comprar por ${formatCoins(item.priceCoins)}
            </button>
          ` : ""}
          ${isUsdtAvailable ? `
            <button class="cat-btn" style="width: 100%; justify-content: center; background: rgba(245, 158, 11, 0.1); color: #d97706; border-color: rgba(245, 158, 11, 0.3);" onclick="promptBuyWithBinance('${item.id}')">
              <span class="icon-slot" data-icon="qr"></span> Comprar con USDT ($${item.priceUsdt.toFixed(2)})
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  renderIcons(container);
}

// Comprar con Nodocoins
window.promptBuyWithCoins = function(itemId) {
  if (!currentUser) return openModal("modal-login");
  const item = storeCatalog.find(i => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById("modal-confirm-purchase");
  if (!modal) return;

  document.getElementById("confirm-purchase-title").textContent = item.name;
  document.getElementById("confirm-purchase-desc").textContent = item.description || "¿Deseas comprar este artículo?";
  document.getElementById("confirm-purchase-price").textContent = formatCoins(item.priceCoins);
  document.getElementById("confirm-purchase-balance").textContent = formatCoins(currentUser.wallet || 0);

  const remaining = (currentUser.wallet || 0) - item.priceCoins;
  const remEl = document.getElementById("confirm-purchase-remaining");
  remEl.textContent = formatCoins(Math.max(0, remaining));
  remEl.style.color = remaining >= 0 ? "var(--text-main)" : "#ef4444";

  const execBtn = document.getElementById("btn-execute-purchase");
  execBtn.onclick = async () => {
    if (remaining < 0) return showToast("Saldo insuficiente en tu billetera.", "error");
    execBtn.disabled = true;

    const res = await apiRequest("/api/store/buy", {
      method: "POST",
      body: JSON.stringify({ username: currentUser.username, itemId: item.id })
    });

    execBtn.disabled = false;
    closeModal("modal-confirm-purchase");

    if (res.ok) {
      showToast(res.message, "success");
      currentUser = res.user;
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      updateUserUI();
    } else {
      showToast(res.error || "No se pudo realizar la compra.", "error");
    }
  };

  openModal("modal-confirm-purchase");
};

// Comprar con Binance USDT
window.promptBuyWithBinance = async function(itemId) {
  if (!currentUser) return openModal("modal-login");
  const item = storeCatalog.find(i => i.id === itemId);
  if (!item) return;

  const res = await apiRequest("/api/orders/binance-info");
  const binance = res.binance || {};

  const modal = document.getElementById("modal-binance-payment");
  if (!modal) return;

  document.getElementById("binance-item-name").textContent = item.name;
  document.getElementById("binance-item-price").textContent = `$${item.priceUsdt.toFixed(2)} USDT`;
  document.getElementById("binance-pay-id").textContent = binance.payId || "—";
  document.getElementById("binance-wallet-address").textContent = binance.walletAddress || "—";
  document.getElementById("binance-qr-img").src = binance.qrImage || "/uploads/default_qr.svg";
  document.getElementById("binance-order-item-id").value = item.id;

  openModal("modal-binance-payment");
};

// ── 4. BANCO Y TRANSFERENCIAS ──────────────────────────────────
async function loadBankData() {
  if (!currentUser) return;

  const res = await apiRequest(`/api/wallet/balance/${encodeURIComponent(currentUser.username)}`);
  if (res.ok && res.user) {
    currentUser.wallet = res.user.wallet;
    currentUser.bank = res.user.bank;
    localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
    updateUserUI();

    document.getElementById("bank-wallet-val").textContent = formatCoins(currentUser.wallet);
    document.getElementById("bank-balance-val").textContent = formatCoins(currentUser.bank);
    document.getElementById("bank-total-val").textContent = formatCoins((currentUser.wallet || 0) + (currentUser.bank || 0));
  }

  // Cargar transacciones recientes
  const txRes = await apiRequest(`/api/wallet/transactions/${encodeURIComponent(currentUser.username)}`);
  const tbody = document.getElementById("bank-transactions-table");
  if (tbody && txRes.ok) {
    if (!txRes.transactions || txRes.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center; padding: 2rem;">No tienes transacciones registradas todavía.</td></tr>`;
    } else {
      tbody.innerHTML = txRes.transactions.map(t => {
        const isIncoming = t.to?.toLowerCase() === currentUser.username.toLowerCase();
        const color = isIncoming ? "text-emerald" : "text-purple";
        const sign = isIncoming ? "+" : "-";

        return `
          <tr>
            <td class="mono text-muted" style="font-size:0.8rem;">${new Date(t.createdAt).toLocaleDateString()}</td>
            <td><strong>${escapeHtml(t.type)}</strong> <span class="text-muted" style="font-size:0.8rem;">(${escapeHtml(t.note || '')})</span></td>
            <td><span class="mono" style="font-size:0.85rem;">${escapeHtml(isIncoming ? t.from : t.to)}</span></td>
            <td class="mono ${color}" style="font-weight:700;">${sign}${formatCoins(t.amount)}</td>
          </tr>
        `;
      }).join("");
    }
  }
}

// ── 5. BUZÓN DE ENTREGAS Y BOTÓN "NO RECIBÍ MI PRODUCTO" ────────
async function loadDeliveries() {
  const tbody = document.getElementById("deliveries-table-body");
  if (!tbody) return;

  if (!currentUser) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 2.5rem;">Inicia sesión para ver tus compras y entregas.</td></tr>`;
    return;
  }

  const res = await apiRequest(`/api/deliveries?username=${encodeURIComponent(currentUser.username)}`);
  if (res.ok) {
    if (!res.deliveries || res.deliveries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 2.5rem;">Tu buzón está vacío. ¡Compra en la tienda para recibir tus ítems!</td></tr>`;
      return;
    }

    tbody.innerHTML = res.deliveries.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue = !!d.reportedIssue;

      let actionHtml = "";
      if (hasIssue) {
        actionHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.75rem;">⚠️ Reportado al Admin</span>`;
      } else {
        actionHtml = `
          <button class="cat-btn" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); white-space: nowrap;" onclick="openReportDeliveryModal('${escapeHtml(d.id)}', '${escapeHtml(d.itemTitle || 'Artículo')}')">
            <span class="icon-slot" data-icon="alert"></span> No recibí mi producto
          </button>
        `;
      }

      return `
        <tr>
          <td class="text-muted mono" style="font-size: 0.825rem;">${new Date(d.createdAt).toLocaleDateString()}</td>
          <td><strong>${escapeHtml(d.itemTitle || "Artículo")}</strong></td>
          <td class="mono text-muted" style="font-size: 0.8rem;">${escapeHtml(d.command || (d.giveCoins ? `+${d.giveCoins.toLocaleString()} NC` : 'Entrega manual'))}</td>
          <td>
            <span class="status-badge ${isDelivered ? 'status-approved' : 'status-pending'}">
              ${isDelivered ? 'Entregado en Minecraft' : 'Pendiente de Reclamo'}
            </span>
          </td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join("");

    renderIcons(tbody);
  }
}

window.openReportDeliveryModal = function(deliveryId, itemTitle) {
  const modal = document.getElementById("modal-report-delivery");
  if (!modal) return;
  document.getElementById("report-delivery-id").value = deliveryId;
  document.getElementById("report-delivery-item-name").textContent = itemTitle;
  document.getElementById("report-delivery-note").value = "";
  openModal("modal-report-delivery");
};

window.submitDeliveryReport = async function() {
  const deliveryId = document.getElementById("report-delivery-id")?.value;
  const note = document.getElementById("report-delivery-note")?.value.trim();
  const btn = document.getElementById("btn-submit-delivery-report");

  if (!deliveryId) return showToast("Identificador de entrega no válido.", "error");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando reporte...";
  }

  const res = await apiRequest("/api/deliveries/report-issue", {
    method: "POST",
    body: JSON.stringify({ deliveryId, username: currentUser.username, note })
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Enviar Reporte al Admin";
  }

  if (res.ok) {
    showToast("¡Reporte enviado! El Administrador revisará el registro para solucionar tu entrega.", "success");
    closeModal("modal-report-delivery");
    loadDeliveries();
  } else {
    showToast(res.error || "No se pudo enviar el reporte.", "error");
  }
};

// ── 6. MERCADO P2P ─────────────────────────────────────────────
async function loadMarketListings() {
  const container = document.getElementById("market-listings-grid");
  if (!container) return;

  const res = await apiRequest("/api/market/listings");
  if (res.ok && res.market) {
    if (res.market.length === 0) {
      container.innerHTML = `<div class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 3rem;">No hay publicaciones en el mercado P2P. ¡Sé el primero en vender!</div>`;
      return;
    }

    container.innerHTML = res.market.map(l => {
      const isOwner = currentUser && l.seller?.toLowerCase() === currentUser.username.toLowerCase();
      return `
        <div class="card p2p-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <img src="https://mc-heads.net/avatar/${encodeURIComponent(l.seller)}/24" style="width:24px; height:24px; border-radius:50%;">
              <strong style="font-size: 0.9rem;">${escapeHtml(l.seller)}</strong>
            </div>
            <span class="badge" style="background:var(--purple-100); color:var(--purple-700);">x${l.quantity || 1}</span>
          </div>
          <h3 style="font-size: 1.1rem; margin-bottom: 0.35rem;">${escapeHtml(l.title)}</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1rem; min-height: 36px;">${escapeHtml(l.description || l.itemType)}</p>
          <div class="flex-between" style="margin-top: auto; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <strong class="mono text-purple" style="font-size: 1.15rem;">${formatCoins(l.price)}</strong>
            ${isOwner ? `
              <button class="cat-btn" style="color:#ef4444;" onclick="deleteMarketListing('${l.id}')">Eliminar</button>
            ` : `
              <button class="btn-primary" style="padding: 0.4rem 0.9rem; font-size:0.85rem;" onclick="buyMarketListing('${l.id}')">Comprar</button>
            `}
          </div>
        </div>
      `;
    }).join("");
    renderIcons(container);
  }
}

window.buyMarketListing = async function(listingId) {
  if (!currentUser) return openModal("modal-login");
  const res = await apiRequest("/api/market/buy", {
    method: "POST",
    body: JSON.stringify({ buyer: currentUser.username, listingId })
  });

  if (res.ok) {
    showToast(res.message, "success");
    currentUser.wallet = res.newWallet;
    localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
    updateUserUI();
    loadMarketListings();
  } else {
    showToast(res.error || "Error en la compra", "error");
  }
};

window.deleteMarketListing = async function(listingId) {
  if (!currentUser) return;
  const res = await apiRequest("/api/market/delete", {
    method: "POST",
    body: JSON.stringify({ username: currentUser.username, listingId })
  });
  if (res.ok) {
    showToast("Publicación eliminada.", "success");
    loadMarketListings();
  } else {
    showToast(res.error || "No se pudo eliminar.", "error");
  }
};

// ── 7. DIRECTORIO DE JUGADORES & LEADERBOARD ───────────────────
async function loadPlayersRegistry() {
  const tbody = document.getElementById("players-registry-table-body");
  if (!tbody) return;

  const search = document.getElementById("input-search-players")?.value.trim() || "";
  const status = document.getElementById("filter-status-players")?.value || "all";

  const res = await apiRequest(`/api/players/public?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
  if (res.ok && res.players) {
    if (res.players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center; padding: 2rem;">No se encontraron jugadores.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.players.map(p => {
      const starsText = p.rating?.avgStars 
        ? `⭐ <strong style="color:var(--accent-gold);">${p.rating.avgStars}</strong> <span class="text-muted">(${p.rating.totalReviews})</span>` 
        : `<span class="text-muted" style="font-size:0.8rem;">Sin reseñas</span>`;

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <img src="https://mc-heads.net/avatar/${encodeURIComponent(p.username)}/28" style="width:28px; height:28px; border-radius:6px; background:#f1f5f9;">
              <strong>${escapeHtml(p.username)}</strong>
            </div>
          </td>
          <td>
            <span class="status-badge ${p.linked ? 'status-approved' : 'status-pending'}" style="font-size:0.75rem;">
              ${p.linked ? 'Vinculado' : 'Sin Vincular'}
            </span>
          </td>
          <td>${starsText}</td>
          <td class="mono text-purple" style="font-weight:700;">${formatCoins(p.wallet)}</td>
          <td class="mono text-emerald" style="font-weight:700;">${formatCoins(p.bank)}</td>
          <td class="mono" style="font-weight:800;">${formatCoins(p.totalFortune)}</td>
          <td>
            <button class="cat-btn" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="openPlayerReviewsModal('${escapeHtml(p.username)}')">
              Reseñas / Reportar
            </button>
          </td>
        </tr>
      `;
    }).join("");
    renderIcons(tbody);
  }
}

async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-table-body");
  if (!tbody) return;

  const res = await apiRequest("/api/leaderboard");
  if (res.ok && res.leaderboard) {
    tbody.innerHTML = res.leaderboard.map((u, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      return `
        <tr>
          <td style="font-size:1.15rem; text-align:center; font-weight:800;">${medal}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <img src="https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/28" style="width:28px; height:28px; border-radius:6px;">
              <strong>${escapeHtml(u.username)}</strong>
            </div>
          </td>
          <td class="mono text-purple" style="font-weight:700;">${formatCoins(u.wallet)}</td>
          <td class="mono text-emerald" style="font-weight:700;">${formatCoins(u.bank)}</td>
          <td class="mono" style="font-weight:900; font-size:1rem;">${formatCoins(u.total)}</td>
        </tr>
      `;
    }).join("");
  }
}

window.openPlayerReviewsModal = async function(targetUser) {
  const modal = document.getElementById("modal-player-reviews");
  const body = document.getElementById("modal-player-body");
  if (!modal || !body) return;

  document.getElementById("modal-player-title").textContent = `Reputación de ${targetUser}`;
  body.innerHTML = `<div class="text-muted" style="text-align:center; padding:1.5rem;">Cargando opiniones...</div>`;
  openModal("modal-player-reviews");

  const res = await apiRequest(`/api/players/reviews/${encodeURIComponent(targetUser)}`);
  if (res.ok) {
    const listHtml = (res.reviews || []).map(r => `
      <div style="padding:0.75rem; border-bottom:1px solid var(--border-subtle);">
        <div class="flex-between">
          <strong>${escapeHtml(r.author)}</strong>
          <span style="color:var(--accent-gold);">${'★'.repeat(r.stars)}</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.3rem;">${escapeHtml(r.comment || 'Sin comentario')}</p>
      </div>
    `).join("") || `<div class="text-muted" style="text-align:center; padding:1rem;">Este jugador no tiene reseñas aún.</div>`;

    body.innerHTML = `
      <div style="margin-bottom:1.5rem; max-height:220px; overflow-y:auto;">${listHtml}</div>
      <form id="form-add-review" style="border-top:1px solid var(--border-subtle); padding-top:1rem;">
        <h4 style="font-size:0.95rem; margin-bottom:0.6rem;">Deja tu Calificación</h4>
        <div style="display:grid; grid-template-columns: 120px 1fr; gap:0.75rem; margin-bottom:0.75rem;">
          <select id="review-stars" class="form-input">
            <option value="5">★★★★★ (5)</option>
            <option value="4">★★★★☆ (4)</option>
            <option value="3">★★★☆☆ (3)</option>
            <option value="2">★★☆☆☆ (2)</option>
            <option value="1">★☆☆☆☆ (1)</option>
          </select>
          <input type="text" id="review-comment" class="form-input" placeholder="Comentario sobre el jugador..." required>
        </div>
        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <button type="button" class="cat-btn" onclick="submitPlayerReview('${targetUser}', 'REPORT')" style="color:#ef4444;">Reportar</button>
          <button type="submit" class="btn-primary" style="padding:0.4rem 1rem;">Publicar Reseña</button>
        </div>
      </form>
    `;

    document.getElementById("form-add-review").onsubmit = (e) => {
      e.preventDefault();
      submitPlayerReview(targetUser, "REVIEW");
    };
  }
};

async function submitPlayerReview(targetUser, type) {
  if (!currentUser) return openModal("modal-login");
  const stars = document.getElementById("review-stars")?.value || 5;
  const comment = document.getElementById("review-comment")?.value.trim() || "";

  const res = await apiRequest("/api/players/reviews/submit", {
    method: "POST",
    body: JSON.stringify({ author: currentUser.username, targetUser, stars, comment, type })
  });

  if (res.ok) {
    showToast(res.message, "success");
    closeModal("modal-player-reviews");
    loadPlayersRegistry();
  } else {
    showToast(res.error || "No se pudo registrar.", "error");
  }
}

// ── 8. EVENTOS DE TIEMPO REAL (WEBSOCKET) ──────────────────────
function setupWebSocket() {
  socket.on("BALANCE_UPDATE", (data) => {
    if (currentUser && data.username?.toLowerCase() === currentUser.username.toLowerCase()) {
      if (data.wallet !== undefined) currentUser.wallet = data.wallet;
      if (data.bank !== undefined) currentUser.bank = data.bank;
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      updateUserUI();
      if (currentTab === "bank") loadBankData();
    }
  });

  socket.on("NEW_DELIVERY", () => {
    if (currentTab === "deliveries") loadDeliveries();
  });

  socket.on("DELIVERY_UPDATED", () => {
    if (currentTab === "deliveries") loadDeliveries();
  });

  socket.on("STORE_UPDATED", () => {
    if (currentTab === "store") loadStoreCatalog();
  });

  socket.on("P2P_NEW_LISTING", () => {
    if (currentTab === "market") loadMarketListings();
  });

  socket.on("P2P_BOUGHT", () => {
    if (currentTab === "market") loadMarketListings();
  });
}

// ── 9. MODALES Y EVENT LISTENERS ───────────────────────────────
function setupEventListeners() {
  // Filtros de tienda
  document.querySelectorAll(".cat-btn[data-category]").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".cat-btn[data-category]").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      renderStoreCatalog(b.getAttribute("data-category"));
    });
  });

  // Depósito Bancario
  document.getElementById("form-deposit-bank")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return openModal("modal-login");
    const amount = document.getElementById("input-deposit-amount")?.value;
    const res = await apiRequest("/api/wallet/deposit-bank", {
      method: "POST",
      body: JSON.stringify({ username: currentUser.username, amount })
    });
    if (res.ok) {
      showToast(res.message, "success");
      loadBankData();
      e.target.reset();
    } else {
      showToast(res.error || "Error en el depósito.", "error");
    }
  });

  // Retiro Bancario
  document.getElementById("form-withdraw-bank")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return openModal("modal-login");
    const amount = document.getElementById("input-withdraw-amount")?.value;
    const res = await apiRequest("/api/wallet/withdraw-bank", {
      method: "POST",
      body: JSON.stringify({ username: currentUser.username, amount })
    });
    if (res.ok) {
      showToast(res.message, "success");
      loadBankData();
      e.target.reset();
    } else {
      showToast(res.error || "Error en el retiro.", "error");
    }
  });

  // Transferencia a otro jugador
  document.getElementById("form-transfer-wallet")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return openModal("modal-login");
    const toUser = document.getElementById("input-transfer-to")?.value.trim();
    const amount = document.getElementById("input-transfer-amount")?.value;
    const note = document.getElementById("input-transfer-note")?.value.trim();

    const res = await apiRequest("/api/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({ fromUser: currentUser.username, toUser, amount, note })
    });

    if (res.ok) {
      showToast(res.message, "success");
      loadBankData();
      e.target.reset();
    } else {
      showToast(res.error || "Error en la transferencia.", "error");
    }
  });

  // Solicitud de código de vinculación Minecraft
  document.getElementById("btn-request-link-code")?.addEventListener("click", async () => {
    if (!currentUser) return openModal("modal-login");
    const res = await apiRequest("/api/auth/request-link", {
      method: "POST",
      body: JSON.stringify({ username: currentUser.username })
    });
    if (res.ok && res.code) {
      document.getElementById("link-code-display").textContent = res.code;
      document.getElementById("link-command-display").textContent = res.command;
      openModal("modal-link-account");
    } else {
      showToast(res.error || "No se pudo generar código.", "error");
    }
  });

  // Publicar ítem en mercado P2P
  document.getElementById("form-publish-market")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return openModal("modal-login");

    const title = document.getElementById("market-item-title")?.value.trim();
    const itemType = document.getElementById("market-item-type")?.value.trim();
    const quantity = document.getElementById("market-item-qty")?.value;
    const price = document.getElementById("market-item-price")?.value;
    const description = document.getElementById("market-item-desc")?.value.trim();

    const res = await apiRequest("/api/market/publish", {
      method: "POST",
      body: JSON.stringify({ seller: currentUser.username, title, itemType, quantity, price, description })
    });

    if (res.ok) {
      showToast("¡Artículo publicado en el mercado P2P!", "success");
      closeModal("modal-publish-market");
      loadMarketListings();
      e.target.reset();
    } else {
      showToast(res.error || "No se pudo publicar.", "error");
    }
  });

  // Subir orden de Binance
  document.getElementById("form-submit-binance-order")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const itemId = document.getElementById("binance-order-item-id")?.value;
    const txid = document.getElementById("binance-txid")?.value.trim();
    const fileInput = document.getElementById("binance-receipt-file");

    if (!currentUser) return openModal("modal-login");
    if (!fileInput?.files[0] && !txid) {
      return showToast("Ingresa el TXID o sube la captura del comprobante", "error");
    }

    const formData = new FormData();
    formData.append("username", currentUser.username);
    formData.append("itemId", itemId);
    if (txid) formData.append("txid", txid);
    if (fileInput.files[0]) formData.append("receiptImage", fileInput.files[0]);

    const res = await apiRequest("/api/orders/create", {
      method: "POST",
      body: formData,
      isFormData: true
    });

    if (res.ok) {
      showToast("¡Comprobante enviado! El administrador verificará tu pago.", "success");
      closeModal("modal-binance-payment");
      e.target.reset();
    } else {
      showToast(res.error || "Error al enviar orden.", "error");
    }
  });
}

// Helpers de Modales
export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("active");
    modal.style.display = "flex";
    renderIcons(modal);
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}

window.openModal = openModal;
window.closeModal = closeModal;
window.logout = logout;
