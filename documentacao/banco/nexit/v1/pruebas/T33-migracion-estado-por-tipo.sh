#!/usr/bin/env bash
# T33 — NEX-065 (AUD-PRO129-UX-R04): la MIGRACIÓN convierte el estado compartido en estado por tipo SIN reactivar nada y sin tocar series, contadores ni documentos.
# Construye su PROPIA base (${PGDATABASE}_t33base) con las migraciones NEX-001…064 (MIGRACIONES_DIR sin la 065) + S-001, arma cuatro puntos con estados distintos bajo la regla ANTERIOR
# (emite solo si punto activo Y tipo activo), registra los estados efectivos y aplica NEX-065 con el runner real:
#   001: punto INACTIVO con FE y NCE activas   → bloqueados por el punto  → tras NEX-065 FE y NCE siguen BLOQUEADAS (tipo inactivo)
#   002: punto activo, FE activa, NCE inactiva → FE emite, NCE bloqueada  → igual después
#   003: punto activo, FE y NCE activas        → ambas emiten             → igual después (FE en serie AA)
#   004: punto activo, FE inactiva, NCE activa → FE bloqueada, NCE emite  → igual después
# Después: ninguna activación automática, snapshot fe_estado_previo_nex065 exacto, series/contadores/documentos idénticos (md5), la activación posterior del tipo es independiente y la reversión
# (reversion-NEX-065.sql) restaura el estado efectivo anterior sin reactivar nada. Base descartable; datos sintéticos. NUNCA sobre la base operativa (exige nexit_test_*).
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIG="$PGDATABASE"; BASE="${ORIG}_t33base"
[[ "$ORIG" == nexit_test_* ]] || { echo "ABORTADO: T33 solo corre sobre bases efímeras nexit_test_*" >&2; exit 3; }
T="$(mktemp -d)"
limpiar() { kill $(jobs -p) 2>/dev/null; export PGDATABASE="$ORIG"; psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" >/dev/null 2>&1; rm -rf "$T"; }
trap limpiar EXIT
FALLAS=0
ok()   { echo "PASS: $1"; }
falla(){ echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
chk()  { if [[ "$1" == "$2" ]]; then ok "$3 (esperado=$2)"; else falla "$3 (obtenido=$1, esperado=$2)"; fi; }
Q()    { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
PAYLOAD='{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'

# ── Base propia con NEX-001…064 ──
mkdir -p "$T/mig"; for f in "$AQUI"/migraciones/NEX-0*.sql; do [[ "$(basename "$f")" == NEX-065-* ]] || cp "$f" "$T/mig/"; done
psql -X -q -d postgres -c "CREATE DATABASE $BASE" >/dev/null 2>&1 || { echo "FALLA: no se pudo crear la base $BASE"; exit 1; }
export PGDATABASE="$BASE"
if MIGRACIONES_DIR="$T/mig" "$AQUI/scripts/aplicar-migraciones.sh" >"$T/mig.out" 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -f "$AQUI/seeds/S-001-catalogos-globales.sql" >"$T/seed.out" 2>&1; then
  ok "base propia creada con NEX-001…064 y la semilla (sin NEX-065)"
else falla "no se pudo preparar la base: $(tail -3 "$T/mig.out" "$T/seed.out" 2>/dev/null)"; exit 1; fi
chk "$(Q "select coalesce(to_regclass('public.fe_estado_previo_nex065')::text,'ausente')")" "ausente" "NEX-065 todavía no está aplicada"

H="$(Q "select crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12))")"
E="$(Q "select nex_inicializar_empresa('emp-t33','Empresa T33 SA (prueba)','8033101','1','admin.t33','Ana','T33',NULL,'$H')")"
U="$(Q "select id from usuarios where empresa_id='$E'")"
S="$(Q "select id from sucursales where empresa_id='$E' order by creado_at, id limit 1")"
Q "update sucursales set establecimiento_sifen='001' where id='$S'" >/dev/null
mkpunto() { # $1 código → id del punto con FE y NCE configuradas y activas bajo la regla anterior
  local p; p="$(Q "select fe_punto_registrar('$E','$U','$S','$1','Caja $1')")"
  Q "select fe_secuencia_configurar('$E','$U','$p','FE',NULL,${2:-0},true,true)" >/dev/null
  Q "select fe_secuencia_configurar('$E','$U','$p','NCE',NULL,${3:-0},true,true)" >/dev/null
  echo "$p"
}
P1="$(mkpunto 001 10 20)"; P2="$(mkpunto 002 30 40)"; P3="$(mkpunto 003 9999999 60)"; P4="$(mkpunto 004 70 80)"
Q "select fe_punto_estado('$E','$U','$P1',false)" >/dev/null                 # 001: punto inactivo (tipos activos)
Q "select fe_secuencia_estado('$E','$U','$P2','NCE',false)" >/dev/null        # 002: NCE inactiva
Q "select fe_secuencia_estado('$E','$U','$P4','FE',false)" >/dev/null         # 004: FE inactiva
emitir() { # $1 punto → imprime «número/serie» o «BLOQUEADA:<código>»
  local o; o="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "select o_numero from fe_documento_crear_fe('$E','$U','$S','$1','clave-t33-$2',NULL,'1234567-1','Receptor T33','PYG',1000,'$PAYLOAD'::jsonb)" 2>&1)" && echo "OK" || { echo "$o" | grep -o 'NEX:[A-Z_]*' | head -1 | sed 's/^/BLOQUEADA:/'; }
}
# Estado EFECTIVO anterior (punto activo Y tipo activo) por punto y tipo
efectivo() { Q "select string_agg(p.codigo||':'||s.tipo_documento||'='||(p.activo and s.activo)::text, ',' order by p.codigo, s.tipo_documento) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where s.empresa_id='$E'"; }
EF_ANTES="$(efectivo)"
chk "$EF_ANTES" "001:FE=false,001:NCE=false,002:FE=true,002:NCE=false,003:FE=true,003:NCE=true,004:FE=false,004:NCE=true" "estado efectivo ANTERIOR por punto y tipo (regla heredada: punto Y tipo)"
# Emisión previa para tener documentos y contadores reales
chk "$(emitir "$P2" a)" "OK" "antes: 002 FE emite"
chk "$(emitir "$P3" b)" "OK" "antes: 003 FE emite en la frontera (9999999 sin serie → AA-0000001)"
chk "$(emitir "$P1" c)" "BLOQUEADA:NEX:PUNTO_INVALIDO" "antes: 001 bloqueada por el punto inactivo (regla heredada)"
SEC_ANTES="$(Q "select md5(string_agg(punto_id::text||tipo_documento||coalesce(serie,'-')||ultimo_numero::text, '|' order by punto_id, tipo_documento)) from fe_punto_secuencias where empresa_id='$E'")"
DOC_ANTES="$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")"
PFIS_ANTES="$(Q "select string_agg(codigo||'='||activo::text, ',' order by codigo) from fe_puntos_expedicion where empresa_id='$E'")"

# ── Aplicación de NEX-065 con el runner real ──
if "$AQUI/scripts/aplicar-migraciones.sh" >"$T/m65.out" 2>&1 && grep -q "aplicando     NEX-065" "$T/m65.out"; then ok "NEX-065 aplicada por el runner (única migración pendiente)"; else falla "no se aplicó NEX-065: $(tail -5 "$T/m65.out")"; exit 1; fi
chk "$(efectivo)" "$(Q "select string_agg(p.codigo||':'||s.tipo_documento||'='||s.activo::text, ',' order by p.codigo, s.tipo_documento) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where s.empresa_id='$E'")" "el estado efectivo posterior coincide con la bandera del TIPO (ya no hay segunda llave)"
chk "$(Q "select string_agg(p.codigo||':'||s.tipo_documento||'='||s.activo::text, ',' order by p.codigo, s.tipo_documento) from fe_punto_secuencias s join fe_puntos_expedicion p on p.id=s.punto_id and p.empresa_id=s.empresa_id where s.empresa_id='$E'")" "001:FE=false,001:NCE=false,002:FE=true,002:NCE=false,003:FE=true,003:NCE=true,004:FE=false,004:NCE=true" "los tipos bloqueados antes siguen bloqueados y NADA se activó automáticamente (001 FE/NCE, 002 NCE, 004 FE)"
chk "$(Q "select count(*) from fe_punto_secuencias s join fe_estado_previo_nex065 v on v.empresa_id=s.empresa_id and v.punto_id=s.punto_id and v.tipo_documento=s.tipo_documento where s.activo and not v.efectivo_previo")" "0" "ningún tipo quedó activo sin haberlo estado de forma efectiva antes de la migración"
chk "$(Q "select count(*) from fe_estado_previo_nex065 where empresa_id='$E'")" "8" "el snapshot conserva las 8 configuraciones (4 puntos × FE/NCE)"
chk "$(Q "select string_agg(codigo||':'||tipo_documento||'='||punto_activo::text||'/'||secuencia_activo::text||'/'||efectivo_previo::text, ',' order by codigo, tipo_documento) from fe_estado_previo_nex065 v join fe_puntos_expedicion p on p.id=v.punto_id and p.empresa_id=v.empresa_id where v.empresa_id='$E'")" "001:FE=false/true/false,001:NCE=false/true/false,002:FE=true/true/true,002:NCE=true/false/false,003:FE=true/true/true,003:NCE=true/true/true,004:FE=true/false/false,004:NCE=true/true/true" "el snapshot guarda punto/tipo/efectivo previos (evidencia para la recuperación)"
chk "$(Q "select md5(string_agg(punto_id::text||tipo_documento||coalesce(serie,'-')||ultimo_numero::text, '|' order by punto_id, tipo_documento)) from fe_punto_secuencias where empresa_id='$E'")" "$SEC_ANTES" "series y contadores idénticos (sin reiniciar ni reasignar numeración)"
chk "$(Q "select md5(string_agg(d::text,'|' order by d.id)) from documentos_electronicos d where empresa_id='$E'")" "$DOC_ANTES" "documentos idénticos (número, serie, CDC, estados)"
chk "$(Q "select string_agg(codigo||'='||activo::text, ',' order by codigo) from fe_puntos_expedicion where empresa_id='$E'")" "$PFIS_ANTES" "la marca física heredada de los puntos no se modificó (ya no interviene)"

# ── Emisión posterior: mismo resultado efectivo que antes ──
chk "$(emitir "$P1" d)" "BLOQUEADA:NEX:TIPO_INACTIVO" "después: 001 FE sigue bloqueada (ahora por su tipo)"
chk "$(emitir "$P4" e)" "BLOQUEADA:NEX:TIPO_INACTIVO" "después: 004 FE sigue bloqueada"
chk "$(emitir "$P2" f)" "OK" "después: 002 FE sigue emitiendo"
chk "$(emitir "$P3" g)" "OK" "después: 003 FE sigue emitiendo (continúa la serie AA)"
chk "$(Q "select coalesce(serie,'-')||'/'||ultimo_numero from fe_punto_secuencias where punto_id='$P3' and tipo_documento='FE'")" "AA/2" "003: la serie AA continúa sin saltos (AA-0000001 → AA-0000002)"
# Activar un tipo después es independiente: activar FE en 001 no activa NCE ni cambia otros puntos
Q "select fe_secuencia_estado('$E','$U','$P1','FE',true)" >/dev/null
chk "$(emitir "$P1" h)" "OK" "tras activar FE en 001 la FE emite (el punto físico inactivo no interviene)"
chk "$(Q "select string_agg(tipo_documento||'='||activo::text, ',' order by tipo_documento) from fe_punto_secuencias where punto_id='$P1'")" "FE=true,NCE=false" "activar FE en 001 NO activó la NCE"
chk "$(Q "select count(*) from fe_punto_secuencias where empresa_id='$E' and activo")" "5" "total de tipos activos: solo 002 FE, 003 FE/NCE, 004 NCE y la FE de 001 activada a propósito"

# ── Recuperación: reversion-NEX-065 vuelve a la regla anterior sin reactivar nada ──
if psql -X -q -v ON_ERROR_STOP=1 -1 -f "$AQUI/scripts/reversion-NEX-065.sql" >"$T/rev.out" 2>"$T/rev.err"; then ok "reversion-NEX-065.sql se aplicó"; else falla "la reversión falló: $(cat "$T/rev.err")"; fi
chk "$(Q "select coalesce(to_regclass('public.fe_estado_previo_nex065')::text,'ausente')")" "ausente" "la reversión eliminó el snapshot"
chk "$(efectivo)" "$EF_ANTES" "tras revertir: el estado efectivo es IDÉNTICO al previo a NEX-065 (punto Y tipo); nada bloqueado se reactivó (la FE activada a propósito en 001 vuelve a quedar bloqueada por su punto inactivo)"
chk "$(Q "select count(*) from documentos_electronicos where empresa_id='$E'")" "5" "documentos conservados tras la reversión (a, b, f, g, h)"

echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "T33: todo OK"; exit 0; } || { echo "T33: $FALLAS fallas"; exit 1; }
