export const routeCatalog = [
  ["POST", "/api/v1/auth/bootstrap", "Cria o primeiro administrador"],
  ["POST", "/api/v1/auth/login", "Inicia uma sessão"],
  ["POST", "/api/v1/auth/refresh", "Rotaciona o refresh token"],
  ["POST", "/api/v1/auth/logout", "Revoga o refresh token"],
  ["GET", "/api/v1/products", "Lista produtos e disponibilidade"],
  ["POST", "/api/v1/products", "Cadastra um produto"],
  ["GET", "/api/v1/inventory", "Consulta estoque por depósito"],
  ["GET", "/api/v1/inventory/low-stock", "Lista alertas de reposição"],
  ["POST", "/api/v1/inventory/movements", "Registra uma movimentação"],
  ["GET", "/api/v1/orders", "Lista pedidos"],
  ["POST", "/api/v1/orders", "Cria um pedido idempotente"],
  ["GET", "/api/v1/orders/{id}", "Detalha um pedido"],
  ["POST", "/api/v1/orders/{id}/confirm", "Reserva o estoque"],
  ["POST", "/api/v1/orders/{id}/ship", "Expede e baixa o estoque"],
  ["POST", "/api/v1/orders/{id}/cancel", "Cancela e libera reservas"],
  ["GET", "/api/v1/dashboard/overview", "Exibe indicadores operacionais"],
  ["GET", "/api/v1/audit", "Consulta a trilha de auditoria"]
] as const;

const json = { "application/json": { schema: { type: "object" } } };
const bearer = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "StockFlow API",
    version: "1.0.0",
    description: "API de estoque e pedidos com reservas transacionais, idempotência, auditoria e Outbox Pattern. Projeto de portfólio de Ronael Moura."
  },
  servers: [{ url: "http://localhost:3333", description: "Ambiente local" }],
  tags: ["Auth", "Products", "Inventory", "Orders", "Dashboard", "Audit"].map((name) => ({ name })),
  paths: {
    "/api/v1/auth/bootstrap": { post: { tags: ["Auth"], summary: "Cria o primeiro administrador", requestBody: { required: true, content: json }, responses: { "201": { description: "Administrador criado" }, "409": { $ref: "#/components/responses/Conflict" } } } },
    "/api/v1/auth/login": { post: { tags: ["Auth"], summary: "Autentica e retorna o par de tokens", requestBody: { required: true, content: json }, responses: { "200": { description: "Sessão criada" }, "401": { $ref: "#/components/responses/Unauthorized" } } } },
    "/api/v1/auth/refresh": { post: { tags: ["Auth"], summary: "Rotaciona o refresh token", requestBody: { required: true, content: json }, responses: { "200": { description: "Tokens renovados" } } } },
    "/api/v1/auth/logout": { post: { tags: ["Auth"], summary: "Encerra a sessão e revoga o refresh token", requestBody: { required: true, content: json }, responses: { "204": { description: "Sessão encerrada" } } } },
    "/api/v1/products": {
      get: { tags: ["Products"], summary: "Lista produtos com estoque agregado", security: bearer, responses: { "200": { description: "Produtos encontrados" } } },
      post: { tags: ["Products"], summary: "Cadastra um produto", security: bearer, requestBody: { required: true, content: json }, responses: { "201": { description: "Produto criado" } } }
    },
    "/api/v1/inventory": { get: { tags: ["Inventory"], summary: "Consulta posição de estoque", security: bearer, responses: { "200": { description: "Posições encontradas" } } } },
    "/api/v1/inventory/low-stock": { get: { tags: ["Inventory"], summary: "Calcula alertas e sugestão de compra", security: bearer, responses: { "200": { description: "Alertas calculados" } } } },
    "/api/v1/inventory/movements": { post: { tags: ["Inventory"], summary: "Movimenta estoque com controle otimista de versão", security: bearer, requestBody: { required: true, content: json }, responses: { "201": { description: "Movimentação registrada" }, "409": { $ref: "#/components/responses/Conflict" } } } },
    "/api/v1/orders": {
      get: { tags: ["Orders"], summary: "Lista pedidos", security: bearer, responses: { "200": { description: "Pedidos encontrados" } } },
      post: { tags: ["Orders"], summary: "Cria pedido idempotente", description: "Exige o cabeçalho Idempotency-Key.", security: bearer, parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8 } }], requestBody: { required: true, content: json }, responses: { "201": { description: "Pedido criado" }, "200": { description: "Repetição segura da operação" } } }
    },
    "/api/v1/orders/{id}": { get: { tags: ["Orders"], summary: "Detalha um pedido", security: bearer, parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "200": { description: "Pedido encontrado" }, "404": { $ref: "#/components/responses/NotFound" } } } },
    "/api/v1/orders/{id}/confirm": { post: { tags: ["Orders"], summary: "Confirma e reserva estoque de forma transacional", security: bearer, parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "200": { description: "Pedido confirmado" }, "409": { $ref: "#/components/responses/Conflict" } } } },
    "/api/v1/orders/{id}/ship": { post: { tags: ["Orders"], summary: "Expede o pedido e efetiva a baixa", security: bearer, parameters: [{ $ref: "#/components/parameters/Id" }], responses: { "200": { description: "Pedido expedido" } } } },
    "/api/v1/orders/{id}/cancel": { post: { tags: ["Orders"], summary: "Cancela o pedido e libera reservas", security: bearer, parameters: [{ $ref: "#/components/parameters/Id" }], requestBody: { required: true, content: json }, responses: { "200": { description: "Pedido cancelado" } } } },
    "/api/v1/dashboard/overview": { get: { tags: ["Dashboard"], summary: "Retorna indicadores para um painel operacional", security: bearer, responses: { "200": { description: "Indicadores calculados" } } } },
    "/api/v1/audit": { get: { tags: ["Audit"], summary: "Consulta eventos críticos auditáveis", security: bearer, responses: { "200": { description: "Eventos encontrados" } } } }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: { Id: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } } },
    schemas: { Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } }, requestId: { type: "string" } } } },
    responses: {
      Unauthorized: { description: "Não autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      NotFound: { description: "Não encontrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      Conflict: { description: "Conflito de regra de negócio", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
    }
  }
} as const;
