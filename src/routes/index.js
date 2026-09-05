import { Router } from "express";
import authRoutes from "./auth.routes.js";
import addonRoutes from "./addon.routes.js";
import walletRoutes from "./wallet.routes.js";
import storeRoutes from "./store.routes.js";
import ordersRoutes from "./orders.routes.js";
import marketRoutes from "./market.routes.js";
import deliveriesRoutes from "./deliveries.routes.js";
import playersRoutes from "./players.routes.js";
import adminRoutes from "./admin.routes.js";
import socialRoutes from "./social.routes.js";

const router = Router();

// Montar sub-enrutadores modulares
router.use("/auth", authRoutes);
router.use("/addon", addonRoutes);
router.use("/wallet", walletRoutes);
router.use("/store", storeRoutes);
router.use("/orders", ordersRoutes);
router.use("/market", marketRoutes);
router.use("/deliveries", deliveriesRoutes);
router.use("/players", playersRoutes);
router.use("/admin", adminRoutes);
router.use("/social", socialRoutes);

// Configuración pública (moneda, binance)
router.get("/config", (req, res) => {
  res.json({
    ok: true,
    currencyName: "Nodocoins",
    currencySymbol: "NC",
    binance: {
      payId: "847291039",
      walletAddress: "0x71C...b84F (USDT TRC20 / BEP20)",
      instruction: "Transfiere el monto exacto vía Binance Pay ID o USDT y sube el comprobante.",
      qrImage: "/uploads/default_qr.svg"
    }
  });
});

// Compatibilidad directa para /api/leaderboard
router.get("/leaderboard", (req, res, next) => {
  req.url = "/leaderboard";
  playersRoutes(req, res, next);
});

export default router;
