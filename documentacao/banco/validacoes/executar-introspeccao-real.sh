#!/usr/bin/env bash
# INTROSPECÇÃO SOMENTE LEITURA do PostgreSQL REAL — coleta apenas METADADOS (catálogo), nunca linhas de negócio.
# Quem executa: o responsável PROCEIT (ou pessoa por ele autorizada), com um papel SOMENTE LEITURA.
# Não executa DDL/DML. Toda sessão é aberta com default_transaction_read_only=on e statement_timeout curto.
# Uso:
#   export PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=<papel_somente_leitura>   # senha via PGPASSWORD/.pgpass (NÃO colar em chat)
#   CONFIRMO_SOMENTE_LEITURA=SIM ./executar-introspeccao-real.sh [diretorio_de_saida]
# Saída: um CSV por consulta + RESUMO.txt. Enviar ao PR/chat só depois de conferir que não há dado sensível (ver ROTEIRO-INTROSPECCAO-REAL.md §4).
set -u
[ "${CONFIRMO_SOMENTE_LEITURA:-}" = "SIM" ] || { echo "Recusado: defina CONFIRMO_SOMENTE_LEITURA=SIM depois de ler ROTEIRO-INTROSPECCAO-REAL.md"; exit 2; }
OUT="${1:-introspeccao-real-$(date +%Y%m%d-%H%M%S)}"; mkdir -p "$OUT"
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=60000"
P="psql -X -q -v ON_ERROR_STOP=1 --csv"
$P -c "select 1" >/dev/null 2>"$OUT/erro-conexao.txt" || { echo "Sem conexão (ver $OUT/erro-conexao.txt)"; exit 3; }
rm -f "$OUT/erro-conexao.txt"
RO=$($P -At -c "show default_transaction_read_only"); [ "$RO" = "on" ] || { echo "ABORTADO: sessão não está somente leitura"; exit 4; }
SU=$($P -At -c "select rolsuper::text||','||rolbypassrls::text from pg_roles where rolname=current_user")
case "$SU" in false,false) ;; *) [ "${PERMITIR_PAPEL_PRIVILEGIADO:-}" = "SIM" ] || { echo "ABORTADO: o papel atual é superusuário/BYPASSRLS ($SU). Use um papel somente leitura (ver roteiro §2)."; exit 5; } ;; esac
q() { # q <nome> <sql>
  if $P -c "$2" > "$OUT/$1.csv" 2>"$OUT/$1.erro"; then rm -f "$OUT/$1.erro"; else echo "  (falhou: $1 — ver $OUT/$1.erro)"; fi
}
SCH="n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'"
q 01_versao_e_sessao "select version() as versao, current_setting('server_version_num') as server_version_num, current_database() as banco, current_user as papel, current_setting('default_transaction_read_only') as somente_leitura, now() as coletado_em"
q 02_papeis "select rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls from pg_roles where rolname !~ '^pg_' order by 1"
q 03_extensoes "select extname, extversion from pg_extension order by 1"
q 04_schemas "select n.nspname as schema, pg_get_userbyid(n.nspowner) as dono from pg_namespace n where $SCH order by 1"
q 05_tabelas "select n.nspname as schema, c.relname as tabela, c.relkind, pg_get_userbyid(c.relowner) as dono, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forcado, c.reltuples::bigint as linhas_estimadas, c.relispartition as particao from pg_class c join pg_namespace n on n.oid=c.relnamespace where $SCH and c.relkind in ('r','p','v','m','f') order by 1,2"
q 06_colunas "select table_schema, table_name, ordinal_position, column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default, is_identity, is_generated from information_schema.columns where table_schema not in ('pg_catalog','information_schema') order by 1,2,3"
q 07_constraints "select n.nspname as schema, c.conrelid::regclass::text as tabela, c.conname, c.contype, pg_get_constraintdef(c.oid) as definicao from pg_constraint c join pg_namespace n on n.oid=c.connamespace where $SCH order by 1,2,3"
q 08_indices "select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname not in ('pg_catalog','information_schema') order by 1,2,3"
q 09_triggers "select c.relnamespace::regnamespace::text as schema, c.relname as tabela, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definicao from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace::regnamespace::text not in ('pg_catalog','information_schema') order by 1,2,3"
q 10_funcoes "select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as argumentos, p.prosecdef as security_definer, p.provolatile, pg_get_userbyid(p.proowner) as dono, l.lanname as linguagem from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where $SCH and p.prokind in ('f','p') order by 1,2"
q 11_views "select schemaname, viewname, pg_get_viewdef((quote_ident(schemaname)||'.'||quote_ident(viewname))::regclass) as definicao from pg_views where schemaname not in ('pg_catalog','information_schema') order by 1,2"
q 12_politicas_rls "select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies order by 1,2,3"
q 13_sequencias "select schemaname, sequencename, data_type, start_value, increment_by, last_value from pg_sequences order by 1,2"
q 14_privilegios_do_papel_atual "select table_schema, table_name, privilege_type from information_schema.role_table_grants where grantee = current_user order by 1,2,3"
q 15_tabelas_de_migracao "select n.nspname as schema, c.relname as tabela, c.reltuples::bigint as linhas_estimadas from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relname ~* '(migrat|schema_version|flyway|knex|prisma|sequelize|typeorm)' order by 1,2"
{
  echo "Introspecção somente leitura — $(date -u +%FT%TZ)"
  echo "Papel (superuser,bypassrls): $SU   [esperado: false,false]"
  echo "Arquivos gerados:"; ls -1 "$OUT" | sed 's/^/  /'
  echo "Falhas:"; ls "$OUT"/*.erro 2>/dev/null | sed 's/^/  /' || true
} > "$OUT/RESUMO.txt"
cat "$OUT/RESUMO.txt"
echo "Concluído. Nenhuma linha de negócio foi lida (somente catálogo). Revise antes de compartilhar: $OUT"
