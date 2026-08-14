import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import type { Role } from "../modules/auth/auth.types.js";

export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.header("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return next(new AppError(401, "AUTH_REQUIRED", "Token de acesso obrigatório."));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & { role: Role };
    if (!payload.sub || !payload.role) throw new Error("invalid payload");
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "Token de acesso inválido ou expirado."));
  }
};

export const authorize = (...allowed: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !allowed.includes(req.auth.role)) return next(new AppError(403, "FORBIDDEN", "Você não possui permissão para esta ação."));
  next();
};
