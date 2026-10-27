# Deploy — distribuidora

Padrão PROCEIT (ADR-0002 em `proceit-standards`): roda em Docker na VM do Google Cloud, atrás do Traefik, com subdomínio no DNS da Hostinger.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `Dockerfile` | Imagem de produção (Next.js standalone, porta 3000, usuário não-root) |
| `.dockerignore` | Mantém `node_modules`, `.next`, `.env` e `.git` fora da imagem |
| `docker/compose.yml` | Serviço com labels do Traefik, limite de memória e rotação de logs |
| `.env.example` | Variáveis necessárias. Copie para `.env` na VM e preencha. **Nunca** commite o `.env` |

## Pré-requisitos na VM

- Docker + Docker Compose e a stack base do `proceit-infra`: Traefik na rede externa `proxy` e PostgreSQL compartilhado na rede externa `db`.
- Registro DNS tipo A na Hostinger: `APP_DOMAIN` → IP fixo da VM.
- Banco e usuário criados no PostgreSQL compartilhado (script do `proceit-infra`).

## Publicar

```bash
cd /srv/distribuidora
git pull
cp -n .env.example .env   # só na primeira vez; depois edite os valores
docker compose -f docker/compose.yml --env-file .env up -d --build
docker compose -f docker/compose.yml ps
```

## Rollback

```bash
APP_VERSION=<tag-anterior> docker compose -f docker/compose.yml --env-file .env up -d
```

## Testar local

```bash
cp .env.example .env
docker build -t distribuidora .
docker run --rm -p 3000:3000 --env-file .env distribuidora
```
