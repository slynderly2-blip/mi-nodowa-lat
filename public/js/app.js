/* ═══════════════════════════════════════════════════════════════════════════
   Nodowa Tienda — app.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── 1. Estado global ────────────────────────────────────────────────────── */
const State = {
  user:          null,   // objeto usuario del JWT / /me
  token:         null,   // JWT string
  activeSection: 'catalog',
  catalog: {
    items:    [],
    page:     1,
    total:    0,
    category: 'all',
    search:   '',
  },
  wallet: {
    wallet: 0,
    bank:   0,
    txPage: 1,
  },
  adminOrders: {
    status: 'PENDING',
    page:   1,
  },
};

/* ── 2. API helper ───────────────────────────────────────────────────────── */
const API_BASE = '/api';

async function api(method, path, body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && State.token) headers['Authorization'] = `Bearer ${State.token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const url = `${API_BASE}${path}`;
  console.log(`[API] ${method} ${url}`);

  try {
    const res  = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[API] ❌ ${method} ${url} → ${res.status}:`, data);
      throw new Error(data.message || data.error || `Error ${res.status}`);
    }
    console.log(`[API] ✅ ${method} ${url} → ${res.status}`);
    return data;
  } catch (err) {
    if (err.message.startsWith('Error ') || err.message.includes('fetch')) {
      console.error(`[API] 🔥 ${method} ${url} → NETWORK ERROR:`, err.message);
    }
    throw err;
  }
}

const get  = (path, auth)       => api('GET',    path, null, auth);
const post = (path, body, auth) => api('POST',   path, body, auth);

/* ── 3. Token / sesión ───────────────────────────────────────────────────── */
function saveSession(token, user) {
  State.token = token;
  State.user  = user;
  localStorage.setItem('nodowa_token', token);
  localStorage.removeItem('nodowa_pending_code'); // limpiar código pendiente
  console.log('[Auth] Sesión guardada para:', user.username);
}

function clearSession() {
  State.token = null;
  State.user  = null;
  localStorage.removeItem('nodowa_token');
  console.log('[Auth] Sesión limpiada');
}

function savePendingCode(code, username, expiresAt) {
  localStorage.setItem('nodowa_pending_code', JSON.stringify({ code, username, expiresAt }));
  console.log('[Auth] Código pendiente guardado:', code, 'para', username);
}

function getPendingCode() {
  try {
    const raw = localStorage.getItem('nodowa_pending_code');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (new Date(data.expiresAt) < new Date()) {
      localStorage.removeItem('nodowa_pending_code');
      console.log('[Auth] Código pendiente expirado, limpiado');
      return null;
    }
    return data;
  } catch { return null; }
}

function clearPendingCode() {
  localStorage.removeItem('nodowa_pending_code');
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

async function restoreSession() {
  // 1. Intentar restaurar sesión activa
  const token = localStorage.getItem('nodowa_token');
  if (token) {
    const payload = parseJwt(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      console.log('[Auth] Token expirado, limpiando sesión');
      clearSession();
    } else {
      State.token = token;
      try {
        const data = await get('/auth/me');
        State.user = data.user;
        console.log('[Auth] Sesión restaurada para:', State.user.username);
        return;
      } catch (err) {
        console.warn('[Auth] /me falló, limpiando sesión:', err.message);
        clearSession();
      }
    }
  }

  // 2. Si hay código pendiente, reanudar polling
  const pending = getPendingCode();
  if (pending) {
    console.log('[Auth] Código pendiente encontrado:', pending.code, '— reanudando polling');
    // Abrir modal mostrando el código y reanudar polling
    _linkCode = pending.code;
    // Mostrar modal en step 2 automáticamente después del init
    setTimeout(() => {
      openModal('modal-login');
      $('login-step-1').hidden    = true;
      $('login-step-2').hidden    = false;
      $('login-admin-panel').hidden = true;
      $('modal-link-code').textContent = pending.code;
      const expires = new Date(pending.expiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      $('link-expires-note').textContent = `El código expira a las ${expires}`;
      $('link-wait-text').textContent = 'Esperando confirmación… (¿ya pusiste /link en Minecraft?)';
      startLinkPolling(pending.code);
    }, 300);
  }
}

/* ── 4. Toast ────────────────────────────────────────────────────────────── */
let _toastTimer = null;

function toast(msg, type = 'info', duration = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast toast--${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

/* ── 5. Helpers DOM ──────────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }

function setFeedback(id, msg, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `form-feedback ${isError ? 'form-feedback--error' : 'form-feedback--ok'}`;
}

function clearFeedback(id) {
  const el = $(id);
  if (el) { el.textContent = ''; el.className = 'form-feedback'; }
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('es');
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── 6. Modales ──────────────────────────────────────────────────────────── */
function openModal(id) {
  const el = $(id);
  if (el) el.hidden = false;
}

function closeModal(id) {
  const el = $(id);
  if (el) el.hidden = true;
}

function initModals() {
  // Cerrar al hacer click en el backdrop
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        backdrop.hidden = true;
        if (backdrop.id === 'modal-login') resetLoginModal();
      }
    });
  });

  // Botones de cierre
  [
    ['modal-login-close',       'modal-login'],
    ['modal-buy-nc-close',      'modal-buy-nc'],
    ['modal-buy-usdt-close',    'modal-buy-usdt'],
    ['modal-wallet-action-close','modal-wallet-action'],
    ['modal-admin-user-close',  'modal-admin-user'],
  ].forEach(([btnId, modalId]) => {
    const btn = $(btnId);
    if (btn) btn.addEventListener('click', () => {
      closeModal(modalId);
      if (modalId === 'modal-login') resetLoginModal();
    });
  });

  // Cancelar compra NC
  const cancelNc = $('modal-buy-nc-cancel');
  if (cancelNc) cancelNc.addEventListener('click', () => closeModal('modal-buy-nc'));

  // Escape cierra modales
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(m => m.hidden = true);
    }
  });
}

/* ── 7. Sidebar Nav por rol ──────────────────────────────────────────────── */
function renderSidebarNav() {
  const nav    = $('sidebar-nav');
  const isAuth = !!State.user;
  const isAdmin = isAuth && State.user.is_admin;

  const sections = [];

  /* TIENDA — siempre visible */
  sections.push(`
    <span class="nav-section-label">Tienda</span>
    <button class="nav-item ${State.activeSection === 'catalog' ? 'active' : ''}"
            data-section="catalog">
      <i class="nav-icon" aria-hidden="true">📦</i> Catálogo
    </button>
  `);

  if (!isAuth) {
    /* No autenticado: solo login */
    sections.push(`
      <div class="nav-divider"></div>
      <span class="nav-section-label">Acceder</span>
      <button class="nav-item" id="nav-login-btn">
        <i class="nav-icon" aria-hidden="true">🎮</i> Iniciar sesión
      </button>
    `);
  } else {
    /* Autenticado: Mi cuenta */
    sections.push(`
      <div class="nav-divider"></div>
      <span class="nav-section-label">Mi cuenta</span>
      <button class="nav-item ${State.activeSection === 'profile' ? 'active' : ''}"
              data-section="profile">
        <i class="nav-icon" aria-hidden="true">👤</i> Mi Perfil
      </button>
      <button class="nav-item ${State.activeSection === 'wallet' ? 'active' : ''}"
              data-section="wallet">
        <i class="nav-icon" aria-hidden="true">💰</i> Billetera
      </button>
      <button class="nav-item ${State.activeSection === 'bank' ? 'active' : ''}"
              data-section="bank">
        <i class="nav-icon" aria-hidden="true">🏦</i> Banco
      </button>
      <button class="nav-item ${State.activeSection === 'orders' ? 'active' : ''}"
              data-section="orders">
        <i class="nav-icon" aria-hidden="true">📋</i> Mis Pedidos
      </button>
    `);

    if (isAdmin) {
      /* Admin: sección Administración */
      sections.push(`
        <div class="nav-divider"></div>
        <span class="nav-section-label">Administración</span>
        <button class="nav-item ${State.activeSection === 'stats' ? 'active' : ''}"
                data-section="stats">
          <i class="nav-icon" aria-hidden="true">📊</i> Estadísticas
        </button>
        <button class="nav-item ${State.activeSection === 'admin-orders' ? 'active' : ''}"
                data-section="admin-orders">
          <i class="nav-icon" aria-hidden="true">📝</i> Pedidos USDT
        </button>
        <button class="nav-item ${State.activeSection === 'admin-users' ? 'active' : ''}"
                data-section="admin-users">
          <i class="nav-icon" aria-hidden="true">👥</i> Jugadores
        </button>
      `);
    }

    /* Cerrar sesión siempre al final */
    sections.push(`
      <div class="nav-divider"></div>
      <span class="nav-section-label">Sesión</span>
      <button class="nav-item nav-item--danger" id="nav-logout-btn">
        <i class="nav-icon" aria-hidden="true">🚪</i> Cerrar sesión
      </button>
    `);
  }

  nav.innerHTML = sections.join('');

  /* Eventos de navegación */
  nav.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  const loginBtn = $('nav-login-btn');
  if (loginBtn) loginBtn.addEventListener('click', () => openModal('modal-login'));

  const logoutBtn = $('nav-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

/* ── 8. Topbar por rol ───────────────────────────────────────────────────── */
function renderTopbar() {
  const actions = $('topbar-actions');
  const isAuth  = !!State.user;
  const isAdmin = isAuth && State.user.is_admin;

  if (!isAuth) {
    actions.innerHTML = `
      <button class="btn btn-primary btn-sm" id="topbar-login-btn">
        🎮 Iniciar sesión
      </button>
    `;
    const btn = $('topbar-login-btn');
    if (btn) btn.addEventListener('click', () => openModal('modal-login'));
  } else {
    const wallet = formatNumber(State.wallet.wallet);
    const initial = (State.user.display_name || State.user.username || '?')[0].toUpperCase();

    actions.innerHTML = `
      <div class="topbar-balance">
        <span class="balance-icon">💰</span>
        <span>${wallet} NC</span>
      </div>
      ${isAdmin ? `<button class="btn btn-secondary btn-sm" id="topbar-admin-btn">⚙ Admin</button>` : ''}
      <div class="topbar-avatar" id="topbar-avatar" title="${State.user.display_name || State.user.username}" role="button" tabindex="0" aria-label="Mi perfil">${initial}</div>
    `;

    const avatar = $('topbar-avatar');
    if (avatar) {
      avatar.addEventListener('click', () => navigateTo('profile'));
      avatar.addEventListener('keydown', e => { if (e.key === 'Enter') navigateTo('profile'); });
    }

    const adminBtn = $('topbar-admin-btn');
    if (adminBtn) adminBtn.addEventListener('click', () => navigateTo('stats'));
  }
}

/* ── 9. Navegación de secciones ──────────────────────────────────────────── */
function navigateTo(sectionId) {
  console.log('[Nav] →', sectionId);
  /* Requiere auth para secciones privadas */
  const privateSections = ['wallet','bank','orders','profile','stats','admin-orders','admin-users'];
  if (privateSections.includes(sectionId) && !State.user) {
    openModal('modal-login');
    return;
  }

  /* Solo admin puede acceder a secciones de admin */
  const adminSections = ['stats','admin-orders','admin-users'];
  if (adminSections.includes(sectionId) && !(State.user?.is_admin)) {
    toast('Acceso restringido', 'error');
    return;
  }

  State.activeSection = sectionId;

  /* Actualizar título topbar */
  const section = document.getElementById(`section-${sectionId}`);
  const title   = section ? section.dataset.title : 'Tienda';
  $('topbar-title').textContent = title;

  /* Mostrar sección activa */
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  if (section) section.classList.add('active');

  /* Actualizar nav activo */
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionId);
  });

  /* Cargar datos de la sección */
  switch (sectionId) {
    case 'catalog':      loadCatalog();        break;
    case 'wallet':       loadWallet();         break;
    case 'bank':         loadBank();           break;
    case 'orders':       loadOrders();         break;
    case 'profile':      loadProfile();        break;
    case 'stats':        loadStats();          break;
    case 'admin-orders': loadAdminOrders();    break;
    case 'admin-users':  loadAdminUsers();     break;
  }
}

/* ── 10. Auth — flujo MC: nickname → código → polling ────────────────────── */
let _linkPollInterval = null;
let _linkCode         = null;

function initAuthModal() {
  /* Paso 1: formulario de nickname */
  $('link-request-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearFeedback('link-request-feedback');
    const username = $('link-username').value.trim();
    if (!username) return;

    const btn = e.submitter || e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Generando…';

    try {
      const data = await post('/auth/request-link', { username }, false);
      _linkCode = data.code;
      showLinkStep2(data);
    } catch (err) {
      setFeedback('link-request-feedback', err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generar código';
    }
  });

  /* Volver al paso 1 */
  $('btn-back-step1').addEventListener('click', () => {
    stopLinkPolling();
    $('login-step-2').hidden = true;
    $('login-step-1').hidden = false;
  });

  /* Panel admin */
  $('show-admin-login').addEventListener('click', () => {
    $('login-step-1').hidden    = true;
    $('login-admin-panel').hidden = false;
  });

  $('show-link-login').addEventListener('click', () => {
    $('login-admin-panel').hidden = true;
    $('login-step-1').hidden    = false;
  });

  /* Form admin login */
  $('admin-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearFeedback('admin-login-feedback');
    const username = $('admin-login-username').value.trim();
    const password = $('admin-login-password').value;
    if (!username || !password) return;

    const btn = e.submitter || e.target.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      const data = await post('/auth/admin-login', { username, password }, false);
      saveSession(data.token, data.user);
      closeModal('modal-login');
      resetLoginModal();
      await afterAuth();
      toast(`Bienvenido admin, ${data.user.display_name || data.user.username}`, 'ok');
    } catch (err) {
      setFeedback('admin-login-feedback', err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

function showLinkStep2(data) {
  $('login-step-1').hidden  = true;
  $('login-step-2').hidden  = false;
  $('modal-link-code').textContent = data.code;

  const expires = new Date(data.expiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  $('link-expires-note').textContent = `El código expira a las ${expires}`;
  $('link-wait-text').textContent = 'Esperando confirmación…';

  // Guardar en localStorage para que persista si cierran la pestaña
  savePendingCode(data.code, data.username, data.expiresAt);

  startLinkPolling(data.code);
}

function startLinkPolling(code) {
  stopLinkPolling();
  _linkPollInterval = setInterval(async () => {
    try {
      const data = await get(`/auth/check-link/${code}`, false);

      if (data.status === 'expired') {
        stopLinkPolling();
        $('link-wait-text').textContent = 'Código expirado.';
        return;
      }

      if (data.ok && data.status === 'linked') {
        stopLinkPolling();
        clearPendingCode();
        $('link-wait-text').textContent = '¡Vinculado!';
        saveSession(data.token, data.user);
        closeModal('modal-login');
        resetLoginModal();
        await afterAuth();
        toast(`¡Bienvenido, ${data.user.display_name || data.user.username}!`, 'ok');
      }
    } catch { /* silencioso */ }
  }, 2500);
}

function stopLinkPolling() {
  if (_linkPollInterval) {
    clearInterval(_linkPollInterval);
    _linkPollInterval = null;
  }
}

function resetLoginModal() {
  stopLinkPolling();
  _linkCode = null;
  $('login-step-1').hidden    = false;
  $('login-step-2').hidden    = true;
  $('login-admin-panel').hidden = true;
  $('link-username').value    = '';
  clearFeedback('link-request-feedback');
  clearFeedback('admin-login-feedback');
}

async function afterAuth() {
  /* Refrescar balance antes de renderizar */
  await refreshBalance();
  renderSidebarNav();
  renderTopbar();
  /* Ir a catálogo post-login */
  navigateTo('catalog');
}

async function handleLogout() {
  clearSession();
  State.wallet = { wallet: 0, bank: 0, txPage: 1 };
  renderSidebarNav();
  renderTopbar();
  navigateTo('catalog');
  toast('Sesión cerrada', 'info');
}

/* ── 11. Balance helper ──────────────────────────────────────────────────── */
async function refreshBalance() {
  if (!State.user) return;
  try {
    const data = await get('/wallet/balance');
    State.wallet.wallet = data.wallet ?? 0;
    State.wallet.bank   = data.bank   ?? 0;
  } catch (err) {
    console.warn('[Balance] No se pudo cargar el balance:', err.message);
  }
}

/* ── 12. CATÁLOGO ────────────────────────────────────────────────────────── */
const ICON_MAP = {
  gem: '💎', sword: '⚔️', shield: '🛡️', bow: '🏹', potion: '🧪',
  food: '🍖', pick: '⛏️', map: '🗺️', coin: '🪙', star: '⭐',
  chest: '📦', horse: '🐴', fire: '🔥', magic: '✨', axe: '🪓',
  armor: '🦺', trophy: '🏆', rank: '🎖️', house: '🏠', fly: '🦅',
};

function itemIcon(iconType) {
  return ICON_MAP[iconType] || '🎁';
}

function categoryLabel(cat) {
  const labels = {
    all: 'Todos', items: 'Items', ranks: 'Rangos', coins: 'Monedas',
    kits: 'Kits', passes: 'Pases', cosmetics: 'Cosméticos',
  };
  return labels[cat] || cat;
}

async function loadCatalog() {
  const grid = $('items-grid');
  grid.innerHTML = '<p class="empty-state">Cargando productos…</p>';

  try {
    const { category, search, page } = State.catalog;
    const params = new URLSearchParams({ page, limit: 24 });
    if (category && category !== 'all') params.set('category', category);
    if (search) params.set('search', search);

    const data = await get(`/store/items?${params}`, false);
    State.catalog.items = data.items || [];
    State.catalog.total = data.total || data.items?.length || 0;

    // categories viene como [{category, count}] — extraer solo los strings
    const cats = (data.categories || []).map(c => typeof c === 'string' ? c : c.category);
    renderCatalogCategories(cats);
    renderCatalogItems();
    renderPagination('catalog-pagination', page, Math.ceil(State.catalog.total / 24), p => {
      State.catalog.page = p;
      loadCatalog();
    });
  } catch (err) {
    console.error('[Catalog] Error:', err);
    grid.innerHTML = `<p class="empty-state">Error al cargar el catálogo: ${err.message}</p>`;
  }
}

function renderCatalogCategories(cats) {
  const container = $('category-filters');
  const all = ['all', ...cats.filter(c => c !== 'all')];

  container.innerHTML = all.map(cat => `
    <button class="cat-btn ${State.catalog.category === cat ? 'active' : ''}"
            data-cat="${cat}">
      ${categoryLabel(cat)}
    </button>
  `).join('');

  container.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.catalog.category = btn.dataset.cat;
      State.catalog.page     = 1;
      loadCatalog();
    });
  });
}

function renderCatalogItems() {
  const grid = $('items-grid');

  if (!State.catalog.items.length) {
    grid.innerHTML = `<p class="empty-state">No hay productos en esta categoría.${State.user?.is_admin ? '<br><small>Ve a Administración → Items para agregar productos.</small>' : ''}</p>`;
    return;
  }

  grid.innerHTML = State.catalog.items.map(item => {
    const hasNC   = item.price_coins > 0;
    const hasUSDT = item.price_usdt  > 0;

    return `
      <article class="item-card" data-id="${item.id}">
        ${item.badge ? `<span class="item-badge">${item.badge}</span>` : ''}
        <div class="item-card__icon">${itemIcon(item.icon_type)}</div>
        <div class="item-card__name">${escHtml(item.name)}</div>
        ${item.description ? `<p class="item-card__desc">${escHtml(item.description)}</p>` : ''}
        <div class="item-card__prices">
          ${hasNC   ? `<span class="price-tag price-tag--nc">💎 ${formatNumber(item.price_coins)} NC</span>` : ''}
          ${hasUSDT ? `<span class="price-tag price-tag--usdt">💵 $${item.price_usdt} USDT</span>`           : ''}
        </div>
        <div class="item-card__actions">
          ${hasNC   ? `<button class="btn btn-primary btn-sm btn-buy-nc"   data-id="${item.id}">Comprar NC</button>`   : ''}
          ${hasUSDT ? `<button class="btn btn-teal    btn-sm btn-buy-usdt" data-id="${item.id}">Pagar USDT</button>`  : ''}
        </div>
      </article>
    `;
  }).join('');

  /* Eventos de compra */
  grid.querySelectorAll('.btn-buy-nc').forEach(btn => {
    btn.addEventListener('click', () => openBuyNC(btn.dataset.id));
  });
  grid.querySelectorAll('.btn-buy-usdt').forEach(btn => {
    btn.addEventListener('click', () => openBuyUSDT(btn.dataset.id));
  });
}

/* Buscar en catálogo */
function initCatalogSearch() {
  const input = $('search-input');
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      State.catalog.search = input.value.trim();
      State.catalog.page   = 1;
      loadCatalog();
    }, 350);
  });
}

/* ── 13. Compra con NC ───────────────────────────────────────────────────── */
let _buyNCItemId = null;

function openBuyNC(itemId) {
  if (!State.user) { openModal('modal-login'); return; }

  const item = State.catalog.items.find(i => i.id === itemId);
  if (!item) return;

  _buyNCItemId = itemId;
  clearFeedback('buy-nc-feedback');

  $('modal-buy-nc-title').textContent = 'Confirmar compra';
  $('modal-buy-nc-body').innerHTML = `
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
      <span style="font-size:2.2rem;">${itemIcon(item.icon_type)}</span>
      <div>
        <div style="font-weight:700; font-size:0.95rem;">${escHtml(item.name)}</div>
        <div style="color:var(--text-secondary); font-size:0.82rem; margin-top:2px;">${escHtml(item.description || '')}</div>
      </div>
    </div>
    <div style="background:var(--violet-dim); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
      <span style="color:var(--text-secondary); font-size:0.83rem;">Costo</span>
      <span style="font-weight:800; color:#a78bfa; font-size:1.1rem;">💎 ${formatNumber(item.price_coins)} NC</span>
    </div>
    <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); padding:0 4px;">
      <span>Tu saldo actual</span>
      <span>${formatNumber(State.wallet.wallet)} NC</span>
    </div>
  `;

  openModal('modal-buy-nc');
}

async function confirmBuyNC() {
  if (!_buyNCItemId) return;
  const btn = $('modal-buy-nc-confirm');
  btn.disabled = true;
  clearFeedback('buy-nc-feedback');

  try {
    await post('/store/buy-nc', { itemId: _buyNCItemId });
    await refreshBalance();
    renderTopbar();
    closeModal('modal-buy-nc');
    toast('¡Compra exitosa!', 'ok');
    _buyNCItemId = null;
  } catch (err) {
    setFeedback('buy-nc-feedback', err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ── 14. Compra con USDT ─────────────────────────────────────────────────── */
let _buyUSDTItemId = null;

function openBuyUSDT(itemId) {
  if (!State.user) { openModal('modal-login'); return; }

  const item = State.catalog.items.find(i => i.id === itemId);
  if (!item) return;

  _buyUSDTItemId = itemId;
  clearFeedback('buy-usdt-feedback');
  $('usdt-txid').value = '';

  $('modal-buy-usdt-title').textContent = 'Pagar con USDT';
  $('modal-buy-usdt-body').innerHTML = `
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
      <span style="font-size:2.2rem;">${itemIcon(item.icon_type)}</span>
      <div>
        <div style="font-weight:700; font-size:0.95rem;">${escHtml(item.name)}</div>
        <div style="font-size:0.82rem; color:var(--text-secondary);">${escHtml(item.description || '')}</div>
      </div>
    </div>
    <div style="background:var(--teal-dim); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <span style="color:var(--text-secondary); font-size:0.83rem;">Total a pagar</span>
      <span style="font-weight:800; color:#5eead4; font-size:1.1rem;">💵 $${item.price_usdt} USDT</span>
    </div>
    <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:6px;">Envía el pago a la dirección USDT (TRC20) del servidor y pega el hash de transacción abajo.</p>
  `;

  openModal('modal-buy-usdt');
}

async function submitUSDTOrder(e) {
  e.preventDefault();
  if (!_buyUSDTItemId) return;
  const txid = $('usdt-txid').value.trim();
  if (!txid) return;

  clearFeedback('buy-usdt-feedback');
  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;

  try {
    await post('/store/submit-order', { itemId: _buyUSDTItemId, txid });
    closeModal('modal-buy-usdt');
    toast('Pedido enviado. El admin lo revisará pronto.', 'info');
    _buyUSDTItemId = null;
  } catch (err) {
    setFeedback('buy-usdt-feedback', err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── 15. BILLETERA ───────────────────────────────────────────────────────── */
async function loadWallet() {
  await refreshBalance();
  renderTopbar();

  $('wallet-amount').textContent = `${formatNumber(State.wallet.wallet)} NC`;
  $('bank-amount').textContent   = `${formatNumber(State.wallet.bank)} NC`;

  loadTransactions();
}

async function loadTransactions(page = 1) {
  State.wallet.txPage = page;
  const list = $('tx-list');
  list.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const data = await get(`/wallet/transactions?page=${page}&limit=15`);
    const txs  = data.transactions || data.items || [];

    if (!txs.length) {
      list.innerHTML = '<p class="empty-state">Sin transacciones.</p>';
      return;
    }

    list.innerHTML = txs.map(tx => {
      const isCredit = tx.to_user === State.user.username ||
                       ['BONUS','DELIVERY'].includes(tx.type);
      const sign     = isCredit ? '+' : '−';
      const cls      = isCredit ? 'tx-row__amount--credit' : 'tx-row__amount--debit';
      const label    = tx.note || `${tx.type} · ${isCredit ? tx.from_user : tx.to_user}`;

      return `
        <div class="tx-row">
          <div class="tx-row__meta">
            <span class="tx-row__label">${escHtml(label)}</span>
            <span class="tx-row__date">${formatDate(tx.created_at)}</span>
          </div>
          <span class="tx-row__amount ${cls}">${sign}${formatNumber(tx.amount)} NC</span>
        </div>
      `;
    }).join('');

    if (data.total) {
      renderPagination('tx-pagination', page, Math.ceil(data.total / 15), p => loadTransactions(p));
    }
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/* Transferencia */
function initTransferForm() {
  $('transfer-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearFeedback('transfer-feedback');
    const toUser = $('transfer-to').value.trim();
    const amount = parseInt($('transfer-amount').value, 10);
    if (!toUser || !amount) return;

    try {
      await post('/wallet/transfer', { fromUser: State.user.username, toUser, amount });
      await refreshBalance();
      renderTopbar();
      $('wallet-amount').textContent = `${formatNumber(State.wallet.wallet)} NC`;
      $('transfer-to').value     = '';
      $('transfer-amount').value = '';
      setFeedback('transfer-feedback', `Transferidos ${formatNumber(amount)} NC a ${toUser}`);
      loadTransactions();
      toast(`Transferidos ${formatNumber(amount)} NC a ${toUser}`, 'ok');
    } catch (err) {
      setFeedback('transfer-feedback', err.message, true);
    }
  });
}

/* Depositar / retirar del banco */
let _walletAction = null; // 'deposit' | 'withdraw'

function initWalletActionButtons() {
  $('btn-deposit-bank').addEventListener('click', () => openWalletAction('deposit'));
  $('btn-withdraw-bank').addEventListener('click', () => openWalletAction('withdraw'));
  $('btn-bank-deposit').addEventListener('click',  () => openWalletAction('deposit'));
  $('btn-bank-withdraw').addEventListener('click', () => openWalletAction('withdraw'));
}

function openWalletAction(action) {
  _walletAction = action;
  clearFeedback('wallet-action-feedback');
  $('wallet-action-amount').value = '';
  $('modal-wallet-action-title').textContent =
    action === 'deposit' ? 'Depositar al banco' : 'Retirar del banco';
  $('wallet-action-label').textContent =
    action === 'deposit'
      ? `Cantidad a depositar (tienes ${formatNumber(State.wallet.wallet)} NC en mano)`
      : `Cantidad a retirar (tienes ${formatNumber(State.wallet.bank)} NC en banco)`;
  openModal('modal-wallet-action');
}

async function submitWalletAction(e) {
  e.preventDefault();
  const amount = parseInt($('wallet-action-amount').value, 10);
  if (!amount || amount < 1) return;
  clearFeedback('wallet-action-feedback');

  const endpoint = _walletAction === 'deposit' ? '/wallet/deposit-bank' : '/wallet/withdraw-bank';
  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;

  try {
    await post(endpoint, { amount });
    await refreshBalance();
    renderTopbar();
    closeModal('modal-wallet-action');
    /* Actualizar ambas secciones */
    $('wallet-amount').textContent        = `${formatNumber(State.wallet.wallet)} NC`;
    $('bank-amount').textContent          = `${formatNumber(State.wallet.bank)} NC`;
    $('bank-section-amount').textContent  = `${formatNumber(State.wallet.bank)} NC`;
    toast(
      _walletAction === 'deposit'
        ? `Depositados ${formatNumber(amount)} NC al banco`
        : `Retirados ${formatNumber(amount)} NC del banco`,
      'ok'
    );
    loadTransactions();
  } catch (err) {
    setFeedback('wallet-action-feedback', err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── 16. BANCO ───────────────────────────────────────────────────────────── */
async function loadBank() {
  await refreshBalance();
  $('bank-section-amount').textContent = `${formatNumber(State.wallet.bank)} NC`;

  const list = $('bank-tx-list');
  list.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const data = await get('/wallet/transactions?page=1&limit=20');
    const txs  = (data.transactions || data.items || []).filter(tx =>
      ['DEPOSIT','WITHDRAW'].includes(tx.type) ||
      (tx.note && tx.note.toLowerCase().includes('banco'))
    );

    if (!txs.length) {
      list.innerHTML = '<p class="empty-state">Sin movimientos bancarios.</p>';
      return;
    }

    list.innerHTML = txs.map(tx => {
      const isCredit = tx.to_user === State.user.username || tx.type === 'DEPOSIT';
      const sign     = isCredit ? '+' : '−';
      const cls      = isCredit ? 'tx-row__amount--credit' : 'tx-row__amount--debit';

      return `
        <div class="tx-row">
          <div class="tx-row__meta">
            <span class="tx-row__label">${escHtml(tx.note || tx.type)}</span>
            <span class="tx-row__date">${formatDate(tx.created_at)}</span>
          </div>
          <span class="tx-row__amount ${cls}">${sign}${formatNumber(tx.amount)} NC</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/* ── 17. MIS PEDIDOS ─────────────────────────────────────────────────────── */
async function loadOrders(page = 1) {
  const list = $('orders-list');
  list.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const data = await get(`/orders?page=${page}`);
    const orders = data.orders || [];

    if (!orders.length) {
      list.innerHTML = '<p class="empty-state">Aún no tienes pedidos.</p>';
      return;
    }

    list.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-card__info">
          <span class="order-card__name">${escHtml(o.item_title || o.item_id)}</span>
          <span class="order-card__meta">
            ${o.price_usdt ? `$${o.price_usdt} USDT` : `${formatNumber(o.price_coins)} NC`}
            · ${formatDate(o.created_at)}
          </span>
          ${o.admin_note ? `<span class="order-card__meta" style="color:var(--text-muted);">${escHtml(o.admin_note)}</span>` : ''}
        </div>
        ${statusBadge(o.status)}
      </div>
    `).join('');

    if (data.total) {
      renderPagination('orders-pagination', page, Math.ceil(data.total / 10), p => loadOrders(p));
    }
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/* ── 18. MI PERFIL ───────────────────────────────────────────────────────── */
async function loadProfile() {
  const u = State.user;
  if (!u) return;

  $('profile-card').innerHTML = `
    <div class="profile-avatar">${(u.display_name || u.username || '?')[0].toUpperCase()}</div>
    <div class="profile-info">
      <span class="profile-name">${escHtml(u.display_name || u.username)}</span>
      <span class="profile-meta">@${escHtml(u.username)} · miembro desde ${formatDate(u.created_at).split(',')[0]}</span>
      <div class="profile-badges">
        ${u.linked  ? '<span class="profile-badge profile-badge--linked">✅ Minecraft vinculado</span>' : ''}
        ${u.is_admin ? '<span class="profile-badge profile-badge--admin">⚙ Admin</span>'               : ''}
      </div>
    </div>
  `;

  /* Card de vinculación */
  const linkCard = $('link-status');
  if (u.linked) {
    linkCard.innerHTML = `
      <p style="color:var(--success); font-size:0.88rem;">
        ✅ Cuenta vinculada como <strong>${escHtml(u.display_name || u.username)}</strong>
      </p>
    `;
  } else {
    linkCard.innerHTML = `
      <p style="color:var(--text-secondary); font-size:0.84rem; margin-bottom:14px;">
        Vincula tu cuenta de Minecraft para recibir tus compras en el servidor.
      </p>
      <button class="btn btn-primary" id="btn-generate-link">Generar código de vinculación</button>
      <div id="link-code-result"></div>
    `;
    $('btn-generate-link').addEventListener('click', generateLinkCode);
  }
}

async function generateLinkCode() {
  const btn = $('btn-generate-link');
  btn.disabled = true;

  try {
    const data = await post('/auth/generate-link-code', {});
    const expires = new Date(data.expiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

    $('link-code-result').innerHTML = `
      <div class="link-code-box" style="margin-top:16px;">
        <div>
          <div class="link-code">${data.code}</div>
          <p class="link-expires">Expira a las ${expires} · Escribe <code>/link ${data.code}</code> en el servidor MC</p>
        </div>
      </div>
    `;
    btn.textContent = 'Regenerar código';
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ── 19. ESTADÍSTICAS (admin) ────────────────────────────────────────────── */
async function loadStats() {
  const grid = $('stats-grid');
  grid.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const data  = await get('/admin/stats');
    const stats = data.stats || {};

    const cards = [
      { icon: '👥', value: stats.totalUsers,        label: 'Jugadores registrados' },
      { icon: '🔗', value: stats.linkedUsers,        label: 'Cuentas vinculadas' },
      { icon: '📦', value: stats.storeItems,         label: 'Productos activos' },
      { icon: '📝', value: stats.pendingOrders,      label: 'Pedidos pendientes' },
      { icon: '🚚', value: stats.pendingDeliveries,  label: 'Entregas pendientes' },
      { icon: '💰', value: formatNumber(stats.ncCirculating), label: 'NC en circulación' },
    ];

    grid.innerHTML = cards.map(c => `
      <div class="stat-card">
        <span class="stat-card__icon">${c.icon}</span>
        <span class="stat-card__value">${c.value ?? '—'}</span>
        <span class="stat-card__label">${c.label}</span>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/* ── 20. PEDIDOS USDT (admin) ────────────────────────────────────────────── */
async function loadAdminOrders(page = 1) {
  State.adminOrders.page = page;
  const list = $('admin-orders-list');
  list.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const { status } = State.adminOrders;
    const data = await get(`/admin/orders?status=${status}&page=${page}&limit=15`);
    const orders = data.orders || [];

    if (!orders.length) {
      list.innerHTML = '<p class="empty-state">No hay pedidos con este estado.</p>';
      return;
    }

    list.innerHTML = orders.map(o => `
      <div class="admin-order-card">
        <div class="admin-order-card__info">
          <span class="admin-order-card__user">👤 ${escHtml(o.username)}</span>
          <span class="admin-order-card__item">${escHtml(o.item_title || o.item_id)}${o.price_usdt ? ` · $${o.price_usdt} USDT` : ''}</span>
          <span class="admin-order-card__meta">
            TxID: ${o.txid ? escHtml(o.txid.slice(0, 20)) + '…' : '—'}
            · ${formatDate(o.created_at)}
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${statusBadge(o.status)}
          ${o.status === 'PENDING' ? `
            <button class="btn btn-success btn-sm" data-approve="${o.id}">✓ Aprobar</button>
            <button class="btn btn-danger  btn-sm" data-reject="${o.id}">✕ Rechazar</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    /* Eventos aprobar/rechazar */
    list.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', () => approveOrder(btn.dataset.approve));
    });
    list.querySelectorAll('[data-reject]').forEach(btn => {
      btn.addEventListener('click', () => rejectOrder(btn.dataset.reject));
    });

    if (data.total) {
      renderPagination('admin-orders-pagination', page, Math.ceil(data.total / 15), p => loadAdminOrders(p));
    }
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

async function approveOrder(orderId) {
  try {
    await post(`/admin/orders/${orderId}/approve`, {});
    toast('Pedido aprobado', 'ok');
    loadAdminOrders(State.adminOrders.page);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function rejectOrder(orderId) {
  const note = prompt('Motivo de rechazo (opcional):') ?? '';
  try {
    await post(`/admin/orders/${orderId}/reject`, { note });
    toast('Pedido rechazado', 'info');
    loadAdminOrders(State.adminOrders.page);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function initAdminOrdersTabs() {
  $('admin-orders-tabs').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('admin-orders-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.adminOrders.status = btn.dataset.status;
      State.adminOrders.page   = 1;
      loadAdminOrders();
    });
  });
}

/* ── 21. JUGADORES (admin) ───────────────────────────────────────────────── */
async function loadAdminUsers(search = '') {
  const list = $('admin-users-list');
  list.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const params = new URLSearchParams({ limit: 30, page: 1 });
    if (search) params.set('search', search);

    const data  = await get(`/admin/users?${params}`);
    const users = data.users || [];

    if (!users.length) {
      list.innerHTML = '<p class="empty-state">No se encontraron jugadores.</p>';
      return;
    }

    list.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-row__info">
          <div class="admin-user-row__avatar">${(u.display_name || u.username)[0].toUpperCase()}</div>
          <div>
            <div class="admin-user-row__name">
              ${escHtml(u.display_name || u.username)}
              ${u.is_admin  ? '<span class="profile-badge profile-badge--admin" style="margin-left:6px;">Admin</span>' : ''}
              ${u.linked    ? '<span class="profile-badge profile-badge--linked" style="margin-left:4px;">MC</span>'   : ''}
            </div>
            <div class="admin-user-row__stats">
              💰 ${formatNumber(u.wallet)} NC &nbsp;|&nbsp; 🏦 ${formatNumber(u.bank)} NC
              &nbsp;·&nbsp; activo ${formatDate(u.last_active).split(',')[0]}
            </div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" data-edit-user="${u.id}"
                data-wallet="${u.wallet}" data-bank="${u.bank}" data-name="${escHtml(u.username)}">
          ✏ Editar
        </button>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.addEventListener('click', () => openAdminUserModal(btn));
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function openAdminUserModal(btn) {
  $('admin-user-id').value     = btn.dataset.editUser;
  $('admin-user-wallet').value = btn.dataset.wallet;
  $('admin-user-bank').value   = btn.dataset.bank;
  $('modal-admin-user-title').textContent = `Editar: ${btn.dataset.name}`;
  clearFeedback('admin-user-feedback');
  openModal('modal-admin-user');
}

async function submitAdminUser(e) {
  e.preventDefault();
  const id     = $('admin-user-id').value;
  const wallet = $('admin-user-wallet').value;
  const bank   = $('admin-user-bank').value;
  clearFeedback('admin-user-feedback');

  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;

  try {
    await post(`/admin/users/${id}/wallet`, { wallet: parseInt(wallet), bank: parseInt(bank) });
    closeModal('modal-admin-user');
    toast('Saldo actualizado', 'ok');
    loadAdminUsers($('users-search').value.trim());
  } catch (err) {
    setFeedback('admin-user-feedback', err.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initAdminUsersSearch() {
  let debounce;
  $('users-search').addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadAdminUsers(e.target.value.trim()), 350);
  });
}

/* ── 22. Paginación ──────────────────────────────────────────────────────── */
function renderPagination(containerId, currentPage, totalPages, onPage) {
  const container = $(containerId);
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ''; return; }

  const pages = [];
  const range = 2;
  const start = Math.max(1, currentPage - range);
  const end   = Math.min(totalPages, currentPage + range);

  if (start > 1) pages.push(1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('…');
  if (end < totalPages) pages.push(totalPages);

  container.innerHTML = pages.map(p =>
    p === '…'
      ? `<span class="page-btn" style="cursor:default;">…</span>`
      : `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
  ).join('');

  container.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page, 10)));
  });
}

/* ── 23. Status badge ────────────────────────────────────────────────────── */
function statusBadge(status) {
  const map = {
    PENDING:  { cls: 'status-badge--pending',  label: '⏳ Pendiente'  },
    APPROVED: { cls: 'status-badge--approved', label: '✅ Aprobado'   },
    REJECTED: { cls: 'status-badge--rejected', label: '✕ Rechazado'  },
  };
  const s = map[status] || { cls: '', label: status };
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

/* ── 24. Escape HTML ─────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── 25. Init ────────────────────────────────────────────────────────────── */
async function init() {
  console.log('[Init] Arrancando Nodowa Tienda…');

  /* Restaurar sesión desde localStorage */
  await restoreSession();
  if (State.user) {
    console.log('[Init] Usuario activo:', State.user.username, '| admin:', !!State.user.is_admin);
    await refreshBalance();
  } else {
    console.log('[Init] Sin sesión activa');
  }

  /* Render inicial */
  renderSidebarNav();
  renderTopbar();

  /* Inicializar módulos */
  initModals();
  initAuthModal();
  initCatalogSearch();
  initTransferForm();
  initWalletActionButtons();
  initAdminOrdersTabs();
  initAdminUsersSearch();

  /* Eventos de formularios en modales */
  $('modal-buy-nc-confirm').addEventListener('click', confirmBuyNC);
  $('usdt-form').addEventListener('submit', submitUSDTOrder);
  $('wallet-action-form').addEventListener('submit', submitWalletAction);
  $('admin-user-form').addEventListener('submit', submitAdminUser);

  /* Sección inicial */
  navigateTo('catalog');
}

document.addEventListener('DOMContentLoaded', init);
