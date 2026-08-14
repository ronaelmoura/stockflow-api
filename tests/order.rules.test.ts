import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { assertTransition, calculateTotal } from "../src/modules/orders/order.rules.js";

describe("regras de pedido", () => {
  it("permite confirmar um rascunho", () => expect(() => assertTransition("DRAFT", "CONFIRMED")).not.toThrow());
  it("impede expedir um rascunho", () => expect(() => assertTransition("DRAFT", "SHIPPED")).toThrow(AppError));
  it("impede reabrir um pedido cancelado", () => expect(() => assertTransition("CANCELED", "DRAFT")).toThrowError(/Não é possível/));
  it("calcula o total sem acumular erro de ponto flutuante", () => expect(calculateTotal([{ quantity: 3, unitPrice: 10.1 }, { quantity: 2, unitPrice: 5.05 }])).toBe(40.4));
});
