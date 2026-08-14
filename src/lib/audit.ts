import type { PoolConnection } from "mysql2/promise";

export async function audit(
  connection: PoolConnection,
  event: { actorId?: string; action: string; entityType: string; entityId: string; requestId?: string; metadata?: unknown }
) {
  await connection.execute(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, request_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.actorId ?? null, event.action, event.entityType, event.entityId, event.requestId ?? null, JSON.stringify(event.metadata ?? {})]
  );
}
