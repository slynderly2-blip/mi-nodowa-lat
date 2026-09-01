import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";

// Importación opcional de server-net con fallback seguro
let http = null;
let HttpRequest = null;
let HttpHeaders = null;
let HttpRequestMethod = null;

try {
  const netModule = await import("@minecraft/server-net");
  http = netModule.http;
  HttpRequest = netModule.HttpRequest;
  HttpHeaders = netModule.HttpHeaders;
  HttpRequestMethod = netModule.HttpRequestMethod;
} catch (_) {
  console.warn("[NodowaEconomy] Advertencia: @minecraft/server-net no disponible. Las peticiones HTTP se simularán o reintentarán.");
}

// ── Configuración ─────────────────────────────────────────────
const BACKEND_URL = "http://localhost:3334"; // Cambiar por IP pública / dominio en producción
const WEB_DOMAIN = "tienda.nodowa.lat";
const SCOREBOARD_NAME = "nodocoins";

console.log("[NodowaEconomy] Plugin Nodowa Economy Connector v1.5.0 (HTTP Enabled) cargado.");

// ── Helpers HTTP ──────────────────────────────────────────────
async function httpPost(endpoint, bodyData) {
  if (!http) return null;
  try {
    const req = new HttpRequest(`${BACKEND_URL}${endpoint}`);
    req.setMethod(HttpRequestMethod.Post);
    req.setHeaders([
      new HttpHeaders("Content-Type", "application/json")
    ]);
    req.setBody(JSON.stringify(bodyData));
    const response = await http.request(req);
    if (response.status >= 200 && response.status < 300) {
      return JSON.parse(response.body);
    }
  } catch (err) {
    console.error(`[NodowaEconomy] Error HTTP POST en ${endpoint}:`, err);
  }
  return null;
}

async function httpGet(endpoint) {
  if (!http) return null;
  try {
    const req = new HttpRequest(`${BACKEND_URL}${endpoint}`);
    req.setMethod(HttpRequestMethod.Get);
    const response = await http.request(req);
    if (response.status >= 200 && response.status < 300) {
      return JSON.parse(response.body);
    }
  } catch (err) {
    console.error(`[NodowaEconomy] Error HTTP GET en ${endpoint}:`, err);
  }
  return null;
}

// ── Inicializar Scoreboard ────────────────────────────────────
system.run(() => {
  try {
    let objective = world.scoreboard.getObjective(SCOREBOARD_NAME);
    if (!objective) {
      objective = world.scoreboard.addObjective(SCOREBOARD_NAME, "Nodocoins");
    }
  } catch (_) {}
});

function getPlayerBalance(player) {
  try {
    const objective = world.scoreboard.getObjective(SCOREBOARD_NAME);
    if (!objective || !player.scoreboardIdentity) return 0;
    const score = objective.getScore(player.scoreboardIdentity);
    return score !== undefined ? score : 0;
  } catch (_) {
    return 0;
  }
}

function setPlayerBalance(player, amount) {
  try {
    const objective = world.scoreboard.getObjective(SCOREBOARD_NAME);
    if (objective && player.scoreboardIdentity) {
      objective.setScore(player.scoreboardIdentity, Math.max(0, Math.floor(amount)));
    }
  } catch (_) {}
}

function addPlayerBalance(player, amount) {
  const cur = getPlayerBalance(player);
  setPlayerBalance(player, cur + amount);
}

// ── Sincronizar Saldo con Backend ─────────────────────────────
async function syncBalanceWithBackend(player) {
  try {
    const data = await httpGet(`/api/addon/get-balance?player=${encodeURIComponent(player.name)}`);
    if (data && data.ok) {
      setPlayerBalance(player, data.wallet);
    }
  } catch (_) {}
}

// ── Registro de Jugadores (Cache Local & HTTP) ─────────────────
function touchPlayer(player) {
  try {
    httpPost("/api/addon/sync-players", {
      players: [{
        name: player.name,
        xuid: player.id || null,
        seen: Date.now()
      }]
    }).catch(() => {});
  } catch (_) {}
}

// ── Evento de Entrada / Spawn ─────────────────────────────────
world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;

  touchPlayer(player);

  system.runTimeout(() => {
    try {
      syncBalanceWithBackend(player);

      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5§l✦ BIENVENIDO A NODOWA NETWORK ✦`);
      player.sendMessage(`§7Economía y Tienda Web sincronizadas.`);
      player.sendMessage(`§fVisita: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§fEscribe §e!menu §fo §e!saldo §fpara ver tu billetera.`);
      player.sendMessage(`§d========================================`);

      try { player.playSound("random.levelup", { volume: 0.6, pitch: 1.2 }); } catch (_) {}
    } catch (_) {}
  }, 40);
});

function showBalance(player) {
  const bal = getPlayerBalance(player);
  player.sendMessage(`§d[Billetera] §fTu saldo actual es: §e§l${bal.toLocaleString()} Nodocoins§r`);
  try { player.playSound("random.orb", { volume: 0.6, pitch: 1.1 }); } catch (_) {}
}

// ── Verificación y Procesador de Entregas de la Tienda Web ───
async function checkDeliveriesForPlayer(player) {
  player.sendMessage(`§a[Buzón] §fVerificando entregas pendientes de la tienda web...`);
  try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}

  const result = await httpGet(`/api/addon/pending-deliveries?player=${encodeURIComponent(player.name)}`);
  if (!result || !result.ok || !Array.isArray(result.deliveries) || result.deliveries.length === 0) {
    player.sendMessage(`§7[Buzón] No tienes entregas pendientes en este momento.`);
    return;
  }

  let count = 0;
  for (const del of result.deliveries) {
    let success = true;

    // Ejecutar comando asociado a la compra si existe
    if (del.command) {
      try {
        const cmd = del.command.replace(/\{player\}/g, `"${player.name}"`);
        const overworld = world.getDimension("overworld");
        await overworld.runCommandAsync(cmd);
      } catch (err) {
        console.error(`[NodowaEconomy] Error ejecutando comando de entrega ${del.id}:`, err);
        success = false;
      }
    }

    // Si entrega monedas directamente
    if (del.giveCoins && del.giveCoins > 0) {
      addPlayerBalance(player, del.giveCoins);
    }

    if (success) {
      count++;
      // Notificar a la web que la entrega fue completada
      await httpPost("/api/addon/ack-delivery", { deliveryId: del.id });

      player.sendMessage(`§a✓ ¡ENTREGA COMPLETADA! Has recibido: §e§l${del.itemTitle}§r`);
      try {
        player.playSound("ui.toast.challenge_complete", { volume: 1.0, pitch: 1.0 });
      } catch (_) {}
    }
  }

  if (count > 0) {
    player.sendMessage(`§a✓ ¡Se entregaron ${count} compras pendientes correctamente!`);
  }
}

// Temporizador periódico de autochequeo de entregas en segundo plano (cada 10 segundos)
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    checkDeliveriesForPlayer(player).catch(() => {});
  }
}, 200); // 200 ticks = 10 segundos

// ── Pagar Nodocoins ───────────────────────────────────────────
function handlePayCommand(sender, targetName, amount) {
  const senderBal = getPlayerBalance(sender);
  if (senderBal < amount) {
    sender.sendMessage(`§cNo tienes suficientes Nodocoins. Saldo actual: §e${senderBal.toLocaleString()} NC§c.`);
    return;
  }

  let targetPlayer = null;
  for (const p of world.getAllPlayers()) {
    if (p.name.toLowerCase() === targetName.toLowerCase()) {
      targetPlayer = p;
      break;
    }
  }

  if (!targetPlayer) {
    sender.sendMessage(`§cEl jugador "${targetName}" no está conectado.`);
    return;
  }

  if (targetPlayer.name.toLowerCase() === sender.name.toLowerCase()) {
    sender.sendMessage(`§cNo puedes transferirte monedas a ti mismo.`);
    return;
  }

  setPlayerBalance(sender, senderBal - amount);
  addPlayerBalance(targetPlayer, amount);

  // Sincronizar saldos cambiados con el backend
  httpPost("/api/addon/sync-balance", { player: sender.name, balance: senderBal - amount }).catch(() => {});
  httpPost("/api/addon/sync-balance", { player: targetPlayer.name, balance: getPlayerBalance(targetPlayer) }).catch(() => {});

  sender.sendMessage(`§a✓ Has transferido §e${amount.toLocaleString()} Nodocoins §aa §f${targetPlayer.name}§a.`);
  targetPlayer.sendMessage(`§a✓ ¡Recibiste §e${amount.toLocaleString()} Nodocoins §ade parte de §f${sender.name}§a!`);

  try {
    sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 });
    targetPlayer.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
  } catch (_) {}
}

// ── Vinculación de Cuenta con la Web (/link <code>) ────────────
async function handleLinkCode(player, code) {
  const cleanCode = String(code || "").replace(/['"]/g, "").trim();
  if (!cleanCode) {
    player.sendMessage(`§cUso: !link <código de 6 dígitos>`);
    return;
  }

  player.sendMessage(`§d[Nodowa Auth] §fVerificando código §e${cleanCode} §fcon la tienda web...`);

  const result = await httpPost("/api/auth/verify-link", {
    code: cleanCode,
    player: player.name,
    xuid: player.id || null
  });

  if (result && result.ok) {
    player.sendMessage(`§a✓ ¡CÓDIGO ${cleanCode} AUTORIZADO CORRECTAMENTE!`);
    player.sendMessage(`§a✓ Tu cuenta §b${player.name} §aha sido vinculada con exito en §dhttps://${WEB_DOMAIN}`);
    try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
  } else {
    const errorMsg = result ? result.error : "No se pudo conectar con el servidor web.";
    player.sendMessage(`§c✕ Error al vincular: ${errorMsg}`);
    try { player.playSound("note.bass", { volume: 1.0, pitch: 0.8 }); } catch (_) {}
  }
}

// ── Formulario UI Nativo de Bedrock (Menú Form) ─────────────────
async function openMainMenu(player) {
  const bal = getPlayerBalance(player);
  try {
    const { ActionFormData } = await import("@minecraft/server-ui");
    const form = new ActionFormData();
    form.title("§5✦ ECONOMÍA NODOWA ✦");
    form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo actual: §e§l${bal.toLocaleString()} Nodocoins\n§7Tienda Web: §dhttps://${WEB_DOMAIN}`);
    
    form.button("§d✦ Tienda Web", "textures/items/emerald");
    form.button("§6✦ Transferir Monedas", "textures/items/gold_ingot");
    form.button("§a✦ Mi Buzón", "textures/items/chest");
    form.button("§9✦ Vincular Web", "textures/items/paper");

    form.show(player).then((res) => {
      if (res.canceled) return;
      if (res.selection === 0) {
        player.sendMessage(`§d[Tienda] §fVisita §dhttps://${WEB_DOMAIN} §fpara comprar rangos, kits y monedas.`);
      } else if (res.selection === 1) {
        openPayModal(player);
      } else if (res.selection === 2) {
        checkDeliveriesForPlayer(player);
      } else if (res.selection === 3) {
        player.sendMessage(`§d[Nodowa Link] §fInicia sesión en la web y escribe §e!link <código>§f.`);
      }
    }).catch(() => {});
  } catch (_) {
    showBalance(player);
    player.sendMessage(`§7Comandos disponibles: §e!saldo§7, §e!pagar <jugador> <monto>§7, §e!link <código>§7, §e!buzon`);
  }
}

async function openPayModal(player) {
  const bal = getPlayerBalance(player);
  try {
    const { ModalFormData } = await import("@minecraft/server-ui");
    const form = new ModalFormData();
    form.title("§6✦ TRANSFERIR NODOCOINS ✦");
    form.textField(`Saldo disponible: ${bal.toLocaleString()} NC\n\nNombre del Jugador:`, "Ej. Steve");
    form.textField("Cantidad a transferir:", "Ej. 500");

    form.show(player).then((res) => {
      if (res.canceled) return;
      const [target, amountStr] = res.formValues;
      const amount = parseInt(amountStr);
      if (!target || isNaN(amount) || amount <= 0) return;
      handlePayCommand(player, target, amount);
    }).catch(() => {});
  } catch (_) {
    player.sendMessage(`§cUso: !pagar <jugador> <monto>`);
  }
}

// ── Captura Global de Chat (!link, !menu, !saldo, !pagar, !buzon) ──
if (world.beforeEvents && world.beforeEvents.chatSend) {
  const ECONOMY_COMMANDS = new Set([
    "menu", "saldo", "bal", "dinero", "money", "eco",
    "pagar", "pay", "link", "buzon", "reclamar", "tienda"
  ]);

  world.beforeEvents.chatSend.subscribe((event) => {
    const { sender, message } = event;
    const trimmed = message.trim();
    if (!trimmed) return;

    const firstChar = trimmed.charAt(0);
    const isPrefix = firstChar === "!" || firstChar === "/" || firstChar === ".";
    if (!isPrefix) return;

    const cmdLine = trimmed.slice(1).trim();
    const parts = cmdLine.split(/\s+/);
    const rawCmd = (parts[0] || "").toLowerCase();
    const cmd = rawCmd.includes(":") ? rawCmd.split(":")[1] : rawCmd;

    if (ECONOMY_COMMANDS.has(cmd)) {
      event.cancel = true;
      system.run(() => {
        try {
          if (cmd === "saldo" || cmd === "bal" || cmd === "money" || cmd === "dinero") showBalance(sender);
          else if (cmd === "menu" || cmd === "eco" || cmd === "tienda") openMainMenu(sender);
          else if (cmd === "link" && parts[1]) handleLinkCode(sender, parts[1]);
          else if ((cmd === "pagar" || cmd === "pay") && parts[1] && parts[2]) handlePayCommand(sender, parts[1], parseInt(parts[2]));
          else if (cmd === "buzon" || cmd === "reclamar") checkDeliveriesForPlayer(sender);
        } catch (e) {
          console.error("[NodowaEconomy] Error procesando comando de chat:", e);
        }
      });
    }
  });
}

// ── Registro Opcional en customCommandRegistry ────────────────
system.beforeEvents?.startup?.subscribe(({ customCommandRegistry }) => {
  if (!customCommandRegistry) return;

  const safeReg = (def, fn) => {
    try {
      customCommandRegistry.registerCommand(def, (origin, ...args) => {
        const player = origin.initiator ?? origin.sourceEntity;
        if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure };
        system.run(() => fn(player, args));
        return { status: CustomCommandStatus.Success };
      });
    } catch (_) {}
  };

  const commands = [
    { name: "nodowa:menu", desc: "Abre el menú de economía", fn: (p) => openMainMenu(p) },
    { name: "nodowa:saldo", desc: "Consulta tu saldo de Nodocoins", fn: (p) => showBalance(p) },
    { name: "nodowa:buzon", desc: "Revisa tus entregas de la tienda web", fn: (p) => checkDeliveriesForPlayer(p) },
    { 
      name: "nodowa:link", 
      desc: "Vincula tu cuenta con la web", 
      params: [{ name: "codigo", type: CustomCommandParamType.String }],
      fn: (p, [code]) => handleLinkCode(p, code)
    },
    { 
      name: "nodowa:pagar", 
      desc: "Paga Nodocoins a un jugador", 
      params: [
        { name: "jugador", type: CustomCommandParamType.String },
        { name: "cantidad", type: CustomCommandParamType.Integer }
      ],
      fn: (p, [target, amount]) => handlePayCommand(p, target, amount)
    }
  ];

  for (const c of commands) {
    safeReg({
      name: c.name,
      description: c.desc,
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      ...(c.params ? { mandatoryParameters: c.params } : {})
    }, c.fn);
  }
});
