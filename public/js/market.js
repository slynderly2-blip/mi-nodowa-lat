// market.js — Mercado P2P entre jugadores
import { state } from './state.js';
import { showToast, openModal, closeModal } from './utils.js';

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

  // Botón publicar
  const btnCreate = document.getElementById("btn-create-p2p");
  if (btnCreate) {
    btnCreate.onclick = () => {
      if (!state.currentUser) return openModal("modal-login");
      openModal("modal-p2p");
    };
  }

  // Formulario publicar
  const p2pForm = document.getElementById("p2p-form");
  if (p2pForm) {
    p2pForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.currentUser) return;

      const title       = document.getElementById("p2p-title").value.trim();
      const itemType    = (document.getElementById("p2p-item-type")?.value || "stone").trim();
      const quantity    = parseInt(document.getElementById("p2p-quantity")?.value || "1");
      const price       = parseInt(document.getElementById("p2p-price").value);
      const description = document.getElementById("p2p-desc").value.trim();

      try {
        const res = await fetch("/api/market/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seller: state.currentUser, title, itemType, quantity, price, description })
        });
        const data = await res.json();
        if (data.ok) {
          closeModal("modal-p2p");
          p2pForm.reset();
          showToast("Oferta publicada exitosamente.");
          loadMarket();
        } else {
          showToast(data.error || "Error al publicar");
        }
      } catch (err) {
        showToast("Error de conexión");
      }
    });
  }

  // Exponer globales
  window.setMarketFilter      = setMarketFilter;
  window.clearMarketSearch    = clearMarketSearch;
  window.buyMarketOffer       = buyMarketOffer;
  window.deleteMarketListing  = deleteMarketListing;
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
    console.error("Error cargando mercado:", err);
  }
}

function renderMarket(offers) {
  const grid = document.getElementById("market-grid");
  if (!grid) return;

  if (!offers || offers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
        </div>
        <h3>No se encontraron ofertas</h3>
        <p>Sé el primero en publicar una oferta en el mercado o prueba con otra búsqueda.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = offers.map(o => {
    const isMine = state.currentUser && o.seller.toLowerCase() === state.currentUser.toLowerCase();
    const priceVal = o.price || o.priceCoins || 0;
    const sellerAvatar = `https://mc-heads.net/avatar/${encodeURIComponent(o.seller)}/32`;
    const itemLabel = o.itemType ? `${o.quantity > 1 ? `${o.quantity}x ` : ''}${o.itemType}` : '';

    return `
      <div class="card" style="padding:0;">
        <div style="padding:1rem 1rem 0.6rem 1rem;">
          <div style="font-size:1.45rem; font-weight:800; color:var(--tiktok-black); line-height:1.15; margin-bottom:0.3rem;">
            ${priceVal.toLocaleString()} <span style="font-size:0.9rem; font-weight:600; color:var(--text-muted);">NC</span>
          </div>
          <div style="font-size:0.95rem; font-weight:700; color:var(--text); margin-bottom:0.2rem;">${o.title}</div>
          ${itemLabel ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.25rem;">${itemLabel}</div>` : ''}
          ${o.description ? `<div style="font-size:0.82rem; color:var(--text-subtle); line-height:1.45; margin-top:0.4rem;">${o.description}</div>` : ''}
        </div>
        <div style="border-top:1px solid var(--border); padding:0.65rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.45rem; min-width:0;">
            <img src="${sellerAvatar}" alt="${o.seller}" style="width:24px; height:24px; border-radius:50%; flex-shrink:0;">
            <span style="font-size:0.82rem; font-weight:600; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${o.seller}</span>
          </div>
          ${isMine
            ? `<button class="btn btn-danger-soft btn-sm" onclick="deleteMarketListing('${o.id}')">Retirar</button>`
            : `<button class="btn btn-tiktok btn-sm" style="display:flex; align-items:center; gap:5px; flex-shrink:0;" onclick="openChatWith('${o.seller}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Chat</span>
              </button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

export async function buyMarketOffer(listingId) {
  if (!state.currentUser) return openModal("modal-login");
  if (!confirm("¿Deseas comprar esta oferta de mercado?")) return;

  try {
    const res = await fetch("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer: state.currentUser, listingId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || "Compra completada exitosamente.");
      const { loadBalance } = await import('./wallet.js');
      loadBalance();
      loadMarket();
    } else {
      showToast(data.error || "Error en la compra");
    }
  } catch (err) {
    showToast("Error de conexión");
  }
}

export async function listMyItemP2P() {
  if (!state.currentUser) {
    showToast("Inicia sesión para publicar en el mercado");
    return openModal("modal-login");
  }

  const title = (document.getElementById("p2p-title")?.value || "").trim();
  const itemType = (document.getElementById("p2p-type")?.value || document.getElementById("p2p-item-type")?.value || "item").trim();
  const quantity = parseInt(document.getElementById("p2p-qty")?.value || document.getElementById("p2p-quantity")?.value || "1");
  const price = parseInt(document.getElementById("p2p-price")?.value || "0");
  const description = (document.getElementById("p2p-desc")?.value || "").trim();

  if (!title || !price || price <= 0) {
    return showToast("Ingresa un título y precio válidos");
  }

  try {
    const res = await fetch("/api/market/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: state.currentUser, title, itemType, quantity, price, description })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-sell-p2p");
      closeModal("modal-p2p");
      showToast("Artículo publicado en el mercado.");
      loadMarket();
    } else {
      showToast(data.error || "No se pudo publicar");
    }
  } catch (err) {
    showToast("Error de conexión al publicar");
  }
}

export async function deleteP2PListing(listingId) {
  if (!state.currentUser) return;
  if (!confirm("¿Deseas retirar tu publicación del mercado?")) return;
  try {
    const res = await fetch("/api/market/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: state.currentUser, listingId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Publicación retirada.");
      loadMarket();
    } else {
      showToast(data.error || "Error al retirar publicación");
    }
  } catch (e) {
    showToast("Error de conexión");
  }
}

export const deleteMarketListing = deleteP2PListing;
export const buyP2PListing = buyMarketOffer;
export const buyMarketListing = buyMarketOffer;


