// coins.js — Centro de Monedas: Paquetes Oficiales del Servidor + Mercado P2P
import { state, currentUser, userData, setUserData } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';

let officialCoinPacks = [];
let ncListings = [];
let myNcSales = [];
let binanceConfig = null;
let activeCoinsTab = 'official'; // 'official' | 'p2p'
let selectedOfficialPack = null;

// Cargar estado inicial de monedas
export async function loadCoinsCenter(targetTab = null) {
  if (targetTab) activeCoinsTab = targetTab;

  await Promise.all([
    loadOfficialCoinPacks(),
    loadBinanceInfo(),
    loadNcListings(),
    loadMyNcStatus(),
    loadMyNcSales()
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
      updateUserHeaderBalance();
    }
  } catch (err) {
    console.error('[Coins] Error al cargar estado NC:', err);
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

  container.innerHTML = `
    <!-- Banner Principal con Saldo y Selector -->
    <div class="coins-banner">
      <div>
        <div class="coins-banner-title">✨ Centro de Monedas Nodowa (NC)</div>
        <div class="coins-banner-desc">
          Recarga créditos oficiales del servidor con acreditación garantizada o comercia P2P con otros jugadores.
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 0.78rem; font-weight: 700; color: #b45309; text-transform: uppercase;">Tu Saldo en Mano</span>
        <div style="font-size: 1.9rem; font-weight: 800; color: #92400e;">${walletAmount} NC</div>
      </div>
    </div>

    <!-- Pestañas de Navegación: Oficiales vs P2P -->
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; flex-wrap: wrap;">
      <button class="btn ${activeCoinsTab === 'official' ? 'btn-amber' : 'btn-outline'}" onclick="window.switchCoinsTab('official')" style="font-size: 0.92rem; padding: 0.55rem 1.25rem;">
        👑 Paquetes Oficiales del Servidor
        <span class="badge ${activeCoinsTab === 'official' ? 'badge-primary' : 'badge-amber'}" style="margin-left: 4px;">Recomendado</span>
      </button>

      <button class="btn ${activeCoinsTab === 'p2p' ? 'btn-amber' : 'btn-outline'}" onclick="window.switchCoinsTab('p2p')" style="font-size: 0.92rem; padding: 0.55rem 1.25rem;">
        🤝 Mercado P2P entre Jugadores
        <span class="badge badge-neutral" style="margin-left: 4px;">${ncListings.length} ofertas</span>
      </button>
    </div>

    <!-- Contenido Dinámico de la Pestaña -->
    <div id="coins-tab-content">
      ${activeCoinsTab === 'official' ? renderOfficialPacksHtml() : renderP2PMarketHtml()}
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
    <div class="coins-grid-split">
      <!-- Columna Izquierda: Listados Activos -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800;">🤝 Ofertas P2P de la Comunidad</h3>
            <p style="font-size: 0.82rem; color: var(--text-muted);">Créditos ofrecidos directamente por otros jugadores.</p>
          </div>
          <span class="badge badge-amber">${ncListings.length} en venta</span>
        </div>

        <div id="nc-listings-list">
          ${renderNcListingsHtml()}
        </div>
      </div>

      <!-- Columna Derecha: Panel de Venta Rápida -->
      <div>
        <div class="card" style="position: sticky; top: 80px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.35rem;">💸 Vender Mis NC</h3>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.25rem;">
            Publica tus Nodocoins en el mercado. La cantidad se retendrá de tu saldo hasta que alguien la compre.
          </p>

          <form id="form-sell-nc" onsubmit="event.preventDefault(); window.createNcListing();">
            <div style="margin-bottom: 1rem;">
              <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.4rem;">
                Cantidad de NC a poner en venta:
              </label>
              <input type="number" id="nc-sell-amount" class="input" placeholder="Ej. 1000" min="50" step="50" required>
            </div>

            <div style="margin-bottom: 1.25rem;">
              <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.4rem;">
                Precio en USD (opcional):
              </label>
              <input type="number" id="nc-sell-price-usd" class="input" placeholder="Ej. 1.00" min="0.1" step="0.1">
            </div>

            <button type="submit" class="btn btn-amber btn-block">
              Publicar Oferta P2P
            </button>
          </form>

          <!-- Mis Ventas Recientes -->
          <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1rem;">
            <h4 style="font-size: 0.88rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-muted);">
              📋 Historial de Mis Ventas
            </h4>
            <div id="nc-my-sales-list">
              ${renderMySalesHtml()}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderNcListingsHtml() {
  if (ncListings.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🪙</div>
        <div style="font-weight: 700;">No hay ofertas P2P activas en este momento</div>
        <div style="font-size: 0.85rem;">Sé el primero en listar NC para la comunidad con el formulario de la derecha.</div>
      </div>
    `;
  }

  return ncListings.map(l => {
    const isMine = state.currentUser && l.seller.toLowerCase() === state.currentUser.toLowerCase();
    const avatar = l.sellerAvatar || `https://mc-heads.net/avatar/${encodeURIComponent(l.seller)}/64`;

    return `
      <div class="nc-listing-item">
        <div class="nc-seller-info">
          <img src="${avatar}" alt="${escapeHtml(l.seller)}" class="nc-seller-avatar" onclick="window.navigateTo('/${encodeURIComponent(l.seller)}')" style="cursor: pointer;">
          <div>
            <div style="font-weight: 800; font-size: 0.95rem; cursor: pointer;" onclick="window.navigateTo('/${encodeURIComponent(l.seller)}')">
              ${escapeHtml(l.sellerDisplayName || l.seller)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Vendedor • <span class="badge badge-neutral" style="font-size: 0.68rem;">${escapeHtml(l.sellerRank || 'NOVICIO')}</span>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="text-align: right;">
            <div class="nc-amount-badge">${Number(l.amount).toLocaleString()} NC</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              ${l.priceUsd ? `$${Number(l.priceUsd).toFixed(2)} USD` : 'Intercambio'}
            </div>
          </div>

          ${isMine ? `
            <span class="badge badge-neutral" style="padding: 0.4rem 0.8rem;">Tu Oferta</span>
          ` : `
            <button class="btn btn-amber btn-sm" onclick="window.buyNcListing('${l.id}')">
              Comprar
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderMySalesHtml() {
  if (!myNcSales || myNcSales.length === 0) {
    return `<div style="font-size: 0.78rem; color: var(--text-subtle);">No tienes ventas registradas aún.</div>`;
  }

  return myNcSales.slice(0, 5).map(s => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px dashed var(--border); font-size: 0.8rem;">
      <div>
        <span style="font-weight: 700; color: var(--emerald);">+${Number(s.amount).toLocaleString()} NC</span>
        <span style="color: var(--text-muted); font-size: 0.72rem;"> a ${escapeHtml(s.buyer || 'Comprador')}</span>
      </div>
      <span style="color: var(--text-subtle); font-size: 0.7rem;">${new Date(s.completedAt).toLocaleDateString()}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CHECKOUT DE PAQUETE OFICIAL CON BINANCE PAY
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

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACCIONES P2P: VENDER Y COMPRAR
// ─────────────────────────────────────────────────────────────────────────────
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
    showToast('Ingresa una cantidad válida');
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
      body: JSON.stringify({ amount, priceUsd })
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Error al listar NC');
      return;
    }

    showToast(`✅ ${amount.toLocaleString()} NC puestos a la venta`);
    if (amountInput) amountInput.value = '';
    if (priceInput) priceInput.value = '';

    await loadCoinsCenter('p2p');
  } catch (err) {
    console.error('[Coins] Error en venta:', err);
    showToast('Error de red al listar');
  }
}

export async function buyNcListing(listingId) {
  if (!state.currentUser) {
    showToast('Inicia sesión para comprar');
    window.openModal('modal-login');
    return;
  }

  if (!confirm('¿Deseas confirmar la compra de esta oferta de NC?')) return;

  try {
    const res = await fetch(`/api/nc/buy/${encodeURIComponent(listingId)}?username=${encodeURIComponent(state.currentUser)}`, {
      method: 'POST'
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'No se pudo completar la compra');
      return;
    }

    showToast(data.message || '¡Compra de NC exitosa!');
    await loadCoinsCenter('p2p');
  } catch (err) {
    console.error('[Coins] Error al comprar:', err);
    showToast('Error de conexión');
  }
}

function updateUserHeaderBalance() {
  const el = document.getElementById('user-pill-balance');
  if (el) el.textContent = `${Number(state.userData.wallet || 0).toLocaleString()} NC`;
}
