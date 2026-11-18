#!/usr/bin/env bash
# T34 — NEX-065 (AUD-PRO129-UX-R04): CARRERA REAL entre sesiones PostgreSQL. El estado de emisión es POR TIPO: un cambio de estado del tipo FE retenido en una transacción abierta
#   · NO bloquea la emisión de NCE del MISMO punto (el cambio toma el punto en modo FOR KEY SHARE, compatible con el FOR SHARE de la emisión; tipos independientes, sin deadlock);
#   · SÍ serializa la emisión de FE (misma fila de secuencia): tras confirmarse, esa FE es rechazada con NEX:TIPO_INACTIVO sin consumir número.
# Requiere PGDATABASE (migraciones NEX-001…065 + S-001) y nex.pw_prueba (PGOPTIONS), como el resto de la batería. Base descartable; datos sintéticos. NUNCA sobre la base operativa.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$PGDATABASE" == nexit_test_* ]] || { echo "ABORTADO: T34 solo corre sobre bases efímeras nexit_test_*" >&2; exit 3; }
T="$(mktemp -d)"; trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$T"' EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
esperar() { local n=0; until eval "$1"; do n=$((n+1)); [[ $n -gt 300 ]] && return 1; sleep 0.1; done; }
K=70650001
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'
LINEAS='[{"linea":1,"cantidad":0,"monto":30000}]'

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t34','Empresa T34 SA (prueba)','8034101','1','admin.t34','Ana','T34',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
P="$(Q "select o_punto from fe_punto_alta_tipo('$E','$U','$S','001','Caja T34','FE',NULL,5,true,true)")"
Q "select fe_punto_alta_tipo('$E','$U','$S','001','Caja T34','NCE',NULL,0,true,true)" >/dev/null
FEDATA="$(psql -X -Atq -v ON_ERROR_STOP=1 <<SQL
\i $AQUI/_helpers_nce.sql
select o_id||'|'||o_cdc from pg_temp.fe_aprobada('$E','$U','$S','0000090');
SQL
)"
F1="$(echo "$FEDATA" | sed -n 1p | cut -d'|' -f1)"; C1="$(echo "$FEDATA" | sed -n 1p | cut -d'|' -f2)"
chk "$(Q "select string_agg(tipo_documento||'='||activo||'/'||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=true/5,NCE=true/0" "precondición: FE y NCE activas"

mkfifo "$T/c.in"; psql -X -Atq -v ON_ERROR_STOP=1 <"$T/c.in" >"$T/c.out" 2>&1 & CP=$!
exec 9>"$T/c.in"; echo "select pg_advisory_lock($K);" >&9
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and granted\")\" == 1 ]]" || falla "el controlador no obtuvo el lock"

# S1: desactiva el tipo FE y RETIENE la transacción abierta
( PGAPPNAME="t34s1" psql -X -Atq -v ON_ERROR_STOP=1 >"$T/s1.out" 2>"$T/s1.err" <<SQL
BEGIN;
select fe_secuencia_estado('$E','$U','$P','FE',false);
select pg_advisory_lock($K);
COMMIT;
SQL
) & P1=$!
esperar "[[ \"\$(Q \"select count(*) from pg_locks where locktype='advisory' and objid=$K and not granted\")\" == 1 ]]" || falla "S1 no llegó a la barrera"

# S2: la NCE del MISMO punto emite SIN esperar mientras el cambio de estado de la FE sigue sin confirmar
cat >"$T/n.sql" <<SQL
\i $AQUI/_helpers_nce.sql
select o_numero from fe_documento_crear_nce('$E','$U','$S','$P','clave-t34-nce-1','$F1',3,'$LINEAS'::jsonb,'PYG',30000,pg_temp.nce_payload('$C1',30000));
SQL
if timeout 20 psql -X -Atq -v ON_ERROR_STOP=1 -f "$T/n.sql" >"$T/n.out" 2>"$T/n.err"; then
  ok "la emisión de NCE NO esperó al cambio de estado de la FE retenido por otra sesión (tipos independientes, sin deadlock)"
else falla "la NCE se bloqueó o falló: $(cat "$T/n.err")"; fi
chk "$(cat "$T/n.out")" "0000001" "la NCE recibió su propio número (0000001)"

# S3: la FE del mismo punto SÍ queda serializada por la fila de su secuencia
( PGAPPNAME="t34s3" psql -X -Atq -v ON_ERROR_STOP=1 -c "select o_numero from fe_documento_crear_fe('$E','$U','$S','$P','clave-t34-0001',NULL,'1234567-1','Receptor T34','PYG',1000,'$PAYLOAD'::jsonb)" >"$T/s3.out" 2>"$T/s3.err" ) & P3=$!
if esperar "[[ \"\$(Q \"select count(*) from pg_stat_activity where application_name='t34s3' and wait_event_type='Lock'\")\" == 1 ]]"; then
  ok "la emisión de FE quedó BLOQUEADA por el cambio de estado pendiente de SU tipo (corrida real)"
else falla "la emisión de FE no quedó bloqueada"; fi

echo "select pg_advisory_unlock($K);" >&9
wait "$P1"; wait "$P3"
echo '\q' >&9; exec 9>&-; wait "$CP" 2>/dev/null
[[ ! -s "$T/s1.err" ]] && ok "el cambio de estado confirmó sin errores" || falla "error en el cambio de estado: $(cat "$T/s1.err")"
grep -q "TIPO_INACTIVO" "$T/s3.err" && ok "al confirmarse la desactivación, la FE en espera fue RECHAZADA con NEX:TIPO_INACTIVO" || falla "la FE en espera no fue rechazada por tipo inactivo: $(cat "$T/s3.err") $(cat "$T/s3.out")"
chk "$(Q "select string_agg(tipo_documento||'='||activo||'/'||ultimo_numero, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P'")" "FE=false/5,NCE=true/1" "estado final: FE inactiva sin consumir número; NCE activa con su propio contador"
chk "$(Q "select count(*) from documentos_electronicos where empresa_id='$E' and clave_idempotencia='clave-t34-0001'")" "0" "la FE rechazada no dejó documento"
chk "$(Q "select count(*) from (select tipo, numero, coalesce(serie,'') from documentos_electronicos where empresa_id='$E' group by 1,2,3 having count(*) > 1) x")" "0" "sin identidades fiscales duplicadas"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T34: todo OK"; exit 0; } || { echo "T34: $FALLAS fallas"; exit 1; }
