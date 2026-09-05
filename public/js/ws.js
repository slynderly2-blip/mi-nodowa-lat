// ── Conector WebSocket Reactivo con Auto-Reconexión ───────────

class RealtimeSocket {
  constructor() {
    this.listeners = new Map();
    this.ws = null;
    this.reconnectTimer = null;
    this.init();
  }

  init() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[WS] Conectado en tiempo real.");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type && this.listeners.has(data.type)) {
            this.listeners.get(data.type).forEach(cb => cb(data));
          }
          if (this.listeners.has("*")) {
            this.listeners.get("*").forEach(cb => cb(data));
          }
        } catch (_) {}
      };

      this.ws.onclose = () => {
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.init();
          }, 3000);
        }
      };
    } catch (_) {}
  }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export const socket = new RealtimeSocket();
