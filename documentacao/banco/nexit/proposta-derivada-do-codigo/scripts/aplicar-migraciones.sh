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
  psql -1 -f "$f" -c "INSERT INTO schema_migrations (version, nombre, checksum) VALUES ('$version', '$base', '$sum')" >/dev/null
  tiene_control=$(psql -Atc "select to_regclass('public.schema_migrations') is not null")
done
# Re-aplicar permisos del rol de ejecución si ya existe (cubre tablas nuevas de migraciones futuras).
if [[ $LISTAR -eq 0 ]]; then
  psql -Atc "select case when to_regproc('nex_aplicar_grants_runtime()') is not null then (select nex_aplicar_grants_runtime()::text) end" >/dev/null || true
fi
echo "listo."
