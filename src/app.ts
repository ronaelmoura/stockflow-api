import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { apiReference } from "@scalar/express-api-reference";
import { env } from "./config/env.js";
import { db } from "./lib/database.js";
import { authenticate } from "./middlewares/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { requestContext } from "./middlewares/request-context.js";
import auditRoutes from "./modules/audit/audit.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import orderRoutes from "./modules/orders/order.routes.js";
import productRoutes from "./modules/products/product.routes.js";
import { openApiDocument } from "./openapi.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()), credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);
  app.use(pinoHttp({ level: env.LOG_LEVEL, customProps: (req) => ({ requestId: req.requestId }) }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "stockflow-api", timestamp: new Date().toISOString() }));
  app.get("/ready", async (_req, res) => {
    try { await db.query("SELECT 1"); res.json({ status: "ready", database: "connected" }); }
    catch { res.status(503).json({ status: "not_ready", database: "disconnected" }); }
  });
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", apiReference({ content: openApiDocument, theme: "kepler", layout: "modern", darkMode: true }));

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/products", authenticate, productRoutes);
  app.use("/api/v1/inventory", authenticate, inventoryRoutes);
  app.use("/api/v1/orders", authenticate, orderRoutes);
  app.use("/api/v1/dashboard", authenticate, dashboardRoutes);
  app.use("/api/v1/audit", authenticate, auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
