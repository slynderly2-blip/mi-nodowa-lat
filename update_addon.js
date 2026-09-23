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
  const localAddon = 'nodowa_economy_addon_final.mcpack';
  const remotePath = '/development_behavior_packs/nodowa_economy_connector_bp';
  const extractPath = './addon_temp';

  try {
    console.log('📦 Extrayendo addon FINAL...');
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
    
    const zip = new AdmZip(localAddon);
    zip.extractAllTo(extractPath, true);
    console.log('✓ Extraído');

    console.log('\n🌐 Conectando a servidor...');
    await sftp.connect(config);
    console.log('✓ Conectado');

    console.log('\n🗑️ Limpiando carpeta remota...');
    const files = await sftp.list(remotePath);
    for (const file of files) {
      if (file.name !== '.' && file.name !== '..') {
        try {
          await sftp.delete(`${remotePath}/${file.name}`);
        } catch {}
      }
    }
    console.log(`✓ ${files.length} archivos eliminados`);

    console.log('\n📤 Subiendo archivos CORREGIDOS...');
    const uploadDir = async (localDir, remoteDir) => {
      const items = fs.readdirSync(localDir, { withFileTypes: true });
      for (const item of items) {
        const localPath = path.join(localDir, item.name);
        const remotePath = `${remoteDir}/${item.name}`;
        
        if (item.isDirectory()) {
          try {
            await sftp.mkdir(remotePath, true);
          } catch {}
          await uploadDir(localPath, remotePath);
        } else {
          console.log(`  → ${item.name}`);
          await sftp.put(localPath, remotePath);
        }
      }
    };

    await uploadDir(extractPath, remotePath);
    
    console.log('\n✅ ADDON FINAL SUBIDO - DUPLICACIÓN ARREGLADA');
    console.log('   REINICIA EL SERVIDOR: stop');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sftp.end();
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
  }
}

updateAddon();
