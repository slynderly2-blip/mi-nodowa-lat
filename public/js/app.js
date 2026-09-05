// Nodowa Network - Client Application (Minimal & Modular)
let currentUser = localStorage.getItem("nodowa_user") || null;
let userData = { wallet: 0, bank: 0 };
let storeItems = [];
let selectedItem = null;
let binanceConfig = null;

// Auth & User State (Vinculación segura mediante /link)
let pendingAuthCode = null;
let pendingAuthUsername = null;
let pendingSessionToken = localStorage.getItem("nodowa_session_token") || null;
let authCountdownInterval = null;
let authPollingInterval = null;

// Helper: Toast Notifications
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = "none"; }, 3500);
}

// Helper: Modals
window.openModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
};
window.closeModal = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
};

// Tabs Navigation (Desktop cabecera y Mobile barra inferior sincronizados)
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById(`view-${tabName}`);
    if (target) target.classList.add("active");

    if (tabName === "store") loadStore();
    else if (tabName === "market") loadMarket();
    else if (tabName === "wallet") loadBalance();
    else if (tabName === "deliveries") loadDeliveries();
    else if (tabName === "leaderboard") loadLeaderboard();

    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

// Helper de Íconos SVG para Artículos
function getItemSvg(category, iconType) {
  if (category === "coins" || iconType === "coins") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`;
  }
  if (category === "ranks" || iconType === "shield") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }
  if (category === "crates" || iconType === "key") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
  }
  if (category === "kits" || iconType === "sword") {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
}

// Auth UI
function updateAuthUI() {
  const container = document.getElementById("user-widget");
  if (currentUser) {
    container.innerHTML = `
      <div class="user-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>${currentUser}</span>
        <span class="coins-badge" id="pill-coins">${userData.wallet.toLocaleString()} NC</span>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-logout">Salir</button>
    `;
    document.getElementById("btn-logout").onclick = async () => {
      const sessionToken = localStorage.getItem("nodowa_session_token");
      if (sessionToken) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken })
          });
        } catch (_) {}
      }
      localStorage.removeItem("nodowa_user");
      localStorage.removeItem("nodowa_session_token");
      currentUser = null;
      pendingSessionToken = null;
      userData = { wallet: 0, bank: 0 };
      updateAuthUI();
      showToast("Sesión cerrada.");
    };
    loadBalance();
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btn-login">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Iniciar Sesión</span>
      </button>
    `;
    document.getElementById("btn-login").onclick = () => {
      resetAuthModal();
      openModal("modal-login");
    };
  }
}

function resetAuthModal() {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);
  pendingAuthCode = null;
  pendingAuthUsername = null;
  const s1 = document.getElementById("auth-step-1");
  const s2 = document.getElementById("auth-step-2");
  if (s1) s1.style.display = "block";
  if (s2) s2.style.display = "none";
}

// Paso 1: Solicitar código /link
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uname = document.getElementById("login-username").value.trim();
  if (!uname) return showToast("Ingresa tu Gamertag de Minecraft");

  const btn = document.getElementById("btn-request-link");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname })
    });
    const data = await res.json();
    if (data.ok) {
      pendingAuthCode = data.code;
      pendingAuthUsername = uname;
      pendingSessionToken = data.sessionToken;
      localStorage.setItem("nodowa_session_token", data.sessionToken);

      document.getElementById("auth-target-player").textContent = uname;
      document.getElementById("auth-code-text").textContent = `/link ${data.code}`;
      document.getElementById("auth-step-1").style.display = "none";
      document.getElementById("auth-step-2").style.display = "block";

      startAuthCountdown(data.expiresAt);
      showToast("Código generado. Escríbelo en Minecraft.");
    } else {
      showToast(data.error || "No se pudo generar el código");
    }
  } catch (err) {
    showToast("Error de conexión al generar código");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Copiar comando /link
document.getElementById("btn-copy-code")?.addEventListener("click", () => {
  if (!pendingAuthCode) return;
  const cmd = `/link ${pendingAuthCode}`;
  navigator.clipboard.writeText(cmd).then(() => {
    showToast(`Comando copiado: "${cmd}"`);
  }).catch(() => {
    showToast(`Comando: ${cmd}`);
  });
});

// Volver al paso 1
document.getElementById("btn-cancel-link")?.addEventListener("click", () => {
  resetAuthModal();
});

function startAuthCountdown(expiresAt) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  const timerEl = document.getElementById("auth-timer-countdown");

  authCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timerEl) {
      timerEl.textContent = `Expira en: ${formatted}`;
    }

    if (remaining <= 0) {
      clearInterval(authCountdownInterval);
      clearInterval(authPollingInterval);
      if (timerEl) timerEl.textContent = "Código expirado. Genera uno nuevo.";
    }
  }, 1000);

  authPollingInterval = setInterval(async () => {
    if (!pendingAuthCode) return;
    try {
      const res = await fetch(`/api/auth/check-link-status?code=${pendingAuthCode}&sessionToken=${pendingSessionToken || ''}`);
      const data = await res.json();
      if (data.ok && data.verified) {
        completeAuth(data.user);
      }
    } catch (_) {}
  }, 2500);
}

function completeAuth(user) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  currentUser = user.displayName || user.username;
  userData.wallet = user.wallet || 0;
  userData.bank = user.bank || 0;

  localStorage.setItem("nodowa_user", currentUser);

  closeModal("modal-login");
  resetAuthModal();
  updateAuthUI();
  showToast(`Cuenta vinculada con éxito. Bienvenido, ${currentUser}`);
}

async function validateCurrentSession() {
  const sessionToken = localStorage.getItem("nodowa_session_token");
  if (!sessionToken) return;

  try {
    const res = await fetch("/api/auth/validate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken })
    });
    const data = await res.json();
    if (data.ok && data.user) {
      currentUser = data.user.displayName || data.user.username;
      userData.wallet = data.user.wallet || 0;
      userData.bank = data.user.bank || 0;
      localStorage.setItem("nodowa_user", currentUser);
      updateAuthUI();
    }
  } catch (_) {}
}

// Balance & Wallet
async function loadBalance() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/wallet/balance/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      userData.wallet = data.user.wallet || 0;
      userData.bank = data.user.bank || 0;
      const pill = document.getElementById("pill-coins");
      if (pill) pill.textContent = `${userData.wallet.toLocaleString()} NC`;
      const wBal = document.getElementById("wallet-balance");
      if (wBal) wBal.textContent = `${userData.wallet.toLocaleString()} NC`;
      const bBal = document.getElementById("bank-balance");
      if (bBal) bBal.textContent = `${userData.bank.toLocaleString()} NC`;
    }
  } catch (err) {
    console.error("Error cargando saldo:", err);
  }
}

document.getElementById("transfer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return openModal("modal-login");

  const toUser = document.getElementById("transfer-to").value.trim();
  const amount = parseInt(document.getElementById("transfer-amount").value);
  const note = document.getElementById("transfer-note").value.trim();

  if (!toUser || isNaN(amount) || amount <= 0) return showToast("Datos inválidos");

  try {
    const res = await fetch("/api/wallet/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUser: currentUser, toUser, amount, note })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      document.getElementById("transfer-form").reset();
      loadBalance();
    } else {
      showToast(data.error || "Error en la transferencia");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// Store & Catalog
async function loadStore() {
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    if (data.ok) {
      storeItems = data.items || [];
      renderStore();
    }
  } catch (err) {
    console.error("Error cargando tienda:", err);
  }
}

function renderStore() {
  const grid = document.getElementById("store-grid");
  const storeTitle = document.getElementById("store-title");
  const storeSubtitle = document.getElementById("store-subtitle");
  const clearBtn = document.getElementById("search-clear-btn");
  const searchInput = document.getElementById("store-search");
  
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
  
  if (clearBtn) {
    clearBtn.style.display = query ? "flex" : "none";
  }

  let itemsToDisplay = [];

  if (!query) {
    // Por defecto: solo monedas
    itemsToDisplay = storeItems.filter(i => i.category === "coins" || (i.giveCoins && i.giveCoins > 0));
    if (storeTitle) storeTitle.textContent = "Paquetes de Nodocoins";
    if (storeSubtitle) storeSubtitle.textContent = "Acreditación instantánea en tu cuenta. Escribe en el buscador para ver otros productos.";
  } else {
    // Si busca: buscar en todo el catálogo
    itemsToDisplay = storeItems.filter(i => {
      const matchName = (i.name || "").toLowerCase().includes(query);
      const matchDesc = (i.description || "").toLowerCase().includes(query);
      const matchCategory = (i.category || "").toLowerCase().includes(query);
      const matchBadge = (i.badge || "").toLowerCase().includes(query);
      return matchName || matchDesc || matchCategory || matchBadge;
    });
    if (storeTitle) storeTitle.innerHTML = `Resultados para: <span style="color:var(--tiktok-red)">"${query}"</span>`;
    if (storeSubtitle) storeSubtitle.innerHTML = `Mostrando productos coincidentes. <button class="link-btn" onclick="clearSearch()">Ver solo monedas</button>`;
  }

  if (itemsToDisplay.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <h3>No encontramos productos para "${query}"</h3>
        <p>Prueba buscando "vip", "mvp", "llave", "kit" o vuelve al catálogo de monedas.</p>
        <button class="btn btn-secondary btn-sm" onclick="clearSearch()">Ver Monedas</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = itemsToDisplay.map(item => {
    const isCoin = item.category === "coins" || (item.giveCoins && item.giveCoins > 0);
    const iconSvg = getItemSvg(item.category, item.iconType);

    return `
      <div class="card ${isCoin ? 'coin-card' : ''}">
        <div class="card-top">
          <div class="card-icon-pill">${iconSvg}</div>
          ${item.badge ? `<span class="badge ${isCoin ? 'badge-coins' : 'badge-tiktok'}">${item.badge}</span>` : ""}
        </div>
        <div class="card-content">
          <h3 class="card-title">${item.name}</h3>
          <p class="card-desc">${item.description || "Artículo oficial para tu aventura en Nodowa Network."}</p>
        </div>
        <div class="card-footer">
          <div class="card-prices">
            ${item.priceCoins > 0 ? `<span class="price-coins">${item.priceCoins.toLocaleString()} <small>NC</small></span>` : ""}
            ${item.priceUsdt > 0 ? `<span class="price-usdt">$${item.priceUsdt.toFixed(2)} <small>USDT</small></span>` : ""}
          </div>
          <button class="btn btn-tiktok btn-block" onclick="startCheckout('${item.id}')">
            ${isCoin ? 'Recargar Monedas' : 'Comprar Producto'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.clearSearch = () => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = "";
    renderStore();
    searchInput.focus();
  }
};

window.setSearchTag = (tag) => {
  const searchInput = document.getElementById("store-search");
  if (searchInput) {
    searchInput.value = tag;
    renderStore();
    searchInput.focus();
  }
};

const storeSearchEl = document.getElementById("store-search");
if (storeSearchEl) {
  storeSearchEl.addEventListener("input", renderStore);
}

// Checkout Modal
window.startCheckout = (itemId) => {
  if (!currentUser) return openModal("modal-login");
  selectedItem = storeItems.find(i => i.id === itemId);
  if (!selectedItem) return;

  document.getElementById("checkout-item-title").textContent = selectedItem.name;
  document.getElementById("checkout-item-desc").textContent = selectedItem.description || "";
  document.getElementById("binance-pay-section").style.display = "none";

  const btnCoins = document.getElementById("btn-pay-coins");
  if (selectedItem.priceCoins > 0) {
    btnCoins.style.display = "block";
    btnCoins.textContent = `Pagar ${selectedItem.priceCoins.toLocaleString()} NC`;
    btnCoins.onclick = () => buyWithCoins(selectedItem.id);
  } else {
    btnCoins.style.display = "none";
  }

  const btnBinance = document.getElementById("btn-pay-binance");
  if (selectedItem.priceUsdt > 0) {
    btnBinance.style.display = "block";
    btnBinance.textContent = `Pagar $${selectedItem.priceUsdt.toFixed(2)} USDT`;
    btnBinance.onclick = () => showBinanceSection();
  } else {
    btnBinance.style.display = "none";
  }

  openModal("modal-checkout");
};

async function buyWithCoins(itemId) {
  try {
    const res = await fetch("/api/store/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, itemId })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-checkout");
      showToast(data.message || "¡Compra exitosa! Revisa tu buzón.");
      loadBalance();
    } else {
      showToast(data.error || "No se pudo completar la compra");
    }
  } catch (err) {
    showToast("Error procesando compra");
  }
}

async function showBinanceSection() {
  const section = document.getElementById("binance-pay-section");
  section.style.display = "block";
  if (!binanceConfig) {
    try {
      const res = await fetch("/api/orders/binance-info");
      const data = await res.json();
      if (data.ok && data.binance) {
        binanceConfig = data.binance;
        if (binanceConfig.payId) document.getElementById("binance-payid").textContent = binanceConfig.payId;
        if (binanceConfig.walletAddress) document.getElementById("binance-wallet").textContent = binanceConfig.walletAddress;
        if (binanceConfig.qrImage) document.getElementById("binance-qr").src = binanceConfig.qrImage;
      }
    } catch (e) {}
  }
}

document.getElementById("binance-order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedItem || !currentUser) return;

  const txid = document.getElementById("order-txid").value.trim();
  const fileInput = document.getElementById("order-receipt");
  if (!fileInput.files || !fileInput.files[0]) return showToast("Sube tu comprobante de pago");

  const formData = new FormData();
  formData.append("username", currentUser);
  formData.append("itemId", selectedItem.id);
  formData.append("txid", txid);
  formData.append("receiptImage", fileInput.files[0]);

  try {
    showToast("Subiendo comprobante...");
    const res = await fetch("/api/orders/create", { method: "POST", body: formData });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-checkout");
      document.getElementById("binance-order-form").reset();
      showToast("Comprobante enviado. Será validado en breve.");
    } else {
      showToast(data.error || "Error al enviar comprobante");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// P2P Market
async function loadMarket() {
  try {
    const res = await fetch("/api/market");
    const data = await res.json();
    if (data.ok) {
      renderMarket(data.offers || []);
    }
  } catch (err) {
    console.error("Error cargando mercado:", err);
  }
}

function renderMarket(offers) {
  const grid = document.getElementById("market-grid");
  if (offers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
        </div>
        <h3>No hay ofertas activas</h3>
        <p>Sé el primero en publicar una oferta en el mercado de jugadores.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = offers.map(o => `
    <div class="card">
      <div class="card-top">
        <div class="card-icon-pill">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
        </div>
        <span class="badge badge-tiktok">Vendedor: ${o.seller}</span>
      </div>
      <div class="card-content">
        <h3 class="card-title">${o.title}</h3>
        <p class="card-desc">${o.description || "Oferta de jugador en Nodowa Network."}</p>
      </div>
      <div class="card-footer">
        <div class="card-prices">
          <span class="price-coins">${o.priceCoins.toLocaleString()} <small>NC</small></span>
        </div>
        ${o.seller === currentUser
          ? `<button class="btn btn-secondary btn-block" disabled>Tu Oferta</button>`
          : `<button class="btn btn-success btn-block" onclick="buyMarketOffer('${o.id}')">Comprar Oferta</button>`
        }
      </div>
    </div>
  `).join("");
}

document.getElementById("btn-create-p2p").onclick = () => {
  if (!currentUser) return openModal("modal-login");
  openModal("modal-p2p");
};

document.getElementById("p2p-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const title = document.getElementById("p2p-title").value.trim();
  const priceCoins = parseInt(document.getElementById("p2p-price").value);
  const description = document.getElementById("p2p-desc").value.trim();

  try {
    const res = await fetch("/api/market/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: currentUser, title, priceCoins, description })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-p2p");
      document.getElementById("p2p-form").reset();
      showToast("Oferta publicada exitosamente.");
      loadMarket();
    } else {
      showToast(data.error || "Error al publicar");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

window.buyMarketOffer = async (offerId) => {
  if (!currentUser) return openModal("modal-login");
  if (!confirm("¿Deseas comprar esta oferta de mercado?")) return;

  try {
    const res = await fetch("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer: currentUser, offerId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Compra completada exitosamente.");
      loadBalance();
      loadMarket();
    } else {
      showToast(data.error || "Error en la compra");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

// Buzón & Entregas
async function loadDeliveries() {
  if (!currentUser) return;
  const tbody = document.getElementById("deliveries-tbody");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</td></tr>`;

  try {
    const res = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const list = data.deliveries || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes entregas pendientes en el buzón.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue = d.reportedIssue;
      let badgeHtml = isDelivered ? `<span class="badge success">Entregado</span>` : `<span class="badge warning">En Cola</span>`;
      if (hasIssue) badgeHtml = `<span class="badge danger">Reportado</span>`;

      return `
        <tr>
          <td><strong>${d.itemTitle || "Artículo"}</strong></td>
          <td style="font-size:0.82rem; color:var(--text-muted);">${new Date(d.createdAt).toLocaleString()}</td>
          <td>${badgeHtml}</td>
          <td>
            ${hasIssue
              ? `<span style="font-size:0.8rem; color:var(--red); font-weight:600;">En revisión</span>`
              : `<button class="btn btn-danger btn-sm" onclick="openReportModal('${d.id}')">Reportar Problema</button>`
            }
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--red);">Error al cargar entregas</td></tr>`;
  }
}

document.getElementById("btn-refresh-deliveries").onclick = loadDeliveries;

window.openReportModal = (deliveryId) => {
  document.getElementById("report-delivery-id").value = deliveryId;
  openModal("modal-report");
};

document.getElementById("report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const deliveryId = document.getElementById("report-delivery-id").value;
  const note = document.getElementById("report-note").value.trim();

  try {
    const res = await fetch("/api/deliveries/report-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId, username: currentUser, note })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-report");
      document.getElementById("report-form").reset();
      showToast("Reporte enviado al Administrador.");
      loadDeliveries();
    } else {
      showToast(data.error || "Error al enviar reporte");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// Top Ricos
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-tbody");
  try {
    const res = await fetch("/api/players/leaderboard");
    const data = await res.json();
    const list = data.leaderboard || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Sin datos de clasificación.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((p, idx) => `
      <tr>
        <td style="font-weight:700; color:${idx < 3 ? 'var(--tiktok-red)' : 'var(--text-muted)'};">${idx + 1}</td>
        <td><strong>${p.username}</strong></td>
        <td>${p.wallet.toLocaleString()} NC</td>
        <td>${p.bank.toLocaleString()} NC</td>
        <td style="font-weight:700; color:var(--emerald);">${p.total.toLocaleString()} NC</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red);">Error cargando ranking</td></tr>`;
  }
}

// WebSocket en tiempo real
function initWS() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const eventType = msg.type || msg.event;

      if (eventType === "USER_LINKED") {
        const isTarget = (pendingSessionToken && msg.sessionToken === pendingSessionToken) ||
                         (pendingAuthUsername && (
                           (msg.username && msg.username.toLowerCase() === pendingAuthUsername.toLowerCase()) ||
                           (msg.displayName && msg.displayName.toLowerCase() === pendingAuthUsername.toLowerCase())
                         ));
        if (isTarget && msg.user) {
          completeAuth(msg.user);
        }
      }
      else if (eventType === "STORE_UPDATED") loadStore();
      else if (eventType === "BALANCE_UPDATE" && currentUser && msg.data?.username?.toLowerCase() === currentUser.toLowerCase()) {
        loadBalance();
      }
      else if (eventType === "NEW_ORDER" || eventType === "ORDER_APPROVED") {
        if (currentUser) loadBalance();
      }
    } catch (err) {}
  };

  ws.onclose = () => { setTimeout(initWS, 4000); };
}

// Inicialización
validateCurrentSession();
updateAuthUI();
loadStore();
initWS();
