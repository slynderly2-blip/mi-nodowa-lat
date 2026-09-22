/**
 * NODOWA STORE & ECONOMY — CLIENT LOGIC (Autenticación con /link de Minecraft)
 */

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('nodowa_token') || null,
  user: JSON.parse(localStorage.getItem('nodowa_user') || 'null'),
  items: [],
  activeCategory: 'all',
  searchQuery: '',
  pollInterval: null
};

// ── API Helper ────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  const config = { ...opts, headers };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    config.body = JSON.stringify(opts.body);
  } else if (opts.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  try {
    const res = await fetch(path, config);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error en la petición');
    }
    return data;
  } catch (err) {
    toast(err.message);
    throw err;
  }
}

// ── Toast Notifications ──
function toast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerText = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  await refreshUser();
  await loadCatalog();
  setupSearchAndFilters();
});

// ── Refresh User Profile ──
async function refreshUser() {
  if (!state.token) {
    renderUserNav();
    return;
  }
  try {
    const res = await api('/api/auth/me');
    if (res.ok && res.user) {
      state.user = res.user;
      localStorage.setItem('nodowa_user', JSON.stringify(res.user));
    }
  } catch (e) {
    if (e.message.includes('No autorizado') || e.message.includes('Token')) {
      logout();
    }
  }
  renderUserNav();
}

// ── Render User in Navbar ──
function renderUserNav() {
  const navActions = document.getElementById('nav-actions');
  if (!navActions) return;

  if (state.user) {
    navActions.innerHTML = `
      <span>Jugador: <b>${escapeHtml(state.user.username)}</b></span> |
      <span>Saldo: <b>${state.user.wallet.toLocaleString()} NC</b></span>
      <button onclick="openWalletModal()">Billetera y Banco</button>
      <button onclick="openProfileModal()">Mi Perfil</button>
      ${state.user.is_admin ? '<button onclick="openAdminModal()">👑 Admin</button>' : ''}
      <button onclick="logout()">Cerrar sesión</button>
    `;
  } else {
    navActions.innerHTML = `
      <button onclick="openMinecraftLogin()">🎮 Entrar con Minecraft (/link)</button>
      <button onclick="openAdminLoginModal()">👑 Admin</button>
    `;
  }
}

// ── Iniciar sesión mediante /link de Minecraft ──
function openMinecraftLogin() {
  openModal('modal-link-login');
  startMinecraftLogin();
}

async function startMinecraftLogin() {
  if (state.pollInterval) clearInterval(state.pollInterval);

  const statusBox = document.getElementById('link-code-status');
  statusBox.innerHTML = '<p>Generando código seguro...</p>';

  try {
    const res = await api('/api/auth/start-link', { method: 'POST' });
    if (res.ok && res.code) {
      statusBox.innerHTML = `
        <div style="border: 1px dashed #444; padding: 12px; margin-top: 10px; background: #fdfdfd;">
          <p style="margin: 0 0 8px 0;">Tu código de acceso:</p>
          <div style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; font-family: monospace;">${res.code}</div>
          <br>
          <p style="margin: 0 0 6px 0;"><b>¿Qué debes hacer?</b></p>
          <ol style="padding-left: 20px; margin: 0;">
            <li>Entra a Minecraft: <code>carina.mcserverhost.com:2022</code></li>
            <li>En el chat escribe: <b>/link ${res.code}</b></li>
          </ol>
          <br>
          <p><i>⏳ Esperando confirmación desde el juego...</i></p>
        </div>
      `;

      // Polling cada 2 segundos
      state.pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/auth/poll-link?code=${res.code}`).then(r => r.json());
          if (pollRes.ok && pollRes.linked && pollRes.token) {
            clearInterval(state.pollInterval);
            state.pollInterval = null;

            state.token = pollRes.token;
            state.user = pollRes.user;
            localStorage.setItem('nodowa_token', pollRes.token);
            localStorage.setItem('nodowa_user', JSON.stringify(pollRes.user));

            closeModal('modal-link-login');
            toast(`¡Bienvenido a la tienda, ${pollRes.user.username}!`);
            renderUserNav();
          } else if (!pollRes.ok) {
            clearInterval(state.pollInterval);
            statusBox.innerHTML = '<p style="color: red;">El código ha expirado. Genera uno nuevo.</p>';
          }
        } catch (_) {}
      }, 2000);
    }
  } catch (err) {
    statusBox.innerHTML = '<p>Error generando código. Intenta de nuevo.</p>';
  }
}

// ── Admin Login Flow ──
function openAdminLoginModal() {
  openModal('modal-admin-login');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById('admin-pass-input').value;
  try {
    const res = await api('/api/auth/admin-login', {
      method: 'POST',
      body: { password }
    });

    if (res.ok && res.token) {
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('nodowa_token', res.token);
      localStorage.setItem('nodowa_user', JSON.stringify(res.user));
      closeModal('modal-admin-login');
      toast('Sesión de Administrador iniciada');
      renderUserNav();
      openAdminModal();
    }
  } catch (_) {}
}

function logout() {
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.token = null;
  state.user = null;
  localStorage.removeItem('nodowa_token');
  localStorage.removeItem('nodowa_user');
  renderUserNav();
  toast('Sesión cerrada');
}

// ── Load Store Items ──
async function loadCatalog() {
  const grid = document.getElementById('store-grid');
  if (!grid) return;
  grid.innerHTML = '<p>Cargando productos...</p>';

  try {
    const res = await api('/api/store/items');
    if (res.ok) {
      state.items = res.items || [];
      renderCatalog();
    }
  } catch (err) {
    grid.innerHTML = '<p>Error cargando la tienda.</p>';
  }
}

// ── Render Store Cards ──
function renderCatalog() {
  const grid = document.getElementById('store-grid');
  if (!grid) return;

  let items = state.items;

  if (state.activeCategory !== 'all') {
    items = items.filter(i => (i.category || '').toLowerCase() === state.activeCategory.toLowerCase());
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(i => 
      (i.name || '').toLowerCase().includes(q) || 
      (i.description || '').toLowerCase().includes(q) ||
      (i.badge || '').toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    grid.innerHTML = '<p>No se encontraron productos.</p>';
    return;
  }

  grid.innerHTML = items.map(item => {
    return `
      <div class="item-card" data-id="${item.id}">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || '')}</p>
        <p>
          ${item.price_coins > 0 ? `<b>Precio:</b> ${item.price_coins.toLocaleString()} NC<br>` : ''}
          ${item.price_usdt > 0 ? `<b>Precio USDT:</b> $${item.price_usdt.toFixed(2)}<br>` : ''}
          ${item.badge ? `<i>(${escapeHtml(item.badge)})</i>` : ''}
        </p>
        <div>
          ${item.price_coins > 0 ? `<button onclick="initiateBuyNC('${item.id}')">Comprar con NC</button>` : ''}
          ${item.price_usdt > 0 ? `<button onclick="initiateBuyUSDT('${item.id}')">Pagar con USDT</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── Search & Filter Listeners ──
function setupSearchAndFilters() {
  const searchInput = document.getElementById('search-items');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderCatalog();
    });
  }

  const catButtons = document.querySelectorAll('.cat-btn');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.cat || 'all';
      renderCatalog();
    });
  });
}

// ── Buy with NC Flow ──
async function initiateBuyNC(itemId) {
  if (!state.user) {
    toast('Inicia sesión usando /link en Minecraft para comprar');
    openMinecraftLogin();
    return;
  }

  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  if (state.user.wallet < item.price_coins) {
    toast(`Saldo insuficiente. Tienes ${state.user.wallet.toLocaleString()} NC`);
    return;
  }

  if (!confirm(`¿Comprar "${item.name}" por ${item.price_coins.toLocaleString()} NC?`)) {
    return;
  }

  try {
    const res = await api('/api/store/buy-nc', {
      method: 'POST',
      body: { itemId: item.id }
    });

    if (res.ok) {
      toast(`¡Compra exitosa! Reclama tu entrega en Minecraft`);
      await refreshUser();
    }
  } catch (err) {}
}

// ── Buy with USDT Flow ──
function initiateBuyUSDT(itemId) {
  if (!state.user) {
    toast('Inicia sesión usando /link en Minecraft antes de comprar');
    openMinecraftLogin();
    return;
  }

  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('usdt-item-id').value = item.id;
  document.getElementById('usdt-item-details').innerHTML = `
    <p>
      <b>Producto:</b> ${escapeHtml(item.name)}<br>
      <b>Total a transferir:</b> $${item.price_usdt.toFixed(2)} USDT
    </p>
  `;

  openModal('modal-usdt');
}

// ── Submit USDT Order ──
async function submitUsdtOrder(e) {
  e.preventDefault();
  const itemId = document.getElementById('usdt-item-id').value;
  const txid = document.getElementById('usdt-txid').value.trim();
  const fileInput = document.getElementById('usdt-file');

  if (!txid && !fileInput.files.length) {
    toast('Ingresa el TXID o sube una imagen');
    return;
  }

  let receiptUrl = '';
  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    try {
      const upRes = await api('/api/uploads', { method: 'POST', body: formData });
      if (upRes.ok) receiptUrl = upRes.url;
    } catch (e) {
      return;
    }
  }

  try {
    const res = await api('/api/store/order-usdt', {
      method: 'POST',
      body: {
        itemId,
        txid: txid || 'Comprobante adjunto',
        receiptImage: receiptUrl
      }
    });

    if (res.ok) {
      closeModal('modal-usdt');
      toast('¡Pedido enviado! Un administrador lo revisará.');
      document.getElementById('form-usdt-order').reset();
    }
  } catch (err) {}
}

// ── Wallet Operations ──
async function openWalletModal() {
  if (!state.user) {
    toast('Inicia sesión primero');
    openMinecraftLogin();
    return;
  }
  await refreshUser();
  document.getElementById('wallet-user-wallet').innerText = `${state.user.wallet.toLocaleString()} NC`;
  document.getElementById('wallet-user-bank').innerText = `${state.user.bank.toLocaleString()} NC`;

  try {
    const txRes = await api('/api/wallet/transactions?limit=10');
    const txList = document.getElementById('wallet-tx-list');
    if (txRes.ok && txRes.transactions.length > 0) {
      txList.innerHTML = '<ul>' + txRes.transactions.map(t => `
        <li>
          <b>${escapeHtml(t.type)}:</b> ${escapeHtml(t.note || '')} |
          ${t.to_user === state.user.username ? '+' : '-'}${t.amount.toLocaleString()} NC
          <small>(${new Date(t.created_at).toLocaleString()})</small>
        </li>
      `).join('') + '</ul>';
    } else {
      txList.innerHTML = '<p>Sin transacciones recientes</p>';
    }
  } catch (_) {}

  openModal('modal-wallet');
}

async function handleBankDeposit() {
  const amt = parseInt(prompt('Cantidad a depositar:') || '0');
  if (amt <= 0) return;
  try {
    const res = await api('/api/wallet/deposit-bank', { method: 'POST', body: { amount: amt } });
    if (res.ok) {
      toast(`Depositados ${amt.toLocaleString()} NC`);
      await openWalletModal();
    }
  } catch (_) {}
}

async function handleBankWithdraw() {
  const amt = parseInt(prompt('Cantidad a retirar:') || '0');
  if (amt <= 0) return;
  try {
    const res = await api('/api/wallet/withdraw-bank', { method: 'POST', body: { amount: amt } });
    if (res.ok) {
      toast(`Retirados ${amt.toLocaleString()} NC`);
      await openWalletModal();
    }
  } catch (_) {}
}

async function handlePlayerTransfer() {
  const toUser = prompt('Gamertag destino:');
  if (!toUser) return;
  const amt = parseInt(prompt(`Cantidad para ${toUser}:`) || '0');
  if (amt <= 0) return;

  try {
    const res = await api('/api/wallet/transfer', { method: 'POST', body: { toUser, amount: amt } });
    if (res.ok) {
      toast(`Transferidos ${amt.toLocaleString()} NC a ${toUser}`);
      await openWalletModal();
    }
  } catch (_) {}
}

// ── Admin Panel ──
async function openAdminModal() {
  if (!state.user || !state.user.is_admin) {
    toast('Acceso solo para administradores');
    return;
  }
  openModal('modal-admin');
  loadAdminStats();
  loadAdminOrders();
}

async function loadAdminStats() {
  try {
    const res = await api('/api/admin/stats');
    if (res.ok) {
      const s = res.stats;
      document.getElementById('admin-stats-box').innerHTML = `
        <p>
          <b>Jugadores:</b> ${s.totalUsers} |
          <b>Pedidos pendientes:</b> ${s.pendingOrders} |
          <b>NC en circulación:</b> ${s.ncCirculating.toLocaleString()}
        </p>
      `;
    }
  } catch (_) {}
}

async function loadAdminOrders() {
  try {
    const res = await api('/api/admin/orders?status=PENDING');
    const container = document.getElementById('admin-orders-list');
    if (res.ok && res.orders.length > 0) {
      container.innerHTML = res.orders.map(o => `
        <div style="border: 1px solid #ccc; padding: 10px; margin-bottom: 8px;">
          <p>
            <b>Jugador:</b> ${escapeHtml(o.username)} | <b>Item:</b> ${escapeHtml(o.item_title)}<br>
            <b>Precio:</b> $${(o.price_usdt || 0).toFixed(2)} USDT | <b>TXID:</b> ${escapeHtml(o.txid || '')}
          </p>
          ${o.receipt_image ? `<p><a href="${o.receipt_image}" target="_blank">Ver Comprobante</a></p>` : ''}
          <button onclick="approveOrder('${o.id}')">Aprobar</button>
          <button onclick="rejectOrder('${o.id}')">Rechazar</button>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p>No hay pedidos pendientes.</p>';
    }
  } catch (_) {}
}

async function approveOrder(orderId) {
  try {
    const res = await api(`/api/admin/orders/${orderId}/approve`, { method: 'POST' });
    if (res.ok) {
      toast('Pedido aprobado');
      loadAdminOrders();
      loadAdminStats();
    }
  } catch (_) {}
}

async function rejectOrder(orderId) {
  const note = prompt('Motivo:') || 'Rechazado';
  try {
    const res = await api(`/api/admin/orders/${orderId}/reject`, { method: 'POST', body: { note } });
    if (res.ok) {
      toast('Pedido rechazado');
      loadAdminOrders();
      loadAdminStats();
    }
  } catch (_) {}
}

// ── Profile Modal ──
function openProfileModal() {
  if (!state.user) return;
  document.getElementById('profile-username').innerText = state.user.username;
  document.getElementById('profile-linked-status').innerText = state.user.linked ? 'Vinculado a Minecraft' : 'No vinculado';
  document.getElementById('profile-wallet-balance').innerText = `${state.user.wallet.toLocaleString()} NC`;
  document.getElementById('profile-bank-balance').innerText = `${state.user.bank.toLocaleString()} NC`;
  openModal('modal-profile');
}

// ── Modal Utilities ──
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function setupModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
}

function setupNavigation() {
  window.copyServerIP = () => {
    navigator.clipboard.writeText('carina.mcserverhost.com:2022');
    toast('IP copiada: carina.mcserverhost.com:2022');
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
