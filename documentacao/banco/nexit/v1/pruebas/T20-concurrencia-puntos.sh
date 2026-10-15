#!/usr/bin/env bash
# T20 — NEX-057 (AUD-PRO129-R01-01): CARRERA REAL entre dos sesiones PostgreSQL que intentan dar de alta / activar puntos con la MISMA identidad fiscal (empresa + establecimiento + código)
# en dos sucursales distintas. Sincronización determinista (sin sleep como única barrera), igual que T17:
#   1) un controlador toma un advisory lock K;
#   2) la sesión S1 abre una transacción, ejecuta la función (queda con el lock de identidad tomado) y espera K antes de confirmar;
#   3) se espera (pg_locks) a que S1 esté detenida en K; entonces arranca S2 con la OTRA sucursal y la MISMA identidad;
#   4) se espera (pg_stat_activity) a que S2 esté BLOQUEADA por el lock de identidad de S1;
#   5) el controlador libera K: S1 confirma y solo entonces S2 continúa, ve el estado ya confirmado y debe ser RECHAZADA (NEX:IDENTIDAD_FISCAL_DUPLICADA).
# Requiere PGDATABASE (migraciones + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos.
set -uo pipefail
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t20','Empresa T20 SA (prueba)','8020101','1','admin.t20','Ana','T20',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S1="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='019' where id='$S1'" >/dev/null
S2="$(Q "insert into sucursales (empresa_id, codigo, nombre, establecimiento_sifen) values ('$E','S2-T20','Sucursal 2 T20','019') returning id" | head -1)"

# carrera N K  "SQL de S1"  "SQL de S2"
carrera() {
  local n="$1" K="$2" sql1="$3" sql2="$4"
  mkfifo "$T/c$n.in"
  psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c$n.in" >"$T/c$n.out" 2>&1 &
  local CP=$!
  exec 9>"$T/c$n.in"
  echo "select pg_advisory_lock($K);" >&9
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || { falla "carrera $n: el controlador no obtuvo el lock"; exec 9>&-; return; }
  ( PGAPPNAME="t20s1_$n" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.$n.out" 2>"$T/s1.$n.err" <<SQL
BEGIN;
$sql1;
select pg_advisory_lock($K);
COMMIT;
SQL
  ) &
  local P1=$!
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || { falla "carrera $n: S1 no llegó a la barrera"; exec 9>&-; return; }
  ( PGAPPNAME="t20s2_$n" psql -X -Atq -v ON_ERROR_STOP=1 -c "$sql2" >"$T/s2.$n.out" 2>"$T/s2.$n.err" ) &
  local P2=$!
  if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t20s2_$n' and wait_event_type='Lock'\")\" == 1 ]]"; then
    ok "carrera $n: S2 quedó BLOQUEADA por el lock de identidad de S1 antes de que S1 confirmara (corrida real)"
  else falla "carrera $n: S2 no quedó bloqueada por el lock de identidad"; fi
  echo "select pg_advisory_unlock($K);" >&9
  wait "$P1" "$P2"
  echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
  [[ ! -s "$T/s1.$n.err" ]] && ok "carrera $n: la sesión que llegó primero confirmó sin errores" || falla "carrera $n: error en S1: $(cat "$T/s1.$n.err")"
  grep -q "IDENTIDAD_FISCAL_DUPLICADA" "$T/s2.$n.err" && ok "carrera $n: la sesión que esperaba fue RECHAZADA con NEX:IDENTIDAD_FISCAL_DUPLICADA" || falla "carrera $n: S2 no fue rechazada por identidad duplicada: $(cat "$T/s2.$n.err")"
}

# 1) Altas concurrentes del mismo establecimiento y código en dos sucursales
carrera 1 70570001 "select fe_punto_crear('$E','$U','$S1','001','Caja S1',10,true)" "select fe_punto_crear('$E','$U','$S2','001','Caja S2',10,true)"
chk "$(Q "select count(*) from fe_puntos_expedicion where empresa_id='$E' and codigo='001'")" "1" "altas concurrentes: existe UN solo punto con la identidad (019, 001)"
chk "$(Q "select sucursal_id from fe_puntos_expedicion where empresa_id='$E' and codigo='001'")" "$S1" "altas concurrentes: el que confirmó primero es el que quedó"

# 2) Activaciones concurrentes de dos duplicados legados (cargados a mano, inactivos)
P1="$(Q "insert into fe_puntos_expedicion (empresa_id,sucursal_id,codigo,nombre,ultimo_numero,activo) values ('$E','$S1','002','Legado S1',0,false) returning id" | head -1)"
P2="$(Q "insert into fe_puntos_expedicion (empresa_id,sucursal_id,codigo,nombre,ultimo_numero,activo) values ('$E','$S2','002','Legado S2',0,false) returning id" | head -1)"
carrera 2 70570002 "select fe_punto_activar('$E','$U','$P1',0,true)" "select fe_punto_activar('$E','$U','$P2',0,true)"
chk "$(Q "select count(*) from fe_puntos_expedicion where empresa_id='$E' and codigo='002' and activo")" "1" "activaciones concurrentes: queda UN solo punto activo con la identidad (019, 002)"
chk "$(Q "select activo from fe_puntos_expedicion where id='$P1'")" "t" "activaciones concurrentes: quedó activo el que confirmó primero"
chk "$(Q "select ultimo_numero from fe_puntos_expedicion where id='$P2'")" "0" "activaciones concurrentes: el rechazado conserva su numeración"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T20: todo OK"; exit 0; } || { echo "T20: $FALLAS fallas"; exit 1; }
