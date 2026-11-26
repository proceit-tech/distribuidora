#!/usr/bin/env bash
# T24 — NEX-060 (PRO-131, AUD-PRO131-R02-01): la REVERSIÓN toma sus bloqueos ANTES de comprobar y no puede borrar una secuencia fiscal confirmada por una corrida.
# Trabaja sobre COPIAS descartables (CREATE DATABASE … TEMPLATE), porque una reversión exitosa es destructiva para el esquema.
# AISLAMIENTO (PRO-130-R02): la reversión aborta si existe CUALQUIER secuencia no FE en la base, y la base de la batería ya tiene NCE de otras pruebas (p. ej. T22). Por eso T24 NO copia la base
# de la batería: construye su PROPIA base (${PGDATABASE}_t24base) con EXACTAMENTE las migraciones NEX-001…060 (MIGRACIONES_DIR) + S-001, verifica versiones y checksums aplicados, y de ella saca
# una copia por escenario; antes de inyectar el estado propio de cada escenario verifica la precondición GLOBAL (ninguna secuencia de otro tipo en toda la copia).
#   A) Corrida real: S1 inserta una secuencia NCE y retiene la transacción; la reversión (S2) queda BLOQUEADA; al confirmar S1 la reversión revalida y ABORTA sin borrar la NCE.
#   B) Escenario válido (solo FE, punto activo con secuencia, sin retroceso): la reversión se aplica, el contador legado toma el último número FE y la numeración continúa sin repetir; documentos intactos.
#   C) Punto ACTIVO sin secuencia FE: aborta y el esquema, los contadores y los documentos quedan inalterados.
# Requiere PGDATABASE (base de la batería, solo para derivar nombres), nex.pw_prueba (PGOPTIONS), NEX_BOOTSTRAP_ANTES_DE_019 (lo exporta el runner) y permiso CREATE DATABASE. Datos sintéticos.
# NUNCA sobre la base operativa: el nombre debe ser nexit_test_* y se niega a correr si no lo es.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REV="$AQUI/scripts/reversion-NEX-060.sql"
T="$(mktemp -d)"; ORIG="$PGDATABASE"; BASE="${ORIG}_t24base"
[[ "$ORIG" == nexit_test_* ]] || { echo "ABORTADO: T24 solo corre sobre bases efímeras nexit_test_*" >&2; exit 3; }
limpiar() { kill $(jobs -p) 2>/dev/null; for x in a b c base; do psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${ORIG}_t24$x WITH (FORCE)" >/dev/null 2>&1; done; rm -rf "$T"; }
trap limpiar EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'

# ── Base propia con EXACTAMENTE NEX-001…060 + S-001 ──
mkdir -p "$T/mig"
for f in "$AQUI"/migraciones/NEX-0*.sql; do b="$(basename "$f")"; n="${b#NEX-}"; n="${n%%-*}"; (( 10#$n <= 60 )) && cp "$f" "$T/mig/"; done
[[ "$(ls "$T"/mig/NEX-0*.sql | wc -l)" == 60 && -f "$(ls "$T"/mig/NEX-060-*.sql)" ]] || { echo "FALLA: el conjunto de migraciones de T24 no es exactamente NEX-001…060"; exit 1; }
psql -X -q -d postgres -c "CREATE DATABASE $BASE" >/dev/null 2>&1 || { echo "FALLA: no se pudo crear la base propia $BASE"; exit 1; }
if PGDATABASE="$BASE" MIGRACIONES_DIR="$T/mig" "$AQUI/scripts/aplicar-migraciones.sh" >"$T/mig.out" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" -f "$AQUI/seeds/S-001-catalogos-globales.sql" >"$T/seed.out" 2>&1; then
  ok "base propia de T24 creada con NEX-001…060 y la semilla S-001 (independiente de la base de la batería)"
else echo "FALLA: no se pudo preparar la base propia de T24: $(tail -3 "$T/mig.out" "$T/seed.out" 2>/dev/null)"; exit 1; fi
ESPERADO="$(for f in "$T"/mig/NEX-0*.sql; do b="$(basename "$f" .sql)"; echo "${b%%-*}-$(echo "$b" | cut -d- -f2) $(sha256sum "$f" | cut -d' ' -f1)"; done | LC_ALL=C sort)"
APLICADO="$(psql -X -Atq -d "$BASE" -c "select version||' '||checksum from schema_migrations" | LC_ALL=C sort)"
[[ "$ESPERADO" == "$APLICADO" ]] && ok "la base propia tiene registradas exactamente NEX-001…060 con los checksums de los archivos" || { echo "FALLA: schema_migrations de $BASE no coincide con NEX-001…060"; exit 1; }
H="$(psql -X -Atq -d "$BASE" -c "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"

crear_copia() { # $1 sufijo, $2 dígito de RUC → deja PGDATABASE apuntando a la copia; define E, U, S
  psql -X -q -d postgres -c "CREATE DATABASE ${ORIG}_t24$1 TEMPLATE $BASE" >/dev/null || { falla "no se pudo copiar la base propia (escenario $1): preparación abortada"; exit 1; }
  export PGDATABASE="${ORIG}_t24$1"
  # Precondición GLOBAL antes de inyectar el escenario: ninguna secuencia de otro tipo en toda la copia (la reversión aborta por cualquiera)
  local otros; otros="$(Q "select count(*) from fe_punto_secuencias where tipo_documento <> 'FE'")"
  if [[ "$otros" == "0" ]]; then ok "precondición $1: la copia no tiene secuencias de otros tipos antes del escenario (esperado=0)"
  else falla "precondición $1: la copia tiene secuencias de otros tipos (obtenido=$otros, esperado=0): preparación abortada"; exit 1; fi
  E="$(Q "select nex_inicializar_empresa('emp-t24$1','Empresa T24$1 SA (prueba)','802410$2','1','admin.t24$1','Ana','T24',NULL,'$H')")"
  U="$(Q "select id from usuarios where empresa_id='$E'")"
  S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
  Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
}

# ── A) corrida real ─────────────────────────────────────────────────────────────────────────────────────────────
crear_copia a 1
P="$(Q "select fe_punto_crear('$E','$U','$S','001','Caja A',10,true)")"
Q "select fe_punto_activar('$E','$U','$P',10,true)" >/dev/null
K=70600024
mkfifo "$T/c.in"; psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 & CP=$!
exec 9>"$T/c.in"; echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"
( PGAPPNAME="t24s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
insert into fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) values ('$E','$P','NCE',0,'CARGA_MANUAL');
select pg_advisory_lock($K);
COMMIT;
SQL
) & P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"
( PGAPPNAME="t24r" psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/r.out" 2>"$T/r.err" ) & P2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t24r' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "A: la reversión quedó BLOQUEADA por la inserción de la secuencia NCE sin confirmar (corrida real)"
else falla "A: la reversión no esperó a la sesión concurrente"; fi
echo "select pg_advisory_unlock($K);" >&9
wait "$P1"; wait "$P2"; RC=$?
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" ]] && ok "A: la sesión concurrente confirmó la NCE sin errores" || falla "A: error en la sesión concurrente: $(cat "$T/s1.err")"
[[ $RC -ne 0 ]] && grep -q "otros tipos" "$T/r.err" && ok "A: la reversión REVALIDÓ tras obtener los bloqueos y ABORTÓ por la secuencia NCE confirmada" || falla "A: la reversión no abortó por la NCE (rc=$RC): $(cat "$T/r.err")"
chk "$(Q "select string_agg(tipo_documento||'='||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=10,NCE=0" "A: la secuencia NCE confirmada NO se borró y FE quedó intacta"
chk "$(Q "select (to_regclass('public.fe_punto_secuencias') is not null)::text || '/' || (select count(*) from pg_trigger where tgname='fe_puntos_expedicion_contador_congelado_trg')")" "true/1" "A: el esquema NEX-060 quedó íntegro (tabla y trigger de congelamiento)"

# ── B) escenario válido ────────────────────────────────────────────────────────────────────────────────────────
crear_copia b 2
P="$(Q "select fe_punto_crear('$E','$U','$S','001','Caja B',10,true)")"
Q "select fe_punto_activar('$E','$U','$P',10,true)" >/dev/null
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t24-0001',NULL,'1234567-1','Receptor T24','PYG',1000,'$PAYLOAD'::jsonb)")" "0000011" "B: primera FE 0000011"
ANTES="$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")"
if psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/rb.out" 2>"$T/rb.err"; then ok "B: la reversión válida (solo FE, punto con secuencia, sin retroceso) se aplicó"; else falla "B: la reversión válida falló: $(cat "$T/rb.err")"; fi
chk "$(Q "select coalesce(to_regclass('public.fe_punto_secuencias')::text,'sin tabla')")" "sin tabla" "B: la tabla de secuencias se eliminó"
chk "$(Q "select ultimo_numero from fe_puntos_expedicion where id='$P'")" "11" "B: el contador legado tomó el último número FE (11)"
chk "$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")" "$ANTES" "B: los documentos (número, CDC, estados) quedaron idénticos"
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t24-0002',NULL,'1234567-1','Receptor T24','PYG',1000,'$PAYLOAD'::jsonb)")" "0000012" "B: la numeración continúa en 0000012 sin repetir (función de NEX-048 restaurada)"
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t24-0001',NULL,'1234567-1','Receptor T24','PYG',1000,'$PAYLOAD'::jsonb)")" "0000011" "B: la idempotencia se conserva (misma clave → mismo número)"

# ── C) punto activo sin secuencia FE ───────────────────────────────────────────────────────────────────────────
crear_copia c 3
Q "insert into fe_puntos_expedicion (empresa_id,sucursal_id,codigo,nombre,ultimo_numero,activo) values ('$E','$S','001','Manual C',0,true)" >/dev/null
if psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/rc.out" 2>"$T/rc.err"; then falla "C: la reversión debió abortar"; else grep -q "ACTIVOS sin secuencia FE" "$T/rc.err" && ok "C: aborta por el punto ACTIVO sin secuencia FE" || falla "C: abortó por otro motivo: $(cat "$T/rc.err")"; fi
chk "$(Q "select (to_regclass('public.fe_punto_secuencias') is not null)::text || '/' || (select count(*) from pg_trigger where tgname='fe_puntos_expedicion_contador_congelado_trg') || '/' || (select ultimo_numero from fe_puntos_expedicion where empresa_id='$E')")" "true/1/0" "C: esquema, trigger y contadores inalterados tras el aborto"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T24: todo OK"; exit 0; } || { echo "T24: $FALLAS fallas"; exit 1; }
