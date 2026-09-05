import { Client } from "ssh2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SFTP_CONFIG = {
  host:         process.env.SFTP_HOST || "carina.mcserverhost.com",
  port:         parseInt(process.env.SFTP_PORT || "2022"),
  username:     process.env.SFTP_USER || "Abram Huaygua.48518e6a",
  password:     process.env.SFTP_PASS || "ortizuwu20",
  readyTimeout: 20000,
};

const ADDONS = [
  {
    localDir:   path.join(__dirname, "addon", "nodowa_economy_addon"),
    remoteDest: "/development_behavior_packs/nodowa_economy_addon"
  },
  {
    localDir:   path.join(__dirname, "addon", "nodowa_worldedit_addon"),
    remoteDest: "/development_behavior_packs/nodowa_worldedit_addon"
  }
];

const WORLD_BP = "/worlds/level/world_behavior_packs.json";

function connectSFTP() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        resolve({ conn, sftp });
      });
    }).on("error", reject).connect(SFTP_CONFIG);
  });
}

function sftp_mkdir(sftp, remotePath) {
  return new Promise((resolve) => {
    sftp.mkdir(remotePath, () => resolve());
  });
}

function sftp_uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => err ? reject(err) : resolve());
  });
}

async function sftp_uploadDir(sftp, localDir, remoteDir) {
  await sftp_mkdir(sftp, remoteDir);
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const lp = path.join(localDir, entry.name);
    const rp = remoteDir + "/" + entry.name;
    if (entry.isDirectory()) {
      await sftp_uploadDir(sftp, lp, rp);
    } else {
      console.log(`Subiendo: ${entry.name} -> ${rp}`);
      await sftp_uploadFile(sftp, lp, rp);
    }
  }
}

function sftp_readFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", c => chunks.push(c));
    stream.on("end",  () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function sftp_writeFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on("close", resolve);
    stream.on("error", reject);
    stream.end(content);
  });
}

async function main() {
  console.log("Conectando a SFTP...");
  const { conn, sftp } = await connectSFTP();

  try {
    for (const addon of ADDONS) {
      console.log(`\n--- Subiendo: ${path.basename(addon.localDir)} ---`);
      await sftp_uploadDir(sftp, addon.localDir, addon.remoteDest);
      console.log(`exito ${path.basename(addon.localDir)} subido a ${addon.remoteDest}`);
    }

    console.log("\nActualizando world_behavior_packs.json...");
    let worldPacks = [];
    try {
      const buf = await sftp_readFile(sftp, WORLD_BP);
      worldPacks = JSON.parse(buf.toString("utf8"));
    } catch (_) {
      worldPacks = [];
    }

    for (const addon of ADDONS) {
      const manifest = JSON.parse(fs.readFileSync(path.join(addon.localDir, "manifest.json"), "utf8"));
      const uuid    = manifest.header.uuid;
      const version = manifest.header.version || [1, 0, 0];
      const name    = manifest.header.name;

      const idx = worldPacks.findIndex(p => p.pack_id === uuid);
      if (idx >= 0) {
        worldPacks[idx].version = version;
        console.log(`  Version actualizada: ${name}`);
      } else {
        worldPacks.push({ pack_id: uuid, version });
        console.log(`  Pack anadido: ${name}`);
      }
    }

    await sftp_writeFile(sftp, WORLD_BP, JSON.stringify(worldPacks, null, 2));
    console.log("exito world_behavior_packs.json guardado.");

  } finally {
    conn.end();
    console.log("\nConexion SFTP finalizada.");
  }
}

main().catch(err => {
  console.error("Error al subir addons:", err);
  process.exit(1);
});
