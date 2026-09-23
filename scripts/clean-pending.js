const db = require('../src/config/database');

db.initDB().then(() => {
  const pending = db.query(
    `SELECT username, item_title, id, created_at FROM deliveries WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 50`
  );
  console.log(`\nPENDING deliveries en BD local: ${pending.length}`);
  pending.forEach(r => console.log(` - ${r.username} | ${r.item_title} | ${r.id} | ${r.created_at}`));
  process.exit(0);
});
