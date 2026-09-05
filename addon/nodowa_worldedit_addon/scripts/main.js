import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus,
  EquipmentSlot,
  BlockPermutation,
  PlayerPermissionLevel
} from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

console.log("[NodowaWorldEdit] Pincel WorldEdit v1.2.0 (Solo OPs) iniciando...");

const BRUSH_ITEMS = new Set([
  "minecraft:golden_hoe",
  "minecraft:golden_carrot",
  "minecraft:wooden_axe",
  "minecraft:stick"
]);

const playerBrushSettings = new Map();
const playerCooldowns = new Map();

function isOperator(player) {
  if (!player) return false;
  try {
    if (player.hasTag("admin") || player.hasTag("op") || player.hasTag("staff")) return true;
    if (player.playerPermissionLevel !== undefined) {
      if (player.playerPermissionLevel === PlayerPermissionLevel.Operator ||
          player.playerPermissionLevel === 2 ||
          String(player.playerPermissionLevel).toLowerCase() === "operator") {
        return true;
      }
    }
    if (player.commandPermissionLevel !== undefined && player.commandPermissionLevel > 0) {
      return true;
    }
    if (typeof player.isOp === "function" && player.isOp()) return true;
    if (player.isOp === true) return true;
    if (typeof player.getOp === "function" && player.getOp() > 0) return true;
  } catch (_) {}
  return false;
}

function getPlayerBrush(playerName) {
  if (!playerBrushSettings.has(playerName)) {
    playerBrushSettings.set(playerName, {
      enabled: true,
      shape: 0,
      radius: 4,
      blockType: "minecraft:stone"
    });
  }
  return playerBrushSettings.get(playerName);
}

function canUseBrush(playerName) {
  const now = Date.now();
  const last = playerCooldowns.get(playerName) || 0;
  if (now - last < 200) return false;
  playerCooldowns.set(playerName, now);
  return true;
}

const COMMON_BLOCKS = [
  { name: "Piedra",           id: "minecraft:stone" },
  { name: "Cristal",          id: "minecraft:glass" },
  { name: "Hormigon Blanco",  id: "minecraft:white_concrete" },
  { name: "Hormigon Negro",   id: "minecraft:black_concrete" },
  { name: "Hormigon Rojo",    id: "minecraft:red_concrete" },
  { name: "Hormigon Azul",    id: "minecraft:blue_concrete" },
  { name: "Ladrillos Piedra", id: "minecraft:stone_bricks" },
  { name: "Madera Roble",     id: "minecraft:oak_planks" },
  { name: "Obsidiana",        id: "minecraft:obsidian" },
  { name: "TNT",              id: "minecraft:tnt" },
  { name: "Linterna de Mar",  id: "minecraft:sea_lantern" },
  { name: "Cuarzo Liso",      id: "minecraft:smooth_quartz" },
  { name: "Bloque Diamante",  id: "minecraft:diamond_block" },
  { name: "Bloque Oro",       id: "minecraft:gold_block" },
  { name: "Bloque Hierro",    id: "minecraft:iron_block" },
  { name: "Bloque Netherite", id: "minecraft:netherite_block" },
  { name: "Tierra",           id: "minecraft:dirt" },
  { name: "Arena",            id: "minecraft:sand" },
  { name: "Aire (Borrar)",    id: "minecraft:air" }
];

async function openBrushConfigModal(player) {
  try {
    if (!isOperator(player)) {
      player.sendMessage("§c[WorldEdit] Solo los administradores / operadores pueden usar el Pincel WorldEdit.");
      return;
    }
    const brush = getPlayerBrush(player.name);
    const form = new ModalFormData();
    form.title("Pincel WorldEdit (Admin)");
    form.toggle("Activar Pincel", { defaultValue: brush.enabled });
    form.dropdown("Forma", [
      "Esfera Solida",
      "Esfera Hueca",
      "Cilindro",
      "Cubo",
      "Borrador de Aire"
    ], { defaultValueIndex: brush.shape });
    form.slider("Radio (bloques)", 1, 15, { valueStep: 1, defaultValue: brush.radius });
    const blockNames = COMMON_BLOCKS.map(b => b.name);
    let selIdx = COMMON_BLOCKS.findIndex(b => b.id === brush.blockType);
    if (selIdx < 0) selIdx = 0;
    form.dropdown("Material", blockNames, { defaultValueIndex: selIdx });
    form.textField("ID exacto (opcional):", "ej: minecraft:stone", { defaultValue: "" });

    const res = await form.show(player);
    if (!res || res.canceled) return;
    const [enabled, shape, radius, blockIdx, customBlock] = res.formValues;
    brush.enabled = !!enabled;
    brush.shape = shape;
    brush.radius = Math.max(1, Math.min(15, Math.floor(radius)));
    const c = (customBlock || "").trim().toLowerCase();
    if (c && c.length > 2) {
      brush.blockType = c.includes(":") ? c : "minecraft:" + c;
    } else {
      brush.blockType = COMMON_BLOCKS[blockIdx] ? COMMON_BLOCKS[blockIdx].id : "minecraft:stone";
    }
    const shapeNames = ["Esfera Solida", "Esfera Hueca", "Cilindro", "Cubo", "Borrador"];
    player.sendMessage("§a===== PINCEL WORLDEDIT (ADMIN) =====");
    player.sendMessage("§fEstado: " + (brush.enabled ? "§aACTIVADO" : "§cDESACTIVADO"));
    player.sendMessage("§fForma: §e" + shapeNames[brush.shape]);
    player.sendMessage("§fRadio: §e" + brush.radius + " bloques");
    player.sendMessage("§fMaterial: §b" + brush.blockType);
    player.sendMessage("§eHerramientas: §fPalo, Azadón de Oro, Hacha de Madera, Zanahoria Dorada");
    player.sendMessage("§7Click en bloque = pintar. Agachado + Click = reabrir este menú.");
    player.sendMessage("§a==================================");
    try { player.playSound("random.levelup", { volume: 0.8, pitch: 1.3 }); } catch (_) {}
  } catch (err) {
    player.sendMessage("§cError pincel: " + err.message);
    console.warn("[WorldEdit] Modal error:", err.message);
  }
}

function setSingleBlock(dim, x, y, z, bt, perm) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (!b) return false;
    if (perm) {
      b.setPermutation(perm);
      return true;
    }
    b.setType(bt);
    return true;
  } catch (_) {
    try {
      b.setType(bt);
      return true;
    } catch (_) {
      return false;
    }
  }
}

function applyBrushShape(player, centerPos) {
  if (!isOperator(player)) return;
  const brush = getPlayerBrush(player.name);
  if (!brush || !brush.enabled) {
    player.sendMessage("§e[WorldEdit] El pincel está desactivado. Agáchate y haz click para configurarlo y activarlo.");
    return;
  }
  if (!canUseBrush(player.name)) return;

  const dim = player.dimension;
  const r = brush.radius;
  const bt = brush.shape === 4 ? "minecraft:air" : brush.blockType;
  const cx = Math.floor(centerPos.x);
  const cy = Math.floor(centerPos.y);
  const cz = Math.floor(centerPos.z);

  system.run(() => {
    try {
      let perm = null;
      try {
        perm = BlockPermutation.resolve(bt);
      } catch (err) {
        console.warn("[WorldEdit] Permutation fallback for " + bt + ": " + err.message);
      }

      let placed = 0;
      if (brush.shape === 0 || brush.shape === 1 || brush.shape === 4) {
        const r2 = (r + 0.5) * (r + 0.5);
        const ir2 = Math.max(0, (r - 1.0) * (r - 1.0));
        const hollow = brush.shape === 1;
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              const d2 = dx*dx + dy*dy + dz*dz;
              if (d2 <= r2 && (!hollow || d2 >= ir2)) {
                const ty = cy + dy;
                if (ty >= -64 && ty <= 319) {
                  if (setSingleBlock(dim, cx+dx, ty, cz+dz, bt, perm)) placed++;
                }
              }
            }
          }
        }
      } else if (brush.shape === 2) {
        const r2 = (r + 0.5) * (r + 0.5);
        const halfH = Math.min(r, 6);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx*dx + dz*dz <= r2) {
              for (let dy = -halfH; dy <= halfH; dy++) {
                const ty = cy + dy;
                if (ty >= -64 && ty <= 319) {
                  if (setSingleBlock(dim, cx+dx, ty, cz+dz, bt, perm)) placed++;
                }
              }
            }
          }
        }
      } else if (brush.shape === 3) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
              const ty = cy + dy;
              if (ty >= -64 && ty <= 319) {
                if (setSingleBlock(dim, cx+dx, ty, cz+dz, bt, perm)) placed++;
              }
            }
          }
        }
      }

      if (placed > 0) {
        player.sendMessage("§a[WorldEdit] §f" + placed + " bloques -> §b" + bt);
        try { player.playSound("beacon.activate", { volume: 0.3, pitch: 1.6 }); } catch (_) {}
      } else {
        player.sendMessage("§c[WorldEdit] No se pudo colocar el bloque '" + bt + "'. Verifica que el ID sea valido.");
      }
    } catch (e) {
      console.warn("[WorldEdit] applyBrush error:", e.message);
      player.sendMessage("§c[WorldEdit] Error aplicando pincel: " + e.message);
    }
  });
}

// 1. Click derecho en bloque (playerInteractWithBlock)
try {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    try {
      const { player, block, itemStack } = event;
      if (!player || !(player instanceof Player)) return;
      if (!itemStack || !BRUSH_ITEMS.has(itemStack.typeId)) return;
      // SI NO ES OPERADOR, NO HACER NADA (ignorar completamente para no interferir con jugadores normales)
      if (!isOperator(player)) return;

      // Cancelar accion original de herramienta para operadores usando el pincel
      event.cancel = true;

      const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
      system.run(() => {
        if (player.isSneaking) {
          openBrushConfigModal(player);
        } else {
          applyBrushShape(player, loc);
        }
      });
    } catch (err) {
      console.warn("[WorldEdit] playerInteractWithBlock error:", err.message);
    }
  });
  console.log("[WorldEdit] Listener playerInteractWithBlock (Solo OP) registrado.");
} catch (e) {
  console.warn("[WorldEdit] playerInteractWithBlock subscribe failed:", e.message);
}

// 2. Click izquierdo / golpe en bloque (entityHitBlock)
try {
  world.afterEvents.entityHitBlock.subscribe((event) => {
    try {
      const { damagingEntity, hitBlock } = event;
      if (!damagingEntity || !(damagingEntity instanceof Player)) return;
      const player = damagingEntity;
      // SI NO ES OPERADOR, NO HACER NADA
      if (!isOperator(player)) return;

      const equippable = player.getComponent("minecraft:equippable");
      const item = equippable ? equippable.getEquipment(EquipmentSlot.Mainhand) : null;
      if (!item || !BRUSH_ITEMS.has(item.typeId)) return;

      const loc = { x: hitBlock.location.x, y: hitBlock.location.y, z: hitBlock.location.z };
      system.run(() => {
        if (player.isSneaking) {
          openBrushConfigModal(player);
        } else {
          applyBrushShape(player, loc);
        }
      });
    } catch (err) {
      console.warn("[WorldEdit] entityHitBlock error:", err.message);
    }
  });
  console.log("[WorldEdit] Listener entityHitBlock (Solo OP) registrado.");
} catch (e) {
  console.warn("[WorldEdit] entityHitBlock subscribe failed:", e.message);
}

// 3. Click derecho al aire / apuntando a distancia (itemUse)
try {
  world.afterEvents.itemUse.subscribe((event) => {
    try {
      const { source, itemStack } = event;
      if (!source || !(source instanceof Player)) return;
      if (!itemStack || !BRUSH_ITEMS.has(itemStack.typeId)) return;
      // SI NO ES OPERADOR, NO HACER NADA
      if (!isOperator(source)) return;

      if (source.isSneaking) {
        openBrushConfigModal(source);
      } else {
        try {
          const hit = source.getBlockFromViewDirection({ maxDistance: 50 });
          if (hit && hit.block) {
            const loc = { x: hit.block.location.x, y: hit.block.location.y, z: hit.block.location.z };
            applyBrushShape(source, loc);
          }
        } catch (_) {}
      }
    } catch (err) {
      console.warn("[WorldEdit] itemUse error:", err.message);
    }
  });
  console.log("[WorldEdit] Listener itemUse (Solo OP) registrado.");
} catch (e) {
  console.warn("[WorldEdit] itemUse subscribe failed:", e.message);
}

// Comandos nativos Bedrock con namespace (/we:brush, /we:esfera, /we:pincel, /we:menu)
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  const reg = (name, fn) => {
    try {
      customCommandRegistry.registerCommand({
        name,
        description: "Abre el menu del Pincel WorldEdit (Solo Operadores)",
        permissionLevel: CommandPermissionLevel.GameDirectors,
        cheatsRequired: false
      }, fn);
    } catch (e) {
      console.warn("[WorldEdit] Skip " + name + ": " + e.message);
    }
  };
  const run = (o, cb) => {
    try {
      const p = o.initiator || o.sourceEntity;
      if (p && p instanceof Player) {
        const n = p.name;
        system.run(() => {
          const f = world.getAllPlayers().find(x => x.name === n);
          if (f) {
            if (!isOperator(f)) {
              f.sendMessage("§c[WorldEdit] Solo los administradores / operadores pueden usar el Pincel WorldEdit.");
              return;
            }
            cb(f);
          }
        });
      }
    } catch (_) {}
    return { status: CustomCommandStatus.Success };
  };

  reg("we:brush",     o => run(o, p => openBrushConfigModal(p)));
  reg("we:esfera",    o => run(o, p => openBrushConfigModal(p)));
  reg("we:pincel",    o => run(o, p => openBrushConfigModal(p)));
  reg("we:menu",      o => run(o, p => openBrushConfigModal(p)));
  reg("we:worldedit", o => run(o, p => openBrushConfigModal(p)));
  console.log("[WorldEdit] Comandos nativos registrados (Solo OP): /we:brush, /we:esfera, /we:pincel, /we:menu");
});

// Interceptor de chat universal (/brush, /esfera, !brush, !esfera, brush, esfera, etc.)
const WE_CMDS = new Set(["brush", "esfera", "pincel", "we", "esferas", "worldedit"]);
try {
  world.beforeEvents.chatSend.subscribe((event) => {
    try {
      const { sender, message } = event;
      if (!sender || !message) return;
      const trimmed = message.trim();
      if (!trimmed) return;

      let cmd = "";
      const firstChar = trimmed.charAt(0);
      if (firstChar === "/" || firstChar === "!" || firstChar === "." || firstChar === ";" || firstChar === "-") {
        const parts = trimmed.slice(1).trim().split(/\s+/);
        const raw = (parts[0] || "").toLowerCase();
        cmd = raw.includes(":") ? raw.split(":")[1] : raw;
      } else {
        const parts = trimmed.split(/\s+/);
        const raw = (parts[0] || "").toLowerCase();
        cmd = raw.includes(":") ? raw.split(":")[1] : raw;
      }

      if (WE_CMDS.has(cmd)) {
        try { event.cancel = true; } catch (_) {}
        const sn = sender.name;
        system.run(() => {
          const p = world.getAllPlayers().find(x => x.name === sn);
          if (!p) return;
          if (!isOperator(p)) {
            p.sendMessage("§c[WorldEdit] Solo los administradores / operadores pueden usar el Pincel WorldEdit.");
            return;
          }
          openBrushConfigModal(p);
        });
      }
    } catch (err) {
      console.warn("[WorldEdit] chatSend error:", err.message);
    }
  });
  console.log("[WorldEdit] Interceptor de comandos de chat activado.");
} catch (e) {
  console.warn("[WorldEdit] chatSend subscribe failed:", e.message);
}

console.log("[NodowaWorldEdit] Pincel WorldEdit v1.2.0 (Solo OPs) inicializado completamente.");