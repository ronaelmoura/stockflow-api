import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { authorize } from "../../middlewares/auth.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { db } from "../../lib/database.js";

const router = Router();
const createProduct = z.object({
  sku: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).optional(),
  price: z.coerce.number().nonnegative(),
  reorderPoint: z.coerce.number().int().nonnegative().default(0)
});

router.get("/", asyncHandler(async (req, res) => {
  const query = z.object({ search: z.string().optional(), active: z.coerce.boolean().optional() }).parse(req.query);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (query.search) { clauses.push("(p.name LIKE ? OR p.sku LIKE ?)"); values.push(`%${query.search}%`, `%${query.search}%`); }
  if (query.active !== undefined) { clauses.push("p.active = ?"); values.push(query.active); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT p.id, p.sku, p.name, p.description, p.price, p.reorder_point AS reorderPoint, p.active,
            COALESCE(SUM(i.quantity), 0) AS quantity, COALESCE(SUM(i.reserved), 0) AS reserved,
            COALESCE(SUM(i.quantity - i.reserved), 0) AS available
     FROM products p LEFT JOIN inventory i ON i.product_id = p.id ${where}
     GROUP BY p.id ORDER BY p.created_at DESC`, values
  );
  res.json({ data: rows, meta: { total: rows.length } });
}));

router.post("/", authorize("ADMIN", "MANAGER"), asyncHandler(async (req, res) => {
  const input = createProduct.parse(req.body);
  const id = randomUUID();
  await db.execute(
    "INSERT INTO products (id, sku, name, description, price, reorder_point) VALUES (?, ?, ?, ?, ?, ?)",
    [id, input.sku, input.name, input.description ?? null, input.price, input.reorderPoint]
  );
  res.status(201).location(`/api/v1/products/${id}`).json({ data: { id, ...input, active: true } });
}));

export default router;
