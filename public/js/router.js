// router.js — Enrutador SPA ligero y rápido
import { loadStore } from './store.js';
import { loadCoinsCenter } from './coins.js';
import { loadUserShop } from './user-shop.js';
import { loadMarket } from './market.js';
import { loadSocial } from './social.js';
import { loadTransactions } from './wallet.js';
import { loadDeliveries } from './deliveries.js';
import { loadLeaderboard } from './leaderboard.js';

const KNOWN_ROUTES = {
  '': 'store',
  'store': 'store',
  'coins': 'coins',
  'market': 'market',
  'social': 'social',
  'wallet': 'wallet',
  'deliveries': 'deliveries',
  'leaderboard': 'leaderboard'
};

export function navigateTo(path, push = true) {
  if (push) {
    window.history.pushState({}, '', path);
  }
  handleCurrentRoute();
}

// Asignar inmediatamente al objeto window
window.navigateTo = navigateTo;

export function handleCurrentRoute() {
  let pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');

  // Soporte para prefijo @ si el usuario lo pone ej. /@slynderly
  if (pathname.startsWith('@')) {
    pathname = pathname.slice(1);
  }

  const tab = KNOWN_ROUTES[pathname.toLowerCase()];

  if (tab) {
    activateTabUI(tab);
    loadTabContent(tab);
  } else if (pathname.length > 0 && !pathname.includes('/') && !pathname.includes('.')) {
    // Es una ruta de tienda personal de usuario ej: /slynderly o /gatifo323
    activateTabUI('user-shop');
    loadUserShop(pathname);
  } else {
    // Fallback a catálogo principal
    activateTabUI('store');
    loadStore();
  }
}

export function activateTabUI(tabName) {
  // 1. Desactivar todos los paneles
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.classList.remove('active');
  });

  // 2. Activar el panel destino
  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // 3. Actualizar botones de navegación desktop
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 4. Actualizar botones móviles
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Scroll suave al inicio
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function loadTabContent(tab) {
  try {
    switch (tab) {
      case 'store':
        loadStore();
        break;
      case 'coins':
        loadCoinsCenter();
        break;
      case 'market':
        loadMarket();
        break;
      case 'social':
        loadSocial();
        break;
      case 'wallet':
        loadTransactions();
        break;
      case 'deliveries':
        loadDeliveries();
        break;
      case 'leaderboard':
        loadLeaderboard();
        break;
    }
  } catch (err) {
    console.error('[Router] Error cargando tab:', tab, err);
  }
}

export function initRouter() {
  window.addEventListener('popstate', () => {
    handleCurrentRoute();
  });

  handleCurrentRoute();
}
