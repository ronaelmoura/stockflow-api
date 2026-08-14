import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Rota ${req.method} ${req.path} não encontrada.` }, requestId: req.requestId });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos.", details: error.flatten() }, requestId: req.requestId });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details }, requestId: req.requestId });
    return;
  }
  req.log?.error({ err: error, requestId: req.requestId }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno inesperado." }, requestId: req.requestId });
};
