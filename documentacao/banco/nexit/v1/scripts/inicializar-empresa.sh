#!/usr/bin/env bash
# Inicializa la EMPRESA REAL y su administrador (nex_inicializar_empresa, NEX-015). Repetible: si la empresa ya existe no modifica nada.
# La contraseña NUNCA se pasa como argumento ni queda en historial/logs: se lee sin eco (o de stdin) y se convierte en hash bcrypt localmente
# (generar-hash-clave.sh); solo el HASH viaja a PostgreSQL, por la entrada estándar de psql (no aparece en la lista de procesos).
# Uso:
#   inicializar-empresa.sh --codigo emp-acme --razon-social "ACME S.A." --ruc 80012345 --dv 6 --usuario admin --nombre Magno [--apellido X] [--email a@b.c] [--permitir-banco-real]
# Conexión: variables estándar de libpq (PGHOST, PGPORT, PGUSER, PGDATABASE...). Se niega a operar sobre la base 'nexit' sin --permitir-banco-real
# (autorización expresa del responsable; la ejecución en la VM la realiza el flujo de implantación, nunca esta sesión de desarrollo).
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODIGO=""; RAZON=""; RUC=""; DV=""; USUARIO=""; NOMBRE=""; APELLIDO=""; EMAIL=""; PERMITIR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --codigo) CODIGO="$2"; shift 2;; --razon-social) RAZON="$2"; shift 2;; --ruc) RUC="$2"; shift 2;; --dv) DV="$2"; shift 2;;
    --usuario) USUARIO="$2"; shift 2;; --nombre) NOMBRE="$2"; shift 2;; --apellido) APELLIDO="$2"; shift 2;; --email) EMAIL="$2"; shift 2;;
    --permitir-banco-real) PERMITIR=1; shift;;
    *) echo "argumento desconocido: $1" >&2; exit 2;;
  esac
done
for v in CODIGO RAZON RUC DV USUARIO NOMBRE; do [[ -n "${!v}" ]] || { echo "falta el parámetro --$(echo "$v" | tr 'A-Z' 'a-z')" >&2; exit 2; }; done
DB="${PGDATABASE:-$(psql -Atc 'select current_database()')}"
if [[ "$DB" == "nexit" && $PERMITIR -ne 1 ]]; then echo "ABORTADO: base 'nexit' (real). Requiere autorización del responsable y --permitir-banco-real." >&2; exit 3; fi
GEN="${NEX_PRUEBAS_GENERADOR_HASH:-$AQUI/generar-hash-clave.sh}"   # NEX_PRUEBAS_GENERADOR_HASH: solo para pruebas automáticas sin bcrypt instalado
HASH="$("$GEN")"
# Los parámetros no secretos van por -v; el hash, por stdin.
{ printf '\\set h %s\n' "$HASH"
  cat <<'SQL'
SELECT nex_inicializar_empresa(:'codigo', :'razon', :'ruc', :'dv', :'usuario', :'nombre', NULLIF(:'apellido', ''), NULLIF(:'email', ''), :'h') AS empresa_id;
SQL
} | psql -X -q -At -v ON_ERROR_STOP=1 -v codigo="$CODIGO" -v razon="$RAZON" -v ruc="$RUC" -v dv="$DV" -v usuario="$USUARIO" -v nombre="$NOMBRE" -v apellido="$APELLIDO" -v email="$EMAIL" -f - \
  | sed 's/^/empresa_id=/'
echo "Listo. Verifique el acceso con el usuario '$USUARIO'. La contraseña no fue almacenada en claro en ningún lugar."
