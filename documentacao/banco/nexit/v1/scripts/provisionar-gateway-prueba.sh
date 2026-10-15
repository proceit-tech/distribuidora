#!/usr/bin/env bash
# Provisionamiento AUTOMATIZADO, idempotente y reversible del gateway de facturación electrónica de PRUEBA para una empresa (PRO-133, AUD-PRO133-R01). Lo ejecuta el AGENTE AUTORIZADO en la VM
# (Claude Code NO tiene acceso a la VM/Docker/PostgreSQL: este script queda versionado y probado con un docker simulado, pero NO se ha ejecutado contra el ambiente real).
#   provisionar-gateway-prueba.sh [--verificar|--aplicar|--revertir] [--razon-social "CASA MINGO"] [--ref CASAMINGO] [--stack /srv/stacks/distribuidora]
#                                 [--credenciales-archivo ARCHIVO] [--yes-recrear-app]
# · --verificar (por defecto) es SOLO LECTURA. --aplicar y --revertir cambian: (1) app.env (con copia .bak-AAAAMMDDhhmmss, modo 600), (2) UNA fila de fe_gateway_config, (3) recrean SOLO el contenedor app.
# · La empresa se identifica por RAZÓN SOCIAL (debe haber exactamente una); no se presume su código. El usuario/base de PostgreSQL salen de POSTGRES_USER/POSTGRES_DB del contenedor de la base
#   (no hay rol fijo) y se verifica el privilegio de escritura ANTES de cambiar nada.
# · CREDENCIALES: nunca en argumentos, Git, Linear ni logs. Fuente privada: variables NEXIT_PROVISION_RUC / NEXIT_PROVISION_PASSWORD del entorno del agente, o un archivo KEY=VALUE (RUC=…, PASSWORD=…)
#   con permisos 600/400. Se escriben en app.env solo por builtins de bash (no aparecen en `ps`) y solo se informa su PRESENCIA. Si app.env ya las tiene y no se entrega fuente, se conservan.
# · NO ejecuta migrations, NO toca numeración ni documentos, NO hace login ni envía nada al gateway (la prueba real de autenticación requiere otra autorización).
# Variables de apoyo (pruebas): NEXIT_DOCKER (por defecto «docker»), NEXIT_DB_CONTAINER (nexit-db), NEXIT_APP_CONTAINER (nexit-app).
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$AQUI/provisionar-gateway-prueba.sql"
DOCKER="${NEXIT_DOCKER:-docker}"; DBC="${NEXIT_DB_CONTAINER:-nexit-db}"; APPC="${NEXIT_APP_CONTAINER:-nexit-app}"
MODO=verificar; RAZON="CASA MINGO"; REF="CASAMINGO"; STACK="/srv/stacks/distribuidora"; CRED_ARCH=""
URL="https://gateway-bebidas-py.e-factura-hub.com"; TIMEOUT=30000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verificar) MODO=verificar; shift;; --aplicar) MODO=aplicar; shift;; --revertir) MODO=revertir; shift;;
    --razon-social) RAZON="$2"; shift 2;; --ref) REF="$2"; shift 2;; --stack) STACK="$2"; shift 2;; --credenciales-archivo) CRED_ARCH="$2"; shift 2;;
    --yes-recrear-app) shift;;
    *) echo "argumento desconocido: $1" >&2; exit 2;;
  esac
done
[[ "$REF" =~ ^[A-Z][A-Z0-9_]{0,39}$ ]] || { echo "ABORTADO: --ref inválida (^[A-Z][A-Z0-9_]{0,39}\$)." >&2; exit 2; }
ENV_FILE="$STACK/app.env"; K_RUC="NEXIT_FE_${REF}_RUC"; K_PWD="NEXIT_FE_${REF}_PASSWORD"
dc() { ( cd "$STACK" && "$DOCKER" compose -p nexit -f compose.yml -f app.compose.yml "$@" ); }
fallo() { echo "ABORTADO: $1" >&2; exit "${2:-1}"; }
info() { echo "· $1"; }

# ── 0. Prerrequisitos (sin cambiar nada) ───────────────────────────────────────────────────────────
"$DOCKER" ps >/dev/null 2>&1 || fallo "no hay acceso a Docker con este usuario (se requiere el agente autorizado en la VM)." 3
[[ -f "$ENV_FILE" ]] || fallo "no existe $ENV_FILE (stack incorrecto: use --stack)." 3
PGU="$("$DOCKER" exec "$DBC" printenv POSTGRES_USER </dev/null 2>/dev/null | tr -d '\r\n')"; PGD="$("$DOCKER" exec "$DBC" printenv POSTGRES_DB </dev/null 2>/dev/null | tr -d '\r\n')"
[[ -n "$PGU" && -n "$PGD" ]] || fallo "no se pudo leer POSTGRES_USER/POSTGRES_DB del contenedor $DBC (identidad de la base no verificable; no se presume un rol)." 3
psqlsql() { "$DOCKER" exec -i "$DBC" psql -X -q -At -v ON_ERROR_STOP=1 -U "$PGU" -d "$PGD" -v modo="$1" -v razon="$RAZON" -v ref="$REF" -v url="$URL" -v timeout="$TIMEOUT" -f - <"$SQL" 2>&1; }
resultado() { psqlsql "$1" | sed -n 's/^RESULTADO=//p' | tail -1; }

# ── helpers de app.env (solo builtins para los valores; nunca se imprimen) ─────────────────────────
valor_env() { local l; while IFS= read -r l || [[ -n "$l" ]]; do [[ "$l" == "$1="* ]] && { printf '%s' "${l#*=}"; return 0; }; done <"$ENV_FILE"; return 1; }
tiene_env() { local v; v="$(valor_env "$1")" || return 1; [[ -n "$v" ]]; }
reescribir_env() { # $1 = ruc|- ; $2 = password|- ; "-" quita las variables. Copia previa con marca de tiempo, modo 600, reemplazo atómico.
  local bak="$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)" tmp l
  ( umask 077; cp -p "$ENV_FILE" "$bak" ) || fallo "no se pudo crear la copia de app.env." 4
  tmp="$(umask 077; mktemp "$ENV_FILE.XXXXXX")" || fallo "no se pudo crear el temporal de app.env." 4
  while IFS= read -r l || [[ -n "$l" ]]; do case "$l" in "$K_RUC="*|"$K_PWD="*) ;; *) printf '%s\n' "$l";; esac; done <"$ENV_FILE" >"$tmp"
  if [[ "$1" != "-" ]]; then printf '%s=%s\n' "$K_RUC" "$1" >>"$tmp"; printf '%s=%s\n' "$K_PWD" "$2" >>"$tmp"; fi
  chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE" || fallo "no se pudo reemplazar app.env (la copia $bak se conserva)." 4
  info "app.env actualizado (copia previa: $(basename "$bak"))."
}
presentes_en_contenedor() { "$DOCKER" exec "$APPC" sh -c "test -n \"\$$K_RUC\" && test -n \"\$$K_PWD\"" </dev/null >/dev/null 2>&1; }

# ── 1. Identidad de la empresa y estado (solo lectura) ─────────────────────────────────────────────
ESTADO="$(resultado verificar)"
case "$ESTADO" in
  EMPRESA_NO_UNICA:*) fallo "la razón social «$RAZON» no identifica UNA empresa (coincidencias: ${ESTADO#EMPRESA_NO_UNICA:}). Use --razon-social más específica." 5;;
  SIN_NEX047) fallo "fe_gateway_config no existe: NEX-047 no está aplicada (otra tarea; no se aplica aquí)." 5;;
  VERIFICADO:*) ;;
  *) fallo "no se pudo consultar la base (resultado: ${ESTADO:-vacío})." 5;;
esac
FILA="${ESTADO#VERIFICADO:}"
info "empresa «$RAZON» identificada de forma única; fila del gateway: $FILA."
tiene_env "$K_RUC" && tiene_env "$K_PWD" && EN_ARCHIVO=si || EN_ARCHIVO=no
presentes_en_contenedor && EN_CONT=si || EN_CONT=no
info "credenciales $K_RUC/$K_PWD en app.env: $EN_ARCHIVO; en el contenedor $APPC: $EN_CONT."

if [[ "$MODO" == "verificar" ]]; then
  [[ "$FILA" == "activa_igual" && "$EN_CONT" == "si" ]] && { info "LISTO: configuración activa y credenciales presentes en el contenedor (no prueba que el gateway responda)."; exit 0; }
  info "PENDIENTE: ejecute con --aplicar (agente autorizado)."; exit 10
fi

# ── 2. Privilegios ANTES de cambiar nada (la propia función devuelve SIN_PRIVILEGIO sin escribir) ──
if [[ "$MODO" == "aplicar" ]]; then
  # 2a. credenciales: fuente privada o las ya presentes
  RUC="${NEXIT_PROVISION_RUC:-}"; PWD_="${NEXIT_PROVISION_PASSWORD:-}"
  if [[ -n "$CRED_ARCH" ]]; then
    [[ -f "$CRED_ARCH" ]] || fallo "el archivo de credenciales no existe." 6
    perm="$(stat -c %a "$CRED_ARCH" 2>/dev/null || stat -f %Lp "$CRED_ARCH" 2>/dev/null)"
    [[ "$perm" == "600" || "$perm" == "400" ]] || fallo "el archivo de credenciales debe tener permisos 600/400 (tiene $perm)." 6
    while IFS= read -r l || [[ -n "$l" ]]; do case "$l" in RUC=*) RUC="${l#RUC=}";; PASSWORD=*) PWD_="${l#PASSWORD=}";; esac; done <"$CRED_ARCH"
  fi
  if [[ -z "$RUC" || -z "$PWD_" ]]; then
    [[ "$EN_ARCHIVO" == "si" ]] || fallo "CREDENCIALES_REQUERIDAS: app.env no tiene $K_RUC/$K_PWD y no se entregó una fuente privada (NEXIT_PROVISION_RUC/NEXIT_PROVISION_PASSWORD o --credenciales-archivo). No se inventan ni se piden por chat." 6
    CAMBIA_ENV=no
  else
    CAMBIA_ENV=si
    if [[ "$EN_ARCHIVO" == "si" && "$(valor_env "$K_RUC")" == "$RUC" && "$(valor_env "$K_PWD")" == "$PWD_" ]]; then CAMBIA_ENV=no; fi
  fi
  # 2b. fila de gateway (valida privilegio y no sustituye una configuración distinta)
  R="$(resultado aplicar)"
  case "$R" in
    CONFIGURADA|REACTIVADA|YA_CONFIGURADA) info "fila de fe_gateway_config: $R.";;
    SIN_PRIVILEGIO) fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;;
    CONFLICTO_CONFIG_DISTINTA) fallo "la empresa ya tiene otra configuración de gateway; no se sustituye sin decisión humana." 7;;
    *) fallo "resultado inesperado de la base: ${R:-vacío}." 7;;
  esac
  [[ "$CAMBIA_ENV" == "si" ]] && reescribir_env "$RUC" "$PWD_"
  unset RUC PWD_
  if [[ "$CAMBIA_ENV" == "si" || "$EN_CONT" == "no" ]]; then
    info "recreando SOLO el contenedor app para que lea app.env…"
    dc config --quiet || fallo "la configuración Compose no es válida; app no se recreó." 8
    dc up -d --no-deps --force-recreate app >/dev/null || fallo "no se pudo recrear app." 8
  else info "app.env y contenedor ya correctos: no se recrea app."; fi
  presentes_en_contenedor && info "VERIFICADO: las dos variables están presentes en $APPC (valores no mostrados). CONFIGURADO ≠ gateway operativo: falta la prueba real de autenticación (otra autorización)." || fallo "las variables NO están presentes en $APPC tras recrear." 9
  exit 0
fi

# ── 3. Reversión ────────────────────────────────────────────────────────────────────────────────────
R="$(resultado revertir)"
case "$R" in DESACTIVADA|YA_INACTIVA|SIN_FILA) info "fila de fe_gateway_config: $R.";; SIN_PRIVILEGIO) fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;; *) fallo "resultado inesperado de la base: ${R:-vacío}." 7;; esac
if tiene_env "$K_RUC" || tiene_env "$K_PWD"; then reescribir_env - -; dc up -d --no-deps --force-recreate app >/dev/null || fallo "no se pudo recrear app." 8; fi
info "REVERTIDO: gateway desactivado y variables retiradas; el envío vuelve a responder 409 antes de reservar número."
exit 0
