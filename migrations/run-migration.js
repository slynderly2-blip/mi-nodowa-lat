const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  await db.initDB();

  const migrationFile = process.argv[2] || '004_delivery_lock.sql';
  const migrationPath = path.join(__dirname, migrationFile);

  console.log(`📦 Ejecutando migración: ${migrationFile}`);

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const statements = sql.split(';').filter(s => s.trim());

  for (const stmt of statements) {
    try {
      db.run(stmt);
      console.log('✓ Ejecutado:', stmt.substring(0, 60).replace(/\n/g, ' ') + '...');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('⚠ Columna ya existe, continuando...');
      } else if (e.message.includes('already exists')) {
        console.log('⚠ Ya existe, continuando...');
      } else {
        console.error('❌ Error:', e.message);
        throw e;
      }
    }
  }

  db.persistDB();
  console.log('✅ Migración completada');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
