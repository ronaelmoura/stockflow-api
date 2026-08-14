import { randomUUID } from "node:crypto";

const baseUrl = process.env.API_URL ?? "http://localhost:3333";
const warehouseId = "20000000-0000-4000-8000-000000000001";
const productId = "30000000-0000-4000-8000-000000000001";

async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body as T;
}

const session = await api<{ data: { accessToken: string } }>("/api/v1/auth/login", {
  method: "POST", body: JSON.stringify({ email: "admin@stockflow.dev", password: "StockFlow@2026" })
});
const auth = { authorization: `Bearer ${session.data.accessToken}` };
const order = await api<{ data: { id: string; number: string } }>("/api/v1/orders", {
  method: "POST",
  headers: { ...auth, "idempotency-key": randomUUID() },
  body: JSON.stringify({ customerName: "Cliente Demonstração", customerEmail: "cliente@example.com", items: [{ productId, warehouseId, quantity: 2 }] })
});
console.log(`1. Pedido ${order.data.number} criado`);
await api(`/api/v1/orders/${order.data.id}/confirm`, { method: "POST", headers: auth });
console.log("2. Estoque reservado de forma transacional");
await api(`/api/v1/orders/${order.data.id}/ship`, { method: "POST", headers: auth });
console.log("3. Pedido expedido e saldo baixado");
const detail = await api<{ data: unknown }>(`/api/v1/orders/${order.data.id}`, { headers: auth });
console.log("4. Resultado final:", JSON.stringify(detail.data, null, 2));
