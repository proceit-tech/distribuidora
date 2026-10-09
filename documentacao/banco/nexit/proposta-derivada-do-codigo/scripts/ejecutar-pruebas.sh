#!/usr/bin/env bash
# Ejecuta TODA la batería sobre un PostgreSQL DESCARTABLE (nunca contra 'nexit').
#   Requisitos: superusuario en un clúster de pruebas (PGHOST/PGPORT/PGUSER), psql, python3. Opcional: APP_REPO=<ruta del repo de la app>.
#   Crea una base nexit_test_<pid>, aplica migraciones + semillas, corre T01..T08 y la borra al terminar (--conservar para mantenerla).
#   También crea/borra el rol nexit_runtime en el clúster de pruebas; se niega a correr si ese rol ya existe (clúster no descartable).
# Resultado: resumen PASS/FALLA por prueba y código de salida 0 solo si todo pasó.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSERVAR=0; [[ "${1:-}" == "--conservar" ]] && CONSERVAR=1
DB="nexit_test_$$"
[[ "$DB" == "nexit" ]] && exit 9
if [[ "$(psql -X -Atc "select count(*) from pg_roles where rolname='nexit_runtime'")" != "0" ]]; then
  echo "ABORTADO: ya existe el rol nexit_runtime en este clúster. Use un clúster descartable." >&2; exit 3
fi
LOG="$(mktemp -d)"; FALLAS=0; PASS_TOTAL=0
PW="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"   # solo para esta corrida; nunca se imprime ni se guarda
export PGOPTIONS="-c nex.pw_prueba=$PW"
limpiar() {
  if [[ $CONSERVAR -eq 0 ]]; then
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_rls WITH (FORCE)" >/dev/null 2>&1
    psql -X -q -d postgres -c "DROP OWNED BY nexit_runtime" -c "DROP ROLE IF EXISTS nexit_runtime" >/dev/null 2>&1
  else echo "Base conservada: $DB (y ${DB}_rls). Recuerde borrar el rol nexit_runtime."; fi
  rm -rf "$LOG"
}
trap limpiar EXIT
paso() { printf '%-62s' "$1"; }
fin() { # $1 = código, $2 = archivo de log
  if [[ $1 -eq 0 ]]; then local n; n=$(grep -c "PASS" "$2" || true); PASS_TOTAL=$((PASS_TOTAL + n)); echo "OK   ($n verificaciones)"; else echo "FALLA"; sed 's/^/      /' "$2" | grep -E "FALLA|ERROR|rechaz|CONTEXT" | head -8; FALLAS=$((FALLAS + 1)); fi
}
fin0() { if [[ $1 -eq 0 ]]; then echo "OK"; else echo "FALLA"; tail -5 "$2"; FALLAS=$((FALLAS + 1)); fi; }
psql -X -q -d postgres -c "CREATE DATABASE $DB" || exit 1
export PGDATABASE="$DB"

paso "M1 migraciones desde cero (13 archivos)"; "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m1" 2>&1; rc=$?
[[ $rc -eq 0 && $(grep -c '^aplicando' "$LOG/m1") -eq 13 ]] && { echo "OK   (13 aplicadas)"; } || { echo "FALLA"; tail -5 "$LOG/m1"; FALLAS=$((FALLAS+1)); }
paso "M2 reaplicar es idempotente (0 cambios)"; "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m2" 2>&1; rc=$?
[[ $rc -eq 0 && $(grep -c '^ya aplicada' "$LOG/m2") -eq 13 && $(grep -c '^aplicando' "$LOG/m2") -eq 0 ]] && echo "OK   (13 ya aplicadas)" || { echo "FALLA"; tail -5 "$LOG/m2"; FALLAS=$((FALLAS+1)); }
paso "M3 detecta migración editada (checksum)"; mkdir "$LOG/mig"; cp "$AQUI"/migraciones/NEX-0*.sql "$LOG/mig/"; echo "-- editado" >> "$LOG/mig/NEX-005-clientes.sql"
MIGRACIONES_DIR="$LOG/mig" "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m3" 2>&1; rc=$?
[[ $rc -eq 4 ]] && echo "OK   (abortó con código 4)" || { echo "FALLA (rc=$rc)"; FALLAS=$((FALLAS+1)); }
paso "M4 se niega a operar sobre la base 'nexit'"; PGDATABASE=nexit "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m4" 2>&1; rc=$?
[[ $rc -eq 3 ]] && echo "OK   (abortó con código 3)" || { echo "FALLA (rc=$rc)"; FALLAS=$((FALLAS+1)); }

paso "S1 semilla S-001 (catálogos globales) y re-ejecución"; psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >"$LOG/s1" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >>"$LOG/s1" 2>&1; fin0 $? "$LOG/s1"
HASH="$(psql -X -Atc "select crypt('$PW', gen_salt('bf', 12))")"
paso "S2 semilla S-002 (empresa-modelo) y re-ejecución"; psql -X -q -v ON_ERROR_STOP=1 -v usuario_demo=admin -v hash_demo="$HASH" -f "$AQUI/seeds/S-002-empresa-modelo.sql" >"$LOG/s2" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -v usuario_demo=admin -v hash_demo="$HASH" -f "$AQUI/seeds/S-002-empresa-modelo.sql" >>"$LOG/s2" 2>&1 && grep -q "ya existe" "$LOG/s2"; fin0 $? "$LOG/s2"
paso "S3 semilla S-003 (prospecto) sin hash => aborta"; psql -X -q -v codigo_demo=demo-sinhash -f "$AQUI/seeds/S-003-empresa-prospecto.sql" >"$LOG/s3" 2>&1; grep -q "FALTA" "$LOG/s3" && ! psql -X -Atc "select 1 from empresas where codigo='demo-sinhash'" | grep -q 1 && echo "OK" || { echo "FALLA"; FALLAS=$((FALLAS+1)); }

cd "$AQUI/pruebas"
for t in T01 T02 T03 T04 T05 T06 T07; do
  f=$(ls ${t}-*.sql); paso "$t ${f#${t}-}"; psql -X -q -v ON_ERROR_STOP=1 -f "$f" >"$LOG/$t" 2>&1; rc=$?; fin $rc "$LOG/$t"
done
# T06b: conexión REAL como nexit_runtime (no SET ROLE): no es superusuario, no puede elevarse ni crear objetos
paso "T06b conexión real como nexit_runtime"
psql -X -q -c "ALTER ROLE nexit_runtime PASSWORD '$PW'" >"$LOG/T06b" 2>&1
if PGUSER=nexit_runtime PGPASSWORD="$PW" PGOPTIONS= psql -X -Atc "select current_user" 2>>"$LOG/T06b" | grep -q nexit_runtime; then
  (export PGUSER=nexit_runtime PGPASSWORD="$PW" PGOPTIONS=
   [[ "$(psql -X -Atc "select rolsuper::text || rolbypassrls::text from pg_roles where rolname = current_user")" == "falsefalse" ]] && echo "PASS: conexión real sin superusuario ni BYPASSRLS"
   o="$(psql -X -q -c "SET ROLE postgres" 2>&1)"; [[ "$o" == *"permission denied"* ]] && echo "PASS: no puede asumir el rol postgres"
   o="$(psql -X -q -c "CREATE TABLE public.intruso(x int)" 2>&1)"; [[ "$o" == *"permission denied"* ]] && echo "PASS: no puede crear tablas"
   o="$(psql -X -q -c "SELECT demo_reiniciar('demo-modelo')" 2>&1)"; [[ "$o" == *"permission denied"* ]] && echo "PASS: no puede ejecutar demo_reiniciar"
   [[ "$(psql -X -Atc "select count(*) from clientes")" =~ ^[0-9]+$ ]] && echo "PASS: lee clientes") >>"$LOG/T06b" 2>&1
  [[ $(grep -c PASS "$LOG/T06b") -eq 5 ]]; fin $? "$LOG/T06b"
else echo "OMITIDA (el clúster no permite login con contraseña de nexit_runtime)"; fi
# T08: RLS opcional en una COPIA (la base principal no recibe RLS)
paso "T08 rls-opcional (en copia ${DB}_rls)"
psql -X -q -d postgres -c "CREATE DATABASE ${DB}_rls TEMPLATE $DB" >"$LOG/T08" 2>&1 && PGDATABASE="${DB}_rls" psql -X -q -v ON_ERROR_STOP=1 -f T08-rls-opcional.sql >>"$LOG/T08" 2>&1; fin $? "$LOG/T08"

# B1: copia de seguridad y restauración (pg_dump -Fc / pg_restore) en otra base, con comparación fila a fila de conteos
paso "B1 backup + restauración + comparación de conteos"
if command -v pg_dump >/dev/null && command -v pg_restore >/dev/null; then
  pg_dump -Fc -d "$DB" -f "$LOG/respaldo.dump" >"$LOG/B1" 2>&1 && psql -X -q -d postgres -c "CREATE DATABASE ${DB}_rst" >>"$LOG/B1" 2>&1 \
   && pg_restore -d "${DB}_rst" --no-owner "$LOG/respaldo.dump" >>"$LOG/B1" 2>&1
  CONT="select string_agg(format('%s=%s', relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', relname), false, true, '')))[1]::text), ',' order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
  A="$(psql -X -Atc "$CONT" -d "$DB")"; B="$(psql -X -Atc "$CONT" -d "${DB}_rst")"
  RA="$(psql -X -Atc "select demo_resumen('demo-modelo')::text" -d "$DB")"; RB="$(psql -X -Atc "select demo_resumen('demo-modelo')::text" -d "${DB}_rst")"
  if [[ -n "$A" && "$A" == "$B" && "$RA" == "$RB" ]]; then echo "PASS: conteos idénticos en todas las tablas y resumen DEMO igual" >>"$LOG/B1"; fin 0 "$LOG/B1"; else echo "FALLA: la base restaurada difiere" >>"$LOG/B1"; fin 1 "$LOG/B1"; fi
  psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_rst WITH (FORCE)" >/dev/null 2>&1
else echo "OMITIDA (pg_dump/pg_restore no disponibles)"; fi
paso "G1 verificación estática: sin secretos ni credenciales"; "$AQUI/scripts/verificar-sin-secretos.sh" >"$LOG/G1" 2>&1; fin0 $? "$LOG/G1"

if [[ -n "${APP_REPO:-}" ]]; then
  paso "C1 consultas literales de la app vs esquema"; python3 "$AQUI/herramientas/verificar-consultas-app.py" "$APP_REPO" >"$LOG/C1" 2>&1; rc=$?
  if [[ $rc -eq 0 ]]; then echo "OK   ($(head -1 "$LOG/C1" | sed 's/consultas analizadas/analizadas/'))"; else echo "FALLA"; cat "$LOG/C1"; FALLAS=$((FALLAS+1)); fi
  grep "CORRECCION" "$LOG/C1" | sed 's/^/      /'
else echo "C1 consultas literales de la app: OMITIDA (defina APP_REPO)"; fi

echo "------------------------------------------------------------"
echo "verificaciones PASS contadas: $PASS_TOTAL   pruebas con falla: $FALLAS"
exit $([[ $FALLAS -eq 0 ]] && echo 0 || echo 1)
