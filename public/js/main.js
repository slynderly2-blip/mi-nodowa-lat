// main.js — Orquestador Modular Frontend (ES6)
import { currentUser, userData, setUserData } from './state.js';
import { openModal, closeModal, showToast } from './utils.js';
import { validateCurrentSession, updateAuthUI, initAuthListeners, saveAvatar } from './auth.js';
import { openProfile, initProfileListeners, previewAvatarFile, useMinecraftSkinAvatar, saveFullProfile } from './profile.js';
import { initWS } from './websocket.js';

// Router y navegaciones SPA
import { initRouter, navigateTo } from './router.js';

// Módulos de vistas
import { loadStore, setStoreCategory, setStoreSort, copyServerIp, clearSearch, setSearchTag, startCheckout, renderStore } from './store.js';
import { loadCoinsCenter, createNcListing, cancelNcListing, saveSellerConfig, openBuyP2pNcModal, submitP2pOrder, approveP2pOrder, rejectP2pOrder, viewReceiptImage, startOfficialCoinsCheckout, submitBinanceOrder, switchCoinsTab } from './coins.js';
import { loadUserShop, switchShopSubTab } from './user-shop.js';
import { loadMarket, buyP2PListing, deleteP2PListing, listMyItemP2P } from './market.js';
import { loadTransactions, openQuickTransfer, openBankActionModal, setBankPercentage, claimBankInterest, submitQuickTransfer } from './wallet.js';
import { openChatWith, closeChatMobile, deleteMessage, initChat } from './chat.js';
import { sendFriendRequest, viewOtherPlayerProfile, switchSocialSubTab, setPlayersFilter, clearPlayersSearch, respondFriendRequest, removeFriend, initSocial } from './social.js';
import { openReportModal } from './deliveries.js';
import { loadLeaderboard } from './leaderboard.js';

// ==========================================
// EXPOSICIÓN GLOBAL PARA ATRIBUTOS HTML onclick="..."
// ==========================================
window.openModal              = openModal;
window.closeModal             = closeModal;
window.showToast              = showToast;
window.navigateTo             = navigateTo;

// Perfil & Foto
window.openProfile            = openProfile;
window.previewAvatarFile      = previewAvatarFile;
window.useMinecraftSkinAvatar = useMinecraftSkinAvatar;
window.saveFullProfile        = saveFullProfile;

// Tienda de Productos
window.setStoreCategory       = setStoreCategory;
window.setStoreSort           = setStoreSort;
window.copyServerIp           = copyServerIp;
window.clearSearch            = clearSearch;
window.setSearchTag           = setSearchTag;
window.startCheckout          = startCheckout;
window.renderStore            = renderStore;

// Monedas & Panel de Vendedor P2P
window.loadCoinsCenter        = loadCoinsCenter;
window.createNcListing        = createNcListing;
window.cancelNcListing        = cancelNcListing;
window.saveSellerConfig       = saveSellerConfig;
window.openBuyP2pNcModal      = openBuyP2pNcModal;
window.submitP2pOrder         = submitP2pOrder;
window.approveP2pOrder        = approveP2pOrder;
window.rejectP2pOrder         = rejectP2pOrder;
window.viewReceiptImage       = viewReceiptImage;
window.startOfficialCoinsCheckout = startOfficialCoinsCheckout;
window.submitBinanceOrder     = submitBinanceOrder;
window.switchCoinsTab         = switchCoinsTab;

// Tienda y Panel de Jugador
window.loadUserShop           = loadUserShop;
window.switchShopSubTab       = switchShopSubTab;
window.quickTransferTo        = (username) => {
  openModal('modal-quick-transfer');
  const inp = document.getElementById('transfer-recipient');
  if (inp) inp.value = username;
};

// Mercado P2P
window.loadMarket             = loadMarket;
window.buyP2PListing          = buyP2PListing;
window.deleteP2PListing       = deleteP2PListing;
window.listMyItemP2P          = listMyItemP2P;

// Wallet & Banco
window.openQuickTransfer      = openQuickTransfer;
window.submitQuickTransfer    = submitQuickTransfer;
window.loadTransactions       = loadTransactions;
window.openBankActionModal    = openBankActionModal;
window.setBankPercentage      = setBankPercentage;
window.claimBankInterest      = claimBankInterest;

// Chat & Social
window.openChatWith           = openChatWith;
window.closeChatMobile        = closeChatMobile;
window.deleteMessage          = deleteMessage;
window.sendFriendRequest      = sendFriendRequest;
window.viewOtherPlayerProfile = (uname) => navigateTo(`/${encodeURIComponent(uname)}`);
window.switchSocialSubTab     = switchSocialSubTab;
window.setPlayersFilter       = setPlayersFilter;
window.clearPlayersSearch     = clearPlayersSearch;
window.respondFriendRequest   = respondFriendRequest;
window.removeFriend           = removeFriend;

// Otros
window.openReportModal        = openReportModal;
window.loadLeaderboard        = loadLeaderboard;
window.openProfile            = openProfile;
window.saveAvatar             = saveAvatar;

// Inicialización de la Aplicación
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 [Nodowa] Cliente Web v2.5 Iniciado (Tema Claro & Modular)');

  try {
    // 1. Listeners de autenticación, perfil, social y chat
    initAuthListeners();
    initProfileListeners();
    initSocial();
    initChat();
    console.log('✓ [Auth/Profile/Social/Chat] Listeners registrados');

    // 2. Comprobar sesión activa
    await validateCurrentSession();
    updateAuthUI();
    console.log('✓ [Session] Sesión validada');

    // 3. Inicializar enrutador SPA (/slynderly, /coins, /market, etc.)
    initRouter();
    console.log('✓ [Router] Enrutador SPA activado');

    // 4. WebSocket en tiempo real
    initWS();
    console.log('✓ [WebSocket] Conexión en tiempo real iniciada');
  } catch (err) {
    console.error('❌ [Nodowa] Error durante la inicialización:', err);
  }
});
