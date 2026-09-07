// store.js — Catálogo Oficial de Productos (Rangos, Llaves, Kits, Addons)
import { currentUser, userData, storeItems, setStoreItems } from './state.js';
import { showToast, openModal, closeModal, getItemSvg } from './utils.js';

let currentStoreCategory = "all";
let currentStoreSort     = "default";

// Copiar IP del servidor
export function copyServerIp() {
  const ip = "mi.nodowa.lat:19132";
  navigator.clipboard.writeText(ip)
    .then(() => showToast(`¡IP Copiada! ${ip} (Minecraft Bedrock)`))
    .catch(() => showToast(`IP Servidor: ${ip}`));
}

// Cargar catálogo de productos (excluyendo monedas)
export async function loadStore() {
  try {
    const res = await fetch("/api/store");
    const data = await res.json();
    if (data.ok) {
      // Filtrar monedas: Las monedas viven exclusivamente en su propio centro
      const products = (data.items || []).filter(item => 
        item.category !== 'coins' && (!item.giveCoins || item.giveCoins === 0)
      );
      setStoreItems(products);
      renderCategoryFilters();
      renderStore();
    }
  } catch (err) {
    console.error("[Store] Error cargando productos:", err);
  }
}

// Filtros de categoría de productos
function renderCategoryFilters() {
  const container = document.getElementById("store-category-filters");
  if (!container) return;

  const categoryCounts = { all: storeItems.length };
  storeItems.forEach(item => {
    const cat = item.category || "other";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categoryMeta = {
    all:    { label: "Todos",     icon: "🔥" },
    ranks:  { label: "Rangos",    icon: "👑" },
    crates: { label: "Llaves",    icon: "🗝️" },
    kits:   { label: "Kits PvP",  icon: "⚔️" },
    other:  { label: "Objetos",   icon: "📦" }
  };

  const categories = Object.keys(categoryCounts);
  if (!categories.includes(currentStoreCategory)) currentStoreCategory = "all";

  container.innerHTML = categories.map(cat => {
    const meta = categoryMeta[cat] || { label: cat.charAt(0).toUpperCase() + cat.slice(1), icon: "📦" };
    const count = categoryCounts[cat] || 0;
    const isActive = currentStoreCategory === cat;
    return `
      <button type="button" class="filter-pill ${isActive ? 'active' : ''}" onclick="window.setStoreCategory('${cat}')">
        <span>${meta.icon}</span>
        <span>${meta.label}</span>
        <span class="badge badge-neutral" style="font-size:0.7rem; padding:1px 5px;">${count}</span>
      </button>
    `;
  }).join("");
}

export function setStoreCategory(cat) {
  currentStoreCategory = cat;
  renderCategoryFilters();
  renderStore();
}

export function setStoreSort(sort) {
  currentStoreSort = sort || "default";
  renderStore();
}

// Renderizado del catálogo de productos
export function renderStore() {
  const grid = document.getElementById("store-grid");
  const searchInput = document.getElementById("store-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  let itemsToDisplay = [...storeItems];

  if (currentStoreCategory !== "all") {
    itemsToDisplay = itemsToDisplay.filter(i => (i.category || "other") === currentStoreCategory);
  }

  if (query) {
    itemsToDisplay = itemsToDisplay.filter(i =>
      (i.name || "").toLowerCase().includes(query) ||
      (i.description || "").toLowerCase().includes(query) ||
      (i.category || "").toLowerCase().includes(query)
    );
  }

  // Ordenamiento
  if (currentStoreSort === "price-asc") {
    itemsToDisplay.sort((a, b) => (a.priceCoins || 0) - (b.priceCoins || 0));
  } else if (currentStoreSort === "price-desc") {
    itemsToDisplay.sort((a, b) => (b.priceCoins || 0) - (a.priceCoins || 0));
  } else if (currentStoreSort === "name-asc") {
    itemsToDisplay.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  if (!grid) return;

  if (itemsToDisplay.length === 0) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
        <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--text);">No se encontraron productos</h4>
        <p style="font-size: 0.85rem; margin-top: 0.3rem;">Intenta con otro término o restablece los filtros.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = itemsToDisplay.map(item => {
    const iconSvg = getItemSvg(item.category, item.iconType);
    return `
      <div class="card product-card">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
            <div class="product-icon-wrap">${iconSvg}</div>
            ${item.badge ? `<span class="badge badge-primary">${item.badge}</span>` : ''}
          </div>
          <h3 class="product-name">${item.name}</h3>
          <p class="product-desc">${item.description || "Artículo oficial para tu aventura en Nodowa Network."}</p>
        </div>

        <div class="product-footer">
          <div>
            <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Precio:</span>
            <span class="product-price">${Number(item.priceCoins || 0).toLocaleString()} NC</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.startCheckout('${item.id}')">
            Comprar
          </button>
        </div>
      </div>
    `;
  }).join("");
}

export function clearSearch() {
  const searchInput = document.getElementById("store-search");
  if (searchInput) { searchInput.value = ""; renderStore(); }
}

export function setSearchTag(tag) {
  const searchInput = document.getElementById("store-search");
  if (searchInput) { searchInput.value = tag; renderStore(); }
}

// Iniciar Checkout
export function startCheckout(itemId) {
  if (!currentUser) {
    showToast("Inicia sesión para comprar artículos");
    return openModal("modal-auth");
  }

  const item = storeItems.find(i => i.id === itemId);
  if (!item) return;

  const titleEl = document.getElementById("checkout-item-title");
  const descEl = document.getElementById("checkout-item-desc");
  const btnCoins = document.getElementById("btn-pay-coins");

  if (titleEl) titleEl.textContent = item.name;
  if (descEl) descEl.textContent = item.description || "";

  if (btnCoins) {
    btnCoins.textContent = `Confirmar Compra por ${Number(item.priceCoins || 0).toLocaleString()} NC`;
    btnCoins.onclick = () => buyWithCoins(item.id);
  }

  openModal("modal-checkout");
}

async function buyWithCoins(itemId) {
  if (!currentUser) return;
  const item = storeItems.find(i => i.id === itemId);
  try {
    const res = await fetch("/api/store/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, itemId })
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || "No se pudo completar la compra");
      return;
    }

    closeModal("modal-checkout");

    // Actualizar saldo
    if (data.user) {
      userData.wallet = data.user.wallet || 0;
      const el = document.getElementById('user-pill-balance');
      if (el) el.textContent = `${Number(userData.wallet).toLocaleString()} NC`;
    }

    // Mostrar recibo de compra de ítem
    const now = new Date().toLocaleString('es', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const srItem    = document.getElementById('sr-item');
    const srPrice   = document.getElementById('sr-price');
    const srPlayer  = document.getElementById('sr-player');
    const srStatus  = document.getElementById('sr-status');
    const srBalance = document.getElementById('sr-balance');
    const srDate    = document.getElementById('sr-date');
    if (srItem)    srItem.textContent    = item ? item.name : itemId;
    if (srPrice)   srPrice.textContent   = `${Number(item?.priceCoins || 0).toLocaleString()} NC`;
    if (srPlayer)  srPlayer.textContent  = currentUser;
    if (srStatus)  srStatus.textContent  = data.delivery ? 'Pendiente de recibir' : 'Completado';
    if (srBalance) srBalance.textContent = `${Number(data.user?.wallet || 0).toLocaleString()} NC`;
    if (srDate)    srDate.textContent    = now;
    openModal('modal-store-receipt');

  } catch (err) {
    console.error("[Store] Error en compra:", err);
    showToast("Error de conexión al procesar la compra");
  }
}

export function showPurchaseReceipt(receipt) {
  if (!receipt) return;
  const folio = receipt.folio || receipt.id || "NDW-TX-001";
  const player = receipt.player || receipt.username || currentUser || "Jugador";
  const item = receipt.itemName || receipt.itemTitle || "Artículo";
  const price = receipt.priceFormatted || "Gratis";
  const status = receipt.status || "Entregado";
  const date = receipt.date || new Date().toLocaleString();

  const srItem    = document.getElementById('sr-item');
  const srPrice   = document.getElementById('sr-price');
  const srPlayer  = document.getElementById('sr-player');
  const srStatus  = document.getElementById('sr-status');
  const srBalance = document.getElementById('sr-balance');
  const srBalanceRow = document.getElementById('sr-balance-row');
  const srDate    = document.getElementById('sr-date');
  if (srItem)    srItem.textContent    = item;
  if (srPrice)   srPrice.textContent   = price;
  if (srPlayer)  srPlayer.textContent  = player;
  if (srStatus)  srStatus.textContent  = status;
  if (srBalance) srBalance.textContent = receipt.balanceFormatted || "—";
  if (srBalanceRow) srBalanceRow.style.display = receipt.balanceFormatted ? "" : "none";
  if (srDate)    srDate.textContent    = date;

  showToast(`🧾 Recibo #${folio} de ${item} (${status})`);
  openModal('modal-store-receipt');
}
window.showPurchaseReceipt = showPurchaseReceipt;

