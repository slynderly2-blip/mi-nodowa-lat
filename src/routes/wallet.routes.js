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

  res.json({ ok: true, message: `Has enviado ${numAmount.toLocaleString()} NC a ${receiver.displayName || receiver.username}.` });
});

// Historial de transacciones de un jugador
router.get("/transactions/:username", (req, res) => {
  const uname = req.params.username.trim().toLowerCase();
  const history = (db.transactions || [])
    .filter(t => t.from?.toLowerCase() === uname || t.to?.toLowerCase() === uname)
    .slice(0, 30);
  res.json({ ok: true, transactions: history });
});

export default router;
