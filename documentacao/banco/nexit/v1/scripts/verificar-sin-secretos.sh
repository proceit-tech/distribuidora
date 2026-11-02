#!/usr/bin/env bash
# Verificación estática: ningún archivo de documentacao/banco/nexit puede contener contraseñas, hashes bcrypt reales,
# la credencial pública anterior (admin123) ni cadenas de conexión con contraseña. Código de salida 1 si encuentra algo.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rc=0
chk() { # descripción, patrón
  local hits; hits=$(grep -rEn --exclude-dir=resultados --exclude=verificar-sin-secretos.sh "$2" "$AQUI" 2>/dev/null | grep -v "abcdefghijklmnopqrstuu" || true)
  if [[ -n "$hits" ]]; then echo "ENCONTRADO ($1):"; echo "$hits" | head -5; rc=1; else echo "OK  sin $1"; fi
}
chk "hash bcrypt completo"                 '\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}'
chk "credencial pública anterior admin123" 'admin123'
chk "URL de conexión con contraseña"       'postgres(ql)?://[^:/@ ]+:[^@ ]+@'
chk "PASSWORD '...' literal"               "PASSWORD +'[^'\$]+'"
chk "PGPASSWORD con valor literal"         'PGPASSWORD=[A-Za-z0-9]{6,}'
exit $rc
