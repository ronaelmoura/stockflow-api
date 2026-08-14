import type { RowDataPacket } from "mysql2/promise";
import { db, transaction } from "../src/lib/database.js";

type EventRow = RowDataPacket & { id: string; topic: string; aggregate_id: string; payload: unknown };
const events = await transaction(async (connection) => {
  const [rows] = await connection.query<EventRow[]>(
    "SELECT id, topic, aggregate_id, payload FROM outbox_events WHERE published_at IS NULL AND available_at <= NOW() ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED"
  );
  for (const event of rows) {
    console.log(JSON.stringify({ event: event.topic, aggregateId: event.aggregate_id, payload: event.payload }));
    await connection.execute("UPDATE outbox_events SET published_at = NOW(), attempts = attempts + 1 WHERE id = ?", [event.id]);
  }
  return rows.length;
});
console.log(`✓ ${events} evento(s) publicados pelo worker demonstrativo.`);
await db.end();
