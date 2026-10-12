#!/usr/bin/env bash
# Aplica las migraciones NEX-0xx en orden, cada una en UNA transacción junto con su fila en schema_migrations (SHA-256).
# - Idempotente: una migración ya registrada con el mismo checksum se omite; con checksum distinto aborta (alguien editó un archivo aplicado).
# - Conexión por variables estándar de libpq (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD...). Nada de contraseñas en argumentos.
# - SEGURIDAD: se niega a operar sobre una base llamada exactamente "nexit" salvo con --permitir-banco-real
#   (esa autorización la da el responsable; en esta etapa NO se ejecuta en la VM).
# Uso: aplicar-migraciones.sh [--permitir-banco-real] [--solo-listar]
set -euo pipefail
DIR="${MIGRACIONES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../migraciones" && pwd)}"
PERMITIR=0; LISTAR=0
for a in "$@"; do
  case "$a" in
    --permitir-banco-real) PERMITIR=1 ;;
    --solo-listar) LISTAR=1 ;;
    *) echo "argumento desconocido: $a" >&2; exit 2 ;;
  esac
done
DB="${PGDATABASE:-$(psql -Atc 'select current_database()')}"
if [[ "$DB" == "nexit" && $PERMITIR -ne 1 ]]; then
  echo "ABORTADO: la base es 'nexit' (real). Requiere autorización del responsable y --permitir-banco-real." >&2; exit 3
fi
psql() { command psql -X -q -v ON_ERROR_STOP=1 "$@"; }
tiene_control=$(psql -Atc "select to_regclass('public.schema_migrations') is not null")
for f in "$DIR"/NEX-0*.sql; do
  base="$(basename "$f" .sql)"; version="${base%%-*}-$(echo "$base" | cut -d- -f2)"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  prev=""
  if [[ "$tiene_control" == "t" ]]; then
    prev=$(psql -Atc "select checksum from schema_migrations where version = '$version'")
  fi
  if [[ -n "$prev" ]]; then
    if [[ "$prev" == "$sum" ]]; then echo "ya aplicada   $version"; continue; fi
    echo "ERROR: $version fue modificada después de aplicarse (checksum distinto)." >&2; exit 4
  fi
  if [[ $LISTAR -eq 1 ]]; then echo "pendiente     $version  ($sum)"; continue; fi
  echo "aplicando     $version"
  # El bloqueo consultivo serializa dos ejecuciones simultáneas del runner (la segunda espera y luego falla limpiamente por versión duplicada).
  psql -1 -c "SELECT pg_advisory_xact_lock(7340001)" -f "$f" -c "INSERT INTO schema_migrations (version, nombre, checksum) VALUES ('$version', '$base', '$sum')" >/dev/null
  tiene_control=$(psql -Atc "select to_regclass('public.schema_migrations') is not null")
done
# Re-aplicar permisos del rol de ejecución (cubre tablas nuevas de migraciones futuras). to_regprocedure recibe la FIRMA completa (to_regproc
# recibe solo el nombre y con paréntesis devolvería NULL, saltándose los permisos en silencio). Si la función existe, un fallo de la concesión
# ABORTA el runner (set -e): nunca se enmascara. Si no existe (NEX-013 aún no aplicada) se informa explícitamente que no hay permisos que reaplicar.
if [[ $LISTAR -eq 0 ]]; then
  existe_grants=$(psql -Atc "select to_regprocedure('public.nex_aplicar_grants_runtime()') is not null")
  if [[ "$existe_grants" == "t" ]]; then
    psql -Atc "select public.nex_aplicar_grants_runtime()" >/dev/null
    echo "permisos del rol de ejecución reaplicados"
  else
    echo "aviso: nex_aplicar_grants_runtime() no existe (NEX-013 pendiente): no hay permisos que reaplicar"
  fi
fi
echo "listo."
