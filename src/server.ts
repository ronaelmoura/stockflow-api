import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./lib/database.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`StockFlow API disponível em http://localhost:${env.PORT}`);
  console.log(`Documentação em http://localhost:${env.PORT}/docs`);
});

async function shutdown(signal: string) {
  console.log(`${signal} recebido; encerrando conexões...`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
