import { Router } from "express";
import { db, saveDb } from "../database/index.js";
import { getOrCreateUser, logTransaction } from "../services/economy.js";
import { broadcastWs } from "../services/websocket.js";

const router = Router();

// Consultar saldo de billetera y banco
router.get("/balance/:username", (req, res) => {
  const user = getOrCreateUser(req.params.username);
  res.json({
    ok: true,
    user: {
      username: user.displayName || user.username,
      wallet: Math.floor(user.wallet || 0),
      bank: Math.floor(user.bank || 0),
      linked: !!user.linked
    }
  });
});

// Depositar en el banco
router.post("/deposit-bank", (req, res) => {
  const { username, amount } = req.body;
  const numAmount = Math.floor(Number(amount));

  if (!username || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Monto inválido para depósito." });
  }

  const user = getOrCreateUser(username);
  if (user.wallet < numAmount) {
    return res.status(400).json({ ok: false, error: "Saldo insuficiente en tu billetera." });
  }

  user.wallet -= numAmount;
  user.bank = (user.bank || 0) + numAmount;
  logTransaction(user.username, "BANK", numAmount, "BANK_DEPOSIT", "Depósito seguro en cuenta bancaria");
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet, bank: user.bank });
  res.json({ ok: true, message: `Has depositado ${numAmount.toLocaleString()} NC en el banco.`, user });
});

// Retirar del banco a la billetera
router.post("/withdraw-bank", (req, res) => {
  const { username, amount } = req.body;
  const numAmount = Math.floor(Number(amount));

  if (!username || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Monto inválido para retiro." });
  }

  const user = getOrCreateUser(username);
  if ((user.bank || 0) < numAmount) {
    return res.status(400).json({ ok: false, error: "Saldo insuficiente en tu cuenta bancaria." });
  }

  user.bank -= numAmount;
  user.wallet = (user.wallet || 0) + numAmount;
  logTransaction("BANK", user.username, numAmount, "BANK_WITHDRAW", "Retiro bancario a billetera");
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet, bank: user.bank });
  res.json({ ok: true, message: `Has retirado ${numAmount.toLocaleString()} NC a tu billetera.`, user });
});

// Transferir entre jugadores
router.post("/transfer", (req, res) => {
  const { fromUser, toUser, amount, note } = req.body;
  const numAmount = Math.floor(Number(amount));

  if (!fromUser || !toUser || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Datos de transferencia incompletos." });
  }

  if (fromUser.toLowerCase() === toUser.toLowerCase()) {
    return res.status(400).json({ ok: false, error: "No puedes transferirte a ti mismo." });
  }

  const sender = getOrCreateUser(fromUser);
  const receiver = getOrCreateUser(toUser);

  if (sender.wallet < numAmount) {
    return res.status(400).json({ ok: false, error: "Saldo insuficiente en tu billetera." });
  }

  sender.wallet -= numAmount;
  receiver.wallet = (receiver.wallet || 0) + numAmount;

  logTransaction(sender.username, receiver.username, numAmount, "TRANSFER", note || "Transferencia directa");
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: sender.username, wallet: sender.wallet });
  broadcastWs("BALANCE_UPDATE", { username: receiver.username, wallet: receiver.wallet });

  const txId = "TX-" + Date.now().toString(36).toUpperCase();
  res.json({
    ok: true,
    message: `Has enviado ${numAmount.toLocaleString()} NC a ${receiver.displayName || receiver.username}.`,
    receipt: {
      txId,
      from:        sender.displayName   || sender.username,
      to:          receiver.displayName || receiver.username,
      amount:      numAmount,
      note:        note || "",
      newBalance:  Math.floor(sender.wallet),
      date:        new Date().toISOString()
    }
  });
});

// Consultar estado de intereses bancarios
router.get("/interest/:username", (req, res) => {
  const user = getOrCreateUser(req.params.username);
  const bank = Math.floor(user.bank || 0);
  const dailyRatePercent = 2.0; // 2% diario
  const rateRatio = dailyRatePercent / 100;

  const now = Date.now();
  const lastTime = user.lastInterestDate ? new Date(user.lastInterestDate).getTime() : (now - (12 * 3600 * 1000)); // Si es nuevo, dar 12 horas acumuladas
  const hoursElapsed = Math.max(0, (now - lastTime) / (1000 * 60 * 60));

  let pending = 0;
  if (bank >= 20) {
    pending = Math.floor(bank * rateRatio * (hoursElapsed / 24));
  }

  const estimatedDaily = Math.max(0, Math.floor(bank * rateRatio));
  const totalEarned = Math.floor(user.totalInterestEarned || 0);

  res.json({
    ok: true,
    bank,
    dailyRatePercent,
    estimatedDaily,
    pendingInterest: pending,
    totalEarned,
    hoursElapsed: Math.floor(hoursElapsed),
    canClaim: pending >= 1
  });
});

// Reclamar intereses bancarios ganados
router.post("/claim-interest", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: "Usuario requerido." });

  const user = getOrCreateUser(username);
  const bank = Math.floor(user.bank || 0);
  const dailyRatePercent = 2.0;
  const rateRatio = dailyRatePercent / 100;

  const now = Date.now();
  const lastTime = user.lastInterestDate ? new Date(user.lastInterestDate).getTime() : (now - (12 * 3600 * 1000));
  const hoursElapsed = Math.max(0, (now - lastTime) / (1000 * 60 * 60));

  let pending = 0;
  if (bank >= 20) {
    pending = Math.floor(bank * rateRatio * (hoursElapsed / 24));
  }

  if (pending < 1) {
    return res.status(400).json({
      ok: false,
      error: "Aún no tienes intereses suficientes acumulados para reclamar (mínimo 1 NC). ¡Mantén tus monedas en el banco para generar más!"
    });
  }

  user.bank = (user.bank || 0) + pending;
  user.totalInterestEarned = (user.totalInterestEarned || 0) + pending;
  user.lastInterestDate = new Date().toISOString();

  logTransaction("BANK_INTEREST", user.username, pending, "INTEREST", `Rendimiento bancario 2% (+${pending} NC)`);
  saveDb();

  broadcastWs("BALANCE_UPDATE", { username: user.username, wallet: user.wallet, bank: user.bank });

  res.json({
    ok: true,
    message: `¡Has reclamado exitosamente +${pending.toLocaleString()} NC en intereses pasivos!`,
    claimed: pending,
    newBank: user.bank,
    totalEarned: user.totalInterestEarned
  });
});

export default router;

// Historial de transacciones del usuario
router.get("/transactions/:username", (req, res) => {
  const uname = (req.params.username || "").trim().toLowerCase();
  if (!uname) return res.status(400).json({ ok: false, error: "Usuario requerido." });

  const all = Array.isArray(db.transactions) ? db.transactions : [];
  const userTx = all.filter(tx =>
    (tx.from || "").toLowerCase() === uname ||
    (tx.to   || "").toLowerCase() === uname
  ).slice(0, 100); // máximo 100 entradas

  res.json({ ok: true, transactions: userTx });
});
