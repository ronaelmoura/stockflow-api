# Segurança

Não publique vulnerabilidades em issues. Envie um relato privado ao mantenedor com passos de reprodução, impacto e versão afetada.

O projeto demonstra práticas de defesa em profundidade: senhas com bcrypt, access tokens curtos, rotação e revogação de refresh tokens, RBAC, rate limiting, CORS explícito, Helmet, validação de entrada e respostas sem stack trace.

As credenciais de demonstração existem apenas para o ambiente local. Troque `JWT_SECRET` e remova o usuário seed antes de qualquer uso real.
