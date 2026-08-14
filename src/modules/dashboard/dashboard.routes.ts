import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { asyncHandler } from "../../lib/async-handler.js";
import { db } from "../../lib/database.js";

const router = Router();

router.get("/overview", asyncHandler(async (_req, res) => {
  const [[summary], [statusBreakdown], [recentMovements], [criticalStock]] = await Promise.all([
    db.query<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE active = TRUE) AS activeProducts,
        (SELECT COUNT(*) FROM orders WHERE status = 'CONFIRMED') AS ordersToShip,
        (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.quantity - i.reserved <= p.reorder_point) AS lowStockItems,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'SHIPPED' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS shippedRevenueThisMonth`
    ),
    db.query<RowDataPacket[]>("SELECT status, COUNT(*) AS total, COALESCE(SUM(total), 0) AS value FROM orders GROUP BY status"),
    db.query<RowDataPacket[]>(
      `SELECT m.id, m.type, m.quantity, m.reason, p.sku, w.code AS warehouse, m.created_at AS createdAt
       FROM inventory_movements m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
       ORDER BY m.created_at DESC LIMIT 10`
    ),
    db.query<RowDataPacket[]>(
      `SELECT p.sku, p.name, w.code AS warehouse, i.quantity - i.reserved AS available, p.reorder_point AS reorderPoint
       FROM inventory i JOIN products p ON p.id = i.product_id JOIN warehouses w ON w.id = i.warehouse_id
       WHERE i.quantity - i.reserved <= p.reorder_point ORDER BY available ASC LIMIT 10`
    )
  ]);
  res.json({ data: { summary: summary[0], ordersByStatus: statusBreakdown, recentMovements, criticalStock } });
}));

export default router;
