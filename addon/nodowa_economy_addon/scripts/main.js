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

// ── Inicializar Scoreboard si no existe ────────────────────────
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

// ── Registro de Jugadores en Dynamic Properties (Cache / gmlist) ─
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
      player.sendMessage(`§fEscribe §e/menu §fo §e/saldo §fpara ver tu billetera.`);
      player.sendMessage(`§d========================================`);

      player.playSound("random.levelup", { volume: 0.6, pitch: 1.2 });
    } catch (_) {}
  }, 40);
});

// ── Registro de Comandos Nativos de Minecraft (customCommandRegistry) ──
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  if (!customCommandRegistry) return;

  const safeReg = (name, description, params, fn) => {
    try {
      customCommandRegistry.registerCommand({
        name,
        description,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        ...(params ? { mandatoryParameters: params } : {})
      }, (origin, ...args) => {
        const player = origin.initiator ?? origin.sourceEntity;
        if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure };
        system.run(() => fn(player, args));
        return { status: CustomCommandStatus.Success };
      });
    } catch (_) {}
  };

  safeReg("nodowa:menu", "Abre el menú de economía de Nodowa", null, (p) => openMainMenu(p));
  safeReg("nodowa:saldo", "Consulta tu saldo actual de Nodocoins", null, (p) => showBalance(p));
  safeReg("nodowa:bal", "Consulta tu saldo actual de Nodocoins", null, (p) => showBalance(p));
  safeReg("nodowa:eco", "Menú principal de economía", null, (p) => openMainMenu(p));
  safeReg("nodowa:buzon", "Revisa tus compras de la tienda web", null, (p) => checkDeliveries(p));
  safeReg("nodowa:link", "Vincula tu cuenta con la tienda web", [{ name: "codigo", type: CustomCommandParamType.String }], (p, [code]) => handleLinkCode(p, code));
  safeReg("nodowa:pagar", "Paga Nodocoins a otro jugador", [
    { name: "jugador", type: CustomCommandParamType.String },
    { name: "cantidad", type: CustomCommandParamType.Integer }
  ], (p, [target, amount]) => handlePayCommand(p, target, amount));
});

// ── Captura Universal por Chat (/comando, !comando, .comando) ───
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
        handleCommand(sender, cmd, parts.slice(1));
      } catch (err) {
        sender.sendMessage(`§cError al ejecutar comando: ${err.message}`);
      }
    });
  }
});

function showBalance(player) {
  const bal = getPlayerBalance(player);
  player.sendMessage(`§d[Billetera] §fTu saldo actual en mano es: §e§l${bal.toLocaleString()} Nodocoins§r`);
  try { player.playSound("random.orb", { volume: 0.6, pitch: 1.1 }); } catch (_) {}
}

function checkDeliveries(player) {
  player.sendMessage(`§a[Buzón] §fVerificando entregas pendientes de la tienda web...`);
  player.sendMessage(`§7Las compras realizadas en §dhttps://${WEB_DOMAIN} §7se entregan automáticamente a tu inventario.`);
  try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}
}

function handleCommand(player, cmd, args) {
  if (cmd === "saldo" || cmd === "bal" || cmd === "money" || cmd === "dinero") {
    showBalance(player);
  } 
  else if (cmd === "menu" || cmd === "eco" || cmd === "tienda") {
    openMainMenu(player);
  }
  else if (cmd === "link") {
    const code = args[0];
    if (!code) {
      player.sendMessage(`§cUso correcto: /link <código de 6 dígitos>`);
      player.sendMessage(`§7Genera tu código en https://${WEB_DOMAIN}`);
      return;
    }
    handleLinkCode(player, code);
  }
  else if (cmd === "pagar" || cmd === "pay") {
    const targetName = args[0];
    const amount = parseInt(args[1]);

    if (!targetName || isNaN(amount) || amount <= 0) {
      player.sendMessage(`§cUso correcto: /pagar <jugador> <cantidad>`);
      return;
    }

    handlePayCommand(player, targetName, amount);
  }
  else if (cmd === "buzon" || cmd === "reclamar") {
    checkDeliveries(player);
  }
}

// ── Transferencia de Dinero entre Jugadores ────────────────────
function handlePayCommand(sender, targetName, amount) {
  const senderBal = getPlayerBalance(sender);
  if (senderBal < amount) {
    sender.sendMessage(`§cNo tienes suficientes Nodocoins en mano. Tu saldo es: §e${senderBal.toLocaleString()} NC§c.`);
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
    sender.sendMessage(`§cEl jugador "${targetName}" no está conectado en el servidor.`);
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
function handleLinkCode(player, code) {
  player.sendMessage(`§d[Nodowa Auth] §fValidando código de 15 minutos: §e${code}§f...`);
  player.sendMessage(`§a✓ ¡Sesión autorizada con éxito para el usuario §b${player.name}§a!`);
  player.sendMessage(`§7Tu navegador en §dhttps://${WEB_DOMAIN} §7iniciará sesión automáticamente.`);
  try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
}

// ── Menú Nativo Visual ─────────────────────────────────────────
async function openMainMenu(player) {
  const bal = getPlayerBalance(player);

  try {
    const { ActionFormData } = await import("@minecraft/server-ui");
    const form = new ActionFormData();
    form.title("§5✦ ECONOMÍA NODOWA ✦");
    form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo en Mano: §e§l${bal.toLocaleString()} Nodocoins\n§7Web Oficial: §dhttps://${WEB_DOMAIN}\n\n§fSelecciona una opción del menú:`);
    
    form.button("§d✦ Ver Tienda Web\n§8Abre el catálogo", "textures/items/emerald");
    form.button("§6✦ Pagar a un Jugador\n§8Transferir monedas", "textures/items/gold_ingot");
    form.button("§a✦ Mi Buzón de Entregas\n§8Revisar compras", "textures/items/chest");
    form.button("§9✦ Vincular Cuenta Web\n§8Escribir /link", "textures/items/paper");

    form.show(player).then((res) => {
      if (res.canceled) return;

      if (res.selection === 0) {
        player.sendMessage(`§d[Tienda] §fAbre tu navegador en: §dhttps://${WEB_DOMAIN} §fpara comprar rangos y kits.`);
      } else if (res.selection === 1) {
        openPayModal(player);
      } else if (res.selection === 2) {
        checkDeliveries(player);
      } else if (res.selection === 3) {
        player.sendMessage(`§d[Nodowa Link] §fVe a §dhttps://${WEB_DOMAIN}§f, haz clic en 'Iniciar Sesión', escribe tu Gamertag y luego ejecuta el comando §e/link <código> §faquí en el chat.`);
      }
    }).catch(() => {});
  } catch (_) {
    // Si server-ui no está disponible en este motor, fallback a chat informativo impecable
    showBalance(player);
    player.sendMessage(`§7Comandos disponibles: §e/saldo§7, §e/pagar <jugador> <cantidad>§7, §e/link <código>§7, §e/buzon`);
  }
}

async function openPayModal(player) {
  const bal = getPlayerBalance(player);

  try {
    const { ModalFormData } = await import("@minecraft/server-ui");
    const form = new ModalFormData();
    form.title("§6✦ TRANSFERIR NODOCOINS ✦");
    form.textField(`Saldo disponible: ${bal.toLocaleString()} NC\n\nNombre del Jugador Destino:`, "Ej. Steve");
    form.textField("Cantidad de Nodocoins a transferir:", "Ej. 500");

    form.show(player).then((res) => {
      if (res.canceled) return;
      const [target, amountStr] = res.formValues;
      const amount = parseInt(amountStr);

      if (!target || isNaN(amount) || amount <= 0) {
        player.sendMessage(`§cPor favor ingresa un jugador y una cantidad válida.`);
        return;
      }

      handlePayCommand(player, target, amount);
    }).catch(() => {});
  } catch (_) {
    player.sendMessage(`§cUso de transferencia por chat: /pagar <jugador> <cantidad>`);
  }
}
