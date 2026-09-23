# Guía: Subir tu base de datos local a Railway

## Problema
Railway está ejecutando la aplicación con una base de datos vacía (default) en lugar de tu backup local con todos tus datos y cuenta de admin.

## Solución

### Opción 1: Usando Railway CLI (Recomendado)

#### 1. Instalar Railway CLI
```bash
# Windows (PowerShell)
iwr https://railway.app/install.ps1 | iex

# O con npm
npm install -g @railway/cli
```

#### 2. Autenticarse
```bash
railway login
```

#### 3. Vincular tu proyecto
```bash
# En el directorio del proyecto
cd c:\Users\abraham\Downloads\nodowa-tienda
railway link
```
Selecciona tu proyecto "nodowa-tienda" de la lista.

#### 4. Subir la base de datos al volumen
Railway ha montado un volumen en `/app/data`. Tu base de datos local está en:
```
c:\Users\abraham\Downloads\nodowa-tienda\data\nodowa.db
```

**Opción A: Copiar archivo directamente al volumen**
```bash
# Ver información del volumen
railway volumes

# Copiar el archivo al volumen
railway run --service <tu-servicio> cp ./data/nodowa.db /app/data/nodowa.db
```

**Opción B: Usar shell interactivo**
```bash
# Abrir shell en el contenedor
railway shell

# Dentro del shell, verifica la ubicación
ls -la /app/data/

# Sal del shell
exit
```

Luego sube el archivo usando la Railway web UI o con:
```bash
railway volume upload vol_qnq8z92thq9mgfap ./data/nodowa.db /nodowa.db
```

#### 5. Reiniciar la aplicación
```bash
railway restart
```

### Opción 2: Usando la interfaz web de Railway

#### 1. Acceder al volumen
1. Ve a tu proyecto en Railway: https://railway.app
2. Selecciona tu servicio "nodowa-tienda"
3. Ve a la pestaña **"Data"** o **"Volumes"**
4. Busca el volumen `vol_qnq8z92thq9mgfap`

#### 2. Acceder al contenedor
1. En Railway, ve a la pestaña **"Deployments"**
2. Selecciona el deployment activo
3. Haz clic en **"View Logs"** y luego en **"Shell"** o **"Terminal"**

#### 3. Verificar estructura actual
En el terminal, ejecuta:
```bash
ls -la /app/data/
pwd
```

Deberías ver algo como:
```
/app/data/
  nodowa.db (archivo vacío o default)
  uploads/
```

#### 4. Subir tu base de datos
Como no puedes copiar archivos directamente desde la UI, necesitas usar uno de estos métodos:

**Método A: Base64 encode (para archivos pequeños < 1MB)**
```bash
# En tu PC local (PowerShell)
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("c:\Users\abraham\Downloads\nodowa-tienda\data\nodowa.db"))
$base64 | Out-File -FilePath "nodowa_base64.txt"
```

Luego en el Railway shell:
```bash
# Pega el contenido base64 y decodifica
echo "<pega-aqui-el-base64>" | base64 -d > /app/data/nodowa.db
```

**Método B: Usar endpoint temporal para subir**
Crea un endpoint temporal en tu aplicación para subir la base de datos:

```javascript
// Agregar temporalmente en src/server.js (SOLO PARA DESARROLLO)
const multer = require('multer');
const upload = multer({ dest: '/tmp' });

app.post('/api/admin/upload-db', upload.single('database'), (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Copiar archivo subido a la ubicación de la BD
  const dbPath = path.join(__dirname, '../data/nodowa.db');
  fs.copyFileSync(req.file.path, dbPath);
  fs.unlinkSync(req.file.path);
  
  res.json({ ok: true, message: 'Database uploaded successfully' });
});
```

Luego desde tu PC:
```bash
curl -X POST -F "database=@./data/nodowa.db" https://tu-app.railway.app/api/admin/upload-db
```

**⚠️ ELIMINA este endpoint después de usarlo por seguridad.**

### Opción 3: Reconstruir la base de datos con SQL

Si las opciones anteriores no funcionan:

#### 1. Exportar tu base de datos local a SQL
```bash
# En tu PC, instala sqlite3 si no lo tienes
# Luego exporta:
sqlite3 ./data/nodowa.db .dump > backup.sql
```

#### 2. Copiar el SQL a Railway
En Railway shell:
```bash
# Crear un archivo SQL temporal
cat > /tmp/restore.sql << 'EOF'
-- Pega aquí el contenido de backup.sql
EOF

# Importar a la base de datos
sqlite3 /app/data/nodowa.db < /tmp/restore.sql
```

## Verificación

### 1. Confirmar que los datos se restauraron
Accede al Railway shell:
```bash
railway shell
```

Ejecuta:
```bash
sqlite3 /app/data/nodowa.db "SELECT COUNT(*) FROM users;"
sqlite3 /app/data/nodowa.db "SELECT username, is_admin FROM users WHERE is_admin = 1;"
```

Deberías ver tu cuenta de admin.

### 2. Verificar la persistencia de datos

Confirma que todo se guarda en `/app/data`:
- Base de datos: `/app/data/nodowa.db`
- Avatares subidos: `/app/data/uploads/avatars/`
- Otros uploads: `/app/data/uploads/`

El volumen de Railway montado en `/app/data` preservará todos estos archivos entre deployments.

### 3. Variables de entorno

Verifica en Railway que tienes:
```
DB_PATH=/app/data/nodowa.db
```

Si no está configurado, la aplicación usará `./data/nodowa.db` (relativo al directorio de ejecución).

## Troubleshooting

### "No puedo acceder a admin"
1. Verifica que tu usuario tiene `is_admin = 1` en la base de datos
2. Asegúrate de que restauraste la base de datos correcta
3. Revisa los logs de Railway para errores de autenticación

### "Los datos desaparecen después de redeploy"
1. Confirma que el volumen está montado correctamente en `/app/data`
2. Verifica que `DB_PATH` apunta a `/app/data/nodowa.db`
3. Revisa que no estés recreando la base de datos en cada inicio

### "Error al escribir en la base de datos"
1. Verifica permisos del directorio:
   ```bash
   ls -la /app/data/
   chmod 755 /app/data
   chmod 644 /app/data/nodowa.db
   ```

## Resumen de archivos a verificar

```
Railway (producción):
/app/data/
├── nodowa.db          <- Tu base de datos restaurada
└── uploads/
    └── avatars/       <- Avatares subidos por usuarios

Local (backup):
c:\Users\abraham\Downloads\nodowa-tienda\data\
├── nodowa.db          <- Tu backup con datos reales
└── uploads/
    └── avatars/
```

## Próximos pasos

1. ✅ Subir tu `nodowa.db` local a Railway
2. ✅ Verificar que tu cuenta admin funciona
3. ✅ Confirmar que los avatares se suben y persisten
4. ✅ Hacer backup regular de la base de datos desde Railway

---

**Nota**: Una vez restaurada la base de datos, todos tus datos (usuarios, órdenes, wallet, etc.) estarán disponibles en producción.
