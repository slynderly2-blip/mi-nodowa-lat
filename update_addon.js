const Client = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const sftp = new Client();

const config = {
  host: 'carina.mcserverhost.com',
  port: 2022,
  username: 'Abram Huaygua.48518e6a',
  password: 'ortizuwu20'
};

async function updateAddon() {
  // Usar el mcpack con los bugs corregidos
  const localAddon  = 'nodowa_economy_addon_fixed.mcpack';
  const remotePath  = '/development_behavior_packs/nodowa_economy_connector_bp';
  const extractPath = './addon_temp';

  try {
    // ── 1. Extraer mcpack localmente ─────────────────────────────
    console.log(`📦 Extrayendo ${localAddon}...`);
    if (!fs.existsSync(localAddon)) {
      throw new Error(`No se encontró el archivo ${localAddon}. Verifica que exista en la raíz del proyecto.`);
    }
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
    const zip = new AdmZip(localAddon);
    zip.extractAllTo(extractPath, true);
    console.log('✓ Extraído');

    // ── 2. Conectar ──────────────────────────────────────────────
    console.log('\n🌐 Conectando a servidor SFTP...');
    await sftp.connect(config);
    console.log('✓ Conectado');

    // ── 3. Limpiar carpeta remota (recursivo) ────────────────────
    console.log('\n🗑️  Limpiando carpeta remota...');
    let deleted = 0;

    async function clearRemote(dir) {
      let entries;
      try {
        entries = await sftp.list(dir);
      } catch {
        return; // carpeta no existe aún, ok
      }
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue;
        const full = `${dir}/${entry.name}`;
        if (entry.type === 'd') {
          await clearRemote(full);
          try { await sftp.rmdir(full); } catch { /* ignorar si no vacía */ }
        } else {
          await sftp.delete(full);
          deleted++;
        }
      }
    }

    await clearRemote(remotePath);
    console.log(`✓ ${deleted} archivo(s) eliminado(s)`);

    // ── 4. Subir archivos corregidos ─────────────────────────────
    console.log('\n📤 Subiendo archivos corregidos...');
    let uploaded = 0;

    async function uploadDir(localDir, remoteDir) {
      // Asegurarse de que el directorio remoto existe
      try { await sftp.mkdir(remoteDir, true); } catch { /* ya existe */ }

      const items = fs.readdirSync(localDir, { withFileTypes: true });
      for (const item of items) {
        const localFull  = path.join(localDir, item.name);
        const remoteFull = `${remoteDir}/${item.name}`;
        if (item.isDirectory()) {
          await uploadDir(localFull, remoteFull);
        } else {
          console.log(`  ↑ ${remoteFull.replace(remotePath, '')}`);
          await sftp.put(localFull, remoteFull);
          uploaded++;
        }
      }
    }

    await uploadDir(extractPath, remotePath);
    console.log(`✓ ${uploaded} archivo(s) subido(s)`);

    console.log('\n✅ Addon actualizado correctamente.');
    console.log('   Reinicia el servidor Minecraft para aplicar los cambios: stop');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    try { await sftp.end(); } catch { /* ignorar */ }
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
  }
}

updateAddon();
