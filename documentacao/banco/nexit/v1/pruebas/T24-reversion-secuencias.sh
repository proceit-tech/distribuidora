#!/usr/bin/env bash
# T24 — NEX-060 (PRO-131, AUD-PRO131-R02-01): la REVERSIÓN toma sus bloqueos ANTES de comprobar y no puede borrar una secuencia fiscal confirmada por una corrida.
# Trabaja sobre COPIAS descartables (CREATE DATABASE … TEMPLATE) de la base de la batería, porque una reversión exitosa es destructiva para el esquema; la base original no se toca.
#   A) Corrida real: S1 inserta una secuencia NCE y retiene la transacción; la reversión (S2) queda BLOQUEADA; al confirmar S1 la reversión revalida y ABORTA sin borrar la NCE.
#   B) Escenario válido (solo FE, punto activo con secuencia, sin retroceso): la reversión se aplica, el contador legado toma el último número FE y la numeración continúa sin repetir; documentos intactos.
#   C) Punto ACTIVO sin secuencia FE: aborta y el esquema, los contadores y los documentos quedan inalterados.
# Requiere PGDATABASE (migraciones + S-001), nex.pw_prueba (PGOPTIONS) y permiso CREATE DATABASE; ninguna sesión abierta sobre la base plantilla. Datos sintéticos.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REV="$AQUI/scripts/reversion-NEX-060.sql"
T="$(mktemp -d)"; ORIG="$PGDATABASE"
limpiar() { kill $(jobs -p) 2>/dev/null; for x in a b c; do psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${ORIG}_t24$x WITH (FORCE)" >/dev/null 2>&1; done; rm -rf "$T"; }
trap limpiar EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'
H="$(psql -X -Atq -d "$ORIG" -c "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"

crear_copia() { # $1 sufijo, $2 dígito de RUC → deja PGDATABASE apuntando a la copia; define E, U, S
  psql -X -q -d postgres -c "CREATE DATABASE ${ORIG}_t24$1 TEMPLATE $ORIG" >/dev/null || { falla "no se pudo copiar la base"; return 1; }
  export PGDATABASE="${ORIG}_t24$1"
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
