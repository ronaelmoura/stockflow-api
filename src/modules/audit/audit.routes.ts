import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { db } from "../../lib/database.js";
import { authorize } from "../../middlewares/auth.js";

const router = Router();

router.get("/", authorize("ADMIN", "MANAGER"), asyncHandler(async (req, res) => {
  const query = z.object({ entityType: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, actor_id AS actorId, action, entity_type AS entityType, entity_id AS entityId,
            request_id AS requestId, metadata, created_at AS createdAt
     FROM audit_events WHERE (? IS NULL OR entity_type = ?) ORDER BY id DESC LIMIT ?`,
    [query.entityType ?? null, query.entityType ?? null, query.limit]
  );
  res.json({ data: rows });
}));

export default router;
