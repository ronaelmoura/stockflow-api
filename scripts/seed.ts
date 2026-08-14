import bcrypt from "bcryptjs";
import { db } from "../src/lib/database.js";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  warehouse: "20000000-0000-4000-8000-000000000001",
  keyboard: "30000000-0000-4000-8000-000000000001",
  headset: "30000000-0000-4000-8000-000000000002",
  monitor: "30000000-0000-4000-8000-000000000003"
};

const passwordHash = await bcrypt.hash("StockFlow@2026", 12);
await db.execute(
  `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Administrador Demo', 'admin@stockflow.dev', ?, 'ADMIN')
   ON DUPLICATE KEY UPDATE name = VALUES(name)`, [ids.admin, passwordHash]
);
await db.execute(
  `INSERT INTO warehouses (id, code, name) VALUES (?, 'CD-CE', 'Centro de Distribuição Ceará')
   ON DUPLICATE KEY UPDATE name = VALUES(name)`, [ids.warehouse]
);

const products = [
  [ids.keyboard, "TEC-MEC-001", "Teclado Mecânico Pro", 489.9, 8, 42],
  [ids.headset, "HDS-BT-002", "Headset Bluetooth Focus", 329.9, 12, 18],
  [ids.monitor, "MON-4K-003", "Monitor 27 polegadas 4K", 2199.0, 5, 4]
] as const;

for (const [id, sku, name, price, reorderPoint, quantity] of products) {
  await db.execute(
    `INSERT INTO products (id, sku, name, price, reorder_point) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), reorder_point = VALUES(reorder_point)`,
    [id, sku, name, price, reorderPoint]
  );
  await db.execute(
    `INSERT INTO inventory (product_id, warehouse_id, quantity, reserved) VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`, [id, ids.warehouse, quantity]
  );
}

console.log("✓ Dados de demonstração carregados");
console.log("  admin@stockflow.dev / StockFlow@2026");
await db.end();
