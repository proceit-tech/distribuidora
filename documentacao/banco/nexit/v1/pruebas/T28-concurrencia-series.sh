#!/usr/bin/env bash
# T28 — NEX-063: CARRERA REAL entre sesiones PostgreSQL en el PASO DE SERIE (9999999 → AA-0000001) y la independencia de los tipos (CA-PUN-02). Derivada de T22.
#   S1 emite una FE y retiene la transacción (queda con el FOR UPDATE de la secuencia FE) esperando un advisory lock K que sostiene el controlador.
#   S2 intenta otra FE del MISMO punto: debe quedar BLOQUEADA por la secuencia FE (nunca recibir el mismo número).
#   S3 avanza la secuencia NCE del MISMO punto mientras S1 retiene la FE: NO debe bloquearse (tipos independientes, sin deadlock).
#   Con la FE en 9999998: S1 toma 9999999 (sin serie) y S2, tras esperar, toma AA-0000001 (nunca el mismo número, sin reinicio ni salto). NCE avanza sin esperar.
# Requiere PGDATABASE (migraciones + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos.
set -uo pipefail
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
K=70630001
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t28','Empresa T28 SA (prueba)','8028101','1','admin.t28','Ana','T28',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
P="$(Q "select fe_punto_registrar('$E','$U','$S','001','Caja T28')")"
Q "select fe_secuencia_configurar('$E','$U','$P','FE',NULL,9999998,true,true)" >/dev/null
Q "select fe_secuencia_configurar('$E','$U','$P','NCE',NULL,0,true,true)" >/dev/null
EMITIR="select o_numero from fe_documento_crear_fe('$E','$U','$S','$P'"

mkfifo "$T/c.in"
psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 &
CP=$!
exec 9>"$T/c.in"
echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"

( PGAPPNAME="t28s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
$EMITIR,'clave-t28-0001',NULL,'1234567-1','Receptor T28','PYG',1000,'$PAYLOAD'::jsonb);
select pg_advisory_lock($K);
COMMIT;
SQL
) &
P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"

( PGAPPNAME="t28s2" psql -X -Atq -v ON_ERROR_STOP=1 -c "$EMITIR,'clave-t28-0002',NULL,'1234567-1','Receptor T28','PYG',1000,'$PAYLOAD'::jsonb)" >"$T/s2.out" 2>"$T/s2.err" ) &
P2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t28s2' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "CA-02: la segunda emisión FE quedó BLOQUEADA por la secuencia FE retenida por la primera (corrida real)"
else falla "CA-02: la segunda emisión FE no quedó bloqueada"; fi

# S3: la secuencia NCE del mismo punto se avanza SIN esperar mientras la FE sigue retenida
if timeout 20 psql -X -Atq -v ON_ERROR_STOP=1 -c "update fe_punto_secuencias set ultimo_numero = 1, actualizado_at = now() where empresa_id='$E' and punto_id='$P' and tipo_documento='NCE'" >"$T/s3.out" 2>"$T/s3.err"; then
  ok "CA-06: avanzar la secuencia NCE del mismo punto NO esperó a la FE (tipos independientes, sin deadlock)"
else falla "CA-06: la secuencia NCE se bloqueó o falló: $(cat "$T/s3.err")"; fi
chk "$(Q "select count(*) from pg_stat_activity where application_name='t28s2' and wait_event_type='Lock'")" "1" "CA-06: la segunda FE sigue esperando su propia secuencia (la NCE no la liberó)"

echo "select pg_advisory_unlock($K);" >&9
wait "$P1" "$P2"
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" && ! -s "$T/s2.err" ]] && ok "las dos emisiones confirmaron sin errores" || falla "errores: $(cat "$T/s1.err" "$T/s2.err")"
chk "$(cat "$T/s2.out")" "0000001" "la emisión que esperaba recibió el SIGUIENTE número: 0000001 de la serie AA"
chk "$(Q "select numero||'/'||coalesce(serie,'-') from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t28-0001'")" "9999999/-" "la primera emisión conservó 9999999 sin serie"
chk "$(Q "select numero||'/'||coalesce(serie,'-') from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t28-0002'")" "0000001/AA" "la segunda emisión quedó en AA-0000001"
chk "$(Q "select count(*) from (select numero, coalesce(serie,'') from documentos_electronicos where empresa_id='$E' and tipo='FE' group by 1,2 having count(*) > 1) x")" "0" "sin numeraciones duplicadas"
chk "$(Q "select string_agg(tipo_documento||'='||coalesce(serie,'-')||'/'||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=AA/1,NCE=-/1" "secuencias finales: FE=AA/1 y NCE=-/1, independientes"

# ── Fase 2 (AUD-NEX063-R01-04): la NCE reserva por SU flujo fiscal (fe_documento_crear_nce) en la frontera 9999999 → AA-0000001, también bajo concurrencia, sin interferir con la FE ──
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K2=70630002
Q "select fe_secuencia_configurar('$E','$U','$P','NCE',NULL,9999999,true,true)" >/dev/null
FEDATA="$(psql -X -Atq -v ON_ERROR_STOP=1 <<SQL
\i $AQUI/_helpers_nce.sql
select o_id||'|'||o_cdc from pg_temp.fe_aprobada('$E','$U','$S','0000090');
select o_id||'|'||o_cdc from pg_temp.fe_aprobada('$E','$U','$S','0000091');
SQL
)"
F1="$(echo "$FEDATA" | sed -n 1p | cut -d'|' -f1)"; C1="$(echo "$FEDATA" | sed -n 1p | cut -d'|' -f2)"
F2="$(echo "$FEDATA" | sed -n 2p | cut -d'|' -f1)"; C2="$(echo "$FEDATA" | sed -n 2p | cut -d'|' -f2)"
LINEAS='[{"linea":1,"cantidad":0,"monto":30000}]'
cat >"$T/n1.sql" <<SQL
\i $AQUI/_helpers_nce.sql
BEGIN;
select o_numero from fe_documento_crear_nce('$E','$U','$S','$P','clave-t28-nce-1','$F1',3,'$LINEAS'::jsonb,'PYG',30000,pg_temp.nce_payload('$C1',30000));
select pg_advisory_lock($K2);
COMMIT;
SQL
cat >"$T/n2.sql" <<SQL
\i $AQUI/_helpers_nce.sql
select o_numero from fe_documento_crear_nce('$E','$U','$S','$P','clave-t28-nce-2','$F2',3,'$LINEAS'::jsonb,'PYG',30000,pg_temp.nce_payload('$C2',30000));
SQL
mkfifo "$T/c2.in"
psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c2.in" >"$T/c2.out" 2>&1 &
CP2=$!
exec 8>"$T/c2.in"
echo "select pg_advisory_lock($K2);" >&8
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K2 and granted\")\" == 1 ]]" || falla "el controlador de la fase 2 no obtuvo el lock"
( PGAPPNAME="t28n1" psql -X -Atq -v ON_ERROR_STOP=1 -f "$T/n1.sql" >"$T/n1.out" 2>"$T/n1.err" ) &
PN1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K2 and not granted\")\" == 1 ]]" || falla "la NCE 1 no llegó a la barrera"
( PGAPPNAME="t28n2" psql -X -Atq -v ON_ERROR_STOP=1 -f "$T/n2.sql" >"$T/n2.out" 2>"$T/n2.err" ) &
PN2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t28n2' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "NCE: la segunda emisión NCE quedó BLOQUEADA por la secuencia NCE retenida por la primera (corrida real)"
else falla "NCE: la segunda emisión NCE no quedó bloqueada"; fi
# una FE del MISMO punto NO espera a la NCE (tipos independientes)
if timeout 20 psql -X -Atq -v ON_ERROR_STOP=1 -c "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t28-0003',NULL,'1234567-1','Receptor T28','PYG',1000,'$PAYLOAD'::jsonb)" >"$T/fe3.out" 2>"$T/fe3.err"; then
  ok "NCE: una FE del mismo punto NO esperó a la NCE retenida (tipos independientes, sin deadlock)"
else falla "NCE: la FE se bloqueó o falló: $(cat "$T/fe3.err")"; fi
echo "select pg_advisory_unlock($K2);" >&8
wait "$PN1" "$PN2"
echo '\q' >&8; exec 8>&-; wait "$CP2" 2>/dev/null
[[ ! -s "$T/n1.err" && ! -s "$T/n2.err" ]] && ok "NCE: las dos emisiones confirmaron sin errores" || falla "NCE: errores: $(cat "$T/n1.err" "$T/n2.err")"
chk "$(Q "select numero||'/'||coalesce(serie,'-') from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t28-nce-1'")" "0000001/AA" "NCE: la primera NCE pasó de 9999999 sin serie a AA-0000001"
chk "$(Q "select numero||'/'||coalesce(serie,'-') from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t28-nce-2'")" "0000002/AA" "NCE: la que esperaba recibió AA-0000002 (distinta, sin salto)"
chk "$(Q "select numero||'/'||coalesce(serie,'-') from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t28-0003'")" "0000002/AA" "NCE: la FE concurrente continuó su propia serie (AA-0000002)"
chk "$(Q "select count(*) from (select tipo, numero, coalesce(serie,'') from documentos_electronicos where empresa_id='$E' group by 1,2,3 having count(*) > 1) x")" "0" "NCE: sin numeraciones duplicadas por tipo"
chk "$(Q "select string_agg(tipo_documento||'='||coalesce(serie,'-')||'/'||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=AA/2,NCE=AA/2" "NCE: secuencias finales FE=AA/2 y NCE=AA/2, independientes"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T28: todo OK"; exit 0; } || { echo "T28: $FALLAS fallas"; exit 1; }
