import type { Role } from "../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
      requestId: string;
    }
  }
}

export {};
