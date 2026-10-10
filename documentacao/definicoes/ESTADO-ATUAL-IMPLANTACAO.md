# ESTADO-ATUAL-IMPLANTACAO

**Data:** 2026-10-09. Legenda: **[VERIFICADO]** = confirmado por mim no GitHub/repositório; **[RELATADO]** = informado pelo proprietário, não verificado por mim. Nada de senhas, hashes, tokens ou `.env` neste documento.

## GitHub [VERIFICADO]
- Repositório `proceit-tech/distribuidora`; branch de trabalho `feature/NEXIT-2026-001-banco-demo` @ `f02eb8c` (fast-forward local, sem rebase nem force-push). PR #7 aberta.
- Contém: NEX-001…016, scripts/testes/docs do banco (v1), workflows `nexit-banco-ci.yml` e `nexit-banco-deploy.yml` (já ajustados por você: fase inicial sem GCS, aprovação), `nexit-db-remote.sh` ajustado, `Dockerfile`, `.dockerignore`, `next.config.ts` com `output: standalone`, login multiempresa.
- Outros branches: `main`, `docs/REQ-2026-003-mapeamento-banco`, `docs/INFRA-2026-001-isolamento-stacks`, `infra/INFRA-2026-001-docker-portainer`, `feature/REQ-2026-00{1,2,4}-*`, `claude/docker`.
- Aplicação: 1 única tela (`clientes/nuevo`) chama API de dados; as demais usam mocks/localStorage (ver AUDITORIA).

## Banco de dados [RELATADO]
- Google Compute Engine; PostgreSQL 16 em contêiner `nexit-db`, base `nexit`, Compose em `/srv/stacks/distribuidora`.
- Migrations NEX-001…016 instaladas; catálogos S-001 aplicados; NEX-016 aplicada.
- Empresas: **PROCEIT** (RUC 5469464-7, usuário `admin`, habilitado como administrador global) e **CASA MINGO S.A.** (RUC 80003314-0, usuário `cliente`, sem permissão global).
- **Não verificado por mim:** versões em `schema_migrations`, checksums, existência/privilégios de `nexit_runtime`, backups, cópia externa, conteúdo das empresas.

## Aplicação e Docker [RELATADO]
- Contêiner `nexit-app` (Next.js) atrás de Caddy em `https://nexit.proceit.net`; nova imagem publicada após o Dockerfile standalone; PROCEIT autentica; várias telas exibem dados demonstrativos.
- **Não verificado por mim:** variáveis (`DEMO_MODE`, `DATABASE_URL`), usuário de conexão (hipótese: `nexit_app`), saúde do contêiner, versão da imagem.

## Restrições vigentes
Não recriar banco/contêineres/volumes/empresas; não reinicializar; migrations novas a partir de **NEX-017**; não alterar migrations aplicadas; sem dados fictícios no ambiente real; nenhuma ação na VM sem autorização expressa.

## Divergências a resolver
1. Meus testes assumiam 15 migrations — corrigido (320 PASS).
2. O texto de `PROCEIT-CASA-MINGO-NEX-016.md` indica `nexit_app` para inicializar; o plano do banco previa `nexit_runtime` para a app — decidir quando a app trocar de papel.
3. O usuário `cliente` de CASA MINGO precisa de perfil/permissões definidos (a NEX-015 criou o perfil ADMIN da empresa).
