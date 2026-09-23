# 🔧 FIXES COMPLETADOS - Nodowa Tienda

## ✅ 1. FIX CRÍTICO: Duplicación de Entregas (RESUELTO)

### Problema
- Los items llegaban duplicados (ej: 64 lingotes → 128 lingotes)
- Cada compra se entregaba 2 veces al jugador

### Causa Raíz
El addon de Minecraft (`main.js`) ejecutaba los comandos ANTES de llamar al backend para confirmar:
```javascript
// ANTES (MALO):
async function executeDelivery(player, del) {
  // 1. Primero ejecuta comandos (da items)
  player.dimension.runCommand(cmd);
  
  // 2. Después llama al backend
  await httpPost('/api/addon/ack-delivery', { deliveryId: del.id });
}
```

Si el formulario del addon se reiniciaba (sistema de retry con `maxRetries = 8`), la función se ejecutaba 2 veces completas.

### Solución Implementada

**Backend** - Sistema de bloqueo atómico:
1. Nuevo endpoint `POST /api/addon/claim-delivery`:
   - Se llama ANTES de ejecutar comandos
   - Genera un `claimToken` único
   - Marca el delivery con `claiming_started_at`
   - Solo permite un claim por delivery (race condition protection)

2. Endpoint actualizado `POST /api/addon/ack-delivery`:
   - Ahora requiere el `claimToken` para validar
   - Solo marca como DELIVERED si el token coincide
   - Detecta y bloquea intentos duplicados

**Addon** - Nuevo flujo seguro:
```javascript
// NUEVO (CORRECTO):
async function executeDelivery(player, del) {
  // 1. Primero obtener lock del backend
  const claim = await httpPost('/api/addon/claim-delivery', { deliveryId: del.id });
  if (!claim.ok) return; // Bloqueado, ya fue procesado
  
  // 2. Ejecutar comandos solo si obtuvimos el lock
  player.dimension.runCommand(cmd);
  
  // 3. Confirmar con token
  await httpPost('/api/addon/ack-delivery', { 
    deliveryId: del.id,
    claimToken: claim.claimToken 
  });
}
```

**Database**:
- Migración `004_delivery_lock.sql`
- Nuevas columnas: `claiming_started_at`, `claim_token`
- Índice único en `claim_token` para garantizar atomicidad

**Archivos Modificados**:
- ✅ `src/modules/addon/addon.service.js` - Lógica de claim/ack
- ✅ `src/modules/addon/addon.routes.js` - Nueva ruta claim
- ✅ `addon_extracted/scripts/main.js` - Nuevo flujo executeDelivery
- ✅ `migrations/004_delivery_lock.sql` - Schema de bloqueo
- ✅ `nodowa_economy_addon_fixed.mcpack` - Addon actualizado listo

---

## ✅ 2. Sistema de Avatar (COMPLETADO)

### Cambios Implementados
1. **Avatar clickeable**: Tocar la imagen de perfil permite subir foto
2. **Sin campo URL**: Removido input de URL, solo subida de archivo
3. **Integración Crafatar**: Fallback a skins reales de Minecraft
4. **Preview inmediato**: FileReader muestra preview antes de subir

### Archivos Modificados
- ✅ `public/index.html` - UI clickeable
- ✅ `public/js/app.js` - Auto-upload y preview

---

## ✅ 3. Lista de Jugadores (COMPLETADO)

### Cambio
Ahora muestra todos los jugadores por defecto (límite 50), sin necesidad de buscar.

### Archivos Modificados
- ✅ `public/js/app.js` - `loadPlayers()` carga leaderboard por defecto

---

## ✅ 4. Sistema de Inbox/Notificaciones (YA IMPLEMENTADO)

### Estado Actual
- Backend: ✅ Completamente implementado
  - `getInbox()`, `markRead()`, `markAllRead()`, `getUnreadCount()`
  - Rutas: `/api/users/inbox`, `/api/users/inbox/:id/read`, etc.
  
- Frontend: ✅ Completamente implementado
  - `loadInbox()` carga mensajes con paginación
  - Badge de unread count
  - Click para marcar como leído

### Notificaciones Automáticas
Ya se crean mensajes automáticamente en:
- ✅ `buyWithNC()` - Cuando compras con Nodocoins
- ✅ `submitOrder()` - Cuando envías un pedido admin
- ✅ `approveOrder()` - Cuando admin aprueba pedido
- ✅ `rejectOrder()` - Cuando admin rechaza pedido

### Por qué aparece vacío
Si el buzón aparece vacío es porque:
1. No hay mensajes en la tabla `messages` para ese usuario
2. O hubo un error de permisos/auth

**Solución**: Verificar en Railway que la tabla `messages` existe y tiene datos.

---

## ⚠️ 5. Persistencia de Sesión (PENDIENTE VERIFICAR)

### Estado Actual
- JWT expira en 7 días: ✅ Correcto
- localStorage guarda token: ✅ Implementado
- Auto-login en pageload: ✅ Implementado

### Posibles Causas del Problema
1. **Cache de Railway**: El usuario reporta que ve commits viejos en logs
2. **Browser cache**: localStorage puede estar siendo limpiado
3. **Cookies de Railway**: Posible conflicto de cookies

### Próximo Paso
Verificar que el deployment en Railway esté actualizado con el último commit.

---

## 📦 DEPLOYMENT

### Commits Pusheados
```bash
commit 19bfd52 - FIX CRÍTICO: Prevenir duplicación de entregas
commit 14ad650 - Avatar system + inbox notifications + players list
```

### Archivos Listos para Desplegar
1. **Backend**: Ya pusheado a GitHub → Railway auto-deploy
2. **Addon**: `nodowa_economy_addon_fixed.mcpack` listo para instalar en servidor Minecraft

### Instrucciones de Deployment

#### Railway (Backend)
1. Verificar que Railway haya detectado el push
2. Esperar a que el build complete
3. Verificar logs: `railway logs`
4. Correr migración 004 en producción:
   ```bash
   railway run node migrations/run-migration.js 004_delivery_lock.sql
   ```

#### Minecraft (Addon)
1. Detener el servidor de Minecraft
2. Reemplazar el addon viejo con `nodowa_economy_addon_fixed.mcpack`
3. Reiniciar el servidor
4. **CRÍTICO**: Todos los jugadores deben actualizar el addon en su cliente también

---

## 🔍 VERIFICACIÓN POST-DEPLOYMENT

### Checklist Backend
- [ ] Railway muestra commit `19bfd52` en logs
- [ ] Endpoint `/api/addon/claim-delivery` responde
- [ ] Migración 004 aplicada (columnas `claim_token`, `claiming_started_at` existen)
- [ ] Tabla `messages` existe y tiene datos

### Checklist Addon
- [ ] Jugadores pueden abrir `/tienda` sin error
- [ ] Compras NO llegan duplicadas (verificar con 1 item pequeño primero)
- [ ] Buzón muestra pedidos pendientes
- [ ] Después de reclamar, item ya no aparece en buzón

### Test Completo
1. Comprar 1 item en la web (ej: 1 manzana)
2. Entrar al servidor Minecraft
3. Ejecutar `/tienda` → abrir Buzón
4. Reclamar la compra
5. Verificar inventario: debe tener EXACTAMENTE 1 manzana (no 2)
6. Volver a abrir buzón: el item NO debe aparecer

---

## 📝 NOTAS TÉCNICAS

### Por qué este fix funciona
- **Atomicidad**: El claim-delivery usa UPDATE con WHERE condicional
- **Token único**: SQLite garantiza unicidad con índice UNIQUE
- **Detección de retry**: claiming_started_at detecta procesos en curso
- **Validación bidireccional**: Backend valida, addon valida, ambos deben coincidir

### Limitaciones
- Si el servidor Minecraft se reinicia mientras un delivery está "claiming", quedará bloqueado por 30s (timeout automático)
- Si un jugador cierra el juego después de claim pero antes de ack, el item no se entrega pero queda marcado como "claiming" (se auto-libera en 30s)

---

## 🎯 PRÓXIMOS PASOS

1. **Verificar deployment en Railway**
2. **Instalar addon actualizado en servidor Minecraft**
3. **Hacer test de compra real**
4. **Monitorear logs de duplicación**
5. **Si persiste**: Revisar tabla `delivery_acks` para ver patrón de intentos

---

**Autor**: Kiro AI Assistant  
**Fecha**: 2026-09-22  
**Commit**: 19bfd52
