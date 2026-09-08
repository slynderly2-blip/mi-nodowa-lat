// deliveries.js — Buzón de entregas y reportes
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';
// showPurchaseReceipt expuesto por store.js via window.showPurchaseReceipt

// ─── Abre el modal de recibo enriquecido con todos los datos disponibles ──────
function openDeliveryReceipt(d, currentUser) {
  const isDelivered = d.status === "DELIVERED";
  const hasIssue    = d.reportedIssue;

  // Calcular precio legible
  let priceFormatted = "—";
  if (d.priceUsdt && Number(d.priceUsdt) > 0) {
    priceFormatted = `$${Number(d.priceUsdt).toFixed(2)} USDT`;
  } else if (d.priceCoins && Number(d.priceCoins) > 0) {
    priceFormatted = `${Number(d.priceCoins).toLocaleString()} NC`;
  } else if (d.giveCoins && Number(d.giveCoins) > 0) {
    priceFormatted = `${Number(d.giveCoins).toLocaleString()} NC acreditados`;
  }

  const statusLabel = isDelivered
    ? "✅ Entregado"
    : hasIssue
      ? "⚠️ En revisión"
      : "⏳ En cola para entrega";

  const methodLabel = d.paymentMethod || (d.source === "BINANCE_ORDER" ? "Binance USDT" : "Nodocoins (NC)");

  // Usar el modal de recibo existente de la tienda, añadiendo campos extra vía DOM
  if (typeof window.showPurchaseReceipt === "function") {
    window.showPurchaseReceipt({
      player:          d.username || currentUser,
      itemName:        d.itemTitle || "Artículo",
      priceFormatted,
      method:          methodLabel,
      status:          statusLabel,
      date:            new Date(d.createdAt).toLocaleString("es"),
      balanceFormatted: null
    });
  }

  // Enriquecer el modal con campos adicionales que no tiene por defecto
  requestAnimationFrame(() => {
    _injectReceiptExtras(d, priceFormatted, methodLabel);
  });
}

// Inyecta filas extra (comando, método de pago, TXID) en el modal-store-receipt
function _injectReceiptExtras(d, priceFormatted, methodLabel) {
  const box = document.querySelector("#modal-store-receipt .modal-box");
  if (!box) return;

  // Quitar filas extra anteriores para no duplicar
  box.querySelectorAll(".receipt-extra-row").forEach(el => el.remove());

  const receiptInner = box.querySelector("[style*='ecfdf5']");
  if (!receiptInner) return;

  const rows = [];

  // Método de pago
  rows.push({ label: "Método de pago", value: escapeHtml(methodLabel), color: "" });

  // Folio / ID de entrega
  rows.push({ label: "Folio", value: `<span style="font-family:monospace; font-size:0.78rem;">${escapeHtml(String(d.id || "—").slice(-10))}</span>`, color: "" });

  // Comando ejecutado en el servidor
  if (d.command) {
    rows.push({
      label: "Comando ejecutado",
      value: `<code style="font-size:0.75rem; background:#f0fdf4; padding:1px 6px; border-radius:4px; color:#065f46; word-break:break-all;">${escapeHtml(d.command)}</code>`,
      color: "#065f46"
    });
    rows.push({ label: "Estado del comando", value: escapeHtml(d.commandStatus || "Ejecutado en servidor"), color: "var(--emerald)" });
  }

  // TXID Binance si existe
  if (d.txid) {
    rows.push({
      label: "TXID / Referencia",
      value: `<span style="font-family:monospace; font-size:0.75rem; word-break:break-all;">${escapeHtml(d.txid)}</span>`,
      color: ""
    });
  }

  // Nota del admin si existe
  if (d.adminNote) {
    rows.push({ label: "Nota admin", value: escapeHtml(d.adminNote), color: "var(--text-muted)" });
  }

  const rowsHtml = rows.map(r => `
    <div class="receipt-extra-row" style="display:flex; justify-content:space-between; align-items:flex-start; padding:0.35rem 0; border-bottom:1px dashed #a7f3d0; gap:0.5rem;">
      <span style="color:#065f46; font-weight:600; white-space:nowrap; font-size:0.82rem;">${r.label}</span>
      <span style="font-weight:700; color:${r.color || "var(--text)"}; text-align:right; font-size:0.82rem;">${r.value}</span>
    </div>
  `).join("");

  // Insertar antes del último div (el de "saldo restante" / fecha)
  const flexCols = receiptInner.querySelectorAll("[style*='flex-direction: column']");
  const lastFlex = flexCols[flexCols.length - 1];
  if (lastFlex) {
    lastFlex.insertAdjacentHTML("afterbegin", rowsHtml);
  } else {
    receiptInner.insertAdjacentHTML("beforeend", `<div style="display:flex;flex-direction:column;gap:0.4rem;font-size:0.82rem;">${rowsHtml}</div>`);
  }
}

// ─── Carga el buzón del usuario ───────────────────────────────────────────────
export async function loadDeliveries() {
  const { currentUser } = state;
  const container = document.getElementById("deliveries-list");
  const tbody     = document.getElementById("deliveries-tbody");

  if (!currentUser) {
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:0.5rem;">📬</div>
          <h3 style="font-size:1.15rem; font-weight:800; color:var(--text); margin-bottom:0.35rem;">
            Inicia Sesión para ver tu Buzón
          </h3>
          <p style="font-size:0.85rem; max-width:420px; margin:0 auto 1.25rem;">
            Consulta las compras y entregas pendientes de recibir en el servidor de Minecraft Bedrock.
          </p>
          <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-login')">
            Iniciar Sesión con Gamertag
          </button>
        </div>
      `;
    }
    return;
  }

  const loadingMsg = `<div style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</div>`;
  if (container) container.innerHTML = loadingMsg;
  else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</td></tr>`;

  try {
    const res  = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const list = data.deliveries || [];

    if (list.length === 0) {
      const empty = `<div style="text-align:center; color:var(--text-muted); padding:2.5rem 1rem;">No tienes entregas registradas en el buzón.</div>`;
      if (container) container.innerHTML = empty;
      else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes entregas pendientes.</td></tr>`;
      return;
    }

    const rowsHtml = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue    = d.reportedIssue;

      let badgeHtml = isDelivered
        ? `<span class="badge badge-emerald">Entregado</span>`
        : `<span class="badge badge-amber">En Cola</span>`;
      if (hasIssue) badgeHtml = `<span class="badge badge-red">Reportado</span>`;
      if (d.status === "REJECTED") badgeHtml = `<span class="badge" style="background:var(--red-light,#fee2e2);color:var(--red);">Rechazado</span>`;

      // Precio visible en la fila
      let priceDisplay = "—";
      if (d.priceUsdt && Number(d.priceUsdt) > 0) {
        priceDisplay = `<span style="color:var(--amber,#f59e0b); font-weight:700;">$${Number(d.priceUsdt).toFixed(2)} USDT</span>`;
      } else if (d.priceCoins && Number(d.priceCoins) > 0) {
        priceDisplay = `<span style="color:var(--primary); font-weight:700;">${Number(d.priceCoins).toLocaleString()} NC</span>`;
      } else if (d.giveCoins && Number(d.giveCoins) > 0) {
        priceDisplay = `<span style="color:var(--emerald); font-weight:700;">+${Number(d.giveCoins).toLocaleString()} NC</span>`;
      }

      // Serializar para el onclick del botón recibo
      const dEncoded = encodeURIComponent(JSON.stringify(d));

      return `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:0.65rem 0.5rem;">
            <strong>${escapeHtml(d.itemTitle || "Artículo")}</strong>
            ${d.itemCategory ? `<br><span style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(d.itemCategory)}</span>` : ""}
          </td>
          <td style="padding:0.65rem 0.5rem; font-size:0.82rem;">${priceDisplay}</td>
          <td style="padding:0.65rem 0.5rem; font-size:0.82rem; color:var(--text-muted);">
            ${new Date(d.createdAt).toLocaleString("es", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
          </td>
          <td style="padding:0.65rem 0.5rem;">${badgeHtml}</td>
          <td style="padding:0.65rem 0.5rem;">
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="window.__openDeliveryReceipt('${dEncoded}')">🧾 Recibo</button>
              ${hasIssue
                ? `<span style="font-size:0.75rem; color:var(--red); font-weight:700;">En revisión</span>`
                : d.status !== "REJECTED"
                  ? `<button class="btn btn-outline btn-sm" style="color:var(--red);" onclick="window.openReportModal('${escapeHtml(d.id)}')">Reportar</button>`
                  : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    const tableHtml = `
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--border); color:var(--text-muted); font-size:0.78rem; text-transform:uppercase;">
            <th style="padding:0.5rem;">Artículo</th>
            <th style="padding:0.5rem;">Precio</th>
            <th style="padding:0.5rem;">Fecha</th>
            <th style="padding:0.5rem;">Estado</th>
            <th style="padding:0.5rem;">Acción</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    if (container)     container.innerHTML = tableHtml;
    else if (tbody)    tbody.innerHTML     = rowsHtml;

  } catch (err) {
    const errMsg = `<div style="text-align:center; color:var(--red); padding:1.5rem;">Error al cargar entregas</div>`;
    if (container) container.innerHTML = errMsg;
    else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red);">Error al cargar entregas</td></tr>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initDeliveries() {
  const btn = document.getElementById("btn-refresh-deliveries");
  if (btn) btn.onclick = loadDeliveries;

  // Exponer el abridor de recibo enriquecido globalmente
  window.__openDeliveryReceipt = (encoded) => {
    try {
      const d = JSON.parse(decodeURIComponent(encoded));
      openDeliveryReceipt(d, state.currentUser);
    } catch (e) { console.warn("Receipt parse error", e); }
  };

  // Compatibilidad con código antiguo que use __showReceiptFromData
  window.__showReceiptFromData = (dataStr) => {
    try {
      const parsed = JSON.parse(dataStr.replace(/&quot;/g, '"'));
      if (typeof window.showPurchaseReceipt === "function") {
        window.showPurchaseReceipt(parsed);
      }
    } catch (e) {}
  };

  // Formulario de reporte de problema
  const form = document.getElementById("report-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { currentUser } = state;
      const deliveryId = document.getElementById("report-delivery-id").value;
      const note       = document.getElementById("report-note").value.trim();

      try {
        const res  = await fetch("/api/deliveries/report-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryId, username: currentUser, note })
        });
        const data = await res.json();
        if (data.ok) {
          closeModal("modal-report");
          form.reset();
          showToast("Reporte enviado al Administrador.");
          loadDeliveries();
        } else {
          showToast(data.error || "Error al enviar reporte");
        }
      } catch (err) {
        showToast("Error de conexión");
      }
    });
  }
}

export function openReportModal(deliveryId) {
  const el = document.getElementById("report-delivery-id");
  if (el) el.value = deliveryId;
  openModal("modal-report");
}
window.openReportModal = openReportModal;
