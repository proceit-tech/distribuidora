#!/usr/bin/env bash
# T22 — NEX-060 (PRO-131): CARRERA REAL entre sesiones PostgreSQL sobre las secuencias por tipo (T-F06 y T-F07 de AUD-FISC-2026-10-15).
#   S1 emite una FE y retiene la transacción (queda con el FOR UPDATE de la secuencia FE) esperando un advisory lock K que sostiene el controlador.
#   S2 intenta otra FE del MISMO punto: debe quedar BLOQUEADA por la secuencia FE (nunca recibir el mismo número).
#   S3 avanza la secuencia NCE del MISMO punto mientras S1 retiene la FE: NO debe bloquearse (tipos independientes, sin deadlock).
#   Al liberar K: S1 confirma, S2 continúa. Resultado: FE 0000011 y 0000012 (distintos), NCE 1, sin duplicados.
# Requiere PGDATABASE (migraciones + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos.
set -uo pipefail
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
K=70600001
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t22','Empresa T22 SA (prueba)','8022101','1','admin.t22','Ana','T22',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
P="$(Q "select fe_punto_crear('$E','$U','$S','001','Caja T22',10,true)")"
Q "select fe_punto_activar('$E','$U','$P',10,true)" >/dev/null
Q "insert into fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) values ('$E','$P','NCE',0,'CARGA_MANUAL')" >/dev/null
EMITIR="select o_numero from fe_documento_crear_fe('$E','$U','$S','$P'"

mkfifo "$T/c.in"
psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 &
CP=$!
exec 9>"$T/c.in"
echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"

( PGAPPNAME="t22s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
$EMITIR,'clave-t22-0001',NULL,'1234567-1','Receptor T22','PYG',1000,'$PAYLOAD'::jsonb);
select pg_advisory_lock($K);
COMMIT;
SQL
) &
P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"

( PGAPPNAME="t22s2" psql -X -Atq -v ON_ERROR_STOP=1 -c "$EMITIR,'clave-t22-0002',NULL,'1234567-1','Receptor T22','PYG',1000,'$PAYLOAD'::jsonb)" >"$T/s2.out" 2>"$T/s2.err" ) &
P2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t22s2' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "T-F06: la segunda emisión FE quedó BLOQUEADA por la secuencia FE retenida por la primera (corrida real)"
else falla "T-F06: la segunda emisión FE no quedó bloqueada"; fi

# S3: la secuencia NCE del mismo punto se avanza SIN esperar mientras la FE sigue retenida
if timeout 20 psql -X -Atq -v ON_ERROR_STOP=1 -c "update fe_punto_secuencias set ultimo_numero = 1, actualizado_at = now() where empresa_id='$E' and punto_id='$P' and tipo_documento='NCE'" >"$T/s3.out" 2>"$T/s3.err"; then
  ok "T-F07: avanzar la secuencia NCE del mismo punto NO esperó a la FE (tipos independientes, sin deadlock)"
else falla "T-F07: la secuencia NCE se bloqueó o falló: $(cat "$T/s3.err")"; fi
chk "$(Q "select count(*) from pg_stat_activity where application_name='t22s2' and wait_event_type='Lock'")" "1" "T-F07: la segunda FE sigue esperando su propia secuencia (la NCE no la liberó)"

echo "select pg_advisory_unlock($K);" >&9
wait "$P1" "$P2"
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" && ! -s "$T/s2.err" ]] && ok "las dos emisiones confirmaron sin errores" || falla "errores: $(cat "$T/s1.err" "$T/s2.err")"
chk "$(cat "$T/s2.out")" "0000012" "la emisión que esperaba recibió el SIGUIENTE número (0000012)"
chk "$(Q "select numero from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t22-0001'")" "0000011" "la primera emisión conservó 0000011"
chk "$(Q "select count(*) from (select numero from documentos_electronicos where empresa_id='$E' and tipo='FE' group by numero having count(*) > 1) x")" "0" "sin números duplicados"
chk "$(Q "select string_agg(tipo_documento||'='||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=12,NCE=1" "secuencias finales: FE=12 y NCE=1, independientes"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T22: todo OK"; exit 0; } || { echo "T22: $FALLAS fallas"; exit 1; }
