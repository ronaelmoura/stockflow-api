import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = req.header("x-request-id") || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};
