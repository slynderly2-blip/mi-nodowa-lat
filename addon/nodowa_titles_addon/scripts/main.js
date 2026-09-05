import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus
} from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

console.log("[NodowaTitles] Addon de Estadísticas y Títulos Épicos v1.0.0 iniciando...");

// ── Helpers de Estadísticas con DynamicProperties ──────────────
function getStat(player, key) {
  try {
    const val = player.getDynamicProperty(key);
    return typeof val === "number" ? val : 0;
  } catch (_) {
    return 0;
  }
}

function setStat(player, key, val) {
  try {
    player.setDynamicProperty(key, val);
  } catch (_) {}
}

function incStat(player, key, amount = 1) {
  const current = getStat(player, key);
  const next = current + amount;
  setStat(player, key, next);
  return next;
}

function getNodocoins(player) {
  try {
    const objective = world.scoreboard.getObjective("nodocoins");
    if (!objective || !player.scoreboardIdentity) return 0;
    const score = objective.getScore(player.scoreboardIdentity);
    return score !== undefined ? score : 0;
  } catch (_) {
    return 0;
  }
}

function getPlayerStats(player) {
  return {
    killsPvp:       getStat(player, "nodowa:stat_kills_pvp"),
    killsTotalMobs: getStat(player, "nodowa:stat_kills_total_mobs"),
    killsZombies:   getStat(player, "nodowa:stat_kills_zombies"),
    killsSkeletons: getStat(player, "nodowa:stat_kills_skeletons"),
    killsSpiders:   getStat(player, "nodowa:stat_kills_spiders"),
    killsCreepers:  getStat(player, "nodowa:stat_kills_creepers"),
    killsEndermen:  getStat(player, "nodowa:stat_kills_endermen"),
    killsDrowned:   getStat(player, "nodowa:stat_kills_drowned"),
    killsNether:    getStat(player, "nodowa:stat_kills_nether"),
    killsWither:    getStat(player, "nodowa:stat_kills_wither"),
    killsDragon:    getStat(player, "nodowa:stat_kills_dragon"),
    minedStone:     getStat(player, "nodowa:stat_mined_stone"),
    minedIron:      getStat(player, "nodowa:stat_mined_iron"),
    minedGold:      getStat(player, "nodowa:stat_mined_gold"),
    minedDiamond:   getStat(player, "nodowa:stat_mined_diamond"),
    minedDebris:    getStat(player, "nodowa:stat_mined_debris"),
    minedTotal:     getStat(player, "nodowa:stat_mined_total"),
    nodocoins:      getNodocoins(player)
  };
}

// ── Definición de Categorías ──────────────────────────────────
const CATEGORIES = [
  { id: "pvp",  name: "🩸 Sangre & Acero",      desc: "Eliminación de rivales en combate PvP",   icon: "textures/ui/sword" },
  { id: "pve",  name: "🏹 Caza & Pesadilla",    desc: "Caza de monstruos y jefes del mundo",     icon: "textures/ui/target" },
  { id: "mine", name: "⛏ Abismo & Núcleo",     desc: "Excavación y extracción de minerales",    icon: "textures/ui/anvil" },
  { id: "eco",  name: "🪙 Trono & Fortuna",     desc: "Riqueza y poder monetario en Nodocoins",  icon: "textures/ui/gold_ingot" },
  { id: "spec", name: "🌟 Élite & Prestigio",   desc: "Hazañas legendarias y rangos de servidor", icon: "textures/ui/crown" }
];

// ── Catálogo de Títulos Cortos, Creativos y Contundentes ───────
const TITLES = [
  // 🩸 Rama Sangre (PvP)
  {
    id: "pvp_1", cat: "pvp", name: "Novato", tag: "§7[Novato]",
    desc: "1 Jugador eliminado en combate", target: 1,
    check: (_, s) => s.killsPvp >= 1,
    progress: (_, s) => ({ current: s.killsPvp, target: 1 })
  },
  {
    id: "pvp_2", cat: "pvp", name: "Cazador", tag: "§c[Cazador]",
    desc: "3 Jugadores eliminados en combate", target: 3,
    check: (_, s) => s.killsPvp >= 3,
    progress: (_, s) => ({ current: s.killsPvp, target: 3 })
  },
  {
    id: "pvp_3", cat: "pvp", name: "Verdugo", tag: "§4[Verdugo]",
    desc: "7 Jugadores eliminados en combate", target: 7,
    check: (_, s) => s.killsPvp >= 7,
    progress: (_, s) => ({ current: s.killsPvp, target: 7 })
  },
  {
    id: "pvp_4", cat: "pvp", name: "Carnicero", tag: "§c§l[Carnicero]",
    desc: "15 Jugadores eliminados en combate", target: 15,
    check: (_, s) => s.killsPvp >= 15,
    progress: (_, s) => ({ current: s.killsPvp, target: 15 })
  },
  {
    id: "pvp_5", cat: "pvp", name: "Némesis", tag: "§4§l[Némesis]",
    desc: "30 Jugadores eliminados en combate", target: 30,
    check: (_, s) => s.killsPvp >= 30,
    progress: (_, s) => ({ current: s.killsPvp, target: 30 })
  },
  {
    id: "pvp_6", cat: "pvp", name: "Segador", tag: "§c§l[Segador]",
    desc: "60 Jugadores eliminados en combate", target: 60,
    check: (_, s) => s.killsPvp >= 60,
    progress: (_, s) => ({ current: s.killsPvp, target: 60 })
  },
  {
    id: "pvp_7", cat: "pvp", name: "Espectro", tag: "§8§l[Espectro]",
    desc: "100 Jugadores eliminados en combate", target: 100,
    check: (_, s) => s.killsPvp >= 100,
    progress: (_, s) => ({ current: s.killsPvp, target: 100 })
  },
  {
    id: "pvp_8", cat: "pvp", name: "Inmortal", tag: "§6§l[Inmortal]",
    desc: "175 Jugadores eliminados en combate", target: 175,
    check: (_, s) => s.killsPvp >= 175,
    progress: (_, s) => ({ current: s.killsPvp, target: 175 })
  },
  {
    id: "pvp_9", cat: "pvp", name: "Sádico", tag: "§5§l[Sádico]",
    desc: "250 Jugadores eliminados en combate", target: 250,
    check: (_, s) => s.killsPvp >= 250,
    progress: (_, s) => ({ current: s.killsPvp, target: 250 })
  },

  // 🏹 Rama Monstruos & Pesadilla (PvE)
  {
    id: "pve_zombie", cat: "pve", name: "Nigromante", tag: "§2[Nigromante]",
    desc: "Elimina 40 Zombis", target: 40,
    check: (_, s) => s.killsZombies >= 40,
    progress: (_, s) => ({ current: s.killsZombies, target: 40 })
  },
  {
    id: "pve_skeleton", cat: "pve", name: "Calavera", tag: "§f[Calavera]",
    desc: "Elimina 40 Esqueletos", target: 40,
    check: (_, s) => s.killsSkeletons >= 40,
    progress: (_, s) => ({ current: s.killsSkeletons, target: 40 })
  },
  {
    id: "pve_spider", cat: "pve", name: "Veneno", tag: "§8§l[Veneno]",
    desc: "Elimina 30 Arañas", target: 30,
    check: (_, s) => s.killsSpiders >= 30,
    progress: (_, s) => ({ current: s.killsSpiders, target: 30 })
  },
  {
    id: "pve_creeper", cat: "pve", name: "Dinamita", tag: "§a§l[Dinamita]",
    desc: "Elimina 25 Creepers", target: 25,
    check: (_, s) => s.killsCreepers >= 25,
    progress: (_, s) => ({ current: s.killsCreepers, target: 25 })
  },
  {
    id: "pve_enderman", cat: "pve", name: "Vórtice", tag: "§d§l[Vórtice]",
    desc: "Elimina 20 Endermans", target: 20,
    check: (_, s) => s.killsEndermen >= 20,
    progress: (_, s) => ({ current: s.killsEndermen, target: 20 })
  },
  {
    id: "pve_drowned", cat: "pve", name: "Abisal", tag: "§3[Abisal]",
    desc: "Elimina 25 Ahogados", target: 25,
    check: (_, s) => s.killsDrowned >= 25,
    progress: (_, s) => ({ current: s.killsDrowned, target: 25 })
  },
  {
    id: "pve_nether", cat: "pve", name: "Ceniza", tag: "§6[Ceniza]",
    desc: "Elimina 25 Criaturas del Nether (Blazes o Magmas)", target: 25,
    check: (_, s) => s.killsNether >= 25,
    progress: (_, s) => ({ current: s.killsNether, target: 25 })
  },
  {
    id: "pve_wither", cat: "pve", name: "Tártaro", tag: "§0§l[Tártaro]",
    desc: "Derrota a 1 Wither Boss", target: 1,
    check: (_, s) => s.killsWither >= 1,
    progress: (_, s) => ({ current: s.killsWither, target: 1 })
  },
  {
    id: "pve_dragon", cat: "pve", name: "Draconiano", tag: "§5§l[Draconiano]",
    desc: "Derrota a 1 Dragón del End", target: 1,
    check: (_, s) => s.killsDragon >= 1,
    progress: (_, s) => ({ current: s.killsDragon, target: 1 })
  },
  {
    id: "pve_total", cat: "pve", name: "Exterminador", tag: "§e§l[Exterminador]",
    desc: "Elimina 300 Monstruos en total", target: 300,
    check: (_, s) => s.killsTotalMobs >= 300,
    progress: (_, s) => ({ current: s.killsTotalMobs, target: 300 })
  },

  // ⛏ Rama Minería & Profundidades
  {
    id: "mine_stone_1", cat: "mine", name: "Topo", tag: "§8[Topo]",
    desc: "Pica 200 Bloques de Piedra o Pizarra", target: 200,
    check: (_, s) => s.minedStone >= 200,
    progress: (_, s) => ({ current: s.minedStone, target: 200 })
  },
  {
    id: "mine_stone_2", cat: "mine", name: "Pedregal", tag: "§7[Pedregal]",
    desc: "Pica 1,000 Bloques de Piedra", target: 1000,
    check: (_, s) => s.minedStone >= 1000,
    progress: (_, s) => ({ current: s.minedStone, target: 1000 })
  },
  {
    id: "mine_stone_3", cat: "mine", name: "Titanio", tag: "§f§l[Titanio]",
    desc: "Pica 3,000 Bloques de Piedra", target: 3000,
    check: (_, s) => s.minedStone >= 3000,
    progress: (_, s) => ({ current: s.minedStone, target: 3000 })
  },
  {
    id: "mine_iron", cat: "mine", name: "Hierro", tag: "§f[Hierro]",
    desc: "Extrae 60 Menas de Hierro", target: 60,
    check: (_, s) => s.minedIron >= 60,
    progress: (_, s) => ({ current: s.minedIron, target: 60 })
  },
  {
    id: "mine_gold", cat: "mine", name: "Auri", tag: "§e[Auri]",
    desc: "Extrae 35 Menas de Oro", target: 35,
    check: (_, s) => s.minedGold >= 35,
    progress: (_, s) => ({ current: s.minedGold, target: 35 })
  },
  {
    id: "mine_diamond", cat: "mine", name: "Diamante", tag: "§b§l[Diamante]",
    desc: "Extrae 25 Menas de Diamante", target: 25,
    check: (_, s) => s.minedDiamond >= 25,
    progress: (_, s) => ({ current: s.minedDiamond, target: 25 })
  },
  {
    id: "mine_debris", cat: "mine", name: "Nether", tag: "§4§l[Nether]",
    desc: "Extrae 10 Escombros Ancestrales (Debris)", target: 10,
    check: (_, s) => s.minedDebris >= 10,
    progress: (_, s) => ({ current: s.minedDebris, target: 10 })
  },
  {
    id: "mine_colossus", cat: "mine", name: "Coloso", tag: "§6§l[Coloso]",
    desc: "Extrae 30 Escombros Ancestrales (Debris)", target: 30,
    check: (_, s) => s.minedDebris >= 30,
    progress: (_, s) => ({ current: s.minedDebris, target: 30 })
  },

  // 🪙 Rama Riqueza & Trono (Economía)
  {
    id: "eco_1", cat: "eco", name: "Burgués", tag: "§a[Burgués]",
    desc: "Ten al menos 2,500 Nodocoins en mano", target: 2500,
    check: (_, s) => s.nodocoins >= 2500,
    progress: (_, s) => ({ current: s.nodocoins, target: 2500 })
  },
  {
    id: "eco_2", cat: "eco", name: "Codicioso", tag: "§e[Codicioso]",
    desc: "Ten al menos 10,000 Nodocoins en mano", target: 10000,
    check: (_, s) => s.nodocoins >= 10000,
    progress: (_, s) => ({ current: s.nodocoins, target: 10000 })
  },
  {
    id: "eco_3", cat: "eco", name: "Trono", tag: "§6[Trono]",
    desc: "Ten al menos 50,000 Nodocoins en mano", target: 50000,
    check: (_, s) => s.nodocoins >= 50000,
    progress: (_, s) => ({ current: s.nodocoins, target: 50000 })
  },
  {
    id: "eco_4", cat: "eco", name: "Monarca", tag: "§6§l[Monarca]",
    desc: "Ten al menos 150,000 Nodocoins en mano", target: 150000,
    check: (_, s) => s.nodocoins >= 150000,
    progress: (_, s) => ({ current: s.nodocoins, target: 150000 })
  },
  {
    id: "eco_5", cat: "eco", name: "Midas", tag: "§e§l[Midas]",
    desc: "Ten al menos 300,000 Nodocoins en mano", target: 300000,
    check: (_, s) => s.nodocoins >= 300000,
    progress: (_, s) => ({ current: s.nodocoins, target: 300000 })
  },

  // 🌟 Rama Élite & Prestigio
  {
    id: "spec_gladiator", cat: "spec", name: "Gladiador", tag: "§b§l[Gladiador]",
    desc: "Consigue 50 bajas PvP/PvE combinadas o Tag 'gladiador'", target: 50,
    check: (p, s) => p.hasTag("gladiador") || (s.killsPvp + s.killsTotalMobs) >= 50,
    progress: (p, s) => ({ current: p.hasTag("gladiador") ? 50 : Math.min(50, s.killsPvp + s.killsTotalMobs), target: 50 })
  },
  {
    id: "spec_eclipse", cat: "spec", name: "Eclipse", tag: "§1§l[Eclipse]",
    desc: "Poseer rango VIP en tienda web o Tag 'eclipse'", target: 1,
    check: (p) => p.hasTag("eclipse") || p.hasTag("vip"),
    progress: (p) => ({ current: (p.hasTag("eclipse") || p.hasTag("vip")) ? 1 : 0, target: 1 })
  },
  {
    id: "spec_legend", cat: "spec", name: "Legendario", tag: "§d§l[Legendario]",
    desc: "Poseer rango MVP en tienda web o Tag 'legendario'", target: 1,
    check: (p) => p.hasTag("legendario") || p.hasTag("mvp"),
    progress: (p) => ({ current: (p.hasTag("legendario") || p.hasTag("mvp")) ? 1 : 0, target: 1 })
  },
  {
    id: "spec_god", cat: "spec", name: "Dios", tag: "§e§l[Dios]",
    desc: "Rango Élite Máximo en tienda web o Tag 'dios'", target: 1,
    check: (p) => p.hasTag("dios") || p.hasTag("elite"),
    progress: (p) => ({ current: (p.hasTag("dios") || p.hasTag("elite")) ? 1 : 0, target: 1 })
  }
];

const TITLES_MAP = new Map(TITLES.map(t => [t.id, t]));

// ── Actualizador de NameTag ───────────────────────────────────
function updatePlayerNameTag(player) {
  try {
    const titleId = player.getDynamicProperty("nodowa:equipped_title");
    if (titleId && TITLES_MAP.has(titleId)) {
      const def = TITLES_MAP.get(titleId);
      player.nameTag = `${def.tag} §f${player.name}`;
      return;
    }
    player.nameTag = player.name;
  } catch (_) {}
}

// ── Verificador de Nuevos Títulos Desbloqueados ────────────────
function checkMilestones(player, category = "all") {
  try {
    const stats = getPlayerStats(player);
    for (const title of TITLES) {
      if (category !== "all" && title.cat !== category) continue;
      const unlockKey = "nodowa:unlocked_" + title.id;
      if (player.getDynamicProperty(unlockKey)) continue;

      if (title.check(player, stats)) {
        player.setDynamicProperty(unlockKey, true);
        player.sendMessage(`§6========================================`);
        player.sendMessage(`§e👑 §l¡NUEVO TÍTULO DESBLOQUEADO!`);
        player.sendMessage(`§fHas obtenido el título: ${title.tag}`);
        player.sendMessage(`§7Hazaña cumplida: §f${title.desc}`);
        player.sendMessage(`§eEscribe §b/titulos §epara equipártelo.`);
        player.sendMessage(`§6========================================`);
        try { player.playSound("random.levelup", { volume: 0.9, pitch: 1.1 }); } catch (_) {}
      }
    }
  } catch (_) {}
}

// ── Interfaz UI: Ficha de Perfil y Estadísticas ───────────────
function showStatsProfile(player) {
  try {
    const stats = getPlayerStats(player);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");
    const equippedDef = equippedId ? TITLES_MAP.get(equippedId) : null;
    const equippedTag = equippedDef ? equippedDef.tag : "§7Ninguno";

    let unlockedCount = 0;
    for (const t of TITLES) {
      if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
        unlockedCount++;
      }
    }
    const pct = Math.floor((unlockedCount / TITLES.length) * 100);

    const form = new ActionFormData();
    form.title("§l§6PERFIL & ESTADÍSTICAS");

    let body = `§e━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `§fJugador: §b${player.name}\n`;
    body += `§fTítulo Activo: ${equippedTag}\n`;
    body += `§fColección de Títulos: §a${unlockedCount} §7/ §f${TITLES.length} §8(${pct}%)\n`;
    body += `§e━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `§c⚔ Bajas PvP: §f${stats.killsPvp} jugadores\n`;
    body += `§2🏹 Monstruos Cazados: §f${stats.killsTotalMobs} criaturas\n`;
    body += `   §7• Zombis: §f${stats.killsZombies} §8| §7Esqueletos: §f${stats.killsSkeletons}\n`;
    body += `   §7• Arañas: §f${stats.killsSpiders} §8| §7Creepers: §f${stats.killsCreepers}\n`;
    body += `   §7• Endermans: §f${stats.killsEndermen} §8| §7Ahogados: §f${stats.killsDrowned}\n`;
    body += `   §7• Nether: §f${stats.killsNether} §8| §7Wither: §f${stats.killsWither} §8| §7Dragón: §f${stats.killsDragon}\n`;
    body += `§b⛏ Minerales Picados:\n`;
    body += `   §7• Piedra / Pizarra: §f${stats.minedStone.toLocaleString()}\n`;
    body += `   §7• Menas de Diamante: §f${stats.minedDiamond}\n`;
    body += `   §7• Escombros Netherite: §f${stats.minedDebris}\n`;
    body += `   §7• Oro: §f${stats.minedGold} §8| §7Hierro: §f${stats.minedIron}\n`;
    body += `§6🪙 Saldo Nodocoins: §e${stats.nodocoins.toLocaleString()}\n`;
    body += `§e━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    form.body(body);
    form.button("§6👑 Ver & Equipar Títulos");
    form.button("§c✖ Cerrar");

    form.show(player).then(res => {
      if (res.canceled) return;
      if (res.selection === 0) {
        showTitlesMenu(player);
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showStatsProfile error:", err.message);
  }
}

// ── Interfaz UI: Menú de Categorías de Títulos ────────────────
function showTitlesMenu(player) {
  try {
    const stats = getPlayerStats(player);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");
    const equippedDef = equippedId ? TITLES_MAP.get(equippedId) : null;
    const equippedTag = equippedDef ? equippedDef.tag : "§7Ninguno";

    const form = new ActionFormData();
    form.title("§l§6SELECTOR DE TÍTULOS");

    let body = `§7Equipa títulos para presumir sobre tu cabeza y en el chat.\n`;
    body += `§fEquipado actualmente: ${equippedTag}\n\n`;
    body += `§eSelecciona una categoría:`;
    form.body(body);

    for (const cat of CATEGORIES) {
      const catTitles = TITLES.filter(t => t.cat === cat.id);
      let catUnlocked = 0;
      for (const t of catTitles) {
        if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
          catUnlocked++;
        }
      }
      form.button(`${cat.name}\n§8[${catUnlocked}/${catTitles.length} desbloqueados]`);
    }

    if (equippedId) {
      form.button("§4✖ Desequipar Título Actual");
    }
    form.button("§b📊 Ver Mi Perfil & Stats");
    form.button("§8✖ Salir");

    form.show(player).then(res => {
      if (res.canceled) return;
      const sel = res.selection;
      if (sel < CATEGORIES.length) {
        showCategoryTitles(player, CATEGORIES[sel].id);
      } else {
        let offset = CATEGORIES.length;
        if (equippedId) {
          if (sel === offset) {
            // Desequipar
            player.setDynamicProperty("nodowa:equipped_title", "");
            updatePlayerNameTag(player);
            player.sendMessage("§e[Títulos] Has desequipado tu título. Tu nombre volvió a la normalidad.");
            try { player.playSound("random.break", { volume: 0.6, pitch: 1.4 }); } catch (_) {}
            return;
          }
          offset++;
        }
        if (sel === offset) {
          showStatsProfile(player);
        }
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showTitlesMenu error:", err.message);
  }
}

// ── Interfaz UI: Lista de Títulos por Categoría ───────────────
function showCategoryTitles(player, categoryId) {
  try {
    const category = CATEGORIES.find(c => c.id === categoryId);
    if (!category) return;

    const stats = getPlayerStats(player);
    const catTitles = TITLES.filter(t => t.cat === categoryId);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");

    const form = new ActionFormData();
    form.title(`§l§6${category.name.toUpperCase()}`);
    form.body(`§7${category.desc}\n§eToca un título desbloqueado para equiparlo o un título bloqueado para ver tu avance:`);

    for (const title of catTitles) {
      const isEquipped = (equippedId === title.id);
      const isUnlocked = title.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + title.id);
      const prog = title.progress(player, stats);

      if (isEquipped) {
        form.button(`§a✔ ${title.tag} §2(Equipado)\n§aActivo en tu NameTag y Chat`);
      } else if (isUnlocked) {
        form.button(`§e✦ ${title.tag}\n§a¡Desbloqueado! Toca para equipar`);
      } else {
        const cur = Math.min(prog.current, prog.target);
        form.button(`§7🔒 ${title.name}\n§8Progreso: ${cur}/${prog.target}`);
      }
    }

    form.button("§8⬅ Volver a Categorías");

    form.show(player).then(res => {
      if (res.canceled) return;
      const sel = res.selection;
      if (sel === catTitles.length) {
        showTitlesMenu(player);
        return;
      }

      const selectedTitle = catTitles[sel];
      if (!selectedTitle) return;

      const isEquipped = (equippedId === selectedTitle.id);
      const isUnlocked = selectedTitle.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + selectedTitle.id);

      if (isEquipped) {
        player.sendMessage(`§e[Títulos] Ya tienes equipado el título ${selectedTitle.tag}§e.`);
        try { player.playSound("random.orb", { volume: 0.5, pitch: 1.0 }); } catch (_) {}
      } else if (isUnlocked) {
        player.setDynamicProperty("nodowa:equipped_title", selectedTitle.id);
        updatePlayerNameTag(player);
        player.sendMessage(`§a========================================`);
        player.sendMessage(`§6[Títulos] §a¡Has equipado el título ${selectedTitle.tag}§a!`);
        player.sendMessage(`§7Ahora todos podrán verlo sobre tu cabeza y cuando escribas.`);
        player.sendMessage(`§a========================================`);
        try { player.playSound("random.levelup", { volume: 0.8, pitch: 1.2 }); } catch (_) {}
      } else {
        // Mostrar info detallada de desbloqueo
        const prog = selectedTitle.progress(player, stats);
        const cur = Math.min(prog.current, prog.target);
        const pct = Math.floor((cur / prog.target) * 100);

        const info = new MessageFormData();
        info.title(`§l§cBLOQUEADO: ${selectedTitle.name}`);
        info.body(
          `§fTítulo: ${selectedTitle.tag}\n\n` +
          `§7Requisito: §f${selectedTitle.desc}\n` +
          `§7Tu avance actual: §e${cur} / ${prog.target} §8(${pct}%)\n\n` +
          `§a¡Continúa explorando y combatiendo en el servidor para reclamarlo!`
        );
        info.button1("§aEntendido");
        info.button2("§8Volver a la lista");
        info.show(player).then(() => {
          showCategoryTitles(player, categoryId);
        });
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showCategoryTitles error:", err.message);
  }
}

// ── Evento: Muerte de Entidades (PvP y PvE) ────────────────────
world.afterEvents.entityDie.subscribe((event) => {
  try {
    const { deadEntity, damageSource } = event;
    const killer = damageSource?.damagingEntity;
    if (!killer || !(killer instanceof Player)) return;

    if (deadEntity instanceof Player) {
      incStat(killer, "nodowa:stat_kills_pvp", 1);
      checkMilestones(killer, "pvp");
      checkMilestones(killer, "spec");
      return;
    }

    const typeId = deadEntity.typeId || "";
    incStat(killer, "nodowa:stat_kills_total_mobs", 1);

    if (typeId.includes("zombie") || typeId.includes("husk")) {
      incStat(killer, "nodowa:stat_kills_zombies", 1);
    } else if (typeId.includes("skeleton") || typeId.includes("stray") || typeId.includes("wither_skeleton")) {
      incStat(killer, "nodowa:stat_kills_skeletons", 1);
    } else if (typeId.includes("spider")) {
      incStat(killer, "nodowa:stat_kills_spiders", 1);
    } else if (typeId.includes("creeper")) {
      incStat(killer, "nodowa:stat_kills_creepers", 1);
    } else if (typeId.includes("enderman")) {
      incStat(killer, "nodowa:stat_kills_endermen", 1);
    } else if (typeId.includes("drowned")) {
      incStat(killer, "nodowa:stat_kills_drowned", 1);
    } else if (typeId.includes("blaze") || typeId.includes("magma_cube") || typeId.includes("ghast")) {
      incStat(killer, "nodowa:stat_kills_nether", 1);
    } else if (typeId.includes("wither") && !typeId.includes("skeleton")) {
      incStat(killer, "nodowa:stat_kills_wither", 1);
    } else if (typeId.includes("ender_dragon")) {
      incStat(killer, "nodowa:stat_kills_dragon", 1);
    }

    checkMilestones(killer, "pve");
    checkMilestones(killer, "spec");
  } catch (err) {
    console.warn("[NodowaTitles] entityDie error:", err.message);
  }
});

// ── Evento: Minería de Bloques ────────────────────────────────
world.afterEvents.playerBreakBlock.subscribe((event) => {
  try {
    const { player, brokenBlockPermutation } = event;
    if (!player) return;
    const typeId = brokenBlockPermutation?.type?.id || "";

    if (typeId.includes("stone") || typeId.includes("deepslate") || typeId.includes("cobblestone")) {
      incStat(player, "nodowa:stat_mined_stone", 1);
    } else if (typeId.includes("diamond_ore")) {
      incStat(player, "nodowa:stat_mined_diamond", 1);
    } else if (typeId.includes("ancient_debris")) {
      incStat(player, "nodowa:stat_mined_debris", 1);
    } else if (typeId.includes("gold_ore")) {
      incStat(player, "nodowa:stat_mined_gold", 1);
    } else if (typeId.includes("iron_ore")) {
      incStat(player, "nodowa:stat_mined_iron", 1);
    }

    incStat(player, "nodowa:stat_mined_total", 1);
    checkMilestones(player, "mine");
  } catch (err) {
    console.warn("[NodowaTitles] playerBreakBlock error:", err.message);
  }
});

// ── Evento: Entrada y Reaparición de Jugador ───────────────────
world.afterEvents.playerSpawn.subscribe((event) => {
  const { player } = event;
  system.runTimeout(() => {
    updatePlayerNameTag(player);
    checkMilestones(player, "all");
  }, 20);
});

// ── Registro de Comandos Nativos (/titulos, /perfil, /stats) ───
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  const reg = (name, desc, fn) => {
    try {
      customCommandRegistry.registerCommand({
        name,
        description: desc,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false
      }, fn);
    } catch (e) {
      console.warn("[NodowaTitles] Skip command " + name + ": " + e.message);
    }
  };

  const runForPlayer = (o, callback) => {
    try {
      const p = o.initiator ?? o.sourceEntity;
      if (p && p instanceof Player) {
        const name = p.name;
        system.run(() => {
          try {
            const player = world.getAllPlayers().find(x => x.name === name);
            if (player) callback(player);
          } catch (_) {}
        });
      }
    } catch (_) {}
    return { status: CustomCommandStatus.Success };
  };

  reg("tit:titulos", "Abre el selector de títulos cosméticos", (o) => runForPlayer(o, (p) => showTitlesMenu(p)));
  reg("tit:titulo",  "Abre el selector de títulos cosméticos", (o) => runForPlayer(o, (p) => showTitlesMenu(p)));
  reg("tit:perfil",  "Muestra tu perfil y estadísticas de jugador", (o) => runForPlayer(o, (p) => showStatsProfile(p)));
  reg("tit:stats",   "Muestra tus estadísticas de combate y minería", (o) => runForPlayer(o, (p) => showStatsProfile(p)));
  reg("tit:estadisticas", "Muestra tus estadísticas personales", (o) => runForPlayer(o, (p) => showStatsProfile(p)));

  console.log("[NodowaTitles] Comandos nativos registrados: /tit:titulos, /tit:perfil, /tit:stats");
});

// ── Interceptor de Chat Universal & Formato de Títulos ─────────
const TITLE_CHAT_COMMANDS = new Set([
  "titulos", "titulo", "perfil", "stats", "estadisticas", "insignias", "medallas"
]);

if (world.beforeEvents && world.beforeEvents.chatSend) {
  world.beforeEvents.chatSend.subscribe((event) => {
    try {
      const { sender, message } = event;
      if (!sender || !message) return;
      const trimmed = message.trim();
      if (!trimmed) return;

      const firstChar = trimmed.charAt(0);
      const isPrefix = (firstChar === "/" || firstChar === "!" || firstChar === "." || firstChar === ";");
      const rawLine = isPrefix ? trimmed.slice(1).trim() : trimmed;
      const parts = rawLine.split(/\s+/);
      const rawCmd = (parts[0] || "").toLowerCase();
      const cmd = rawCmd.includes(":") ? rawCmd.split(":")[1] : rawCmd;

      // 1. Si es un comando propio de títulos o perfil, cancelar y abrir UI
      if (TITLE_CHAT_COMMANDS.has(cmd)) {
        try { event.cancel = true; } catch (_) {}
        const senderName = sender.name;
        system.run(() => {
          try {
            const p = world.getAllPlayers().find(x => x.name === senderName);
            if (!p) return;
            if (cmd === "perfil" || cmd === "stats" || cmd === "estadisticas") {
              showStatsProfile(p);
            } else {
              showTitlesMenu(p);
            }
          } catch (_) {}
        });
        return;
      }

      // 2. Si empieza con barra/prefijo pero NO es de nuestros comandos, NO interferir
      if (isPrefix) return;

      // 3. Si es mensaje normal de chat y tiene título equipado, mostrar con prefijo de título
      const equippedId = sender.getDynamicProperty("nodowa:equipped_title");
      if (equippedId && TITLES_MAP.has(equippedId)) {
        const titleDef = TITLES_MAP.get(equippedId);
        try { event.cancel = true; } catch (_) {}
        world.sendMessage(`${titleDef.tag} §b${sender.name} §8» §f${message}`);
      }
    } catch (err) {
      console.warn("[NodowaTitles] chatSend error:", err.message);
    }
  });
}

console.log("[NodowaTitles] Addon de Estadísticas y Títulos Épicos cargado con éxito.");
