// Cabeceras de seguridad HTTP
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

// Rate Limiting ligero en memoria
const requestCounts = new Map();
export function rateLimiter(maxRequests = 120, windowMs = 60000) {
  return (req, res, next) => {
    // Endpoints exentos para el servidor de Minecraft y websockets
    if (req.path.startsWith("/api/addon") || req.path.startsWith("/api/wallet")) {
      return next();
    }

    const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
    const now = Date.now();
    let record = requestCounts.get(ip);

    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
    } else {
      record.count++;
    }

    requestCounts.set(ip, record);

    if (record.count > maxRequests) {
      return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Intenta de nuevo en un minuto." });
    }
    next();
  };
}
