import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const url = new URL(env.DATABASE_URL);
const database = url.pathname.replace(/^\//, "");
if (!/^stockflow(?:_|$)/.test(database)) throw new Error(`Reset recusado para o banco '${database}'. Use um nome iniciado por stockflow.`);
const connection = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
await connection.end();
console.log(`✓ Banco ${database} recriado. Execute npm run db:migrate && npm run db:seed.`);
