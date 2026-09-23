#!/usr/bin/env node
/**
 * Script para crear un usuario administrador directamente
 * Uso: node scripts/create-admin.js <username> <password>
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

async function createAdmin(username, password) {
  if (!username || !password) {
    console.error('❌ Uso: node scripts/create-admin.js <username> <password>');
    process.exit(1);
  }

  // Importar módulos necesarios
  const { initDB, run, get, persistDB } = require('../src/config/database');

  try {
    // Inicializar BD
    await initDB();
    console.log('✅ Base de datos inicializada');

    // Verificar si el usuario ya existe
    const existing = get('SELECT id, username, is_admin FROM users WHERE username = ? COLLATE NOCASE', [username]);

    if (existing) {
      console.log(`⚠️  Usuario "${username}" ya existe`);
      
      if (existing.is_admin) {
        console.log('   El usuario ya es administrador');
        
        // Actualizar contraseña
        const hash = await bcrypt.hash(password, 10);
        run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, existing.id]);
        persistDB();
        console.log('✅ Contraseña actualizada');
      } else {
        // Convertir en admin y actualizar contraseña
        const hash = await bcrypt.hash(password, 10);
        run('UPDATE users SET is_admin = 1, password_hash = ? WHERE id = ?', [hash, existing.id]);
        persistDB();
        console.log('✅ Usuario convertido en administrador y contraseña actualizada');
      }
    } else {
      // Crear nuevo usuario admin
      const hash = await bcrypt.hash(password, 10);
      run(
        `INSERT INTO users (username, display_name, password_hash, wallet, bank, linked, is_admin) 
         VALUES (?, ?, ?, 0, 0, 0, 1)`,
        [username, username, hash]
      );
      persistDB();
      console.log(`✅ Usuario administrador "${username}" creado exitosamente`);
    }

    console.log('\n📋 Detalles:');
    console.log(`   Usuario: ${username}`);
    console.log(`   Contraseña: ${password}`);
    console.log(`   Rol: Administrador`);
    console.log('\n🔐 Ahora puedes iniciar sesión en la aplicación con estas credenciales');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar
const [,, username, password] = process.argv;
createAdmin(username, password);
