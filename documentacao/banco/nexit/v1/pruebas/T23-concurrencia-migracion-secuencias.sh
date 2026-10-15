#!/usr/bin/env bash
# T23 — NEX-060 (PRO-131, AUD-PRO131-R01-03): la conciliación del contador legado NO copia un valor anterior al commit de una emisión antigua concurrente.
#   S1 simula la emisión del código ANTIGUO: abre una transacción, sube fe_puntos_expedicion.ultimo_numero (130) SIN confirmar y espera un advisory lock K del controlador.
#   S2 ejecuta fe_secuencias_conciliar_legado (lo que hace la migración): debe quedar BLOQUEADA por el LOCK EXCLUSIVE de la tabla de puntos hasta que S1 confirme.
#   Al liberar K, S1 confirma y S2 continúa: la secuencia FE nace en 130 (el valor consolidado), no en 120.
# El trigger de congelamiento (que en una base ya migrada impediría el UPDATE antiguo) se desactiva SOLO en esta base descartable para poder simular la emisión antigua.
# Requiere PGDATABASE (migraciones + S-001) y nex.pw_prueba (PGOPTIONS). Base descartable; datos sintéticos.
set -uo pipefail
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; psql -X -q -c "ALTER TABLE fe_puntos_expedicion ENABLE TRIGGER fe_puntos_expedicion_contador_congelado_trg" >/dev/null 2>&1; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
K=70600002

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t23','Empresa T23 SA (prueba)','8023101','1','admin.t23','Ana','T23',NULL,'$H')")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
Q "alter table fe_puntos_expedicion disable trigger fe_puntos_expedicion_contador_congelado_trg" >/dev/null
P="$(Q "insert into fe_puntos_expedicion (empresa_id,sucursal_id,codigo,nombre,ultimo_numero,activo) values ('$E','$S','001','Legado T23',120,true) returning id" | head -1)"

mkfifo "$T/c.in"
psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 &
CP=$!
exec 9>"$T/c.in"
echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"

( PGAPPNAME="t23s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
update fe_puntos_expedicion set ultimo_numero = 130 where id = '$P';
select pg_advisory_lock($K);
COMMIT;
SQL
) &
P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"

( PGAPPNAME="t23s2" psql -X -Atq -v ON_ERROR_STOP=1 -c "select fe_secuencias_conciliar_legado('$E')" >"$T/s2.out" 2>"$T/s2.err" ) &
P2=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t23s2' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "R01-03: la conciliación quedó BLOQUEADA por la emisión antigua sin confirmar (corrida real)"
else falla "R01-03: la conciliación no esperó a la emisión concurrente"; fi
chk "$(Q "select count(*) from fe_punto_secuencias where punto_id='$P'")" "0" "mientras S1 no confirma, no se copió ningún valor anterior"

echo "select pg_advisory_unlock($K);" >&9
wait "$P1" "$P2"
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" && ! -s "$T/s2.err" ]] && ok "ambas sesiones terminaron sin errores" || falla "errores: $(cat "$T/s1.err" "$T/s2.err")"
chk "$(Q "select ultimo_numero from fe_punto_secuencias where punto_id='$P' and tipo_documento='FE'")" "130" "la secuencia FE nació con el valor CONSOLIDADO (130), no con el anterior (120)"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T23: todo OK"; exit 0; } || { echo "T23: $FALLAS fallas"; exit 1; }
