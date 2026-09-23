# 🚂 Instrucciones de Deployment en Railway

## ✅ Paso 1: Push Completado
Los cambios ya están en la rama `master` (Railway auto-deploy activado).

**Commits desplegados**:
- `60bfc41` - Documentación de fixes
- `19bfd52` - FIX CRÍTICO duplicación de entregas
- Backend actualizado con sistema de bloqueo atómico

---

## 📋 Paso 2: Verificar Deployment

1. Ve a tu dashboard de Railway: https://railway.app
2. Busca tu proyecto "nodowa-tienda"
3. Deberías ver un nuevo deployment en progreso
4. Espera a que el indicador se ponga verde (✅ Success)

**Si no inicia automáticamente**:
- Click en tu servicio
- Click en "Deployments"
- Click en "Deploy" (botón superior derecho)
- Selecciona la rama `master`

---

## 🗄️ Paso 3: Ejecutar Migración en Producción

**Una vez que el deployment esté completo**, ejecuta la migración:

### Opción A: Desde Railway CLI (Recomendado)
```bash
# Instalar Railway CLI si no lo tienes
npm i -g @railway/cli

# Login
railway login

# Conectar al proyecto
railway link

# Ejecutar migración
railway run node migrations/run-migration.js 004_delivery_lock.sql
```

### Opción B: Desde Dashboard de Railway
1. Ve a tu servicio en Railway
2. Click en "Settings" → "Variables"
3. Asegúrate que `DATABASE_PATH` apunta a `/app/data/nodowa.db`
4. Ve a "Deployments" → Click en el deployment activo
5. Click en "..." → "Shell"
6. Ejecuta:
   ```bash
   node migrations/run-migration.js 004_delivery_lock.sql
   ```

### Opción C: Desde tu terminal con SSH
```bash
# Si Railway expone puerto SSH
railway ssh
node migrations/run-migration.js 004_delivery_lock.sql
exit
```

---

## 🔍 Paso 4: Verificar que Todo Funciona

### Test 1: Backend endpoints
```bash
# Verificar que el nuevo endpoint existe
curl https://tienda.nodowa.lat/api/addon/claim-delivery \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"deliveryId":"test"}'

# Debería responder con error "Entrega no encontrada" (esto es correcto)
```

### Test 2: Database schema
Verifica en Railway Shell que las columnas nuevas existen:
```bash
railway run node -e "const db = require('./src/config/database'); db.initDB().then(() => { const cols = db.query('PRAGMA table_info(deliveries)'); console.log(JSON.stringify(cols, null, 2)); process.exit(0); })"
```

Deberías ver en la salida:
- `claiming_started_at` 
- `claim_token`

### Test 3: Hacer compra de prueba
1. Entra a https://tienda.nodowa.lat
2. Compra 1 item barato (ej: 1 manzana)
3. Verifica que NO llegue duplicado en Minecraft

---

## 🎮 Paso 5: Actualizar Addon de Minecraft

**IMPORTANTE**: El backend ya está actualizado, pero el addon también necesita actualizarse.

### En el Servidor Minecraft:
1. Detén el servidor
2. Ve a la carpeta `behavior_packs`
3. Reemplaza el addon viejo con `nodowa_economy_addon_fixed.mcpack`
4. Reinicia el servidor

### En los Clientes (Jugadores):
**Todos los jugadores** deben actualizar el addon:
1. Descargar `nodowa_economy_addon_fixed.mcpack`
2. Abrir con Minecraft
3. Activar en el mundo
4. Reiniciar Minecraft

**Nota**: Si los jugadores no actualizan el addon, seguirán teniendo duplicados porque el código viejo está en sus clientes.

---

## 🐛 Troubleshooting

### "No se puede conectar a Railway"
```bash
railway login
# Sigue las instrucciones en el navegador
```

### "Migración falla con DB no inicializada"
El script espera que `DATABASE_PATH` apunte al archivo correcto. Verifica:
```bash
railway variables
# Busca DATABASE_PATH
```

### "Deployment tarda mucho"
Railway puede tardar 2-5 minutos en:
1. Detectar el cambio en GitHub
2. Clonar el repo
3. Instalar dependencias (npm install)
4. Iniciar el servidor

Revisa los logs en tiempo real: Railway Dashboard → Tu Servicio → "View Logs"

### "Error al ejecutar migración"
Si la migración ya se ejecutó antes, verás:
```
⚠ Columna ya existe, continuando...
```
Esto es normal y esperado.

---

## 📊 Monitoreo Post-Deployment

### Logs importantes a buscar:
```bash
railway logs --follow
```

Busca estas líneas:
- `[DB] SQLite iniciado: /app/data/nodowa.db`
- `[Server] Escuchando en puerto XXXX`
- `[Addon] 🔒 Delivery XXX bloqueada para reclamar con token`
- `[Addon] ✅ Entrega ACK exitoso`

### Si ves advertencias de duplicados:
```
[Addon] ⚠️ INTENTO DUPLICADO bloqueado
```
**Esto es CORRECTO** - significa que el sistema está funcionando y bloqueó un intento duplicado.

---

## ✅ Checklist Final

- [ ] Deployment completado en Railway (indicador verde)
- [ ] Migración 004 ejecutada sin errores
- [ ] Endpoint `/api/addon/claim-delivery` responde
- [ ] Columnas `claim_token` y `claiming_started_at` existen en BD
- [ ] Addon actualizado en servidor Minecraft
- [ ] Jugadores informados de actualizar addon en sus clientes
- [ ] Test de compra: 1 item → llega 1 vez (no duplicado)

---

**Última actualización**: 2026-09-22  
**Commit desplegado**: `60bfc41`
