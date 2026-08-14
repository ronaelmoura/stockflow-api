import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { bootstrapAdmin, login, revokeRefreshToken, rotateRefreshToken } from "./auth.service.js";

const router = Router();
const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(72) });

router.post("/bootstrap", asyncHandler(async (req, res) => {
  const input = credentials.extend({ name: z.string().min(2).max(120) }).parse(req.body);
  res.status(201).json({ data: await bootstrapAdmin(input) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  res.json({ data: await login(input.email, input.password) });
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(20) }).parse(req.body);
  res.json({ data: await rotateRefreshToken(refreshToken) });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(20) }).parse(req.body);
  await revokeRefreshToken(refreshToken);
  res.status(204).send();
}));

export default router;
