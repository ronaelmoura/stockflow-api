import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { audit } from "../../lib/audit.js";
import { db, transaction } from "../../lib/database.js";
import { AppError, notFound } from "../../lib/errors.js";
import { enqueue } from "../../lib/outbox.js";
import { authorize } from "../../middlewares/auth.js";
import { assertTransition, calculateTotal, type OrderStatus } from "./order.rules.js";

type OrderRow = RowDataPacket & { id: string; number: string; status: OrderStatus; total: number };
type ItemRow = RowDataPacket & { id: string; productId: string; warehouseId: string; quantity: number; unitPrice: number };

const router = Router();
const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().email(),
  items: z.array(z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid(), quantity: z.number().int().positive().max(10_000) })).min(1).max(100)
}).superRefine((value, ctx) => {
  const keys = value.items.map((item) => `${item.productId}:${item.warehouseId}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "O mesmo produto e depósito não pode aparecer duas vezes.", path: ["items"] });
});

function orderNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `SF-${day}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function loadOrder(connection: PoolConnection, orderId: string) {
  const [orders] = await connection.query<OrderRow[]>("SELECT id, number, status, total FROM orders WHERE id = ? FOR UPDATE", [orderId]);
  if (!orders[0]) throw notFound("Pedido");
  const [items] = await connection.query<ItemRow[]>(
    "SELECT id, product_id AS productId, warehouse_id AS warehouseId, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = ? ORDER BY product_id, warehouse_id",
    [orderId]
  );
  return { order: orders[0], items };
}

router.get("/", asyncHandler(async (req, res) => {
  const query = z.object({ status: z.enum(["DRAFT", "CONFIRMED", "SHIPPED", "CANCELED"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT o.id, o.number, o.customer_name AS customerName, o.customer_email AS customerEmail,
            o.status, o.total, o.created_at AS createdAt, COUNT(oi.id) AS itemCount
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE (? IS NULL OR o.status = ?) GROUP BY o.id ORDER BY o.created_at DESC LIMIT ?`,
    [query.status ?? null, query.status ?? null, query.limit]
  );
  res.json({ data: rows, meta: { count: rows.length } });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const [orders] = await db.query<RowDataPacket[]>(
    `SELECT id, number, customer_name AS customerName, customer_email AS customerEmail, status, total, created_at AS createdAt
     FROM orders WHERE id = ?`, [id]
  );
  if (!orders[0]) throw notFound("Pedido");
  const [items] = await db.query<RowDataPacket[]>(
    `SELECT oi.id, p.sku, p.name, w.code AS warehouse, oi.quantity, oi.unit_price AS unitPrice, oi.subtotal
     FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN warehouses w ON w.id = oi.warehouse_id
     WHERE oi.order_id = ?`, [id]
  );
  res.json({ data: { ...orders[0], items } });
}));

router.post("/", authorize("ADMIN", "MANAGER", "OPERATOR"), asyncHandler(async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const actorId = req.auth!.userId;
  const idempotencyKey = z.string().min(8).max(120).parse(req.header("idempotency-key"));
  const result = await transaction(async (connection) => {
    const [existing] = await connection.query<(RowDataPacket & { resource_id: string })[]>(
      "SELECT resource_id FROM idempotency_keys WHERE actor_id = ? AND idempotency_key = ?", [actorId, idempotencyKey]
    );
    if (existing[0]) return { id: existing[0].resource_id, replayed: true };

    const productIds = input.items.map((item) => item.productId);
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await connection.query<(RowDataPacket & { id: string; price: number; active: number })[]>(
      `SELECT id, price, active FROM products WHERE id IN (${placeholders})`, productIds
    );
    const productMap = new Map(products.map((product) => [product.id, product]));
    const pricedLines = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product?.active) throw new AppError(422, "PRODUCT_UNAVAILABLE", "Um dos produtos não existe ou está inativo.", { productId: item.productId });
      return { ...item, unitPrice: Number(product.price) };
    });
    const id = randomUUID();
    const number = orderNumber();
    const total = calculateTotal(pricedLines);
    await connection.execute(
      "INSERT INTO orders (id, number, customer_name, customer_email, total, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [id, number, input.customerName, input.customerEmail.toLowerCase(), total, actorId]
    );
    for (const item of pricedLines) {
      await connection.execute(
        "INSERT INTO order_items (id, order_id, product_id, warehouse_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [randomUUID(), id, item.productId, item.warehouseId, item.quantity, item.unitPrice, item.quantity * item.unitPrice]
      );
    }
    await connection.execute("INSERT INTO idempotency_keys (actor_id, idempotency_key, resource_type, resource_id) VALUES (?, ?, 'order', ?)", [actorId, idempotencyKey, id]);
    await audit(connection, { actorId, action: "order.created", entityType: "order", entityId: id, requestId: req.requestId, metadata: { number, total, itemCount: pricedLines.length } });
    await enqueue(connection, "order.created", id, { orderId: id, number, total });
    return { id, number, total, status: "DRAFT", replayed: false };
  });
  res.status(result.replayed ? 200 : 201).location(`/api/v1/orders/${result.id}`).json({ data: result });
}));

router.post("/:id/confirm", authorize("ADMIN", "MANAGER", "OPERATOR"), asyncHandler(async (req, res) => {
  const orderId = z.string().uuid().parse(req.params.id);
  const actorId = req.auth!.userId;
  const result = await transaction(async (connection) => {
    const { order, items } = await loadOrder(connection, orderId);
    assertTransition(order.status, "CONFIRMED");
    for (const item of items) {
      const [stocks] = await connection.query<(RowDataPacket & { quantity: number; reserved: number })[]>(
        "SELECT quantity, reserved FROM inventory WHERE product_id = ? AND warehouse_id = ? FOR UPDATE", [item.productId, item.warehouseId]
      );
      const stock = stocks[0];
      if (!stock || stock.quantity - stock.reserved < item.quantity) {
        throw new AppError(409, "INSUFFICIENT_STOCK", "Estoque insuficiente para confirmar o pedido.", { productId: item.productId, warehouseId: item.warehouseId, requested: item.quantity, available: stock ? stock.quantity - stock.reserved : 0 });
      }
      await connection.execute("UPDATE inventory SET reserved = reserved + ?, version = version + 1 WHERE product_id = ? AND warehouse_id = ?", [item.quantity, item.productId, item.warehouseId]);
      await connection.execute(
        "INSERT INTO inventory_movements (id, product_id, warehouse_id, order_id, type, quantity, reason, actor_id) VALUES (?, ?, ?, ?, 'RESERVATION', ?, 'Reserva para confirmação do pedido', ?)",
        [randomUUID(), item.productId, item.warehouseId, orderId, item.quantity, actorId]
      );
    }
    await connection.execute("UPDATE orders SET status = 'CONFIRMED' WHERE id = ?", [orderId]);
    await audit(connection, { actorId, action: "order.confirmed", entityType: "order", entityId: orderId, requestId: req.requestId });
    await enqueue(connection, "order.confirmed", orderId, { orderId, number: order.number });
    return { id: orderId, number: order.number, status: "CONFIRMED" };
  });
  res.json({ data: result });
}));

router.post("/:id/ship", authorize("ADMIN", "MANAGER"), asyncHandler(async (req, res) => {
  const orderId = z.string().uuid().parse(req.params.id);
  const actorId = req.auth!.userId;
  const result = await transaction(async (connection) => {
    const { order, items } = await loadOrder(connection, orderId);
    assertTransition(order.status, "SHIPPED");
    for (const item of items) {
      await connection.execute(
        "UPDATE inventory SET quantity = quantity - ?, reserved = reserved - ?, version = version + 1 WHERE product_id = ? AND warehouse_id = ? AND reserved >= ?",
        [item.quantity, item.quantity, item.productId, item.warehouseId, item.quantity]
      );
      await connection.execute(
        "INSERT INTO inventory_movements (id, product_id, warehouse_id, order_id, type, quantity, reason, actor_id) VALUES (?, ?, ?, ?, 'OUTBOUND', ?, 'Expedição do pedido', ?)",
        [randomUUID(), item.productId, item.warehouseId, orderId, -item.quantity, actorId]
      );
    }
    await connection.execute("UPDATE orders SET status = 'SHIPPED' WHERE id = ?", [orderId]);
    await audit(connection, { actorId, action: "order.shipped", entityType: "order", entityId: orderId, requestId: req.requestId });
    await enqueue(connection, "order.shipped", orderId, { orderId, number: order.number });
    return { id: orderId, number: order.number, status: "SHIPPED" };
  });
  res.json({ data: result });
}));

router.post("/:id/cancel", authorize("ADMIN", "MANAGER", "OPERATOR"), asyncHandler(async (req, res) => {
  const orderId = z.string().uuid().parse(req.params.id);
  const actorId = req.auth!.userId;
  const reason = z.object({ reason: z.string().trim().min(5).max(255) }).parse(req.body).reason;
  const result = await transaction(async (connection) => {
    const { order, items } = await loadOrder(connection, orderId);
    assertTransition(order.status, "CANCELED");
    if (order.status === "CONFIRMED") {
      for (const item of items) {
        await connection.execute("UPDATE inventory SET reserved = reserved - ?, version = version + 1 WHERE product_id = ? AND warehouse_id = ?", [item.quantity, item.productId, item.warehouseId]);
        await connection.execute(
          "INSERT INTO inventory_movements (id, product_id, warehouse_id, order_id, type, quantity, reason, actor_id) VALUES (?, ?, ?, ?, 'RELEASE', ?, ?, ?)",
          [randomUUID(), item.productId, item.warehouseId, orderId, -item.quantity, `Cancelamento: ${reason}`, actorId]
        );
      }
    }
    await connection.execute("UPDATE orders SET status = 'CANCELED' WHERE id = ?", [orderId]);
    await audit(connection, { actorId, action: "order.canceled", entityType: "order", entityId: orderId, requestId: req.requestId, metadata: { reason } });
    await enqueue(connection, "order.canceled", orderId, { orderId, number: order.number, reason });
    return { id: orderId, number: order.number, status: "CANCELED" };
  });
  res.json({ data: result });
}));

export default router;
