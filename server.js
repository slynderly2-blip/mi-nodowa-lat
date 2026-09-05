import express from "express";
import http from "http";
import path from "path";
import { CONFIG } from "./src/config.js";
import { initWebSocketServer } from "./src/services/websocket.js";
import { securityHeaders, rateLimiter } from "./src/middleware/security.js";
import apiRoutes from "./src/routes/index.js";

const app = express();
const server = http.createServer(app);

// Inicializar WebSocket en tiempo real
initWebSocketServer(server);

// Middlewares globales
app.use(securityHeaders);
app.use(rateLimiter(180, 60000));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Servir archivos estáticos del frontend
app.use(express.static(CONFIG.PUBLIC_DIR));
app.use("/uploads", express.static(CONFIG.UPLOADS_DIR));

// Montar API multimodular
app.use("/api", apiRoutes);

// Rutas de cliente SPA
app.get("/admin", (req, res) => {
  res.sendFile(path.join(CONFIG.PUBLIC_DIR, "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(CONFIG.PUBLIC_DIR, "index.html"));
});

// Arrancar servidor
server.listen(CONFIG.PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`🚀 Nodowa Network Web v2.0 Iniciada (Arquitectura Multimodular)`);
  console.log(`🌐 Servidor Web: http://localhost:${CONFIG.PORT}`);
  console.log(`👑 Panel Admin:  http://localhost:${CONFIG.PORT}/admin`);
  console.log(`====================================================`);
});
