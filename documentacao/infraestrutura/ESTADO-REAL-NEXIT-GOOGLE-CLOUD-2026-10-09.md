# Nexit — Estado real da infraestrutura (09/10/2026)
Fonte: comandos e capturas fornecidos pelo operador durante a instalação. **Não equivale a auditoria direta da VM**. Ambiente de implantação, ainda sem homologação funcional.

## Recursos ativos
- Google Compute Engine: instância `instance-20260930-232419`, zona `us-central1-a`, IP externo **estático** `34.31.253.146`, Ubuntu 24.04, máquina `e2-highmem-2` (2 vCPU / 16 GB), disco 200 GB. Acesso via SSH `proceit24`; não versionar chave SSH.
- Docker Engine + Compose; Portainer CE stack `proceit-portainer` em `/srv/infrastructure/portainer`, porta `127.0.0.1:9443`, acesso via túnel SSH. Monta Docker socket (privilégio administrativo).
- Caddy 2: stack `proceit-proxy`, container `proceit-caddy`; arquivos `/srv/infrastructure/proxy/{compose.yml,Caddyfile}`, rede externa `proxy`, portas TCP 80/443 e UDP 443. `nexit.proceit.net { encode zstd gzip; reverse_proxy nexit-app:3000 }` e endpoint HTTP `/healthz`.
- Google Cloud VPC `default`: regra `allow-proceit-web` para ingresso TCP 80/443 destinado à tag `proceit-web`; NÃO expor 5432 ou 9443.
- DNS Hostinger, zona `proceit.net`: único registro A para `nexit` => `34.31.253.146` (TTL 300); ALIAS e AAAA antigos removidos; e-mails e outros DNS permanecem na Hostinger.
- HTTPS: certificado Let's Encrypt emitido pelo Caddy; resposta observada `HTTP/2 200` em `https://nexit.proceit.net/login` e `via: 1.1 Caddy`.
- GHCR privado `ghcr.io/proceit-tech/distribuidora:0437fed36944a0cedf28c1ef93954bf922949a1e`. Imagem obtida pela VM; workflow `.github/workflows/docker-publish.yml` na branch PR #6. Não implica deploy automático.
- PostgreSQL: container **`nexit-db`**, imagem `postgres:16-bookworm` (16.15 observado), banco **`nexit`**, usuário **`nexit_app`**, volume Docker **`nexit_pgdata`**, rede **`nexit_internal`**, porta 5432 exclusivamente interna. `pg_isready` saudável, SQL SELECT validado. Em 09/10/2026: zero tabelas no schema `public`; nenhuma migration aplicada.
- Next.js: container **`nexit-app`** na porta interna 3000, redes `nexit_internal` e `proxy`. Logs mostram Next.js 16.2.6 Ready, teste `http://nexit-app:3000/login` na rede proxy retornou HTTP 200. Diretório `/srv/stacks/distribuidora`; `compose.yml` do DB + `app.compose.yml` da app, `.env` e `app.env` secretos (0600). `docker compose -f compose.yml -f app.compose.yml up -d --no-deps app`.

## Ambientes e segurança
- Os arquivos em `infra/nexit/` nesta PR são **espelhos de configuração higienizados** para revisão, NÃO fazem deploy e NÃO substituem automaticamente os arquivos da VM. Antes de trocar qualquer Compose real, comparar `docker compose config`, serviços, project name, redes e volumes; **nunca** rodar `down -v`, `volume rm` nem recriar o banco.
- `app.env`: `DATABASE_URL=postgresql://nexit_app:<SEGREDO_URL_ENCODED>@db:5432/nexit`, `NODE_ENV=production`, `DEMO_MODE=false`, `SESSION_COOKIE_NAME=nexit_session`. Não versionar valores reais, tokens GHCR, cookie secrets, chaves ou `.env.local`.
- `DEMO_MODE=false` no app de produção: demonstração deverá funcionar com **tenant/empresa demo e dados de exemplo reais no PostgreSQL**, nunca com login hardcoded ou localStorage/mock como fonte de verdade.
- A tela atual exibe `CASA MINGO S.A.` e `admin/admin123` para demonstração; o operador aprovou a **necessidade** de demonstração, NÃO a permanência dessas credenciais fracas em produção.
- GHCR: imagem privada e pull autenticado; token usado durante operação foi exibido em conversa e deve ser revogado/rotacionado; revogação ainda NÃO confirmada.
- Backups externos PostgreSQL e teste de restore: NÃO implementados. Não receber dados reais até aprovação.
- **Proibido** aplicar propostas SQL P001–P007 automaticamente sem Claude comparar schema/código e proprietário autorizar.

## Verificações operacionais (somente leitura)
```bash
sudo docker ps --filter name=nexit
sudo docker inspect nexit-db --format '{{.State.Health.Status}}'
sudo docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
sudo docker network inspect proxy --format '{{.Name}}'
curl -I https://nexit.proceit.net/login
sudo docker logs --tail 50 proceit-caddy
```
Não anexar saídas com secrets. HTTPS/login funcional no navegador **não** valida autenticação, permissões nem banco.
