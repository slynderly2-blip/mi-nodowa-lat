import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus
} from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

console.log("[NodowaTitles] Addon de Estadísticas y Títulos Épicos v1.1.0 iniciando...");

const BACKEND_URL = "https://tienda.nodowa.lat";

// ── Sincronización Real de Nodocoins (Web API + Scoreboard Fallback) ──
async function getOnlineBalance(player) {
  // 1. Intentar sincronización directa con el servidor Web (Single Source of Truth)
  try {
    const net = await import("@minecraft/server-net");
    const req = new net.HttpRequest(`${BACKEND_URL}/api/addon/get-balance?player=${encodeURIComponent(player.name)}`);
    req.method = net.HttpRequestMethod.Get;
    const resp = await net.http.request(req);
    const data = JSON.parse(resp.body);
    if (data && data.ok && data.wallet !== undefined) {
      // Sincronizar en el scoreboard local para que ambas vistas coincidan
      try {
        let objective = world.scoreboard.getObjective("nodocoins");
        if (objective && player.scoreboardIdentity) {
          objective.setScore(player.scoreboardIdentity, data.wallet);
        }
      } catch (_) {}
      return data.wallet;
    }
  } catch (_) {}

  // 2. Scoreboard local: probar con player.scoreboardIdentity y participantes por nombre
  try {
    const objective = world.scoreboard.getObjective("nodocoins");
    if (objective) {
      if (player.scoreboardIdentity) {
        const s = objective.getScore(player.scoreboardIdentity);
        if (s !== undefined && s > 0) return s;
      }
      for (const part of objective.getParticipants()) {
        if (part.displayName === player.name) {
          const s = objective.getScore(part);
          if (s !== undefined) return s;
        }
      }
    }
  } catch (_) {}

  return 0;
}

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

async function getPlayerStats(player) {
  const nodocoins = await getOnlineBalance(player);
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
    nodocoins
  };
}

// ── Diseños Gráficos y Barra de Progreso RPG ───────────────────
function makeProgressBar(current, target, length = 10) {
  if (target <= 0) return `§a${"▰".repeat(length)} §e100%`;
  const cur = Math.min(Math.max(0, current), target);
  const ratio = cur / target;
  const filled = Math.round(ratio * length);
  const empty = Math.max(0, length - filled);
  const pct = Math.floor(ratio * 100);
  return `§a${"▰".repeat(filled)}§8${"▱".repeat(empty)} §e${pct}%`;
}

function getPlayerRankTier(unlockedCount) {
  if (unlockedCount >= 28) return { name: "§6👑 DEIDAD SUPREMA",   badge: "S-TIER", next: 34 };
  if (unlockedCount >= 20) return { name: "§5🔥 LEYENDA VIVIENTE", badge: "A-TIER", next: 28 };
  if (unlockedCount >= 12) return { name: "§b🏆 VETERANO DE ÉLITE",badge: "B-TIER", next: 20 };
  if (unlockedCount >= 5)  return { name: "§a⚔ GUERRERO NODOWA",   badge: "C-TIER", next: 12 };
  return                          { name: "§7🌱 NOVICIO",          badge: "D-TIER", next: 5 };
}

// ── Definición de Categorías ──────────────────────────────────
const CATEGORIES = [
  { id: "pvp",  name: "🩸 Sangre & Acero",     subtitle: "Combate PvP y Duelos",      desc: "Eliminación de otros jugadores en el mundo o coliseo" },
  { id: "pve",  name: "🏹 Caza & Pesadilla",   subtitle: "Monstruos y Criaturas",     desc: "Caza nocturna de monstruos hostiles y jefes legendarios" },
  { id: "mine", name: "⛏ Abismo & Núcleo",    subtitle: "Minería y Excavación",      desc: "Exploración de cavernas y extracción de riquezas minerales" },
  { id: "eco",  name: "🪙 Trono & Fortuna",    subtitle: "Riqueza y Economía",        desc: "Poder financiero acumulando Nodocoins en tu billetera" },
  { id: "spec", name: "🌟 Élite & Prestigio",  subtitle: "Rangos y Donaciones",       desc: "Títulos de prestigio máximo y reconocimientos exclusivos" }
];

// ── Catálogo Completo de 34 Títulos con Misiones Detalladas ───
const TITLES = [
  // 🩸 Rama Sangre (PvP)
  {
    id: "pvp_1", cat: "pvp", name: "Novato", tag: "§7[Novato]",
    desc: "Derrota a tu primer rival en combate PvP",
    mission: "Enfréntate a otro jugador y consigue tu primera baja.",
    tip: "Ve a zonas de combate libre para retar a duelistas.",
    target: 1,
    check: (_, s) => s.killsPvp >= 1,
    progress: (_, s) => ({ current: s.killsPvp, target: 1 })
  },
  {
    id: "pvp_2", cat: "pvp", name: "Cazador", tag: "§c[Cazador]",
    desc: "Acaba con 3 jugadores en combates",
    mission: "Consigue 3 bajas de jugadores.",
    tip: "Asegúrate de llevar buena armadura y pociones.",
    target: 3,
    check: (_, s) => s.killsPvp >= 3,
    progress: (_, s) => ({ current: s.killsPvp, target: 3 })
  },
  {
    id: "pvp_3", cat: "pvp", name: "Verdugo", tag: "§4[Verdugo]",
    desc: "Acaba con 7 jugadores en combates",
    mission: "Llega a 7 bajas PvP acumuladas.",
    tip: "Aprovecha los golpes críticos al caer de un salto.",
    target: 7,
    check: (_, s) => s.killsPvp >= 7,
    progress: (_, s) => ({ current: s.killsPvp, target: 7 })
  },
  {
    id: "pvp_4", cat: "pvp", name: "Carnicero", tag: "§c§l[Carnicero]",
    desc: "Alcanza 15 bajas de jugadores",
    mission: "Cobra 15 vidas enemigas en PvP.",
    tip: "Un hacha de diamante o netherite con Filo romperá escudos.",
    target: 15,
    check: (_, s) => s.killsPvp >= 15,
    progress: (_, s) => ({ current: s.killsPvp, target: 15 })
  },
  {
    id: "pvp_5", cat: "pvp", name: "Némesis", tag: "§4§l[Némesis]",
    desc: "Acumula 30 victorias PvP",
    mission: "Elimina a 30 jugadores.",
    tip: "¡Tu nombre ya causa temor en el servidor!",
    target: 30,
    check: (_, s) => s.killsPvp >= 30,
    progress: (_, s) => ({ current: s.killsPvp, target: 30 })
  },
  {
    id: "pvp_6", cat: "pvp", name: "Segador", tag: "§c§l[Segador]",
    desc: "Reclama 60 almas en combates PvP",
    mission: "Alcanza 60 bajas de jugadores.",
    tip: "Usa tótems de inmortalidad y manzanas doradas.",
    target: 60,
    check: (_, s) => s.killsPvp >= 60,
    progress: (_, s) => ({ current: s.killsPvp, target: 60 })
  },
  {
    id: "pvp_7", cat: "pvp", name: "Espectro", tag: "§8§l[Espectro]",
    desc: "Reclama 100 bajas PvP",
    mission: "Alcanza la histórica cifra de 100 bajas.",
    tip: "Combate en equipo o en eventos de guerra del servidor.",
    target: 100,
    check: (_, s) => s.killsPvp >= 100,
    progress: (_, s) => ({ current: s.killsPvp, target: 100 })
  },
  {
    id: "pvp_8", cat: "pvp", name: "Inmortal", tag: "§6§l[Inmortal]",
    desc: "Consigue 175 bajas PvP",
    mission: "Domina el combate con 175 bajas de jugadores.",
    tip: "Solo los mejores guerreros de Nodowa llegan aquí.",
    target: 175,
    check: (_, s) => s.killsPvp >= 175,
    progress: (_, s) => ({ current: s.killsPvp, target: 175 })
  },
  {
    id: "pvp_9", cat: "pvp", name: "Sádico", tag: "§5§l[Sádico]",
    desc: "Cima del PvP: 250 bajas de jugadores",
    mission: "Alcanza 250 bajas de jugadores.",
    tip: "El título más temido del servidor.",
    target: 250,
    check: (_, s) => s.killsPvp >= 250,
    progress: (_, s) => ({ current: s.killsPvp, target: 250 })
  },

  // 🏹 Rama Monstruos & Pesadilla (PvE)
  {
    id: "pve_zombie", cat: "pve", name: "Nigromante", tag: "§2[Nigromante]",
    desc: "Purifica a 40 Zombis",
    mission: "Elimina 40 zombis o husks en la noche.",
    tip: "Explora llanuras o desiertos de noche o encuentra un spawner.",
    target: 40,
    check: (_, s) => s.killsZombies >= 40,
    progress: (_, s) => ({ current: s.killsZombies, target: 40 })
  },
  {
    id: "pve_skeleton", cat: "pve", name: "Calavera", tag: "§f[Calavera]",
    desc: "Quiebra los huesos de 40 Esqueletos",
    mission: "Elimina 40 esqueletos o strays.",
    tip: "Usa un escudo para bloquear sus flechas mientras te acercas.",
    target: 40,
    check: (_, s) => s.killsSkeletons >= 40,
    progress: (_, s) => ({ current: s.killsSkeletons, target: 40 })
  },
  {
    id: "pve_spider", cat: "pve", name: "Veneno", tag: "§8§l[Veneno]",
    desc: "Extermina a 30 Arañas",
    mission: "Elimina 30 arañas normales o de cueva.",
    tip: "En minas abandonadas encontrarás nidos de arañas de cueva.",
    target: 30,
    check: (_, s) => s.killsSpiders >= 30,
    progress: (_, s) => ({ current: s.killsSpiders, target: 30 })
  },
  {
    id: "pve_creeper", cat: "pve", name: "Dinamita", tag: "§a§l[Dinamita]",
    desc: "Desactiva a 25 Creepers antes de que estallen",
    mission: "Elimina a 25 creepers con golpes directos.",
    tip: "Golpéalos con arco o retrocede rápido tras cada espadaço.",
    target: 25,
    check: (_, s) => s.killsCreepers >= 25,
    progress: (_, s) => ({ current: s.killsCreepers, target: 25 })
  },
  {
    id: "pve_enderman", cat: "pve", name: "Vórtice", tag: "§d§l[Vórtice]",
    desc: "Caza a 20 Endermans",
    mission: "Elimina 20 Endermans y reclama sus perlas.",
    tip: "Ponte bajo un techo de 2 bloques de altura donde no puedan golpearte.",
    target: 20,
    check: (_, s) => s.killsEndermen >= 20,
    progress: (_, s) => ({ current: s.killsEndermen, target: 20 })
  },
  {
    id: "pve_drowned", cat: "pve", name: "Abisal", tag: "§3[Abisal]",
    desc: "Vence a 25 Ahogados en las profundidades acuáticas",
    mission: "Elimina 25 zombis ahogados en océanos o ríos.",
    tip: "Cuidado con los que llevan tridentes arrojadizos.",
    target: 25,
    check: (_, s) => s.killsDrowned >= 25,
    progress: (_, s) => ({ current: s.killsDrowned, target: 25 })
  },
  {
    id: "pve_nether", cat: "pve", name: "Ceniza", tag: "§6[Ceniza]",
    desc: "Sobrevive cazando 25 Criaturas del Fuego",
    mission: "Elimina 25 Blazes, Magma Cubes o Ghasts en el Nether.",
    tip: "Bebe una poción de resistencia al fuego para ser inmune a sus llamas.",
    target: 25,
    check: (_, s) => s.killsNether >= 25,
    progress: (_, s) => ({ current: s.killsNether, target: 25 })
  },
  {
    id: "pve_wither", cat: "pve", name: "Tártaro", tag: "§0§l[Tártaro]",
    desc: "Destruye al terrorífico Wither Boss",
    mission: "Invoca y derrota a 1 Wither Boss.",
    tip: "Pelea bajo tierra en túneles estrechos de obsidiana o bedrock.",
    target: 1,
    check: (_, s) => s.killsWither >= 1,
    progress: (_, s) => ({ current: s.killsWither, target: 1 })
  },
  {
    id: "pve_dragon", cat: "pve", name: "Draconiano", tag: "§5§l[Draconiano]",
    desc: "Derriba al mítico Dragón del End",
    mission: "Da el golpe de gracia al Dragón del End.",
    tip: "Rompe los cristales del End con flechas o bolas de nieve.",
    target: 1,
    check: (_, s) => s.killsDragon >= 1,
    progress: (_, s) => ({ current: s.killsDragon, target: 1 })
  },
  {
    id: "pve_total", cat: "pve", name: "Exterminador", tag: "§e§l[Exterminador]",
    desc: "Alcanza 300 monstruos eliminados en total",
    mission: "Suma 300 bajas totales de cualquier criatura hostil.",
    tip: "Pasa las noches cazando o construye una granja de monstruos.",
    target: 300,
    check: (_, s) => s.killsTotalMobs >= 300,
    progress: (_, s) => ({ current: s.killsTotalMobs, target: 300 })
  },

  // ⛏ Rama Minería & Profundidades
  {
    id: "mine_stone_1", cat: "mine", name: "Topo", tag: "§8[Topo]",
    desc: "Pica tus primeros 200 bloques de roca",
    mission: "Pica 200 bloques de piedra, pizarra o adoquín.",
    tip: "Cava una escalera hacia las profundidades.",
    target: 200,
    check: (_, s) => s.minedStone >= 200,
    progress: (_, s) => ({ current: s.minedStone, target: 200 })
  },
  {
    id: "mine_stone_2", cat: "mine", name: "Pedregal", tag: "§7[Pedregal]",
    desc: "Excava 1,000 bloques de piedra",
    mission: "Pica 1,000 bloques de roca o pizarra profunda.",
    tip: "Un pico con Eficiencia acelerará enormemente tu avance.",
    target: 1000,
    check: (_, s) => s.minedStone >= 1000,
    progress: (_, s) => ({ current: s.minedStone, target: 1000 })
  },
  {
    id: "mine_stone_3", cat: "mine", name: "Titanio", tag: "§f§l[Titanio]",
    desc: "Maestría en cantería: 3,000 bloques picados",
    mission: "Pica 3,000 bloques de roca en las minas.",
    tip: "Usa un faro (beacon) con Prisa Minera II.",
    target: 3000,
    check: (_, s) => s.minedStone >= 3000,
    progress: (_, s) => ({ current: s.minedStone, target: 3000 })
  },
  {
    id: "mine_iron", cat: "mine", name: "Hierro", tag: "§f[Hierro]",
    desc: "Extrae 60 menas de Hierro",
    mission: "Encuentra y extrae 60 menas de hierro.",
    tip: "Se encuentra en gran abundancia en montañas altas o capas 16 a 32.",
    target: 60,
    check: (_, s) => s.minedIron >= 60,
    progress: (_, s) => ({ current: s.minedIron, target: 60 })
  },
  {
    id: "mine_gold", cat: "mine", name: "Auri", tag: "§e[Auri]",
    desc: "Extrae 35 menas de Oro",
    mission: "Encuentra y pica 35 menas de oro.",
    tip: "Los biomas de Badlands (Mesa) y el Nether están repletos de oro.",
    target: 35,
    check: (_, s) => s.minedGold >= 35,
    progress: (_, s) => ({ current: s.minedGold, target: 35 })
  },
  {
    id: "mine_diamond", cat: "mine", name: "Diamante", tag: "§b§l[Diamante]",
    desc: "Descubre y pica 25 menas de Diamante",
    mission: "Extrae 25 menas de diamante puro.",
    tip: "Mina en las capas más bajas (Y: -53 a -58) para encontrar vetas gigantes.",
    target: 25,
    check: (_, s) => s.minedDiamond >= 25,
    progress: (_, s) => ({ current: s.minedDiamond, target: 25 })
  },
  {
    id: "mine_debris", cat: "mine", name: "Nether", tag: "§4§l[Nether]",
    desc: "Extrae 10 Escombros Ancestrales (Netherite)",
    mission: "Encuentra y pica 10 ancient debris en el Nether.",
    tip: "Baja a la capa Y: 14 en el Nether y usa camas o TNT para detonar.",
    target: 10,
    check: (_, s) => s.minedDebris >= 10,
    progress: (_, s) => ({ current: s.minedDebris, target: 10 })
  },
  {
    id: "mine_colossus", cat: "mine", name: "Coloso", tag: "§6§l[Coloso]",
    desc: "Gran minero del Nether: 30 Escombros Ancestrales",
    mission: "Extrae 30 escombros ancestrales.",
    tip: "El metal más duro y valioso de todo Minecraft.",
    target: 30,
    check: (_, s) => s.minedDebris >= 30,
    progress: (_, s) => ({ current: s.minedDebris, target: 30 })
  },

  // 🪙 Rama Riqueza & Trono (Economía)
  {
    id: "eco_1", cat: "eco", name: "Burgués", tag: "§a[Burgués]",
    desc: "Acumula 2,500 Nodocoins en tu billetera",
    mission: "Llega a un saldo de al menos 2,500 Nodocoins.",
    tip: "Gana Nodocoins vendiendo ítems en el mercado web o minando.",
    target: 2500,
    check: (_, s) => s.nodocoins >= 2500,
    progress: (_, s) => ({ current: s.nodocoins, target: 2500 })
  },
  {
    id: "eco_2", cat: "eco", name: "Codicioso", tag: "§e[Codicioso]",
    desc: "Acumula 10,000 Nodocoins",
    mission: "Ten al menos 10,000 Nodocoins en mano.",
    tip: "Deposita en el banco para recibir un +1% de interés diario automático.",
    target: 10000,
    check: (_, s) => s.nodocoins >= 10000,
    progress: (_, s) => ({ current: s.nodocoins, target: 10000 })
  },
  {
    id: "eco_3", cat: "eco", name: "Trono", tag: "§6[Trono]",
    desc: "Alcanza 50,000 Nodocoins",
    mission: "Llega a 50,000 Nodocoins de fortuna.",
    tip: "Comercia minerales raros con otros jugadores.",
    target: 50000,
    check: (_, s) => s.nodocoins >= 50000,
    progress: (_, s) => ({ current: s.nodocoins, target: 50000 })
  },
  {
    id: "eco_4", cat: "eco", name: "Monarca", tag: "§6§l[Monarca]",
    desc: "Poderío financiero: 150,000 Nodocoins",
    mission: "Consigue amasar 150,000 Nodocoins.",
    tip: "Domina las subastas y el comercio de Nodowa.",
    target: 150000,
    check: (_, s) => s.nodocoins >= 150000,
    progress: (_, s) => ({ current: s.nodocoins, target: 150000 })
  },
  {
    id: "eco_5", cat: "eco", name: "Midas", tag: "§e§l[Midas]",
    desc: "Fortuna legendaria: 300,000 Nodocoins",
    mission: "Ten 300,000 Nodocoins en tu posesión.",
    tip: "Todo lo que tocas se convierte en oro puro.",
    target: 300000,
    check: (_, s) => s.nodocoins >= 300000,
    progress: (_, s) => ({ current: s.nodocoins, target: 300000 })
  },

  // 🌟 Rama Élite & Prestigio
  {
    id: "spec_gladiator", cat: "spec", name: "Gladiador", tag: "§b§l[Gladiador]",
    desc: "50 victorias combinadas (PvP + Mobs) o Tag 'gladiador'",
    mission: "Demuestra tu valor alcanzando 50 bajas combinadas de combate.",
    tip: "Cualquier baja de jugador o monstruo hostil cuenta.",
    target: 50,
    check: (p, s) => p.hasTag("gladiador") || (s.killsPvp + s.killsTotalMobs) >= 50,
    progress: (p, s) => ({ current: p.hasTag("gladiador") ? 50 : Math.min(50, s.killsPvp + s.killsTotalMobs), target: 50 })
  },
  {
    id: "spec_eclipse", cat: "spec", name: "Eclipse", tag: "§1§l[Eclipse]",
    desc: "Rango VIP en tienda web o Tag 'eclipse'",
    mission: "Adquiere el rango VIP en la tienda web (tienda.nodowa.lat) o tag.",
    tip: "Apoya al servidor en la tienda para desbloquear este título exclusivo.",
    target: 1,
    check: (p) => p.hasTag("eclipse") || p.hasTag("vip"),
    progress: (p) => ({ current: (p.hasTag("eclipse") || p.hasTag("vip")) ? 1 : 0, target: 1 })
  },
  {
    id: "spec_legend", cat: "spec", name: "Legendario", tag: "§d§l[Legendario]",
    desc: "Rango MVP en tienda web o Tag 'legendario'",
    mission: "Adquiere el rango MVP en la web o tag especial.",
    tip: "Concede beneficios estéticos y este deslumbrante título.",
    target: 1,
    check: (p) => p.hasTag("legendario") || p.hasTag("mvp"),
    progress: (p) => ({ current: (p.hasTag("legendario") || p.hasTag("mvp")) ? 1 : 0, target: 1 })
  },
  {
    id: "spec_god", cat: "spec", name: "Dios", tag: "§e§l[Dios]",
    desc: "Rango Élite Supremo en tienda web o Tag 'dios'",
    mission: "Máximo estatus de patrocinador del servidor.",
    tip: "El título de mayor prestigio estético de todo Nodowa.",
    target: 1,
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

// ── Verificador de Nuevos Títulos Desbloqueados con Efectos ───
async function checkMilestones(player, category = "all") {
  try {
    const stats = await getPlayerStats(player);
    for (const title of TITLES) {
      if (category !== "all" && title.cat !== category) continue;
      const unlockKey = "nodowa:unlocked_" + title.id;
      if (player.getDynamicProperty(unlockKey)) continue;

      if (title.check(player, stats)) {
        player.setDynamicProperty(unlockKey, true);

        // Notificación en pantalla gigante (Title & Subtitle)
        try {
          if (player.onScreenDisplay) {
            player.onScreenDisplay.setTitle("§6👑 ¡TÍTULO DESBLOQUEADO!");
            player.onScreenDisplay.setSubtitle(`${title.tag} §f- Escribe §e/titulos`);
          }
        } catch (_) {}

        // Sonido de fanfarria
        try { player.playSound("random.levelup", { volume: 1.0, pitch: 1.1 }); } catch (_) {}

        // Mensaje de chat
        player.sendMessage(`§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`);
        player.sendMessage(`§e👑 §l¡FELICIDADES! TÍTULO DESBLOQUEADO: ${title.tag}`);
        player.sendMessage(`§7Hazaña: §f${title.desc}`);
        player.sendMessage(`§aEscribe §e/titulos §apara equipártelo sobre la cabeza.`);
        player.sendMessage(`§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`);
      }
    }
  } catch (_) {}
}

// ── Cálculo de Recomendaciones Inteligentes ("¿Qué hago ahora?") ──
function getRecommendedTitles(player, stats) {
  const candidates = [];
  for (const title of TITLES) {
    const isUnlocked = title.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + title.id);
    if (isUnlocked) continue;
    const prog = title.progress(player, stats);
    const cur = Math.min(prog.current, prog.target);
    const ratio = prog.target > 0 ? (cur / prog.target) : 0;
    const remaining = Math.max(0, prog.target - cur);
    candidates.push({ title, cur, target: prog.target, ratio, remaining });
  }
  // Ordenar de mayor porcentaje de avance a menor (los más fáciles y cercanos primero)
  candidates.sort((a, b) => b.ratio - a.ratio);
  return candidates.slice(0, 5);
}

// ── Interfaz UI: Perfil Visual del Jugador (/perfil o /stats) ──
async function showStatsProfile(player) {
  try {
    const stats = await getPlayerStats(player);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");
    const equippedDef = equippedId ? TITLES_MAP.get(equippedId) : null;
    const equippedTag = equippedDef ? equippedDef.tag : "§7[Ninguno equipado]";

    let unlockedCount = 0;
    for (const t of TITLES) {
      if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
        unlockedCount++;
      }
    }

    const rank = getPlayerRankTier(unlockedCount);
    const totalTitles = TITLES.length;
    const generalBar = makeProgressBar(unlockedCount, totalTitles, 12);

    const form = new ActionFormData();
    form.title("§l§6✦ FICHA DE AVENTURERO ✦");

    let body = `§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦\n`;
    body += `§fJugador: §b§l${player.name}§r   §7Rango: ${rank.name}\n`;
    body += `§fTítulo Actual: ${equippedTag}\n`;
    body += `§fColección: §e${unlockedCount} §7/ §f${totalTitles} títulos desbloqueados\n`;
    body += `   ${generalBar}\n`;
    body += `§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦\n\n`;

    body += `§e🪙 FORTUNA Y RIQUEZA:\n`;
    body += `   §fSaldo en Mano: §e§l${stats.nodocoins.toLocaleString()} Nodocoins§r\n\n`;

    body += `§c⚔ HISTORIAL DE COMBATE:\n`;
    body += `   §fBajas PvP (Jugadores): §c§l${stats.killsPvp}\n`;
    body += `   §fMonstruos Cazados: §a§l${stats.killsTotalMobs.toLocaleString()} criaturas\n`;
    body += `   §7• Zombis: §f${stats.killsZombies} §8| §7Esqueletos: §f${stats.killsSkeletons} §8| §7Arañas: §f${stats.killsSpiders}\n`;
    body += `   §7• Creepers: §f${stats.killsCreepers} §8| §7Endermans: §f${stats.killsEndermen} §8| §7Ahogados: §f${stats.killsDrowned}\n`;
    body += `   §7• Criaturas Nether: §f${stats.killsNether} §8| §7Wither: §f${stats.killsWither} §8| §7Dragón: §f${stats.killsDragon}\n\n`;

    body += `§b⛏ MAESTRÍA EN MINERÍA:\n`;
    body += `   §7• Piedra y Rocas: §f${stats.minedStone.toLocaleString()} bloques\n`;
    body += `   §7• Menas de Diamante: §b§l${stats.minedDiamond}\n`;
    body += `   §7• Netherite (Debris): §4§l${stats.minedDebris}\n`;
    body += `   §7• Menas de Oro: §e${stats.minedGold} §8| §7Hierro: §f${stats.minedIron}\n`;
    body += `§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`;

    form.body(body);
    form.button("§6👑 Abrir Selector de Títulos\n§8Equipa y presume tus títulos");
    form.button("§a🎯 ¿Qué títulos puedo conseguir ahora?\n§8Ver misiones más cercanas a completar");
    form.button("§c✖ Cerrar");

    form.show(player).then(res => {
      if (res.canceled) return;
      if (res.selection === 0) {
        showTitlesMenu(player);
      } else if (res.selection === 1) {
        showRecommendationsMenu(player);
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showStatsProfile error:", err.message);
  }
}

// ── Interfaz UI: Títulos Recomendados / Misiones Cercanas ──────
async function showRecommendationsMenu(player) {
  try {
    const stats = await getPlayerStats(player);
    const recs = getRecommendedTitles(player, stats);

    const form = new ActionFormData();
    form.title("§l§a🎯 MISIONES MÁS CERCANAS");

    if (recs.length === 0) {
      form.body("§a¡Increíble! Ya has desbloqueado todos los títulos disponibles en el servidor.");
      form.button("§8⬅ Volver al Perfil");
      form.show(player).then(() => showStatsProfile(player));
      return;
    }

    let body = `§7Aquí tienes los títulos que estás a punto de conseguir.\n`;
    body += `§e¡Toca cualquiera para ver su misión y qué debes hacer!\n\n`;

    for (const r of recs) {
      const bar = makeProgressBar(r.cur, r.target, 8);
      body += `§f• ${r.title.tag} §7(${r.cur}/${r.target}) ${bar}\n`;
      body += `  §a¡Te faltan solo §e${r.remaining}§a!\n\n`;
    }

    form.body(body);

    for (const r of recs) {
      form.button(`§e🎯 ${r.title.name}\n§8Faltan: ${r.remaining} (${Math.floor(r.ratio * 100)}%)`);
    }

    form.button("§8⬅ Volver al Perfil");

    form.show(player).then(res => {
      if (res.canceled) return;
      const sel = res.selection;
      if (sel < recs.length) {
        showMissionDetail(player, recs[sel].title, stats, "recs");
      } else {
        showStatsProfile(player);
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showRecommendationsMenu error:", err.message);
  }
}

// ── Interfaz UI: Menú de Categorías de Títulos (/titulos) ─────
async function showTitlesMenu(player) {
  try {
    const stats = await getPlayerStats(player);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");
    const equippedDef = equippedId ? TITLES_MAP.get(equippedId) : null;
    const equippedTag = equippedDef ? equippedDef.tag : "§7[Ninguno]";

    let totalUnlocked = 0;
    for (const t of TITLES) {
      if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
        totalUnlocked++;
      }
    }

    const form = new ActionFormData();
    form.title("§l§6✦ SELECTOR DE TÍTULOS ✦");

    let body = `§7Equipa el título que quieras para presumir sobre tu cabeza y en el chat.\n\n`;
    body += `§fTítulo Equipado: ${equippedTag}\n`;
    body += `§fTus Títulos: §a${totalUnlocked} §7/ §f${TITLES.length} desbloqueados\n\n`;
    body += `§eElige una rama para explorar sus títulos:`;
    form.body(body);

    for (const cat of CATEGORIES) {
      const catTitles = TITLES.filter(t => t.cat === cat.id);
      let catUnlocked = 0;
      for (const t of catTitles) {
        if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
          catUnlocked++;
        }
      }
      form.button(`${cat.name}\n§8${cat.subtitle} [${catUnlocked}/${catTitles.length}]`);
    }

    form.button("§a🎯 Ver Títulos Más Cercanos\n§8Misiones a punto de completarse");

    if (equippedId) {
      form.button("§4✖ Desequipar Título Actual\n§8Quitar prefijo de tu nombre");
    }

    form.button("§b📊 Ficha de Estadísticas\n§8Ver récord completo");
    form.button("§8✖ Salir");

    form.show(player).then(res => {
      if (res.canceled) return;
      const sel = res.selection;
      if (sel < CATEGORIES.length) {
        showCategoryTitles(player, CATEGORIES[sel].id);
      } else if (sel === CATEGORIES.length) {
        showRecommendationsMenu(player);
      } else {
        let offset = CATEGORIES.length + 1;
        if (equippedId) {
          if (sel === offset) {
            // Desequipar
            player.setDynamicProperty("nodowa:equipped_title", "");
            updatePlayerNameTag(player);
            player.sendMessage("§e[Títulos] Has desequipado tu título. Tu nombre volvió a la normalidad.");
            try {
              if (player.onScreenDisplay) {
                player.onScreenDisplay.setTitle("§c✖ TÍTULO QUITADO");
                player.onScreenDisplay.setSubtitle("§7Nombre restablecido");
              }
              player.playSound("random.break", { volume: 0.7, pitch: 1.4 });
            } catch (_) {}
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

// ── Interfaz UI: Lista de Títulos por Rama ─────────────────────
async function showCategoryTitles(player, categoryId) {
  try {
    const category = CATEGORIES.find(c => c.id === categoryId);
    if (!category) return;

    const stats = await getPlayerStats(player);
    const catTitles = TITLES.filter(t => t.cat === categoryId);
    const equippedId = player.getDynamicProperty("nodowa:equipped_title");

    let unlockedCount = 0;
    for (const t of catTitles) {
      if (t.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + t.id)) {
        unlockedCount++;
      }
    }

    const form = new ActionFormData();
    form.title(`§l§6${category.name.toUpperCase()}`);
    
    let body = `§7${category.desc}\n`;
    body += `§fDesbloqueados: §a${unlockedCount} §7/ §f${catTitles.length}\n\n`;
    body += `§e✦ Toca un título desbloqueado para equiparlo.\n`;
    body += `§7🔒 Toca un título bloqueado para ver qué debes hacer.`;
    form.body(body);

    for (const title of catTitles) {
      const isEquipped = (equippedId === title.id);
      const isUnlocked = title.check(player, stats) || player.getDynamicProperty("nodowa:unlocked_" + title.id);
      const prog = title.progress(player, stats);

      if (isEquipped) {
        form.button(`§a✔ ${title.tag} §2(Equipado)\n§aActivo sobre tu cabeza y chat`);
      } else if (isUnlocked) {
        form.button(`§e✦ ${title.tag}\n§a¡Desbloqueado! Toca para equipar`);
      } else {
        const cur = Math.min(prog.current, prog.target);
        const pct = prog.target > 0 ? Math.floor((cur / prog.target) * 100) : 0;
        form.button(`§7🔒 ${title.name}\n§8Avance: ${cur}/${prog.target} (${pct}%)`);
      }
    }

    form.button("§8⬅ Volver al Menú Principal");

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

        try {
          if (player.onScreenDisplay) {
            player.onScreenDisplay.setTitle("§6👑 TÍTULO EQUIPADO");
            player.onScreenDisplay.setSubtitle(`${selectedTitle.tag}`);
          }
          player.playSound("random.levelup", { volume: 0.9, pitch: 1.2 });
        } catch (_) {}

        player.sendMessage(`§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`);
        player.sendMessage(`§a👑 ¡Has equipado con éxito el título ${selectedTitle.tag}§a!`);
        player.sendMessage(`§7Ahora todos podrán verlo sobre tu cabeza y en cada mensaje del chat.`);
        player.sendMessage(`§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`);
      } else {
        showMissionDetail(player, selectedTitle, stats, categoryId);
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showCategoryTitles error:", err.message);
  }
}

// ── Interfaz UI: Ficha Detallada de Misión de Desbloqueo ───────
function showMissionDetail(player, title, stats, fromSource) {
  try {
    const prog = title.progress(player, stats);
    const cur = Math.min(prog.current, prog.target);
    const remaining = Math.max(0, prog.target - cur);
    const progressBar = makeProgressBar(cur, prog.target, 12);

    const info = new MessageFormData();
    info.title(`§l§c🔒 MISIÓN: ${title.name.toUpperCase()}`);

    let body = `§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦\n`;
    body += `§fTítulo a Conseguir: ${title.tag}\n\n`;
    body += `§e🎯 ¿QUÉ SE DEBE HACER?\n`;
    body += `§f${title.mission || title.desc}\n\n`;
    body += `§b📊 TU PROGRESO ACTUAL:\n`;
    body += `   ${progressBar}\n`;
    body += `   §fProgreso: §e${cur} §7/ §f${prog.target}   §a(¡Solo te faltan §e${remaining}§a!)\n\n`;
    body += `§d💡 CONSEJO ÚTIL:\n`;
    body += `§7${title.tip || "Sigue jugando y explorando en Nodowa para completarlo."}\n\n`;
    body += `§6🎁 RECOMPENSAS AL DESBLOQUEARLO:\n`;
    body += `• Estatus visible sobre tu cabeza para todos los jugadores.\n`;
    body += `• Prefijo coloreado en cada mensaje que envíes al chat.\n`;
    body += `• Puntos de prestigio en tu Ficha de Aventurero.\n`;
    body += `§6✦ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ✦`;

    info.body(body);
    info.button1("§a¡Entendido, a por ello!");
    info.button2("§8⬅ Volver atrás");

    info.show(player).then(() => {
      if (fromSource === "recs") {
        showRecommendationsMenu(player);
      } else {
        showCategoryTitles(player, fromSource);
      }
    });
  } catch (err) {
    console.warn("[NodowaTitles] showMissionDetail error:", err.message);
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
  reg("tit:misiones","Muestra los títulos que estás más cerca de desbloquear", (o) => runForPlayer(o, (p) => showRecommendationsMenu(p)));

  console.log("[NodowaTitles] Comandos nativos registrados con éxito.");
});

// ── Interceptor de Chat Universal & Formato de Títulos ─────────
const TITLE_CHAT_COMMANDS = new Set([
  "titulos", "titulo", "perfil", "stats", "estadisticas", "insignias", "medallas", "misiones"
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
            } else if (cmd === "misiones") {
              showRecommendationsMenu(p);
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

console.log("[NodowaTitles] Addon v1.1.0 (UI Hermosa, Misiones & Sincronización Web) cargado.");
