import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus
} from "@minecraft/server";

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
    return JSON.parse(resp.body);
  } catch (e) {
    console.warn("[NodowaEconomy] HTTP GET Error:", e.message);
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
    return JSON.parse(resp.body);
  } catch (e) {
    console.warn("[NodowaEconomy] HTTP POST Error:", e.message);
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
    if (res && res.ok && res.total !== undefined) {
      setScoreboardBalance(player, res.total);
      return res.total;
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
      player.sendMessage(`§7Economía & Tienda Web Sincronizadas.`);
      player.sendMessage(`§fVisita: §dhttps://${WEB_DOMAIN}`);
      player.sendMessage(`§fSaldo Web Actual: §e§l${bal.toLocaleString()} Nodocoins`);
      player.sendMessage(`§fUsa: §e/link <código> §fo §e/saldo §fpara ver tu billetera.`);
      player.sendMessage(`§d========================================`);
      try { player.playSound("random.levelup", { volume: 0.6, pitch: 1.2 }); } catch (_) {}

      // Verificación automática de entregas pendientes en la tienda
      await checkDeliveriesForPlayer(player, false);
    } catch (_) {}
  }, 40);
});

async function showBalance(player) {
  const bal = await syncWebBalance(player);
  player.sendMessage(`§d[Billetera Web] §fTu saldo actual es: §e§l${bal.toLocaleString()} Nodocoins§r`);
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
    sender.sendMessage(`§cMonto inválido.`);
    return;
  }

  const senderBal = await syncWebBalance(sender);
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

  const newSenderBal = senderBal - numAmount;
  const targetBal = await syncWebBalance(targetPlayer);
  const newTargetBal = targetBal + numAmount;

  await syncBalanceToWeb(sender, newSenderBal);
  await syncBalanceToWeb(targetPlayer, newTargetBal);

  sender.sendMessage(`§a✓ Has transferido §e${numAmount.toLocaleString()} Nodocoins §aa §f${targetPlayer.name}§a.`);
  targetPlayer.sendMessage(`§a✓ ¡Recibiste §e${numAmount.toLocaleString()} Nodocoins §ade parte de §f${sender.name}§a!`);

  try {
    sender.playSound("random.orb", { volume: 0.8, pitch: 1.2 });
    targetPlayer.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
  } catch (_) {}
}

// ── Vinculación Real con la Web (/link <code>) ─────────────────
async function handleLinkCode(player, code) {
  const cleanCode = String(code || "").replace(/['"]/g, "").trim();
  if (!cleanCode) {
    player.sendMessage(`§cUso: /link <código de 6 dígitos>`);
    player.sendMessage(`§7Genera tu código en §dhttps://${WEB_DOMAIN}`);
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
      player.sendMessage(`§a✓ ¡Código §e${cleanCode} §averificado exitosamente!`);
      player.sendMessage(`§a✓ Tu cuenta §b${player.name} §aha sido vinculada en §dhttps://${WEB_DOMAIN}`);
      try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.2 }); } catch (_) {}

      // Sincronizar saldo inicial
      await syncWebBalance(player);
    } else {
      player.sendMessage(`§c✗ ERROR: ${result?.error || "El código no existe o ha expirado."}`);
      player.sendMessage(`§7Genera un nuevo código en §dhttps://${WEB_DOMAIN}`);
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
      const { ActionFormData } = await import("@minecraft/server-ui");
      const bal = await syncWebBalance(player);
      const form = new ActionFormData();
      form.title("§5✦ ECONOMÍA NODOWA ✦");
      form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo Web: §e§l${bal.toLocaleString()} Nodocoins\n§7Tienda: §dhttps://${WEB_DOMAIN}`);

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
      const { ModalFormData } = await import("@minecraft/server-ui");
      const bal = await syncWebBalance(player);
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
      player.sendMessage(`§cUso: /pagar <jugador> <monto>`);
    }
  }, 2);
}

// ── Registro de Comandos Nativos (SÍNCRONO) ─────────────────────
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

  // Comandos /link y /saldo directos (resumidos)
  reg("link", "Vincula tu cuenta con la web — /link <código>", [
    { name: "codigo", type: CustomCommandParamType.Integer }
  ], (o, codigo) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => handleLinkCode(p, codigo));
    return { status: CustomCommandStatus.Success };
  });

  reg("saldo", "Consulta tu saldo de Nodocoins", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => showBalance(p));
    return { status: CustomCommandStatus.Success };
  });

  // Comandos /eco:*
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

  // Comandos /nodowa:*
  reg("nodowa:menu", "Abre el menú de economía", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => openMainMenu(p));
    return { status: CustomCommandStatus.Success };
  });

  reg("nodowa:saldo", "Consulta tu saldo de Nodocoins", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => showBalance(p));
    return { status: CustomCommandStatus.Success };
  });

  reg("nodowa:link", "Vincula tu cuenta con la web", [
    { name: "codigo", type: CustomCommandParamType.Integer }
  ], (o, codigo) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => handleLinkCode(p, codigo));
    return { status: CustomCommandStatus.Success };
  });

  reg("nodowa:pagar", "Paga Nodocoins a un jugador", [
    { name: "jugador", type: CustomCommandParamType.String },
    { name: "cantidad", type: CustomCommandParamType.Integer }
  ], (o, jugador, cantidad) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => handlePayCommand(p, jugador, cantidad));
    return { status: CustomCommandStatus.Success };
  });

  reg("nodowa:buzon", "Revisa entregas pendientes", null, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure };
    system.run(() => checkDeliveriesForPlayer(p));
    return { status: CustomCommandStatus.Success };
  });

  console.log("[NodowaEconomy] v3.0.0 — Comandos /link /saldo /eco:* /nodowa:* listos.");
});

// ── Captura de Chat Opcional (!link, !saldo, !menu, !pagar, !buzon) ──
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
