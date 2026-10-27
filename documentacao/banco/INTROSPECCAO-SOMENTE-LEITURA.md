# Introspecção somente leitura do PostgreSQL do DistribuNex

Origem: AUD-REQ-2026-001-R01 F-001 e AUD-REQ-2026-002-R01 F-001 · Autor: Claude · Data: 2026-10-08
Executor: **o responsável PROCEIT** (ou alguém autorizado por ele), num banco indicado por ele.

O Claude não tem nem pede credenciais de banco pelo chat. Este roteiro serve para que a introspecção seja **reproduzível** e **somente leitura**. O resultado volta ao repositório só depois de revisado: estrutura, sem dados e sem segredos.

## 1. Regras
- Preferir uma **cópia** do banco (desenvolvimento ou restauração de backup) a produção.
- Nada de `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `GRANT` feitos pelo roteiro. A sessão é aberta em modo somente leitura.
- **Nunca** usar `pg_dump` sem `--schema-only`. Não exportar linhas de tabelas.
- Antes de versionar, procurar e remover do resultado: senhas, hashes, tokens, chaves, e-mails ou documentos de pessoas reais (por exemplo, dentro do corpo de funções como a da migration `017_administrador_inicial.sql`).

## 2. Estrutura completa (opção A — quem administra o banco)

```bash
pg_dump --schema-only --no-owner --no-privileges --no-comments \
  --dbname="$DATABASE_URL_SOMENTE_LEITURA" \
  --file=distribunex-schema-$(date +%Y%m%d).sql
```

`pg_dump` só lê, mas precisa enxergar todas as tabelas. Quem roda deve ser o dono do banco ou ter um papel com leitura no esquema.

## 3. Consultas de catálogo (opção B — `psql`, qualquer papel com acesso ao banco)

Executar com `psql "$URL" -X -A -F $'\t' -f introspeccao.sql -o introspeccao-$(date +%Y%m%d).tsv`. Todas leem só `pg_catalog`/`information_schema`; nenhuma lê dados de negócio.

```sql
SET default_transaction_read_only = on;
BEGIN READ ONLY;

-- Q1 versão e extensões
SELECT version();
SELECT extname, extversion FROM pg_extension ORDER BY 1;

-- Q2 tabelas, dono, RLS e estimativa de linhas (sem ler linhas)
SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS dono,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forcada,
       c.reltuples::bigint AS linhas_estimadas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY 1,2;

-- Q3 colunas
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY 1,2,3;

-- Q4 constraints (PK, FK, UNIQUE, CHECK, EXCLUDE)
SELECT n.nspname, c.relname AS tabela, k.conname, k.contype,
       pg_get_constraintdef(k.oid) AS definicao
FROM pg_constraint k
JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY 1,2,3;

-- Q5 índices
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY 1,2,3;

-- Q6 triggers (não internos)
SELECT n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY 1,2,3;

-- Q7 funções e procedimentos (assinatura, segurança, dono). O corpo vai na Q7b.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS dono
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p')
ORDER BY 1,2;
-- Q7b corpo das funções: REVISAR antes de versionar (pode conter senha inicial)
SELECT n.nspname, p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p')
ORDER BY 1,2;

-- Q8 políticas de RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies ORDER BY 1,2,3;

-- Q9 papéis relevantes (sem senhas)
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY 1;

-- Q10 privilégios do papel usado pela aplicação (trocar o nome)
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'NOME_DO_PAPEL_DA_APLICACAO'
ORDER BY 1,2,3;

-- Q11 visões e sequências
SELECT schemaname, viewname FROM pg_views
WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;
SELECT sequence_schema, sequence_name FROM information_schema.sequences ORDER BY 1,2;

ROLLBACK;
```

## 4. Verificações de integridade (contagens, sem dados pessoais)

Só depois da Q3, porque dependem das colunas existirem. São `SELECT count(*)`: devolvem números, não registros. O conjunto completo para o multiempresa está em `DESENHO-REQ-2026-002-multiempresa.md` §10.1 (PR do REQ-2026-002).

## 5. Entrega ao repositório
1. O responsável revisa os arquivos e remove segredos e dados pessoais.
2. Versiona em `documentacao/banco/baseline/AAAAMMDD/` (`schema.sql` e/ou `introspeccao.tsv`), com um `LEIAME.md` dizendo qual banco, a data, quem executou e se é cópia ou produção.
3. O Claude concilia com `MODELO-DADOS-ATUAL.md` (46 tabelas inferidas) e registra as divergências no REQ de linha de base (REQ-2026-003 proposto).
4. Nenhuma migration é escrita antes desse passo.
