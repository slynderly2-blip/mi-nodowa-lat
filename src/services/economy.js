import { db, saveDb } from "../database/index.js";
import { CONFIG } from "../config.js";

export function getOrCreateUser(username) {
  const uname = (username || "").trim().toLowerCase();
  if (!uname) throw new Error("Nombre de usuario requerido");

  if (!db.users[uname]) {
    db.users[uname] = {
      username: uname,
      displayName: username.trim(),
      wallet: 500, // Saldo de bienvenida
      bank: 0,
      linked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveDb();
  }
  return db.users[uname];
}

export function logTransaction(fromUser, toUser, amount, type, note = "") {
  const tx = {
    id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    from: fromUser || "SYSTEM",
    to: toUser || "SYSTEM",
    amount: Math.floor(Number(amount)),
    type,
    note,
    createdAt: new Date().toISOString()
  };
  if (!Array.isArray(db.transactions)) db.transactions = [];
  db.transactions.unshift(tx);
  if (db.transactions.length > 500) db.transactions = db.transactions.slice(0, 500);
  return tx;
}

export function applyDailyBankInterests() {
  const now = new Date();
  let updated = false;

  for (const user of Object.values(db.users)) {
    const bankBalance = Math.floor(user.bank || 0);
    if (bankBalance >= 100) {
      const lastInterest = user.lastInterestDate ? new Date(user.lastInterestDate) : null;
      const hoursDiff = lastInterest ? (now - lastInterest) / (1000 * 60 * 60) : 999;

      if (hoursDiff >= 24) {
        const earned = Math.max(1, Math.floor(bankBalance * CONFIG.DAILY_BANK_INTEREST));
        user.bank += earned;
        user.lastInterestDate = now.toISOString();
        logTransaction("BANK_INTEREST", user.username, earned, "INTEREST", `+1% interés diario bancario (+${earned} NC)`);
        updated = true;
      }
    }
  }

  if (updated) {
    saveDb();
    console.log("[Banco] Intereses diarios aplicados a cuentas bancarias activas.");
  }
}

// Ejecutar revisión de intereses periódicamente (cada 30 minutos)
setInterval(applyDailyBankInterests, 1800000);
