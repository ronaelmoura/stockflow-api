import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";

export async function enqueue(connection: PoolConnection, topic: string, aggregateId: string, payload: unknown) {
  await connection.execute(
    "INSERT INTO outbox_events (id, topic, aggregate_id, payload) VALUES (?, ?, ?, ?)",
    [randomUUID(), topic, aggregateId, JSON.stringify(payload)]
  );
}
