// deliveries.js — Buzón de entregas y reportes
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';
// showPurchaseReceipt is available via window.showPurchaseReceipt (exposed by store.js)

export async function loadDeliveries() {
  const { currentUser } = state;
  const container = document.getElementById("deliveries-list");
  const tbody = document.getElementById("deliveries-tbody");

  if (!currentUser) {
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📬</div>
          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem;">
            Inicia Sesión para ver tu Buzón
          </h3>
          <p style="font-size: 0.85rem; max-width: 420px; margin: 0 auto 1.25rem;">
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

  if (container) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</div>`;
  } else if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</td></tr>`;
  }

  try {
    const res = await fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const list = data.deliveries || [];

    if (list.length === 0) {
      const emptyMsg = `<div style="text-align:center; color:var(--text-muted); padding:2.5rem 1rem;">No tienes entregas registradas en el buzón.</div>`;
      if (container) container.innerHTML = emptyMsg;
      else if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes entregas pendientes en el buzón.</td></tr>`;
      return;
    }

    const rowsHtml = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue = d.reportedIssue;
      let badgeHtml = isDelivered
        ? `<span class="badge badge-emerald">Entregado</span>`
        : `<span class="badge badge-amber">En Cola</span>`;
      if (hasIssue) badgeHtml = `<span class="badge badge-red">Reportado</span>`;

      const receiptData = JSON.stringify({
        folio: d.id || `NDW-DEL-${Date.now().toString().slice(-6)}`,
        player: d.username || currentUser,
        itemName: escapeHtml(d.itemTitle || "Artículo"),
        priceFormatted: d.giveCoins ? `${d.giveCoins.toLocaleString()} NC` : "Acreditado",
        method: "Entrega en Servidor (Minecraft)",
        status: isDelivered ? "Entregado" : (hasIssue ? "En Revisión" : "Listo en Servidor"),
        date: new Date(d.createdAt).toLocaleString()
      }).replace(/"/g, "&quot;");

      return `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 0.65rem 0.5rem;"><strong>${escapeHtml(d.itemTitle || "Artículo")}</strong></td>
          <td style="padding: 0.65rem 0.5rem; font-size:0.82rem; color:var(--text-muted);">${new Date(d.createdAt).toLocaleString()}</td>
          <td style="padding: 0.65rem 0.5rem;">${badgeHtml}</td>
          <td style="padding: 0.65rem 0.5rem;">
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="window.__showReceiptFromData('${receiptData}')">🧾 Recibo</button>
              ${hasIssue
                ? `<span style="font-size:0.75rem; color:var(--red); font-weight:700;">En revisión</span>`
                : `<button class="btn btn-outline btn-sm" style="color:var(--red);" onclick="window.openReportModal('${d.id}')">Reportar</button>`
              }
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (container) {
      container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-size: 0.78rem; text-transform: uppercase;">
              <th style="padding: 0.5rem;">Artículo</th>
              <th style="padding: 0.5rem;">Fecha</th>
              <th style="padding: 0.5rem;">Estado</th>
              <th style="padding: 0.5rem;">Acción</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    } else if (tbody) {
      tbody.innerHTML = rowsHtml;
    }
  } catch (err) {
    const errMsg = `<div style="text-align:center; color:var(--red); padding:1.5rem;">Error al cargar entregas</div>`;
    if (container) container.innerHTML = errMsg;
    else if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--red);">Error al cargar entregas</td></tr>`;
  }
}

export function initDeliveries() {
  const btn = document.getElementById("btn-refresh-deliveries");
  if (btn) btn.onclick = loadDeliveries;

  const form = document.getElementById("report-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { currentUser } = state;
      const deliveryId = document.getElementById("report-delivery-id").value;
      const note = document.getElementById("report-note").value.trim();

      try {
        const res = await fetch("/api/deliveries/report-issue", {
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

  // Helper para mostrar recibo desde data serializada en onclick
  window.__showReceiptFromData = (dataStr) => {
    try {
      const parsed = JSON.parse(dataStr.replace(/&quot;/g, '"'));
      showPurchaseReceipt(parsed);
    } catch (e) {}
  };
}

export function openReportModal(deliveryId) {
  const el = document.getElementById("report-delivery-id");
  if (el) el.value = deliveryId;
  openModal("modal-report");
}
window.openReportModal = openReportModal;

