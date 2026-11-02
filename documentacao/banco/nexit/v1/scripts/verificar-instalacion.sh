#!/usr/bin/env bash
# Validación de la estructura INSTALADA (solo lectura). Se usa en la bateria de pruebas y como paso "validación" y "pruebas posteriores" de la implantación.
# Uso: verificar-instalacion.sh [--produccion]      Conexión por variables estándar de libpq.
#   --produccion: además exige que NO existan empresas DEMO ni datos fuera de lo esperado para una instalación recién hecha de la empresa real.
# Salida: líneas "PASS: ..." / "FALLA: ..."; código de salida 0 solo si no hay FALLA.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${MIGRACIONES_DIR:-$AQUI/migraciones}"
PROD=0; [[ "${1:-}" == "--produccion" ]] && PROD=1
FALLAS=0
ok()    { echo "PASS: $1"; }
falla() { echo "FALLA: $1"; FALLAS=$((FALLAS+1)); }
Q()     { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
chk()   { local r; r="$(Q "$2" 2>&1)"; if [[ "$r" == "t" ]]; then ok "$1"; else falla "$1 (resultado: ${r:-vacío})"; fi; }

# 1) Migraciones: cada archivo registrado con su checksum; nada registrado sin archivo
for f in "$DIR"/NEX-0*.sql; do
  b="$(basename "$f" .sql)"; v="${b%%-*}-$(echo "$b" | cut -d- -f2)"; s="$(sha256sum "$f" | cut -d' ' -f1)"
  r="$(Q "select checksum from schema_migrations where version='$v'" 2>&1)"
  if [[ "$r" == "$s" ]]; then ok "migración $v registrada con checksum correcto"; elif [[ -z "$r" ]]; then falla "migración $v PENDIENTE (no registrada)"; else falla "migración $v registrada con OTRO checksum (archivo editado después de aplicarse)"; fi
done
N_ARCH="$(ls "$DIR"/NEX-0*.sql | wc -l | tr -d ' ')"
chk "no hay versiones registradas sin archivo ($N_ARCH archivos)" "select count(*) = $N_ARCH from schema_migrations"
chk "ninguna versión histórica ausente (003, 018–021) está registrada como ejecutada" "select count(*) = 0 from schema_migrations where version in ('003','018','019','020','021')"
chk "extensión pgcrypto instalada (crypt/gen_salt del login)" "select count(*) = 1 from pg_extension where extname = 'pgcrypto'"

# 2) Rol de ejecución
chk "nexit_runtime existe sin superusuario, createrole, createdb, replication ni bypassrls" "select exists (select 1 from pg_roles where rolname='nexit_runtime' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication and not rolbypassrls)"
chk "nexit_runtime NO tiene escritura directa en saldos, costos, movimientos ni líneas" "select not (has_table_privilege('nexit_runtime','stock_saldos','INSERT') or has_table_privilege('nexit_runtime','stock_saldos','UPDATE') or has_table_privilege('nexit_runtime','stock_saldos','DELETE')
   or has_table_privilege('nexit_runtime','inventario_costos','INSERT') or has_table_privilege('nexit_runtime','inventario_costos','UPDATE') or has_table_privilege('nexit_runtime','inventario_costos','DELETE')
   or has_table_privilege('nexit_runtime','movimientos_inventario','INSERT') or has_table_privilege('nexit_runtime','movimientos_inventario','UPDATE') or has_table_privilege('nexit_runtime','movimientos_inventario','DELETE')
   or has_table_privilege('nexit_runtime','movimiento_lineas','INSERT') or has_table_privilege('nexit_runtime','movimiento_lineas','UPDATE') or has_table_privilege('nexit_runtime','movimiento_lineas','DELETE'))"
chk "nexit_runtime escribe cadastros (clientes, proveedores, productos, listas de precio)" "select has_table_privilege('nexit_runtime','clientes','INSERT') and has_table_privilege('nexit_runtime','proveedores','UPDATE') and has_table_privilege('nexit_runtime','productos','INSERT') and has_table_privilege('nexit_runtime','listas_precio','UPDATE')"
chk "nexit_runtime NO escribe catálogos globales, empresas ni permisos" "select not (has_table_privilege('nexit_runtime','empresas','UPDATE') or has_table_privilege('nexit_runtime','permisos','INSERT') or has_table_privilege('nexit_runtime','monedas','INSERT') or has_table_privilege('nexit_runtime','impuestos','INSERT'))"
chk "nexit_runtime NO lee schema_migrations" "select not has_table_privilege('nexit_runtime','schema_migrations','SELECT')"
chk "nexit_runtime ejecuta solo la API de movimientos y permisos" "select has_function_privilege('nexit_runtime','inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)','EXECUTE')
   and has_function_privilege('nexit_runtime','inventario_anular_movimiento(uuid,uuid,uuid,text,text)','EXECUTE')
   and has_function_privilege('nexit_runtime','usuario_tiene_permiso(uuid,uuid,text,text)','EXECUTE')"
chk "nexit_runtime NO ejecuta funciones internas ni de administración (líneas, DEMO, inicialización, restablecer clave)" "select not (has_function_privilege('nexit_runtime','nex_inicializar_empresa(text,text,text,text,text,text,text,text,text,text,text)','EXECUTE')
   or has_function_privilege('nexit_runtime','nex_restablecer_clave(text,text,text,boolean)','EXECUTE')
   or has_function_privilege('nexit_runtime','demo_reiniciar(text)','EXECUTE') or has_function_privilege('nexit_runtime','demo_eliminar(text)','EXECUTE')
   or has_function_privilege('nexit_runtime','inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)','EXECUTE'))"

# 3) Controles estructurales críticos
chk "idempotencia: índice único (empresa, clave) presente" "select to_regclass('movimientos_inventario_idem_key') is not null"
chk "anulación: un solo inverso por movimiento (índice único) presente" "select to_regclass('movimientos_inventario_anula_key') is not null"
chk "inmutabilidad: triggers de movimientos y líneas presentes" "select count(*) = 2 from pg_trigger where tgname in ('movimientos_inventario_guard_trg','movimiento_lineas_guard_trg') and not tgisinternal"
chk "stock no negativo: CHECK stock_saldos_cant_chk presente" "select exists (select 1 from pg_constraint where conname='stock_saldos_cant_chk')"
chk "las vistas v_* son security_invoker (no saltan los permisos del invocador)" "select count(*) = 0 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce('security_invoker=true' = any(c.reloptions), false)"
chk "las funciones SECURITY DEFINER fijan search_path" "select count(*) = 0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')"
chk "toda tabla con empresa_id lo exige NOT NULL (salvo catálogos globales, que no lo tienen)" "select count(*) = 0 from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='empresa_id' and c.is_nullable='YES'"
chk "no hay contraseñas fuera de formato bcrypt \$2a\$" "select count(*) = 0 from usuarios where password_hash !~ '^\\\$2a\\\$[0-9]{2}\\\$'"

# 4) Integridad de datos
chk "ningún saldo de stock negativo" "select count(*) = 0 from stock_saldos where cantidad < 0"
chk "conciliación cantidad: saldos = cantidad valorizada (sin diferencias)" "select count(*) = 0 from v_conciliacion_costo_stock"
chk "conciliación valor: inventario_costos = libro de movimientos (sin diferencias)" "select count(*) = 0 from v_conciliacion_valor_movimientos"
chk "cada movimiento ANULADO tiene exactamente un movimiento inverso" "select (select count(*) from movimientos_inventario where estado='ANULADO') = (select count(*) from movimientos_inventario where tipo_origen='ANULACION')"
chk "numeración MOV-xxxxxx única y sin huecos por empresa" "select count(*) = 0 from (select empresa_id, count(*) n, count(distinct numero_movimiento) d, max(substring(numero_movimiento from 5)::int) mx from movimientos_inventario group by empresa_id) t where n <> d or n <> mx"

if [[ $PROD -eq 1 ]]; then
  chk "PRODUCCIÓN: no existen empresas DEMO" "select count(*) = 0 from empresas where es_demo"
  chk "PRODUCCIÓN: existe al menos una empresa real activa con un administrador activo" "select exists (select 1 from empresas e join usuarios u on u.empresa_id=e.id join usuario_perfil up on up.empresa_id=u.empresa_id and up.usuario_id=u.id join perfiles p on p.empresa_id=up.empresa_id and p.id=up.perfil_id where not e.es_demo and e.estado='ACTIVA' and u.estado='ACTIVO' and p.es_administrador)"
fi
echo "------------------------------------------------------------"
[[ $FALLAS -eq 0 ]] && { echo "verificar-instalacion: todo OK"; exit 0; } || { echo "verificar-instalacion: $FALLAS fallas"; exit 1; }
