import { db } from "../database/index.js";

export function checkAdminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.adminPassword || req.body.adminPassword;
  if (!token || token !== db.config.adminPassword) {
    return res.status(401).json({ ok: false, error: "Acceso no autorizado al panel administrativo." });
  }
  next();
}
