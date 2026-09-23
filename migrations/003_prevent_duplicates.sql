-- Prevenir entregas duplicadas agregando constraint
-- Esto evita que se creen múltiples entregas pendientes del mismo item para el mismo usuario

CREATE INDEX IF NOT EXISTS idx_deliveries_unique_pending 
ON deliveries(username, item_title, created_at) 
WHERE status = 'PENDING';

-- Agregar log de intentos de ACK
CREATE TABLE IF NOT EXISTS delivery_acks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_acks_delivery ON delivery_acks(delivery_id);
