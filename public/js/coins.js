// coins.js — Centro de Monedas: Paquetes Oficiales del Servidor + Mercado P2P con Panel de Vendedor
import { state, currentUser, userData, setUserData } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

let officialCoinPacks = [];
let ncListings = [];
let myNcSales = [];
let mySellerOrders = [];
let mySellerConfig = { binanceId: '', whatsapp: '', countryCode: '+591', qrImage: '', instructions: '' };
let binanceConfig = null;
let activeCoinsTab = 'official'; // 'official' | 'p2p' | 'seller_panel'
let selectedOfficialPack = null;
let selectedP2pListing = null;

// Cargar estado inicial de monedas
export async function loadCoinsCenter(targetTab = null) {
  if (targetTab) activeCoinsTab = targetTab;

  await Promise.all([
    loadOfficialCoinPacks(),
    loadBinanceInfo(),
    loadNcListings(),
    loadMyNcStatus(),
    loadMyNcSales(),
    loadSellerOrders(),
    loadSellerConfig()
  ]);

  renderCoinsCenter();
}

// Cargar paquetes oficiales de monedas desde la tienda del servidor
export async function loadOfficialCoinPacks() {
  try {
    const res = await fetch('/api/store');
    const data = await res.json();
    if (data.ok) {
      officialCoinPacks = (data.items || []).filter(item =>
        item.category === 'coins' || (item.giveCoins && Number(item.giveCoins) > 0)
      );
    }
  } catch (err) {
    console.error('[Coins] Error al cargar paquetes oficiales:', err);
  }
}

// Cargar información de Binance Pay del servidor
export async function loadBinanceInfo() {
  try {
    const res = await fetch('/api/orders/binance-info');
    const data = await res.json();
    if (data.ok && data.binance) {
      binanceConfig = data.binance;
    }
  } catch (err) {
    console.error('[Coins] Error al cargar Binance:', err);
  }
}

// Cargar listados de NC disponibles en el mercado P2P
export async function loadNcListings() {
  try {
    const res = await fetch('/api/nc/listings');
    const data = await res.json();
    if (data.ok) {
      ncListings = data.listings || [];
    }
  } catch (err) {
    console.error('[Coins] Error al cargar listados NC:', err);
  }
}

// Cargar saldo propio
export async function loadMyNcStatus() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`/api/nc/my?username=${encodeURIComponent(state.currentUser)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      setUserData({
        ...state.userData,
        wallet: data.user.wallet || 0
      });
      if (data.user.sellerConfig) {
        mySellerConfig = { ...mySellerConfig, ...data.user.sellerConfig };
      }
      updateUserHeaderBalance();
    }
  } catch (err) {
    console.error('[Coins] Error al cargar estado NC:', err);
  }
}

// Cargar métodos de cobro del jugador
export async function loadSellerConfig() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`/api/nc/seller-config/${encodeURIComponent(state.currentUser)}`);
    const data = await res.json();
    if (data.ok && data.config) {
      mySellerConfig = { ...mySellerConfig, ...data.config };
    }
  } catch (err) {
    console.error('[Coins] Error al cargar config vendedor:', err);
  }
}

// Cargar órdenes recibidas para el panel de vendedor del jugador
export async function loadSellerOrders() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`/api/nc/orders/seller/${encodeURIComponent(state.currentUser)}`);
    const data = await res.json();
    if (data.ok) {
      mySellerOrders = data.orders || [];
    }
  } catch (err) {
    console.error('[Coins] Error al cargar órdenes de vendedor:', err);
  }
}

// Cargar ventas completadas
export async function loadMyNcSales() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`/api/nc/my-sales?username=${encodeURIComponent(state.currentUser)}`);
    const data = await res.json();
    if (data.ok) {
      myNcSales = data.sales || [];
    }
  } catch (err) {
    console.error('[Coins] Error al cargar ventas:', err);
  }
}

// Cambiar sub-pestaña de monedas
export function switchCoinsTab(tab) {
  activeCoinsTab = tab;
  renderCoinsCenter();
}
window.switchCoinsTab = switchCoinsTab;

// Renderizar la vista principal de Monedas
export function renderCoinsCenter() {
  const container = document.getElementById('coins-container');
  if (!container) return;

  const walletAmount = (state.userData && state.userData.wallet) ? Number(state.userData.wallet).toLocaleString() : '0';
  const pendingOrdersCount = mySellerOrders.filter(o => o.status === 'PENDING_SELLER_APPROVAL').length;

  container.innerHTML = `
    <!-- Banner Principal con Saldo y Selector -->
    <div class="coins-banner">
      <div>
        <div class="coins-banner-title">✨ Centro de Monedas Nodowa (NC)</div>
        <div class="coins-banner-desc">
          Recarga créditos oficiales del servidor o comercia P2P con tus propios métodos de cobro y aprobación.
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 0.78rem; font-weight: 700; color: #b45309; text-transform: uppercase;">Tu Saldo en Mano</span>
        <div style="font-size: 1.9rem; font-weight: 800; color: #92400e;">${walletAmount} NC</div>
      </div>
    </div>

    <!-- Pestañas de Navegación: Oficiales | Mercado P2P | Mi Panel de Vendedor -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; flex-wrap: wrap;">
      <button class="btn ${activeCoinsTab === 'official' ? 'btn-amber' : 'btn-outline'}" onclick="window.switchCoinsTab('official')" style="font-size: 0.92rem; padding: 0.55rem 1.25rem;">
        👑 Paquetes Oficiales del Servidor
        <span class="badge ${activeCoinsTab === 'official' ? 'badge-primary' : 'badge-amber'}" style="margin-left: 4px;">Recomendado</span>
      </button>

      <button class="btn ${activeCoinsTab === 'p2p' ? 'btn-amber' : 'btn-outline'}" onclick="window.switchCoinsTab('p2p')" style="font-size: 0.92rem; padding: 0.55rem 1.25rem;">
        🤝 Comprar NC a Jugadores (P2P)
        <span class="badge badge-neutral" style="margin-left: 4px;">${ncListings.length} ofertas</span>
      </button>

      <button class="btn ${activeCoinsTab === 'seller_panel' ? 'btn-amber' : 'btn-outline'}" onclick="window.switchCoinsTab('seller_panel')" style="font-size: 0.92rem; padding: 0.55rem 1.25rem;">
        💼 Mi Panel de Vendedor (Aprobar / Cobrar)
        ${pendingOrdersCount > 0 ? `<span class="badge badge-red" style="margin-left: 4px; animation: pulse 2s infinite;">${pendingOrdersCount} por aprobar</span>` : ''}
      </button>
    </div>

    <!-- Contenido Dinámico de la Pestaña -->
    <div id="coins-tab-content">
      ${activeCoinsTab === 'official' ? renderOfficialPacksHtml() : (activeCoinsTab === 'seller_panel' ? renderSellerPanelHtml() : renderP2PMarketHtml())}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SECCIÓN: PAQUETES OFICIALES DEL SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────
function renderOfficialPacksHtml() {
  if (officialCoinPacks.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🪙</div>
        <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text);">Cargando paquetes de monedas oficiales...</h4>
        <p style="font-size: 0.85rem; margin-top: 0.25rem;">Configura paquetes de monedas con categoría "coins" desde el panel de administración.</p>
      </div>
    `;
  }

  return `
    <div>
      <div style="margin-bottom: 1.25rem;">
        <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 0.5rem;">
          👑 Recarga Oficial de Nodocoins
        </h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
          Acreditación directa a tu cuenta web y de Minecraft Bedrock. Pago seguro en USDT vía Binance Pay.
        </p>
      </div>

      <div class="products-grid">
        ${officialCoinPacks.map(pack => {
          const coinsAmt = Number(pack.giveCoins || 0).toLocaleString();
          const priceUsdt = Number(pack.priceUsdt || 0).toFixed(2);
          const badge = pack.badge || (pack.giveCoins >= 5000 ? 'Super Bonus' : 'Oficial');

          return `
            <div class="card product-card" style="border: 2px solid var(--border); transition: all 0.2s ease;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.85rem;">
                  <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background: var(--amber-light); color: var(--amber); display: grid; place-items: center; font-size: 1.5rem;">
                    🪙
                  </div>
                  <span class="badge badge-amber">${escapeHtml(badge)}</span>
                </div>

                <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.25rem; color: var(--text);">
                  ${coinsAmt} NC
                </h3>
                <div style="font-size: 0.82rem; font-weight: 700; color: var(--amber); margin-bottom: 0.5rem;">
                  ${escapeHtml(pack.name)}
                </div>

                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem; line-height: 1.4;">
                  ${escapeHtml(pack.description || 'Recarga de monedas oficial sincronizada con Minecraft Bedrock.')}
                </p>
              </div>

              <div class="product-footer" style="border-top: 1px solid var(--border); padding-top: 0.85rem;">
                <div>
                  <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Precio Binance:</span>
                  <span style="font-size: 1.2rem; font-weight: 800; color: var(--emerald);">$${priceUsdt} <small style="font-size: 0.75rem;">USDT</small></span>
                </div>
                <button class="btn btn-amber btn-sm" onclick="window.startOfficialCoinsCheckout('${pack.id}')">
                  Recargar Ahora
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SECCIÓN: MERCADO P2P ENTRE JUGADORES
// ─────────────────────────────────────────────────────────────────────────────
function renderP2PMarketHtml() {
  return `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 800;">🤝 Ofertas de Monedas de la Comunidad (P2P)</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Compra monedas a otros jugadores con transferencia directa, WhatsApp y Binance Pay con custodia garantizada.
          </p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.switchCoinsTab('seller_panel')">
          💸 Vender Mis Propias Monedas
        </button>
      </div>

      <div class="products-grid">
        ${renderNcListingsHtml()}
      </div>
    </div>
  `;
}

function renderNcListingsHtml() {
  if (ncListings.length === 0) {
    return `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🪙</div>
        <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 0.25rem;">No hay ofertas P2P activas en este momento</h4>
        <p style="font-size: 0.85rem; margin-bottom: 1.25rem;">Sé el primero en vender tus monedas a otros jugadores con tus propios métodos de cobro.</p>
        <button class="btn btn-amber btn-sm" onclick="window.switchCoinsTab('seller_panel')">Publicar Oferta de Monedas</button>
      </div>
    `;
  }

  return ncListings.map(l => {
    const isMine = state.currentUser && l.seller.toLowerCase() === state.currentUser.toLowerCase();
    const avatar = l.sellerAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(l.seller)}/64`;
    const priceFormatted = l.priceUsd ? `$${Number(l.priceUsd).toFixed(2)} USDT` : 'A convenir';

    return `
      <div class="card product-card" style="border: 2px solid var(--border); transition: all 0.2s ease;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <img src="${avatar}" alt="${escapeHtml(l.seller)}" style="width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover;">
              <div>
                <div style="font-weight: 800; font-size: 0.95rem;">${escapeHtml(l.sellerDisplayName || l.seller)}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(l.sellerRank || 'NOVICIO')}</div>
              </div>
            </div>
            ${isMine ? `<span class="badge badge-neutral">Tu Oferta</span>` : `<span class="badge badge-emerald">Disponible</span>`}
          </div>

          <div style="font-size: 1.4rem; font-weight: 800; color: var(--amber); margin-bottom: 0.25rem;">
            ${Number(l.amount).toLocaleString()} NC
          </div>

          <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            ${l.sellerBinanceId ? `💳 Binance ID: <strong>${escapeHtml(l.sellerBinanceId)}</strong>` : '💳 Acepta Binance / Transferencia'}
          </div>

          ${l.sellerWhatsapp ? `
            <div style="font-size: 0.78rem; color: #15803d; font-weight: 700; margin-bottom: 0.5rem;">
              📱 WhatsApp: ${escapeHtml(l.sellerCountryCode || '')} ${escapeHtml(l.sellerWhatsapp)}
            </div>
          ` : ''}
        </div>

        <div class="product-footer" style="border-top: 1px solid var(--border); padding-top: 0.85rem; margin-top: 0.75rem;">
          <div>
            <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Precio:</span>
            <span style="font-size: 1.15rem; font-weight: 800; color: var(--emerald);">${priceFormatted}</span>
          </div>

          ${isMine ? `
            <button class="btn btn-danger-soft btn-sm" onclick="window.cancelNcListing('${l.id}')">
              Cancelar
            </button>
          ` : `
            <button class="btn btn-amber btn-sm" onclick="window.openBuyP2pNcModal('${l.id}')">
              Comprar NC
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SECCIÓN: MI PANEL DE VENDEDOR (Configurar Métodos de Cobro + Aprobar/Rechazar)
// ─────────────────────────────────────────────────────────────────────────────
function renderSellerPanelHtml() {
  if (!state.currentUser) {
    return `
      <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔒</div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem;">
          Inicia Sesión para Vender Monedas
        </h3>
        <p style="font-size: 0.85rem; max-width: 440px; margin: 0 auto 1.25rem;">
          Configura tus métodos de cobro personales (Binance Pay, QR, WhatsApp) y aprueba las órdenes de compra que te envíen otros jugadores.
        </p>
        <button class="btn btn-primary" onclick="window.openModal('modal-login')">Iniciar Sesión</button>
      </div>
    `;
  }

  const myActiveOffers = ncListings.filter(l => l.seller.toLowerCase() === state.currentUser.toLowerCase());
  const pendingOrders = mySellerOrders.filter(o => o.status === 'PENDING_SELLER_APPROVAL');
  const finishedOrders = mySellerOrders.filter(o => o.status !== 'PENDING_SELLER_APPROVAL');

  return `
    <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 1.5rem; align-items: start;">
      
      <!-- Columna Izquierda: Órdenes Recibidas por Aprobar + Historial -->
      <div>
        <!-- Órdenes Pendientes de Revisión -->
        <div class="card" style="margin-bottom: 1.5rem; border: 2px solid ${pendingOrders.length > 0 ? 'var(--amber)' : 'var(--border)'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 0.4rem;">
                📋 Órdenes de Compra Recibidas
                ${pendingOrders.length > 0 ? `<span class="badge badge-red">${pendingOrders.length} Pendientes</span>` : ''}
              </h3>
              <p style="font-size: 0.8rem; color: var(--text-muted);">
                Verifica el pago en tu Binance / banco y presiona <strong>"Aprobar"</strong> para liberar las monedas al comprador.
              </p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="window.loadCoinsCenter('seller_panel')">🔄 Actualizar</button>
          </div>

          ${pendingOrders.length === 0 ? `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
              <div style="font-size: 2rem; margin-bottom: 0.4rem;">✨</div>
              No tienes órdenes pendientes de aprobación en este momento.
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
              ${pendingOrders.map(ord => `
                <div style="background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.85rem;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                      <span style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Comprador</span>
                      <div style="font-size: 0.95rem; font-weight: 800;">👤 ${escapeHtml(ord.buyer)}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 1.15rem; font-weight: 800; color: var(--amber);">${Number(ord.amount).toLocaleString()} NC</div>
                      <div style="font-size: 0.8rem; font-weight: 700; color: var(--emerald);">${ord.priceUsd ? `$${Number(ord.priceUsd).toFixed(2)} USDT` : 'Acordado'}</div>
                    </div>
                  </div>

                  <div style="background: var(--bg-card); padding: 0.5rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.8rem; margin-bottom: 0.75rem; border: 1px dashed var(--border);">
                    <div><strong>TXID:</strong> <code style="color: var(--primary);">${escapeHtml(ord.txid || 'Sin TXID')}</code></div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Fecha: ${new Date(ord.createdAt).toLocaleString()}</div>
                  </div>

                  <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                    ${ord.receiptImage ? `
                      <button class="btn btn-outline btn-sm" onclick="window.viewReceiptImage('${escapeHtml(ord.receiptImage)}', 'Comprobante de ${escapeHtml(ord.buyer)}')">
                        🖼️ Ver Captura
                      </button>
                    ` : ''}
                    <button class="btn btn-emerald btn-sm" style="flex: 1;" onclick="window.approveP2pOrder('${ord.id}')">
                      ✓ Aprobar y Liberar Monedas
                    </button>
                    <button class="btn btn-danger-soft btn-sm" onclick="window.rejectP2pOrder('${ord.id}')">
                      ✕ Rechazar
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Mis Ofertas Activas -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <h4 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 0.5rem;">🪙 Mis Ofertas Publicadas</h4>
          ${myActiveOffers.length === 0 ? `
            <div style="color: var(--text-muted); font-size: 0.82rem; padding: 1rem 0;">No tienes ofertas de monedas activas en venta.</div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${myActiveOffers.map(o => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem;">
                  <div>
                    <strong style="color: var(--amber); font-size: 0.95rem;">${Number(o.amount).toLocaleString()} NC</strong>
                    <span style="color: var(--text-muted); font-size: 0.78rem;"> • ${o.priceUsd ? `$${Number(o.priceUsd).toFixed(2)} USDT` : 'Acordado'}</span>
                  </div>
                  <button class="btn btn-danger-soft btn-sm" onclick="window.cancelNcListing('${o.id}')">
                    ✕ Cancelar y Recuperar Monedas
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Historial de Órdenes Pasadas -->
        ${finishedOrders.length > 0 ? `
          <div class="card">
            <h4 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 0.5rem; color: var(--text-muted);">📜 Historial de Órdenes Procesadas</h4>
            <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.8rem;">
              ${finishedOrders.slice(0, 5).map(fo => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px dashed var(--border);">
                  <div>
                    <strong>${Number(fo.amount).toLocaleString()} NC</strong> a ${escapeHtml(fo.buyer)}
                  </div>
                  <span class="badge ${fo.status === 'COMPLETED' ? 'badge-emerald' : 'badge-red'}">
                    ${fo.status === 'COMPLETED' ? '✓ Aprobada' : '✕ Rechazada'}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Columna Derecha: Configuración de Cobro + Publicar NC -->
      <div>
        <!-- 1. Configurar Mis Métodos de Cobro -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.35rem;">⚙️ Mis Métodos de Cobro</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
            Los compradores verán estos datos para transferirte el dinero antes de que liberes las monedas.
          </p>

          <form id="form-seller-config" onsubmit="event.preventDefault(); window.saveSellerConfig(event);">
            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                Tu Binance Pay ID (o Billetera Crypto):
              </label>
              <input type="text" id="seller-binance-id" class="input" placeholder="Ej. 1255344898" value="${escapeHtml(mySellerConfig.binanceId || '')}">
            </div>

            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                📱 Tu WhatsApp para Coordinar Pago:
              </label>
              <div class="wa-input-group">
                <select id="seller-wa-country" class="wa-country-select">
                  <option value="+591" ${mySellerConfig.countryCode === '+591' ? 'selected' : ''}>🇧🇴 +591</option>
                  <option value="+52" ${mySellerConfig.countryCode === '+52' ? 'selected' : ''}>🇲🇽 +52</option>
                  <option value="+54" ${mySellerConfig.countryCode === '+54' ? 'selected' : ''}>🇦🇷 +54</option>
                  <option value="+57" ${mySellerConfig.countryCode === '+57' ? 'selected' : ''}>🇨🇴 +57</option>
                  <option value="+51" ${mySellerConfig.countryCode === '+51' ? 'selected' : ''}>🇵🇪 +51</option>
                  <option value="+56" ${mySellerConfig.countryCode === '+56' ? 'selected' : ''}>🇨🇱 +56</option>
                  <option value="+34" ${mySellerConfig.countryCode === '+34' ? 'selected' : ''}>🇪🇸 +34</option>
                  <option value="+1" ${mySellerConfig.countryCode === '+1' ? 'selected' : ''}>🇺🇸 +1</option>
                  <option value="+58" ${mySellerConfig.countryCode === '+58' ? 'selected' : ''}>🇻🇪 +58</option>
                  <option value="+593" ${mySellerConfig.countryCode === '+593' ? 'selected' : ''}>🇪🇨 +593</option>
                </select>
                <input type="tel" id="seller-wa-number" class="wa-number-input" placeholder="Tu número WhatsApp" value="${escapeHtml(mySellerConfig.whatsapp || '')}">
              </div>
            </div>

            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                Subir tu Código QR de Cobro (Opcional):
              </label>
              <input type="file" id="seller-qr-file" class="input" accept="image/*">
              ${mySellerConfig.qrImage ? `
                <div style="font-size: 0.72rem; color: var(--emerald); margin-top: 3px;">✓ Tienes un QR activo guardado</div>
              ` : ''}
            </div>

            <div style="margin-bottom: 1rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                Instrucciones adicionales para el comprador:
              </label>
              <input type="text" id="seller-instructions" class="input" placeholder="Ej. Enviar comprobante y poner mi Gamertag en la nota" value="${escapeHtml(mySellerConfig.instructions || '')}">
            </div>

            <button type="submit" id="btn-save-seller-config" class="btn btn-outline btn-block">
              💾 Guardar Mis Métodos de Cobro
            </button>
          </form>
        </div>

        <!-- 2. Publicar Monedas a la Venta -->
        <div class="card">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.35rem;">💸 Publicar Monedas a la Venta</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
            Las monedas pasarán a custodia segura mientras dure la venta. Puedes cancelarla cuando quieras.
          </p>

          <form id="form-sell-nc" onsubmit="event.preventDefault(); window.createNcListing();">
            <div style="margin-bottom: 0.75rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                Cantidad de NC a vender:
              </label>
              <input type="number" id="nc-sell-amount" class="input" placeholder="Ej. 5000" min="50" step="50" required>
            </div>

            <div style="margin-bottom: 1rem;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">
                Precio en USDT / USD:
              </label>
              <input type="number" id="nc-sell-price-usd" class="input" placeholder="Ej. 0.49" min="0.01" step="0.01" required>
            </div>

            <button type="submit" class="btn btn-amber btn-block">
              🚀 Publicar Oferta de Monedas
            </button>
          </form>
        </div>

      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACCIONES P2P: VENDER, CANCELAR Y COMPRAR CON COMPROBANTE
// ─────────────────────────────────────────────────────────────────────────────

// Guardar configuración de métodos de cobro del vendedor
export async function saveSellerConfig(event) {
  if (event) event.preventDefault();
  if (!state.currentUser) return;

  const binanceId = (document.getElementById('seller-binance-id')?.value || '').trim();
  const countryCode = document.getElementById('seller-wa-country')?.value || '+591';
  const whatsapp = (document.getElementById('seller-wa-number')?.value || '').trim();
  const instructions = (document.getElementById('seller-instructions')?.value || '').trim();
  const qrFile = document.getElementById('seller-qr-file')?.files?.[0];

  const btn = document.getElementById('btn-save-seller-config');
  if (btn) btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('username', state.currentUser);
    formData.append('binanceId', binanceId);
    formData.append('countryCode', countryCode);
    formData.append('whatsapp', whatsapp);
    formData.append('instructions', instructions);
    if (qrFile) formData.append('qrImage', qrFile);

    const res = await fetch('/api/nc/seller-config', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.ok) {
      showToast('✓ Métodos de cobro actualizados.');
      mySellerConfig = data.config;
      renderCoinsCenter();
    } else {
      showToast(data.error || 'Error al guardar');
    }
  } catch (err) {
    showToast('Error de conexión');
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.saveSellerConfig = saveSellerConfig;

// Publicar oferta de monedas
export async function createNcListing() {
  if (!state.currentUser) {
    showToast('Inicia sesión para poner NC a la venta');
    window.openModal('modal-login');
    return;
  }

  const amountInput = document.getElementById('nc-sell-amount');
  const priceInput = document.getElementById('nc-sell-price-usd');
  const amount = parseInt(amountInput ? amountInput.value : 0, 10);
  const priceUsd = priceInput && priceInput.value ? parseFloat(priceInput.value) : null;

  if (isNaN(amount) || amount <= 0) {
    showToast('Ingresa una cantidad válida de NC');
    return;
  }

  if ((state.userData.wallet || 0) < amount) {
    showToast(`Saldo insuficiente. Tienes ${state.userData.wallet.toLocaleString()} NC`);
    return;
  }

  try {
    const res = await fetch(`/api/nc/?username=${encodeURIComponent(state.currentUser)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        priceUsd,
        binanceId: mySellerConfig.binanceId,
        whatsapp: mySellerConfig.whatsapp,
        countryCode: mySellerConfig.countryCode,
        instructions: mySellerConfig.instructions
      })
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Error al listar NC');
      return;
    }

    showToast(`✅ ${amount.toLocaleString()} NC puestos a la venta`);
    await loadCoinsCenter('seller_panel');
  } catch (err) {
    console.error('[Coins] Error en venta:', err);
    showToast('Error de red al listar');
  }
}
window.createNcListing = createNcListing;

// Cancelar oferta de monedas y recuperar fondos
export async function cancelNcListing(listingId) {
  if (!state.currentUser) return;
  if (!confirm('¿Deseas cancelar esta oferta y recuperar tus monedas?')) return;

  try {
    const res = await fetch(`/api/nc/cancel/${encodeURIComponent(listingId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.currentUser })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Oferta cancelada y saldo devuelto.');
      await loadCoinsCenter('seller_panel');
    } else {
      showToast(data.error || 'No se pudo cancelar');
    }
  } catch (err) {
    showToast('Error de conexión');
  }
}
window.cancelNcListing = cancelNcListing;

// Abrir modal de compra P2P (para el comprador)
export function openBuyP2pNcModal(listingId) {
  if (!state.currentUser) {
    showToast('Inicia sesión para comprar');
    return openModal('modal-login');
  }

  const listing = ncListings.find(l => l.id === listingId);
  if (!listing) return showToast('Oferta no encontrada');

  selectedP2pListing = listing;

  document.getElementById('p2p-order-listing-id').value = listing.id;
  document.getElementById('p2p-buy-seller-name').textContent = listing.sellerDisplayName || listing.seller;
  document.getElementById('p2p-buy-seller-avatar').src = listing.sellerAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(listing.seller)}/64`;
  document.getElementById('p2p-buy-coins-amount').textContent = `${Number(listing.amount).toLocaleString()} NC`;
  document.getElementById('p2p-buy-price-usd').textContent = listing.priceUsd ? `$${Number(listing.priceUsd).toFixed(2)} USDT` : 'A convenir';

  // Binance info
  const binanceBox = document.getElementById('p2p-buy-binance-box');
  const binanceIdEl = document.getElementById('p2p-buy-binance-id');
  if (listing.sellerBinanceId) {
    binanceIdEl.textContent = listing.sellerBinanceId;
    binanceBox.style.display = 'flex';
  } else {
    binanceIdEl.textContent = 'Coordinar con vendedor';
    binanceBox.style.display = 'flex';
  }

  // QR info
  const qrBox = document.getElementById('p2p-buy-qr-box');
  const qrImg = document.getElementById('p2p-buy-qr-img');
  if (listing.sellerQrImage) {
    qrImg.src = listing.sellerQrImage;
    qrBox.style.display = 'block';
  } else {
    qrBox.style.display = 'none';
  }

  // WhatsApp link
  const waBox = document.getElementById('p2p-buy-wa-box');
  const waLink = document.getElementById('p2p-buy-wa-link');
  if (listing.sellerWhatsapp) {
    const rawNumber = `${listing.sellerCountryCode || ''}${listing.sellerWhatsapp}`.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(`Hola ${listing.seller}, vi tu oferta de ${listing.amount} NC en Nodowa por $${listing.priceUsd || 0} USDT. Mi Gamertag es ${state.currentUser}.`);
    waLink.href = `https://wa.me/${rawNumber}?text=${msg}`;
    waBox.style.display = 'block';
  } else {
    waBox.style.display = 'none';
  }

  // Instrucciones
  const instEl = document.getElementById('p2p-buy-instructions');
  instEl.textContent = listing.sellerInstructions ? `Nota del vendedor: ${listing.sellerInstructions}` : '';

  // Limpiar campos
  const txInput = document.getElementById('p2p-order-txid');
  const fileInput = document.getElementById('p2p-order-file');
  if (txInput) txInput.value = '';
  if (fileInput) fileInput.value = '';

  openModal('modal-buy-p2p-nc');
}
window.openBuyP2pNcModal = openBuyP2pNcModal;

// Enviar orden de compra P2P (Comprador sube TXID y captura)
export async function submitP2pOrder(event) {
  if (event) event.preventDefault();
  if (!state.currentUser || !selectedP2pListing) return;

  const listingId = document.getElementById('p2p-order-listing-id')?.value;
  const txid = (document.getElementById('p2p-order-txid')?.value || '').trim();
  const fileInput = document.getElementById('p2p-order-file');
  const btn = document.getElementById('btn-submit-p2p-order');

  if (!txid) return showToast('Ingresa el ID de Transacción (TXID)');

  if (btn) btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('listingId', listingId);
    formData.append('buyerUsername', state.currentUser);
    formData.append('txid', txid);
    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append('receiptImage', fileInput.files[0]);
    }

    const res = await fetch('/api/nc/order/create', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.ok) {
      closeModal('modal-buy-p2p-nc');
      showToast('🎉 Comprobante enviado al vendedor. Una vez lo verifique, te liberará las monedas.');
      await loadCoinsCenter('p2p');
    } else {
      showToast(data.error || 'Error al enviar orden');
    }
  } catch (err) {
    showToast('Error de conexión');
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.submitP2pOrder = submitP2pOrder;

// Vendedor aprueba la orden y libera las monedas al comprador
export async function approveP2pOrder(orderId) {
  if (!state.currentUser) return;
  if (!confirm('¿Has verificado el pago en tu cuenta? Las monedas se transferirán automáticamente al comprador.')) return;

  try {
    const res = await fetch('/api/nc/orders/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, username: state.currentUser })
    });

    const data = await res.json();
    if (data.ok) {
      showToast(data.message || '¡Orden aprobada exitosamente!');
      await loadCoinsCenter('seller_panel');
    } else {
      showToast(data.error || 'No se pudo aprobar la orden');
    }
  } catch (err) {
    showToast('Error de conexión');
  }
}
window.approveP2pOrder = approveP2pOrder;

// Vendedor rechaza la orden
export async function rejectP2pOrder(orderId) {
  if (!state.currentUser) return;
  const reason = prompt('Motivo del rechazo (ej. Comprobante no válido, TXID duplicado, pago no recibido):');
  if (reason === null) return;

  try {
    const res = await fetch('/api/nc/orders/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, username: state.currentUser, reason })
    });

    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Orden rechazada. Tu oferta de monedas vuelve a estar activa.');
      await loadCoinsCenter('seller_panel');
    } else {
      showToast(data.error || 'No se pudo rechazar');
    }
  } catch (err) {
    showToast('Error de conexión');
  }
}
window.rejectP2pOrder = rejectP2pOrder;

// Visor de imagen de comprobantes
export function viewReceiptImage(imgUrl, title = 'Comprobante') {
  const titleEl = document.getElementById('image-preview-title');
  const srcEl = document.getElementById('image-preview-src');
  if (titleEl) titleEl.textContent = title;
  if (srcEl) srcEl.src = imgUrl;
  openModal('modal-image-preview');
}
window.viewReceiptImage = viewReceiptImage;

// ─────────────────────────────────────────────────────────────────────────────
// 5. CHECKOUT DE PAQUETE OFICIAL CON BINANCE PAY
// ─────────────────────────────────────────────────────────────────────────────
export function startOfficialCoinsCheckout(packId) {
  if (!state.currentUser) {
    showToast('Inicia sesión para recargar monedas');
    return openModal('modal-login');
  }

  selectedOfficialPack = officialCoinPacks.find(p => p.id === packId);
  if (!selectedOfficialPack) return;

  const pack = selectedOfficialPack;
  const cfg = binanceConfig || {};

  const modal = document.getElementById('modal-binance-order');
  if (!modal) return;

  document.getElementById('binance-pack-title').textContent = pack.name;
  document.getElementById('binance-pack-coins').textContent = `${Number(pack.giveCoins || 0).toLocaleString()} NC`;
  document.getElementById('binance-pack-price').textContent = `$${Number(pack.priceUsdt || 0).toFixed(2)} USDT`;
  document.getElementById('binance-pay-id').textContent = cfg.payId || '1255344898';
  document.getElementById('binance-pay-inst').textContent = cfg.instruction || 'Enviar USDT y colocar Gamertag en la nota';

  const qrImg = document.getElementById('binance-pay-qr');
  if (qrImg) {
    const payId = cfg.payId || '1255344898';
    qrImg.onerror = () => {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payId)}`;
    };
    qrImg.src = cfg.qrImage || '/uploads/default_qr.svg';
  }

  const txInput = document.getElementById('binance-order-txid');
  if (txInput) txInput.value = '';

  openModal('modal-binance-order');
}
window.startOfficialCoinsCheckout = startOfficialCoinsCheckout;

// Enviar orden de compra Binance
export async function submitBinanceOrder(event) {
  if (event) event.preventDefault();
  if (!state.currentUser || !selectedOfficialPack) return;

  const txid = (document.getElementById('binance-order-txid')?.value || '').trim();
  const fileInput = document.getElementById('binance-order-file');
  const btnSubmit = document.getElementById('btn-submit-binance-order');

  if (btnSubmit) btnSubmit.disabled = true;

  try {
    const formData = new FormData();
    formData.append('username', state.currentUser);
    formData.append('itemId', selectedOfficialPack.id);
    formData.append('txid', txid);

    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append('receiptImage', fileInput.files[0]);
    }

    const res = await fetch('/api/orders/create', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.ok) {
      closeModal('modal-binance-order');
      showToast('🎉 Comprobante enviado. Tu recarga será aprobada por el Administrador.');
    } else {
      showToast(data.error || 'Error al enviar orden');
    }
  } catch (err) {
    console.error('[BinanceOrder] Error:', err);
    showToast('Error de conexión al enviar comprobante');
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}
window.submitBinanceOrder = submitBinanceOrder;

function updateUserHeaderBalance() {
  const el = document.getElementById('user-pill-balance');
  if (el) el.textContent = `${Number(state.userData.wallet || 0).toLocaleString()} NC`;
}
