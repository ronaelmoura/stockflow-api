import { env } from "../../src/config/env.js";

/**
 * Os testes de integração fazem operações reais e destrutivas no banco
 * (inserts, updates, transações). Essa checagem existe pra garantir que
 * ninguém rode esta suíte sem querer contra o banco de desenvolvimento
 * ou produção.
 */
export function assertTestDatabase() {
  const { pathname } = new URL(env.DATABASE_URL);
  const databaseName = pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Os testes de integração exigem um banco cujo nome termine em "_test" (atual: "${databaseName}"). ` +
        "Configure DATABASE_URL apontando para um banco de teste antes de rodar `npm run test:integration`.",
    );
  }
}
