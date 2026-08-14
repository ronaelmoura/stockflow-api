import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { audit } from "../../lib/audit.js";
import { db, transaction } from "../../lib/database.js";
import { AppError } from "../../lib/errors.js";
import { authorize } from "../../middlewares/auth.js";

const router = Router();
const movementSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  type: z.enum(["INBOUND", "OUTBOUND", "ADJUSTMENT"]),
  quantity: z.number().int(),
  reason: z.string().trim().min(5).max(255),
  expectedVersion: z.number().int().positive().optional()
}).superRefine((value, ctx) => {
  if (value.type !== "ADJUSTMENT" && value.quantity <= 0) ctx.addIssue({ code: "custom", message: "Entradas e saídas exigem quantidade positiva.", path: ["quantity"] });
  if (value.type === "ADJUSTMENT" && value.quantity === 0) ctx.addIssue({ code: "custom", message: "O ajuste não pode ser zero.", path: ["quantity"] });
});

router.get("/", asyncHandler(async (req, res) => {
  const query = z.object({ warehouseId: z.string().uuid().optional(), productId: z.string().uuid().optional() }).parse(req.query);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT i.product_id AS productId, p.sku, p.name, i.warehouse_id AS warehouseId, w.code AS warehouse,
            i.quantity, i.reserved, i.quantity - i.reserved AS available, i.version, p.reorder_point AS reorderPoint
     FROM inventory i JOIN products p ON p.id = i.product_id JOIN warehouses w ON w.id = i.warehouse_id
     WHERE (? IS NULL OR i.warehouse_id = ?) AND (? IS NULL OR i.product_id = ?)
     ORDER BY p.name, w.code`, [query.warehouseId ?? null, query.warehouseId ?? null, query.productId ?? null, query.productId ?? null]
  );
  res.json({ data: rows });
}));

router.get("/low-stock", asyncHandler(async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT p.id AS productId, p.sku, p.name, w.code AS warehouse,
            i.quantity - i.reserved AS available, p.reorder_point AS reorderPoint,
            GREATEST(p.reorder_point - (i.quantity - i.reserved), 0) AS suggestedPurchase
     FROM inventory i JOIN products p ON p.id = i.product_id JOIN warehouses w ON w.id = i.warehouse_id
     WHERE p.active = TRUE AND (i.quantity - i.reserved) <= p.reorder_point
     ORDER BY suggestedPurchase DESC`
  );
  res.json({ data: rows, meta: { alertCount: rows.length } });
}));

router.post("/movements", authorize("ADMIN", "MANAGER", "OPERATOR"), asyncHandler(async (req, res) => {
  const input = movementSchema.parse(req.body);
  const actorId = req.auth!.userId;
  const result = await transaction(async (connection) => {
    const [rows] = await connection.query<(RowDataPacket & { quantity: number; reserved: number; version: number })[]>(
      "SELECT quantity, reserved, version FROM inventory WHERE product_id = ? AND warehouse_id = ? FOR UPDATE",
      [input.productId, input.warehouseId]
    );
    const current = rows[0] ?? { quantity: 0, reserved: 0, version: 0 };
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      throw new AppError(409, "VERSION_CONFLICT", "O estoque foi alterado por outra operação.", { currentVersion: current.version });
    }
    const delta = input.type === "OUTBOUND" ? -input.quantity : input.quantity;
    const nextQuantity = current.quantity + delta;
    if (nextQuantity < current.reserved) throw new AppError(409, "INSUFFICIENT_STOCK", "A operação reduziria o estoque abaixo da quantidade reservada.");
    const nextVersion = current.version + 1;
    await connection.execute(
      `INSERT INTO inventory (product_id, warehouse_id, quantity, reserved, version) VALUES (?, ?, ?, 0, 1)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), version = ?`,
      [input.productId, input.warehouseId, nextQuantity, nextVersion]
    );
    const movementId = randomUUID();
    await connection.execute(
      "INSERT INTO inventory_movements (id, product_id, warehouse_id, type, quantity, reason, actor_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [movementId, input.productId, input.warehouseId, input.type, delta, input.reason, actorId]
    );
    await audit(connection, { actorId, action: "inventory.moved", entityType: "inventory_movement", entityId: movementId, requestId: req.requestId, metadata: { ...input, delta, nextQuantity, nextVersion } });
    return { movementId, quantity: nextQuantity, reserved: current.reserved, available: nextQuantity - current.reserved, version: nextVersion };
  });
  res.status(201).json({ data: result });
}));

export default router;
