# Infraestrutura Nexit — arquivos espelho versionados
Estes arquivos representam a configuração **observada/descrita da VM em 09/10/2026**, sem valores secretos. Não foram obtidos por export automático. Antes de substituir arquivos da VM, comparar conteúdo diretamente e conferir com `docker compose config`.

- `compose.yml`: PostgreSQL exclusivo já instalado em `/srv/stacks/distribuidora/compose.yml`.
- `app.compose.yml`: serviço Next.js instalado via `docker compose -f compose.yml -f app.compose.yml up -d --no-deps app`.
- `.env.example`, `app.env.example`: somente modelos. **Nunca** commitar `.env`, `app.env`, tokens, senhas.
- `Caddyfile` e `proxy.compose.yml`: espelhos do proxy em `/srv/infrastructure/proxy/`. Na operação real, estes arquivos ficam fora do stack da app.
- Documento as-built: `documentacao/infraestrutura/ESTADO-REAL-NEXIT-GOOGLE-CLOUD-2026-10-09.md`.

**Operação crítica:** volume `nexit_pgdata` já existente; jamais apagar, renomear ou executar `docker compose down -v`. Não aplicar migrations sem aprovação do proprietário. Configurações exemplificativas no repositório não garantem que estejam idênticas aos arquivos da VM: confirmar antes do deploy.
