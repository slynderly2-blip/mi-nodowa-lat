# 🚨 DEPLOYMENT URGENTE - Railway No Detecta Cambios

## El Problema
Railway no está detectando los commits automáticamente. Los paquetes siguen siendo infinitos porque el backend en producción tiene código viejo.

## ✅ SOLUCIÓN INMEDIATA (Sin CLI)

### Opción 1: Trigger Manual desde Dashboard
1. Ve a https://railway.app
2. Selecciona tu proyecto "nodowa-tienda"
3. Click en tu servicio (backend)
4. Click en **"Deployments"** (pestaña superior)
5. Click en botón **"Deploy"** (esquina superior derecha)
6. Selecciona:
   - Branch: `master`
   - Commit: `8d62abc` (o el más reciente)
7. Click **"Deploy Now"**

### Opción 2: Forzar con Git Empty Commit
```bash
git commit --allow-empty -m "trigger: force railway deployment"
git push origin main:master
```

Luego espera 30 segundos y ve al dashboard de Railway.

### Opción 3: Reconectar el Repo en Railway
1. Ve a Railway → Tu proyecto
2. Settings → GitHub Repo
3. Click "Disconnect"
4. Click "Connect GitHub Repo"
5. Selecciona tu repo `slynderly2-blip/mi-nodowa-lat`
6. Branch: `master`
7. Guarda y espera el auto-deploy

---

## 🔍 Verificar que Railway Deployó

### Check 1: Ver el Commit Activo
En Railway Dashboard:
- Ve a "Deployments"
- El deployment activo debe mostrar commit `8d62abc` o posterior
- Status debe ser **"Success" (verde)**

### Check 2: Test del Endpoint Nuevo
```bash
curl -X POST https://tienda.nodowa.lat/api/addon/claim-delivery \
  -H "Content-Type: application/json" \
  -d '{"deliveryId":"test123"}'
```

**Respuesta esperada** (si deployó correctamente):
```json
{"ok":false,"error":"Entrega no encontrada"}
```

**Respuesta vieja** (si NO deployó):
```
Cannot POST /api/addon/claim-delivery
```

---

## 🎮 Después de que Railway Deploye

### 1. NO necesitas aplicar migración
El código nuevo funciona sin migración (modo fallback).

### 2. Instala el addon actualizado
En tu servidor Minecraft:
```bash
# Detén el servidor
stop

# Reemplaza el addon en behavior_packs con:
nodowa_economy_addon_fixed.mcpack

# Inicia el servidor
start
```

### 3. Test de Duplicación
1. Compra 1 Iron Ingot en la web
2. Entra a Minecraft
3. `/tienda` → Buzón → Reclamar
4. Verifica inventario: debe tener EXACTAMENTE 1 Iron Ingot
5. Abre buzón de nuevo: NO debe aparecer el mismo item

---

## ❓ Si Sigue sin Funcionar

### Debug: Ver Logs de Railway
```bash
railway logs --tail
```

Busca estas líneas:
- `[Addon] 🔒 Delivery XXX bloqueada` ← Buena señal
- `[Addon] ⚠️ BLOQUEADO: delivery XXX ya entregada` ← Funcionando correctamente
- `Cannot POST /api/addon/claim-delivery` ← Railway NO deployó

### Si los logs no muestran las líneas nuevas:
Railway definitivamente NO deployó. Opciones:

1. **Desconectar y reconectar repo** (Opción 3 arriba)
2. **Usar Railway CLI**:
   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   railway up
   ```
3. **Crear nuevo servicio** en Railway apuntando al mismo repo

---

## 🆘 Solución de Emergencia

Si nada funciona, puedes editar el archivo directamente en Railway:

1. Railway Dashboard → Tu servicio
2. Deployments → Click en deployment activo
3. "..." → **"Shell"**
4. Edita el archivo:
```bash
nano src/modules/addon/addon.service.js
```

5. Busca la función `ackDelivery`
6. Agrega al inicio (después de `if (!delivery)`):
```javascript
if (delivery.status === 'DELIVERED') {
  return { ok: true, already: true };
}
```

7. Guarda: `Ctrl+X` → `Y` → `Enter`
8. Reinicia: `exit` → Click "Restart"

---

**COMMIT ACTUAL**: `8d62abc`  
**ARCHIVO CLAVE**: `src/modules/addon/addon.service.js`  
**ENDPOINT NUEVO**: `POST /api/addon/claim-delivery`
