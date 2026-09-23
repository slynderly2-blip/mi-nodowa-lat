/* ═══════════════════════════════════════════════════════════════════
   Nodowa Tienda — app.js
═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── Estado global ─────────────────────────────────────────────── */
const State = {
  user:    null,
  token:   null,
  section: 'catalog',
  balance: { wallet: 0, bank: 0 },
  catalog: { items: [], page: 1, total: 0, category: 'all', search: '' },
  economy: { txFilter: 'all', txPage: 1 },
  adminOrders: { status: 'PENDING', page: 1 },
  inbox:   { unread: 0 },
  adminIssuesBadge: '',
};

/* ── API ────────────────────────────────────────────────────────── */
const API = '/api';

// ── Logger de API ─────────────────────────────────────────────────
// Muestra todas las peticiones y respuestas en la consola del navegador.
// Formato: [API] METHOD /path → status ms | payload (si aplica)
const _apiLog = {
  _t0: {},
  req(method, path, body) {
    const key = `${method}:${path}:${Date.now()}`;
    this._t0[key] = performance.now();
    const payload = body ? ` ← ${JSON.stringify(body).slice(0, 120)}` : '';
    console.groupCollapsed(`%c[API] ${method} ${path}${payload}`, 'color:#7C3AED;font-weight:600');
    if (body) console.log('body:', body);
    console.trace('origin');
    console.groupEnd();
    return key;
  },
  res(key, method, path, status, data, ms) {
    const ok = status >= 200 && status < 300;
    const style = ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600';
    console.log(
      `%c[API] ${method} ${path} → ${status} (${ms}ms)`,
      style,
      ok ? data : { error: data }
    );
    delete this._t0[key];
  },
  err(method, path, err, ms) {
    console.error(`[API] ${method} ${path} → ERROR (${ms}ms)`, err.message);
  }
};

async function req(method, path, body, auth = true) {
  const t0 = performance.now();
  _apiLog.req(method, path, body);

  const headers = { 'Content-Type': 'application/json' };
  if (auth && State.token) headers['Authorization'] = `Bearer ${State.token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  let res, data;
  try {
    res  = await fetch(API + path, opts);
    data = await res.json().catch(() => ({}));
  } catch (fetchErr) {
    _apiLog.err(method, path, fetchErr, Math.round(performance.now() - t0));
    throw fetchErr;
  }

  const ms = Math.round(performance.now() - t0);
  _apiLog.res(null, method, path, res.status, data, ms);

  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
  return data;
}

const GET    = (p, a)    => req('GET',    p, null, a);
const POST   = (p, b, a) => req('POST',   p, b,    a);
const PATCH  = (p, b)    => req('PATCH',  p, b,    true);

/* ── DOM helpers ────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

function setHTML(id, html) { const e = $(id); if (e) e.innerHTML = html; }
function setText(id, txt)  { const e = $(id); if (e) e.textContent = txt; }

function feedback(id, msg, isErr = false) {
  const e = $(id);
  if (!e) return;
  e.textContent = msg;
  e.className = 'form-feedback ' + (isErr ? 'form-feedback--error' : 'form-feedback--ok');
}
function clearFb(id) { const e = $(id); if (e) { e.textContent = ''; e.className = 'form-feedback'; } }

function fmt(n)    { return Number(n || 0).toLocaleString('es'); }
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Avatares SVG ─────────────────────────────────────────────────
// 6 diseños coloridos asignados deterministicamente por username.
// Se usan como fallback cuando no hay foto, o cuando la foto no carga.
const AVATAR_PALETTES = [
  { bg: '#7C3AED', fg: '#fff', accent: '#a78bfa' }, // violeta
  { bg: '#0D9488', fg: '#fff', accent: '#5eead4' }, // teal
  { bg: '#DC2626', fg: '#fff', accent: '#fca5a5' }, // rojo
  { bg: '#D97706', fg: '#fff', accent: '#fcd34d' }, // ámbar
  { bg: '#2563EB', fg: '#fff', accent: '#93c5fd' }, // azul
  { bg: '#059669', fg: '#fff', accent: '#6ee7b7' }, // verde
];

// Patrones SVG para cada índice (0-5)
function _avatarSvgPattern(idx, initial, size) {
  const p = AVATAR_PALETTES[idx];
  const r = size / 2;
  const fs = Math.round(size * 0.4);
  const patterns = [
    // 0 — círculos concéntricos
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <circle cx="${r}" cy="${r}" r="${r*0.65}" fill="none" stroke="${p.accent}" stroke-width="${size*0.07}" opacity="0.7"/>
     <circle cx="${r}" cy="${r}" r="${r*0.35}" fill="none" stroke="${p.accent}" stroke-width="${size*0.07}" opacity="0.5"/>`,
    // 1 — diamante
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <polygon points="${r},${size*0.18} ${size*0.82},${r} ${r},${size*0.82} ${size*0.18},${r}" fill="${p.accent}" opacity="0.45"/>`,
    // 2 — hexágono
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <polygon points="${r},${size*0.1} ${size*0.84},${size*0.27} ${size*0.84},${size*0.73} ${r},${size*0.9} ${size*0.16},${size*0.73} ${size*0.16},${size*0.27}" fill="${p.accent}" opacity="0.4"/>`,
    // 3 — cruz/+
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <rect x="${r*0.6}" y="${size*0.15}" width="${size*0.2}" height="${size*0.7}" rx="${size*0.04}" fill="${p.accent}" opacity="0.55"/>
     <rect x="${size*0.15}" y="${r*0.6}" width="${size*0.7}" height="${size*0.2}" rx="${size*0.04}" fill="${p.accent}" opacity="0.55"/>`,
    // 4 — triángulo
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <polygon points="${r},${size*0.15} ${size*0.85},${size*0.82} ${size*0.15},${size*0.82}" fill="${p.accent}" opacity="0.45"/>`,
    // 5 — estrella
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${p.bg}"/>
     <polygon points="${r},${size*0.12} ${size*0.61},${size*0.38} ${size*0.88},${size*0.38} ${size*0.65},${size*0.58} ${size*0.74},${size*0.86} ${r},${size*0.68} ${size*0.26},${size*0.86} ${size*0.35},${size*0.58} ${size*0.12},${size*0.38} ${size*0.39},${size*0.38}" fill="${p.accent}" opacity="0.5"/>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;border-radius:50%;flex-shrink:0;">
    ${patterns[idx]}
    <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle"
          font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700"
          fill="${p.fg}" opacity="0.92">${initial}</text>
  </svg>`;
}

// Devuelve el índice de avatar (0-5) determinístico para un username
function avatarIndex(name) {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 6;
}

// Genera el SVG inline como data URI para usar en onerror
function avatarFallbackDataUri(name, size) {
  const initial = String(name || '?')[0].toUpperCase();
  const idx     = avatarIndex(name);
  const svg     = _avatarSvgPattern(idx, initial, size);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Componente avatar principal — usa foto si existe, SVG inline si no
function avatar(name, url, size = 40) {
  const initial  = String(name || '?')[0].toUpperCase();
  const idx      = avatarIndex(name);
  const fallback = avatarFallbackDataUri(name, size);

  if (url) {
    // Tiene foto — mostrarla, con fallback al SVG si no carga
    return `<img src="${esc(url)}" alt="${esc(name)}"
               width="${size}" height="${size}"
               style="border-radius:50%;object-fit:cover;display:block;flex-shrink:0;"
               onerror="this.onerror=null;this.src='${fallback.replace(/'/g, "\\'")}'"
            >`;
  }

  // Sin foto — SVG inline directo (sin request de red)
  return _avatarSvgPattern(idx, initial, size);
}

function statusBadge(s) {
  const m = { PENDING: ['badge--pending','Pendiente'], APPROVED: ['badge--approved','Aprobado'], REJECTED: ['badge--rejected','Rechazado'] };
  const [cls, label] = m[s] || ['','—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ── Toast ──────────────────────────────────────────────────────── */
let _tt;
function toast(msg, type = 'info') {
  const e = $('toast');
  e.textContent = msg;
  e.className = `toast toast--${type} show`;
  clearTimeout(_tt);
  _tt = setTimeout(() => e.classList.remove('show'), 3500);
}

/* ── Modales ────────────────────────────────────────────────────── */
function openModal(id)  { const e = $(id); if (e) e.hidden = false; }
function closeModal(id) { const e = $(id); if (e) e.hidden = true;  }

function initModals() {
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => {
      if (e.target === bd) { bd.hidden = true; if (bd.id === 'modal-login') resetLogin(); }
    });
  });
  [['modal-login-close','modal-login'],['modal-buy-nc-close','modal-buy-nc'],
   ['modal-buy-usdt-close','modal-buy-usdt'],['modal-wallet-action-close','modal-wallet-action'],
   ['modal-admin-user-close','modal-admin-user'],['modal-player-profile-close','modal-player-profile'],
  ].forEach(([btn, modal]) => {
    const b = $(btn);
    if (b) b.addEventListener('click', () => { closeModal(modal); if (modal === 'modal-login') resetLogin(); });
  });
  $('modal-buy-nc-cancel')?.addEventListener('click', () => closeModal('modal-buy-nc'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(m => { m.hidden = true; });
  });
}
/* ── Sesión ─────────────────────────────────────────────────────── */
function saveSession(token, user) {
  State.token = token; State.user = user;
  localStorage.setItem('nodowa_token', token);
  localStorage.removeItem('nodowa_pending_code');
}
function clearSession() {
  State.token = null; State.user = null;
  localStorage.removeItem('nodowa_token');
}
function savePending(code, username, expiresAt) {
  localStorage.setItem('nodowa_pending_code', JSON.stringify({ code, username, expiresAt }));
}
function getPending() {
  try {
    const d = JSON.parse(localStorage.getItem('nodowa_pending_code') || 'null');
    if (!d) return null;
    if (new Date(d.expiresAt) < new Date()) { localStorage.removeItem('nodowa_pending_code'); return null; }
    return d;
  } catch { return null; }
}
function parseJwt(t) { try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; } }

async function restoreSession() {
  const token = localStorage.getItem('nodowa_token');
  if (token) {
    const p = parseJwt(token);
    if (p && p.exp * 1000 > Date.now()) {
      State.token = token;
      try { const d = await GET('/auth/me'); State.user = d.user; return; } catch { clearSession(); }
    } else { clearSession(); }
  }
  const pending = getPending();
  if (pending) {
    setTimeout(() => {
      openModal('modal-login');
      showLoginStep2({ code: pending.code, expiresAt: pending.expiresAt, username: pending.username });
    }, 300);
  }
}

/* ── Sidebar ────────────────────────────────────────────────────── */
// Iconos SVG inline (sin emojis)
const ICONS = {
  catalog:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  economy:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M5.5 6.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-2.5 2-2.5 2-2.5.9-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2"/></svg>`,
  orders:        `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><path d="M5 5.5h6M5 8h6M5 10.5h4"/></svg>`,
  profile:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5.5" r="3"/><path d="M1.5 14c0-3 2.9-5 6.5-5s6.5 2 6.5 5"/></svg>`,
  players:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-2.8 2.2-5 5-5h.5"/><circle cx="12.5" cy="10.5" r="3"/><path d="M12.5 9v1.5l1 1"/></svg>`,
  leaderboard:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="8" width="3" height="6.5" rx=".5"/><rect x="6.5" y="4" width="3" height="10.5" rx=".5"/><rect x="12" y="1.5" width="3" height="13" rx=".5"/></svg>`,
  inbox:         `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 6l7 4.5L15 6"/></svg>`,
  stats:         `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12.5l4-4 3 2.5 4-6 3 2"/></svg>`,
  adminOrders:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h8M2 12h6"/><circle cx="13" cy="11" r="2.5"/><path d="M13 9.5v1.5l1 1"/></svg>`,
  adminUsers:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M11 7l1.5 1.5L15 6"/></svg>`,
  adminIssues:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5"/><circle cx="8" cy="11.5" r=".75" fill="currentColor" stroke="none"/></svg>`,
  login:         `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/><path d="M11 11l3-3-3-3M14 8H6"/></svg>`,
  logout:        `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 14h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-3"/><path d="M7 11l-3-3 3-3M4 8h8"/></svg>`,
  admin:         `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5L2 4v4c0 3.3 2.7 5.7 6 6.5 3.3-.8 6-3.2 6-6.5V4z"/></svg>`,
};

function navItem(section, label, active, badge = '') {
  const icon = ICONS[section] || '';
  return `<button class="nav-item${active ? ' active' : ''}" data-section="${section}">
    <span class="nav-icon">${icon}</span>
    <span class="nav-label">${label}</span>
    ${badge ? `<span class="nav-badge">${badge}</span>` : ''}
  </button>`;
}

function renderNav() {
  const nav   = $('sidebar-nav');
  const auth  = !!State.user;
  const admin = auth && State.user.is_admin;
  const s     = State.section;
  const unread = State.inbox.unread > 0 ? State.inbox.unread : '';

  let html = `<span class="nav-section-label">Tienda</span>
    ${navItem('catalog','Catalogo', s==='catalog')}`;

  if (!auth) {
    html += `<div class="nav-divider"></div>
    <span class="nav-section-label">Acceder</span>
    <button class="nav-item" id="nav-login-btn">
      <span class="nav-icon">${ICONS.login}</span>
      <span class="nav-label">Iniciar sesion</span>
    </button>`;
  } else {
    html += `<div class="nav-divider"></div>
    <span class="nav-section-label">Mi cuenta</span>
    ${navItem('profile','Mi Perfil', s==='profile')}
    ${navItem('economy','Economia', s==='economy')}
    ${navItem('orders','Mis Pedidos', s==='orders')}
    ${navItem('inbox','Buzon', s==='inbox', unread)}
    <div class="nav-divider"></div>
    <span class="nav-section-label">Comunidad</span>
    ${navItem('players','Jugadores', s==='players')}
    ${navItem('leaderboard','Ranking', s==='leaderboard')}`;

    if (admin) {
      html += `<div class="nav-divider"></div>
      <span class="nav-section-label">Admin</span>
      ${navItem('stats','Estadisticas', s==='stats')}
      ${navItem('admin-orders','Pedidos USDT', s==='admin-orders')}
      ${navItem('admin-users','Jugadores', s==='admin-users')}
      ${navItem('admin-issues','Reclamos', s==='admin-issues', State.adminIssuesBadge || '')}`;
    }

    html += `<div class="nav-divider"></div>
    <button class="nav-item nav-item--danger" id="nav-logout-btn">
      <span class="nav-icon">${ICONS.logout}</span>
      <span class="nav-label">Cerrar sesion</span>
    </button>`;
  }

  nav.innerHTML = html;
  nav.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => go(b.dataset.section)));
  $('nav-login-btn')?.addEventListener('click', () => openModal('modal-login'));
  $('nav-logout-btn')?.addEventListener('click', doLogout);
}

function renderTopbar() {
  const actions = $('topbar-actions');
  const auth = !!State.user;

  if (!auth) {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" id="tb-login">Iniciar sesion</button>`;
    $('tb-login')?.addEventListener('click', () => openModal('modal-login'));
    return;
  }

  const name = State.user.display_name || State.user.username || '?';
  const av   = State.user.avatar || '';
  const isAdmin = State.user.is_admin;

  actions.innerHTML = `
    <div class="topbar-balance" title="En mano">
      <span class="balance-icon-svg">${ICONS.economy}</span>
      <span id="tb-balance">${fmt(State.balance.wallet)} NC</span>
    </div>
    ${isAdmin ? `<button class="btn btn-secondary btn-sm" id="tb-admin">${ICONS.admin} Admin</button>` : ''}
    <button class="topbar-avatar" id="tb-avatar" title="${esc(name)}" aria-label="Mi perfil">
      ${av ? `<img src="${esc(av)}" alt="${esc(name)}" onerror="this.style.display='none'" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : ''}
      <span class="avatar-initial">${esc(name[0].toUpperCase())}</span>
    </button>`;

  $('tb-avatar')?.addEventListener('click', () => go('profile'));
  $('tb-admin')?.addEventListener('click',  () => go('stats'));
}

/* ── Navegación ─────────────────────────────────────────────────── */
const PRIVATE = new Set(['economy','orders','profile','inbox','stats','admin-orders','admin-users','admin-issues']);
const ADMIN   = new Set(['stats','admin-orders','admin-users','admin-issues']);

function go(sectionId) {
  if (PRIVATE.has(sectionId) && !State.user) { openModal('modal-login'); return; }
  if (ADMIN.has(sectionId) && !State.user?.is_admin) { toast('Acceso restringido', 'error'); return; }

  State.section = sectionId;

  const sec = document.getElementById(`section-${sectionId}`);
  if (!sec) { console.error('Seccion no encontrada:', sectionId); return; }

  setText('topbar-title', sec.dataset.title || sectionId);

  document.querySelectorAll('.content-section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  sec.classList.add('active');
  sec.style.display = 'block';

  document.querySelectorAll('.nav-item[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === sectionId));

  const loaders = {
    'catalog':       loadCatalog,
    'economy':       loadEconomy,
    'orders':        loadOrders,
    'profile':       loadProfile,
    'players':       loadPlayers,
    'leaderboard':   loadLeaderboard,
    'inbox':         loadInbox,
    'stats':         loadStats,
    'admin-orders':  loadAdminOrders,
    'admin-users':   loadAdminUsers,
    'admin-issues':  loadAdminIssues,
  };
  loaders[sectionId]?.();
}

/* ── Auth ───────────────────────────────────────────────────────── */
let _poll = null;

function initAuthModal() {
  $('link-request-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('link-username').value.trim();
    if (!username) return;
    clearFb('link-request-feedback');
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Generando...';
    try {
      const d = await POST('/auth/request-link', { username }, false);
      showLoginStep2(d);
    } catch (err) { feedback('link-request-feedback', err.message, true); }
    finally { btn.disabled = false; btn.textContent = 'Generar codigo'; }
  });

  $('btn-back-step1').addEventListener('click', () => {
    stopPoll();
    $('login-step-2').hidden = true;
    $('login-step-1').hidden = false;
  });

  $('show-admin-login').addEventListener('click', () => {
    $('login-step-1').hidden    = true;
    $('login-admin-panel').hidden = false;
  });
  $('show-link-login').addEventListener('click', () => {
    $('login-admin-panel').hidden = true;
    $('login-step-1').hidden    = false;
  });

  $('admin-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('admin-login-feedback');
    const username = $('admin-login-username').value.trim();
    const password = $('admin-login-password').value;
    const btn = e.submitter; btn.disabled = true;
    try {
      const d = await POST('/auth/admin-login', { username, password }, false);
      saveSession(d.token, d.user);
      closeModal('modal-login'); resetLogin();
      await afterLogin();
      toast(`Bienvenido, ${d.user.display_name || d.user.username}`);
    } catch (err) { feedback('admin-login-feedback', err.message, true); }
    finally { btn.disabled = false; }
  });
}

function showLoginStep2(data) {
  $('login-step-1').hidden = true;
  $('login-step-2').hidden = false;
  setText('modal-link-code', data.code);
  const exp = new Date(data.expiresAt).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
  setText('link-expires-note', `Expira a las ${exp}`);
  setText('link-wait-text', 'Esperando confirmacion...');
  savePending(data.code, data.username, data.expiresAt);
  startPoll(data.code);
}

function startPoll(code) {
  stopPoll();
  _poll = setInterval(async () => {
    try {
      const d = await GET(`/auth/check-link/${code}`, false);
      if (d.status === 'expired') { stopPoll(); setText('link-wait-text', 'Codigo expirado.'); return; }
      if (d.ok && d.status === 'linked') {
        stopPoll();
        localStorage.removeItem('nodowa_pending_code');
        saveSession(d.token, d.user);
        closeModal('modal-login'); resetLogin();
        await afterLogin();
        toast(`Bienvenido, ${d.user.display_name || d.user.username}`);
      }
    } catch { /* silent */ }
  }, 2500);
}

function stopPoll()  { clearInterval(_poll); _poll = null; }

function resetLogin() {
  stopPoll();
  $('login-step-1').hidden    = false;
  $('login-step-2').hidden    = true;
  $('login-admin-panel').hidden = true;
  $('link-username').value    = '';
  clearFb('link-request-feedback');
  clearFb('admin-login-feedback');
}

async function afterLogin() {
  await refreshBalance();
  await fetchUnread();
  renderNav();
  renderTopbar();
  go('catalog');
}

async function doLogout() {
  clearSession();
  State.balance = { wallet: 0, bank: 0 };
  State.inbox.unread = 0;
  renderNav(); renderTopbar();
  go('catalog');
  toast('Sesion cerrada');
}

/* ── Balance ────────────────────────────────────────────────────── */
async function refreshBalance() {
  if (!State.user) return;
  try {
    const d = await GET('/wallet/balance');
    State.balance.wallet = d.wallet ?? 0;
    State.balance.bank   = d.bank   ?? 0;
  } catch { /* silent */ }
}

async function fetchUnread() {
  if (!State.user) return;
  try {
    const d = await GET('/users/inbox/unread');
    State.inbox.unread = d.unread ?? 0;
  } catch { /* silent */ }
}

/* ── CATÁLOGO ───────────────────────────────────────────────────── */
async function loadCatalog() {
  setHTML('items-grid', '<p class="empty-state">Cargando...</p>');
  try {
    const { category, search, page } = State.catalog;
    const p = new URLSearchParams({ page, limit: 24 });
    if (category && category !== 'all') p.set('category', category);
    if (search) p.set('search', search);
    const d = await GET(`/store/items?${p}`, false);
    State.catalog.items = d.items || [];
    State.catalog.total = d.total || d.items?.length || 0;
    const cats = (d.categories || []).map(c => typeof c === 'string' ? c : c.category);
    renderCatalogCats(cats);
    renderCatalogItems();
    renderPagination('catalog-pagination', page, Math.ceil(State.catalog.total / 24), n => { State.catalog.page = n; loadCatalog(); });
  } catch (err) { setHTML('items-grid', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function renderCatalogCats(cats) {
  const all = ['all', ...cats.filter(c => c !== 'all')];
  const labels = { all:'Todos', items:'Items', rangos:'Rangos', monedas:'Monedas', kits:'Kits', pases:'Pases', cosmetics:'Cosmeticos' };
  setHTML('category-filters', all.map(c => `<button class="cat-btn${State.catalog.category === c ? ' active' : ''}" data-cat="${c}">${labels[c] || c}</button>`).join(''));
  $('category-filters').querySelectorAll('.cat-btn').forEach(b => b.addEventListener('click', () => { State.catalog.category = b.dataset.cat; State.catalog.page = 1; loadCatalog(); }));
}

function renderCatalogItems() {
  if (!State.catalog.items.length) {
    setHTML('items-grid', '<p class="empty-state">No hay productos en esta categoria.</p>');
    return;
  }
  setHTML('items-grid', State.catalog.items.map(item => {
    const hasNC   = item.price_coins > 0;
    const hasUSDT = item.price_usdt  > 0;
    return `<article class="item-card" data-id="${esc(item.id)}">
      ${item.badge ? `<span class="item-badge">${esc(item.badge)}</span>` : ''}
      <div class="item-card__name">${esc(item.name)}</div>
      ${item.description ? `<p class="item-card__desc">${esc(item.description)}</p>` : ''}
      <div class="item-card__prices">
        ${hasNC   ? `<span class="price-tag price-tag--nc">${fmt(item.price_coins)} NC</span>` : ''}
        ${hasUSDT ? `<span class="price-tag price-tag--usdt">$${item.price_usdt} USDT</span>`  : ''}
      </div>
      <div class="item-card__actions">
        ${hasNC   ? `<button class="btn btn-primary btn-sm btn-buy-nc" data-id="${esc(item.id)}">Comprar con NC</button>`   : ''}
        ${hasUSDT ? `<button class="btn btn-teal btn-sm btn-buy-usdt"  data-id="${esc(item.id)}">Pagar con USDT</button>`  : ''}
      </div>
    </article>`;
  }).join(''));
  $('items-grid').querySelectorAll('.btn-buy-nc').forEach(b  => b.addEventListener('click', () => openBuyNC(b.dataset.id)));
  $('items-grid').querySelectorAll('.btn-buy-usdt').forEach(b => b.addEventListener('click', () => openBuyUSDT(b.dataset.id)));
}

function initCatalogSearch() {
  let db;
  $('search-input').addEventListener('input', e => {
    clearTimeout(db);
    db = setTimeout(() => { State.catalog.search = e.target.value.trim(); State.catalog.page = 1; loadCatalog(); }, 350);
  });
}

/* ── Compra NC ──────────────────────────────────────────────────── */
let _buyNC = null;
function openBuyNC(id) {
  if (!State.user) { openModal('modal-login'); return; }
  const item = State.catalog.items.find(i => i.id === id);
  if (!item) return;
  _buyNC = id;
  clearFb('buy-nc-feedback');
  setHTML('modal-buy-nc-body', `
    <div class="confirm-row"><span class="confirm-name">${esc(item.name)}</span></div>
    ${item.description ? `<p class="confirm-desc">${esc(item.description)}</p>` : ''}
    <div class="confirm-price">
      <span>Costo</span><span class="price-tag price-tag--nc">${fmt(item.price_coins)} NC</span>
    </div>
    <div class="confirm-balance">
      <span>Tu saldo</span><span>${fmt(State.balance.wallet)} NC</span>
    </div>`);
  openModal('modal-buy-nc');
}
async function confirmBuyNC() {
  if (!_buyNC) return;
  
  // PREVENIR DOBLE CLICK - verificar si ya está procesando
  const btn = $('modal-buy-nc-confirm');
  if (btn.disabled || btn.textContent.includes('Procesando')) return;
  
  // Marcar como procesando INMEDIATAMENTE
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Procesando...';
  
  try {
    await POST('/store/buy-nc', { itemId: _buyNC });
    await refreshBalance(); 
    renderTopbar();
    closeModal('modal-buy-nc'); 
    toast('Compra exitosa'); 
    _buyNC = null;
  } catch (err) { 
    feedback('buy-nc-feedback', err.message, true); 
  } finally { 
    btn.disabled = false; 
    btn.textContent = originalText;
  }
}

/* ── Compra USDT ────────────────────────────────────────────────── */
let _buyUSDT = null;
let _receiptUrl = null; // URL del comprobante ya subido

function openBuyUSDT(id) {
  if (!State.user) { openModal('modal-login'); return; }
  const item = State.catalog.items.find(i => i.id === id);
  if (!item) return;
  _buyUSDT = id;
  _receiptUrl = null;
  clearFb('buy-usdt-feedback');
  $('usdt-txid').value = '';
  // Reset preview
  $('usdt-receipt-preview').style.display = 'none';
  $('usdt-receipt-placeholder').style.display = 'flex';
  $('usdt-receipt').value = '';

  setHTML('modal-buy-usdt-body', `
    <div class="confirm-row"><span class="confirm-name">${esc(item.name)}</span></div>
    ${item.description ? `<p class="confirm-desc">${esc(item.description)}</p>` : ''}
    <div class="confirm-price">
      <span>Total</span><span class="price-tag price-tag--usdt">$${item.price_usdt} USDT</span>
    </div>`);

  // Cargar info de pago (Binance ID + QR) dinámicamente
  loadUSDTPaymentInfo();
  openModal('modal-buy-usdt');
}

async function loadUSDTPaymentInfo() {
  try {
    const d = await GET('/admin/config', false);
    const cfg = d.config || {};
    const binanceId  = cfg.binance_pay_id  || '—';
    const walletType = cfg.binance_wallet   || 'USDT';
    const qrUrl      = cfg.binance_qr_url  || '';

    setHTML('modal-usdt-payment-info', `
      <div class="usdt-payment-info">
        <div class="usdt-payment-info__qr">
          ${qrUrl
            ? `<img src="${esc(qrUrl)}" alt="QR Binance Pay">`
            : `<div class="usdt-payment-info__qr-placeholder">Sin QR</div>`}
        </div>
        <div class="usdt-payment-info__details">
          <div class="usdt-payment-info__label">Envía el pago a</div>
          <div class="usdt-payment-info__value">${esc(walletType)}</div>
          <div class="usdt-payment-info__label" style="margin-top:8px">Binance Pay ID</div>
          <div class="usdt-payment-info__id">${esc(binanceId)}</div>
          <div class="usdt-payment-info__label" style="margin-top:8px;font-size:0.75rem;color:#b45309">
            Luego sube tu comprobante y el TxID abajo.
          </div>
        </div>
      </div>`);
  } catch { /* silencioso — no bloquear el modal si falla */ }
}

function initUSDTReceiptUpload() {
  const area        = $('usdt-receipt-area');
  const input       = $('usdt-receipt');
  const preview     = $('usdt-receipt-preview');
  const placeholder = $('usdt-receipt-placeholder');

  if (!area) return;

  // Click en el área abre el file picker
  area.addEventListener('click', () => input.click());

  // Drag & drop
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleReceiptFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleReceiptFile(input.files[0]);
  });

  function handleReceiptFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

async function submitUSDT(e) {
  e.preventDefault();
  if (!_buyUSDT) return;
  const txid = $('usdt-txid').value.trim();
  clearFb('buy-usdt-feedback');
  const btn = e.submitter; btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    // 1. Subir comprobante si se seleccionó uno
    const fileInput = $('usdt-receipt');
    if (fileInput.files[0]) {
      feedback('buy-usdt-feedback', 'Subiendo comprobante...');
      const formData = new FormData();
      formData.append('receipt', fileInput.files[0]);
      const uploadRes = await fetch('/api/store/upload-receipt', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${State.token}` },
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Error al subir imagen');
      _receiptUrl = uploadData.url;
    }

    // 2. Enviar pedido con txid + receiptImage
    await POST('/store/submit-order', { itemId: _buyUSDT, txid, receiptImage: _receiptUrl || '' });
    closeModal('modal-buy-usdt');
    toast('Pedido enviado. El admin lo revisara pronto.', 'info');
    _buyUSDT = null; _receiptUrl = null;
  } catch (err) {
    feedback('buy-usdt-feedback', err.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar pedido';
  }
}

/* ── ECONOMÍA ───────────────────────────────────────────────────── */
async function loadEconomy() {
  await refreshBalance(); renderTopbar();
  setText('econ-wallet', `${fmt(State.balance.wallet)} NC`);
  setText('econ-bank',   `${fmt(State.balance.bank)} NC`);
  setText('econ-total-label', `Total: ${fmt(State.balance.wallet + State.balance.bank)} NC`);
  loadTx();
}

let _txType = 'all';
async function loadTx(page = 1) {
  State.economy.txPage = page;
  setHTML('tx-list', '<p class="empty-state">Cargando...</p>');
  try {
    const d   = await GET(`/wallet/transactions?page=${page}&limit=20`);
    let txs   = d.transactions || [];
    if (_txType !== 'all') txs = txs.filter(t => t.type && t.type.startsWith(_txType));
    if (!txs.length) { setHTML('tx-list', '<p class="empty-state">Sin transacciones.</p>'); return; }
    setHTML('tx-list', txs.map(tx => {
      const credit = tx.to_user === State.user?.username || ['BONUS','BANK_WITHDRAW'].includes(tx.type);
      return `<div class="tx-row">
        <div class="tx-row__meta">
          <span class="tx-row__label">${esc(tx.note || tx.type)}</span>
          <span class="tx-row__date">${fmtDate(tx.created_at)}</span>
        </div>
        <span class="tx-row__amount ${credit ? 'tx-row__amount--credit' : 'tx-row__amount--debit'}">
          ${credit ? '+' : '-'}${fmt(tx.amount)} NC
        </span>
      </div>`;
    }).join(''));
    if (d.total > 20) renderPagination('tx-pagination', page, Math.ceil(d.total / 20), n => loadTx(n));
  } catch (err) { setHTML('tx-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function initEconomy() {
  $('btn-to-bank')?.addEventListener('click',   () => openWalletAction('deposit'));
  $('btn-from-bank')?.addEventListener('click', () => openWalletAction('withdraw'));

  $('transfer-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('transfer-feedback');
    const to = $('transfer-to').value.trim();
    const am = parseInt($('transfer-amount').value, 10);
    if (!to || !am) return;
    try {
      await POST('/wallet/transfer', { fromUser: State.user.username, toUser: to, amount: am });
      await refreshBalance(); renderTopbar();
      $('transfer-to').value = ''; $('transfer-amount').value = '';
      setText('econ-wallet', `${fmt(State.balance.wallet)} NC`);
      setText('econ-total-label', `Total: ${fmt(State.balance.wallet + State.balance.bank)} NC`);
      feedback('transfer-feedback', `Enviados ${fmt(am)} NC a ${to}`);
      loadTx();
    } catch (err) { feedback('transfer-feedback', err.message, true); }
  });

  // filtros de tipo
  $('tx-type-filter')?.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('tx-type-filter').querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _txType = b.dataset.type;
      loadTx(1);
    });
  });
}

/* ── Modal mover banco ──────────────────────────────────────────── */
let _walletAction = null;
function openWalletAction(action) {
  _walletAction = action;
  clearFb('wallet-action-feedback');
  $('wallet-action-amount').value = '';
  setText('modal-wallet-action-title', action === 'deposit' ? 'Mover al banco' : 'Retirar del banco');
  setText('wallet-action-label', action === 'deposit'
    ? `Cuanto depositar al banco (tienes ${fmt(State.balance.wallet)} NC en mano)`
    : `Cuanto retirar del banco (tienes ${fmt(State.balance.bank)} NC en banco)`);
  openModal('modal-wallet-action');
}
async function submitWalletAction(e) {
  e.preventDefault();
  const amount = parseInt($('wallet-action-amount').value, 10);
  if (!amount || amount < 1) return;
  clearFb('wallet-action-feedback');
  const btn = e.submitter; btn.disabled = true;
  try {
    const ep = _walletAction === 'deposit' ? '/wallet/deposit-bank' : '/wallet/withdraw-bank';
    await POST(ep, { amount });
    await refreshBalance(); renderTopbar();
    closeModal('modal-wallet-action');
    setText('econ-wallet', `${fmt(State.balance.wallet)} NC`);
    setText('econ-bank',   `${fmt(State.balance.bank)} NC`);
    setText('econ-total-label', `Total: ${fmt(State.balance.wallet + State.balance.bank)} NC`);
    toast(`Operacion exitosa`);
    loadTx();
  } catch (err) { feedback('wallet-action-feedback', err.message, true); }
  finally { btn.disabled = false; }
}

/* ── MIS PEDIDOS ────────────────────────────────────────────────── */
async function loadOrders(page = 1) {
  setHTML('orders-list', '<p class="empty-state">Cargando...</p>');
  try {
    const d = await GET(`/orders?page=${page}`);
    const orders = d.orders || [];
    if (!orders.length) { setHTML('orders-list', '<p class="empty-state">Aun no tienes pedidos.</p>'); return; }
    setHTML('orders-list', orders.map(o => `
      <div class="order-card">
        <div class="order-card__info">
          <span class="order-card__name">${esc(o.item_title || o.item_id)}</span>
          <span class="order-card__meta">${o.price_usdt ? `$${o.price_usdt} USDT` : `${fmt(o.price_coins)} NC`} · ${fmtDate(o.created_at)}</span>
          ${o.admin_note ? `<span class="order-card__note">${esc(o.admin_note)}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${statusBadge(o.status)}
          ${o.status === 'APPROVED' ? `<button class="btn btn-ghost btn-sm" style="font-size:0.78rem;color:var(--danger)" data-report-order="${esc(o.id)}" data-report-title="${esc(o.item_title || o.item_id)}">Reportar problema</button>` : ''}
        </div>
      </div>`).join(''));
    document.querySelectorAll('[data-report-order]').forEach(b => b.addEventListener('click', () =>
      openReportIssueModal(b.dataset.reportTitle, null)
    ));
    if (d.total > 10) renderPagination('orders-pagination', page, Math.ceil(d.total / 10), n => loadOrders(n));
  } catch (err) { setHTML('orders-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

/* ── MI PERFIL ──────────────────────────────────────────────────── */
async function loadProfile() {
  const u = State.user;
  if (!u) return;

  const name = u.display_name || u.username;
  setHTML('profile-avatar-card', `
    <div class="profile-avatar-wrap" style="cursor:pointer;position:relative;" id="profile-avatar-clickable" title="Haz clic para cambiar tu foto">
      ${avatar(name, u.avatar, 80)}
      <div style="position:absolute;bottom:0;right:0;background:#7C3AED;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:3px solid white;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
      </div>
    </div>
    <div class="profile-name-big">${esc(name)}</div>
    <div class="profile-username">@${esc(u.username)}</div>
    <div class="profile-stats">
      <div class="profile-stat"><span class="profile-stat__val">${fmt(State.balance.wallet)}</span><span class="profile-stat__label">En mano</span></div>
      <div class="profile-stat"><span class="profile-stat__val">${fmt(State.balance.bank)}</span><span class="profile-stat__label">En banco</span></div>
    </div>
    ${u.linked ? '<div class="profile-linked-badge">Cuenta MC vinculada</div>' : ''}
  `);
  
  // Hacer el avatar clickeable para subir foto
  $('profile-avatar-clickable')?.addEventListener('click', () => {
    $('edit-avatar-file').click();
  });

  setHTML('profile-info-card', `
    <div class="profile-info-row"><span>Usuario</span><strong>${esc(u.username)}</strong></div>
    <div class="profile-info-row"><span>Nombre</span><strong>${esc(name)}</strong></div>
    <div class="profile-info-row"><span>Miembro desde</span><strong>${fmtDate(u.created_at).split(',')[0]}</strong></div>
    <div class="profile-info-row"><span>Ultima actividad</span><strong>${fmtDate(u.last_active)}</strong></div>
    ${u.is_admin ? '<div class="profile-info-row"><span>Rol</span><strong>Administrador</strong></div>' : ''}
  `);

  // prefill edit form
  const dn = $('edit-display-name');
  if (dn) dn.value = u.display_name || '';

  // link status
  if (u.linked) {
    setHTML('link-status', `<p class="link-ok">Vinculado como <strong>${esc(name)}</strong></p>`);
  } else {
    setHTML('link-status', `
      <p class="link-hint">Vincula tu cuenta de Minecraft para recibir tus compras en el servidor.</p>
      <button class="btn btn-primary btn-sm" id="btn-gen-link">Generar codigo de vinculacion</button>
      <div id="link-code-result"></div>`);
    $('btn-gen-link')?.addEventListener('click', genLinkCode);
  }
}

async function genLinkCode() {
  const btn = $('btn-gen-link'); btn.disabled = true;
  try {
    const d = await POST('/auth/generate-link-code', {});
    const exp = new Date(d.expiresAt).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
    setHTML('link-code-result', `
      <div class="link-code-display" style="margin-top:14px">
        <code class="link-command">/link ${esc(d.code)}</code>
      </div>
      <p class="link-expires-note">Expira a las ${exp}</p>`);
    btn.textContent = 'Regenerar codigo';
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
}

function initProfileEdit() {
  // Cuando se selecciona archivo, subirlo automáticamente
  $('edit-avatar-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    clearFb('profile-edit-feedback');
    feedback('profile-edit-feedback', 'Subiendo foto...');
    
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      
      const uploadRes = await fetch('/api/users/profile/upload-avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${State.token}` },
        body: formData
      });
      
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Error al subir la imagen');
      }
      
      const uploadData = await uploadRes.json();
      State.user = uploadData.user;
      saveSession(State.token, uploadData.user);
      
      renderNav(); renderTopbar();
      loadProfile();
      feedback('profile-edit-feedback', '¡Foto actualizada!');
      toast('Foto de perfil actualizada', 'success');
    } catch (err) {
      feedback('profile-edit-feedback', err.message, true);
      toast(err.message, 'error');
    }
  });

  $('profile-edit-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('profile-edit-feedback');
    const display_name = $('edit-display-name').value.trim();
    const btn = e.submitter; btn.disabled = true;
    
    try {
      if (!display_name) {
        feedback('profile-edit-feedback', 'No hay cambios para guardar');
        return;
      }
      
      const body = { display_name };
      const d = await PATCH('/users/profile', body);
      State.user = d.user;
      saveSession(State.token, d.user);
      
      renderNav(); renderTopbar();
      loadProfile();
      feedback('profile-edit-feedback', 'Perfil actualizado');
      toast('Nombre actualizado', 'success');
    } catch (err) { 
      feedback('profile-edit-feedback', err.message, true); 
    } finally { 
      btn.disabled = false; 
    }
  });
}

/* ── JUGADORES ──────────────────────────────────────────────────── */
async function loadPlayers() {
  setHTML('players-results', '<p class="empty-state">Cargando jugadores...</p>');
  const input = $('players-search');
  if (input) input.value = '';
  
  // Cargar todos los jugadores por defecto (usando leaderboard)
  try {
    const d = await GET('/users/leaderboard?limit=50', false);
    const users = d.leaderboard || [];
    if (!users.length) { 
      setHTML('players-results', '<p class="empty-state">No hay jugadores registrados.</p>'); 
      return; 
    }
    renderPlayersList(users);
  } catch (err) { 
    setHTML('players-results', `<p class="empty-state">Error al cargar jugadores: ${esc(err.message)}</p>`); 
  }
}

function renderPlayersList(users) {
  setHTML('players-results', `<div class="players-grid">${users.map(u => `
    <div class="player-card" data-username="${esc(u.username)}">
      <div class="player-card__avatar">${avatar(u.display_name || u.username, u.avatar, 42)}</div>
      <div class="player-card__info">
        <span class="player-card__name">${esc(u.display_name || u.username)}</span>
        <span class="player-card__user">@${esc(u.username)}</span>
      </div>
      <div class="player-card__stats">
        <span>${fmt(u.wallet)} NC</span>
      </div>
    </div>`).join('')}</div>`);
  document.querySelectorAll('.player-card').forEach(c => c.addEventListener('click', () => openPlayerProfile(c.dataset.username)));
}

function initPlayersSearch() {
  let db;
  $('players-search')?.addEventListener('input', e => {
    clearTimeout(db);
    const q = e.target.value.trim();
    if (!q) { 
      loadPlayers(); // Recargar lista completa si se borra la búsqueda
      return; 
    }
    db = setTimeout(() => doSearchPlayers(q), 350);
  });
}

async function doSearchPlayers(q) {
  setHTML('players-results', '<p class="empty-state">Buscando...</p>');
  try {
    const d = await GET(`/users/search?q=${encodeURIComponent(q)}`, false);
    const users = d.users || [];
    if (!users.length) { setHTML('players-results', '<p class="empty-state">Sin resultados.</p>'); return; }
    renderPlayersList(users);
  } catch (err) { setHTML('players-results', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

async function openPlayerProfile(username) {
  setText('modal-player-profile-title', username);
  setHTML('modal-player-profile-body', '<p class="empty-state">Cargando...</p>');
  openModal('modal-player-profile');
  try {
    const d = await GET(`/users/profile/${encodeURIComponent(username)}`, false);
    const u = d.user;
    const name = u.display_name || u.username;
    setHTML('modal-player-profile-body', `
      <div class="modal-player-header">
        ${avatar(name, u.avatar, 60)}
        <div>
          <div class="modal-player-name">${esc(name)}</div>
          <div class="modal-player-user">@${esc(u.username)}</div>
        </div>
      </div>
      <div class="modal-player-stats">
        <div class="modal-player-stat"><span>NC en mano</span><strong>${fmt(u.wallet)}</strong></div>
        <div class="modal-player-stat"><span>NC en banco</span><strong>${fmt(u.bank)}</strong></div>
        <div class="modal-player-stat"><span>Total NC</span><strong>${fmt(u.wallet + u.bank)}</strong></div>
        <div class="modal-player-stat"><span>MC vinculado</span><strong>${u.linked ? 'Si' : 'No'}</strong></div>
      </div>`);
  } catch { setHTML('modal-player-profile-body', '<p class="empty-state">No se pudo cargar el perfil.</p>'); }
}

/* ── LEADERBOARD ────────────────────────────────────────────────── */
async function loadLeaderboard() {
  setHTML('leaderboard-list', '<p class="empty-state">Cargando...</p>');
  try {
    const d = await GET('/users/leaderboard?limit=30', false);
    const lb = d.leaderboard || [];
    if (!lb.length) { setHTML('leaderboard-list', '<p class="empty-state">Sin datos.</p>'); return; }
    setHTML('leaderboard-list', lb.map((u, i) => {
      const name  = u.display_name || u.username;
      const total = (u.wallet || 0) + (u.bank || 0);
      const medal = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
      return `<div class="lb-row${medal ? ' ' + medal : ''}" data-username="${esc(u.username)}">
        <span class="lb-rank">${i + 1}</span>
        <div class="lb-avatar">${avatar(name, u.avatar, 36)}</div>
        <div class="lb-info">
          <span class="lb-name">${esc(name)}</span>
          <span class="lb-user">@${esc(u.username)}</span>
        </div>
        <span class="lb-amount">${fmt(total)} NC</span>
      </div>`;
    }).join(''));
    document.querySelectorAll('.lb-row').forEach(r => r.addEventListener('click', () => openPlayerProfile(r.dataset.username)));
  } catch (err) { setHTML('leaderboard-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

/* ── BUZÓN ──────────────────────────────────────────────────────── */
async function loadInbox(page = 1) {
  setHTML('inbox-list', '<p class="empty-state">Cargando...</p>');
  try {
    const d = await GET(`/users/inbox?page=${page}&limit=20`);
    State.inbox.unread = d.unread ?? 0;
    renderNav(); // actualizar badge
    const msgs = d.messages || [];
    if (!msgs.length) { setHTML('inbox-list', '<p class="empty-state">Buzon vacio.</p>'); return; }
    setHTML('inbox-list', msgs.map(m => `
      <div class="inbox-msg${m.read_at ? '' : ' inbox-msg--unread'}" data-id="${esc(m.id)}">
        <div class="inbox-msg__header">
          <span class="inbox-msg__from">${esc(m.from_user)}</span>
          <span class="inbox-msg__date">${fmtDate(m.created_at)}</span>
        </div>
        ${m.subject ? `<div class="inbox-msg__subject">${esc(m.subject)}</div>` : ''}
        <div class="inbox-msg__body">${esc(m.body || '')}</div>
        ${(m.ref_type === 'DELIVERY' || m.ref_type === 'ORDER') ? `
          <div style="margin-top:6px;">
            <button class="btn btn-ghost btn-sm" style="font-size:0.75rem;color:var(--danger)"
              data-report-inbox="${esc(m.subject || 'Artículo')}" data-report-ref="${esc(m.ref_id || '')}">
              Reportar problema
            </button>
          </div>` : ''}
      </div>`).join(''));
    document.querySelectorAll('.inbox-msg').forEach(m => m.addEventListener('click', async () => {
      if (m.classList.contains('inbox-msg--unread')) {
        m.classList.remove('inbox-msg--unread');
        try { await POST(`/users/inbox/${m.dataset.id}/read`, {}); State.inbox.unread = Math.max(0, State.inbox.unread - 1); renderNav(); } catch { /* silent */ }
      }
    }));
    // Botones reportar en buzón (no propagar al click del mensaje)
    document.querySelectorAll('[data-report-inbox]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      openReportIssueModal(b.dataset.reportInbox, b.dataset.reportRef);
    }));
    if (d.total > 20) renderPagination('inbox-pagination', page, Math.ceil(d.total / 20), n => loadInbox(n));
  } catch (err) { setHTML('inbox-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function initInbox() {
  $('btn-mark-all-read')?.addEventListener('click', async () => {
    try {
      await POST('/users/inbox/read-all', {});
      State.inbox.unread = 0; renderNav();
      document.querySelectorAll('.inbox-msg--unread').forEach(m => m.classList.remove('inbox-msg--unread'));
      toast('Todo marcado como leido');
    } catch (err) { toast(err.message, 'error'); }
  });
}

/* ── Modal reportar problema (usuario) ──────────────────────────── */
function openReportIssueModal(itemTitle, deliveryId) {
  $('report-issue-item-title').value   = itemTitle || '';
  $('report-issue-delivery-id').value  = deliveryId || '';
  $('report-issue-note').value         = '';
  clearFb('report-issue-feedback');
  openModal('modal-report-issue');
}

function initReportIssueModal() {
  $('modal-report-issue-close')?.addEventListener('click', () => closeModal('modal-report-issue'));
  $('report-issue-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('report-issue-feedback');
    const itemTitle  = $('report-issue-item-title').value;
    const deliveryId = $('report-issue-delivery-id').value;
    const note       = $('report-issue-note').value.trim();
    const btn = e.submitter; btn.disabled = true;
    try {
      await POST('/users/report-issue', { itemTitle, deliveryId, note });
      closeModal('modal-report-issue');
      toast('Reclamo enviado. El admin te notificará pronto.', 'info');
    } catch (err) { feedback('report-issue-feedback', err.message, true); }
    finally { btn.disabled = false; }
  });
}

/* ── ADMIN: estadísticas ────────────────────────────────────────── */
async function loadStats() {
  setHTML('stats-grid', '<p class="empty-state">Cargando...</p>');
  try {
    const [statsRes, cfgRes] = await Promise.all([
      GET('/admin/stats'),
      GET('/admin/config'),
    ]);
    const s   = statsRes.stats || {};
    const cfg = cfgRes.config  || {};

    setHTML('stats-grid', [
      ['Jugadores', s.totalUsers],
      ['MC vinculados', s.linkedUsers],
      ['Productos', s.storeItems],
      ['Pedidos pendientes', s.pendingOrders],
      ['Entregas pendientes', s.pendingDeliveries],
      ['NC en circulacion', fmt(s.ncCirculating)],
    ].map(([label, val]) => `
      <div class="stat-card">
        <span class="stat-card__value">${val ?? '—'}</span>
        <span class="stat-card__label">${label}</span>
      </div>`).join(''));

    // Preview config Binance
    const qrUrl     = cfg.binance_qr_url  || '';
    const payId     = cfg.binance_pay_id  || '—';
    const walletTyp = cfg.binance_wallet  || 'USDT';
    setHTML('binance-config-preview', `
      ${qrUrl ? `<img src="${esc(qrUrl)}" alt="QR Binance">` : '<span style="color:var(--text-muted);font-size:0.82rem">Sin QR configurado</span>'}
      <div class="binance-config-preview__info">
        <div>Binance Pay ID: <strong>${esc(payId)}</strong></div>
        <div>Billetera: <strong>${esc(walletTyp)}</strong></div>
      </div>`);

    // Prefill modal config
    $('binance-pay-id-input').value  = cfg.binance_pay_id  || '';
    $('binance-wallet-input').value  = cfg.binance_wallet  || '';
    if (qrUrl) {
      $('binance-qr-preview').src = qrUrl;
      $('binance-qr-preview').style.display = 'block';
      $('binance-qr-placeholder').style.display = 'none';
    }
  } catch (err) { setHTML('stats-grid', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function initBinanceConfig() {
  // Abrir modal
  $('btn-open-binance-config')?.addEventListener('click', () => openModal('modal-binance-config'));
  $('modal-binance-config-close')?.addEventListener('click', () => closeModal('modal-binance-config'));

  // Click en área del QR
  const qrArea    = $('binance-qr-area');
  const qrInput   = $('binance-qr-file');
  const qrPreview = $('binance-qr-preview');
  const qrHolder  = $('binance-qr-placeholder');

  qrArea?.addEventListener('click', () => qrInput.click());
  qrInput?.addEventListener('change', () => {
    const file = qrInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      qrPreview.src = e.target.result;
      qrPreview.style.display = 'block';
      qrHolder.style.display  = 'none';
    };
    reader.readAsDataURL(file);
  });

  // Submit config
  $('binance-config-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('binance-config-feedback');
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      const payId     = $('binance-pay-id-input').value.trim();
      const walletTyp = $('binance-wallet-input').value.trim();

      // Guardar ID y wallet en config
      if (payId)     await POST('/admin/config', { key: 'binance_pay_id', value: payId });
      if (walletTyp) await POST('/admin/config', { key: 'binance_wallet',  value: walletTyp });

      // Subir QR si se seleccionó uno
      if (qrInput.files[0]) {
        feedback('binance-config-feedback', 'Subiendo QR...');
        const fd = new FormData();
        fd.append('qr', qrInput.files[0]);
        const res = await fetch('/api/admin/config/upload-qr', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${State.token}` },
          body: fd
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir QR');
      }

      feedback('binance-config-feedback', 'Configuracion guardada');
      toast('Configuracion de Binance actualizada', 'success');
      closeModal('modal-binance-config');
      loadStats(); // refrescar preview
    } catch (err) {
      feedback('binance-config-feedback', err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar configuración';
    }
  });
}

// Cerrar modal comprobante
function initReceiptModal() {
  $('modal-receipt-view-close')?.addEventListener('click', () => closeModal('modal-receipt-view'));
}

/* ── ADMIN: pedidos USDT ────────────────────────────────────────── */
async function loadAdminOrders(page = 1) {
  State.adminOrders.page = page;
  setHTML('admin-orders-list', '<p class="empty-state">Cargando...</p>');
  try {
    const { status } = State.adminOrders;
    const d = await GET(`/admin/orders?status=${status}&page=${page}&limit=15`);
    const orders = d.orders || [];
    if (!orders.length) { setHTML('admin-orders-list', '<p class="empty-state">Sin pedidos.</p>'); return; }
    setHTML('admin-orders-list', orders.map(o => {
      const receiptHtml = o.receipt_image
        ? `<div class="admin-order-card__receipt">
             <img src="${esc(o.receipt_image)}" alt="Comprobante" data-receipt="${esc(o.receipt_image)}" data-txid="${esc(o.txid || '')}" title="Ver comprobante">
             <button class="btn-view-receipt" data-receipt="${esc(o.receipt_image)}" data-txid="${esc(o.txid || '')}">Ver comprobante completo</button>
           </div>`
        : (o.txid ? `<div class="admin-order-card__receipt"><span style="font-size:0.8rem;color:var(--text-muted)">Sin imagen · TxID: ${esc(o.txid.slice(0,20))}...</span></div>` : '');

      return `<div class="admin-order-card">
        <div class="admin-order-card__info">
          <span class="admin-order-card__user">${esc(o.username)}</span>
          <span class="admin-order-card__item">${esc(o.item_title || o.item_id)}${o.price_usdt ? ` · $${o.price_usdt} USDT` : ''}</span>
          <span class="admin-order-card__meta">${fmtDate(o.created_at)}</span>
          ${o.txid ? `<span class="admin-order-card__meta" style="font-size:0.78rem;word-break:break-all">TxID: ${esc(o.txid)}</span>` : ''}
          ${receiptHtml}
          ${o.admin_note ? `<span class="admin-order-card__note">Nota: ${esc(o.admin_note)}</span>` : ''}
        </div>
        <div class="admin-order-card__actions">
          ${statusBadge(o.status)}
          ${o.status === 'PENDING' ? `
            <button class="btn btn-success btn-sm" data-approve="${esc(o.id)}">Aprobar</button>
            <button class="btn btn-danger btn-sm"  data-reject="${esc(o.id)}">Rechazar</button>` : ''}
        </div>
      </div>`;
    }).join(''));

    // Botones aprobar/rechazar
    document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => approveOrder(b.dataset.approve)));
    document.querySelectorAll('[data-reject]').forEach(b  => b.addEventListener('click', () => rejectOrder(b.dataset.reject)));

    // Ver comprobante
    document.querySelectorAll('[data-receipt]').forEach(el => el.addEventListener('click', () => {
      openReceiptModal(el.dataset.receipt, el.dataset.txid);
    }));

    if (d.total > 15) renderPagination('admin-orders-pagination', page, Math.ceil(d.total / 15), n => loadAdminOrders(n));
  } catch (err) { setHTML('admin-orders-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function openReceiptModal(receiptUrl, txid) {
  setHTML('modal-receipt-view-body', `
    <img src="${esc(receiptUrl)}" alt="Comprobante de pago">
    ${txid ? `<p class="receipt-txid">TxID: ${esc(txid)}</p>` : ''}
  `);
  openModal('modal-receipt-view');
}

async function approveOrder(id) {
  try { await POST(`/admin/orders/${id}/approve`, {}); toast('Pedido aprobado'); loadAdminOrders(State.adminOrders.page); }
  catch (err) { toast(err.message, 'error'); }
}
async function rejectOrder(id) {
  const note = prompt('Motivo de rechazo (opcional):') ?? '';
  try { await POST(`/admin/orders/${id}/reject`, { note }); toast('Pedido rechazado'); loadAdminOrders(State.adminOrders.page); }
  catch (err) { toast(err.message, 'error'); }
}

/* ── ADMIN: reclamos ────────────────────────────────────────────── */
const _adminIssuesState = { status: 'pending', page: 1 };

async function loadAdminIssues(page = 1) {
  _adminIssuesState.page = page;
  setHTML('admin-issues-list', '<p class="empty-state">Cargando...</p>');
  try {
    const d = await GET(`/admin/issues?status=${_adminIssuesState.status}&page=${page}&limit=20`);
    const issues = d.issues || [];

    // Actualizar badge en nav
    if (_adminIssuesState.status === 'pending') {
      State.adminIssuesBadge = d.total > 0 ? d.total : '';
      renderNav();
    }

    if (!issues.length) { setHTML('admin-issues-list', '<p class="empty-state">Sin reclamos.</p>'); return; }

    setHTML('admin-issues-list', issues.map(iss => {
      const isPending = iss.status === 'pending';
      const statusColor = { pending: '#d97706', resolved: '#16a34a', ignored: '#6b7280' }[iss.status] || '';
      return `<div class="admin-order-card" style="border-left:3px solid ${statusColor}">
        <div class="admin-order-card__info">
          <span class="admin-order-card__user">${esc(iss.player)}</span>
          <span class="admin-order-card__item">${esc(iss.item_title)}</span>
          <span class="admin-order-card__meta">${fmtDate(iss.created_at)} · <strong style="color:${statusColor}">${esc(iss.status)}</strong></span>
          ${iss.note ? `<span class="admin-order-card__meta" style="font-style:italic">"${esc(iss.note)}"</span>` : ''}
          ${iss.delivery_id ? `<span class="admin-order-card__meta" style="font-size:0.75rem">Delivery: ${esc(iss.delivery_id)}</span>` : ''}
        </div>
        <div class="admin-order-card__actions">
          ${isPending ? `
            <button class="btn btn-primary btn-sm"  data-requeue="${esc(iss.id)}" title="Crear nueva entrega para este jugador">Reencolar</button>
            <button class="btn btn-teal btn-sm"     data-refund-issue="${esc(iss.id)}" data-refund-player="${esc(iss.player)}" data-refund-item="${esc(iss.item_title)}">Reembolsar</button>
            <button class="btn btn-ghost btn-sm"    data-ignore="${esc(iss.id)}">Ignorar</button>
          ` : ''}
        </div>
      </div>`;
    }).join(''));

    document.querySelectorAll('[data-requeue]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`¿Reencolar entrega para ${b.closest('.admin-order-card').querySelector('.admin-order-card__user').textContent}?`)) return;
      try { await POST(`/admin/issues/${b.dataset.requeue}/requeue`, {}); toast('Reencolado — jugador recibirá el item'); loadAdminIssues(_adminIssuesState.page); }
      catch (e) { toast(e.message, 'error'); }
    }));

    document.querySelectorAll('[data-refund-issue]').forEach(b => b.addEventListener('click', () => {
      $('refund-issue-id').value = b.dataset.refundIssue;
      $('refund-amount').value   = '';
      setText('modal-refund-player', `Jugador: ${b.dataset.refundPlayer} · Item: ${b.dataset.refundItem}`);
      clearFb('refund-feedback');
      openModal('modal-refund');
    }));

    document.querySelectorAll('[data-ignore]').forEach(b => b.addEventListener('click', async () => {
      const note = prompt('Motivo (opcional):') ?? '';
      try { await POST(`/admin/issues/${b.dataset.ignore}/ignore`, { note }); toast('Reclamo ignorado'); loadAdminIssues(_adminIssuesState.page); }
      catch (e) { toast(e.message, 'error'); }
    }));

    if (d.total > 20) renderPagination('admin-issues-pagination', page, Math.ceil(d.total / 20), n => loadAdminIssues(n));
  } catch (err) { setHTML('admin-issues-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function initAdminIssuesTabs() {
  $('admin-issues-tabs')?.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('admin-issues-tabs').querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _adminIssuesState.status = b.dataset.status;
      loadAdminIssues(1);
    });
  });
}

function initRefundModal() {
  $('modal-refund-close')?.addEventListener('click', () => closeModal('modal-refund'));
  $('refund-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFb('refund-feedback');
    const id     = $('refund-issue-id').value;
    const amount = $('refund-amount').value;
    const btn    = e.submitter; btn.disabled = true;
    try {
      await POST(`/admin/issues/${id}/refund`, { amount });
      closeModal('modal-refund');
      toast('Reembolso aplicado');
      loadAdminIssues(_adminIssuesState.page);
    } catch (err) { feedback('refund-feedback', err.message, true); }
    finally { btn.disabled = false; }
  });
}

function initAdminOrdersTabs() {
  $('admin-orders-tabs')?.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('admin-orders-tabs').querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      State.adminOrders.status = b.dataset.status;
      loadAdminOrders(1);
    });
  });
}

/* ── ADMIN: jugadores ───────────────────────────────────────────── */
async function loadAdminUsers(search = '') {
  setHTML('admin-users-list', '<p class="empty-state">Cargando...</p>');
  try {
    const p = new URLSearchParams({ limit: 30, page: 1 });
    if (search) p.set('search', search);
    const d = await GET(`/admin/users?${p}`);
    const users = d.users || [];
    if (!users.length) { setHTML('admin-users-list', '<p class="empty-state">Sin jugadores.</p>'); return; }
    setHTML('admin-users-list', users.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-row__info">
          <div class="admin-user-row__avatar">${avatar(u.display_name || u.username, u.avatar, 36)}</div>
          <div>
            <div class="admin-user-row__name">${esc(u.display_name || u.username)}${u.is_admin ? ' <span class="badge badge--admin">Admin</span>' : ''}${u.linked ? ' <span class="badge badge--linked">MC</span>' : ''}</div>
            <div class="admin-user-row__stats">${fmt(u.wallet)} + ${fmt(u.bank)} NC · ${fmtDate(u.last_active).split(',')[0]}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" data-eu="${esc(u.id)}" data-ew="${u.wallet}" data-eb="${u.bank}" data-en="${esc(u.username)}">Editar</button>
      </div>`).join(''));
    document.querySelectorAll('[data-eu]').forEach(b => b.addEventListener('click', () => openAdminUserModal(b)));
  } catch (err) { setHTML('admin-users-list', `<p class="empty-state">Error: ${esc(err.message)}</p>`); }
}

function openAdminUserModal(btn) {
  $('admin-user-id').value     = btn.dataset.eu;
  $('admin-user-wallet').value = btn.dataset.ew;
  $('admin-user-bank').value   = btn.dataset.eb;
  setText('modal-admin-user-title', `Editar: ${btn.dataset.en}`);
  clearFb('admin-user-feedback');
  openModal('modal-admin-user');
}

async function submitAdminUser(e) {
  e.preventDefault();
  const id = $('admin-user-id').value;
  clearFb('admin-user-feedback');
  const btn = e.submitter; btn.disabled = true;
  try {
    await POST(`/admin/users/${id}/wallet`, { wallet: parseInt($('admin-user-wallet').value), bank: parseInt($('admin-user-bank').value) });
    closeModal('modal-admin-user'); toast('Guardado');
    loadAdminUsers($('admin-users-search').value.trim());
  } catch (err) { feedback('admin-user-feedback', err.message, true); }
  finally { btn.disabled = false; }
}

function initAdminUsersSearch() {
  let db;
  $('admin-users-search')?.addEventListener('input', e => {
    clearTimeout(db);
    db = setTimeout(() => loadAdminUsers(e.target.value.trim()), 350);
  });
}

/* ── Paginación ─────────────────────────────────────────────────── */
function renderPagination(containerId, cur, total, onPage) {
  const c = $(containerId);
  if (!c || total <= 1) { if (c) c.innerHTML = ''; return; }
  const pages = [];
  const start = Math.max(1, cur - 2), end = Math.min(total, cur + 2);
  if (start > 1) pages.push(1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('...');
  if (end < total) pages.push(total);
  c.innerHTML = pages.map(p => p === '...'
    ? `<span class="page-btn page-btn--dot">...</span>`
    : `<button class="page-btn${p === cur ? ' active' : ''}" data-p="${p}">${p}</button>`
  ).join('');
  c.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => onPage(parseInt(b.dataset.p))));
}

/* ── Init ───────────────────────────────────────────────────────── */
async function init() {
  await restoreSession();
  if (State.user) { await Promise.all([refreshBalance(), fetchUnread()]); }

  renderNav();
  renderTopbar();
  initModals();
  initAuthModal();
  initCatalogSearch();
  initEconomy();
  initProfileEdit();
  initPlayersSearch();
  initInbox();
  initAdminOrdersTabs();
  initAdminUsersSearch();
  initAdminIssuesTabs();
  initRefundModal();
  initReportIssueModal();
  initReceiptModal();
  initBinanceConfig();
  initUSDTReceiptUpload();

  $('modal-buy-nc-confirm')?.addEventListener('click', confirmBuyNC);
  $('usdt-form')?.addEventListener('submit', submitUSDT);
  $('wallet-action-form')?.addEventListener('submit', submitWalletAction);
  $('admin-user-form')?.addEventListener('submit', submitAdminUser);

  go('catalog');
}

document.addEventListener('DOMContentLoaded', init);
