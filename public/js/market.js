// market.js — Marketplace P2P entre jugadores (Contacto Directo & WhatsApp)
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

let currentMarketFilter = "all";
let marketSearchTerm = "";

export function initMarket() {
  // Búsqueda con debounce
  const searchInput = document.getElementById("market-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        marketSearchTerm = e.target.value.trim();
        loadMarket();
      }, 250);
    });
  }

  // Botón abrir modal de publicación
  const btnCreate = document.getElementById("btn-create-p2p");
  if (btnCreate) {
    btnCreate.onclick = () => {
      if (!state.currentUser) return openModal("modal-login");
      openModal("modal-sell-p2p");
    };
  }

  // Pre-llenar WhatsApp si el usuario ya lo tiene guardado
  if (state.userData?.socialLinks?.whatsapp) {
    const waEl = document.getElementById("p2p-wa-number");
    if (waEl && !waEl.value) {
      waEl.value = state.userData.socialLinks.whatsapp.replace(/^\+\d{1,4}/, '');
    }
  }

  // Formulario publicar
  const p2pForm = document.getElementById("form-sell-p2p") || document.getElementById("p2p-form");
  if (p2pForm) {
    p2pForm.addEventListener("submit", (e) => {
      e.preventDefault();
      listMyItemP2P();
    });
  }

  // Exponer globales
  window.setMarketFilter      = setMarketFilter;
  window.clearMarketSearch    = clearMarketSearch;
  window.deleteMarketListing  = deleteMarketListing;
  window.listMyItemP2P        = listMyItemP2P;
  window.deleteP2PListing     = deleteMarketListing;
}

export function setMarketFilter(filter) {
  currentMarketFilter = filter;
  const btnAll  = document.getElementById("btn-market-filter-all");
  const btnMine = document.getElementById("btn-market-filter-mine");
  if (btnAll)  btnAll.classList.toggle("active",  filter === "all");
  if (btnMine) btnMine.classList.toggle("active", filter === "mine");
  loadMarket();
}

export function clearMarketSearch() {
  const el = document.getElementById("market-search");
  if (el) el.value = "";
  marketSearchTerm = "";
  loadMarket();
}

export async function listMyItemP2P() {
  if (!state.currentUser) return openModal("modal-login");

  const title           = (document.getElementById("p2p-title")?.value || "").trim();
  const itemType        = (document.getElementById("p2p-type")?.value || document.getElementById("p2p-item-type")?.value || "Varios").trim();
  const quantity        = parseInt(document.getElementById("p2p-qty")?.value || document.getElementById("p2p-quantity")?.value || "1");
  const price           = parseInt(document.getElementById("p2p-price")?.value || "0");
  const description     = (document.getElementById("p2p-desc")?.value || "").trim();
  const whatsappCountry = (document.getElementById("p2p-wa-country")?.value || "+591").trim();
  const whatsappNumber  = (document.getElementById("p2p-wa-number")?.value || "").trim().replace(/\D/g, "");

  if (!title) return showToast("Ingresa el título del producto");

  const submitBtn = document.querySelector("#form-sell-p2p button[type=submit]");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch("/api/market/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seller: state.currentUser,
        title,
        itemType,
        quantity: isNaN(quantity) || quantity < 1 ? 1 : quantity,
        price: isNaN(price) || price <= 0 ? 0 : price,
        description,
        whatsappCountry,
        whatsappNumber
      })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-sell-p2p");
      const form = document.getElementById("form-sell-p2p") || document.getElementById("p2p-form");
      if (form) form.reset();
      showToast("¡Artículo publicado con éxito en el Marketplace!");
      loadMarket();
    } else {
      showToast(data.error || "Error al publicar artículo");
    }
  } catch (err) {
    showToast("Error de conexión con el servidor");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function loadMarket() {
  const grid = document.getElementById("market-grid");
  if (!grid) return;

  try {
    const params = new URLSearchParams();
    if (marketSearchTerm) params.append("search", marketSearchTerm);
    if (currentMarketFilter === "mine" && state.currentUser) {
      params.append("filter", "mine");
      params.append("username", state.currentUser);
    }

    const res = await fetch(`/api/market?${params.toString()}`);
    const data = await res.json();
    if (data.ok) renderMarket(data.market || data.offers || []);
  } catch (err) {
    console.error("Error cargando marketplace:", err);
  }
}

function renderMarket(offers) {
  const grid = document.getElementById("market-grid");
  if (!grid) return;

  if (!offers || offers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;">
        <div class="empty-icon" style="font-size: 2.2rem; margin-bottom: 0.5rem;">🛍️</div>
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem;">No hay publicaciones en el Marketplace</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 420px; margin: 0 auto 1.25rem;">
          ${marketSearchTerm ? `No hay resultados para "${escapeHtml(marketSearchTerm)}".` : 'Sé el primero en publicar un ítem para conectar con otros jugadores de Minecraft Bedrock.'}
        </p>
        <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-sell-p2p')">
          + Publicar mi Primer Artículo
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = offers.map(o => {
    const isMine = state.currentUser && o.seller.toLowerCase() === state.currentUser.toLowerCase();
    const priceVal = o.price;
    const priceFormatted = (typeof priceVal === 'number' && priceVal > 0)
      ? `${priceVal.toLocaleString()} <span style="font-size:0.85rem; color:var(--text-muted);">NC</span>`
      : `<span style="font-size:1.05rem; color:var(--emerald);">Precio a convenir</span>`;

    const sellerAvatar = o.sellerAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(o.seller)}/36`;
    const qtyText = o.quantity && o.quantity > 1 ? `x${o.quantity}` : 'x1';
    const category = escapeHtml(o.itemType || 'Varios');

    // Preparar enlace de WhatsApp si el vendedor lo proporcionó
    let waButtonHtml = "";
    if (o.whatsappNumber) {
      const country = (o.whatsappCountry || "+591").replace(/\+/g, '');
      const fullPhone = `${country}${o.whatsappNumber}`;
      const msg = encodeURIComponent(`¡Hola ${o.seller}! Vi tu publicación de "${o.title}" en el Marketplace de Nodowa Network y me interesa coordinar el intercambio en Minecraft Bedrock.`);
      const waUrl = `https://wa.me/${fullPhone}?text=${msg}`;

      waButtonHtml = `
        <a href="${waUrl}" target="_blank" class="btn btn-whatsapp" title="Contactar por WhatsApp">
          <svg viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.076-1.782-.379-1.393-.552-2.316-1.954-2.385-2.046-.068-.093-.564-.75-.564-1.429 0-.679.355-1.013.481-1.152.127-.138.277-.173.369-.173.093 0 .185.001.266.005.085.004.199-.033.31.234.116.279.398.971.433 1.042.035.071.058.154.012.247-.047.092-.07.15-.14.232-.07.081-.146.182-.209.245-.07.07-.143.146-.062.285.081.139.362.597.777.966.534.476.985.624 1.124.693.139.07.221.058.302-.035.082-.093.349-.406.442-.545.093-.139.186-.116.313-.07.127.047.808.381.947.45.139.07.232.104.267.162.035.058.035.337-.109.742z"/></svg>
          <span>WhatsApp</span>
        </a>
      `;
    }

    return `
      <div class="marketplace-card">
        <div class="marketplace-card-top">
          <div>
            <h3 class="marketplace-item-title">${escapeHtml(o.title)}</h3>
            <span class="marketplace-category-badge">${category}</span>
          </div>
          <span class="marketplace-qty">${qtyText}</span>
        </div>

        <div class="marketplace-seller-row" onclick="window.navigateTo('/${encodeURIComponent(o.seller)}')" style="cursor:pointer;" title="Ver perfil de ${escapeHtml(o.seller)}">
          <img src="${sellerAvatar}" alt="${escapeHtml(o.seller)}" class="marketplace-seller-avatar">
          <div style="min-width:0; flex:1;">
            <div class="marketplace-seller-name">
              ${escapeHtml(o.seller)}
              ${o.sellerLinked ? '<span style="width:7px; height:7px; border-radius:50%; background:var(--emerald); display:inline-block;" title="Vinculado Bedrock"></span>' : ''}
            </div>
            <div style="font-size:0.72rem; color:var(--text-subtle);">Vendedor de Bedrock</div>
          </div>
        </div>

        <div class="marketplace-price-box">
          <span style="font-size:0.8rem; font-weight:700; color:var(--text-muted);">Precio sugerido:</span>
          <div class="marketplace-price">${priceFormatted}</div>
        </div>

        ${o.description ? `<p class="marketplace-desc">${escapeHtml(o.description)}</p>` : '<p class="marketplace-desc" style="color:var(--text-subtle); font-style:italic;">Sin descripción adicional.</p>'}

        <div class="marketplace-actions">
          ${isMine ? `
            <button type="button" class="btn btn-danger-soft btn-block" onclick="window.deleteMarketListing('${o.id}')">
              🗑️ Retirar Publicación
            </button>
          ` : `
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              ${waButtonHtml}
              <button type="button" class="btn btn-primary" style="flex:1; display:flex; align-items:center; justify-content:center; gap:5px;" onclick="window.openChatWith('${escapeHtml(o.seller)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Chat Web</span>
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }).join("");
}

export async function deleteMarketListing(listingId) {
  if (!state.currentUser) return openModal("modal-login");
  if (!confirm("¿Deseas retirar esta publicación del Marketplace?")) return;

  try {
    const res = await fetch("/api/market/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: state.currentUser, listingId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || "Publicación retirada con éxito");
      loadMarket();
    } else {
      showToast(data.error || "No se pudo retirar");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
}

// Compatibilidad
export const buyP2PListing = (id) => showToast("Usa WhatsApp o el Chat Web para coordinar con el vendedor.");
export const deleteP2PListing = deleteMarketListing;
