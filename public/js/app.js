// Nodowa Network - Client Application (Minimal & Modular)
let currentUser = localStorage.getItem("nodowa_user") || null;
let userData = { wallet: 0, bank: 0 };
let storeItems = [];
let selectedItem = null;
let binanceConfig = null;

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

// Tabs Navigation
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(`view-${btn.dataset.tab}`);
    if (target) target.classList.add("active");

    if (btn.dataset.tab === "store") loadStore();
    else if (btn.dataset.tab === "market") loadMarket();
    else if (btn.dataset.tab === "wallet") loadBalance();
    else if (btn.dataset.tab === "deliveries") loadDeliveries();
    else if (btn.dataset.tab === "leaderboard") loadLeaderboard();
  });
});

// Auth & User State (Vinculación segura mediante /link)
let pendingAuthCode = null;
let pendingAuthUsername = null;
let pendingSessionToken = localStorage.getItem("nodowa_session_token") || null;
let authCountdownInterval = null;
let authPollingInterval = null;

function updateAuthUI() {
  const container = document.getElementById("user-widget");
  if (currentUser) {
    container.innerHTML = `
      <div class="user-pill">
        <span>🎮 ${currentUser}</span>
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
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-login">👤 Iniciar Sesión</button>`;
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
      showToast("¡Código generado! Escríbelo en el chat de Minecraft.");
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
    showToast(`¡Copiado: "${cmd}"! Pégalo en Minecraft`);
  }).catch(() => {
    showToast(`Comando: ${cmd}`);
  });
});

// Cambiar Gamertag / Volver al paso 1
document.getElementById("btn-cancel-link")?.addEventListener("click", () => {
  resetAuthModal();
});

function startAuthCountdown(expiresAt) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  const timerEl = document.getElementById("auth-timer-countdown");

  // Contador regresivo
  authCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timerEl) {
      timerEl.textContent = `⏳ Expira en: ${formatted}`;
    }

    if (remaining <= 0) {
      clearInterval(authCountdownInterval);
      clearInterval(authPollingInterval);
      if (timerEl) timerEl.textContent = `⚠️ Código expirado. Genera uno nuevo.`;
    }
  }, 1000);

  // Sondeo en tiempo real cada 2.5 segundos
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
  showToast(`🎉 ¡Cuenta vinculada con éxito! Bienvenido, ${currentUser}`);
}

// Validar sesión persistente al abrir la web
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
    // POR DEFECTO: EN VEZ DE CATALOGO SOLO HABRA MONEDAS
    itemsToDisplay = storeItems.filter(i => i.category === "coins" || (i.giveCoins && i.giveCoins > 0));
    if (storeTitle) storeTitle.innerHTML = `🪙 Paquetes de Nodocoins`;
    if (storeSubtitle) storeSubtitle.textContent = `Acreditación instantánea en tu cuenta. Escribe en el buscador para ver otros productos 🔍`;
  } else {
    // SI QUEREMOS UN PRODUCTO: BUSCAR EN TODO EL CATALOGO
    itemsToDisplay = storeItems.filter(i => {
      const matchName = (i.name || "").toLowerCase().includes(query);
      const matchDesc = (i.description || "").toLowerCase().includes(query);
      const matchCategory = (i.category || "").toLowerCase().includes(query);
      const matchBadge = (i.badge || "").toLowerCase().includes(query);
      return matchName || matchDesc || matchCategory || matchBadge;
    });
    if (storeTitle) storeTitle.innerHTML = `🔍 Resultados para: <span style="color:var(--tiktok-red)">"${query}"</span>`;
    if (storeSubtitle) storeSubtitle.innerHTML = `Mostrando productos coincidentes. <button class="link-btn" onclick="clearSearch()">Ver solo monedas</button>`;
  }

  if (itemsToDisplay.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔎</div>
        <h3>No encontramos productos para "${query}"</h3>
        <p>Prueba buscando "vip", "mvp", "llave", "kit" o vuelve a la sección de monedas.</p>
        <button class="btn btn-secondary btn-sm" onclick="clearSearch()">Ver Monedas</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = itemsToDisplay.map(item => {
    const isCoin = item.category === "coins" || (item.giveCoins && item.giveCoins > 0);
    const iconEmoji = isCoin ? "🪙" : (item.category === "ranks" ? "👑" : (item.category === "crates" ? "🗝️" : "⚔️"));

    return `
      <div class="card tiktok-card ${isCoin ? 'coin-card' : ''}">
        <div class="card-top">
          <div class="card-icon-pill">${iconEmoji}</div>
          ${item.badge ? `<span class="badge ${isCoin ? 'badge-coins' : 'badge-tiktok'}">${item.badge}</span>` : ""}
        </div>
        <div class="card-content">
          <h3 class="card-title">${item.name}</h3>
          <p class="card-desc">${item.description || "Artículo oficial para tu aventura en Nodowa Network."}</p>
        </div>
        <div class="card-footer">
          <div class="card-prices">
            ${item.priceCoins > 0 ? `<span class="price-coins">🪙 ${item.priceCoins.toLocaleString()} <small>NC</small></span>` : ""}
            ${item.priceUsdt > 0 ? `<span class="price-usdt">💵 $${item.priceUsdt.toFixed(2)} <small>USDT</small></span>` : ""}
          </div>
          <button class="btn btn-tiktok btn-block" onclick="startCheckout('${item.id}')">
            ${isCoin ? '⚡ Recargar Monedas' : '🛒 Comprar Producto'}
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
    btnCoins.textContent = `🪙 Pagar ${selectedItem.priceCoins.toLocaleString()} NC`;
    btnCoins.onclick = () => buyWithCoins(selectedItem.id);
  } else {
    btnCoins.style.display = "none";
  }

  const btnBinance = document.getElementById("btn-pay-binance");
  if (selectedItem.priceUsdt > 0) {
    btnBinance.style.display = "block";
    btnBinance.textContent = `💵 Pagar $${selectedItem.priceUsdt.toFixed(2)} USDT`;
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
      showToast("¡Comprobante enviado! El administrador lo validará pronto.");
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
        <div class="empty-icon">🔄</div>
        <h3>No hay ofertas activas</h3>
        <p>¡Sé el primero en publicar una oferta en el mercado P2P!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = offers.map(o => `
    <div class="card tiktok-card">
      <div class="card-top">
        <div class="card-icon-pill">📦</div>
        <span class="badge badge-tiktok">Vendedor: ${o.seller}</span>
      </div>
      <div class="card-content">
        <h3 class="card-title">${o.title}</h3>
        <p class="card-desc">${o.description || "Oferta de jugador en Nodowa Network."}</p>
      </div>
      <div class="card-footer">
        <div class="card-prices">
          <span class="price-coins">🪙 ${o.priceCoins.toLocaleString()} <small>NC</small></span>
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
      showToast("¡Oferta publicada exitosamente!");
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
      showToast("¡Compra completada!");
      loadBalance();
      loadMarket();
    } else {
      showToast(data.error || "Error en la compra");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
};

// Buzón & Entregas (con Reclamo "No recibí mi producto")
async function loadDeliveries() {
  if (!currentUser) return;
  const tbody = document.getElementById("deliveries-tbody");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Cargando entregas...</td></tr>`;

  try {
    const res = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const list = data.deliveries || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes artículos ni comandos pendientes en el buzón.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue = d.reportedIssue;
      let badgeHtml = isDelivered ? `<span class="badge success">✅ Entregado</span>` : `<span class="badge warning">⏳ En Cola</span>`;
      if (hasIssue) badgeHtml = `<span class="badge danger">⚠️ Reportado</span>`;

      return `
        <tr>
          <td><strong>${d.itemTitle || "Artículo"}</strong></td>
          <td style="font-size:0.82rem; color:var(--text-muted);">${new Date(d.createdAt).toLocaleString()}</td>
          <td>${badgeHtml}</td>
          <td>
            ${hasIssue
              ? `<span style="font-size:0.8rem; color:var(--red); font-weight:600;">Reporte en revisión</span>`
              : `<button class="btn btn-danger btn-sm" onclick="openReportModal('${d.id}')">⚠️ No recibí mi producto</button>`
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
      showToast("Reporte enviado al Administrador con éxito.");
      loadDeliveries();
    } else {
      showToast(data.error || "Error al enviar reporte");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
});

// Top Ricos (Leaderboard)
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-tbody");
  try {
    const res = await fetch("/api/players/leaderboard");
    const data = await res.json();
    const list = data.leaderboard || [];

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin datos de clasificación.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((p, idx) => `
      <tr>
        <td style="font-weight:700; color:${idx < 3 ? 'var(--amber)' : 'var(--text-muted)'};">${idx + 1}</td>
        <td><strong>🎮 ${p.username}</strong></td>
        <td>🪙 ${p.wallet.toLocaleString()} NC</td>
        <td>🏦 ${p.bank.toLocaleString()} NC</td>
        <td style="font-weight:700; color:var(--emerald);">🪙 ${p.total.toLocaleString()} NC</td>
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
