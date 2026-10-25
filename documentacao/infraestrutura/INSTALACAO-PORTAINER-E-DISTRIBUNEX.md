# INFRA-2026-001 — Instalação real e operações Nexit (atualizado 09/10/2026)

**Estado observado:** serviços instalados na VM e HTTPS funcional; não homologado para dados reais. Veja o registro detalhado em [ESTADO-REAL-NEXIT-GOOGLE-CLOUD-2026-10-09.md](./ESTADO-REAL-NEXIT-GOOGLE-CLOUD-2026-10-09.md).

## Arquivos versionados e localização real
| Arquivo Git | Caminho na VM | Função |
|---|---|---|
| `infra/nexit/compose.yml` | `/srv/stacks/distribuidora/compose.yml` | PostgreSQL já inicializado |
| `infra/nexit/app.compose.yml` | `/srv/stacks/distribuidora/app.compose.yml` | Next.js/ GHCR |
| `infra/nexit/.env.example` | `/srv/stacks/distribuidora/.env` (**secreto**) | DB / usuário / senha |
| `infra/nexit/app.env.example` | `/srv/stacks/distribuidora/app.env` (**secreto**) | URL DB e runtime |
| `infra/nexit/proxy.compose.yml` | `/srv/infrastructure/proxy/compose.yml` | Caddy HTTP/HTTPS |
| `infra/nexit/Caddyfile` | `/srv/infrastructure/proxy/Caddyfile` | reverse proxy TLS |
| `infra/portainer/compose.yml` | `/srv/infrastructure/portainer/compose.yml` | Portainer |

**Atenção:** os arquivos versionados são reconstruções higienizadas com base em capturas/comandos do operador, e não export direto da VM. Compare configurações antes de qualquer sincronização; não sobrescreva automaticamente.

## Situação
- IP estático 34.31.253.146, DNS `nexit.proceit.net` A apontado para Google Cloud, HTTPS do Caddy com Let's Encrypt validado por HTTP/2 200.
- Portainer somente `127.0.0.1:9443`, via SSH; não publicar a porta.
- DB `nexit-db`, PostgreSQL 16.15, volume **`nexit_pgdata`**, rede `nexit_internal`, usuário `nexit_app`, banco `nexit`, sem exposição externa. Zero tabelas em 09/10/2026.
- App `nexit-app`, rede interna e rede externa `proxy`, imagem privada GHCR etiquetada pelo SHA.
- Operação atual: `sudo docker compose -f compose.yml -f app.compose.yml ps`.
- Os arquivos `infra/distribunex/` representam **proposta antiga**, não a instalação atual. Não usar para deploy nem criar `distribunex_pgdata`.

## Regras de implantação
1. Claude cria SQL/migrations/seeds no Git e PR própria; PROCEIT revisa e aprova antes de executar em `nexit`. Vide [REQUISITOS-CLAUDE-NEXIT-DEMO-E-BANCO-2026-10-09.md](../definicoes/REQUISITOS-CLAUDE-NEXIT-DEMO-E-BANCO-2026-10-09.md).
2. Nunca usar `docker compose down -v`, remover `nexit_pgdata`, recriar `nexit-db` nem aplicar SQL P001–P007 sem aprovação e backup.
3. Backups fora da VM e testes de recuperação ainda pendentes. Implementar antes de clientes reais.
4. Não versionar `.env`, `app.env`, `.env.local`, tokens, senha PostgreSQL ou chaves SSH.
5. Token de GHCR que apareceu em tela/conversa deve ser revogado e substituído.
6. Demo para clientes é requerida; deve usar dados fictícios isolados em PostgreSQL. Login/funcionalidades ainda não homologados.

## Verificações de rotina
```bash
sudo docker ps --filter name=nexit
sudo docker inspect nexit-db --format '{{.State.Health.Status}}'
curl -I https://nexit.proceit.net/login
sudo docker compose -f /srv/stacks/distribuidora/compose.yml -f /srv/stacks/distribuidora/app.compose.yml ps
```
