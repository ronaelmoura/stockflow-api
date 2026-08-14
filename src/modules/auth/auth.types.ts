export const roles = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] as const;
export type Role = (typeof roles)[number];
