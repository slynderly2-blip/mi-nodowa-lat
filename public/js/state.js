// state.js — Estado global compartido entre todos los módulos

export const state = {
  currentUser: localStorage.getItem("nodowa_user") || null,
  userData: { wallet: 0, bank: 0 },
  storeItems: [],
  selectedItem: null,
  binanceConfig: null,
  pendingAuthCode: null,
  pendingAuthUsername: null,
  pendingSessionToken: localStorage.getItem("nodowa_session_token") || null,
  authCountdownInterval: null,
  authPollingInterval: null,
  currentUserAvatar: localStorage.getItem("nodowa_avatar") || null,
  userProfileData: null
};

// Exportaciones individuales para módulos que las prefieran
export let currentUser = state.currentUser;
export let userData = state.userData;
export let storeItems = state.storeItems;
export let selectedItem = state.selectedItem;
export let binanceConfig = state.binanceConfig;
export let currentUserAvatar = state.currentUserAvatar;

export function setCurrentUser(v) { 
  state.currentUser = v; 
  currentUser = v; 
}

export function setUserData(v) { 
  state.userData = v; 
  userData = v; 
}

export function setStoreItems(v) { 
  state.storeItems = v; 
  storeItems = v; 
}

export function setSelectedItem(v) { 
  state.selectedItem = v; 
  selectedItem = v; 
}

export function setBinanceConfig(v) { 
  state.binanceConfig = v; 
  binanceConfig = v; 
}

export function setCurrentUserAvatar(v) { 
  state.currentUserAvatar = v; 
  currentUserAvatar = v; 
}

export function setUserProfileData(v) {
  state.userProfileData = v;
}
