-- Migration 004: Agregar sistema de bloqueo para evitar entregas duplicadas
-- Problema: El addon ejecuta comandos ANTES de llamar ack-delivery, causando duplicación
-- Solución: Agregar timestamp de "claiming" y columna de lock

-- Agregar columna para marcar cuando se INICIA la reclamación (antes de ejecutar comandos)
ALTER TABLE deliveries ADD COLUMN claiming_started_at TEXT;
ALTER TABLE deliveries ADD COLUMN claim_token TEXT;

-- Crear índice para búsquedas rápidas de deliveries en proceso
CREATE INDEX IF NOT EXISTS idx_deliveries_claiming ON deliveries(status, claiming_started_at);

-- Crear índice único para claim_token (no podemos hacerlo en ALTER TABLE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_claim_token ON deliveries(claim_token) WHERE claim_token IS NOT NULL;
