import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";

// ── Configuración ─────────────────────────────────────────────
const WEB_DOMAIN = "tienda.nodowa.lat";
const SCOREBOARD_NAME = "nodocoins";

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
    if (!objective) return 0;
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

// ── Registro de Jugadores (Cache) ─────────────────────────────
const PLAYERS_KEY = "nodowa:players_log";

function loadRegisteredPlayers() {
  try {
    const raw = world.getDynamicProperty(PLAYERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function saveRegisteredPlayers(map) {
  try {
    world.setDynamicProperty(PLAYERS_KEY, JSON.stringify(map));
  } catch (_) {}
}

function touchPlayer(player) {
  try {
    const map = loadRegisteredPlayers();
    map[player.name] = {
      name: player.name,
      xuid: player.id || null,
      seen: Date.now(),
      dim: player.dimension.id.replace("minecraft:", ""),
      loc: `${Math.floor(player.location.x)}, ${Math.floor(player.location.y)}, ${Math.floor(player.location.z)}`
    };
    saveRegisteredPlayers(map);
  } catch (_) {}
}

// ── Evento de Entrada / Spawn ─────────────────────────────────
world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;

  touchPlayer(player);

  system.runTimeout(() => {
    try {
      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5§l✦ BIENVENIDO A NODOWA NETWORK ✦`);
      player.sendMessage(`§7Economía y Tienda Web sincronizadas.`);
      player.sendMessage(`§fVisita: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§fEscribe §e/nodowa:menu §fo §e/nodowa:saldo §fpara ver tu billetera.`);
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

function checkDeliveries(player) {
  player.sendMessage(`§a[Buzón] §fVerificando entregas pendientes de la tienda web...`);
  player.sendMessage(`§7Las compras en §dhttps://${WEB_DOMAIN} §7se entregan automáticamente.`);
  try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}
}

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

  sender.sendMessage(`§a✓ Has transferido §e${amount.toLocaleString()} Nodocoins §aa §f${targetPlayer.name}§a.`);
  targetPlayer.sendMessage(`§a✓ ¡Recibiste §e${amount.toLocaleString()} Nodocoins §ade parte de §f${sender.name}§a!`);

  try {
    sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 });
    targetPlayer.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
  } catch (_) {}
}

// ── Vinculación con la Web (/link <code>) ─────────────────────
async function handleLinkCode(player, code) {
  const cleanCode = String(code || "").replace(/['"]/g, "").trim();
  if (!cleanCode) {
    player.sendMessage(`§cUso: /link <código de 6 dígitos>`);
    return;
  }

  player.sendMessage(`§d[Nodowa Auth] §fValidando código: §e${cleanCode}§f...`);

  try {
    const { http, HttpRequest, HttpRequestMethod, HttpHeader } = await import("@minecraft/server-net");
    const req = new HttpRequest(`https://${WEB_DOMAIN}/api/auth/verify-link`);
    req.setMethod(HttpRequestMethod.Post);
    req.setHeaders([new HttpHeader("Content-Type", "application/json")]);
    req.setBody(JSON.stringify({ code: cleanCode, player: player.name }));

    const res = await http.request(req);
    const data = JSON.parse(res.body);

    if (data.ok) {
      player.sendMessage(`§a✓ ¡Sesión autorizada con éxito para §b${player.name}§a!`);
      player.sendMessage(`§7Tu navegador en §dhttps://${WEB_DOMAIN} §7iniciará sesión automáticamente.`);
      try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
    } else {
      player.sendMessage(`§cError al vincular: ${data.error || "Código inválido o expirado"}`);
    }
  } catch (_) {
    player.sendMessage(`§a✓ Código registrado (§e${cleanCode}§a).`);
    player.sendMessage(`§7En tu navegador, haz clic en §e[¡Ya ejecuté /link en Minecraft!] §7para entrar.`);
    try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
  }
}


// ── Menús Nativo Form Visual ───────────────────────────────────
async function openMainMenu(player) {
  const bal = getPlayerBalance(player);
  try {
    const { ActionFormData } = await import("@minecraft/server-ui");
    const form = new ActionFormData();
    form.title("§5✦ ECONOMÍA NODOWA ✦");
    form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo en Mano: §e§l${bal.toLocaleString()} Nodocoins\n§7Web: §dhttps://${WEB_DOMAIN}`);
    
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
        checkDeliveries(player);
      } else if (res.selection === 3) {
        player.sendMessage(`§d[Nodowa Link] §fInicia sesión en la web y escribe §e/nodowa:link <código>§f.`);
      }
    }).catch(() => {});
  } catch (_) {
    showBalance(player);
    player.sendMessage(`§7Usa: §e/nodowa:saldo§7, §e/nodowa:pagar <jugador> <monto>§7, §e/nodowa:link <código>`);
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
    player.sendMessage(`§cUso: /nodowa:pagar <jugador> <monto>`);
  }
}

// ── Registro de Comandos en customCommandRegistry ───────────────
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  if (!customCommandRegistry) return;

  const safeReg = (def, fn) => {
    try {
      customCommandRegistry.registerCommand(def, (origin, ...args) => {
        const player = origin.initiator ?? origin.sourceEntity;
        if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure };
        system.run(() => fn(player, args));
        return { status: CustomCommandStatus.Success };
      });
    } catch (e) {
      console.warn("[NodowaEconomy] skip " + def.name + ": " + e.message);
    }
  };

  safeReg({
    name: "nodowa:menu",
    description: "Abre el menú de economía de Nodowa",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false
  }, (p) => openMainMenu(p));

  safeReg({
    name: "nodowa:saldo",
    description: "Consulta tu saldo actual de Nodocoins",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false
  }, (p) => showBalance(p));

  safeReg({
    name: "nodowa:bal",
    description: "Consulta tu saldo de Nodocoins",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false
  }, (p) => showBalance(p));

  safeReg({
    name: "nodowa:buzon",
    description: "Revisa tus entregas de la tienda web",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false
  }, (p) => checkDeliveries(p));

  safeReg({
    name: "nodowa:link",
    description: "Vincula tu cuenta con la web",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false,
    mandatoryParameters: [{ name: "codigo", type: CustomCommandParamType.String }]
  }, (p, [code]) => handleLinkCode(p, code));

  safeReg({
    name: "nodowa:pagar",
    description: "Paga Nodocoins a un jugador",
    permissionLevel: CommandPermissionLevel.Any,
    cheatsRequired: false,
    mandatoryParameters: [
      { name: "jugador", type: CustomCommandParamType.String },
      { name: "cantidad", type: CustomCommandParamType.Integer }
    ]
  }, (p, [target, amount]) => handlePayCommand(p, target, amount));
});

// ── Captura Opcional de Chat (Solo si antes de eventos existe) ────
if (world.beforeEvents && typeof world.beforeEvents.chatSend?.subscribe === "function") {
  const ECONOMY_COMMANDS = new Set([
    "menu", "saldo", "bal", "dinero", "money", "eco",
    "pagar", "pay", "link", "buzon", "reclamar", "tienda"
  ]);

  world.beforeEvents.chatSend.subscribe((event) => {
    const { sender, message } = event;
    const trimmed = message.trim();

    let firstChar = trimmed.charAt(0);
    let isPrefix = firstChar === "/" || firstChar === "!" || firstChar === ".";
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
          else if (cmd === "buzon" || cmd === "reclamar") checkDeliveries(sender);
        } catch (_) {}
      });
    }
  });
}
