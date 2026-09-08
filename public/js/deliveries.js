// deliveries.js - Buzon de entregas y reportes
import { state } from './state.js';
import { showToast, openModal, closeModal, escapeHtml } from './utils.js';
// showPurchaseReceipt expuesto por store.js via window.showPurchaseReceipt

// --- Badge de mensajes no leidos -------------------------------------------
export async function checkUnreadMessages() {
  const { currentUser } = state;
  if (!currentUser) return;

  try {
    const res  = await fetch(`/api/messages/unread-count/${encodeURIComponent(currentUser)}`);
    const data = await res.json();
    const count = data.count || 0;

    // Badge en la tab del buzon (navegacion desktop)
    const delivTab = document.querySelector('[data-tab="deliveries"]');
    if (delivTab) {
      let badge = delivTab.querySelector(".inbox-badge");
      if (count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "inbox-badge";
          badge.style.cssText = "background:var(--red,#ef4444); color:#fff; border-radius:9999px; padding:1px 6px; font-size:0.65rem; font-weight:800; margin-left:4px; vertical-align:middle;";
          delivTab.appendChild(badge);
        }
        badge.textContent = count > 9 ? "9+" : count;
        badge.style.display = "inline";
      } else if (badge) {
        badge.style.display = "none";
      }
    }

    // Badge en la nav movil si existe
    const mobileDelivBtn = document.querySelector('[data-tab="deliveries"].mobile-nav-btn');
    if (mobileDelivBtn) {
      let mbadge = mobileDelivBtn.querySelector(".inbox-badge");
      if (count > 0) {
        if (!mbadge) {
          mbadge = document.createElement("span");
          mbadge.className = "inbox-badge";
          mbadge.style.cssText = "position:absolute; top:2px; right:2px; background:var(--red,#ef4444); color:#fff; border-radius:9999px; padding:0 4px; font-size:0.6rem; font-weight:800;";
          mobileDelivBtn.style.position = "relative";
          mobileDelivBtn.appendChild(mbadge);
        }
        mbadge.textContent = count > 9 ? "9+" : count;
      } else if (mbadge) {
        mbadge.style.display = "none";
      }
    }
  } catch (e) { /* silencioso */ }
}

// --- Modal de recibo enriquecido -------------------------------------------
function openDeliveryReceipt(d, currentUser) {
  const isDelivered = d.status === "DELIVERED";
  const hasIssue    = d.reportedIssue;

  let priceFormatted = "-";
  if (d.priceUsdt && Number(d.priceUsdt) > 0) {
    priceFormatted = `$${Number(d.priceUsdt).toFixed(2)} USDT`;
  } else if (d.priceCoins && Number(d.priceCoins) > 0) {
    priceFormatted = `${Number(d.priceCoins).toLocaleString()} NC`;
  } else if (d.giveCoins && Number(d.giveCoins) > 0) {
    priceFormatted = `${Number(d.giveCoins).toLocaleString()} NC acreditados`;
  }

  const statusLabel = isDelivered ? "Entregado" : hasIssue ? "En revision" : "En cola para entrega";
  const methodLabel = d.paymentMethod || (d.source === "BINANCE_ORDER" ? "Binance USDT" : "Nodocoins (NC)");

  if (typeof window.showPurchaseReceipt === "function") {
    window.showPurchaseReceipt({
      player: d.username || currentUser,
      itemName: d.itemTitle || "Articulo",
      priceFormatted,
      method: methodLabel,
      status: statusLabel,
      date: new Date(d.createdAt).toLocaleString("es"),
      balanceFormatted: null
    });
  }

  requestAnimationFrame(() => { _injectReceiptExtras(d, priceFormatted, methodLabel); });
}

function _injectReceiptExtras(d, priceFormatted, methodLabel) {
  const box = document.querySelector("#modal-store-receipt .modal-box");
  if (!box) return;

  box.querySelectorAll(".receipt-extra-row").forEach(el => el.remove());

  const receiptInner = box.querySelector("[style*='ecfdf5']");
  if (!receiptInner) return;

  const rows = [];
  rows.push({ label: "Metodo de pago", value: escapeHtml(methodLabel) });
  rows.push({ label: "Folio",          value: `<span style="font-family:monospace; font-size:0.78rem;">${escapeHtml(String(d.id || "-").slice(-10))}</span>` });

  if (d.command) {
    rows.push({ label: "Comando ejecutado", value: `<code style="font-size:0.75rem; background:#f0fdf4; padding:1px 6px; border-radius:4px; color:#065f46; word-break:break-all;">${escapeHtml(d.command)}</code>`, color: "#065f46" });
    rows.push({ label: "Estado del comando", value: escapeHtml(d.commandStatus || "Ejecutado en servidor"), color: "var(--emerald)" });
  }
  if (d.txid)      rows.push({ label: "TXID / Referencia", value: `<span style="font-family:monospace; font-size:0.75rem; word-break:break-all;">${escapeHtml(d.txid)}</span>` });
  if (d.adminNote) rows.push({ label: "Nota admin", value: escapeHtml(d.adminNote), color: "var(--text-muted)" });

  const rowsHtml = rows.map(r => `
    <div class="receipt-extra-row" style="display:flex; justify-content:space-between; align-items:flex-start; padding:0.35rem 0; border-bottom:1px dashed #a7f3d0; gap:0.5rem;">
      <span style="color:#065f46; font-weight:600; white-space:nowrap; font-size:0.82rem;">${r.label}</span>
      <span style="font-weight:700; color:${r.color || "var(--text)"}; text-align:right; font-size:0.82rem;">${r.value}</span>
    </div>
  `).join("");

  const flexCols = receiptInner.querySelectorAll("[style*='flex-direction: column']");
  const lastFlex = flexCols[flexCols.length - 1];
  if (lastFlex) lastFlex.insertAdjacentHTML("afterbegin", rowsHtml);
  else receiptInner.insertAdjacentHTML("beforeend", `<div style="display:flex;flex-direction:column;gap:0.4rem;font-size:0.82rem;">${rowsHtml}</div>`);
}

// --- Tarjeta de mensaje del admin ------------------------------------------
function renderAdminMessage(msg) {
  const isRead = !!msg.readAt;
  const fecha  = new Date(msg.createdAt).toLocaleString("es", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });

  const accionLabels = {
    redeliver: "Producto re-encolado",
    resolve:   "Reclamo resuelto",
    refund:    "Reembolso aplicado",
    approve:   "Orden aprobada",
    reject:    "Orden rechazada"
  };
  const accionBadge = msg.action && accionLabels[msg.action]
    ? `<span style="display:inline-block; margin-bottom:0.35rem; font-size:0.72rem; font-weight:800; background:var(--primary-light,#ede9fe); color:var(--primary); padding:2px 8px; border-radius:999px;">${accionLabels[msg.action]}</span><br>`
    : "";

  const bgStyle     = isRead ? "var(--card)" : "linear-gradient(135deg,#1e1b4b 0%,#1a1a3e 100%)";
  const borderStyle = isRead ? "1px solid var(--border)" : "1px solid #6366f1";
  const titleColor  = isRead ? "var(--text)" : "#a5b4fc";
  const newBadge    = !isRead ? `<span style="position:absolute; top:0.6rem; right:0.75rem; background:var(--primary); color:#fff; font-size:0.65rem; font-weight:800; padding:1px 6px; border-radius:999px;">NUEVO</span>` : "";

  return `
    <div class="admin-msg-card" data-msg-id="${escapeHtml(msg.id)}"
      style="background:${bgStyle}; border:${borderStyle}; border-radius:var(--radius-md,10px); padding:0.85rem 1rem; margin-bottom:0.6rem; position:relative;">
      ${newBadge}
      <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.35rem;">
        <span>&#128235;</span>
        <strong style="font-size:0.88rem; color:${titleColor};">${escapeHtml(msg.subject || "Mensaje del Administrador")}</strong>
      </div>
      ${accionBadge}
      <p style="font-size:0.83rem; color:var(--text-muted); margin:0 0 0.4rem; line-height:1.5;">${escapeHtml(msg.body || "")}</p>
      <span style="font-size:0.72rem; color:var(--text-subtle,#555);">Admin &middot; ${fecha}</span>
    </div>
  `;
}

// --- Carga el buzon del usuario --------------------------------------------
export async function loadDeliveries() {
  const { currentUser } = state;
  const container = document.getElementById("deliveries-list");
  const tbody     = document.getElementById("deliveries-tbody");

  if (!currentUser) {
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:0.5rem;">&#128236;</div>
          <h3 style="font-size:1.15rem; font-weight:800; color:var(--text); margin-bottom:0.35rem;">Inicia Sesion para ver tu Buzon</h3>
          <p style="font-size:0.85rem; max-width:420px; margin:0 auto 1.25rem;">Consulta las compras y entregas pendientes de recibir en el servidor de Minecraft Bedrock.</p>
          <button class="btn btn-primary btn-sm" onclick="window.openModal('modal-login')">Iniciar Sesion con Gamertag</button>
        </div>
      `;
    }
    return;
  }

  const loadingMsg = `<div style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando entregas...</div>`;
  if (container) container.innerHTML = loadingMsg;
  else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">Cargando...</td></tr>`;

  try {
    const [delivRes, msgRes] = await Promise.all([
      fetch(`/api/deliveries?username=${encodeURIComponent(currentUser)}`),
      fetch(`/api/messages/${encodeURIComponent(currentUser)}`)
    ]);
    const delivData = await delivRes.json();
    const msgData   = await msgRes.json();

    const list     = delivData.deliveries || [];
    const messages = msgData.messages     || [];

    // Marcar como leidos y limpiar badge
    if (messages.some(m => !m.readAt)) {
      fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser })
      }).catch(() => {});
      document.querySelectorAll(".inbox-badge").forEach(b => b.style.display = "none");
    }

    // Indexar mensajes por refId
    const msgByRef   = {};
    const globalMsgs = [];
    for (const m of messages) {
      if (m.refId) {
        if (!msgByRef[m.refId]) msgByRef[m.refId] = [];
        msgByRef[m.refId].push(m);
      } else {
        globalMsgs.push(m);
      }
    }

    if (list.length === 0 && messages.length === 0) {
      const empty = `<div style="text-align:center; color:var(--text-muted); padding:2.5rem 1rem;">No tienes entregas registradas en el buzon.</div>`;
      if (container) container.innerHTML = empty;
      else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">No tienes entregas pendientes.</td></tr>`;
      return;
    }

    // Mensajes globales (sin entrega relacionada)
    let globalMsgsHtml = "";
    if (globalMsgs.length > 0) {
      globalMsgsHtml = `
        <div style="margin-bottom:1.25rem;">
          <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:var(--primary); margin-bottom:0.5rem;">Mensajes del Administrador</div>
          ${globalMsgs.map(renderAdminMessage).join("")}
        </div>
      `;
    }

    const rowsHtml = list.map(d => {
      const isDelivered = d.status === "DELIVERED";
      const hasIssue    = d.reportedIssue;

      let badgeHtml = isDelivered
        ? `<span class="badge badge-emerald">Entregado</span>`
        : `<span class="badge badge-amber">En Cola</span>`;
      if (hasIssue)              badgeHtml = `<span class="badge badge-red">Reportado</span>`;
      if (d.status === "REJECTED") badgeHtml = `<span class="badge" style="background:#fee2e2;color:var(--red);">Rechazado</span>`;
      if (d.status === "REFUNDED") badgeHtml = `<span class="badge" style="background:#ede9fe;color:#7c3aed;">Reembolsado</span>`;

      let priceDisplay = "-";
      if (d.priceUsdt && Number(d.priceUsdt) > 0)
        priceDisplay = `<span style="color:#f59e0b; font-weight:700;">$${Number(d.priceUsdt).toFixed(2)} USDT</span>`;
      else if (d.priceCoins && Number(d.priceCoins) > 0)
        priceDisplay = `<span style="color:var(--primary); font-weight:700;">${Number(d.priceCoins).toLocaleString()} NC</span>`;
      else if (d.giveCoins && Number(d.giveCoins) > 0)
        priceDisplay = `<span style="color:var(--emerald); font-weight:700;">+${Number(d.giveCoins).toLocaleString()} NC</span>`;

      const dEncoded   = encodeURIComponent(JSON.stringify(d));
      const linkedMsgs = msgByRef[d.id] || [];

      const linkedMsgsHtml = linkedMsgs.length > 0
        ? `<tr><td colspan="5" style="padding:0 0.5rem 0.75rem; border-bottom:1px solid var(--border);">
            ${linkedMsgs.map(renderAdminMessage).join("")}
          </td></tr>`
        : "";

      return `
        <tr style="border-bottom:${linkedMsgs.length ? "none" : "1px solid var(--border)"};">
          <td style="padding:0.65rem 0.5rem;">
            <strong>${escapeHtml(d.itemTitle || "Articulo")}</strong>
            ${d.itemCategory ? `<br><span style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(d.itemCategory)}</span>` : ""}
          </td>
          <td style="padding:0.65rem 0.5rem; font-size:0.82rem;">${priceDisplay}</td>
          <td style="padding:0.65rem 0.5rem; font-size:0.82rem; color:var(--text-muted);">
            ${new Date(d.createdAt).toLocaleString("es", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
          </td>
          <td style="padding:0.65rem 0.5rem;">${badgeHtml}</td>
          <td style="padding:0.65rem 0.5rem;">
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="window.__openDeliveryReceipt('${dEncoded}')">&#129534; Recibo</button>
              ${hasIssue
                ? `<span style="font-size:0.75rem; color:var(--red); font-weight:700;">En revision</span>`
                : d.status !== "REJECTED" && d.status !== "REFUNDED"
                  ? `<button class="btn btn-outline btn-sm" style="color:var(--red);" onclick="window.openReportModal('${escapeHtml(d.id)}')">Reportar</button>`
                  : ""}
            </div>
          </td>
        </tr>
        ${linkedMsgsHtml}
      `;
    }).join("");

    const tableHtml = `
      ${globalMsgsHtml}
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
        <thead>
          <tr style="border-bottom:2px solid var(--border); color:var(--text-muted); font-size:0.78rem; text-transform:uppercase;">
            <th style="padding:0.5rem;">Articulo</th>
            <th style="padding:0.5rem;">Precio</th>
            <th style="padding:0.5rem;">Fecha</th>
            <th style="padding:0.5rem;">Estado</th>
            <th style="padding:0.5rem;">Accion</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    if (container)  container.innerHTML = tableHtml;
    else if (tbody) tbody.innerHTML     = rowsHtml;

  } catch (err) {
    const errMsg = `<div style="text-align:center; color:var(--red); padding:1.5rem;">Error al cargar entregas</div>`;
    if (container) container.innerHTML = errMsg;
    else if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red);">Error al cargar entregas</td></tr>`;
  }
}

// --- Init ------------------------------------------------------------------
export function initDeliveries() {
  const btn = document.getElementById("btn-refresh-deliveries");
  if (btn) btn.onclick = loadDeliveries;

  window.__openDeliveryReceipt = (encoded) => {
    try {
      const d = JSON.parse(decodeURIComponent(encoded));
      openDeliveryReceipt(d, state.currentUser);
    } catch (e) { console.warn("Receipt parse error", e); }
  };

  window.__showReceiptFromData = (dataStr) => {
    try {
      const parsed = JSON.parse(dataStr.replace(/&quot;/g, '"'));
      if (typeof window.showPurchaseReceipt === "function") window.showPurchaseReceipt(parsed);
    } catch (e) {}
  };

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
        showToast("Error de conexion");
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
