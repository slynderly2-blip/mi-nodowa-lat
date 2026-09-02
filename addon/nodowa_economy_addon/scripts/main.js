import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";

// ── Configuración ─────────────────────────────────────────────
const BACKEND_URL = "http://localhost:3334";
const WEB_DOMAIN = "tienda.nodowa.lat";
const SCOREBOARD_NAME = "nodocoins";

// ── HTTP Helper (usa @minecraft/server-net si está disponible) ──
let httpModule = null;
async function tryLoadHttp() {
  if (httpModule !== null) return httpModule;
  try {
    httpModule = await import("@minecraft/server-net");
    console.log("[NodowaEconomy] @minecraft/server-net disponible. HTTP activo.");
  } catch (_) {
    httpModule = false;
    console.warn("[NodowaEconomy] @minecraft/server-net no disponible. Modo offline.");
  }
  return httpModule;
}

async function httpPost(url, body) {
  const net = await tryLoadHttp();
  if (!net || !net.http) return null;
  try {
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Post;
    req.body = JSON.stringify(body);
    req.headers = [new net.HttpHeader("Content-Type", "application/json")];
    const resp = await net.http.request(req);
    return JSON.parse(resp.body);
  } catch (e) {
    console.warn("[NodowaEconomy] HTTP error:", e.message);
    return null;
  }
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

// ── Evento de Entrada / Spawn ─────────────────────────────────
world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;

  system.runTimeout(() => {
    try {
      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5§l✦ BIENVENIDO A NODOWA NETWORK ✦`);
      player.sendMessage(`§7Economía y Tienda Web activas.`);
      player.sendMessage(`§fVisita: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§fUsa: §e/eco:menu §fo §e/eco:saldo §fpara ver tu billetera.`);
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

function checkDeliveriesForPlayer(player) {
  player.sendMessage(`§a[Buzón] §fVerificando entregas pendientes de la tienda web...`);
  player.sendMessage(`§7Las compras en §dhttps://${WEB_DOMAIN} §7se procesan automáticamente.`);
  try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}
}

// ── Transferencias de Monedas P2P ─────────────────────────────
function handlePayCommand(sender, targetName, amount) {
  const senderBal = getPlayerBalance(sender);
  const numAmount = parseInt(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    sender.sendMessage(`§cMonto inválido.`);
    return;
  }

  if (senderBal < numAmount) {
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

  setPlayerBalance(sender, senderBal - numAmount);
  addPlayerBalance(targetPlayer, numAmount);

  sender.sendMessage(`§a✓ Has transferido §e${numAmount.toLocaleString()} Nodocoins §aa §f${targetPlayer.name}§a.`);
  targetPlayer.sendMessage(`§a✓ ¡Recibiste §e${numAmount.toLocaleString()} Nodocoins §ade parte de §f${sender.name}§a!`);

  try {
    sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 });
    targetPlayer.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
  } catch (_) {}
}

// ── Vinculación con la Web (/eco:link <code>) ─────────────────
async function handleLinkCode(player, code) {
  const cleanCode = String(code || "").replace(/['"]/g, "").trim();
  if (!cleanCode || cleanCode.length < 4 || cleanCode.length > 8) {
    player.sendMessage(`§cUso: /eco:link <código de 6 dígitos>`);
    player.sendMessage(`§7Obtén tu código en §dhttps://${WEB_DOMAIN}`);
    return;
  }

  player.sendMessage(`§d[Nodowa Auth] §fValidando código §e${cleanCode} §fcon el servidor...`);

  // Intentar validar contra el backend via HTTP
  const result = await httpPost(`${BACKEND_URL}/api/auth/verify-link`, {
    code: cleanCode,
    player: player.name,
    xuid: null
  });

  if (result && result.ok) {
    // ¡Vinculación exitosa contra el backend!
    player.sendMessage(`§a✓ ¡Cuenta §b${player.name} §avinculada exitosamente!`);
    player.sendMessage(`§7Tu sesión web está activa en §dhttps://${WEB_DOMAIN}`);
    try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
    return;
  }

  if (result && !result.ok) {
    // Backend respondió con error específico
    player.sendMessage(`§c✗ ${result.error || "Código inválido o expirado."}`);
    player.sendMessage(`§7Genera un nuevo código en §dhttps://${WEB_DOMAIN}`);
    try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
    return;
  }

  // Sin conexión HTTP — guardar claim local para sync posterior
  try {
    const raw = world.getDynamicProperty("nodowa:linked_claims") || "{}";
    const claims = JSON.parse(raw);
    claims[cleanCode] = { player: player.name, time: Date.now() };
    world.setDynamicProperty("nodowa:linked_claims", JSON.stringify(claims));
  } catch (_) {}

  player.sendMessage(`§e⚠ No se pudo conectar con el servidor web.`);
  player.sendMessage(`§7Tu código §e${cleanCode} §7fue guardado localmente.`);
  player.sendMessage(`§7La vinculación se completará cuando el servidor web esté disponible.`);
  try { player.playSound("note.pling", { volume: 0.6, pitch: 1.0 }); } catch (_) {}
}

// ── Formulario UI Nativo de Bedrock (importación dinámica) ────
function openMainMenu(player) {
  system.runTimeout(async () => {
    try {
      const { ActionFormData } = await import("@minecraft/server-ui");
      const bal = getPlayerBalance(player);
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
          player.sendMessage(`§d[Tienda] §fVisita §dhttps://${WEB_DOMAIN} §fpara comprar rangos y kits.`);
        } else if (res.selection === 1) {
          openPayModal(player);
        } else if (res.selection === 2) {
          checkDeliveriesForPlayer(player);
        } else if (res.selection === 3) {
          player.sendMessage(`§d[Nodowa Link] §fInicia sesión en la web y escribe §e/eco:link <código>§f.`);
        }
      }).catch(() => {});
    } catch (_) {
      // Fallback si @minecraft/server-ui no disponible
      const bal = getPlayerBalance(player);
      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5§l✦ ECONOMÍA NODOWA ✦`);
      player.sendMessage(`§7Saldo: §e§l${bal.toLocaleString()} Nodocoins`);
      player.sendMessage(`§7Tienda: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§e/eco:saldo §7- Ver saldo`);
      player.sendMessage(`§e/eco:pagar <jugador> <monto> §7- Transferir`);
      player.sendMessage(`§e/eco:link <código> §7- Vincular web`);
      player.sendMessage(`§e/eco:buzon §7- Ver entregas`);
      player.sendMessage(`§d========================================`);
    }
  }, 2);
}

function openPayModal(player) {
  system.runTimeout(async () => {
    try {
      const { ModalFormData } = await import("@minecraft/server-ui");
      const bal = getPlayerBalance(player);
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
      player.sendMessage(`§cUso: /eco:pagar <jugador> <monto>`);
    }
  }, 2);
}

// ── Registro de Comandos Nativos (SÍNCRONO, igual que home_addon) ──
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  const reg = (name, desc, params, fn) => {
    try {
      customCommandRegistry.registerCommand({
        name,
        description: desc,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        ...(params ? { mandatoryParameters: params } : {})
      }, fn);
    } catch (e) {
      console.warn("[NodowaEconomy] Skip " + name + ": " + e.message);
    }
  };

  reg("eco:menu", "Abre el menú de economía", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => openMainMenu(p));
    return { status: CustomCommandStatus.Success };
  });

  reg("eco:saldo", "Consulta tu saldo de Nodocoins", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => showBalance(p));
    return { status: CustomCommandStatus.Success };
  });

  reg("eco:link", "Vincula tu cuenta con la web", [
    { name: "codigo", type: CustomCommandParamType.Integer }
  ], (o, codigo) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => handleLinkCode(p, codigo));
    return { status: CustomCommandStatus.Success };
  });

  reg("eco:pagar", "Paga Nodocoins a un jugador", [
    { name: "jugador", type: CustomCommandParamType.String },
    { name: "cantidad", type: CustomCommandParamType.Integer }
  ], (o, jugador, cantidad) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => handlePayCommand(p, jugador, cantidad));
    return { status: CustomCommandStatus.Success };
  });

  reg("eco:buzon", "Revisa entregas pendientes", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => checkDeliveriesForPlayer(p));
    return { status: CustomCommandStatus.Success };
  });

  console.log("[NodowaEconomy] v2.3.0 — /eco:menu /eco:saldo /eco:link /eco:pagar /eco:buzon listo.");
});

// ── Captura de Chat Opcional (!menu, !link, !saldo, !pagar, !buzon) ──
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
    const isPrefix = firstChar === "!" || firstChar === "." || firstChar === ";";
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
        } catch (_) {}
      });
    }
  });
}
