'use strict';
/**
 * src/server.js
 * Entry point del servidor Nodowa Tienda & Backend multimodular
 */

const app    = require('./app');
const cfg    = require('./config');
const { initDB, getDB, query } = require('./config/database');
const log    = require('./shared/logger');
const fs     = require('fs');
const path   = require('path');

async function startServer() {
  try {
    console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════');
    console.log('\x1b[35m%s\x1b[0m', '  🛒  NODOWA ECONOMY STORE & API SERVER v2.0  🛒');
    console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════');

    // 1. Inicializar SQLite
    await initDB();

    // 2. Comprobar si hay usuarios; si está vacío y existe el backup, auto-migrar
    const userCount = query('SELECT COUNT(*) as c FROM users')[0]?.c || 0;
    if (userCount === 0) {
      const backupPath = path.join(__dirname, '../backup_extracted/data/db.json');
      if (fs.existsSync(backupPath)) {
        log.info('Base de datos vacía detectada. Ejecutando migración automática...');
        const migrate = require('../migrations/002_migrate_json');
        await migrate();
      }
    }

    const statsUsers = query('SELECT COUNT(*) as c FROM users')[0]?.c || 0;
    const statsItems = query('SELECT COUNT(*) as c FROM store_items WHERE enabled = 1')[0]?.c || 0;

    // 3. Iniciar HTTP server
    const PORT = cfg.port || 3001;
    const server = app.listen(PORT, '0.0.0.0', () => {
      log.ok(`Servidor HTTP activo en: http://localhost:${PORT}`);
      log.info(`Usuarios en base de datos: ${statsUsers}`);
      log.info(`Items activos en tienda: ${statsItems}`);
      log.info(`Endpoints del Addon listos en: http://localhost:${PORT}/api/addon/`);
      log.info(`Panel de administración en: http://localhost:${PORT}/#admin`);
      console.log('\x1b[32m%s\x1b[0m', `  ⚡ ¡Tienda web lista! Abre http://localhost:${PORT} en tu navegador`);
      console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`El puerto ${PORT} ya está en uso por otro proceso. Cierra la otra ventana o cambia el puerto en .env`);
      } else {
        log.error('Error en el servidor:', err.message);
      }
      process.exit(1);
    });

  } catch (err) {
    log.error('Error fatal iniciando el servidor:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
