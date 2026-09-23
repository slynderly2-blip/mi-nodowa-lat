#!/usr/bin/env python3
import paramiko
import os
import zipfile

# Configuración SFTP
SFTP_HOST = "carina.mcserverhost.com"
SFTP_PORT = 2022
SFTP_USER = "Abram Huaygua.48518e6a"
SFTP_PASS = "ortizuwu20"

# Rutas
LOCAL_ADDON = "nodowa_economy_addon_fixed.mcpack"
REMOTE_PATH = "/development_behavior_packs/nodowa_economy_connector_bp"
EXTRACT_TO = "addon_temp"

def main():
    print("🔧 Actualizando addon en servidor Minecraft...")
    
    # Extraer addon localmente
    print(f"\n1. Extrayendo {LOCAL_ADDON}...")
    if os.path.exists(EXTRACT_TO):
        import shutil
        shutil.rmtree(EXTRACT_TO)
    
    with zipfile.ZipFile(LOCAL_ADDON, 'r') as zip_ref:
        zip_ref.extractall(EXTRACT_TO)
    
    print(f"✓ Extraído a {EXTRACT_TO}/")
    
    # Conectar SFTP
    print(f"\n2. Conectando a {SFTP_HOST}:{SFTP_PORT}...")
    transport = paramiko.Transport((SFTP_HOST, SFTP_PORT))
    transport.connect(username=SFTP_USER, password=SFTP_PASS)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    print("✓ Conectado")
    
    # Limpiar carpeta remota
    print(f"\n3. Limpiando {REMOTE_PATH}...")
    try:
        files = sftp.listdir(REMOTE_PATH)
        for f in files:
            try:
                sftp.remove(f"{REMOTE_PATH}/{f}")
            except:
                # Es un directorio
                pass
        print(f"✓ {len(files)} archivos eliminados")
    except Exception as e:
        print(f"⚠ Error limpiando: {e}")
    
    # Subir archivos nuevos
    print(f"\n4. Subiendo archivos nuevos...")
    uploaded = 0
    for root, dirs, files in os.walk(EXTRACT_TO):
        for file in files:
            local_path = os.path.join(root, file)
            relative_path = os.path.relpath(local_path, EXTRACT_TO)
            remote_file_path = f"{REMOTE_PATH}/{relative_path}".replace("\\", "/")
            
            # Crear directorios si no existen
            remote_dir = os.path.dirname(remote_file_path).replace("\\", "/")
            try:
                sftp.stat(remote_dir)
            except:
                try:
                    sftp.mkdir(remote_dir)
                except:
                    pass
            
            print(f"  📤 {relative_path}")
            sftp.put(local_path, remote_file_path)
            uploaded += 1
    
    print(f"\n✅ {uploaded} archivos subidos exitosamente")
    
    # Cerrar conexión
    sftp.close()
    transport.close()
    
    print("\n🎉 Addon actualizado. Reinicia el servidor Minecraft.")
    print("   Comando: stop")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
