import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { env } from "../../config/env.js";
import { db, one, transaction } from "../../lib/database.js";
import { AppError } from "../../lib/errors.js";
import type { Role } from "./auth.types.js";

type UserRow = RowDataPacket & { id: string; name: string; email: string; password_hash: string; role: Role; active: number };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function accessToken(user: UserRow) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });
}

async function issueSession(user: UserRow) {
  const refreshToken = randomBytes(48).toString("base64url");
  const refreshId = randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await db.execute(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [refreshId, user.id, hashToken(refreshToken), expiresAt]
  );
  return { accessToken: accessToken(user), refreshToken, expiresIn: env.ACCESS_TOKEN_TTL, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export async function bootstrapAdmin(input: { name: string; email: string; password: string }) {
  const count = await one<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM users");
  if ((count?.total ?? 0) > 0) throw new AppError(409, "BOOTSTRAP_DISABLED", "O usuário inicial já foi criado.");
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'ADMIN')", [id, input.name, input.email.toLowerCase(), passwordHash]);
  return login(input.email, input.password);
}

export async function login(email: string, password: string) {
  const user = await one<UserRow>("SELECT * FROM users WHERE email = ? LIMIT 1", [email.toLowerCase()]);
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  return issueSession(user);
}

export async function rotateRefreshToken(token: string) {
  return transaction(async (connection) => {
    const [rows] = await connection.query<(UserRow & { refresh_id: string; expires_at: Date; revoked_at: Date | null })[]>(
      `SELECT u.*, rt.id AS refresh_id, rt.expires_at, rt.revoked_at
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? FOR UPDATE`, [hashToken(token)]
    );
    const session = rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Sessão expirada ou inválida.");
    }
    const nextToken = randomBytes(48).toString("base64url");
    const nextId = randomUUID();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await connection.execute("UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = ? WHERE id = ?", [nextId, session.refresh_id]);
    await connection.execute("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", [nextId, session.id, hashToken(nextToken), expiresAt]);
    return { accessToken: accessToken(session), refreshToken: nextToken, expiresIn: env.ACCESS_TOKEN_TTL };
  });
}

export async function revokeRefreshToken(token: string) {
  await db.execute("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ?", [hashToken(token)]);
}
