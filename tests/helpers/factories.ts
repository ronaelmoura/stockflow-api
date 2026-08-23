import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";
import { db } from "../../src/lib/database.js";
import type { Role } from "../../src/modules/auth/auth.types.js";

export async function createUser(role: Role = "OPERATOR") {
  const id = randomUUID();
  await db.execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'unused-in-tests', ?)",
    [id, `Usuário de teste ${id.slice(0, 8)}`, `${id}@teste.local`, role],
  );
  return { id, role };
}

/** Assina um access token igual ao que auth.service.ts emite, sem passar pelo fluxo de login. */
export function signAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: "15m" });
}

export async function createWarehouse() {
  const id = randomUUID();
  await db.execute("INSERT INTO warehouses (id, code, name) VALUES (?, ?, ?)", [
    id,
    `WH-${id.slice(0, 8)}`,
    "Depósito de teste",
  ]);
  return { id };
}

export async function createProduct(overrides: { price?: number } = {}) {
  const id = randomUUID();
  await db.execute("INSERT INTO products (id, sku, name, price) VALUES (?, ?, ?, ?)", [
    id,
    `SKU-${id.slice(0, 8)}`,
    "Produto de teste",
    overrides.price ?? 100,
  ]);
  return { id };
}

export async function setInventory(productId: string, warehouseId: string, quantity: number, reserved = 0) {
  await db.execute(
    "INSERT INTO inventory (product_id, warehouse_id, quantity, reserved) VALUES (?, ?, ?, ?)",
    [productId, warehouseId, quantity, reserved],
  );
}

export async function readInventory(productId: string, warehouseId: string) {
  const [rows] = await db.query<any[]>(
    "SELECT quantity, reserved, version FROM inventory WHERE product_id = ? AND warehouse_id = ?",
    [productId, warehouseId],
  );
  return rows[0] as { quantity: number; reserved: number; version: number } | undefined;
}
