// ── Estado Global de la Aplicación ───────────────────────────────
let currentUser = null;
let currentTab = "store";
let currentCategory = "all";
let storeCatalog = [];
let storeConfig = null;
let ws = null;
let pendingAuthUsername = null;
let authCountdownInterval = null;

// ── Inicialización ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderIcons();
  setupNavTabs();
  setupCategoryFilters();
  setupAuthEvents();
  setupStoreEvents();
  setupDropzone();
  setupP2pEvents();
  setupWalletEvents();
  setupPlayersRegistryEvents();
  
  // Validar sesión guardada en localStorage
  const sessionToken = localStorage.getItem("nodowa_session_token");
  const savedUser = localStorage.getItem("nodowa_user");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      updateUserWidget();
    } catch (_) {}
  }

  if (sessionToken) {
    validateSavedSession(sessionToken);
  }

  loadStoreItems();
  loadP2pListings();
  loadLeaderboard();
  loadPlayersRegistry();
  setupEditProfileEvents();
  initWebSocket();
});

// ── Renderizado de Iconos SVG ───────────────────────────────────
function renderIcons(container = document) {
  const slots = container.querySelectorAll(".icon-slot");
  slots.forEach(slot => {
    const iconName = slot.getAttribute("data-icon");
    if (iconName && typeof getIcon === "function") {
      slot.innerHTML = getIcon(iconName);
    }
  });

  const brandSlot = document.getElementById("brand-icon-slot");
  if (brandSlot && typeof getIcon === "function") {
    brandSlot.innerHTML = getIcon("coins");
  }
}

// ── Navegación por Tabs (Desktop + Mobile TikTok Bar) ───────────
function switchTab(targetTab) {
  // Desactivar todos los tabs (desktop + mobile)
  document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-item").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));

  // Activar el tab seleccionado en desktop y mobile
  document.querySelectorAll(`.tab-btn[data-tab="${targetTab}"]`).forEach(t => t.classList.add("active"));
  document.querySelectorAll(`.mobile-nav-item[data-tab="${targetTab}"]`).forEach(t => t.classList.add("active"));

  currentTab = targetTab;
  const targetView = document.getElementById(`view-${targetTab}`);
  if (targetView) targetView.classList.add("active");

  if (targetTab === "wallet") loadUserProfile();
  if (targetTab === "players") loadPlayersRegistry();
  if (targetTab === "deliveries") loadDeliveries();
  if (targetTab === "leaderboard") loadLeaderboard();
  if (targetTab === "market") loadP2pListings();
}

function setupNavTabs() {
  // Desktop tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });

  // Mobile TikTok bottom navbar
  document.querySelectorAll(".mobile-nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });
}

function setupCategoryFilters() {
  const catBtns = document.querySelectorAll(".cat-btn[data-cat]");
  catBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      catBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.getAttribute("data-cat");
      renderStoreCards();
    });
  });
}

// ── Validación de Sesión ────────────────────────────────────────
async function validateSavedSession(sessionToken) {
  try {
    const res = await fetch("/api/auth/validate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken })
    });
    const data = await res.json();
    if (data.ok && data.user) {
      currentUser = data.user;
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      updateUserWidget();
      loadUserProfile();
    } else {
      localStorage.removeItem("nodowa_session_token");
      localStorage.removeItem("nodowa_user");
      currentUser = null;
      updateUserWidget();
    }
  } catch (_) {}
}

// ── WebSocket para Tiempo Real ──────────────────────────────────
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      handleWsEvent(data);
    } catch (_) {}
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 4000);
  };
}

function handleWsEvent(data) {
  const { event, payload } = data;

  if (event === "USER_LINKED") {
    if (pendingAuthUsername && pendingAuthUsername === payload.username.toLowerCase()) {
      currentUser = payload.user;
      if (payload.sessionToken) {
        localStorage.setItem("nodowa_session_token", payload.sessionToken);
      }
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      clearInterval(authCountdownInterval);
      updateUserWidget();
      loadUserProfile();
      closeAuthModal();
      showToast(`¡Sesión autorizada para ${currentUser.displayName || currentUser.username}!`, "success");
      pendingAuthUsername = null;
    }
  } else if (event === "BALANCE_UPDATE") {
    if (currentUser && currentUser.username === payload.username) {
      currentUser.wallet = payload.wallet;
      updateUserWidget();
      loadUserProfile();
    }
  } else if (event === "ORDER_APPROVED") {
    if (currentUser && currentUser.username.toLowerCase() === payload.username.toLowerCase()) {
      showToast(`¡Tu pago de Binance por "${payload.itemTitle}" fue APROBADO!`, "success");
      loadUserProfile();
      loadDeliveries();
    }
  } else if (event === "P2P_NEW" || event === "P2P_BOUGHT") {
    loadP2pListings();
  } else if (event === "STORE_UPDATED") {
    loadStoreItems();
  } else if (event === "PLAYERS_SYNCED") {
    loadPlayersRegistry();
  }
}

let pendingAuthCode = null;

// ── Autenticación / Login / Vinculación con /link OTP ───────────
function setupAuthEvents() {
  document.getElementById("btn-open-auth")?.addEventListener("click", openAuthModal);

  document.getElementById("btn-request-link-code")?.addEventListener("click", async () => {
    const input = document.getElementById("auth-input-username");
    const username = input.value.trim();
    if (!username) return showToast("Ingresa tu Gamertag de Minecraft", "error");

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.ok) {
        pendingAuthUsername = username.toLowerCase();
        pendingAuthCode = data.code;
        document.getElementById("auth-target-player-name").innerText = username;
        document.getElementById("auth-generated-code").innerText = `/link ${data.code}`;
        document.getElementById("auth-step-1").style.display = "none";
        document.getElementById("auth-step-2").style.display = "block";
        
        startAuthCountdown(data.expiresAt);
        renderIcons(document.getElementById("modal-auth"));
      } else {
        showToast(data.error || "No se pudo generar el código", "error");
      }
    } catch (e) {
      showToast("Error al solicitar código /link", "error");
    }
  });



  document.getElementById("btn-copy-link-cmd")?.addEventListener("click", () => {
    const text = document.getElementById("auth-generated-code").innerText;
    copyText(text);
  });


  // Confirmación de Logout
  document.getElementById("btn-execute-confirmed-logout")?.addEventListener("click", async () => {
    const sessionToken = localStorage.getItem("nodowa_session_token");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken })
      });
    } catch (_) {}

    localStorage.removeItem("nodowa_session_token");
    localStorage.removeItem("nodowa_user");
    currentUser = null;
    updateUserWidget();
    closeConfirmLogoutModal();
    showToast("Sesión cerrada correctamente", "info");
    loadUserProfile();
  });
}

let authPollingInterval = null;

function startAuthCountdown(expiresAt) {
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);

  const timerElem = document.getElementById("auth-timer-countdown");

  authCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timerElem) {
      timerElem.innerText = `⏳ Válido por 15 minutos (Expira en: ${formatted})`;
    }

    if (remaining <= 0) {
      clearInterval(authCountdownInterval);
      clearInterval(authPollingInterval);
      if (timerElem) timerElem.innerText = `⚠️ El código expiró. Genera uno nuevo.`;
    }
  }, 1000);

  // Sondeo cada 2.5 segundos por si el evento WebSocket se pierde
  authPollingInterval = setInterval(async () => {
    if (!pendingAuthCode || !pendingAuthUsername) return;

    try {
      const res = await fetch(`/api/auth/check-link-status?code=${pendingAuthCode}`);
      const data = await res.json();
      if (data.verified) {
        clearInterval(authCountdownInterval);
        clearInterval(authPollingInterval);
        
        // Re-validar perfil o refrescar usuario
        const profRes = await fetch(`/api/user/profile?username=${encodeURIComponent(pendingAuthUsername)}`);
        const profData = await profRes.json();
        if (profData.ok && profData.user) {
          currentUser = profData.user;
          localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
          updateUserWidget();
          loadUserProfile();
          closeAuthModal();
          showToast(`¡Sesión autorizada en Minecraft para ${currentUser.displayName || currentUser.username}!`, "success");
          pendingAuthUsername = null;
          pendingAuthCode = null;
        }
      }
    } catch (_) {}
  }, 2500);
}

function openAuthModal() {
  document.getElementById("modal-auth").classList.add("active");
  document.getElementById("auth-step-1").style.display = "block";
  document.getElementById("auth-step-2").style.display = "none";
  renderIcons(document.getElementById("modal-auth"));
}

function closeAuthModal() {
  document.getElementById("modal-auth").classList.remove("active");
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);
}

function backToAuthStep1() {
  document.getElementById("auth-step-1").style.display = "block";
  document.getElementById("auth-step-2").style.display = "none";
  clearInterval(authCountdownInterval);
  clearInterval(authPollingInterval);
}


function openConfirmLogoutModal() {
  if (!currentUser) return;
  document.getElementById("logout-target-name").innerText = currentUser.displayName || currentUser.username;
  document.getElementById("modal-confirm-logout").classList.add("active");
  renderIcons(document.getElementById("modal-confirm-logout"));
}

function closeConfirmLogoutModal() {
  document.getElementById("modal-confirm-logout").classList.remove("active");
}

function updateUserWidget() {
  const container = document.getElementById("user-widget-container");
  if (!container) return;

  if (currentUser) {
    const avatarUrl = currentUser.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(currentUser.username)}/100`;
    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <div class="user-badge-card" onclick="openEditProfileModal()" title="Editar Mi Perfil (Foto, Bio, WhatsApp, Discord)">
          <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--purple-300);">
          <div class="user-info-mini">
            <span class="name">${currentUser.displayName || currentUser.username}</span>
            <span class="balance">${(currentUser.wallet || 0).toLocaleString()} NC</span>
          </div>
        </div>
        <button class="cat-btn" onclick="openConfirmLogoutModal()" style="padding: 6px 10px; font-size: 0.8rem;" title="Cerrar Sesión">
          <span class="icon-slot" data-icon="x"></span>
        </button>
      </div>
    `;
    renderIcons(container);
  } else {
    container.innerHTML = `
      <button class="btn-auth" id="btn-open-auth" onclick="openAuthModal()">
        <span class="icon-slot" data-icon="user"></span> Iniciar Sesión
      </button>
    `;
    renderIcons(container);
  }
}

// ── Cargar y Renderizar Catálogo de Tienda ───────────────────────
async function loadStoreItems() {
  try {
    const res = await fetch("/api/store/items");
    const data = await res.json();
    if (data.ok) {
      storeCatalog = data.items;
      storeConfig = data.config;
      renderStoreCards();
    }
  } catch (e) {
    console.error("Error al cargar tienda:", e);
  }
}

function renderStoreCards() {
  const grid = document.getElementById("store-items-grid");
  if (!grid || !storeCatalog || storeCatalog.length === 0) return;

  const filtered = currentCategory === "all"
    ? storeCatalog
    : storeCatalog.filter(i => i.category === currentCategory);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="table-container" style="grid-column: 1/-1; padding: 2.5rem; text-align: center; color: var(--text-muted);">No hay artículos disponibles en esta categoría.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="store-card">
      <div>
        <div class="card-top">
          <div class="card-icon">
            <span class="icon-slot" data-icon="${item.iconType || 'box'}"></span>
          </div>
          ${item.badge ? `<div class="card-badge">${item.badge}</div>` : ''}
        </div>
        <div class="card-body">
          <h3>${item.name}</h3>
          <p>${item.description}</p>
        </div>
      </div>
      <div class="card-footer">
        <div class="price-tag">
          ${item.priceCoins > 0 ? `<span class="price-coins">${item.priceCoins.toLocaleString()} NC</span>` : ''}
          ${item.priceUsdt > 0 ? `<span class="price-usdt">$${item.priceUsdt.toFixed(2)} USDT</span>` : ''}
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${item.priceCoins > 0 ? `
            <button class="btn-buy-coins" onclick="buyItemWithCoins('${item.id}')" title="Comprar con Nodocoins">
              <span class="icon-slot" data-icon="coins"></span> Comprar
            </button>
          ` : ''}
          ${item.priceUsdt > 0 ? `
            <button class="btn-buy-binance" onclick="openBinancePayModal('${item.id}')" title="Pagar con Binance QR">
              <span class="icon-slot" data-icon="qr"></span> Binance
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join("");

  renderIcons(grid);
}

// Comprar con Monedas del Juego
async function buyItemWithCoins(itemId) {
  if (!currentUser) {
    showToast("Debes iniciar sesión para comprar", "error");
    openAuthModal();
    return;
  }

  try {
    const res = await fetch("/api/store/buy-coins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username, itemId })
    });
    const data = await res.json();
    if (data.ok) {
      currentUser.wallet = data.newWallet;
      updateUserWidget();
      showToast(data.message, "success");
      loadUserProfile();
      loadDeliveries();
    } else {
      showToast(data.error || "No se pudo realizar la compra", "error");
    }
  } catch (e) {
    showToast("Error de conexión con el servidor", "error");
  }
}

// ── Dropzone y Subida de Comprobante Binance ────────────────────
function setupDropzone() {
  const dropzone = document.getElementById("binance-receipt-dropzone");
  const fileInput = document.getElementById("binance-input-file");
  const previewBox = document.getElementById("binance-file-preview-box");
  const previewImg = document.getElementById("binance-preview-img");
  const previewName = document.getElementById("binance-preview-name");
  const previewSize = document.getElementById("binance-preview-size");

  if (!dropzone || !fileInput) return;

  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleSelectedFile(files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      handleSelectedFile(fileInput.files[0]);
    }
  });

  function handleSelectedFile(file) {
    if (!file.type.startsWith("image/")) {
      showToast("Por favor adjunta una imagen válida (JPG, PNG, WEBP)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewName.innerText = file.name;
      previewSize.innerText = `${(file.size / 1024).toFixed(1)} KB`;
      dropzone.style.display = "none";
      previewBox.style.display = "flex";
      renderIcons(previewBox);
    };
    reader.readAsDataURL(file);
  }
}

function clearReceiptPreview() {
  const dropzone = document.getElementById("binance-receipt-dropzone");
  const fileInput = document.getElementById("binance-input-file");
  const previewBox = document.getElementById("binance-file-preview-box");
  if (fileInput) fileInput.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (dropzone) dropzone.style.display = "block";
}

function setupStoreEvents() {
  const formBinance = document.getElementById("form-binance-receipt");
  formBinance?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const itemId = document.getElementById("binance-selected-item-id").value;
    const username = document.getElementById("binance-input-username").value.trim();
    const txid = document.getElementById("binance-input-txid").value.trim();
    const fileInput = document.getElementById("binance-input-file");

    if (!username || !txid || !fileInput.files[0]) {
      return showToast("Completa todos los campos y adjunta la captura del comprobante", "error");
    }

    const formData = new FormData();
    formData.append("username", username);
    formData.append("itemId", itemId);
    formData.append("txid", txid);
    formData.append("receipt", fileInput.files[0]);

    try {
      const res = await fetch("/api/payments/binance/submit", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message, "success");
        closeBinanceModal();
        formBinance.reset();
        clearReceiptPreview();
      } else {
        showToast(data.error || "Error al enviar comprobante", "error");
      }
    } catch (err) {
      showToast("Error de subida de archivo", "error");
    }
  });
}

function openBinancePayModal(itemId) {
  let item = null;
  if (storeCatalog && storeCatalog.length > 0) {
    item = storeCatalog.find(i => i.id === itemId);
  }
  
  // Fallbacks si aún no terminó de cargar
  if (!item) {
    const fallbackPrices = {
      vip_plus: 4.99,
      coins_pack_10k: 2.50,
      kit_gladiator: 3.00,
      protection_block_100: 1.99,
      key_mythic: 1.50
    };
    item = { id: itemId, priceUsdt: fallbackPrices[itemId] || 2.00 };
  }

  document.getElementById("binance-selected-item-id").value = item.id;
  document.getElementById("binance-order-amount").innerText = `$${item.priceUsdt.toFixed(2)} USDT`;
  
  if (storeConfig && storeConfig.binance) {
    document.getElementById("binance-pay-id-val").innerText = storeConfig.binance.payId || "847291039";
    document.getElementById("binance-qr-img").src = storeConfig.binance.qrImage || "/uploads/default_qr.svg";
    document.getElementById("binance-instruction-text").innerText = storeConfig.binance.instruction || "Transfiere el monto exacto vía Binance Pay ID o USDT.";
  }

  if (currentUser) {
    document.getElementById("binance-input-username").value = currentUser.displayName || currentUser.username;
  }

  clearReceiptPreview();
  document.getElementById("modal-binance-pay").classList.add("active");
  renderIcons(document.getElementById("modal-binance-pay"));
}

function closeBinanceModal() {
  document.getElementById("modal-binance-pay").classList.remove("active");
}

// ── Mercado P2P ────────────────────────────────────────────────
function setupP2pEvents() {
  document.getElementById("btn-open-list-item")?.addEventListener("click", () => {
    if (!currentUser) {
      showToast("Inicia sesión para publicar en el mercado P2P", "error");
      openAuthModal();
      return;
    }
    document.getElementById("modal-p2p-list").classList.add("active");
  });

  document.getElementById("form-p2p-list")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const title = document.getElementById("p2p-title").value.trim();
    const price = document.getElementById("p2p-price").value;
    const quantity = document.getElementById("p2p-qty").value;
    const whatsapp = document.getElementById("p2p-whatsapp").value.trim();
    const discord = document.getElementById("p2p-discord").value.trim();
    const description = document.getElementById("p2p-desc").value.trim();
    const imageFile = document.getElementById("p2p-image-file")?.files[0];

    const formData = new FormData();
    formData.append("seller", currentUser.displayName || currentUser.username);
    formData.append("title", title);
    formData.append("price", price);
    formData.append("quantity", quantity);
    if (whatsapp) formData.append("whatsapp", whatsapp);
    if (discord) formData.append("discord", discord);
    if (description) formData.append("description", description);
    if (imageFile) formData.append("image", imageFile);

    try {
      const res = await fetch("/api/market/list", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.ok) {
        showToast("¡Anuncio publicado con éxito en el Mercado P2P!", "success");
        closeP2pModal();
        document.getElementById("form-p2p-list").reset();
        loadP2pListings();
      } else {
        showToast(data.error || "No se pudo publicar", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    }
  });

  // Handler para enviar reportes anti-estafas
  document.getElementById("form-submit-report")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const targetUser = document.getElementById("report-input-target-user").value;
    const reason = document.getElementById("report-reason-select").value;
    const description = document.getElementById("report-description").value.trim();
    const proof = document.getElementById("report-proof").value.trim();

    try {
      const res = await fetch("/api/reports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter: currentUser.displayName || currentUser.username,
          targetUser,
          reason,
          description,
          proof
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast("¡Reporte enviado exitosamente a la administración!", "success");
        closeReportModal();
        document.getElementById("form-submit-report").reset();
      } else {
        showToast(data.error || "Error al enviar reporte", "error");
      }
    } catch (_) {
      showToast("Error de conexión", "error");
    }
  });
}

function closeP2pModal() {
  document.getElementById("modal-p2p-list").classList.remove("active");
}

async function loadP2pListings() {
  try {
    const res = await fetch("/api/market/listings");
    const data = await res.json();
    if (data.ok) {
      renderP2pCards(data.listings);
    }
  } catch (e) {}
}

function renderP2pCards(listings) {
  const grid = document.getElementById("p2p-items-grid");
  if (!grid) return;

  if (!listings || listings.length === 0) {
    grid.innerHTML = `<div class="table-container" style="grid-column: 1/-1; padding: 2.5rem; text-align: center; color: var(--text-muted);">No hay anuncios en el mercado P2P. ¡Sé el primero en publicar un ítem!</div>`;
    return;
  }

  const currentUname = currentUser ? (currentUser.displayName || currentUser.username).toLowerCase() : "";

  grid.innerHTML = listings.map(l => {
    const isOwner = currentUname && l.seller.toLowerCase() === currentUname;
    const cleanWa = l.whatsapp ? l.whatsapp.replace(/[^0-9]/g, '') : null;

    return `
      <div class="p2p-card">
        <div>
          ${l.imageUrl ? `<img src="${l.imageUrl}" alt="${l.title}" style="width: 100%; height: 180px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1rem;">` : ''}
          
          <div class="p2p-seller-info" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted);">
              <span class="icon-slot" data-icon="user"></span>
              <span>Vendedor: <strong class="text-purple">${l.seller}</strong></span>
            </div>
            ${!isOwner ? `
              <button class="cat-btn" style="padding: 2px 8px; font-size: 0.75rem; color: var(--accent-rose);" onclick="openReportModal('${l.seller}')" title="Reportar este vendedor">
                <span class="icon-slot" data-icon="shield"></span> Reportar
              </button>
            ` : ''}
          </div>

          <h3 style="font-size: 1.25rem; margin-bottom: 0.5rem;">${l.title}</h3>
          <p class="text-muted" style="font-size: 0.95rem; margin-bottom: 1.25rem;">${l.description || 'Sin detalles adicionales'}</p>

          <!-- Botones de contacto WhatsApp y Discord -->
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;">
            ${cleanWa ? `
              <a href="https://wa.me/${cleanWa}?text=${encodeURIComponent('Hola ' + l.seller + ', vi tu anuncio "' + l.title + '" en Nodowa Network por ' + l.price + ' NC.')}" target="_blank" class="btn-whatsapp">
                📱 Contactar por WhatsApp
              </a>
            ` : ''}
            ${l.discord ? `
              <button type="button" class="btn-discord" onclick="copyText('${l.discord}'); showToast('Tag de Discord copiado: ${l.discord}', 'info');">
                🎮 Discord: ${l.discord}
              </button>
            ` : ''}
          </div>
        </div>

        <div class="card-footer">
          <div class="price-coins mono" style="font-size: 1.25rem;">${l.price.toLocaleString()} NC</div>
          ${isOwner ? `
            <button class="btn-primary" style="background: var(--accent-rose-gradient);" onclick="deleteP2pListing('${l.id}')">
              <span class="icon-slot" data-icon="x"></span> Eliminar
            </button>
          ` : `
            <button class="btn-primary" onclick="openTransferWithTarget('${l.seller}', ${l.price})">
              <span class="icon-slot" data-icon="wallet"></span> Pagar al Vendedor
            </button>
          `}
        </div>
      </div>
    `;
  }).join("");

  renderIcons(grid);
}

function openTransferWithTarget(targetUser, amount) {
  if (!currentUser) {
    showToast("Inicia sesión para transferir monedas", "error");
    openAuthModal();
    return;
  }
  
  // Cambiar a tab de billetera
  document.querySelector('[data-tab="wallet"]')?.click();
  setTimeout(() => {
    const inputTarget = document.getElementById("transfer-target");
    const inputAmount = document.getElementById("transfer-amount");
    if (inputTarget) inputTarget.value = targetUser;
    if (inputAmount) inputAmount.value = amount;
    inputTarget?.focus();
    showToast(`Iniciando transferencia para ${targetUser}. Completa y presiona Enviar.`, "info");
  }, 200);
}

async function deleteP2pListing(listingId) {
  if (!currentUser || !confirm("¿Estás seguro de eliminar este anuncio del mercado P2P?")) return;

  try {
    const res = await fetch("/api/market/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, seller: currentUser.displayName || currentUser.username })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Anuncio eliminado del mercado P2P", "success");
      loadP2pListings();
    } else {
      showToast(data.error || "No se pudo eliminar", "error");
    }
  } catch (_) {
    showToast("Error de conexión", "error");
  }
}

function showOfficialReceipt(receipt) {
  if (!receipt) return;
  document.getElementById("receipt-modal-id").innerText = receipt.receiptId || "REC-000000";
  document.getElementById("receipt-modal-from").innerText = receipt.from || "--";
  document.getElementById("receipt-modal-to").innerText = receipt.to || "--";
  document.getElementById("receipt-modal-amount").innerText = `${(receipt.amount || 0).toLocaleString()} NC`;
  document.getElementById("receipt-modal-date").innerText = new Date(receipt.timestamp).toLocaleString("es-ES");
  document.getElementById("receipt-modal-hash").innerText = receipt.securityHash || "NODOWA-HASH-OFFICIAL";

  document.getElementById("modal-official-receipt").classList.add("active");
  renderIcons(document.getElementById("modal-official-receipt"));
}

function closeReceiptModal() {
  document.getElementById("modal-official-receipt").classList.remove("active");
}

function openReportModal(targetUser) {
  if (!currentUser) {
    showToast("Inicia sesión para enviar un reporte", "error");
    openAuthModal();
    return;
  }
  document.getElementById("report-input-target-user").value = targetUser;
  document.getElementById("report-target-display").value = targetUser;
  document.getElementById("modal-report-user").classList.add("active");
  renderIcons(document.getElementById("modal-report-user"));
}

function closeReportModal() {
  document.getElementById("modal-report-user").classList.remove("active");
}

// ── Billetera, Banco y Transferencias ───────────────────────────
function setupWalletEvents() {
  document.getElementById("btn-deposit-bank")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const amount = document.getElementById("deposit-amount").value;
    if (!amount || amount <= 0) return showToast("Ingresa un monto válido", "error");

    try {
      const res = await fetch("/api/wallet/bank-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.username, action: "deposit", amount })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("deposit-amount").value = "";
        currentUser.wallet = data.wallet;
        currentUser.bank = data.bank;
        updateUserWidget();
        loadUserProfile();
        showToast("¡Depósito al banco realizado con éxito!", "success");
      } else {
        showToast(data.error || "Error al depositar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  });

  document.getElementById("btn-withdraw-bank")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const amount = document.getElementById("withdraw-amount").value;
    if (!amount || amount <= 0) return showToast("Ingresa un monto válido", "error");

    try {
      const res = await fetch("/api/wallet/bank-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.username, action: "withdraw", amount })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("withdraw-amount").value = "";
        currentUser.wallet = data.wallet;
        currentUser.bank = data.bank;
        updateUserWidget();
        loadUserProfile();
        showToast("¡Retiro a mano realizado!", "success");
      } else {
        showToast(data.error || "Error al retirar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  });

  document.getElementById("btn-send-transfer")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const to = document.getElementById("transfer-target").value.trim();
    const amount = document.getElementById("transfer-amount").value;
    if (!to || !amount || amount <= 0) return showToast("Completa los datos de la transferencia", "error");

    try {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: currentUser.username, to, amount })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("transfer-target").value = "";
        document.getElementById("transfer-amount").value = "";
        currentUser.wallet = data.senderWallet;
        updateUserWidget();
        loadUserProfile();
        showToast(`¡Transferencia de ${amount} NC enviada a ${to}!`, "success");
        if (data.receipt) {
          showOfficialReceipt(data.receipt);
        }
      } else {
        showToast(data.error || "Error en la transferencia", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  });

  document.getElementById("btn-refresh-deliveries")?.addEventListener("click", loadDeliveries);
}

async function loadUserProfile() {
  const authReq = document.getElementById("wallet-auth-required");
  const authContent = document.getElementById("wallet-authenticated-content");

  if (!currentUser) {
    if (authReq) authReq.style.display = "block";
    if (authContent) authContent.style.display = "none";
    return;
  }

  if (authReq) authReq.style.display = "none";
  if (authContent) authContent.style.display = "block";

  try {
    const res = await fetch(`/api/user/profile?username=${encodeURIComponent(currentUser.username)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      currentUser = { ...currentUser, ...data.user };
      localStorage.setItem("nodowa_user", JSON.stringify(currentUser));
      updateUserWidget();

      document.getElementById("user-wallet-balance").innerText = `${(currentUser.wallet || 0).toLocaleString()} NC`;
      document.getElementById("user-bank-balance").innerText = `${(currentUser.bank || 0).toLocaleString()} NC`;
    }

    // Cargar historial de transacciones
    const txRes = await fetch(`/api/wallet/transactions?username=${encodeURIComponent(currentUser.username)}`);
    const txData = await txRes.json();
    if (txData.ok) {
      renderTransactionsTable(txData.transactions);
    }
  } catch (e) {}
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById("user-transactions-table");
  if (!tbody) return;

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 2.5rem;">No tienes transacciones registradas todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(t => {
    const isIncoming = t.to && t.to.toLowerCase() === currentUser.username.toLowerCase();
    return `
      <tr>
        <td class="text-muted mono" style="font-size: 0.825rem;">${new Date(t.createdAt).toLocaleDateString()} ${new Date(t.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td><span class="status-badge ${isIncoming ? 'status-approved' : 'status-pending'}">${t.type}</span></td>
        <td><strong>${t.from}</strong> <span class="text-muted">→</span> <strong>${t.to}</strong></td>
        <td>${t.description}</td>
        <td class="mono ${isIncoming ? 'text-emerald' : 'text-rose'}" style="font-weight: 800;">
          ${isIncoming ? '+' : '-'}${t.amount.toLocaleString()} NC
        </td>
      </tr>
    `;
  }).join("");
}

// ── Directorio / Registro de Jugadores ──────────────────────────
function setupPlayersRegistryEvents() {
  const searchInput = document.getElementById("input-search-players");
  let searchTimeout = null;

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadPlayersRegistry(searchInput.value.trim());
    }, 250);
  });

  document.getElementById("btn-refresh-players")?.addEventListener("click", () => {
    loadPlayersRegistry(searchInput?.value.trim());
  });
}

async function loadPlayersRegistry(search = "") {
  const tbody = document.getElementById("players-registry-table-body");
  if (!tbody) return;

  try {
    const res = await fetch(`/api/players/registry?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (data.ok) {
      if (!data.players || data.players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align: center; padding: 2.5rem;">No se encontraron jugadores registrados.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.players.map(p => `
        <tr onclick="openUserProfileModal('${p.username}')" style="cursor: pointer;" title="Toca para ver el perfil de ${p.username}">
          <td>
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <img src="${p.avatar}" alt="${p.username}" style="width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--purple-300); object-fit: cover; background: var(--purple-50);">
              <div>
                <strong>${p.username}</strong>
                ${p.bio ? `<div class="text-muted" style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${p.bio}</div>` : ''}
              </div>
            </div>
          </td>
          <td>
            <span class="status-badge ${p.linked ? 'status-approved' : 'status-pending'}">
              ${p.linked ? 'Vinculado' : 'Sin Vincular'}
            </span>
          </td>
          <td class="mono text-purple" style="font-weight: 700;">${p.wallet.toLocaleString()} NC</td>
          <td class="mono text-emerald" style="font-weight: 700;">${p.bank.toLocaleString()} NC</td>
          <td class="mono" style="font-weight: 900; color: var(--accent-purple);">${p.total.toLocaleString()} NC</td>
          <td class="text-muted mono" style="font-size: 0.8rem;">${p.lastActive ? new Date(p.lastActive).toLocaleDateString() : '—'}</td>
        </tr>
      `).join("");
    }
  } catch (e) {}
}

// ── Buzón de Entregas ───────────────────────────────────────────
async function loadDeliveries() {
  const tbody = document.getElementById("deliveries-table-body");
  if (!tbody) return;

  if (!currentUser) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 2.5rem;">Inicia sesión para ver tus compras y entregas pendientes.</td></tr>`;
    return;
  }

  try {
    const res = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser.username)}`);
    const data = await res.json();
    if (data.ok) {
      if (!data.deliveries || data.deliveries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 2.5rem;">Tu buzón está vacío. ¡Compra artículos en la tienda para recibirlos en el juego!</td></tr>`;
        return;
      }
      tbody.innerHTML = data.deliveries.map(d => `
        <tr>
          <td class="text-muted mono" style="font-size: 0.825rem;">${new Date(d.createdAt).toLocaleDateString()}</td>
          <td><strong>${d.itemTitle}</strong></td>
          <td class="mono text-muted" style="font-size: 0.8rem;">${d.command || (d.giveCoins ? `+${d.giveCoins.toLocaleString()} Nodocoins` : 'Entrega manual')}</td>
          <td>
            <span class="status-badge ${d.status === 'DELIVERED' ? 'status-approved' : 'status-pending'}">
              ${d.status === 'DELIVERED' ? 'Entregado en Minecraft' : 'Pendiente de Reclamo'}
            </span>
          </td>
        </tr>
      `).join("");
    }
  } catch (e) {}
}

// ── Leaderboard (Top Ricos) ─────────────────────────────────────
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-table-body");
  if (!tbody) return;

  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    if (data.ok && data.leaderboard) {
      let totalCirculating = 0;
      tbody.innerHTML = data.leaderboard.map((player, idx) => {
        totalCirculating += player.total;
        return `
          <tr>
            <td class="mono" style="font-weight: 900; color: ${idx === 0 ? 'var(--accent-gold-dark)' : idx === 1 ? 'var(--accent-purple)' : 'var(--text-muted)'}; font-size: 1.1rem;">
              #${idx + 1}
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <div class="user-avatar" style="width: 30px; height: 30px; font-size: 0.8rem;">${player.username.slice(0, 2).toUpperCase()}</div>
                <strong>${player.username}</strong>
              </div>
            </td>
            <td class="mono text-purple" style="font-weight: 700;">${player.wallet.toLocaleString()} NC</td>
            <td class="mono text-emerald" style="font-weight: 700;">${player.bank.toLocaleString()} NC</td>
            <td class="mono" style="font-weight: 900; color: var(--accent-purple);">${player.total.toLocaleString()} NC</td>
          </tr>
        `;
      }).join("");

      const heroCoins = document.getElementById("hero-coins-circulating");
      if (heroCoins) heroCoins.innerText = `${totalCirculating.toLocaleString()} NC`;
    }
  } catch (e) {}
}

// ── Perfiles de Jugadores & Edición ────────────────────────────
let currentProfileTarget = null;

async function openUserProfileModal(username) {
  try {
    const res = await fetch(`/api/user/profile/${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!data.ok || !data.user) {
      showToast("No se pudo cargar el perfil del jugador", "error");
      return;
    }

    const u = data.user;
    currentProfileTarget = u;

    document.getElementById("profile-modal-gamertag").innerText = u.username;
    document.getElementById("profile-modal-avatar").src = u.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(u.username)}/100`;
    document.getElementById("profile-modal-bio").innerText = u.bio ? `"${u.bio}"` : "Sin biografía escrita.";
    document.getElementById("profile-modal-linked").innerText = u.linked ? "Vinculado a Minecraft" : "Sin Vincular";
    document.getElementById("profile-modal-wallet").innerText = `${u.wallet.toLocaleString()} NC`;
    document.getElementById("profile-modal-bank").innerText = `${u.bank.toLocaleString()} NC`;
    document.getElementById("profile-modal-total").innerText = `${u.total.toLocaleString()} NC`;
    document.getElementById("profile-modal-created").innerText = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--";
    document.getElementById("profile-modal-last-active").innerText = u.lastActive ? new Date(u.lastActive).toLocaleDateString() : "--";

    const contactContainer = document.getElementById("profile-modal-contact-btns");
    if (contactContainer) {
      const cleanWa = u.whatsapp ? u.whatsapp.replace(/[^0-9]/g, '') : null;
      contactContainer.innerHTML = `
        ${cleanWa ? `
          <a href="https://wa.me/${cleanWa}?text=${encodeURIComponent('Hola ' + u.username + ', te vi en la web de Nodowa Network.')}" target="_blank" class="btn-whatsapp" style="flex: 1; justify-content: center;">
            📱 WhatsApp
          </a>
        ` : ''}
        ${u.discord ? `
          <button type="button" class="btn-discord" style="flex: 1; justify-content: center;" onclick="copyText('${u.discord}'); showToast('Discord: ${u.discord}', 'info');">
            🎮 Discord: ${u.discord}
          </button>
        ` : ''}
      `;
    }

    document.getElementById("modal-user-profile").classList.add("active");
    renderIcons(document.getElementById("modal-user-profile"));
  } catch (_) {
    showToast("Error al cargar perfil", "error");
  }
}

function closeProfileModal() {
  document.getElementById("modal-user-profile").classList.remove("active");
}

function openTransferFromProfile() {
  if (!currentProfileTarget) return;
  closeProfileModal();
  openTransferWithTarget(currentProfileTarget.username, "");
}

function openReportFromProfile() {
  if (!currentProfileTarget) return;
  closeProfileModal();
  openReportModal(currentProfileTarget.username);
}

function openEditProfileModal() {
  if (!currentUser) return;
  document.getElementById("edit-profile-avatar-preview").src = currentUser.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(currentUser.username)}/100`;
  document.getElementById("edit-profile-bio").value = currentUser.bio || "";
  document.getElementById("edit-profile-whatsapp").value = currentUser.whatsapp || "";
  document.getElementById("edit-profile-discord").value = currentUser.discord || "";
  document.getElementById("modal-edit-profile").classList.add("active");
}

function closeEditProfileModal() {
  document.getElementById("modal-edit-profile").classList.remove("active");
}

function setupEditProfileEvents() {
  document.getElementById("edit-profile-avatar-file")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        document.getElementById("edit-profile-avatar-preview").src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById("form-edit-profile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const bio = document.getElementById("edit-profile-bio").value.trim();
    const whatsapp = document.getElementById("edit-profile-whatsapp").value.trim();
    const discord = document.getElementById("edit-profile-discord").value.trim();
    const avatarFile = document.getElementById("edit-profile-avatar-file")?.files[0];

    const formData = new FormData();
    formData.append("username", currentUser.username);
    formData.append("bio", bio);
    formData.append("whatsapp", whatsapp);
    formData.append("discord", discord);
    if (avatarFile) formData.append("avatar", avatarFile);

    try {
      const res = await fetch("/api/user/update-profile", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.user) {
        currentUser.avatar = data.user.avatar;
        currentUser.bio = data.user.bio;
        currentUser.whatsapp = data.user.whatsapp;
        currentUser.discord = data.user.discord;
        updateUserWidget();
        showToast("¡Perfil actualizado con éxito!", "success");
        closeEditProfileModal();
        if (currentTab === "players") loadPlayersRegistry();
      } else {
        showToast(data.error || "No se pudo actualizar el perfil", "error");
      }
    } catch (_) {
      showToast("Error de conexión", "error");
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copiado al portapapeles", "info");
  }).catch(() => {
    showToast("No se pudo copiar", "error");
  });
}

function showToast(message, type = "info") {
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
