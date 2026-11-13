#!/usr/bin/env bash
# T17 — NEX-054 (FAT-E2-R01-02): CARRERA REAL entre dos sesiones PostgreSQL que consultan el MISMO documento con respuestas distintas.
# Sincronización determinista (sin sleep como única barrera):
#   1) un controlador toma un advisory lock G;
#   2) la sesión S1 abre una transacción, ejecuta fe_documento_registrar_consulta (queda con la fila bloqueada FOR UPDATE) y espera el lock G antes de confirmar;
#   3) se espera (consultando pg_locks) a que S1 esté detenida en G; entonces arranca S2 con la otra respuesta;
#   4) se espera (consultando pg_stat_activity) a que S2 esté BLOQUEADA por el bloqueo de la fila de S1;
#   5) el controlador libera G: S1 confirma y solo entonces S2 puede continuar y ve el estado ya confirmado.
# Requiere PGDATABASE (migraciones + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos.
set -uo pipefail
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
# Espera (con tope) a que el comando devuelva éxito.
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t17','Empresa T17 SA (prueba)','8017101','1','admin.t17','Ana','T17',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
cdc() { echo "01800000056001002${1}1202610141123456789""0"; }

crear_doc() { # numero estado_sifen cdc|NULL
  local c="NULL"; [[ "$3" != NULL ]] && c="'$3'"
  local local_="ENVIADO"; [[ "$2" == SIN_CONSULTA ]] && local_="PENDIENTE_ENVIO"
  Q "insert into documentos_electronicos (empresa_id,sucursal_id,tipo,establecimiento,punto_expedicion,numero,cdc,fecha_emision,receptor_nombre,moneda,total,estado_local,estado_sifen,creado_por)
     values ('$E','$S','FE','001','002','$1',$c,now(),'Receptor sintético T17','PYG',1000,'$local_','$2','$U') returning id"
}
llamada() { # doc estado_gateway estado_sifen cdc|NULL
  local c="NULL"; [[ "$4" != NULL ]] && c="'$4'"
  echo "select fe_documento_registrar_consulta('$E','$U','$1','OK',200,'req-t17','$2','$3',$c,'0260','msg','2026-10-14 10:00:00','2026-10-14 10:00:05','{\"t\":\"t17\"}'::jsonb)"
}

carrera() { # n numero estado_inicial  gw1 sifen1 cdc1  gw2 sifen2 cdc2  esperado_r1 esperado_r2 esperado_final esperado_historial
  local n="$1" num="$2" ini="$3" K=$((70540000 + $1)) D r1 r2
  D="$(crear_doc "$num" "$ini" "$([[ "$ini" == APROBADO || "$ini" == CANCELADO ]] && cdc "$num" || echo NULL)")"
  local c1="$6" c2="$9"; [[ "$c1" == CDC ]] && c1="$(cdc "$num")"; [[ "$c2" == CDC ]] && c2="$(cdc "$num")"
  mkfifo "$T/c$n.in"
  psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c$n.in" >"$T/c$n.out" 2>&1 &
  local CP=$!
  exec 9>"$T/c$n.in"
  echo "select pg_advisory_lock($K);" >&9
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || { falla "carrera $n: el controlador no obtuvo el lock"; exec 9>&-; return; }
  ( PGAPPNAME="t17s1_$n" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.$n.out" 2>"$T/s1.$n.err" <<SQL
BEGIN;
$(llamada "$D" "$4" "$5" "$c1");
select pg_advisory_lock($K);
COMMIT;
SQL
  ) &
  local P1=$!
  esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || { falla "carrera $n: S1 no llegó a la barrera"; exec 9>&-; return; }
  ( PGAPPNAME="t17s2_$n" psql -X -Atq -v ON_ERROR_STOP=1 -c "$(llamada "$D" "$7" "$8" "$c2")" >"$T/s2.$n.out" 2>"$T/s2.$n.err" ) &
  local P2=$!
  if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t17s2_$n' and wait_event_type='Lock'\")\" == 1 ]]"; then
    ok "carrera $n ($num): S2 quedó BLOQUEADA por el FOR UPDATE de S1 antes de que S1 confirmara (corrida real)"
  else falla "carrera $n: S2 no quedó bloqueada por la fila"; fi
  chk "$(Q "select estado_sifen from documentos_electronicos where id='$D'")" "$ini" "carrera $n: antes de confirmar S1 el estado confirmado sigue siendo el inicial"
  echo "select pg_advisory_unlock($K);" >&9
  wait "$P1" "$P2"
  echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
  r1="$(head -1 "$T/s1.$n.out")"; r2="$(head -1 "$T/s2.$n.out")"
  chk "$r1" "${10}" "carrera $n ($num): resultado de la sesión que confirma primero"
  chk "$r2" "${11}" "carrera $n ($num): resultado de la sesión que esperaba el bloqueo"
  chk "$(Q "select estado_sifen||'/'||coalesce(cdc,'-') from documentos_electronicos where id='$D'")" "${12}/$([[ "${12}" == SIN_CONSULTA || "${12}" == PENDIENTE ]] && echo - || cdc "$num")" "carrera $n ($num): estado final y CDC (la contradicción no regresa ni cambia un estado final)"
  chk "$(Q "select string_agg(resultado||':'||coalesce(estado_sifen,'-'), ',' order by creado_at, id) from documento_electronico_intentos where documento_id='$D' and tipo='CONSULTA'")" "${13}" "carrera $n ($num): ambas consultas quedan en el historial (la contradictoria como RESPUESTA_INVALIDA)"
  [[ ! -s "$T/s1.$n.err" && ! -s "$T/s2.$n.err" ]] && ok "carrera $n ($num): sin errores de sesión (sin deadlock ni excepción)" || falla "carrera $n: errores de sesión: $(cat "$T/s1.$n.err" "$T/s2.$n.err")"
}

#        n  numero    inicial     gw1        sifen1     cdc1  gw2         sifen2      cdc2  r1  r2  final  historial
carrera 1 0170001 PENDIENTE   Aprobado   APROBADO   CDC   Pendiente   PENDIENTE   NULL  OK  RESPUESTA_INVALIDA  APROBADO   "OK:APROBADO,RESPUESTA_INVALIDA:-"
carrera 2 0170002 PENDIENTE   Pendiente  PENDIENTE  NULL  Aprobado    APROBADO    CDC   OK  OK                  APROBADO   "OK:PENDIENTE,OK:APROBADO"
carrera 3 0170003 PENDIENTE   Aprobado   APROBADO   CDC   Rechazado   RECHAZADO   CDC   OK  RESPUESTA_INVALIDA  APROBADO   "OK:APROBADO,RESPUESTA_INVALIDA:-"
carrera 4 0170004 PENDIENTE   Rechazado  RECHAZADO  CDC   Aprobado    APROBADO    CDC   OK  RESPUESTA_INVALIDA  RECHAZADO  "OK:RECHAZADO,RESPUESTA_INVALIDA:-"
carrera 5 0170005 APROBADO    Cancelado  CANCELADO  CDC   Aprobado    APROBADO    CDC   OK  RESPUESTA_INVALIDA  CANCELADO  "OK:CANCELADO,RESPUESTA_INVALIDA:-"
carrera 6 0170006 APROBADO    Aprobado   APROBADO   CDC   Pendiente   PENDIENTE   NULL  OK  RESPUESTA_INVALIDA  APROBADO   "OK:APROBADO,RESPUESTA_INVALIDA:-"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T17: todo OK"; exit 0; } || { echo "T17: $FALLAS fallas"; exit 1; }
