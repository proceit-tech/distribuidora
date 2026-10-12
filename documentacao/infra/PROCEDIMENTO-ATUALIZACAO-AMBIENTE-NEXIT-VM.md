# Nexit V1 — procedimento operacional de atualização da VM

**Documento permanente da infraestrutura.** Base: histórico real de terminal fornecido pelo responsável em 2026-10-11, confrontado com os arquivos atuais `compose.yml`, `app.compose.yml` e `documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh` no GitHub.

**Regra para IA:** antes de orientar atualização, leia **este arquivo e o runner oficial vigente**. Não redescubra caminhos/nome de serviços já identificados, não invente comando alternativo de migrations e não peça novamente ao responsável os dados aqui confirmados. Se o ambiente mudar, atualize este documento após confirmação.

## Ambiente conhecido

| Item | Valor |
|---|---|
| VM (host visto no terminal) | `instance-20260930-232419` |
| Usuário Linux | `proceit24` |
| Git clone na VM | `/tmp/nexit-instalacao` |
| Branch de desenvolvimento | `feature/NEXIT-2026-001-banco-demo` |
| Diretório Docker Compose | `/srv/stacks/distribuidora` |
| Compose principal | `/srv/stacks/distribuidora/compose.yml` |
| Compose app | `/srv/stacks/distribuidora/app.compose.yml` |
| Projeto Compose | `nexit` |
| Serviço app | `app` |
| Contêiner app e imagem | `nexit-app`, `nexit-app:teste` |
| Contêiner BD | `nexit-db` (PostgreSQL 16 Bookworm) |
| BD e usuário | `nexit`, `nexit_app` (não usar usuário `postgres`, inexistente nesse cluster) |
| Diretório SQL no Git | `documentacao/banco/nexit/v1/migraciones` |
| Runner oficial no Git | `documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh` |
| Diretório temporário usado dentro do PostgreSQL | `/tmp/nexit-migraciones` |
| Diretório persistente de documentos no host | `/srv/stacks/distribuidora/data/nexit-archivos` |
| Diretório de documentos no contêiner | `/data/archivos` |
| Variável exigida | `NEXIT_ARCHIVOS_DIR=/data/archivos` |

**Histórico comprovado:** já se executou com sucesso o runner até `NEX-032` e foi confirmado `32 | NEX-032`; isso NÃO comprova as migrations posteriores. O histórico também mostra `docker build -t nexit-app:teste .` seguido de `docker compose ... up -d --no-deps --force-recreate app` executados com sucesso em atualizações anteriores. Isso não garante que o código atual passe no build (houve falhas reais de TypeScript e prerender em outros commits).

## ETAPA 1 — Git (sempre a partir do repositório)

```bash
cd /tmp/nexit-instalacao
git status --short
git branch --show-current
git pull --ff-only origin feature/NEXIT-2026-001-banco-demo
git log -1 --oneline
```

**Não executar `git pull` em `/srv/stacks/distribuidora`:** não é um repositório Git; o terminal já devolveu `fatal: not a git repository`.

## ETAPA 2 — Migraciones automáticas (SOMENTE se a atualização inclui migrations e há autorização)

O procedimento abaixo é o que **funcionou no terminal real**. Copiar o DIRETÓRIO `v1/.`, não cinco SQLs escolhidos manualmente: o runner verifica **todas** as migrations versionadas, checksums e `schema_migrations`, pulando as já aplicadas.

Primeiro, copiar os arquivos oficiais do Git atualizado para o contêiner, incluindo runner e todas as migrations:

```bash
cd /tmp/nexit-instalacao
docker exec nexit-db mkdir -p /tmp/nexit-migraciones
docker cp documentacao/banco/nexit/v1/. nexit-db:/tmp/nexit-migraciones/
```

Listar pendentes SEM executar:

```bash
docker exec -e PGHOST=/var/run/postgresql \
  -e PGUSER=nexit_app \
  -e PGDATABASE=nexit \
  nexit-db bash /tmp/nexit-migraciones/scripts/aplicar-migraciones.sh \
  --permitir-banco-real --solo-listar
```

Executar **somente após revisão da listagem e autorização do responsável**:

```bash
docker exec -e PGHOST=/var/run/postgresql \
  -e PGUSER=nexit_app \
  -e PGDATABASE=nexit \
  nexit-db bash /tmp/nexit-migraciones/scripts/aplicar-migraciones.sh \
  --permitir-banco-real
```

**Comportamento do runner real**: `ya aplicada` para checksum conhecido; `pendiente` em `--solo-listar`; `aplicando` para nova migration. Cada migration executa numa transação com registro de versão/checksum; erro aborta o processo. NÃO selecionar as NEX-033…037 manualmente e NÃO usar `psql -f` isolado para migrations, pois isso contornaria o registro de checksum.

Conferir resultado:

```bash
docker exec nexit-db psql -U nexit_app -d nexit \
  -c "SELECT COUNT(*) AS total, MAX(version) AS ultima FROM public.schema_migrations;"
docker exec nexit-db psql -U nexit_app -d nexit \
  -c "SELECT version, nombre FROM public.schema_migrations ORDER BY version;"
```

A última versão registrada até a primeira atualização foi NEX-032; commits posteriores incluem NEX-033 a NEX-045, mas nunca presumir que já foram executadas. Se houver erro, **PARAR antes do deploy** e inspecionar.

## ETAPA 3 — Verificar persistência de arquivos antes de substituir a app

O histórico confirmou que inicialmente `NEXIT_ARCHIVOS_DIR` estava vazio e `docker inspect nexit-app --format '{{json .Mounts}}'` retornou `[]`. Depois o responsável criou o diretório de documentos no host e os arquivos Compose foram colocados no Git; a presença efetiva do mount no contêiner atual deve ser verificada.

```bash
cd /srv/stacks/distribuidora
docker compose -p nexit -f compose.yml -f app.compose.yml config --quiet
docker inspect nexit-app --format '{{json .Mounts}}'
docker exec nexit-app sh -c 'printenv NEXIT_ARCHIVOS_DIR'
ls -ld /srv/stacks/distribuidora/data/nexit-archivos
```

Configuração versionada no `app.compose.yml`: bind mount `/srv/stacks/distribuidora/data/nexit-archivos:/data/archivos`, `NEXIT_ARCHIVOS_DIR=/data/archivos`. Usuário da app UID/GID 1001. Se diretório ainda não existir:

```bash
sudo mkdir -p /srv/stacks/distribuidora/data/nexit-archivos
sudo chown 1001:1001 /srv/stacks/distribuidora/data/nexit-archivos
sudo chmod 700 /srv/stacks/distribuidora/data/nexit-archivos
```

**Não copiar automaticamente Compose do Git para o stack em toda atualização**: o histórico mostra que isso foi feito uma vez com `cp compose.yml compose.yml.bak` e `cp app.compose.yml app.compose.yml.bak`. Hoje o Compose do stack tem arquivos e `.env` próprios; comparar antes de substituir e nunca sobrescrever `.env`/`app.env`. Não exibir senhas.

## ETAPA 4 — Build da aplicação

Executar **no Git clone**, não na pasta Compose:

```bash
cd /tmp/nexit-instalacao
docker build -t nexit-app:teste .
```

**Obrigatório:** só avançar se o build terminar **FINISHED**, com exit code 0. Se falhar em TypeScript, `next build` ou prerender (como já ocorreu com `clientes`/`login`), não recriar o contêiner.

## ETAPA 5 — Recriar SOMENTE a aplicação

Executar **no stack Compose**:

```bash
cd /srv/stacks/distribuidora
docker compose -p nexit -f compose.yml -f app.compose.yml config --quiet
docker compose -p nexit -f compose.yml -f app.compose.yml \
  up -d --no-deps --force-recreate app
```

Não executar `docker compose down -v`, não remover volumes e não reiniciar desnecessariamente `nexit-db`.

## ETAPA 6 — Conferência após atualização

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
docker logs --tail 50 nexit-app
docker exec nexit-app sh -c 'printenv NEXIT_ARCHIVOS_DIR'
docker inspect nexit-app --format '{{json .Mounts}}'
docker exec nexit-db psql -U nexit_app -d nexit \
  -c "SELECT COUNT(*) AS total, MAX(version) AS ultima FROM public.schema_migrations;"
```

O terminal histórico mostra `nexit-app`, `nexit-db`, `proceit-caddy` e Portainer; confirmar serviços conforme o deploy. Se logs indicarem falha, parar e diagnosticar, sem concluir que está homologado por `Started`.

## Gestão de ambientes e erros conhecidos

- Este documento descreve **uma VM única de desenvolvimento/homologação**; não presumir staging separado.
- Projeto não possui clientes reais ainda; **o responsável determinou não exigir backups nesta fase**. Isso é decisão consciente de risco, não afirmação de risco zero. Não adicionar backup obrigatório em toda resposta. Para operações destrutivas futuras, solicitar autorização específica.
- `git`: somente `/tmp/nexit-instalacao`; `compose`: somente `/srv/stacks/distribuidora`.
- `postgres` como usuário BD não existe; usar `nexit_app`.
- Runner de migration oficial (NEX-0xx) é a fonte de verdade; não copiar SQL individualmente e não propor containers auxiliares de PostgreSQL sem necessidade.
- `--permitir-banco-real` é obrigatório porque o banco se chama `nexit`.
- `app.compose.yml` existe tanto no Git quanto no stack, mas somente a **configuração efetiva** em `/srv/stacks/distribuidora` determina o ambiente.
- Atualização automática de banco e de aplicação são fases distintas. Deploy só após migrations pertinentes concluídas, armazenamento válido e build OK.
- O código de Proveedores NEX-033…037, os privilégios e os triggers ainda precisam de validação real; checksums e status de aplicação devem ser conferidos no PostgreSQL.

## Procedimento resumido, já confirmado em uso

```bash
# Git
cd /tmp/nexit-instalacao
git pull --ff-only origin feature/NEXIT-2026-001-banco-demo

# Migrations (somente se houver pendências e autorização)
docker exec nexit-db mkdir -p /tmp/nexit-migraciones
docker cp documentacao/banco/nexit/v1/. nexit-db:/tmp/nexit-migraciones/
docker exec -e PGHOST=/var/run/postgresql -e PGUSER=nexit_app -e PGDATABASE=nexit \
  nexit-db bash /tmp/nexit-migraciones/scripts/aplicar-migraciones.sh --permitir-banco-real --solo-listar
# Após conferir:
docker exec -e PGHOST=/var/run/postgresql -e PGUSER=nexit_app -e PGDATABASE=nexit \
  nexit-db bash /tmp/nexit-migraciones/scripts/aplicar-migraciones.sh --permitir-banco-real

# Build (somente com banco e infraestrutura compatíveis)
cd /tmp/nexit-instalacao
docker build -t nexit-app:teste .

# Deploy apenas da app, depois de build OK
cd /srv/stacks/distribuidora
docker compose -p nexit -f compose.yml -f app.compose.yml config --quiet
docker compose -p nexit -f compose.yml -f app.compose.yml up -d --no-deps --force-recreate app

# Conferência
docker logs --tail 50 nexit-app
docker exec nexit-db psql -U nexit_app -d nexit -c "SELECT COUNT(*) AS total, MAX(version) AS ultima FROM public.schema_migrations;"
```

**NEX-039 e NEX-043 (checksum):** a NEX-039 já aplicada no banco real tem SHA-256 `6d5a5d3dea0f00521ab9a2bdcb5bb4722f187069a94198d12ae84793f6e38dab` (34 unidades da Tabela 5) e o arquivo versionado foi restaurado exatamente a essa versão; **não deve ser editada**. As 30 unidades da NT023 (111–140, incl. Caja 131/BX e Docena 113/DOC) entram pela migration incremental **NEX-043**, que só depende da NEX-039. Ordem: 038 → 039 → 040 → 041 → 042 → 043 (nenhuma depende de 043; os seeds/reconciliação de CJ e DOC exigem 043). Sem a 043 aplicada, vincular unidades 111–140 falha pela FK.

**NEX-044 (jerarquia de catálogos):** adiciona `familias_producto.categoria_id` (NULLABLE, FK multiempresa) e dois gatilhos de coerência; não classifica nem altera dados. **Aplicar a migration ANTES de publicar o código** que usa a coluna (as listas de Catálogos e o cadastro de Productos leem `categoria_id`). Depois, o responsável executa o relatório somente leitura `scripts/informe-jerarquia-catalogos-NEX-044.sql` para identificar as famílias a classificar manualmente em Catálogos → Familias. `NOT NULL` fica para uma migration futura, após o saneamento. Reversão: `scripts/reversion-NEX-044.sql` (aborta se houver famílias classificadas).

**NEX-045 (Catálogos comerciales):** cria `tipos_cambio` e habilita escrita (sem DELETE) em `canales_venta`/`zonas_comerciales`; redefine o wrapper `nex_aplicar_grants_runtime` com `nex_aplicar_grants_comercial`. Requer NEX-037, 039 e 041. **Aplicar antes de publicar o código** (menu `/catalogos-comerciales`). Se houver nomes ou códigos duplicados em canais/zonas dentro de uma empresa, a migration ABORTA sem alterar dados: depurar manualmente e repetir. Reversão: `scripts/reversion-NEX-045.sql` (aborta se houver cotações).
