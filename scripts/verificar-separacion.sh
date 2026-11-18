#!/usr/bin/env bash
# BUILD-R02 — verificación de la separación entre la aplicación operacional y las pruebas.
# Uso (desde la raíz del repositorio):
#   scripts/verificar-separacion.sh dependencias        # el programa TypeScript del build (tsconfig.build.json) no contiene pruebas ni soporte de pruebas
#   scripts/verificar-separacion.sh standalone          # tras `next build`: .next/standalone y .next/static sin pruebas/documentación, con server.js
#   scripts/verificar-separacion.sh builder <imagen>    # stage builder (`docker build --target builder`): el contexto realmente copiado no trae pruebas y sí la app
#   scripts/verificar-separacion.sh imagen <imagen>     # imagen final: /app sin pruebas ni ejecutores, con server.js, .next/static y public (no arranca el servidor)
# Termina con código distinto de cero si encuentra un archivo prohibido, si falta un archivo requerido o si cualquier comando falla.
set -euo pipefail
set -f # sin expansión de comodines en el host: los patrones de find se pasan literales

falla() { echo "FALLA separación: $*" >&2; exit 1; }

# Nombres prohibidos (se poda node_modules). Arreglo para el host; versión escapada para el `sh` del contenedor.
FIND_PROHIBIDOS=( '(' -name '*.casos.ts' -o -name '*.casos.tsx' -o -name '*.casos.js' -o -name 'contador-casos.ts' -o -name 'contador-casos.js'
  -o -name '.tmp-casos' -o -name 'casos-clientes' -o -name 'documentacao' -o -name 'CLAUDE.md' -o -name 'PROGRESSO-NEXIT-V1.md' ')' )
FIND_PROHIBIDOS_SH="$(printf '%q ' "${FIND_PROHIBIDOS[@]}")"

informar_encontrados() { # $1 = descripción, $2 = salida de la búsqueda
  if [[ -n "$2" ]]; then
    printf '%s\n' "$2" >&2
    falla "$1: hay archivos de pruebas, ejecutores o documentación (lista arriba)"
  fi
}

modo="${1:-}"
case "$modo" in
  dependencias)
    lista="$(npx --no-install tsc -p tsconfig.build.json --listFilesOnly)" || falla "tsc --listFilesOnly -p tsconfig.build.json terminó con error"
    propios="$(sed "s#^$PWD/##" <<<"$lista" | { grep -v -e '^node_modules/' -e '/node_modules/' || true; })"
    [[ -n "$propios" ]] || falla "tsc no listó ningún archivo propio"
    grep -q '^app/' <<<"$propios" || falla "la lista del build no contiene archivos de app/ (configuración inesperada)"
    rc=0
    prohibidos="$(grep -E '\.casos\.tsx?$|^lib/clientes/contador-casos\.ts$|^scripts/|^documentacao/|^\.tmp-casos/' <<<"$propios")" || rc=$?
    if [[ $rc -eq 0 ]]; then
      printf '%s\n' "$prohibidos" >&2
      falla "el programa TypeScript del build incluye pruebas o material no operacional (¿la aplicación importa un caso?)"
    elif [[ $rc -ne 1 ]]; then
      falla "grep terminó con error ($rc)"
    fi
    echo "OK dependencias: $(grep -c . <<<"$propios") archivos propios en tsconfig.build.json, ninguno de pruebas"
    ;;
  standalone)
    [[ -f .next/standalone/server.js ]] || falla "no existe .next/standalone/server.js (¿se ejecutó next build con output standalone?)"
    [[ -d .next/static ]] || falla "no existe .next/static"
    encontrados="$(find .next/standalone .next/static -path '*/node_modules' -prune -o "${FIND_PROHIBIDOS[@]}" -print)" || falla "standalone: find terminó con error"
    informar_encontrados ".next/standalone y .next/static" "$encontrados"
    echo "OK standalone: sin archivos de pruebas ni documentación; server.js y .next/static presentes"
    ;;
  builder|imagen)
    img="${2:-}"; [[ -n "$img" ]] || falla "indique la imagen: $0 $modo <imagen>"
    if [[ "$modo" == builder ]]; then
      requeridos="/app/package.json /app/next.config.ts /app/tsconfig.json /app/tsconfig.build.json /app/app /app/lib /app/public /app/.next/standalone/server.js"
    else
      requeridos="/app/server.js /app/.next/static /app/public /app/package.json"
    fi
    # Un solo contenedor efímero con `sh` como entrypoint (no arranca el servidor): comprueba los requeridos y busca prohibidos fuera de node_modules.
    salida="$(docker run --rm --entrypoint sh "$img" -c "
      set -e
      for r in $requeridos; do [ -e \"\$r\" ] || { echo \"FALTA \$r\"; exit 3; }; done
      find /app -path /app/node_modules -prune -o $FIND_PROHIBIDOS_SH -print
    " 2>&1)" || { printf '%s\n' "$salida" >&2; falla "$modo $img: la inspección terminó con error (archivo requerido ausente o fallo de find/docker)"; }
    informar_encontrados "$modo $img (/app)" "$salida"
    echo "OK $modo $img: /app sin pruebas ni documentación; requeridos presentes: $requeridos"
    ;;
  *)
    falla "modo desconocido '$modo' (dependencias | standalone | builder <imagen> | imagen <imagen>)"
    ;;
esac
