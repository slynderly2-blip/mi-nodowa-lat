// leaderboard.js — Top Ricos con Enlaces a Tiendas Personales

export async function loadLeaderboard() {
  const container = document.getElementById("leaderboard-table-container");
  const tbody = document.getElementById("leaderboard-tbody");

  try {
    const res = await fetch("/api/players/leaderboard");
    const data = await res.json();
    const list = data.leaderboard || [];

    if (container) {
      if (list.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            No hay datos de clasificación aún.
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase;">
              <th style="padding: 0.75rem 0.5rem; width: 40px;">#</th>
              <th style="padding: 0.75rem 0.5rem;">Jugador</th>
              <th style="padding: 0.75rem 0.5rem;">En Mano</th>
              <th style="padding: 0.75rem 0.5rem;">En Banco</th>
              <th style="padding: 0.75rem 0.5rem;">Fortuna Total</th>
              <th style="padding: 0.75rem 0.5rem; text-align: right;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((p, idx) => {
              const medal = idx === 0 ? "🥇" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : `${idx + 1}`));
              const avatar = `https://mc-heads.net/avatar/${encodeURIComponent(p.username)}/32`;
              return `
                <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s;" onmouseover="this.style.background='var(--surface-subtle)'" onmouseout="this.style.background='transparent'">
                  <td style="padding: 0.75rem 0.5rem; font-weight: 800; font-size: 1rem;">${medal}</td>
                  <td style="padding: 0.75rem 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                      <img src="${avatar}" alt="${p.username}" style="width: 28px; height: 28px; border-radius: var(--radius-sm); image-rendering: pixelated;">
                      <span style="font-weight: 700; cursor: pointer;" onclick="window.navigateTo('/${encodeURIComponent(p.username)}')">
                        ${p.username}
                      </span>
                    </div>
                  </td>
                  <td style="padding: 0.75rem 0.5rem; color: var(--amber); font-weight: 700;">${p.wallet.toLocaleString()} NC</td>
                  <td style="padding: 0.75rem 0.5rem; color: var(--emerald); font-weight: 700;">${p.bank.toLocaleString()} NC</td>
                  <td style="padding: 0.75rem 0.5rem; font-weight: 800; color: var(--text);">${p.total.toLocaleString()} NC</td>
                  <td style="padding: 0.75rem 0.5rem; text-align: right;">
                    <button class="btn btn-outline btn-sm" onclick="window.navigateTo('/${encodeURIComponent(p.username)}')">
                      Ver Tienda
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    } else if (tbody) {
      tbody.innerHTML = list.map((p, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${p.username}</strong></td>
          <td>${p.wallet.toLocaleString()} NC</td>
          <td>${p.bank.toLocaleString()} NC</td>
          <td>${p.total.toLocaleString()} NC</td>
        </tr>
      `).join("");
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="padding: 2rem; color: var(--red); text-align: center;">Error al cargar el ranking</div>`;
    }
  }
}
