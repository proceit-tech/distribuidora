#!/usr/bin/env bash
# Restablece la clave de un usuario de una empresa REAL (nex_restablecer_clave, NEX-015): nuevo hash, desbloqueo, sesiones revocadas, evento registrado.
# La contraseña se lee sin eco (o de stdin); solo el hash llega a PostgreSQL (por stdin de psql).
# Uso: restablecer-clave.sh --empresa emp-acme --usuario admin [--sin-cambio-obligatorio] [--permitir-banco-real]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMPRESA=""; USUARIO=""; EXIGIR=true; PERMITIR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --empresa) EMPRESA="$2"; shift 2;; --usuario) USUARIO="$2"; shift 2;; --sin-cambio-obligatorio) EXIGIR=false; shift;;
    --permitir-banco-real) PERMITIR=1; shift;; *) echo "argumento desconocido: $1" >&2; exit 2;;
  esac
done
[[ -n "$EMPRESA" && -n "$USUARIO" ]] || { echo "faltan --empresa y --usuario" >&2; exit 2; }
DB="${PGDATABASE:-$(psql -Atc 'select current_database()')}"
if [[ "$DB" == "nexit" && $PERMITIR -ne 1 ]]; then echo "ABORTADO: base 'nexit' (real). Requiere autorización del responsable y --permitir-banco-real." >&2; exit 3; fi
GEN="${NEX_PRUEBAS_GENERADOR_HASH:-$AQUI/generar-hash-clave.sh}"   # NEX_PRUEBAS_GENERADOR_HASH: solo para pruebas automáticas sin bcrypt instalado
HASH="$("$GEN")"
{ printf '\\set h %s\n' "$HASH"
  cat <<'SQL'
SELECT nex_restablecer_clave(:'empresa', :'usuario', :'h', :'exigir'::boolean);
SQL
} | psql -X -q -At -v ON_ERROR_STOP=1 -v empresa="$EMPRESA" -v usuario="$USUARIO" -v exigir="$EXIGIR" -f - >/dev/null
echo "Clave restablecida para $USUARIO@$EMPRESA (sesiones anteriores revocadas)."
