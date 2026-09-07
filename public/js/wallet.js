// wallet.js — Balance, transacciones, banco e intereses
import { state } from './state.js';
import { showToast, openModal, closeModal } from './utils.js';

// ── Balance ────────────────────────────────────────────────────────────────
export async function loadBalance() {
  const { currentUser } = state;
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/wallet/balance/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok && data.user) {
      state.userData.wallet = data.user.wallet || 0;
      state.userData.bank   = data.user.bank   || 0;
      const { wallet, bank } = state.userData;

      const pill       = document.getElementById("pill-coins");
      const headerCoins= document.getElementById("header-coins-pill");
      const pW         = document.getElementById("profile-wallet-val");
      const pB         = document.getElementById("profile-bank-val");
      const wBal       = document.getElementById("wallet-balance");
      const bBal       = document.getElementById("bank-balance");

      if (pill)        pill.textContent        = `${wallet.toLocaleString()} NC`;
      if (headerCoins) headerCoins.textContent = `${wallet.toLocaleString()} NC`;
      if (pW)          pW.textContent          = `${wallet.toLocaleString()} NC`;
      if (pB)          pB.textContent          = `${bank.toLocaleString()} NC`;
      if (wBal)        wBal.textContent        = `${wallet.toLocaleString()} NC`;
      if (bBal)        bBal.textContent        = `${bank.toLocaleString()} NC`;

      loadBankInterest();
    }
  } catch (err) {
    console.error("Error cargando saldo:", err);
  }
}

// ── Transferencia rápida desde perfil ─────────────────────────────────────
export function openQuickTransfer(toUsername) {
  const { currentUser, userData } = state;
  if (!currentUser) return openModal("modal-login");

  // If called with a username, pre-fill the recipient field
  if (toUsername) {
    const recipientInput = document.getElementById("transfer-recipient");
    if (recipientInput) recipientInput.value = toUsername;

    // Try to populate advanced transfer UI elements if they exist
    const qtName    = document.getElementById("qt-recipient-name");
    const qtDisplay = document.getElementById("qt-recipient-display");
    const qtAvatar  = document.getElementById("qt-recipient-avatar");
    const qtInput   = document.getElementById("qt-recipient-input");
    const qtBalance = document.getElementById("qt-my-balance");

    if (qtName)    qtName.textContent    = toUsername;
    if (qtDisplay) qtDisplay.textContent = toUsername;
    if (qtAvatar)  qtAvatar.src          = `https://mc-heads.net/avatar/${encodeURIComponent(toUsername)}/40`;
    if (qtInput)   qtInput.value         = toUsername;
    if (qtBalance) qtBalance.textContent = `${userData.wallet.toLocaleString()} NC`;

    fetch(`/api/players/profile/${encodeURIComponent(toUsername)}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.user && d.user.avatarUrl && qtAvatar) qtAvatar.src = d.user.avatarUrl; })
      .catch(() => {});
  }

  openModal("modal-quick-transfer");
}

// ── Recibo de transferencia ────────────────────────────────────────────────
export function showTransferReceipt(receipt) {
  const fmt  = n => Number(n).toLocaleString();
  const date = new Date(receipt.date).toLocaleString("es", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });

  document.getElementById("tr-amount").textContent  = `-${fmt(receipt.amount)} NC`;
  document.getElementById("tr-from").textContent    = receipt.from;
  document.getElementById("tr-to").textContent      = receipt.to;
  document.getElementById("tr-balance").textContent = `${fmt(receipt.newBalance)} NC`;
  document.getElementById("tr-date").textContent    = date;
  document.getElementById("tr-txid").textContent    = receipt.txId;

  const noteRow = document.getElementById("tr-note-row");
  const noteEl  = document.getElementById("tr-note");
  if (receipt.note) {
    noteEl.textContent    = receipt.note;
    noteRow.style.display = "flex";
  } else {
    noteRow.style.display = "none";
  }
  openModal("modal-transfer-receipt");
}

// ── Historial de transacciones ─────────────────────────────────────────────
export async function loadTransactions() {
  const { currentUser } = state;
  const listContainer = document.getElementById("wallet-transactions-list");
  const wBal = document.getElementById("wallet-balance-amount");
  const bBal = document.getElementById("bank-balance-amount");

  if (!currentUser) {
    if (wBal) wBal.textContent = "—";
    if (bBal) bBal.textContent = "—";
    if (listContainer) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔐</div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem;">
            Inicia Sesión para ver tu Billetera
          </h3>
          <p style="font-size: 0.85rem; max-width: 400px; margin: 0 auto 1.25rem;">
            Vincula tu Gamertag de Minecraft Bedrock para consultar tu saldo, ganar intereses en el banco y transferir a amigos.
          </p>
          <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-login')">
            Iniciar Sesión con Gamertag
          </button>
        </div>
      `;
    }
    return;
  }

  loadBalance();
  if (!listContainer) return;
  listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">Cargando transacciones...</div>`;

  try {
    const res = await fetch(`/api/wallet/transactions/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const txs  = data.transactions || [];

    if (txs.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes transacciones registradas aún.</div>`;
      return;
    }

    const typeLabel = {
      TRANSFER:       { label: "Transferencia", color: "var(--primary)" },
      STORE_PURCHASE: { label: "Compra Tienda",  color: "var(--red)" },
      P2P_PURCHASE:   { label: "Compra P2P",     color: "var(--red)" },
      BANK_DEPOSIT:   { label: "Depósito Banco", color: "var(--emerald)" },
      BANK_WITHDRAW:  { label: "Retiro Banco",   color: "var(--amber-mid)" },
      INTEREST:       { label: "Interés Banco",  color: "var(--emerald)" },
      BINANCE_CREDIT: { label: "Recarga Binance",color: "var(--emerald)" },
      ADMIN_ADJUST:   { label: "Ajuste Admin",   color: "var(--text-muted)" },
      ADDON_REWARD:   { label: "Recompensa",     color: "var(--emerald)" },
      ADDON_CHARGE:   { label: "Cobro Addon",    color: "var(--red)" },
    };

    const uname = currentUser.toLowerCase();
    const rowsHtml = txs.map(tx => {
      const isIncoming  = (tx.to || "").toLowerCase() === uname;
      const sign        = isIncoming ? "+" : "-";
      const amountColor = isIncoming ? "var(--emerald)" : "var(--red)";
      const info        = typeLabel[tx.type] || { label: tx.type, color: "var(--text-muted)" };
      const date        = new Date(tx.createdAt).toLocaleString("es", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });

      const counterpart = isIncoming
        ? (["SYSTEM","BANK","BANK_INTEREST","BINANCE","ADMIN"].includes(tx.from) ? "" : `de ${tx.from}`)
        : (["SYSTEM","BANK","STORE"].includes(tx.to)   ? "" : `a ${tx.to}`);

      return `<tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 0.6rem 0.4rem;"><span style="font-size:0.75rem; font-weight:700; color:${info.color}; background:${info.color}18; padding:2px 8px; border-radius:999px;">${info.label}</span></td>
        <td style="padding: 0.6rem 0.4rem; font-size:0.85rem; color:var(--text-muted);">${tx.note || "—"}${counterpart ? `<br><span style="font-size:0.75rem;">${counterpart}</span>` : ""}</td>
        <td style="padding: 0.6rem 0.4rem; font-weight:800; color:${amountColor}; white-space:nowrap;">${sign}${tx.amount.toLocaleString()} NC</td>
        <td style="padding: 0.6rem 0.4rem; font-size:0.78rem; color:var(--text-subtle); white-space:nowrap;">${date}</td>
      </tr>`;
    }).join("");

    listContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-size: 0.78rem; text-transform: uppercase;">
            <th style="padding: 0.5rem 0.4rem;">Tipo</th>
            <th style="padding: 0.5rem 0.4rem;">Detalle</th>
            <th style="padding: 0.5rem 0.4rem;">Monto</th>
            <th style="padding: 0.5rem 0.4rem;">Fecha</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  } catch (err) {
    if (listContainer) listContainer.innerHTML = `<div style="text-align:center; color:var(--red); padding:1.5rem;">Error al cargar historial.</div>`;
  }
}

// ── Intereses bancarios ────────────────────────────────────────────────────
export async function loadBankInterest() {
  const { currentUser } = state;
  if (!currentUser) return;
  try {
    const res  = await fetch(`/api/wallet/interest/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    if (data.ok) {
      const estDaily = document.getElementById("interest-estimated-daily");
      const pendVal  = document.getElementById("interest-pending-val");
      const totEarned= document.getElementById("interest-total-earned");
      const btnClaim = document.getElementById("btn-claim-interest");

      if (estDaily)  estDaily.textContent  = `+${(data.estimatedDaily  || 0).toLocaleString()} NC / día`;
      if (pendVal)   pendVal.textContent   = `+${(data.pendingInterest || 0).toLocaleString()} NC`;
      if (totEarned) totEarned.textContent = `${(data.totalEarned      || 0).toLocaleString()} NC`;

      if (btnClaim) {
        if (data.canClaim) {
          btnClaim.disabled     = false;
          btnClaim.textContent  = `🎁 Reclamar +${(data.pendingInterest || 0).toLocaleString()} NC en Intereses`;
          btnClaim.style.opacity= "1";
        } else {
          btnClaim.disabled     = true;
          btnClaim.textContent  = data.pendingInterest > 0
            ? `🎁 Generando intereses (+${data.pendingInterest} NC)`
            : `🎁 Generando intereses (Guarda NC en tu banco)`;
          btnClaim.style.opacity= "0.65";
        }
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar estado de intereses:", e);
  }
}

export async function claimBankInterest() {
  const { currentUser } = state;
  if (!currentUser) return openModal("modal-login");
  const btn = document.getElementById("btn-claim-interest");
  if (btn) btn.disabled = true;

  try {
    const res  = await fetch("/api/wallet/claim-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || `¡Has reclamado +${data.claimed} NC en intereses!`);
      loadBalance();
    } else {
      showToast(data.error || "No hay intereses suficientes para reclamar");
    }
  } catch (e) {
    showToast("Error de conexión al reclamar intereses");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Banco (depositar / retirar) ────────────────────────────────────────────
export function openBankActionModal(type) {
  const { currentUser, userData } = state;
  if (!currentUser) return openModal("modal-login");
  const modal     = document.getElementById("modal-bank-action");
  if (!modal) return;

  const typeInput = document.getElementById("bank-action-type");
  const titleEl   = document.getElementById("bank-modal-title");
  const labelEl   = document.getElementById("bank-modal-label");
  const submitBtn = document.getElementById("btn-bank-submit");
  const walletEl  = document.getElementById("bank-modal-wallet");
  const bankEl    = document.getElementById("bank-modal-bank");
  const amtInput  = document.getElementById("bank-action-amount");

  typeInput.value = type;
  if (walletEl) walletEl.textContent = `${(userData.wallet || 0).toLocaleString()} NC`;
  if (bankEl)   bankEl.textContent   = `${(userData.bank   || 0).toLocaleString()} NC`;

  if (type === "deposit") {
    titleEl.textContent  = "📥 Depositar en Cuenta Bancaria";
    labelEl.textContent  = "Cantidad a Depositar (NC)";
    submitBtn.textContent= "Confirmar Depósito";
    submitBtn.style.background = "linear-gradient(135deg, var(--primary) 0%, #6d28d9 100%)";
  } else {
    titleEl.textContent  = "📤 Retirar a Billetera en Mano";
    labelEl.textContent  = "Cantidad a Retirar (NC)";
    submitBtn.textContent= "Confirmar Retiro";
    submitBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
  }

  amtInput.value = "";
  openModal("modal-bank-action");
  setTimeout(() => amtInput.focus(), 150);
}

export function setBankPercentage(pct) {
  const type = document.getElementById("bank-action-type")?.value || "deposit";
  const max  = type === "deposit" ? (state.userData.wallet || 0) : (state.userData.bank || 0);
  const amt  = Math.floor(max * (pct / 100));
  const input= document.getElementById("bank-action-amount");
  if (input) { input.value = amt; input.focus(); }
}

// ── Inicializar event listeners ────────────────────────────────────────────
export function initWallet() {
  // Formulario banco
  document.getElementById("bank-action-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { currentUser } = state;
    if (!currentUser) return openModal("modal-login");
    const type   = document.getElementById("bank-action-type").value;
    const amount = parseInt(document.getElementById("bank-action-amount").value);
    if (isNaN(amount) || amount <= 0) return showToast("Ingresa un monto válido");

    const endpoint = type === "deposit" ? "/api/wallet/deposit-bank" : "/api/wallet/withdraw-bank";
    try {
      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, amount })
      });
      const data = await res.json();
      if (data.ok) {
        closeModal("modal-bank-action");
        showToast(data.message || "Operación realizada con éxito");
        loadBalance();
      } else {
        showToast(data.error || "Error al procesar operación");
      }
    } catch (err) {
      showToast("Error de conexión");
    }
  });

  // Formulario transferencia rápida
  document.getElementById("quick-transfer-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { currentUser } = state;
    if (!currentUser) return;
    const toUser = document.getElementById("qt-recipient-input").value.trim();
    const amount = parseInt(document.getElementById("qt-amount").value);
    const note   = document.getElementById("qt-note").value.trim();
    if (!toUser || isNaN(amount) || amount <= 0) return showToast("Monto inválido");
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    try {
      const res  = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUser: currentUser, toUser, amount, note })
      });
      const data = await res.json();
      if (data.ok) {
        closeModal("modal-quick-transfer");
        loadBalance();
        if (data.receipt) showTransferReceipt(data.receipt);
        else showToast(data.message || `Transferencia enviada a ${toUser}.`);
      } else {
        showToast(data.error || "Error en la transferencia");
      }
    } catch { showToast("Error de conexión"); }
    finally  { if (btn) btn.disabled = false; }
  });

  // Formulario transferencia directa
  document.getElementById("transfer-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { currentUser } = state;
    if (!currentUser) return openModal("modal-login");
    const toUser = document.getElementById("transfer-to").value.trim();
    const amount = parseInt(document.getElementById("transfer-amount").value);
    const note   = document.getElementById("transfer-note").value.trim();
    if (!toUser || isNaN(amount) || amount <= 0) return showToast("Datos inválidos");
    try {
      const res  = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUser: currentUser, toUser, amount, note })
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("transfer-form").reset();
        loadBalance();
        if (data.receipt) showTransferReceipt(data.receipt);
        else showToast(data.message);
      } else {
        showToast(data.error || "Error en la transferencia");
      }
    } catch (err) { showToast("Error de conexión"); }
  });

  // Exponer globales
  window.openBankActionModal = openBankActionModal;
  window.setBankPercentage   = setBankPercentage;
  window.claimBankInterest   = claimBankInterest;
  window.openQuickTransfer   = openQuickTransfer;
  window.loadTransactions    = loadTransactions;
  window.submitQuickTransfer = submitQuickTransfer;
}

export async function submitQuickTransfer(event) {
  if (event) event.preventDefault();
  const { currentUser } = state;
  if (!currentUser) return openModal("modal-login");

  const toUser = (document.getElementById("transfer-recipient")?.value || document.getElementById("qt-recipient-input")?.value || "").trim();
  const amount = parseInt(document.getElementById("transfer-amount")?.value || document.getElementById("qt-amount")?.value || "0");
  const note   = (document.getElementById("transfer-note")?.value || document.getElementById("qt-note")?.value || "").trim();

  if (!toUser || isNaN(amount) || amount <= 0) return showToast("Por favor ingresa un destinatario y monto válido.");
  if (toUser.toLowerCase() === currentUser.toLowerCase()) return showToast("No puedes transferirte a ti mismo.");

  const btn = event?.submitter || document.querySelector("#form-quick-transfer button[type=submit]");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/wallet/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUser: currentUser, toUser, amount, note })
    });
    const data = await res.json();
    if (data.ok) {
      closeModal("modal-quick-transfer");
      loadBalance();
      if (data.receipt) showTransferReceipt(data.receipt);
      else showToast(data.message || `Transferencia de ${amount.toLocaleString()} NC enviada a ${toUser}.`);
      document.getElementById("form-quick-transfer")?.reset();
    } else {
      showToast(data.error || "Error en la transferencia");
    }
  } catch (err) {
    showToast("Error de conexión");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.submitQuickTransfer = submitQuickTransfer;

