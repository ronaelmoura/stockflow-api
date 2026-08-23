import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    // Os testes fazem locks e transações reais no MySQL; rodar em série
    // evita que testes concorrentes disputem as mesmas linhas de forma
    // artificial (fora do cenário de concorrência que o teste quer provar).
    fileParallelism: false
  }
});
