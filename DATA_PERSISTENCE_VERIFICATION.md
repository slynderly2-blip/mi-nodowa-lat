# Verificación de Persistencia de Datos

## ✅ Configuración Verificada

### 1. Base de Datos SQLite

**Ubicación configurada:**
- Variable de entorno: `DB_PATH` (default: `./data/nodowa.db`)
- Configuración: `src/config/index.js`
- Valor por defecto: `./data/nodowa.db`

**Para producción en Railway:**
Configura la variable de entorno:
```
DB_PATH=/app/data/nodowa.db
```

**Archivos:**
```
src/config/database.js  ← Maneja persistencia con sql.js
src/config/index.js     ← Lee DB_PATH desde env vars
```

### 2. Uploads de Usuarios

**Avatares:**
- Directorio: `data/uploads/avatars/`
- Endpoint: `POST /api/users/profile/upload-avatar`
- Almacenamiento: `{username}.{ext}`
- URL pública: `/data/uploads/avatars/{username}.{ext}`
- Límite: 5MB
- Formatos: JPG, JPEG, PNG, GIF, WEBP

**Configuración:**
```javascript
// src/modules/users/users.routes.js
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../data/uploads/avatars'),
  filename: `${req.user.username}${ext}`
});
```

**Servido estáticamente:**
```javascript
// src/server.js
app.use('/data/uploads', express.static(path.join(__dirname, '../data/uploads')));
```

### 3. Estructura del Directorio /data

```
/data/
├── nodowa.db                    ← Base de datos SQLite
└── uploads/
    └── avatars/                 ← Avatares de usuarios
        ├── username1.jpg
        ├── username2.png
        └── ...
```

### 4. Configuración de Railway

**Volumen montado:**
- Volume ID: `vol_qnq8z92thq9mgfap`
- Mount point: `/app/data`

**Variables de entorno requeridas:**
```env
DB_PATH=/app/data/nodowa.db
NODE_ENV=production
JWT_SECRET=<tu-secret-seguro>
PORT=3001
```

**Opcional (ya tienen defaults):**
```env
UPLOADS_DIR=./uploads              # No usado actualmente
MAX_UPLOAD_MB=10                   # Límite general (avatares usan 5MB)
```

## ✅ Verificaciones Completadas

### Código Backend

- [x] Base de datos apunta a `/data/nodowa.db` (configurable via env var)
- [x] Uploads de avatares van a `/data/uploads/avatars/`
- [x] Directorio de avatares se crea automáticamente si no existe
- [x] Archivos en `/data/uploads/` se sirven estáticamente
- [x] Multer configurado con límites de tamaño (5MB)
- [x] Validación de tipos de archivo (solo imágenes)
- [x] No hay otros módulos que manejen uploads (verificado)

### Código Frontend

- [x] Avatar por defecto local: `/img/default-avatar.svg`
- [x] Función `avatar()` prioriza imágenes subidas
- [x] Fallback a imagen default si la subida falla
- [x] Input de archivo en formulario de perfil
- [x] FormData correctamente enviado al endpoint
- [x] Validación de tipos en el input HTML

### Persistencia

- [x] Base de datos usa sql.js con escritura a disco cada 500ms
- [x] Flush inmediato en SIGINT/SIGTERM/exit
- [x] Escritura atómica con archivo .tmp y rename
- [x] Schema SQL se aplica automáticamente en primera ejecución
- [x] PRAGMA foreign_keys ON para integridad referencial

## 🔧 Configuración Recomendada para Railway

### 1. Variables de Entorno

En Railway Dashboard → Variables:
```
DB_PATH=/app/data/nodowa.db
NODE_ENV=production
JWT_SECRET=<genera-un-secret-seguro>
ADMIN_JWT_EXPIRES_IN=8h
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

### 2. Volumen

Verifica que el volumen está montado:
- Path: `/app/data`
- Debe ser persistente entre deployments

### 3. Build & Start

Railway debería detectar automáticamente:
```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

## 🧪 Testing en Producción

Una vez desplegado, verifica:

### 1. Base de datos
```bash
railway shell
ls -la /app/data/
sqlite3 /app/data/nodowa.db "SELECT COUNT(*) FROM users;"
```

### 2. Subir avatar
1. Inicia sesión en la app
2. Ve a "Perfil"
3. En "Editar perfil", sube una imagen
4. Verifica que aparece en Railway:
```bash
railway shell
ls -la /app/data/uploads/avatars/
```

### 3. Persistencia
1. Sube un avatar
2. Haz un redeploy de la aplicación
3. Verifica que el avatar sigue ahí

## 📦 Backups Recomendados

### Backup automático de Railway

Crea un script de backup periódico:

```bash
# backup-railway-db.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
railway run sqlite3 /app/data/nodowa.db .dump > backup_$DATE.sql
echo "Backup creado: backup_$DATE.sql"
```

Ejecútalo con cron:
```bash
# Cada día a las 2 AM
0 2 * * * cd /path/to/project && ./backup-railway-db.sh
```

### Backup manual

```bash
# Desde tu PC con Railway CLI
railway run cat /app/data/nodowa.db > nodowa_backup_$(date +%Y%m%d).db
```

## 📝 Notas Importantes

1. **El directorio `/data` es el único persistente** en Railway con el volumen montado
2. **Todos los uploads** (actuales y futuros) deben ir a `/data/uploads/`
3. **La base de datos** debe estar en `/app/data/nodowa.db` para persistir
4. **Los archivos fuera de `/data`** se perderán en cada redeploy
5. **El volumen es específico del servicio** - si creas un nuevo servicio, necesitarás un nuevo volumen

## 🚨 Troubleshooting

### Avatares no se muestran
- Verifica que `/data/uploads` se sirve estáticamente en `server.js`
- Confirma que el archivo existe en Railway: `ls /app/data/uploads/avatars/`
- Revisa permisos: `chmod 755 /app/data/uploads/avatars/`

### Base de datos no persiste
- Verifica `DB_PATH=/app/data/nodowa.db` en Railway
- Confirma que el volumen está montado en `/app/data`
- Revisa logs de escritura: busca `[DB] SQLite iniciado` en Railway logs

### Error "ENOENT: no such file or directory"
- El directorio se crea automáticamente en el código
- Si persiste, crea manualmente: `railway shell` → `mkdir -p /app/data/uploads/avatars`

## ✅ Checklist Final

Antes de considerar completa la migración:

- [ ] Railway CLI instalado y configurado
- [ ] Base de datos local subida a Railway (ver `RAILWAY_DATABASE_RESTORE.md`)
- [ ] Variable `DB_PATH=/app/data/nodowa.db` configurada
- [ ] Volumen montado correctamente en `/app/data`
- [ ] Puedes iniciar sesión con tu cuenta admin
- [ ] Puedes subir un avatar y se muestra correctamente
- [ ] Avatar persiste después de un redeploy
- [ ] Backup de la base de datos configurado

---

**Todo está configurado correctamente para que los datos persistan en `/data` tanto localmente como en Railway.**
