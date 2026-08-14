import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const connection = await mysql.createConnection({ uri: env.DATABASE_URL, multipleStatements: true });
await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(120) PRIMARY KEY, executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
const files = (await readdir(path.resolve("migrations"))).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const [rows] = await connection.query<any[]>("SELECT id FROM schema_migrations WHERE id = ?", [file]);
  if (rows.length) { console.log(`↷ ${file} já aplicada`); continue; }
  const sql = await readFile(path.resolve("migrations", file), "utf8");
  await connection.beginTransaction();
  try {
    await connection.query(sql);
    await connection.execute("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    await connection.commit();
    console.log(`✓ ${file}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

await connection.end();
