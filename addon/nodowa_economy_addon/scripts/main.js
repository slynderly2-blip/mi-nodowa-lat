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
      const { ActionFormData } = await import("@minecraft/server-ui");
      const bal = await syncWebBalance(player);
      const form = new ActionFormData();
      form.title("§5✦ ECONOMÍA NODOWA ✦");
      form.body(`§fHola, §b${player.name}§f!\n\n§7Saldo en Mano (Billetera): §e§l${bal.toLocaleString()} Nodocoins\n§7(Tus ahorros del Banco se guardan en la web)\n\n§7Tienda Web: §dhttps://${WEB_DOMAIN}`);

      form.button("§d✦ Tienda Web", "textures/items/emerald");
      form.button("§6✦ Transferir Monedas", "textures/items/gold_ingot");
      form.button("§a✦ Mi Buzón", "textures/items/chest");
      form.button("§9✦ Vincular Web", "textures/items/paper");
      form.button("§e✦ Pincel de Esferas (WorldEdit)", "textures/items/golden_hoe");

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
        } else if (res.selection === 4) {
          openBrushConfigModal(player);
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

// ── Pincel de Esferas y Construcción (WorldEdit Style Brush) ──
const BRUSH_ITEMS = new Set([
  "minecraft:golden_hoe",
  "minecraft:golden_carrot",
  "minecraft:wooden_axe",
  "minecraft:stick"
]);

const playerBrushSettings = new Map();

function getPlayerBrush(playerName) {
  if (!playerBrushSettings.has(playerName)) {
    playerBrushSettings.set(playerName, {
      enabled: true,
      shape: 0, // 0: Esfera Sólida, 1: Esfera Hueca, 2: Cilindro, 3: Cubo, 4: Borrador
      radius: 4,
      blockType: "minecraft:stone"
    });
  }
  return playerBrushSettings.get(playerName);
}

const COMMON_BLOCKS = [
  { name: "Piedra (Stone)", id: "minecraft:stone" },
  { name: "Cristal Transparente", id: "minecraft:glass" },
  { name: "Hormigón Blanco", id: "minecraft:white_concrete" },
  { name: "Hormigón Negro", id: "minecraft:black_concrete" },
  { name: "Ladrillos de Piedra", id: "minecraft:stone_bricks" },
  { name: "Madera de Roble", id: "minecraft:oak_planks" },
  { name: "Obsidiana", id: "minecraft:obsidian" },
  { name: "TNT Dinamita", id: "minecraft:tnt" },
  { name: "Linterna de Mar (Luz)", id: "minecraft:sea_lantern" },
  { name: "Cuarzo Liso", id: "minecraft:smooth_quartz" },
  { name: "Diamante (Bloque)", id: "minecraft:diamond_block" },
  { name: "Oro (Bloque)", id: "minecraft:gold_block" },
  { name: "Hierro (Bloque)", id: "minecraft:iron_block" },
  { name: "Netherite (Bloque)", id: "minecraft:netherite_block" },
  { name: "Aire (Borrador)", id: "minecraft:air" }
];

async function openBrushConfigModal(player) {
  try {
    const { ModalFormData } = await import("@minecraft/server-ui");
    const brush = getPlayerBrush(player.name);
    const form = new ModalFormData();
    form.title("§5✦ PINCEL DE ESFERAS (WORLDEDIT) ✦");

    form.toggle("Activar Pincel en Mano", brush.enabled !== false);
    form.dropdown("Forma Geométrica", ["Esfera Sólida 🌕", "Esfera Hueca ⭕", "Cilindro 🏛️", "Cubo / Caja 🧊", "Borrador de Aire 💨"], brush.shape || 0);
    form.slider("Radio / Tamaño (Bloques)", 1, 12, 1, brush.radius || 4);
    
    const blockNames = COMMON_BLOCKS.map(b => b.name);
    let selectedBlockIdx = COMMON_BLOCKS.findIndex(b => b.id === brush.blockType);
    if (selectedBlockIdx < 0) selectedBlockIdx = 0;
    form.dropdown("Material Rápido", blockNames, selectedBlockIdx);

    form.textField("O escribe el ID exacto del bloque (Opcional):", "minecraft:stone", brush.blockType);

    form.show(player).then((res) => {
      if (res.canceled) return;
      const [enabled, shape, radius, blockIdx, customBlock] = res.formValues;
      brush.enabled = enabled;
      brush.shape = shape;
      brush.radius = Math.max(1, Math.min(12, Math.floor(radius)));

      const cleanCustom = (customBlock || "").trim().toLowerCase();
      if (cleanCustom && cleanCustom !== "minecraft:stone" && cleanCustom.length > 2) {
        brush.blockType = cleanCustom.includes(":") ? cleanCustom : `minecraft:${cleanCustom}`;
      } else {
        brush.blockType = COMMON_BLOCKS[blockIdx]?.id || "minecraft:stone";
      }

      player.sendMessage(`§a========================================`);
      player.sendMessage(`§5§l✦ PINCEL MÁGICO CONFIGURADO ✦`);
      player.sendMessage(`§fEstado: ${brush.enabled ? "§a§lACTIVADO" : "§cDESACTIVADO"}`);
      player.sendMessage(`§fForma: §e${["Esfera Sólida", "Esfera Hueca", "Cilindro", "Cubo", "Borrador"][brush.shape]}`);
      player.sendMessage(`§fRadio: §e${brush.radius} bloques`);
      player.sendMessage(`§fMaterial: §b${brush.blockType}`);
      player.sendMessage(`§7¡Toca cualquier superficie con una Azada Dorada, Zanahoria Dorada o Palo para pintar!`);
      player.sendMessage(`§a========================================`);
      try { player.playSound("random.levelup", { volume: 0.8, pitch: 1.3 }); } catch (_) {}
    }).catch(() => {});
  } catch (err) {
    player.sendMessage(`§cError abriendo menú de pincel: ${err.message}`);
  }
}

function applyBrushShape(player, centerPos) {
  const brush = getPlayerBrush(player.name);
  if (!brush || !brush.enabled) return;

  const dim = player.dimension;
  const r = brush.radius;
  const blockType = brush.shape === 4 ? "minecraft:air" : brush.blockType;
  const cx = Math.floor(centerPos.x);
  const cy = Math.floor(centerPos.y);
  const cz = Math.floor(centerPos.z);
  let placedCount = 0;

  system.run(() => {
    try {
      if (brush.shape === 0 || brush.shape === 1 || brush.shape === 4) {
        // Esfera (Sólida o Hueca)
        const isHollow = brush.shape === 1;
        const r2 = r * r;
        const innerR2 = (r - 1.2) * (r - 1.2);

        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 <= r2) {
                if (!isHollow || d2 >= innerR2) {
                  const targetY = cy + dy;
                  if (targetY >= -64 && targetY <= 319) {
                    const block = dim.getBlock({ x: cx + dx, y: targetY, z: cz + dz });
                    if (block) {
                      block.setType(blockType);
                      placedCount++;
                    }
                  }
                }
              }
            }
          }
        }
      } else if (brush.shape === 2) {
        // Cilindro
        const r2 = r * r;
        const height = Math.min(r * 2, 8);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dz * dz <= r2) {
              for (let dy = 0; dy < height; dy++) {
                const targetY = cy + dy;
                if (targetY >= -64 && targetY <= 319) {
                  const block = dim.getBlock({ x: cx + dx, y: targetY, z: cz + dz });
                  if (block) {
                    block.setType(blockType);
                    placedCount++;
                  }
                }
              }
            }
          }
        }
      } else if (brush.shape === 3) {
        // Cubo / Caja
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              const targetY = cy + dy;
              if (targetY >= -64 && targetY <= 319) {
                const block = dim.getBlock({ x: cx + dx, y: targetY, z: cz + dz });
                if (block) {
                  block.setType(blockType);
                  placedCount++;
                }
              }
            }
          }
        }
      }

      try { player.playSound("beacon.activate", { volume: 0.4, pitch: 1.5 }); } catch (_) {}
    } catch (e) {
      console.warn("[Brush Error]:", e.message);
    }
  });
}

// ── Eventos de Uso del Pincel con Ítems (Azada, Zanahoria Dorada, Palo) ──
if (world.afterEvents && world.afterEvents.itemUseOn) {
  world.afterEvents.itemUseOn.subscribe((event) => {
    try {
      const { source, itemStack, block } = event;
      if (!source || !(source instanceof Player)) return;
      if (!itemStack || !BRUSH_ITEMS.has(itemStack.typeId)) return;

      if (source.isSneaking) {
        openBrushConfigModal(source);
      } else {
        applyBrushShape(source, block.location);
      }
    } catch (_) {}
  });
}

if (world.afterEvents && world.afterEvents.itemUse) {
  world.afterEvents.itemUse.subscribe((event) => {
    try {
      const { source, itemStack } = event;
      if (!source || !(source instanceof Player)) return;
      if (!itemStack || !BRUSH_ITEMS.has(itemStack.typeId)) return;

      if (source.isSneaking) {
        openBrushConfigModal(source);
      }
    } catch (_) {}
  });
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

  const registerAll = (names, desc, mandatory, optional, fn) => {
    for (const name of names) {
      reg(name, desc, mandatory, optional, fn);
    }
  };

  registerAll(["menu", "eco:menu", "eco"], "Abre el menú de economía y utilidades", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  registerAll(["tienda", "eco:tienda", "shop"], "Abre la información y tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  registerAll(["web", "eco:web"], "Abre la información y tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => openMainMenu(p));
  });

  registerAll(["esfera", "eco:esfera", "brush", "eco:brush", "we", "pincel"], "Abre el menú del Pincel de Esferas (WorldEdit)", null, null, (o) => {
    return runForPlayerName(o, (p) => openBrushConfigModal(p));
  });

  registerAll(["saldo", "eco:saldo", "bal", "dinero", "money"], "Consulta tu saldo de Nodocoins en mano", null, null, (o) => {
    return runForPlayerName(o, (p) => showBalance(p));
  });

  registerAll(["link", "eco:link"], "Vincula tu cuenta con la web (/link <código>)", null, [
    { name: "codigo", type: CustomCommandParamType.String }
  ], (o, codigo) => {
    return runForPlayerName(o, (p) => handleLinkCode(p, codigo));
  });

  registerAll(["pagar", "eco:pagar", "pay"], "Transfiere Nodocoins en mano a un jugador (/pagar <jugador> <monto>)", [
    { name: "jugador", type: CustomCommandParamType.String },
    { name: "cantidad", type: CustomCommandParamType.Integer }
  ], null, (o, jugador, cantidad) => {
    return runForPlayerName(o, (p) => handlePayCommand(p, jugador, cantidad));
  });

  registerAll(["buzon", "eco:buzon", "reclamar"], "Revisa entregas pendientes de la tienda web", null, null, (o) => {
    return runForPlayerName(o, (p) => checkDeliveriesForPlayer(p));
  });

  console.log("[NodowaEconomy] Comandos nativos registrados con barra /: /tienda, /link, /esfera, /brush, /saldo, /pagar, /buzon, /menu, /web");
});

// ── Captura de Chat Universal (!tienda, !link, !esfera, !menu, /tienda, /link) ──
if (world.beforeEvents && world.beforeEvents.chatSend) {
  const ECONOMY_COMMANDS = new Set([
    "menu", "saldo", "bal", "dinero", "money", "eco",
    "pagar", "pay", "link", "buzon", "reclamar", "tienda", "web",
    "esfera", "brush", "we", "pincel", "esferas"
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
            else if (cmd === "esfera" || cmd === "brush" || cmd === "we" || cmd === "pincel" || cmd === "esferas") openBrushConfigModal(p);
            else if (cmd === "link") handleLinkCode(p, parts[1] || "");
            else if ((cmd === "pagar" || cmd === "pay") && parts[1] && parts[2]) handlePayCommand(p, parts[1], parseInt(parts[2]));
            else if (cmd === "buzon" || cmd === "reclamar") checkDeliveriesForPlayer(p);
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

