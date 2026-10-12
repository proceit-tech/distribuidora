#!/usr/bin/env bash
# Reproduz, em PostgreSQL DESCARTÁVEL (nunca no banco real), o ciclo de cada proposta P001..P007:
#   cadeia up até Pn -> down de Pn -> up de Pn -> TESTE-Pn. Imprime um resumo por proposta e sai com 1 se algo falhar.
# Uso:  PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./executar-propostas.sh
# Requisitos: PostgreSQL >= 15 (views security_invoker), extensão dblink (contrib), superusuário do banco descartável.
# O teste usa o papel dn_app_test (NOSUPERUSER, sem BYPASSRLS) criado aqui; bancos temporários chk_Pn são recriados.
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"; P="$R/migracoes/propostas"; V="$R/validacoes"
LOG="${LOG_DIR:-$(mktemp -d)}"
declare -A F=( [P001]=P001 [P002]=P002-catalogos-clientes [P003]=P003-fornecedores-produtos [P004]=P004-listas-preco [P005]=P005-estoque-recepciones [P006]=P006-faturamento [P007]=P007-custeio )
declare -A T=( [P001]=P001-isolamento [P002]=P002-catalogos-clientes [P003]=P003-fornecedores-produtos [P004]=P004-listas-preco [P005]=P005-estoque-recepciones [P006]=P006-faturamento [P007]=P007-custeio )
order=(P001 P002 P003 P004 P005 P006 P007); fail=0
for n in "${order[@]}"; do
  db="chk_$n"; dropdb --if-exists "$db" 2>/dev/null; createdb "$db" || exit 2
  for m in "${order[@]}"; do
    psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$P/REQ-2026-003-${F[$m]}-up.sql" >"$LOG/up_${n}_$m.log" 2>&1 || { echo "$n: UP $m FALHOU ($LOG/up_${n}_$m.log)"; fail=1; continue 2; }
    [ "$m" = "$n" ] && break
  done
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$P/REQ-2026-003-${F[$n]}-down.sql" >"$LOG/down_$n.log" 2>&1 || { echo "$n: DOWN FALHOU"; fail=1; continue; }
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$P/REQ-2026-003-${F[$n]}-up.sql" >"$LOG/up2_$n.log" 2>&1 || { echo "$n: UP2 FALHOU"; fail=1; continue; }
  tables=$(psql -Atd "$db" -c "select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r'")
  psql -q -d "$db" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dn_app_test') THEN CREATE ROLE dn_app_test LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END \$\$" >/dev/null
  ( cd "$V" && psql -v ON_ERROR_STOP=1 -d "$db" -f "TESTE-${T[$n]}.sql" >"$LOG/teste_$n.log" 2>&1 ); rc=$?
  ok=$(grep -c 'NOTICE:.*OK ' "$LOG/teste_$n.log")
  echo "$n: ciclo up/down/up OK | tabelas acumuladas=$tables | teste rc=$rc | verificações OK=$ok"
  [ $rc -ne 0 ] && { fail=1; grep -m3 'FALHOU\|ERROR' "$LOG/teste_$n.log"; }
done
echo "logs em: $LOG"; exit $fail
