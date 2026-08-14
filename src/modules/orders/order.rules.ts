import { AppError } from "../../lib/errors.js";

export const orderStatuses = ["DRAFT", "CONFIRMED", "SHIPPED", "CANCELED"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

const transitions: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["SHIPPED", "CANCELED"],
  SHIPPED: [],
  CANCELED: []
};

export function assertTransition(current: OrderStatus, next: OrderStatus) {
  if (!transitions[current].includes(next)) {
    throw new AppError(409, "INVALID_ORDER_TRANSITION", `Não é possível alterar um pedido de ${current} para ${next}.`, { allowed: transitions[current] });
  }
}

export function calculateTotal(lines: Array<{ quantity: number; unitPrice: number }>) {
  return Number(lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0).toFixed(2));
}
