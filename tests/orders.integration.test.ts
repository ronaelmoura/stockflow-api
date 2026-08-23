import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { assertTestDatabase } from "./helpers/db.js";
import {
  createProduct,
  createUser,
  createWarehouse,
  readInventory,
  setInventory,
  signAccessToken,
} from "./helpers/factories.js";

/**
 * Estes testes sobem a aplicação real (createApp) contra um MySQL de verdade
 * e cobrem as garantias transacionais mais sensíveis do módulo de pedidos:
 * reserva de estoque, replay de idempotência e concorrência otimista. São o
 * tipo de comportamento que testes com mocks não conseguem provar de verdade,
 * porque dependem do próprio banco (locks de linha, transação, constraints).
 *
 * Requer DATABASE_URL apontando para um banco `*_test` com as migrações já
 * aplicadas (`npm run db:migrate`). Rode com `npm run test:integration`.
 */

beforeAll(() => {
  assertTestDatabase();
});

const app = createApp();

async function setupProductWithStock(quantity: number) {
  const warehouse = await createWarehouse();
  const product = await createProduct({ price: 50 });
  await setInventory(product.id, warehouse.id, quantity);
  return { warehouse, product };
}

async function tokenFor(role: "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER" = "OPERATOR") {
  const user = await createUser(role);
  return { user, token: signAccessToken(user) };
}

function orderPayload(productId: string, warehouseId: string, quantity: number) {
  return {
    customerName: "Cliente de teste",
    customerEmail: "cliente@teste.local",
    items: [{ productId, warehouseId, quantity }],
  };
}

describe("reserva de estoque na confirmação de pedidos", () => {
  it("reserva a quantidade exata do pedido e bloqueia um segundo pedido sem estoque disponível", async () => {
    const { warehouse, product } = await setupProductWithStock(5);
    const { token } = await tokenFor();

    const created = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(orderPayload(product.id, warehouse.id, 5))
      .expect(201);

    await request(app)
      .post(`/api/v1/orders/${created.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const afterFirstConfirm = await readInventory(product.id, warehouse.id);
    expect(afterFirstConfirm).toMatchObject({ quantity: 5, reserved: 5 });

    const secondOrder = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(orderPayload(product.id, warehouse.id, 1))
      .expect(201);

    const rejected = await request(app)
      .post(`/api/v1/orders/${secondOrder.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(rejected.body.error.code).toBe("INSUFFICIENT_STOCK");

    const finalInventory = await readInventory(product.id, warehouse.id);
    expect(finalInventory?.reserved).toBe(5);
  });

  it("libera a reserva quando um pedido confirmado é cancelado", async () => {
    const { warehouse, product } = await setupProductWithStock(3);
    const { token } = await tokenFor();

    const created = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(orderPayload(product.id, warehouse.id, 3))
      .expect(201);
    await request(app)
      .post(`/api/v1/orders/${created.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect((await readInventory(product.id, warehouse.id))?.reserved).toBe(3);

    await request(app)
      .post(`/api/v1/orders/${created.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Cliente desistiu da compra" })
      .expect(200);

    expect((await readInventory(product.id, warehouse.id))?.reserved).toBe(0);
  });
});

describe("idempotência na criação de pedidos", () => {
  it("repetir a mesma Idempotency-Key retorna o pedido original em vez de criar um novo", async () => {
    const { warehouse, product } = await setupProductWithStock(10);
    const { token } = await tokenFor();
    const idempotencyKey = randomUUID();
    const payload = orderPayload(product.id, warehouse.id, 4);

    const first = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(201);

    const replay = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);

    expect(replay.body.data.id).toBe(first.body.data.id);

    const list = await request(app)
      .get(`/api/v1/orders/${first.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(1);
  });

  it("uma Idempotency-Key diferente do mesmo ator cria um pedido novo de verdade", async () => {
    const { warehouse, product } = await setupProductWithStock(10);
    const { token } = await tokenFor();
    const payload = orderPayload(product.id, warehouse.id, 1);

    const first = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(payload)
      .expect(201);

    const second = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(payload)
      .expect(201);

    expect(second.body.data.id).not.toBe(first.body.data.id);
  });
});

describe("concorrência otimista nas movimentações de estoque", () => {
  it("rejeita uma movimentação com expectedVersion desatualizado", async () => {
    const { warehouse, product } = await setupProductWithStock(20);
    const { token } = await tokenFor("MANAGER");

    const firstMove = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, warehouseId: warehouse.id, type: "INBOUND", quantity: 5, reason: "Reposição do fornecedor" })
      .expect(201);
    expect(firstMove.body.data.version).toBe(2);

    const staleAttempt = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, warehouseId: warehouse.id, type: "OUTBOUND", quantity: 1, reason: "Ajuste com versão antiga", expectedVersion: 1 })
      .expect(409);
    expect(staleAttempt.body.error.code).toBe("VERSION_CONFLICT");

    const correctAttempt = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, warehouseId: warehouse.id, type: "OUTBOUND", quantity: 1, reason: "Ajuste com versão correta", expectedVersion: 2 })
      .expect(201);
    expect(correctAttempt.body.data.version).toBe(3);
  });

  it("nunca reserva mais do que o estoque disponível quando dois pedidos confirmam ao mesmo tempo", async () => {
    const { warehouse, product } = await setupProductWithStock(5);
    const { token } = await tokenFor();

    const [orderA, orderB] = await Promise.all([
      request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", randomUUID())
        .send(orderPayload(product.id, warehouse.id, 3))
        .expect(201),
      request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", randomUUID())
        .send(orderPayload(product.id, warehouse.id, 3))
        .expect(201),
    ]);

    const [confirmA, confirmB] = await Promise.all([
      request(app).post(`/api/v1/orders/${orderA.body.data.id}/confirm`).set("Authorization", `Bearer ${token}`),
      request(app).post(`/api/v1/orders/${orderB.body.data.id}/confirm`).set("Authorization", `Bearer ${token}`),
    ]);

    const statuses = [confirmA.status, confirmB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalInventory = await readInventory(product.id, warehouse.id);
    expect(finalInventory?.reserved).toBe(3);
    expect(finalInventory!.reserved).toBeLessThanOrEqual(finalInventory!.quantity);
  });
});
