#!/usr/bin/env bash
# Genera el hash bcrypt ($2a$, costo 12) de la contraseña de una empresa DEMO, FUERA del servidor de base de datos.
# La contraseña se lee de la entrada interactiva (sin eco) o de stdin; nunca se pasa como argumento ni se guarda en Git/logs.
# El hash resultante es lo único que se entrega a demo_crear_empresa(...). Prefijo $2a$ porque pgcrypto crypt() solo valida ese.
# Orden de herramientas: python3 + módulo bcrypt, htpasswd (-B), node + bcryptjs.
set -euo pipefail
if [[ -t 0 ]]; then read -r -s -p "Contraseña DEMO (mínimo 12 caracteres): " PW; echo >&2; else IFS= read -r PW; fi
[[ ${#PW} -ge 12 ]] || { echo "Contraseña demasiado corta (mínimo 12)." >&2; exit 2; }
export PW
if python3 -c 'import bcrypt' 2>/dev/null; then
  python3 -c 'import os,bcrypt;print(bcrypt.hashpw(os.environ["PW"].encode(),bcrypt.gensalt(12)).decode().replace("$2b$","$2a$",1))'
elif command -v htpasswd >/dev/null; then
  htpasswd -nbBC 12 x "$PW" | cut -d: -f2 | sed 's/^\$2y\$/$2a$/'
elif command -v node >/dev/null && node -e 'require("bcryptjs")' 2>/dev/null; then
  node -e 'console.log(require("bcryptjs").hashSync(process.env.PW,12))'
else
  echo "Instale python3-bcrypt, apache2-utils (htpasswd) o bcryptjs." >&2; exit 3
fi
