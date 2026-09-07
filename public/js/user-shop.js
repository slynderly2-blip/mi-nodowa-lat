// user-shop.js — Panel y Tienda Personal de Jugador (/:username)
import { currentUser } from './state.js';
import { showToast, escapeHtml } from './utils.js';

let activeShopUser = null;
let currentProfile = null;
let p2pItems = [];
let ncOffers = [];
let currentSubTab = 'items'; // 'items' | 'nc'

// Cargar la tienda de un jugador por su nombre de usuario
export async function loadUserShop(username) {
  if (!username) return;
  activeShopUser = username.trim();

  const container = document.getElementById('user-shop-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
        <div>Cargando la tienda de <strong>${escapeHtml(activeShopUser)}</strong>...</div>
      </div>
    `;
  }

  try {
    const [profileRes, marketRes, ncRes] = await Promise.all([
      fetch(`/api/players/profile/${encodeURIComponent(activeShopUser)}`),
      fetch(`/api/market?username=${encodeURIComponent(activeShopUser)}&filter=mine`),
      fetch(`/api/nc/listings?seller=${encodeURIComponent(activeShopUser)}`)
    ]);

    const profileData = await profileRes.json();
    const marketData = await marketRes.json();
    const ncData = await ncRes.json();

    if (!profileData.ok) {
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align: center; padding: 3rem 1rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">👤❌</div>
            <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem;">Usuario No Encontrado</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
              El jugador <strong>${escapeHtml(activeShopUser)}</strong> no existe o aún no ha ingresado a Nodowa Network.
            </p>
            <button class="btn btn-primary" onclick="window.navigateTo('/')">Explorar Catálogo</button>
          </div>
        `;
      }
      return;
    }

    currentProfile = profileData.user;
    p2pItems = marketData.ok ? marketData.market || [] : [];
    ncOffers = ncData.ok ? ncData.listings || [] : [];

    renderUserShop();
  } catch (err) {
    console.error('[UserShop] Error al cargar:', err);
    if (container) {
      container.innerHTML = `<div class="card" style="padding: 2rem; color: var(--red);">Error al conectar con la tienda.</div>`;
    }
  }
}

// Renderizar la tienda completa
export function renderUserShop() {
  const container = document.getElementById('user-shop-container');
  if (!container || !currentProfile) return;

  const isOwner = currentUser && currentUser.toLowerCase() === currentProfile.username.toLowerCase();
  const avatarUrl = currentProfile.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(currentProfile.username)}/128`;
  const stats = currentProfile.stats || {};
  const fortune = Number(currentProfile.totalFortune || 0).toLocaleString();

  container.innerHTML = `
    <!-- Header del Perfil y Tienda del Jugador -->
    <div class="user-shop-header">
      <div class="user-shop-profile">
        <img src="${avatarUrl}" alt="${escapeHtml(currentProfile.displayName || currentProfile.username)}" class="user-shop-avatar">
        <div class="user-shop-meta">
          <h2>
            ${escapeHtml(currentProfile.displayName || currentProfile.username)}
            <span class="badge badge-primary">${escapeHtml(currentProfile.equippedRank || 'NOVICIO')}</span>
            ${currentProfile.linked ? `<span class="badge badge-emerald">✓ Bedrock</span>` : ''}
          </h2>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--amber); margin-top: 2px;">
            Título: ${escapeHtml(currentProfile.selectedTitle || 'Aventurero')}
          </div>
          <div class="user-shop-bio">
            ${currentProfile.bio ? escapeHtml(currentProfile.bio) : '<em>Sin biografía personalizada aún.</em>'}
          </div>
        </div>
      </div>

      <!-- Estadísticas Rápidas -->
      <div class="user-shop-stats">
        <div class="stat-pill">
          <span class="stat-pill-label">Fortuna Total</span>
          <span class="stat-pill-value" style="color: var(--amber);">${fortune} NC</span>
        </div>
        <div class="stat-pill">
          <span class="stat-pill-label">Kills PvP</span>
          <span class="stat-pill-value">${stats.killsPvp || 0}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-pill-label">Diamantes</span>
          <span class="stat-pill-value">${stats.minedDiamond || 0}</span>
        </div>
      </div>

      <!-- Acciones de Interacción o Gestión -->
      <div class="user-shop-actions">
        ${isOwner ? `
          <button class="btn btn-outline btn-sm" onclick="window.openModal('modal-profile')">
            ⚙️ Editar Perfil
          </button>
          <button class="btn btn-amber btn-sm" onclick="window.navigateTo('/coins')">
            💸 Vender NC
          </button>
          <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-sell-p2p')">
            + Publicar Ítem
          </button>
        ` : `
          <button class="btn btn-amber btn-sm" onclick="window.quickTransferTo('${escapeHtml(currentProfile.username)}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
            Transferir NC
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.openChatWith('${escapeHtml(currentProfile.username)}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Chatear
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.sendFriendRequest('${escapeHtml(currentProfile.username)}')">
            + Amigo
          </button>
        `}
      </div>
    </div>

    <!-- Navegación de Pestañas de la Tienda -->
    <div class="user-shop-tabs">
      <button class="user-shop-tab-btn ${currentSubTab === 'items' ? 'active' : ''}" onclick="window.switchShopSubTab('items')">
        📦 Artículos en Venta (${p2pItems.length})
      </button>
      <button class="user-shop-tab-btn ${currentSubTab === 'nc' ? 'active' : ''}" onclick="window.switchShopSubTab('nc')">
        🪙 Ofertas de Monedas (${ncOffers.length})
      </button>
    </div>

    <!-- Contenido de la Sub-Pestaña Activa -->
    <div id="shop-subtab-content" style="margin-top: 1rem;">
      ${currentSubTab === 'items' ? renderItemsTabHtml() : renderNcOffersTabHtml()}
    </div>
  `;
}

export function switchShopSubTab(tab) {
  currentSubTab = tab;
  renderUserShop();
}

function renderItemsTabHtml() {
  if (p2pItems.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🏷️</div>
        <div style="font-weight: 700; font-size: 1.05rem;">Este jugador no tiene artículos en venta actualmente</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">Vuelve más tarde o contáctalo directamente por el chat.</div>
      </div>
    `;
  }

  return `
    <div class="products-grid">
      ${p2pItems.map(item => `
        <div class="card product-card">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
              <span class="badge badge-neutral">${escapeHtml(item.itemType || 'Item')}</span>
              <span class="badge badge-amber">x${item.quantity || 1}</span>
            </div>
            <h4 class="product-name">${escapeHtml(item.title)}</h4>
            <p class="product-desc">${item.description ? escapeHtml(item.description) : 'Sin descripción adicional.'}</p>
          </div>

          <div class="product-footer">
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Precio:</span>
              <span class="product-price">${Number(item.price).toLocaleString()} NC</span>
            </div>
            ${currentUser && currentUser.toLowerCase() === item.seller.toLowerCase() ? `
              <button class="btn btn-outline btn-sm" onclick="window.deleteP2PListing('${item.id}')">
                Eliminar
              </button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="window.buyP2PListing('${item.id}')">
                Comprar
              </button>
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNcOffersTabHtml() {
  if (ncOffers.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🪙</div>
        <div style="font-weight: 700; font-size: 1.05rem;">No hay ofertas de NC activas de este jugador</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">Revisa el mercado general en el Centro de Monedas.</div>
      </div>
    `;
  }

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
      ${ncOffers.map(o => `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--amber);">
              ${Number(o.amount).toLocaleString()} NC
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">
              ${o.priceUsd ? `$${Number(o.priceUsd).toFixed(2)} USD` : 'Intercambio directo'}
            </div>
          </div>
          ${currentUser && currentUser.toLowerCase() === o.seller.toLowerCase() ? `
            <span class="badge badge-neutral">Tu Oferta</span>
          ` : `
            <button class="btn btn-amber btn-sm" onclick="window.buyNcListing('${o.id}')">
              Comprar NC
            </button>
          `}
        </div>
      `).join('')}
    </div>
  `;
}
