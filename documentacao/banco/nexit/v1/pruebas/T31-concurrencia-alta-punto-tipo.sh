#!/usr/bin/env bash
# T31 — NEX-064 (AUD-PRO129-UX-R01-01): CARRERA REAL entre sesiones PostgreSQL en el alta fiscal única punto + tipo (P5 de la auditoría).
#   Fase 1: S1 da de alta 001-001 con FE y retiene la transacción (queda con el lock de identidad); S2 da de alta 001-001 con NCE: debe quedar BLOQUEADA y, al confirmar S1, REUTILIZAR el punto
#           (un solo punto físico, dos configuraciones independientes, sin corrupción).
#   Fase 2: S1 da de alta 001-002 con FE y retiene; S2 intenta el MISMO tipo: bloqueada y luego rechazada con NEX:TIPO_DUPLICADO sin alterar la FE de S1.
# Requiere PGDATABASE (migraciones NEX-001…064 + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos. NUNCA sobre la base operativa.
set -uo pipefail
# PRO-130-R02: guarda de base descartable (como T24/T29/T33/T34): NUNCA sobre la base operativa
[[ "${PGDATABASE:-}" == nexit_test_* ]] || { echo "ABORTADO: T31 solo corre sobre bases efímeras nexit_test_*" >&2; exit 3; }
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t31','Empresa T31 SA (prueba)','8031101','1','admin.t31','Ana','T31',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null || { echo "ABORTADO: T31 no pudo configurar el establecimiento de la sucursal" >&2; exit 1; }
# PRO-130-R03: un fallo de preparación (psql/consulta) es fallo de la prueba, nunca se continúa con identificadores vacíos
[[ -n "$H" && -n "$E" && -n "$U" && -n "$S" ]] || { echo "ABORTADO: T31 falló la preparación (empresa/usuario/sucursal sintéticos)" >&2; exit 1; }
RC1=""; RC2=""

# $1 = clave del lock de barrera, $2 = código del punto, $3 = tipo de S1, $4 = tipo de S2, $5 = prefijo de los archivos
carrera() {
  local K="$1" COD="$2" T1="$3" T2="$4" N="$5"
  mkfifo "$T/$N.c.in"
  psql -X -Atq -v ON_ERROR_STOP=1 <"$T/$N.c.in" >"$T/$N.c.out" 2>&1 &
  local CP=$!
  exec 9>"$T/$N.c.in"
  echo "select pg_advisory_lock($K);" >&9
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "$N: el controlador no obtuvo el lock"
  ( PGAPPNAME="t31${N}s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/$N.s1.out" 2>"$T/$N.s1.err" <<SQL
BEGIN;
select o_punto||'|'||o_punto_creado from fe_punto_alta_tipo('$E','$U','$S','$COD','Caja $COD','$T1',NULL,10,true,true);
select pg_advisory_lock($K);
COMMIT;
SQL
  ) &
  local P1=$!
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "$N: S1 no llegó a la barrera"
  # PRO-130-R03: S2 con VERBOSITY verbose y mensajes del cliente en C para leer el SQLSTATE y el DETAIL exactos del error
  ( LC_ALL=C PGAPPNAME="t31${N}s2" psql -X -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "select o_punto||'|'||o_punto_creado from fe_punto_alta_tipo('$E','$U','$S','$COD','Otro nombre','$T2',NULL,0,true,true)" >"$T/$N.s2.out" 2>"$T/$N.s2.err" ) &
  local P2=$!
  if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t31${N}s2' and wait_event_type='Lock'\")\" == 1 ]]"; then
    ok "$N: S2 (alta de otro/mismo tipo del mismo punto) quedó BLOQUEADA por el alta retenida de S1 (corrida real)"
  else falla "$N: S2 no quedó bloqueada"; fi
  echo "select pg_advisory_unlock($K);" >&9
  # PRO-130-R03: códigos de salida reales de cada sesión
  wait "$P1"; RC1=$?; wait "$P2"; RC2=$?
  echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
}

# ── Fase 1: tipos distintos del mismo punto ────────────────────────────────────────────────
carrera 70640001 001 FE NCE f1
chk "$RC1/$RC2" "0/0" "fase 1: S1 y S2 terminaron con código de salida 0"
[[ ! -s "$T/f1.s1.err" && ! -s "$T/f1.s2.err" ]] && ok "fase 1: las dos altas confirmaron sin errores" || falla "fase 1: errores: $(cat "$T/f1.s1.err" "$T/f1.s2.err")"
chk "$(Q "select count(*) from fe_puntos_expedicion where empresa_id='$E' and sucursal_id='$S' and codigo='001'")" "1" "fase 1: UN solo punto físico 001-001 (sin duplicación)"
chk "$(Q "select string_agg(s.tipo_documento||'='||s.ultimo_numero||'/'||s.activo::text, ',' order by s.tipo_documento) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where p.empresa_id='$E' and p.sucursal_id='$S' and p.codigo='001'")" "FE=10/true,NCE=0/true" "fase 1: FE y NCE con configuraciones independientes"
chk "$(cut -d'|' -f2 "$T/f1.s1.out")/$(cut -d'|' -f2 "$T/f1.s2.out")" "true/false" "fase 1: S1 creó el punto y S2 lo reutilizó"
chk "$(Q "select p.nombre from fe_puntos_expedicion p where p.empresa_id='$E' and p.sucursal_id='$S' and p.codigo='001'")" "Caja 001" "fase 1: el nombre administrativo del punto no cambió"

# ── Fase 2: el mismo tipo ─────────────────────────────────────────────────────────────────
carrera 70640002 002 FE FE f2
chk "$RC1" "0" "fase 2: S1 terminó con código de salida 0"
[[ "$RC2" =~ ^[0-9]+$ && "$RC2" -ne 0 ]] && ok "fase 2: S2 terminó con código de salida distinto de cero ($RC2)" || falla "fase 2: S2 debió fallar (código de salida=$RC2)"
[[ ! -s "$T/f2.s1.err" ]] && ok "fase 2: la primera alta confirmó sin errores" || falla "fase 2: error en S1: $(cat "$T/f2.s1.err")"
# PRO-130-R03: se exige el SQLSTATE P0001 y el DETAIL exacto NEX:TIPO_DUPLICADO; el texto del mensaje NO sustituye al detalle
grep -q '^ERROR:  P0001: ' "$T/f2.s2.err" && ok "fase 2: S2 rechazada con SQLSTATE P0001" || falla "fase 2: S2 sin SQLSTATE P0001: $(cat "$T/f2.s2.err")"
grep -qx 'DETAIL:  NEX:TIPO_DUPLICADO' "$T/f2.s2.err" && ok "fase 2: la segunda alta del MISMO tipo fue rechazada con DETAIL exacto NEX:TIPO_DUPLICADO" || falla "fase 2: S2 no trae DETAIL NEX:TIPO_DUPLICADO: $(cat "$T/f2.s2.err")"
[[ ! -s "$T/f2.s2.out" ]] && ok "fase 2: S2 no devolvió ningún punto" || falla "fase 2: S2 devolvió resultado: $(cat "$T/f2.s2.out")"
chk "$(Q "select count(*) from fe_puntos_expedicion p where p.empresa_id='$E' and p.sucursal_id='$S' and p.codigo='002'")" "1" "fase 2: UN solo punto físico 002"
chk "$(Q "select count(*)||'/'||max(s.ultimo_numero) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where p.empresa_id='$E' and p.sucursal_id='$S' and p.codigo='002'")" "1/10" "fase 2: una sola configuración FE, con el último número de S1 (10) sin reiniciar"
chk "$(Q "select string_agg(s.tipo_documento||'/'||s.activo::text, ',' order by s.tipo_documento) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where p.empresa_id='$E' and p.sucursal_id='$S' and p.codigo='002'")" "FE/true" "fase 2: la única configuración es del tipo FE (la de S1)"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T31: todo OK"; exit 0; } || { echo "T31: $FALLAS fallas"; exit 1; }
