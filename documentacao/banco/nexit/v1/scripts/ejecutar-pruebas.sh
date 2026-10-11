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

NMIG=$(ls "$AQUI"/migraciones/NEX-0*.sql | wc -l)
paso "M1 migraciones desde cero ($NMIG archivos)"; "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m1" 2>&1; rc=$?
[[ $rc -eq 0 && $(grep -c '^aplicando' "$LOG/m1") -eq $NMIG ]] && { echo "OK   ($NMIG aplicadas)"; } || { echo "FALLA"; tail -5 "$LOG/m1"; FALLAS=$((FALLAS+1)); }
paso "M2 reaplicar es idempotente (0 cambios)"; "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m2" 2>&1; rc=$?
[[ $rc -eq 0 && $(grep -c '^ya aplicada' "$LOG/m2") -eq $NMIG && $(grep -c '^aplicando' "$LOG/m2") -eq 0 ]] && echo "OK   ($NMIG ya aplicadas)" || { echo "FALLA"; tail -5 "$LOG/m2"; FALLAS=$((FALLAS+1)); }
paso "M3 detecta migración editada (checksum)"; mkdir "$LOG/mig"; cp "$AQUI"/migraciones/NEX-0*.sql "$LOG/mig/"; echo "-- editado" >> "$LOG/mig/NEX-005-clientes.sql"
MIGRACIONES_DIR="$LOG/mig" "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m3" 2>&1; rc=$?
[[ $rc -eq 4 ]] && echo "OK   (abortó con código 4)" || { echo "FALLA (rc=$rc)"; FALLAS=$((FALLAS+1)); }
paso "M4 se niega a operar sobre la base 'nexit'"; PGDATABASE=nexit "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m4" 2>&1; rc=$?
[[ $rc -eq 3 ]] && echo "OK   (abortó con código 3)" || { echo "FALLA (rc=$rc)"; FALLAS=$((FALLAS+1)); }

paso "M5 dos ejecuciones simultáneas del runner (base nueva)"; psql -X -q -d postgres -c "CREATE DATABASE ${DB}_m5" >/dev/null 2>&1
( PGDATABASE="${DB}_m5" "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m5a" 2>&1; echo $? >"$LOG/m5a.rc" ) & ( PGDATABASE="${DB}_m5" "$AQUI/scripts/aplicar-migraciones.sh" >"$LOG/m5b" 2>&1; echo $? >"$LOG/m5b.rc" ) & wait
NM5=$(psql -X -Atc "select count(*)||'/'||count(distinct version) from schema_migrations" -d "${DB}_m5")
if [[ "$NM5" == "$NMIG/$NMIG" && ( "$(cat "$LOG/m5a.rc")" == 0 || "$(cat "$LOG/m5b.rc")" == 0 ) ]]; then echo "OK   (resultado consistente: $NM5 versiones, sin duplicados)"; else echo "FALLA ($NM5)"; FALLAS=$((FALLAS+1)); fi
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_m5 WITH (FORCE)" >/dev/null 2>&1
paso "S1 semilla S-001 (catálogos globales) y re-ejecución"; psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >"$LOG/s1" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >>"$LOG/s1" 2>&1; fin0 $? "$LOG/s1"
HASH="$(psql -X -Atc "select crypt('$PW', gen_salt('bf', 12))")"
paso "S2 semilla S-002 (empresa-modelo) y re-ejecución"; psql -X -q -v ON_ERROR_STOP=1 -v usuario_demo=admin -v hash_demo="$HASH" -f "$AQUI/seeds/S-002-empresa-modelo.sql" >"$LOG/s2" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -v usuario_demo=admin -v hash_demo="$HASH" -f "$AQUI/seeds/S-002-empresa-modelo.sql" >>"$LOG/s2" 2>&1 && grep -q "ya existe" "$LOG/s2"; fin0 $? "$LOG/s2"
paso "S3 semilla S-003 (prospecto) sin hash => aborta"; psql -X -q -v codigo_demo=demo-sinhash -f "$AQUI/seeds/S-003-empresa-prospecto.sql" >"$LOG/s3" 2>&1; grep -q "FALTA" "$LOG/s3" && ! psql -X -Atc "select 1 from empresas where codigo='demo-sinhash'" | grep -q 1 && echo "OK" || { echo "FALLA"; FALLAS=$((FALLAS+1)); }

cd "$AQUI/pruebas"
for t in T01 T02 T03 T04 T05 T06 T07 T09 T10 T12 T13 T14 T15; do
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
# T11: concurrencia real (varias sesiones simultáneas)
paso "T11 concurrencia (idempotencia, sobreventa, valor, deadlocks)"
"$AQUI/pruebas/T11-concurrencia.sh" >"$LOG/T11" 2>&1; fin $? "$LOG/T11"
# I1/V1: instalación de una empresa REAL con los scripts de producción (sin contraseña en argumentos ni logs) y validación de la estructura instalada
PWADM="Adm-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"     # contraseña del administrador de prueba (solo en memoria)
if python3 -c 'import bcrypt' 2>/dev/null; then GENERADOR="real (python3 bcrypt)"; unset NEX_PRUEBAS_GENERADOR_HASH
else GENERADOR="simulado con pgcrypto (no hay bcrypt local; en CI se usa el real)"
  printf '#!/usr/bin/env bash\nIFS= read -r PW; [[ ${#PW} -ge 12 ]] || { echo "Contraseña demasiado corta (mínimo 12)." >&2; exit 2; }\necho "select crypt(:'"'"'pw'"'"', gen_salt('"'"'bf'"'"', 12))" | psql -X -Atq -v pw="$PW"\n' >"$LOG/gen-shim.sh"; chmod +x "$LOG/gen-shim.sh"; export NEX_PRUEBAS_GENERADOR_HASH="$LOG/gen-shim.sh"
fi
psql -X -q -d postgres -c "CREATE DATABASE ${DB}_prod" >/dev/null 2>&1
( export PGDATABASE="${DB}_prod"; "$AQUI/scripts/aplicar-migraciones.sh" >/dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >/dev/null 2>&1 )
paso "I1 inicializar-empresa.sh / restablecer-clave.sh (generador: ${GENERADOR%% *})"
( export PGDATABASE="${DB}_prod"
  ID1="$(printf '%s\n' "$PWADM" | "$AQUI/scripts/inicializar-empresa.sh" --codigo emp-real --razon-social "Empresa Real S.A. (prueba)" --ruc 80012345 --dv 6 --usuario admin --nombre Magno --email m@example.invalid 2>&1 | tee "$LOG/I1.a" | sed -n 's/^empresa_id=//p')"
  ID2="$(printf '%s\n' "$PWADM" | "$AQUI/scripts/inicializar-empresa.sh" --codigo emp-real --razon-social "Empresa Real S.A. (prueba)" --ruc 80012345 --dv 6 --usuario admin --nombre Magno 2>&1 | tee "$LOG/I1.b" | sed -n 's/^empresa_id=//p')"
  [[ -n "$ID1" && "$ID1" == "$ID2" ]] && echo "PASS: la inicialización es repetible (mismo id, sin duplicar)"
  [[ "$(psql -X -Atc "select count(*) from usuarios u join empresas e on e.id=u.empresa_id where e.codigo='emp-real'")" == 1 ]] && echo "PASS: un solo administrador tras repetir"
  [[ "$(psql -X -Atc "select password_hash = crypt('$PWADM', password_hash) and password_hash <> '$PWADM' from usuarios u join empresas e on e.id=u.empresa_id where e.codigo='emp-real'")" == t ]] && echo "PASS: la contraseña del administrador valida y solo existe como hash"
  ! grep -q "$PWADM" "$LOG/I1.a" "$LOG/I1.b" && echo "PASS: la contraseña no aparece en la salida/logs de los scripts"
  printf 'corta\n' | "$AQUI/scripts/inicializar-empresa.sh" --codigo emp-x --razon-social "X SA" --ruc 80012346 --dv 1 --usuario admin --nombre Z >/dev/null 2>&1; [[ $? -eq 2 ]] && echo "PASS: contraseña corta rechazada por el script (código 2)"
  PGDATABASE=nexit "$AQUI/scripts/inicializar-empresa.sh" --codigo emp-x --razon-social "X SA" --ruc 80012346 --dv 1 --usuario admin --nombre Z </dev/null >/dev/null 2>&1; [[ $? -eq 3 ]] && echo "PASS: se niega a operar sobre la base 'nexit' sin autorización (código 3)"
  NUEVA="Nueva-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  printf '%s\n' "$NUEVA" | "$AQUI/scripts/restablecer-clave.sh" --empresa emp-real --usuario admin >/dev/null 2>&1
  [[ "$(psql -X -Atc "select password_hash = crypt('$NUEVA', password_hash) and password_hash <> crypt('$PWADM', password_hash) from usuarios u join empresas e on e.id=u.empresa_id where e.codigo='emp-real'")" == t ]] && echo "PASS: restablecer-clave.sh cambia la clave"
) >"$LOG/I1" 2>&1; [[ $(grep -c PASS "$LOG/I1") -eq 7 ]]; fin $? "$LOG/I1"
paso "V1 verificar-instalacion.sh (base de pruebas completa)"; PGDATABASE="$DB" "$AQUI/scripts/verificar-instalacion.sh" >"$LOG/V1" 2>&1; fin $? "$LOG/V1"
paso "V2 verificar-instalacion.sh --produccion (solo empresa real) y detección de DEMO"
( export PGDATABASE="${DB}_prod"
  "$AQUI/scripts/verificar-instalacion.sh" --produccion >"$LOG/V2a" 2>&1; rc1=$?
  psql -X -q -c "select demo_crear_empresa('demo-intruso','Intruso','admin',(select password_hash from usuarios limit 1))" >/dev/null 2>&1
  "$AQUI/scripts/verificar-instalacion.sh" --produccion >"$LOG/V2b" 2>&1; rc2=$?
  [[ $rc1 -eq 0 ]] && echo "PASS: instalación de producción limpia validada"
  [[ $rc2 -ne 0 ]] && grep -q "FALLA: PRODUCCIÓN: no existen empresas DEMO" "$LOG/V2b" && echo "PASS: una empresa DEMO en producción es detectada"
  psql -X -q -c "grant insert on stock_saldos to nexit_runtime" >/dev/null 2>&1; "$AQUI/scripts/verificar-instalacion.sh" >"$LOG/V2c" 2>&1; [[ $? -ne 0 ]] && echo "PASS: una concesión indebida al runtime es detectada"
  MIGRACIONES_DIR="$LOG/mig" "$AQUI/scripts/verificar-instalacion.sh" >"$LOG/V2d" 2>&1; [[ $? -ne 0 ]] && echo "PASS: una migración editada es detectada"
) >"$LOG/V2" 2>&1; [[ $(grep -c PASS "$LOG/V2") -eq 4 ]]; fin $? "$LOG/V2"
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_prod WITH (FORCE)" >/dev/null 2>&1

# T08: RLS opcional en una COPIA (la base principal no recibe RLS)
paso "T08 rls-opcional (en copia ${DB}_rls)"
psql -X -q -d postgres -c "CREATE DATABASE ${DB}_rls TEMPLATE $DB" >"$LOG/T08" 2>&1 && PGDATABASE="${DB}_rls" psql -X -q -v ON_ERROR_STOP=1 -f T08-rls-opcional.sql >>"$LOG/T08" 2>&1; fin $? "$LOG/T08"

# B1: copia de seguridad y restauración (pg_dump -Fc / pg_restore) en otra base, ya con los datos de T01..T11.
#     Compara el CONTENIDO (md5 por tabla), las migraciones registradas, las invariantes (conciliación, kardex) y que nexit_runtime funcione en la base restaurada.
paso "B1 backup + restauración + contenido idéntico + runtime"
if command -v pg_dump >/dev/null && command -v pg_restore >/dev/null; then
  pg_dump -Fc -d "$DB" -f "$LOG/respaldo.dump" >"$LOG/B1" 2>&1 && psql -X -q -d postgres -c "CREATE DATABASE ${DB}_rst" >>"$LOG/B1" 2>&1 \
   && pg_restore -d "${DB}_rst" --no-owner "$LOG/respaldo.dump" >>"$LOG/B1" 2>&1
  TABLAS="$(psql -X -Atc "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1" -d "$DB")"
  DIF=0; NT=0
  for t in $TABLAS; do
    NT=$((NT+1)); h="select count(*)||':'||md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.\"$t\" x"
    [[ "$(psql -X -Atc "$h" -d "$DB")" == "$(psql -X -Atc "$h" -d "${DB}_rst")" ]] || { echo "FALLA: contenido distinto en la tabla $t" >>"$LOG/B1"; DIF=1; }
  done
  [[ $DIF -eq 0 ]] && echo "PASS: contenido idéntico (md5 por tabla) en las $NT tablas" >>"$LOG/B1"
  [[ "$(psql -X -Atc "select string_agg(version||checksum, ',' order by version) from schema_migrations" -d "$DB")" == "$(psql -X -Atc "select string_agg(version||checksum, ',' order by version) from schema_migrations" -d "${DB}_rst")" ]] \
    && echo "PASS: schema_migrations (versiones y checksums) idéntica" >>"$LOG/B1" || echo "FALLA: schema_migrations distinta" >>"$LOG/B1"
  [[ "$(psql -X -Atc "select count(*) from v_conciliacion_costo_stock" -d "${DB}_rst")" == "0" ]] && echo "PASS: la base restaurada concilia saldos y costos (0 diferencias)" >>"$LOG/B1" || echo "FALLA: conciliación distinta de cero tras restaurar" >>"$LOG/B1"
  [[ "$(psql -X -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" -d "$DB")" == "$(psql -X -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" -d "${DB}_rst")" ]] \
    && echo "PASS: mismas funciones y vistas tras restaurar" >>"$LOG/B1" || echo "FALLA: funciones distintas tras restaurar" >>"$LOG/B1"
  o="$(psql -X -Atc "SET ROLE nexit_runtime; select count(*) from v_kardex; select (select count(*) from clientes)>=0" -d "${DB}_rst" 2>&1)"; [[ "$o" != *"denied"* && "$o" != *ERROR* ]] && echo "PASS: nexit_runtime conserva sus privilegios en la base restaurada" >>"$LOG/B1" || echo "FALLA: privilegios del runtime tras restaurar ($o)" >>"$LOG/B1"
  pg_dumpall --globals-only 2>/dev/null | grep -q "nexit_runtime" && echo "PASS: los roles (nexit_runtime) se respaldan aparte con pg_dumpall --globals-only" >>"$LOG/B1"
  psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_rst WITH (FORCE)" >/dev/null 2>&1
  if ! grep -q "FALLA" "$LOG/B1" && [[ $(grep -c PASS "$LOG/B1") -ge 6 ]]; then fin 0 "$LOG/B1"; else fin 1 "$LOG/B1"; fi
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
