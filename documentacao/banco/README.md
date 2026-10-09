# Banco de dados — scripts versionados

Padrão: `REQ-AAAA-NNN-001-up.sql` e, quando reversão for segura, `REQ-AAAA-NNN-001-down.sql`. Incrementar 002, 003... para novas alterações do requisito. SQL deve informar requisito, objetivo, dialeto, dependências, pré-condições, transações, índices/constraints, tenant, impacto, validações e estratégia de recuperação. Não reescrever migrações aplicadas em produção. Não criar scripts fictícios. Não armazenar senhas ou dados reais sensíveis.
