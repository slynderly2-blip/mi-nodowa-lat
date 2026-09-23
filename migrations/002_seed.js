'use strict';
/**
 * migrations/002_seed.js
 * Carga items de ejemplo en la tienda.
 * Ejecutar: node migrations/002_seed.js
 */

const { initDB, run, get, persistDB } = require('../src/config/database');

const ITEMS = [
  // ── Rangos ────────────────────────────────────────────────────────────────
  {
    id: 'rango-vip',
    name: 'Rango VIP',
    category: 'rangos',
    price_coins: 2500,
    price_usdt: 4.99,
    description: 'Acceso a comandos exclusivos, prefijo [VIP] en el chat y kits semanales.',
    icon_type: 'star',
    command: 'lp user {player} parent set vip',
    give_coins: 0,
    badge: 'Popular',
    sort_order: 1,
  },
  {
    id: 'rango-elite',
    name: 'Rango Elite',
    category: 'rangos',
    price_coins: 5000,
    price_usdt: 9.99,
    description: 'Todo lo de VIP + vuelo en spawn, /nick, /hat y acceso a mundo creativo.',
    icon_type: 'trophy',
    command: 'lp user {player} parent set elite',
    give_coins: 0,
    badge: '',
    sort_order: 2,
  },
  {
    id: 'rango-legend',
    name: 'Rango Legend',
    category: 'rangos',
    price_coins: 10000,
    price_usdt: 19.99,
    description: 'El rango más alto. Partículas, título personalizado, acceso a /gm, slots extra de /sethome.',
    icon_type: 'rank',
    command: 'lp user {player} parent set legend',
    give_coins: 0,
    badge: '🔥 Top',
    sort_order: 3,
  },

  // ── Monedas ───────────────────────────────────────────────────────────────
  {
    id: 'coins-1000',
    name: '1,000 NC',
    category: 'monedas',
    price_coins: 0,
    price_usdt: 1.99,
    description: 'Recarga tu billetera con 1,000 Nodocoins.',
    icon_type: 'coin',
    command: '',
    give_coins: 1000,
    badge: '',
    sort_order: 10,
  },
  {
    id: 'coins-5000',
    name: '5,000 NC',
    category: 'monedas',
    price_coins: 0,
    price_usdt: 8.99,
    description: 'Recarga tu billetera con 5,000 Nodocoins. ¡Ahorra un 10%!',
    icon_type: 'coin',
    command: '',
    give_coins: 5000,
    badge: 'Ahorro',
    sort_order: 11,
  },
  {
    id: 'coins-15000',
    name: '15,000 NC',
    category: 'monedas',
    price_coins: 0,
    price_usdt: 24.99,
    description: 'Recarga tu billetera con 15,000 Nodocoins. ¡El mejor precio por NC!',
    icon_type: 'coin',
    command: '',
    give_coins: 15000,
    badge: '🔥 Oferta',
    sort_order: 12,
  },

  // ── Kits ──────────────────────────────────────────────────────────────────
  {
    id: 'kit-starter',
    name: 'Kit Starter',
    category: 'kits',
    price_coins: 500,
    price_usdt: 0,
    description: 'Espada de hierro, armadura completa de hierro, 32 comidas y antorcha x16.',
    icon_type: 'sword',
    command: 'kit starter {player}',
    give_coins: 0,
    badge: '',
    sort_order: 20,
  },
  {
    id: 'kit-warrior',
    name: 'Kit Warrior',
    category: 'kits',
    price_coins: 1500,
    price_usdt: 2.99,
    description: 'Espada de diamante Filo III, armadura completa de diamante Protección II y arco Poder II.',
    icon_type: 'sword',
    command: 'kit warrior {player}',
    give_coins: 0,
    badge: '',
    sort_order: 21,
  },
  {
    id: 'kit-builder',
    name: 'Kit Constructor',
    category: 'kits',
    price_coins: 800,
    price_usdt: 0,
    description: 'x256 de madera variada, piedra, vidrio, lana de colores y herramientas de diamante.',
    icon_type: 'pick',
    command: 'kit builder {player}',
    give_coins: 0,
    badge: '',
    sort_order: 22,
  },

  // ── Items especiales ──────────────────────────────────────────────────────
  {
    id: 'item-elytra',
    name: 'Elytra',
    category: 'items',
    price_coins: 3000,
    price_usdt: 5.99,
    description: 'Elytra lista para usar. ¡Vuela por el mundo sin límites!',
    icon_type: 'fly',
    command: 'give {player} elytra 1',
    give_coins: 0,
    badge: '',
    sort_order: 30,
  },
  {
    id: 'item-totems',
    name: 'x5 Tótems de No Morir',
    category: 'items',
    price_coins: 1200,
    price_usdt: 0,
    description: 'Pack de 5 tótems de no morir para nunca perder tu inventario.',
    icon_type: 'magic',
    command: 'give {player} totem_of_undying 5',
    give_coins: 0,
    badge: '',
    sort_order: 31,
  },
  {
    id: 'item-beacons',
    name: 'x3 Beacons',
    category: 'items',
    price_coins: 2000,
    price_usdt: 3.99,
    description: 'Tres beacons completamente funcionales para tu base.',
    icon_type: 'star',
    command: 'give {player} beacon 3',
    give_coins: 0,
    badge: '',
    sort_order: 32,
  },

  // ── Pases ─────────────────────────────────────────────────────────────────
  {
    id: 'pase-fly',
    name: 'Pase de Vuelo (30 días)',
    category: 'pases',
    price_coins: 1800,
    price_usdt: 3.49,
    description: 'Activa /fly en survival por 30 días completos.',
    icon_type: 'fly',
    command: 'lp user {player} permission set essentials.fly true 30d',
    give_coins: 0,
    badge: '',
    sort_order: 40,
  },
  {
    id: 'pase-homes',
    name: '+5 Homes (permanente)',
    category: 'pases',
    price_coins: 1000,
    price_usdt: 1.99,
    description: 'Añade 5 slots extra de /sethome de forma permanente.',
    icon_type: 'house',
    command: 'lp user {player} permission set essentials.sethome.multiple.amount.+5 true',
    give_coins: 0,
    badge: '',
    sort_order: 41,
  },
];

async function seed() {
  await initDB();

  let inserted = 0;
  let skipped  = 0;

  for (const item of ITEMS) {
    const exists = get('SELECT id FROM store_items WHERE id = ?', [item.id]);
    if (exists) { skipped++; continue; }

    run(
      `INSERT INTO store_items
         (id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        item.id, item.name, item.category,
        item.price_coins, item.price_usdt,
        item.description, item.icon_type,
        item.command, item.give_coins,
        item.badge, item.sort_order,
      ]
    );
    inserted++;
  }

  persistDB();
  console.log(`[Seed] Listo — ${inserted} items insertados, ${skipped} ya existían.`);
  process.exit(0);
}

seed().catch(e => { console.error('[Seed] Error:', e.message); process.exit(1); });
