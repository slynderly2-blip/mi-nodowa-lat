import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// ─────────────────────────────────────────────────────────────────────────────
// Nodowa Economy Connector v4.2.0 - Premium Edition
//
// /eco:tienda          → Panel interactivo premium de economía y tienda
// /eco:link [código]   → Vinculación directa o vía interfaz
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = "https://tienda.nodowa.lat";
const WEB_DOMAIN  = "tienda.nodowa.lat";
const SCOREBOARD  = "nodocoins";

// ── Helpers HTTP ──────────────────────────────────────────────────────────────
async function httpGet(url) {
  try {
    const net = await import("@minecraft/server-net");
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Get;
    const resp = await net.http.request(req);
    if (!resp?.body) return null;
    const body = String(resp.body).trim();
    if (body.startsWith("<")) return null;
    return JSON.parse(body);
  } catch { return null; }
}

async function httpPost(url, payload) {
  try {
    const net = await import("@minecraft/server-net");
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Post;
    req.body = JSON.stringify(payload);
    req.headers = [new net.HttpHeader("Content-Type", "application/json")];
    const resp = await net.http.request(req);
    if (!resp?.body) return null;
    const body = String(resp.body).trim();
    if (body.startsWith("<")) return null;
    return JSON.parse(body);
  } catch { return null; }
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
system.run(() => {
  try {
    if (!world.scoreboard.getObjective(SCOREBOARD))
      world.scoreboard.addObjective(SCOREBOARD, "Nodocoins");
  } catch (_) {}
});

function getLocalBal(player) {
  try {
    const obj = world.scoreboard.getObjective(SCOREBOARD);
    if (!obj) return 0;
    let s;
    try { s = obj.getScore(player); } catch (_) {}
    if (s === undefined && player.scoreboardIdentity)
      try { s = obj.getScore(player.scoreboardIdentity); } catch (_) {}
    return typeof s === "number" ? s : 0;
  } catch { return 0; }
}

function setLocalBal(player, amount) {
  try {
    let obj = world.scoreboard.getObjective(SCOREBOARD)
            ?? world.scoreboard.addObjective(SCOREBOARD, "Nodocoins");
    const val = Math.max(0, Math.floor(amount));
    try { obj.setScore(player, val); }
    catch (_) { if (player.scoreboardIdentity) obj.setScore(player.scoreboardIdentity, val); }
  } catch (_) {}
}

// ── Sync saldo con la web ─────────────────────────────────────────────────────
async function syncBalance(player) {
  try {
    const res = await httpGet(`${BACKEND_URL}/api/addon/get-balance?player=${encodeURIComponent(player.name)}`);
    if (res?.ok && res.wallet !== undefined) {
      const val = Math.max(0, Math.floor(Number(res.wallet)));
      setLocalBal(player, val);
      return val;
    }
  } catch (_) {}
  return getLocalBal(player);
}

// ── Consulta de pedidos pendientes ───────────────────────────────────────────
async function fetchPendingDeliveries(player) {
  try {
    const url = `${BACKEND_URL}/api/addon/pending-deliveries?player=${encodeURIComponent(player.name)}`;
    console.log(`[Nodowa] GET ${url}`);
    const res = await httpGet(url);
    console.log(`[Nodowa] pending-deliveries response:`, JSON.stringify(res));
    if (res?.ok && Array.isArray(res.deliveries)) {
      return res.deliveries;
    }
  } catch (err) {
    console.warn("[NodowaEconomy] fetchPendingDeliveries error:", err);
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
//  SISTEMA DE ENTREGAS Y BUZÓN (100% ActionFormData fiable)
// ─────────────────────────────────────────────────────────────────────────────

async function executeDelivery(player, del) {
  // Llamar al backend UNA SOLA VEZ — marca DELIVERED atómicamente
  // Si ya fue procesada, el backend devuelve ok:false y no ejecutamos nada
  console.log(`[Nodowa] POST /api/addon/execute-delivery → deliveryId=${del.id} player=${player.name}`);
  const result = await httpPost(`${BACKEND_URL}/api/addon/execute-delivery`, { deliveryId: del.id });
  console.log(`[Nodowa] execute-delivery response:`, JSON.stringify(result));

  if (!result) {
    player.sendMessage("§c[Nodowa] Sin respuesta del servidor. Intenta más tarde.");
    return;
  }

  if (!result.ok) {
    // already:true = ya fue entregada antes, silencioso
    if (result.already) {
      console.log(`[Nodowa] delivery ${del.id} ya procesada (already=true) — sin ejecutar comando`);
      return;
    }
    player.sendMessage(`§c[Nodowa] No se pudo procesar: ${result.error || 'error desconocido'}`);
    return;
  }

  // FIX BUG 1+2: usar el comando devuelto por el backend, NO el del snapshot
  // El backend devuelve result.delivery.command — esa es la fuente de verdad
  const cmd = (result.delivery?.command) || '';
  console.log(`[Nodowa] ejecutando comando: "${cmd}"`);
  if (cmd.trim()) {
    const exec = cmd.trim().replace(/\{player\}/g, `"${player.name}"`).replace(/^\//, '');
    try {
      player.dimension.runCommand(exec);
    } catch (_) {
      try { world.getDimension("minecraft:overworld").runCommand(exec); } catch (_) {}
    }
  }
}

// ── BUZÓN PRINCIPAL ──────────────────────────────────────────────────────────
async function openBuzonMenu(player) {
  player.sendMessage("§e[Buzón] §7Comprobando pedidos en el servidor...");

  const deliveries = await fetchPendingDeliveries(player);

  if (deliveries.length === 0) {
    showForm(player, () => {
      const form = new ActionFormData();
      form.title("§l§6📬  B U Z Ó N   V A C Í O  📬");
      form.body(
        `§r§8╭──────────────────────────────────╮\n` +
        `§r§8│  §6§lESTADO DEL BUZÓN\n` +
        `§r§8│  §7Jugador: §b${player.name}\n` +
        `§r§8│  §7Pedidos: §a0 pendientes\n` +
        `§r§8╰──────────────────────────────────╯\n\n` +
        `§fActualmente no tienes entregas en espera.\n\n` +
        `§7Cada vez que compres un rango, kit o artículo en:\n` +
        `§d§nhttps://${WEB_DOMAIN}§r\n\n` +
        `§7Aparecerá aquí para que lo reclames cuando tú quieras.\n` +
        `§8§m────────────────────────────────────§r`
      );
      form.button("§e§lVOLVER AL MENÚ\n§8» Regresar a la tienda", "textures/ui/arrow_left");
      form.button("§7Cerrar", "textures/ui/cancel");
      return form;
    }, (res, p) => {
      if (res.selection === 0) openMainMenu(p);
    });
    return;
  }

  // Lista interactiva con pedidos pendientes
  const snapshot = [...deliveries];
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§6📬  B U Z Ó N   D E   E N T R E G A S  📬");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §6§l¡TIENES ENTREGAS PENDIENTES!\n` +
      `§r§8│  §7Jugador:    §b§l${player.name}§r\n` +
      `§r§8│  §7Pendientes: §e§l${snapshot.length} paquete(s)§r\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§fSelecciona un paquete para inspeccionarlo y recibirlo:\n` +
      `§8§m────────────────────────────────────§r`
    );

    for (let i = 0; i < snapshot.length; i++) {
      const del = snapshot[i];
      const name = del.productName ?? del.product ?? `Paquete #${i + 1}`;
      form.button(
        `§e§l${name}\n§a» Toca para reclamar`,
        "textures/items/book_enchanted"
      );
    }

    form.button("§e§lVOLVER AL MENÚ\n§8» Regresar", "textures/ui/arrow_left");
    form.button("§7Cerrar", "textures/ui/cancel");
    return form;
  }, (res, p) => {
    if (res.selection === snapshot.length) {
      openMainMenu(p);
      return;
    }
    if (res.selection === snapshot.length + 1) return;

    const chosen = snapshot[res.selection];
    if (chosen) {
      openDeliveryConfirm(p, chosen, snapshot.length);
    }
  });
}

// ── CONFIRMACIÓN DE ENTREGA INDIVIDUAL ───────────────────────────────────────
// Set para trackear deliveries que ya están siendo procesadas en este cliente.
// La clave NUNCA se elimina una vez que el backend confirma la entrega —
// esto previene el bug de reclamar infinitamente desde el snapshot stale.
const _processingDeliveries = new Set();
// Set separado para deliveries ya completadas en esta sesión (no limpiar)
const _completedDeliveries = new Set();

function openDeliveryConfirm(player, del, totalCount) {
  const productName = del.productName ?? del.product ?? "Compra de tienda";
  const productDesc = del.description ? `\n§7Detalle: §f${del.description}` : "";

  // FIX BUG 1: si esta delivery ya fue completada en esta sesión, no mostrar
  if (_completedDeliveries.has(del.id)) {
    console.log(`[Nodowa] delivery ${del.id} ya completada esta sesión, ignorando`);
    return;
  }

  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§6📦  C O N F I R M A R   E N T R E G A  📦");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §6§lDETALLES DEL PAQUETE\n` +
      `§r§8│  §7Artículo: §e§l${productName}§r\n` +
      `§r§8│  §7Destino:  §b${player.name}§r` +
      productDesc + `\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§fAl presionar §a§lRECLAMAR§r§f, los items y beneficios\n` +
      `§fse agregarán inmediatamente a tu inventario.\n\n` +
      (totalCount > 1 ? `§8(Tienes ${totalCount} paquete(s) en espera en tu buzón)\n` : "") +
      `§8§m────────────────────────────────────§r`
    );

    // Botón 0: Reclamar inmediatamente
    form.button("§a§l✔  RECLAMAR AHORA\n§8» Entregar a mi inventario", "textures/ui/check");
    // Botón 1: Dejar para después
    form.button("§e§l⏳  MÁS TARDE\n§8» Guardar en el buzón", "textures/ui/cancel");
    return form;
  }, async (res, p) => {
    if (res.selection === 1) {
      p.sendMessage(`§e[Buzón] §fTu paquete §e${productName} §fpermanece guardado. Ábrelo cuando desees con §a/tienda§f.`);
      try { p.playSound("note.bass", { volume: 0.6, pitch: 0.8 }); } catch (_) {}
      return;
    }

    if (res.selection === 0) {
      // FIX BUG 1+2: doble guardia — processing evita concurrencia, completed evita reentrada
      const deliveryKey = `${p.name}:${del.id}`;
      if (_processingDeliveries.has(deliveryKey)) {
        console.log(`[Nodowa] ${deliveryKey} ya en proceso, ignorando click duplicado`);
        return;
      }
      if (_completedDeliveries.has(del.id)) {
        console.log(`[Nodowa] ${del.id} ya completada, ignorando`);
        return;
      }
      _processingDeliveries.add(deliveryKey);

      try {
        await executeDelivery(p, del);

        // FIX BUG 1: marcar como completada ANTES de limpiar processing
        // así cualquier reintento del form no puede ejecutar de nuevo
        _completedDeliveries.add(del.id);

        await syncBalance(p);
        try { p.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
        const remaining = await fetchPendingDeliveries(p);
        showDeliverySuccess(p, productName, remaining.length);
      } catch (err) {
        console.error("[NodowaEconomy] Error entregando:", err);
        // Solo limpiar processing en caso de error real — dejar que reintente
        _processingDeliveries.delete(deliveryKey);
        if (!String(err?.message || '').includes('bloqueada')) {
          p.sendMessage("§c[Nodowa] Error al procesar la entrega. Intenta nuevamente.");
        }
        return;
      }
      // En éxito: NO llamar _processingDeliveries.delete — la clave queda hasta
      // que el servidor confirme via fetchPendingDeliveries que no existe más
      _processingDeliveries.delete(deliveryKey);
    }
  });
}

// ── PANTALLA DE ÉXITO ────────────────────────────────────────────────────────
function showDeliverySuccess(player, productName, remainingCount) {
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§a✔  ¡ E N T R E G A   E X I T O S A !  ✔");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §a§l¡PAQUETE RECIBIDO CON ÉXITO!\n` +
      `§r§8│  §7Producto: §e§l${productName}§r\n` +
      `§r§8│  §7Recibido: §b${player.name}\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§f¡Revisa tu inventario! Los items han sido depositados.\n` +
      `§7Muchas gracias por apoyar a la comunidad en:\n` +
      `§d§nhttps://${WEB_DOMAIN}§r ❤\n\n` +
      (remainingCount > 0
        ? `§e§l¡Atención! §r§fAún te quedan §6§l${remainingCount} §r§fpaquete(s) en tu buzón.\n`
        : `§a§l¡Tu buzón está completamente al día!\n`) +
      `§8§m────────────────────────────────────§r`
    );

    if (remainingCount > 0) {
      form.button(
        `§e§l📬  VER SIGUIENTE PAQUETE (${remainingCount})\n§8» Reclamar resto de compras`,
        "textures/items/book_enchanted"
      );
      form.button("§a§l✔  LISTO\n§8» Volver al juego", "textures/ui/check");
    } else {
      form.button("§a§l✔  FINALIZAR\n§8» Cerrar y disfrutar", "textures/ui/check");
    }
    return form;
  }, (res, p) => {
    if (remainingCount > 0 && res.selection === 0) {
      openBuzonMenu(p);
    }
  });
}

// ── Alerta periódica silenciosa ──────────────────────────────────────────────
async function notifyPendingDeliveries(player) {
  try {
    const deliveries = await fetchPendingDeliveries(player);
    if (deliveries.length > 0) {
      player.sendMessage(
        `§6§l[Buzón] §r§eTienes §6§l${deliveries.length} §r§epaquete(s) esperándote. Escribe §a/tienda §epara reclamarlos.`
      );
      try { player.playSound("random.orb", { volume: 0.6, pitch: 1.2 }); } catch (_) {}
    }
  } catch (_) {}
}

system.runInterval(async () => {
  for (const p of world.getAllPlayers()) {
    try {
      await notifyPendingDeliveries(p);
      await syncBalance(p);
    } catch (_) {}
  }
}, 1200);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(async () => {
    try {
      await syncBalance(player);
      system.runTimeout(async () => {
        await notifyPendingDeliveries(player);
      }, 80);
    } catch (_) {}
  }, 40);
});

// ─────────────────────────────────────────────────────────────────────────────
//  MOTOR DE FORMULARIOS CON REINTENTOS ROBUSTOS
// ─────────────────────────────────────────────────────────────────────────────

function showForm(player, buildForm, onResult, maxRetries = 8) {
  let tries = 0;
  function attempt() {
    try {
      const fresh = world.getAllPlayers().find(p => p.name === player.name);
      if (!fresh) return;
      const form = buildForm();
      if (!form) return;
      form.show(fresh).then(res => {
        if (res.canceled) {
          if (res.cancelationReason === "UserBusy" && tries < maxRetries) {
            tries++;
            system.runTimeout(attempt, 6);
          }
          return;
        }
        try {
          onResult(res, fresh);
        } catch (e) {
          console.error("[NodowaEconomy] Form callback error:", e);
        }
      }).catch(e => console.warn("[NodowaEconomy] Form show error:", e));
    } catch (e) {
      console.error("[NodowaEconomy] Form init error:", e);
    }
  }
  system.runTimeout(attempt, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PANELES DE INTERFAZ DE USUARIO (DISEÑO PREMIUM)
// ─────────────────────────────────────────────────────────────────────────────

// ── PANEL PRINCIPAL (/tienda) ─────────────────────────────────────────────────
async function openMainMenu(player) {
  const [bal, deliveries] = await Promise.all([
    syncBalance(player),
    fetchPendingDeliveries(player)
  ]);

  const pendingCount = deliveries.length;
  const buzonBadge = pendingCount > 0 ? ` §e§l[${pendingCount} NUEVO(S)]§r` : "";
  const buzonSub   = pendingCount > 0 ? `§a» ¡Tienes compras por reclamar!` : `§8» Reclama compras de la web`;

  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§6⚔   N O D O W A   E C O N O M Y   ⚔");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §6§lDATOS DEL USUARIO\n` +
      `§r§8│  §7Jugador:   §b§l${player.name}§r\n` +
      `§r§8│  §7Billetera: §e§l${bal.toLocaleString()} §6Nodocoins §r§e⛁\n` +
      `§r§8│  §7Web:       §d${WEB_DOMAIN}\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      (pendingCount > 0
        ? `§e§l⚡ ¡TIENES ${pendingCount} PAQUETE(S) EN TU BUZÓN!\n§7Toca en §aBuzón §7para recibirlos en tu inventario.\n\n`
        : `§7Usa §e/link §7para vincular tu cuenta y ganar §a§l+500 NC gratis§r§7.\n\n`) +
      `§8§m────────────────────────────────────§r\n` +
      `§fSelecciona una opción del panel:`
    );

    form.button(
      "§d§lTIENDA ONLINE\n§8» Rangos, kits y catálogo",
      "textures/items/emerald"
    );
    form.button(
      `§a§lBUZÓN DE ENTREGAS${buzonBadge}\n${buzonSub}`,
      "textures/items/book_enchanted"
    );
    form.button(
      "§6§lTRANSFERIR NODOCOINS\n§8» Enviar monedas a un amigo",
      "textures/items/gold_ingot"
    );
    form.button(
      "§9§lVINCULAR CUENTA\n§8» Guía y activación (+500 NC)",
      "textures/items/paper"
    );
    form.button(
      "§7Cerrar Menú",
      "textures/ui/cancel"
    );

    return form;
  }, (res, p) => {
    if (res.selection === 0) openStoreInfo(p);
    else if (res.selection === 1) openBuzonMenu(p);
    else if (res.selection === 2) openPayModal(p);
    else if (res.selection === 3) openLinkMenu(p);
  });
}

// ── INFORMACIÓN DE LA TIENDA ──────────────────────────────────────────────────
function openStoreInfo(player) {
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§d🛒   T I E N D A   O F I C I A L   🛒");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §d§lTIENDA WEB DE NODOWA\n` +
      `§r§8│  §7Enlace: §bhttps://${WEB_DOMAIN}\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§6§lARTÍCULOS DESTACADOS:\n` +
      `§a  ★ §fRangos VIP §7- Prefijos exclusivos, comandos y ventajas.\n` +
      `§e  ⛁ §fNodocoins §7- Moneda de intercambio para compras.\n` +
      `§b  ⚔ §fKits de Recursos §7- Armaduras, herramientas y provisiones.\n` +
      `§d  ✦ §fLlaves y Cosméticos §7- Apertura de cajas misteriosas.\n\n` +
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §e§l¿CÓMO RECIBES TUS COMPRAS?\n` +
      `§r§8│  §f1. Compra en la web oficial.\n` +
      `§r§8│  §f2. Escribe §a/tienda §fen el chat.\n` +
      `§r§8│  §f3. Abre tu §aBuzón §fy toca Reclamar.\n` +
      `§r§8│  §7¡Nunca perderás un artículo!\n` +
      `§r§8╰──────────────────────────────────╯\n` +
      `§8§m────────────────────────────────────§r`
    );

    form.button("§e§lVOLVER AL MENÚ\n§8» Regresar", "textures/ui/arrow_left");
    form.button("§7Cerrar", "textures/ui/cancel");
    return form;
  }, (res, p) => {
    if (res.selection === 0) openMainMenu(p);
  });
}

// ── MENÚ INTERACTIVO DE VINCULACIÓN ───────────────────────────────────────────
function openLinkMenu(player) {
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§9🔗   V I N C U L A R   C U E N T A   🔗");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §9§lGUÍA DE VINCULACIÓN PASO A PASO\n` +
      `§r§8│  §fTu Gamertag actual: §b§l${player.name}§r\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§fSigue estos sencillos pasos:\n` +
      `§e  1. §fAbre en tu navegador: §bhttps://${WEB_DOMAIN}\n` +
      `§e  2. §fCrea una cuenta o inicia sesión.\n` +
      `§e  3. §fVe a tu Perfil y haz clic en §e"Vincular Minecraft"§f.\n` +
      `§e  4. §fCopia tu código personal de 6 dígitos.\n\n` +
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §6§l¡RECOMPENSA EXCLUSIVA!\n` +
      `§r§8│  §7Al vincularte recibirás gratis:\n` +
      `§r§8│  §a§l+500 NODOCOINS §r§7directo a tu cuenta.\n` +
      `§r§8╰──────────────────────────────────╯\n` +
      `§8§m────────────────────────────────────§r\n` +
      `§7¿Ya tienes tu código? Puedes ingresarlo aquí mismo:`
    );

    form.button(
      "§a§lINGRESAR CÓDIGO AHORA\n§8» Validar y recibir +500 NC",
      "textures/ui/check"
    );
    form.button(
      "§e§lVOLVER AL MENÚ\n§8» Regresar a la tienda",
      "textures/ui/arrow_left"
    );
    form.button("§7Cerrar", "textures/ui/cancel");
    return form;
  }, (res, p) => {
    if (res.selection === 0) {
      openLinkInputModal(p);
    } else if (res.selection === 1) {
      openMainMenu(p);
    }
  });
}

// Modal para ingresar el código directamente en pantalla
function openLinkInputModal(player) {
  showForm(player, () => {
    const form = new ModalFormData();
    form.title("§l§9🔗   VALIDAR CÓDIGO   🔗");
    try {
      form.textField(
        `§fIntroduce el código de 6 dígitos obtenido en §b${WEB_DOMAIN}§f:`,
        "Ej: 489210",
        { defaultValue: "" }
      );
    } catch (_) {
      form.textField("Código de 6 dígitos:", "Ej: 489210", "");
    }
    return form;
  }, (res, p) => {
    if (res.canceled) return;
    const code = String(res.formValues?.[0] ?? "").trim();
    if (!code) {
      p.sendMessage("§c[Nodowa] No ingresaste ningún código.");
      return;
    }
    handleLink(p, code);
  });
}

// ── PROCESAR CÓDIGO DE VINCULACIÓN (chat o formulario) ────────────────────────
async function handleLink(player, code) {
  const cleanCode = String(code ?? "").replace(/['"]/g, "").trim();

  if (!cleanCode) {
    openLinkMenu(player);
    return;
  }

  player.sendMessage(`§9[Nodowa] §fValidando código §e${cleanCode}§f...`);

  try {
    const result = await httpPost(`${BACKEND_URL}/api/auth/verify-link`, {
      code:   cleanCode,
      player: player.name,
      xuid:   player.id ?? null
    });

    if (result?.ok) {
      const bonus = result.bonusAmount ?? 500;
      showForm(player, () => {
        const form = new ActionFormData();
        form.title("§l§a✔   ¡VINCULACIÓN EXITOSA!   ✔");
        form.body(
          `§r§8╭──────────────────────────────────╮\n` +
          `§r§8│  §a§l¡CUENTA VINCULADA CORRECTAMENTE!\n` +
          `§r§8│  §7Jugador: §b§l${player.name}§r\n` +
          `§r§8│  §7Portal:  §d${WEB_DOMAIN}\n` +
          `§r§8╰──────────────────────────────────╯\n\n` +
          (result.bonusAwarded
            ? `§6🎁 ¡Premio de bienvenida activado!\n` +
              `§e§l+${bonus.toLocaleString()} Nodocoins §r§fagregados a tu billetera.\n\n`
            : `§fTu cuenta ya está lista para comprar y recibir pedidos.\n\n`) +
          `§8§m────────────────────────────────────§r`
        );
        form.button("§a§l✔  IR A LA TIENDA", "textures/ui/check");
        form.button("§7Cerrar", "textures/ui/cancel");
        return form;
      }, (res, p) => {
        if (res.selection === 0) openMainMenu(p);
      });

      try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
      await syncBalance(player);
    } else {
      const errMsg = result?.error ?? "El código es incorrecto o ha expirado.";
      showForm(player, () => {
        const form = new ActionFormData();
        form.title("§l§c✖   ERROR DE VINCULACIÓN   ✖");
        form.body(
          `§r§8╭──────────────────────────────────╮\n` +
          `§r§8│  §c§lNO SE PUDO VINCULAR\n` +
          `§r§8│  §7Código: §e${cleanCode}\n` +
          `§r§8╰──────────────────────────────────╯\n\n` +
          `§fMotivo: §c${errMsg}\n\n` +
          `§7Asegúrate de generar un código vigente en tu perfil de:\n` +
          `§b§nhttps://${WEB_DOMAIN}§r\n\n` +
          `§8§m────────────────────────────────────§r`
        );
        form.button("§e§lREINTENTAR CÓDIGO\n§8» Ingresar nuevamente", "textures/ui/refresh");
        form.button("§7Cerrar", "textures/ui/cancel");
        return form;
      }, (res, p) => {
        if (res.selection === 0) openLinkInputModal(p);
      });

      try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
    }
  } catch (e) {
    console.error("[NodowaEconomy] Link error:", e);
    player.sendMessage("§c[Nodowa] Error de conexión con el servidor web. Intenta más tarde.");
    try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
  }
}

// ── TRANSFERENCIA DE NODOCOINS ────────────────────────────────────────────────
async function openPayModal(player) {
  const bal = await syncBalance(player);
  const others = world.getAllPlayers().filter(p => p.name !== player.name);

  showForm(player, () => {
    const form = new ModalFormData();
    form.title("§l§6💳   TRANSFERIR NODOCOINS   💳");

    if (others.length > 0) {
      const opts = ["— Escribir Gamertag Manual —", ...others.map(p => p.name)];
      try {
        form.dropdown(`§fSelecciona un jugador conectado:\n§7Tu saldo: §e§l${bal.toLocaleString()} NC`, opts, { defaultValueIndex: 1 });
      } catch (_) {
        form.dropdown(`§fJugador conectado (§e${bal.toLocaleString()} NC)`, opts, 1);
      }
      try {
        form.textField("§fO escribe el Gamertag destinatario:", "Ej: Steve", { defaultValue: "" });
      } catch (_) {
        form.textField("§fGamertag manual:", "Ej: Steve", "");
      }
    } else {
      try {
        form.textField(`§fGamertag del destinatario:\n§7Tu saldo: §e§l${bal.toLocaleString()} NC`, "Ej: Steve", { defaultValue: "" });
      } catch (_) {
        form.textField("§fGamertag:", "Ej: Steve", "");
      }
    }

    try {
      form.textField("§fCantidad de Nodocoins a transferir:", "Ej: 100", { defaultValue: "100" });
    } catch (_) {
      form.textField("§fCantidad:", "Ej: 100", "100");
    }

    return form;
  }, async (res, p) => {
    if (res.canceled) return;

    let target = "";
    let amountStr = "";

    if (others.length > 0) {
      const idx    = res.formValues[0];
      const manual = String(res.formValues[1] ?? "").trim();
      amountStr    = res.formValues[2];
      target = manual.length > 0 ? manual : (idx > 0 ? (others[idx - 1]?.name ?? "") : "");
    } else {
      target    = String(res.formValues[0] ?? "").trim();
      amountStr = res.formValues[1];
    }

    if (!target) {
      showPayError(p, "Debes ingresar el nombre o Gamertag del destinatario.");
      return;
    }
    if (target.toLowerCase() === p.name.toLowerCase()) {
      showPayError(p, "No puedes transferirte monedas a ti mismo.");
      return;
    }
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showPayError(p, "La cantidad a transferir debe ser un número entero mayor a 0.");
      return;
    }
    if (amount > bal) {
      showPayError(p, `Saldo insuficiente. Tu balance actual es §e${bal.toLocaleString()} NC§f.`);
      return;
    }

    openPayConfirm(p, target, amount, bal);
  });
}

function showPayError(player, msg) {
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§c✖   ERROR DE TRANSFERENCIA   ✖");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §c§lNO SE PUDO CONTINUAR\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§c${msg}\n\n` +
      `§8§m────────────────────────────────────§r`
    );
    form.button("§e§lREINTENTAR\n§8» Volver al formulario", "textures/ui/refresh");
    form.button("§7Cancelar", "textures/ui/cancel");
    return form;
  }, (res, p) => {
    if (res.selection === 0) openPayModal(p);
  });
  try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
}

function openPayConfirm(player, target, amount, bal) {
  showForm(player, () => {
    const form = new ActionFormData();
    form.title("§l§6💳   CONFIRMAR ENVÍO   💳");
    form.body(
      `§r§8╭──────────────────────────────────╮\n` +
      `§r§8│  §6§lRESUMEN DE LA OPERACIÓN\n` +
      `§r§8│  §7Destinatario:   §b§l${target}§r\n` +
      `§r§8│  §7Monto a enviar: §e§l${amount.toLocaleString()} NC§r\n` +
      `§r§8│  §7Saldo restante: §a${(bal - amount).toLocaleString()} NC\n` +
      `§r§8╰──────────────────────────────────╯\n\n` +
      `§c⚠ Esta transacción es irreversible.\n` +
      `§f¿Confirmas el envío inmediato de los fondos?\n\n` +
      `§8§m────────────────────────────────────§r`
    );
    form.button("§a§l✔  CONFIRMAR Y ENVIAR\n§8» Transferir monedas", "textures/ui/check");
    form.button("§c§l✖  CANCELAR\n§8» Regresar sin enviar", "textures/ui/cancel");
    return form;
  }, async (res, p) => {
    if (res.selection === 0) {
      await doTransfer(p, target, amount);
    }
  });
}

async function doTransfer(sender, targetName, amount) {
  try {
    const res = await httpPost(`${BACKEND_URL}/api/wallet/transfer`, {
      fromUser: sender.name, toUser: targetName,
      from: sender.name,    to: targetName, amount
    });

    if (res?.ok) {
      const newBal = await syncBalance(sender);
      const targetOnline = world.getAllPlayers().find(p => p.name.toLowerCase() === targetName.toLowerCase());
      if (targetOnline) await syncBalance(targetOnline);

      showForm(sender, () => {
        const form = new ActionFormData();
        form.title("§l§a✔   TRANSFERENCIA COMPLETADA   ✔");
        form.body(
          `§r§8╭──────────────────────────────────╮\n` +
          `§r§8│  §a§l¡ENVÍO EXITOSO!\n` +
          `§r§8│  §7Destinatario: §b§l${targetName}§r\n` +
          `§r§8│  §7Monto:        §e§l${amount.toLocaleString()} NC§r\n` +
          `§r§8│  §7Nuevo Saldo:  §a§l${newBal.toLocaleString()} NC§r\n` +
          `§r§8╰──────────────────────────────────╯\n\n` +
          `§fLa transferencia ha sido registrada y aplicada.\n\n` +
          `§8§m────────────────────────────────────§r`
        );
        form.button("§a§l✔  FINALIZAR\n§8» Volver al juego", "textures/ui/check");
        return form;
      }, (_) => {});

      try { sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 }); } catch (_) {}
      if (targetOnline) {
        targetOnline.sendMessage(
          `§a[Nodowa] §f¡Recibiste §e§l${amount.toLocaleString()} Nodocoins §r§fde §b${sender.name}§f!`
        );
        try { targetOnline.playSound("random.levelup", { volume: 0.8, pitch: 1.0 }); } catch (_) {}
      }
    } else {
      showPayError(sender, res?.error ?? "No se pudo realizar la transferencia bancaria.");
    }
  } catch (e) {
    console.error("[NodowaEconomy] Transfer error:", e);
    sender.sendMessage("§c[Nodowa] Error de comunicación con la base de datos.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REGISTRO DE COMANDOS (/eco:tienda y /eco:link)
// ─────────────────────────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  function reg(name, desc, mandatory, optional, fn) {
    try {
      customCommandRegistry.registerCommand({
        name,
        description: desc,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        ...(mandatory?.length ? { mandatoryParameters: mandatory } : {}),
        ...(optional?.length  ? { optionalParameters:  optional  } : {})
      }, fn);
    } catch (e) {
      console.warn("[NodowaEconomy] Error registrando comando:", name, e.message);
    }
  }

  function forPlayer(o, cb) {
    try {
      const p = o.sourceEntity ?? o.initiator ?? o.entity ?? o.player;
      if (!p) return { status: CustomCommandStatus.Success };
      const name = p.name ?? p.nameTag;
      system.runTimeout(() => {
        try {
          const fresh = name
            ? world.getAllPlayers().find(x => x.name === name || x.nameTag === name)
            : (typeof p.sendMessage === "function" ? p : null);
          if (fresh) cb(fresh);
        } catch (e) { console.warn("[NodowaEconomy] forPlayer error:", e); }
      }, 3);
    } catch (_) {}
    return { status: CustomCommandStatus.Success };
  }

  reg("eco:tienda", "Abre el panel principal de tienda y economía",
    null, null,
    (o) => forPlayer(o, p => openMainMenu(p))
  );

  reg("eco:link", "Vincula tu cuenta con tienda.nodowa.lat (/link [código])",
    null,
    [{ name: "codigo", type: CustomCommandParamType.Integer }],
    (o, codigo) => forPlayer(o, p => {
      const codeStr = codigo !== undefined ? String(codigo) : "";
      if (codeStr) {
        handleLink(p, codeStr);
      } else {
        openLinkMenu(p);
      }
    })
  );

  reg("eco:buzon", "Abre tu buzón de entregas de la tienda web",
    null, null,
    (o) => forPlayer(o, p => openBuzonMenu(p))
  );

  console.log("[NodowaEconomy] v4.2.0 cargado con éxito.");
});

// ── INTERCEPTOR DE CHAT (/tienda y /link) ────────────────────────────────────
if (world.beforeEvents?.chatSend) {
  world.beforeEvents.chatSend.subscribe((event) => {
    try {
      const { sender, message } = event;
      const trimmed = message?.trim();
      if (!trimmed || !sender) return;

      const clean = trimmed.replace(/^[/!.;]/, "").trim().toLowerCase();
      const parts = clean.split(/\s+/);
      const raw   = parts[0];
      const cmd   = raw.includes(":") ? raw.split(":")[1] : raw;

      if (cmd === "tienda") {
        event.cancel = true;
        const n = sender.name;
        system.runTimeout(() => {
          const p = world.getAllPlayers().find(x => x.name === n);
          if (p) openMainMenu(p);
        }, 4);
      } else if (cmd === "link") {
        event.cancel = true;
        const n    = sender.name;
        const code = parts[1] ?? "";
        system.runTimeout(() => {
          const p = world.getAllPlayers().find(x => x.name === n);
          if (p) {
            if (code) {
              handleLink(p, code);
            } else {
              openLinkMenu(p);
            }
          }
        }, 4);
      } else if (cmd === "buzon" || cmd === "buzón" || cmd === "reclamar" || cmd === "mailbox") {
        event.cancel = true;
        const n = sender.name;
        system.runTimeout(() => {
          const p = world.getAllPlayers().find(x => x.name === n);
          if (p) openBuzonMenu(p);
        }, 4);
      }
    } catch (_) {}
  });
}
