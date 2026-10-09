#!/usr/bin/env bash
# T11 — Concurrencia real: varias sesiones PostgreSQL simultáneas contra la misma base (de pruebas).
# Requiere PGDATABASE (base con migraciones y S-001) y la variable de sesión nex.pw_prueba (PGOPTIONS), como el resto de la batería.
set -uo pipefail
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t11','Empresa T11 SA (prueba)','8099999','9','admin','Admin','T11',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
D1="$(Q "select id from depositos where empresa_id='$E' and codigo='DEP-PRINCIPAL'")"
S1="$(Q "select sucursal_id from depositos where id='$D1'")"
Q "insert into depositos (empresa_id,sucursal_id,codigo,nombre) values ('$E','$S1','DEP-2','Segundo')" >/dev/null
D2="$(Q "select id from depositos where empresa_id='$E' and codigo='DEP-2'")"
for c in P1 P2 P3; do Q "insert into productos (empresa_id,codigo,descripcion,descripcion_factura,unidad_medida_id) values ('$E','$c','Producto $c','Producto $c',(select id from unidades_medida where codigo='UN'))" >/dev/null; done
P1="$(Q "select id from productos where empresa_id='$E' and codigo='P1'")"; P2="$(Q "select id from productos where empresa_id='$E' and codigo='P2'")"; P3="$(Q "select id from productos where empresa_id='$E' and codigo='P3'")"
mov() { # tipo origen dep_o dep_d lineas_json clave
  local o="${3:-NULL}" d="${4:-NULL}"; [[ "$o" != NULL ]] && o="'$o'"; [[ "$d" != NULL ]] && d="'$d'"; local k="${6:+'$6'}"; k="${k:-NULL}"
  echo "select o_numero||'|'||o_repetido from inventario_registrar_movimiento('$E','$U','$1','$2',NULL,$o,$d,'$5'::jsonb,$k)"
}
linea() { echo "{\"producto_id\":\"$1\",\"cantidad\":$2${3:+,\"costo_unitario\":$3}}"; }
lanzar() { # n  nombre  sql_generador(i)
  local n=$1 nombre=$2 gen=$3 i
  for i in $(seq 1 "$n"); do ( psql -X -Atq -c "$($gen "$i")" >"$T/$nombre.$i.out" 2>"$T/$nombre.$i.err"; echo $? >"$T/$nombre.$i.rc" ) & done
  wait
}
cuenta_ok()   { local n=0 f; for f in "$T/$1".*.rc; do [[ "$(cat "$f")" == 0 ]] && n=$((n+1)); done; echo "$n"; }
cuenta_err()  { local n=0 f; for f in "$T/$1".*.err; do grep -q "$2" "$f" && n=$((n+1)); done; echo "$n"; }

# ---------- 1) Idempotencia en carrera: 12 sesiones, MISMA clave y misma solicitud ----------
g1() { mov ENTRADA COMPRA "" "$D1" "[$(linea "$P1" 10 100)]" "clave-carrera-0001"; }
lanzar 12 idem g1
chk "$(cuenta_ok idem)" 12 "idempotencia en carrera: las 12 sesiones terminan sin error"
chk "$(Q "select count(*) from movimientos_inventario where empresa_id='$E' and clave_idempotencia='clave-carrera-0001'")" 1 "idempotencia en carrera: exactamente 1 movimiento creado"
chk "$(cat "$T"/idem.*.out | grep -c '|false$')" 1 "idempotencia en carrera: 1 respuesta 'nuevo'"
chk "$(cat "$T"/idem.*.out | grep -c '|true$')" 11 "idempotencia en carrera: 11 respuestas 'repetido'"
chk "$(cat "$T"/idem.*.out | sed 's/|.*//' | sort -u | wc -l | tr -d ' ')" 1 "idempotencia en carrera: todas devuelven el mismo número de movimiento"
chk "$(Q "select cantidad_valorizada||'/'||valor_total from inventario_costos where empresa_id='$E' and producto_id='$P1' and deposito_id='$D1'")" "10.0000/1000.0000" "idempotencia en carrera: el stock entró UNA sola vez (10 u / 1000)"

# ---------- 2) Sobreventa: 10 u disponibles, 25 sesiones piden 1 u cada una (claves distintas) ----------
g2() { mov SALIDA VENTA "$D1" "" "[$(linea "$P1" 1)]" "clave-venta-$1-xxxx"; }
lanzar 25 venta g2
chk "$(cuenta_ok venta)" 10 "sobreventa: exactamente 10 ventas aceptadas (el stock alcanza para 10)"
chk "$(cuenta_err venta 'saldo disponible insuficiente')" 15 "sobreventa: 15 rechazadas por saldo insuficiente"
chk "$(Q "select coalesce(sum(cantidad),0) from stock_saldos where empresa_id='$E' and producto_id='$P1' and deposito_id='$D1'")" "0.0000" "sobreventa: el saldo final es 0 (nunca negativo)"
chk "$(Q "select cantidad_valorizada||'/'||valor_total from inventario_costos where empresa_id='$E' and producto_id='$P1' and deposito_id='$D1'")" "0.0000/0.0000" "sobreventa: el valor queda en 0 exacto"
chk "$(Q "select sum(costo_total) from movimiento_lineas l join movimientos_inventario m on m.id=l.movimiento_id and m.empresa_id=l.empresa_id where l.empresa_id='$E' and m.tipo_movimiento='SALIDA'")" "1000.0000" "sobreventa: el costo congelado de las 10 salidas suma exactamente 1000"

# ---------- 3) Conservación del valor con entradas y salidas simultáneas ----------
Q "select inventario_registrar_movimiento('$E','$U','ENTRADA','ABERTURA',NULL,NULL,'$D1','[$(linea "$P2" 20 77.7777)]'::jsonb)" >/dev/null
g3() { if (( $1 % 3 == 0 )); then mov SALIDA MANUAL "$D1" "" "[$(linea "$P2" 2)]" "clave-mixta-$1-xxxx"; else mov ENTRADA COMPRA "" "$D1" "[$(linea "$P2" 1 "$((100 + $1)).1234")]" "clave-mixta-$1-xxxx"; fi; }
lanzar 30 mixta g3
chk "$(cuenta_ok mixta)" 30 "mixto: 30 operaciones simultáneas (20 entradas + 10 salidas) sin errores"
chk "$(Q "select (select valor_total from inventario_costos where empresa_id='$E' and producto_id='$P2' and deposito_id='$D1') = (select sum(case when m.tipo_movimiento in ('ENTRADA') then l.costo_total else -l.costo_total end) from movimiento_lineas l join movimientos_inventario m on m.empresa_id=l.empresa_id and m.id=l.movimiento_id where l.empresa_id='$E' and l.producto_id='$P2')")" t "mixto: valor final = suma de entradas − suma de costos congelados de salidas (conservación exacta)"
chk "$(Q "select cantidad_valorizada from inventario_costos where empresa_id='$E' and producto_id='$P2' and deposito_id='$D1'")" "20.0000" "mixto: cantidad final = 20 (apertura) + 20 entradas − 10 salidas × 2 u = 20"
chk "$(Q "select count(*) from v_conciliacion_costo_stock where empresa_id='$E'")" 0 "mixto: conciliación saldo/costo sin diferencias"
chk "$(Q "select count(*) from stock_saldos where empresa_id='$E' and cantidad < 0")" 0 "mixto: ningún saldo negativo"

# ---------- 4) Numeración correlativa sin duplicados ni huecos bajo concurrencia ----------
chk "$(Q "select count(*)||'/'||count(distinct numero_movimiento)||'/'||max(substring(numero_movimiento from 5)::int) from movimientos_inventario where empresa_id='$E'")" "$(Q "select count(*)||'/'||count(*)||'/'||count(*) from movimientos_inventario where empresa_id='$E'")" "numeración: sin duplicados ni huecos (MOV-000001..N correlativos)"

# ---------- 5) Anulación simultánea del mismo movimiento ----------
M="$(Q "select o_movimiento_id from inventario_registrar_movimiento('$E','$U','ENTRADA','COMPRA',NULL,NULL,'$D2','[$(linea "$P3" 5 10)]'::jsonb)")"
g5() { echo "select * from inventario_anular_movimiento('$E','$U','$M','Anulación concurrente $1 prueba')"; }
lanzar 6 anula g5
chk "$(cuenta_ok anula)" 1 "anulación simultánea: solo 1 de 6 sesiones anula"
chk "$(cuenta_err anula 'ya fue anulado')" 5 "anulación simultánea: las otras 5 reciben 'ya fue anulado'"
chk "$(Q "select count(*) from movimientos_inventario where empresa_id='$E' and anula_a_id='$M'")" 1 "anulación simultánea: un único movimiento inverso"
chk "$(Q "select coalesce(sum(cantidad),0) from stock_saldos where empresa_id='$E' and producto_id='$P3'")" "0.0000" "anulación simultánea: el stock vuelve a 0"

# ---------- 6) Interbloqueos: transferencias cruzadas en sentidos opuestos con productos en orden inverso ----------
Q "select inventario_registrar_movimiento('$E','$U','ENTRADA','ABERTURA',NULL,NULL,'$D1','[$(linea "$P1" 50 10),$(linea "$P2" 50 20)]'::jsonb)" >/dev/null
Q "select inventario_registrar_movimiento('$E','$U','ENTRADA','ABERTURA',NULL,NULL,'$D2','[$(linea "$P1" 50 10),$(linea "$P2" 50 20)]'::jsonb)" >/dev/null
g6() { if (( $1 % 2 == 0 )); then mov TRANSFERENCIA TRANSFERENCIA "$D1" "$D2" "[$(linea "$P1" 1),$(linea "$P2" 1)]"; else mov TRANSFERENCIA TRANSFERENCIA "$D2" "$D1" "[$(linea "$P2" 1),$(linea "$P1" 1)]"; fi; }
lanzar 24 cruz g6
chk "$(cuenta_ok cruz)" 24 "interbloqueo: 24 transferencias cruzadas simultáneas terminan todas bien"
chk "$(cuenta_err cruz 'deadlock')" 0 "interbloqueo: ningún 'deadlock detected'"
chk "$(Q "select count(*) from v_conciliacion_costo_stock where empresa_id='$E'")" 0 "interbloqueo: conciliación saldo/costo sin diferencias"
chk "$(Q "select sum(valor_total) from inventario_costos where empresa_id='$E' and producto_id='$P1' and deposito_id in ('$D1','$D2')")" "1000.0000" "interbloqueo: el valor total de P1 entre los dos depósitos se conserva (100 u × 10)"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && echo "T11 concurrencia: todo OK" || { echo "T11 concurrencia: $FALLAS fallas"; exit 1; }
