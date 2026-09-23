#!/usr/bin/env node
'use strict';

const db = require('../src/config/database');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  await db.initDB();
  
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  
  // Verificar si existe
  const existing = db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username]);
  
  const hash = await bcrypt.hash(password, 10);
  
  if (existing) {
    // Actualizar
    db.run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ? COLLATE NOCASE', [hash, username]);
    console.log(`✅ Usuario "${username}" actualizado como admin`);
  } else {
    // Crear nuevo
    db.run(
      `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin) 
       VALUES (?, ?, ?, 0, 0, 0, 1)`,
      [username, username, hash]
    );
    console.log(`✅ Usuario admin "${username}" creado`);
  }
  
  console.log(`\n📋 CREDENCIALES DE ACCESO:`);
  console.log(`   Usuario:    ${username}`);
  console.log(`   Contraseña: ${password}`);
  console.log(`\nURL: https://tienda.nodowa.lat`);
  
  db.persistDB();
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
