#!/usr/bin/env bash
# T29 — NEX-063 (AUD-NEX063-R01-01/02): la REVERSIÓN tiene sintaxis válida y toma sus bloqueos ANTES de comprobar, de modo que una emisión concurrente que ya pasó a la serie AA no puede quedar
# oculta por una comprobación obsoleta. Trabaja sobre COPIAS descartables (CREATE DATABASE … TEMPLATE) de la base de la batería (con NEX-001…063): una reversión exitosa es destructiva para el esquema.
#   A) Corrida real: S1 emite una FE en la frontera 9999999 → AA-0000001 y retiene la transacción; la reversión (S2) queda BLOQUEADA; al confirmar S1 revalida y ABORTA sin tocar series ni documentos.
#   B) Escenario válido (sin series, tipos activos): la reversión se aplica (prueba la sintaxis), restaura FE/NCE de NEX-060/062, documentos idénticos y la numeración continúa sin repetir.
#   C) Tipo desactivado: aborta sin cambios.
# Requiere PGDATABASE (migraciones + S-001), nex.pw_prueba (PGOPTIONS) y permiso CREATE DATABASE; ninguna sesión abierta sobre la base plantilla. Datos sintéticos. NUNCA sobre la base operativa.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REV="$AQUI/scripts/reversion-NEX-063.sql"
T="$(mktemp -d)"; ORIG="$PGDATABASE"
limpiar() { kill $(jobs -p) 2>/dev/null; for x in a b c; do psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${ORIG}_t29$x WITH (FORCE)" >/dev/null 2>&1; done; rm -rf "$T"; }
trap limpiar EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'
H="$(psql -X -Atq -d "$ORIG" -c "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"

crear_copia() { # $1 sufijo, $2 dígito de RUC → deja PGDATABASE apuntando a la copia; define E, U, S, P (punto 001 con FE y NCE activos)
  psql -X -q -d postgres -c "CREATE DATABASE ${ORIG}_t29$1 TEMPLATE $ORIG" >/dev/null || { falla "no se pudo copiar la base"; return 1; }
  export PGDATABASE="${ORIG}_t29$1"
  E="$(Q "select nex_inicializar_empresa('emp-t29$1','Empresa T29$1 SA (prueba)','802910$2','1','admin.t29$1','Ana','T29',NULL,'$H')")"
  U="$(Q "select id from usuarios where empresa_id='$E'")"
  S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
  Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
  P="$(Q "select fe_punto_registrar('$E','$U','$S','001','Caja T29$1')")"
  Q "select fe_secuencia_configurar('$E','$U','$P','FE',NULL,${3:-10},true,true)" >/dev/null
  Q "select fe_secuencia_configurar('$E','$U','$P','NCE',NULL,0,true,true)" >/dev/null
  Q "select fe_punto_estado('$E','$U','$P',true)" >/dev/null
}

# ── A) corrida real en la frontera de serie ───────────────────────────────────────────────────
crear_copia a 1 9999999
K=70630029
mkfifo "$T/c.in"; psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 & CP=$!
exec 9>"$T/c.in"; echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"
( PGAPPNAME="t29s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t29-0001',NULL,'1234567-1','Receptor T29','PYG',1000,'$PAYLOAD'::jsonb);
select pg_advisory_lock($K);
COMMIT;
SQL
) & P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"
( PGAPPNAME="t29r" psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/r.out" 2>"$T/r.err" ) & P2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t29r' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "A: la reversión quedó BLOQUEADA por la emisión FE que pasó a la serie AA y aún no confirmó (corrida real)"
else falla "A: la reversión no esperó a la sesión concurrente"; fi
echo "select pg_advisory_unlock($K);" >&9
wait "$P1"; wait "$P2"; RC=$?
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" ]] && ok "A: la emisión concurrente confirmó sin errores" || falla "A: error en la emisión concurrente: $(cat "$T/s1.err")"
[[ $RC -ne 0 ]] && grep -q "REVERSIÓN ABORTADA" "$T/r.err" && ok "A: la reversión REVALIDÓ tras obtener los bloqueos y ABORTÓ (hay serie AA)" || falla "A: la reversión no abortó (rc=$RC): $(cat "$T/r.err")"
chk "$(Q "select coalesce(serie,'-')||'/'||ultimo_numero from fe_punto_secuencias where punto_id='$P' and tipo_documento='FE'")" "AA/1" "A: la serie y el número reservados NO se perdieron"
chk "$(Q "select coalesce(serie,'-')||'/'||numero from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t29-0001'")" "AA/0000001" "A: el documento AA-0000001 quedó íntegro"
chk "$(Q "select (exists (select 1 from information_schema.columns where table_name='fe_punto_secuencias' and column_name='serie'))::text")" "true" "A: el esquema NEX-063 sigue instalado (la reversión no cambió nada)"

# ── B) escenario válido: sintaxis y restauración ────────────────────────────────────────────────
crear_copia b 2 10
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t29-0002',NULL,'1234567-1','Receptor T29','PYG',1000,'$PAYLOAD'::jsonb)")" "0000011" "B: primera FE 0000011"
ANTES="$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")"
if psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/rb.out" 2>"$T/rb.err"; then ok "B: la reversión válida (sin series, tipos activos) se aplicó: la sintaxis del script es correcta"; else falla "B: la reversión válida falló: $(cat "$T/rb.err")"; fi
chk "$(Q "select (exists (select 1 from information_schema.columns where table_name='fe_punto_secuencias' and column_name in ('serie','activo')))::text")" "false" "B: las columnas serie y activo se eliminaron"
chk "$(Q "select coalesce(to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)')::text,'sin función')")" "sin función" "B: las funciones nuevas se eliminaron"
chk "$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")" "$ANTES" "B: los documentos (número, serie, CDC, estados) quedaron idénticos"
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t29-0003',NULL,'1234567-1','Receptor T29','PYG',1000,'$PAYLOAD'::jsonb)")" "0000012" "B: la FE restaurada (NEX-060) continúa en 0000012 sin repetir"
chk "$(Q "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t29-0002',NULL,'1234567-1','Receptor T29','PYG',1000,'$PAYLOAD'::jsonb)")" "0000011" "B: la idempotencia se conserva (misma clave → mismo documento)"

# ── C) tipo desactivado ────────────────────────────────────────────────────────────────────────
crear_copia c 3 10
Q "select fe_secuencia_estado('$E','$U','$P','NCE',false)" >/dev/null
if psql -X -q -v ON_ERROR_STOP=1 -1 -f "$REV" >"$T/rc.out" 2>"$T/rc.err"; then falla "C: la reversión debió abortar"; else grep -q "tipos desactivados" "$T/rc.err" && ok "C: aborta por el tipo desactivado" || falla "C: abortó por otra causa: $(cat "$T/rc.err")"; fi
chk "$(Q "select (exists (select 1 from information_schema.columns where table_name='fe_punto_secuencias' and column_name='activo'))::text || '/' || (select count(*) from fe_punto_secuencias where punto_id='$P')")" "true/2" "C: el esquema y las secuencias quedaron inalterados"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T29: todo OK"; exit 0; } || { echo "T29: $FALLAS fallas"; exit 1; }
