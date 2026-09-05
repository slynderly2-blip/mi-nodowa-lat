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

// Auth & User State
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
    document.getElementById("btn-logout").onclick = () => {
      localStorage.removeItem("nodowa_user");
      currentUser = null;
      userData = { wallet: 0, bank: 0 };
      updateAuthUI();
      showToast("Sesión cerrada.");
    };
    loadBalance();
  } else {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-login">👤 Iniciar Sesión</button>`;
    document.getElementById("btn-login").onclick = () => openModal("modal-login");
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uname = document.getElementById("login-username").value.trim();
  if (!uname) return;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname })
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user.displayName || data.user.username;
      localStorage.setItem("nodowa_user", currentUser);
      userData.wallet = data.user.wallet || 0;
      userData.bank = data.user.bank || 0;
      closeModal("modal-login");
      updateAuthUI();
      showToast(`¡Bienvenido, ${currentUser}!`);
    } else {
      showToast(data.error || "Error al iniciar sesión");
    }
  } catch (err) {
    showToast("Error de conexión con el servidor");
  }
});

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
  const query = (document.getElementById("store-search").value || "").toLowerCase();
  const filtered = storeItems.filter(i => i.name.toLowerCase().includes(query) || (i.description || "").toLowerCase().includes(query));

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron artículos en la tienda.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="card">
      <div>
        <div class="card-header">
          <span class="card-title">${item.name}</span>
          ${item.badge ? `<span class="badge">${item.badge}</span>` : ""}
        </div>
        <p class="card-desc">${item.description || "Artículo oficial para tu aventura en Nodowa Network."}</p>
      </div>
      <div>
        <div class="card-prices">
          ${item.priceCoins > 0 ? `<span class="price-coins">🪙 ${item.priceCoins.toLocaleString()} NC</span>` : ""}
          ${item.priceUsdt > 0 ? `<span class="price-usdt">💵 $${item.priceUsdt.toFixed(2)} USDT</span>` : ""}
        </div>
        <button class="btn btn-primary btn-block" onclick="startCheckout('${item.id}')">Comprar Ahora</button>
      </div>
    </div>
  `).join("");
}

document.getElementById("store-search").addEventListener("input", renderStore);

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
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No hay ofertas en el mercado P2P. ¡Sé el primero en publicar una!</div>`;
    return;
  }

  grid.innerHTML = offers.map(o => `
    <div class="card">
      <div>
        <div class="card-header">
          <span class="card-title">${o.title}</span>
          <span class="badge">Vendedor: ${o.seller}</span>
        </div>
        <p class="card-desc">${o.description || "Oferta de jugador en Nodowa Network."}</p>
      </div>
      <div>
        <div class="card-prices">
          <span class="price-coins">🪙 ${o.priceCoins.toLocaleString()} NC</span>
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
      if (msg.event === "STORE_UPDATED") loadStore();
      else if (msg.event === "BALANCE_UPDATE" && currentUser && msg.data?.username?.toLowerCase() === currentUser.toLowerCase()) {
        loadBalance();
      }
      else if (msg.event === "NEW_ORDER" || msg.event === "ORDER_APPROVED") {
        if (currentUser) loadBalance();
      }
    } catch (err) {}
  };

  ws.onclose = () => { setTimeout(initWS, 4000); };
}

// Inicialización
updateAuthUI();
loadStore();
initWS();
