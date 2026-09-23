'use strict';
/**
 * src/server.js
 * Entry point — Nodowa Tienda
 * v4.3.0 - Sistema anti-duplicación de entregas
 */

const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const cfg              = require('./config');
const { initDB, get, run, persistDB } = require('./config/database');
const { errorHandler } = require('./shared/errors');
const log              = require('./shared/logger');

// ── Rutas ──────────────────────────────────────────────────────────────────
const authRoutes      = require('./modules/auth/auth.routes');
const storeRoutes     = require('./modules/store/store.routes');
const walletRoutes    = require('./modules/wallet/wallet.routes');
const ordersRoutes    = require('./modules/orders/orders.routes');
const usersRoutes     = require('./modules/users/users.routes');
const adminRoutes     = require('./modules/admin/admin.routes');
const delivRoutes     = require('./modules/deliveries/deliveries.routes');
const addonRoutes     = require('./modules/addon/addon.routes');

// ── Auto-seed ──────────────────────────────────────────────────────────────
const SEED_ITEMS = [
  { id:'rango-vip',     name:'Rango VIP',            category:'rangos',   price_coins:2500,  price_usdt:4.99,  description:'Acceso a comandos exclusivos, prefijo [VIP] en el chat y kits semanales.', icon_type:'star',   command:'lp user {player} parent set vip',    give_coins:0,    badge:'Popular', sort_order:1  },
  { id:'rango-elite',   name:'Rango Elite',           category:'rangos',   price_coins:5000,  price_usdt:9.99,  description:'Todo lo de VIP + vuelo en spawn, /nick, /hat y acceso a mundo creativo.',  icon_type:'trophy', command:'lp user {player} parent set elite',  give_coins:0,    badge:'',        sort_order:2  },
  { id:'rango-legend',  name:'Rango Legend',          category:'rangos',   price_coins:10000, price_usdt:19.99, description:'El rango más alto. Partículas, título personalizado y slots extra de /sethome.', icon_type:'rank', command:'lp user {player} parent set legend', give_coins:0,  badge:'🔥 Top',  sort_order:3  },
  { id:'coins-1000',    name:'1,000 NC',              category:'monedas',  price_coins:0,     price_usdt:1.99,  description:'Recarga tu billetera con 1,000 Nodocoins.',                               icon_type:'coin',   command:'',                                   give_coins:1000, badge:'',        sort_order:10 },
  { id:'coins-5000',    name:'5,000 NC',              category:'monedas',  price_coins:0,     price_usdt:8.99,  description:'Recarga tu billetera con 5,000 Nodocoins. ¡Ahorra un 10%!',              icon_type:'coin',   command:'',                                   give_coins:5000, badge:'Ahorro',  sort_order:11 },
  { id:'coins-15000',   name:'15,000 NC',             category:'monedas',  price_coins:0,     price_usdt:24.99, description:'Recarga con 15,000 NC. ¡El mejor precio por NC!',                       icon_type:'coin',   command:'',                                   give_coins:15000,badge:'🔥 Oferta',sort_order:12},
  { id:'kit-starter',   name:'Kit Starter',           category:'kits',     price_coins:500,   price_usdt:0,     description:'Espada de hierro, armadura completa, 32 comidas y antorcha x16.',         icon_type:'sword',  command:'kit starter {player}',               give_coins:0,    badge:'',        sort_order:20 },
  { id:'kit-warrior',   name:'Kit Warrior',           category:'kits',     price_coins:1500,  price_usdt:2.99,  description:'Espada de diamante Filo III, armadura diamante Protección II y arco.',   icon_type:'sword',  command:'kit warrior {player}',               give_coins:0,    badge:'',        sort_order:21 },
  { id:'kit-builder',   name:'Kit Constructor',       category:'kits',     price_coins:800,   price_usdt:0,     description:'x256 de madera, piedra, vidrio, lana de colores y herramientas de diamante.', icon_type:'pick', command:'kit builder {player}',             give_coins:0,    badge:'',        sort_order:22 },
  { id:'item-elytra',   name:'Elytra',                category:'items',    price_coins:3000,  price_usdt:5.99,  description:'Elytra lista para usar. ¡Vuela por el mundo sin límites!',               icon_type:'fly',    command:'give {player} elytra 1',             give_coins:0,    badge:'',        sort_order:30 },
  { id:'item-totems',   name:'x5 Tótems de No Morir', category:'items',    price_coins:1200,  price_usdt:0,     description:'Pack de 5 tótems de no morir para nunca perder tu inventario.',           icon_type:'magic',  command:'give {player} totem_of_undying 5',   give_coins:0,    badge:'',        sort_order:31 },
  { id:'item-beacons',  name:'x3 Beacons',            category:'items',    price_coins:2000,  price_usdt:3.99,  description:'Tres beacons completamente funcionales para tu base.',                    icon_type:'star',   command:'give {player} beacon 3',             give_coins:0,    badge:'',        sort_order:32 },
  { id:'pase-fly',      name:'Pase de Vuelo (30d)',   category:'pases',    price_coins:1800,  price_usdt:3.49,  description:'Activa /fly en survival por 30 días completos.',                          icon_type:'fly',    command:'lp user {player} permission set essentials.fly true 30d', give_coins:0, badge:'', sort_order:40 },
  { id:'pase-homes',    name:'+5 Homes (permanente)', category:'pases',    price_coins:1000,  price_usdt:1.99,  description:'Añade 5 slots extra de /sethome de forma permanente.',                    icon_type:'house',  command:'lp user {player} permission set essentials.sethome.multiple.amount.+5 true', give_coins:0, badge:'', sort_order:41 },
];

async function autoSeed() {
  const count = get('SELECT COUNT(*) as c FROM store_items', []);
  if (count && count.c > 0) return; // ya hay items

  log.info('[Seed] DB vacía — cargando items de ejemplo…');
  for (const item of SEED_ITEMS) {
    run(
      `INSERT OR IGNORE INTO store_items
         (id, name, category, price_coins, price_usdt, description, icon_type, command, give_coins, badge, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [item.id, item.name, item.category, item.price_coins, item.price_usdt,
       item.description, item.icon_type, item.command, item.give_coins,
       item.badge, item.sort_order]
    );
  }
  persistDB();
  log.ok(`[Seed] ${SEED_ITEMS.length} items cargados.`);
}

async function start() {
  // 1. Inicializar DB
  await initDB();

  // 2. Auto-seed si la tienda está vacía
  await autoSeed();

  const app = express();

  // 3. Middlewares globales
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: cfg.cors.origin }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 4. Logger de requests
  app.use((req, _res, next) => {
    const start = Date.now();
    _res.on('finish', () => log.req(req.method, req.path, _res.statusCode, Date.now() - start));
    next();
  });

  // 5. Archivos estáticos (frontend)
  app.use(express.static(path.join(__dirname, '../public')));
  
  // 5b. Servir archivos subidos (avatares, etc.)
  app.use('/data/uploads', express.static(path.join(__dirname, '../data/uploads')));

  // 6. API routes
  app.use('/api/auth',       authRoutes);
  app.use('/api/store',      storeRoutes);
  app.use('/api/wallet',     walletRoutes);
  app.use('/api/orders',     ordersRoutes);
  app.use('/api/users',      usersRoutes);
  app.use('/api/admin',      adminRoutes);
  app.use('/api/deliveries', delivRoutes);
  app.use('/api/addon',      addonRoutes);

  // 7. SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // 8. Error handler
  app.use(errorHandler);

  // 9. Arrancar
  app.listen(cfg.port, () => {
    log.ok(`Nodowa Tienda corriendo en http://localhost:${cfg.port}`);
    log.info(`Entorno: ${cfg.nodeEnv}`);
  });
}

start().catch(err => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});