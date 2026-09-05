import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Pincel WorldEdit movido a addon separado: nodowa_worldedit_addon

// ── Configuración ─────────────────────────────────────────────
const BACKEND_URL = "https://tienda.nodowa.lat";
const WEB_DOMAIN = "tienda.nodowa.lat";
const SCOREBOARD_NAME = "nodocoins";

console.log("[NodowaEconomy] Plugin Nodowa Economy Connector v3.0.0 (Web Sync & Direct /link) cargado.");

// ── Helpers HTTP con @minecraft/server-net ─────────────────────
async function httpGet(url) {
  try {
    const net = await import("@minecraft/server-net");
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Get;
    const resp = await net.http.request(req);
    if (!resp || !resp.body) return null;
    const bodyStr = String(resp.body).trim();
    if (bodyStr.startsWith("<")) return null;
    return JSON.parse(bodyStr);
  } catch (_) {
    return null;
  }
}

async function httpPost(url, body) {
  try {
    const net = await import("@minecraft/server-net");
    const req = new net.HttpRequest(url);
    req.method = net.HttpRequestMethod.Post;
    req.body = JSON.stringify(body);
    req.headers = [new net.HttpHeader("Content-Type", "application/json")];
    const resp = await net.http.request(req);
    if (!resp || !resp.body) return null;
    const bodyStr = String(resp.body).trim();
    if (bodyStr.startsWith("<")) return null;
    return JSON.parse(bodyStr);
  } catch (_) {
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

function getScoreboardBalance(player) {
  try {
    const objective = world.scoreboard.getObjective(SCOREBOARD_NAME);
    if (!objective || !player.scoreboardIdentity) return 0;
    const score = objective.getScore(player.scoreboardIdentity);
    return score !== undefined ? score : 0;
  } catch (_) {
    return 0;
  }
}

function setScoreboardBalance(player, amount) {
  try {
    const objective = world.scoreboard.getObjective(SCOREBOARD_NAME);
    if (objective && player.scoreboardIdentity) {
      objective.setScore(player.scoreboardIdentity, Math.max(0, Math.floor(amount)));
    }
  } catch (_) {}
}

// ── Sincronización Real con el Backend Web (Web = Single Source of Truth) ──
async function syncWebBalance(player) {
  try {
    const res = await httpGet(`${BACKEND_URL}/api/addon/get-balance?player=${encodeURIComponent(player.name)}`);
    if (res && res.ok && res.wallet !== undefined) {
      setScoreboardBalance(player, res.wallet);
      return res.wallet;
    }
  } catch (_) {}
  return getScoreboardBalance(player);
}

async function syncBalanceToWeb(player, amount) {
  setScoreboardBalance(player, amount);
  try {
    await httpPost(`${BACKEND_URL}/api/addon/sync-balance`, {
      player: player.name,
      balance: amount
    });
  } catch (_) {}
}

// ── Evento de Entrada / Spawn ─────────────────────────────────
world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;

  system.runTimeout(async () => {
    try {
      const bal = await syncWebBalance(player);
      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5§l✦ BIENVENIDO A NODOWA NETWORK ✦`);
      player.sendMessage(`§fTienda Web & Mercado: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§6🎁 §e¡Reclama §a§l+500 Nodocoins GRATIS §ede Bienvenida!`);
      player.sendMessage(`§71. Entra a §dhttps://${WEB_DOMAIN} §7y pon tu nombre.`);
      player.sendMessage(`§72. Escribe aquí el comando: §e/link <código>`);
      player.sendMessage(`§fTu Saldo en Mano: §e§l${bal.toLocaleString()} Nodocoins§r`);
      player.sendMessage(`§d========================================`);
      try { player.playSound("random.levelup", { volume: 0.7, pitch: 1.2 }); } catch (_) {}

      // Verificación automática de entregas pendientes en la tienda
      await checkDeliveriesForPlayer(player, false);
    } catch (_) {}
  }, 40);
});

// ── Verificación Periódica de Compras y Comandos (Cada 30s) ───
system.runInterval(async () => {
  for (const player of world.getAllPlayers()) {
    try {
      await checkDeliveriesForPlayer(player, false);
    } catch (_) {}
  }
}, 600);

// ── Contador Discreto de Renta OP en la Actionbar ─────────────
system.runInterval(async () => {
  try {
    for (const player of world.getAllPlayers()) {
      if (player.isOp || player.isOp?.()) {
        const res = await httpGet(`${BACKEND_URL}/api/staff/my-status/${encodeURIComponent(player.name)}`);
        if (res && res.ok && res.activeRental) {
          const { daysLeft, hoursLeft } = res.activeRental;
          const timeStr = daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` : `${hoursLeft}h`;
          try {
            player.onScreenDisplay.setActionBar(`§e[OP] Quedan: §f${timeStr} §7| Nodowa`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}, 200); // Cada 10 segundos

async function showBalance(player) {
  const bal = await syncWebBalance(player);
  player.sendMessage(`§d[Billetera Web] §fTu saldo en mano es: §e§l${bal.toLocaleString()} Nodocoins§r`);
  player.sendMessage(`§7(Tus ahorros en el Banco están seguros en la web ganando +1% de interés diario)`);
  try { player.playSound("random.orb", { volume: 0.6, pitch: 1.1 }); } catch (_) {}
}

// ── Entregas de la Tienda Web (Buzón) ──────────────────────────
async function checkDeliveriesForPlayer(player, notifyEmpty = true) {
  if (notifyEmpty) {
    player.sendMessage(`§a[Buzón Web] §fVerificando compras pendientes...`);
  }

  try {
    const res = await httpGet(`${BACKEND_URL}/api/addon/pending-deliveries?player=${encodeURIComponent(player.name)}`);
    if (res && res.ok && Array.isArray(res.deliveries) && res.deliveries.length > 0) {
      let count = 0;
      for (const del of res.deliveries) {
        const cmdsToRun = [];
        if (typeof del.command === "string" && del.command.trim()) {
          cmdsToRun.push(del.command);
        }
        if (Array.isArray(del.commands)) {
          for (const c of del.commands) {
            if (typeof c === "string" && c.trim()) cmdsToRun.push(c);
          }
        }

        for (const cmd of cmdsToRun) {
          const cleanCmd = cmd.trim();
          const finalCmd = cleanCmd.replace(/\{player\}/g, `"${player.name}"`);
          const cmdToExec = finalCmd.startsWith("/") ? finalCmd.slice(1) : finalCmd;
          
          try {
            player.runCommand(cmdToExec);
          } catch (e1) {
            try {
              player.dimension.runCommand(cmdToExec);
            } catch (e2) {
              try {
                world.getDimension("overworld").runCommand(cmdToExec);
              } catch (e3) {
                console.warn(`[NodowaEconomy] Error ejecutando comando de entrega "${cmdToExec}":`, e3.message);
              }
            }
          }
        }

        await httpPost(`${BACKEND_URL}/api/addon/ack-delivery`, { deliveryId: del.id });
        count++;
      }
      player.sendMessage(`§a✓ ¡Se han entregado §e${count} §ecompras de la tienda web!`);
      try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.0 }); } catch (_) {}
      await syncWebBalance(player);
      return;
    }
  } catch (err) {
    console.warn("[NodowaEconomy] Error procesando entregas:", err);
  }

  if (notifyEmpty) {
    player.sendMessage(`§7[Buzón Web] No tienes entregas pendientes.`);
    try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}
  }
}

// ── Transferencias de Monedas P2P ─────────────────────────────
async function handlePayCommand(sender, targetName, amount) {
  const numAmount = parseInt(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    sender.sendMessage(`§cUso: /pagar <jugador> <monto>`);
    return;
  }

  const senderBal = await syncWebBalance(sender);
  if (senderBal < numAmount) {
    sender.sendMessage(`§cSaldo en mano insuficiente. Tienes §e${senderBal.toLocaleString()} NC §cen tu billetera en mano.`);
    sender.sendMessage(`§7(Retira dinero de tu Banco en la web si deseas transferir tus ahorros)`);
    return;
  }

  let targetPlayer = null;
  for (const p of world.getAllPlayers()) {
    if (p.name.toLowerCase() === targetName.toLowerCase()) {
      targetPlayer = p;
      break;
    }
  }

  try {
    const res = await httpPost(`${BACKEND_URL}/api/wallet/transfer`, {
      from: sender.name,
      to: targetName,
      amount: numAmount
    });

    if (res && res.ok) {
      const newSenderBal = res.senderWallet !== undefined ? Math.floor(res.senderWallet) : Math.max(0, senderBal - numAmount);
      setScoreboardBalance(sender, newSenderBal);

      if (targetPlayer) {
        syncWebBalance(targetPlayer);
      }

      sender.sendMessage(`§a✓ Has transferido §e${numAmount.toLocaleString()} Nodocoins §aa §f${res.receipt ? res.receipt.to : targetName}§a.`);
      sender.sendMessage(`§d[Billetera Web] §fNuevo saldo en mano: §e§l${newSenderBal.toLocaleString()} Nodocoins§r`);

      if (targetPlayer) {
        targetPlayer.sendMessage(`§a✓ ¡Recibiste §e${numAmount.toLocaleString()} Nodocoins §ade parte de §f${sender.name}§a!`);
      }
      try {
        sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 });
        if (targetPlayer) targetPlayer.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
      } catch (_) {}
    } else {
      sender.sendMessage(`§cError: ${res ? (res.error || "No se pudo realizar la transferencia") : "Error de comunicación"}`);
    }
  } catch (err) {
    sender.sendMessage(`§cError al conectar con el servidor web.`);
  }
}

// ── Vinculación Real con la Web (/link <code>) ─────────────────
async function handleLinkCode(player, code) {
  const cleanCode = String(code || "").replace(/['"]/g, "").trim();
  if (!cleanCode) {
    player.sendMessage(`§d========================================`);
    player.sendMessage(`§5§l✦ CÓMO VINCULAR TU CUENTA ✦`);
    player.sendMessage(`§f1. Entra desde tu móvil o PC a: §dhttps://${WEB_DOMAIN}`);
    player.sendMessage(`§f2. Escribe tu Gamertag: §b${player.name}`);
    player.sendMessage(`§f3. La web te dará un código de 6 dígitos.`);
    player.sendMessage(`§f4. Escribe en Minecraft: §e/link <código>`);
    player.sendMessage(`§6🎁 ¡Recibirás §a§l+500 Nodocoins GRATIS §6al instante!`);
    player.sendMessage(`§d========================================`);
    return;
  }

  player.sendMessage(`§d[Nodowa Auth] §fValidando código §e${cleanCode} §fcon https://${WEB_DOMAIN}...`);

  try {
    const result = await httpPost(`${BACKEND_URL}/api/auth/verify-link`, {
      code: cleanCode,
      player: player.name,
      xuid: player.id ?? null
    });

    if (result && result.ok) {
      player.sendMessage(`§a========================================`);
      player.sendMessage(`§a§l✓ ¡CUENTA VINCULADA CON ÉXITO!`);
      player.sendMessage(`§fTu cuenta §b${player.name} §fha sido conectada a §dhttps://${WEB_DOMAIN}`);
      if (result.bonusAwarded) {
        player.sendMessage(`§6🎁 ¡Has recibido §e§l+${result.bonusAmount || 500} Nodocoins §6de Bono de Bienvenida!`);
        player.sendMessage(`§a¡Ya puedes gastarlos en la tienda web o en el mercado!`);
      }
      player.sendMessage(`§a========================================`);
      try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}

      // Sincronizar saldo inicial
      await syncWebBalance(player);
    } else {
      player.sendMessage(`§c✗ ERROR: ${result?.error || "El código no existe o ha expirado."}`);
      player.sendMessage(`§7Entra a §dhttps://${WEB_DOMAIN} §7para generar uno nuevo.`);
      try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
    }
  } catch (err) {
    console.error("[NodowaEconomy] HTTP Link Error:", err);
    player.sendMessage(`§c✗ Error de conexión con el servidor web (${err.message ?? err})`);
    try { player.playSound("note.bass", { volume: 0.8, pitch: 0.5 }); } catch (_) {}
  }
}

// ── Formulario UI Nativo de Bedrock (importación dinámica) ────
function openMainMenu(player) {
  system.runTimeout(async () => {
    try {
      const bal = await syncWebBalance(player);
      const form = new ActionFormData();
      form.title("§5✦ ECONOMÍA NODOWA ✦");
      form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo en Mano (Billetera): §e§l${bal.toLocaleString()} Nodocoins\n§7(Tus ahorros del Banco se guardan en la web)\n\n§7Tienda Web: §dhttps://${WEB_DOMAIN}`);

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
          player.sendMessage(`§d[Nodowa Link] §fInicia sesión en la web y escribe §e/link <código>§f.`);
        }
      }).catch(() => {});
    } catch (_) {
      showBalance(player);
    }
  }, 2);
}

function openPayModal(player) {
  system.runTimeout(async () => {
    try {
      const bal = await syncWebBalance(player);
      const form = new ModalFormData();
      form.title("§6✦ TRANSFERIR NODOCOINS ✦");
      form.textField(`Saldo en Mano: ${bal.toLocaleString()} NC\n\nNombre del Jugador:`, "Ej. Steve");
      form.textField("Cantidad a transferir:", "Ej. 500");

      form.show(player).then((res) => {
        if (res.canceled) return;
        const [target, amountStr] = res.formValues;
        const amount = parseInt(amountStr);
        if (!target || isNaN(amount) || amount <= 0) return;
        handlePayCommand(player, target, amount);
      }).catch(() => {});
    } catch (_) {
      player.sendMessage(`§cUso: /pagar <jugador> <monto>`);
    }
  }, 2);
}


// ── Registro de Comandos Nativos (SÍNCRONO) ─────────────────────

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  const reg = (name, desc, mandatory, optional, fn) => {
    try {
      customCommandRegistry.registerCommand({
        name,
        description: desc,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        ...(mandatory && mandatory.length > 0 ? { mandatoryParameters: mandatory } : {}),
        ...(optional && optional.length > 0 ? { optionalParameters: optional } : {})
      }, fn);
    } catch (e) {
      console.warn("[NodowaEconomy] Skip " + name + ": " + e.message);
    }
  };

  // Safe Player Resolver
  const runForPlayerName = (o, callback) => {
    try {
      const p = o.initiator ?? o.sourceEntity;
      if (p && p instanceof Player) {
        const name = p.name;
        system.run(() => {
          try {
            const freshPlayer = world.getAllPlayers().find(x => x.name === name);
            if (freshPlayer) callback(freshPlayer);
          } catch (_) {}
        });
      }
    } catch (_) {}
    return { status: CustomCommandStatus.Success };
  };

  reg("eco:menu", "Abre el menú de economía y utilidades", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  reg("eco:tienda", "Abre la información y tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  reg("eco:web", "Abre la información y tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  reg("eco:saldo", "Consulta tu saldo de Nodocoins en mano", null, null, (o) => {
    return runForPlayerName(o, (p) => showBalance(p));
  });

  reg("eco:link", "Vincula tu cuenta con la web (/link <código>)", null, [
    { name: "codigo", type: CustomCommandParamType.Integer }
  ], (o, codigo) => {
    return runForPlayerName(o, (p) => handleLinkCode(p, codigo !== undefined ? String(codigo) : ""));
  });

  reg("eco:pagar", "Transfiere Nodocoins en mano a un jugador (/pagar <jugador> <monto>)", [
    { name: "jugador", type: CustomCommandParamType.String },
    { name: "cantidad", type: CustomCommandParamType.Integer }
  ], null, (o, jugador, cantidad) => {
    return runForPlayerName(o, (p) => handlePayCommand(p, jugador, cantidad));
  });

  reg("eco:buzon", "Revisa entregas pendientes de la tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => checkDeliveriesForPlayer(p));
  });

  console.log("[NodowaEconomy] Comandos nativos registrados: /eco:tienda, /eco:link, /eco:saldo, /eco:pagar, /eco:buzon, /eco:menu");
});

// ── Sincronización Automática de Admins / Staff con Web (admin:list) ──
const BANNED_TEST_NAMES = ["tw3sempai", "abuelong", "slynderly"];

async function syncStaffWithBackend() {
  try {
    let localAdmins = [];
    try {
      const raw = world.getDynamicProperty("admin:list");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localAdmins = parsed.filter(n => !BANNED_TEST_NAMES.includes(String(n).trim().toLowerCase()));
        }
      }
    } catch (_) {}

    const res = await httpPost(`${BACKEND_URL}/api/addon/staff/sync`, {
      inGameAdmins: localAdmins
    });

    if (res && res.ok && Array.isArray(res.staff)) {
      const webAdmins = res.staff
        .filter(s => s.role === "admin")
        .map(s => s.username)
        .filter(n => !BANNED_TEST_NAMES.includes(String(n).trim().toLowerCase()));
      try {
        world.setDynamicProperty("admin:list", JSON.stringify(webAdmins));
      } catch (_) {}
      return res.staff;
    }
  } catch (err) {
    console.warn("[NodowaEconomy] Error al sincronizar staff:", err);
  }
  return null;
}

// Sincronizar staff al inicio y periódicamente cada 4 segundos (80 ticks)
system.runTimeout(() => {
  syncStaffWithBackend();
}, 40);

system.runInterval(() => {
  syncStaffWithBackend();
}, 80);

// ── Comandos In-Game de Staff/Admins (/admins, /adminadd, /admindel) ──
async function handleAdminsListCommand(player) {
  try {
    const staffList = (await syncStaffWithBackend()) || (await httpGet(`${BACKEND_URL}/api/addon/staff/list`))?.staff;
    if (staffList && Array.isArray(staffList)) {
      if (staffList.length === 0) {
        player.sendMessage(`§7[ADMINS] No hay miembros de staff o admins registrados.`);
        return;
      }
      player.sendMessage(`§d========================================`);
      player.sendMessage(`§5[STAFF] LISTA DE ADMINISTRADORES Y OPS`);
      for (const s of staffList) {
        const timeStr = s.daysLeft !== null ? `(${s.daysLeft} dias restantes)` : `(Permanente)`;
        player.sendMessage(`§e- §f${s.username} §7- §b${s.label || s.role} §7${timeStr}`);
      }
      player.sendMessage(`§d========================================`);
    } else {
      player.sendMessage(`§cError al obtener lista de admins.`);
    }
  } catch (_) {
    player.sendMessage(`§cError de conexion con la web.`);
  }
}

async function handleAdminAddCommand(player, targetName, daysStr) {
  if (!targetName) {
    player.sendMessage(`§cUso: /adminadd <jugador> [dias]`);
    return;
  }
  const days = parseInt(daysStr) || 30;

  try {
    const res = await httpPost(`${BACKEND_URL}/api/addon/staff/manage`, {
      action: "assign",
      username: targetName,
      days,
      role: "op_rented"
    });
    if (res && res.ok) {
      player.sendMessage(`§a[ADMIN] ${res.message || `OP/Admin ${targetName} registrado.`}`);
      await syncStaffWithBackend();
      await checkDeliveriesForPlayer(player, false);
    } else {
      player.sendMessage(`§cError: ${res?.error || "No se pudo registrar admin"}`);
    }
  } catch (_) {
    player.sendMessage(`§cError de conexion con la web.`);
  }
}

async function handleAdminDelCommand(player, targetName) {
  if (!targetName) {
    player.sendMessage(`§cUso: /admindel <jugador>`);
    return;
  }

  try {
    const res = await httpPost(`${BACKEND_URL}/api/addon/staff/manage`, {
      action: "revoke",
      username: targetName
    });
    if (res && res.ok) {
      player.sendMessage(`§a[ADMIN] Permisos revocados de ${targetName}.`);
      await syncStaffWithBackend();
      await checkDeliveriesForPlayer(player, false);
    } else {
      player.sendMessage(`§cError: ${res?.error || "No se pudo revocar admin"}`);
    }
  } catch (_) {
    player.sendMessage(`§cError de conexion con la web.`);
  }
}

// ── Captura de Chat Universal (!tienda, !link, !admins, /admins) ──
if (world.beforeEvents && world.beforeEvents.chatSend) {
  const ECONOMY_COMMANDS = new Set([
    "menu", "saldo", "bal", "dinero", "money", "eco",
    "pagar", "pay", "link", "buzon", "reclamar", "tienda", "web",
    "admins", "adminlist", "adminadd", "admindel"
  ]);

  world.beforeEvents.chatSend.subscribe((event) => {
    try {
      const { sender, message } = event;
      if (!sender || !message) return;
      const trimmed = message.trim();
      if (!trimmed) return;

      const firstChar = trimmed.charAt(0);
      const isPrefix = firstChar === "/" || firstChar === "!" || firstChar === "." || firstChar === ";";
      if (!isPrefix) return;

      const cmdLine = trimmed.slice(1).trim();
      const parts = cmdLine.split(/\s+/);
      const rawCmd = (parts[0] || "").toLowerCase();
      const cmd = rawCmd.includes(":") ? rawCmd.split(":")[1] : rawCmd;

      if (ECONOMY_COMMANDS.has(cmd)) {
        try { event.cancel = true; } catch (_) {}
        const senderName = sender.name;
        system.run(() => {
          try {
            const p = world.getAllPlayers().find(x => x.name === senderName);
            if (!p) return;
            if (cmd === "saldo" || cmd === "bal" || cmd === "money" || cmd === "dinero") showBalance(p);
            else if (cmd === "menu" || cmd === "eco" || cmd === "tienda" || cmd === "web") openMainMenu(p);
            else if (cmd === "link") handleLinkCode(p, parts[1] || "");
            else if ((cmd === "pagar" || cmd === "pay") && parts[1] && parts[2]) handlePayCommand(p, parts[1], parseInt(parts[2]));
            else if (cmd === "buzon" || cmd === "reclamar") checkDeliveriesForPlayer(p);
            else if (cmd === "admins" || cmd === "adminlist") handleAdminsListCommand(p);
            else if (cmd === "adminadd") handleAdminAddCommand(p, parts[1], parts[2]);
            else if (cmd === "admindel") handleAdminDelCommand(p, parts[1]);
          } catch (_) {}
        });
      }
    } catch (_) {}
  });
}

// ── Anuncios Periódicos Automáticos de la Tienda y Bono de Bienvenida (Cada 6 min) ──
const BROADCAST_MESSAGES = [
  [
    `§e========================================`,
    `§6§l🎁 ¡BONO DE BIENVENIDA DE 500 NODOCOINS!`,
    `§f1. Entra a §dhttps://${WEB_DOMAIN} §fy escribe tu Gamertag.`,
    `§f2. Escribe en el chat: §e/link <código>`,
    `§a¡Gana +500 Nodocoins gratis para comprar en la tienda!`,
    `§e========================================`
  ],
  [
    `§d========================================`,
    `§5§l✦ TIENDA & MERCADO P2P NODOWA ✦`,
    `§7Visita §dhttps://${WEB_DOMAIN} §7para comprar minerales, TNTs y rangos.`,
    `§7¡O publica tus propios ítems para ganar Nodocoins vendiendo a otros!`,
    `§d========================================`
  ],
  [
    `§a========================================`,
    `§2§l✦ BÓVEDA DEL BANCO (+1% INTERÉS DIARIO) ✦`,
    `§7Guarda tus Nodocoins en el Banco en §dhttps://${WEB_DOMAIN}§7.`,
    `§f¡Tus ahorros crecen solos con un +1% de interés diario automático!`,
    `§a========================================`
  ]
];

let broadcastIdx = 0;
system.runInterval(() => {
  try {
    const lines = BROADCAST_MESSAGES[broadcastIdx % BROADCAST_MESSAGES.length];
    broadcastIdx++;
    for (const p of world.getAllPlayers()) {
      for (const l of lines) {
        p.sendMessage(l);
      }
      try { p.playSound("random.orb", { volume: 0.4, pitch: 1.2 }); } catch (_) {}
    }
  } catch (_) {}
}, 20 * 60 * 6); // Cada 6 minutos (7200 ticks)

