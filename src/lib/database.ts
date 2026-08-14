import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";

export const db = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  enableKeepAlive: true,
  decimalNumbers: true
});

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function one<T extends RowDataPacket>(sql: string, values: unknown[] = []): Promise<T | null> {
  const [rows] = await db.query<T[]>(sql, values);
  return rows[0] ?? null;
}
