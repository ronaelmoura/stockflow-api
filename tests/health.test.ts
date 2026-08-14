import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("health check", () => {
  it("expõe a identidade e o estado do serviço", async () => {
    const response = await request(createApp()).get("/health").expect(200);
    expect(response.body).toMatchObject({ status: "ok", service: "stockflow-api" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});
