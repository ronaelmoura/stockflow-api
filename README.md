# StockFlow API

API REST de estoque e pedidos construída para demonstrar backend de produção: regras de negócio, concorrência, segurança, banco relacional, documentação e observabilidade.

> Projeto de portfólio de **Ronael Moura / Ronas Tech**. Os dados de demonstração são fictícios.

## Por que este projeto chama atenção

Não é apenas um CRUD. O StockFlow trata problemas comuns de sistemas reais:

- reserva de estoque dentro de transações MySQL;
- proteção contra pedidos duplicados com `Idempotency-Key`;
- concorrência otimista em movimentações de estoque;
- máquina de estados para impedir transições inválidas;
- ledger imutável de movimentações e trilha de auditoria;
- Outbox Pattern para eventos confiáveis;
- autenticação com access token curto e rotação de refresh token;
- autorização por papéis: `ADMIN`, `MANAGER`, `OPERATOR` e `VIEWER`;
- documentação OpenAPI interativa com Scalar;
- logs estruturados e rastreamento por `x-request-id`.

## Stack

Node.js 22, TypeScript, Express 5, MySQL 8, Zod, JWT, bcrypt, Pino, Scalar, Vitest e Docker.

## Fluxo principal

```mermaid
flowchart LR
  A[Pedido em rascunho] -->|Confirmar| B[Reserva transacional]
  B -->|Estoque disponível| C[Pedido confirmado]
  B -->|Saldo insuficiente| D[409 sem alteração]
  C -->|Expedir| E[Baixa física + evento]
  C -->|Cancelar| F[Liberação da reserva]
```

Cada mudança crítica grava, na mesma transação:

1. o novo estado do pedido ou estoque;
2. o movimento de inventário;
3. o evento de auditoria;
4. o evento pendente da Outbox.

Mais detalhes em [Decisões de arquitetura](docs/ARCHITECTURE.md).

## Executando com Docker

```bash
cp .env.example .env
docker compose up --build
```

Acesse:

- API: `http://localhost:3333`
- documentação: `http://localhost:3333/docs`
- especificação: `http://localhost:3333/openapi.json`

Credenciais locais do seed:

```text
admin@stockflow.dev
StockFlow@2026
```

## Executando sem Docker

Com um MySQL 8 disponível:

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

## Scripts que demonstram engenharia

| Script | Objetivo |
|---|---|
| `npm run quality` | Executa tipos, lint, testes e validação OpenAPI |
| `npm run demo:scenario` | Cria, confirma e expede um pedido pela API |
| `npm run routes:audit` | Exibe o catálogo público de operações |
| `npm run openapi:validate` | Valida o contrato e detecta rotas não documentadas |
| `npm run outbox:drain` | Processa eventos transacionais pendentes |
| `npm run db:reset` | Recria apenas bancos cujo nome começa com `stockflow` |
| `npm run test:coverage` | Gera relatório de cobertura das regras de negócio |
| `npm run test:integration` | Roda os testes de integração contra um MySQL real (ver abaixo) |

## Testes de integração

Além dos testes unitários (`npm test`, sem dependências externas), o projeto
tem testes de integração em `tests/*.integration.test.ts` que sobem a
aplicação real com Supertest contra um MySQL de verdade, para provar
comportamentos que só existem no banco: o lock de linha (`FOR UPDATE`) que
impede overselling quando dois pedidos confirmam ao mesmo tempo, o replay de
`Idempotency-Key` não duplicando pedidos, e o controle de concorrência
otimista (`expectedVersion`) nas movimentações de estoque.

Para rodar localmente, aponte `DATABASE_URL` para um banco cujo nome termine
em `_test` (é uma checagem de segurança do próprio teste, pra nunca rodar
sem querer contra o banco de desenvolvimento):

```bash
DATABASE_URL=mysql://stockflow:stockflow@localhost:3306/stockflow_test npm run db:migrate
DATABASE_URL=mysql://stockflow:stockflow@localhost:3306/stockflow_test npm run test:integration
```

No CI, um job separado (`integration`) sobe um serviço MySQL só para isso e
roda esses testes em todo Pull Request.

## Exemplo de pedido idempotente

```bash
curl -X POST http://localhost:3333/api/v1/orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Idempotency-Key: checkout-2026-0001" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Ana Souza",
    "customerEmail": "ana@example.com",
    "items": [{
      "productId": "30000000-0000-4000-8000-000000000001",
      "warehouseId": "20000000-0000-4000-8000-000000000001",
      "quantity": 2
    }]
  }'
```

Repetir a chamada com a mesma chave retorna o recurso original em vez de criar outro pedido.

## Estrutura

```text
src/
├── config/          variáveis validadas
├── lib/             banco, erros, auditoria e outbox
├── middlewares/     autenticação, autorização e request context
├── modules/         auth, produtos, estoque, pedidos e dashboard
├── openapi.ts       contrato da API
├── app.ts           composição HTTP
└── server.ts        ciclo de vida do processo
```

## Segurança

Consulte [SECURITY.md](SECURITY.md). Nunca reutilize as credenciais ou a chave JWT de desenvolvimento em produção.

## Autor

Desenvolvido por [Ronael Moura](https://github.com/ronaelmoura) — criador da [Ronas Tech](https://www.ronastech.com.br/).
