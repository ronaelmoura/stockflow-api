# Decisões de arquitetura

## Estoque como razão contábil

O saldo atual fica em `inventory` para leitura rápida, enquanto cada alteração gera uma linha imutável em `inventory_movements`. Isso permite explicar como o saldo chegou ao valor atual.

## Reserva antes da expedição

Confirmar um pedido não reduz a quantidade física: aumenta `reserved`. A expedição reduz simultaneamente `quantity` e `reserved`. Cancelar um pedido confirmado libera a reserva. As operações usam transação e bloqueio `SELECT ... FOR UPDATE`.

## Idempotência

`POST /orders` exige `Idempotency-Key`. A mesma chave do mesmo usuário retorna o pedido já criado, evitando duplicação em retentativas de rede.

## Concorrência

Movimentações manuais aceitam `expectedVersion`. Se outro processo alterou o estoque, a API responde `409 VERSION_CONFLICT`, obrigando o cliente a reler o saldo.

## Eventos confiáveis

Eventos de domínio são gravados em `outbox_events` na mesma transação da mudança. O worker demonstrativo publica apenas eventos confirmados, evitando notificações de operações revertidas.

## Auditoria

Ações críticas geram `audit_events` com ator, entidade, request ID e contexto. O `x-request-id` conecta resposta, log e trilha de auditoria.
