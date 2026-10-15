#!/usr/bin/env bash
# Provisionamiento AUTOMATIZADO, idempotente y reversible del gateway de facturación electrónica de PRUEBA para una empresa (PRO-133, AUD-PRO133-R01/R02). Lo ejecuta el AGENTE AUTORIZADO en la VM
# (Claude Code NO tiene acceso a la VM/Docker/PostgreSQL: este script queda versionado y probado con un docker simulado, pero NO se ha ejecutado contra el ambiente real).
#   provisionar-gateway-prueba.sh [--verificar|--aplicar|--revertir] [--razon-social "CASA MINGO"] [--ref CASAMINGO] [--stack /srv/stacks/distribuidora] [--credenciales-archivo ARCHIVO]
# · --verificar (por defecto) es SOLO LECTURA. --aplicar y --revertir cambian: (1) app.env (copia .bak-AAAAMMDDhhmmss, TODO con modo 600), (2) UNA fila de fe_gateway_config, (3) recrean SOLO el contenedor app.
# · La empresa se identifica por RAZÓN SOCIAL (debe haber exactamente una). Usuario/base de PostgreSQL salen de POSTGRES_USER/POSTGRES_DB del contenedor de la base; el privilegio de escritura se
#   verifica ANTES de cambiar nada.
# · CREDENCIALES: fuente privada (NEXIT_PROVISION_RUC / NEXIT_PROVISION_PASSWORD del entorno del agente, o archivo KEY=VALUE con permisos 600/400). Nunca en argumentos, Git, Linear ni logs. Se escriben en
#   app.env entre comillas simples (formato env_file de Docker Compose v2: valor LITERAL, sin interpolación de $ ni escapes) solo con builtins de bash; se rechazan los valores irrepresentables
#   (vacíos, con comilla simple, CR o LF). Tras recrear la app se compara, byte a byte, lo que el contenedor realmente recibió (sin imprimirlo).
# · NO sobrescribe credenciales preexistentes distintas, NO sustituye una configuración de gateway distinta, NO ejecuta migrations, NO toca numeración ni documentos, NO hace login ni envíos.
# · ESTADO / RECUPERACIÓN: el archivo de estado $STACK/.provisionar-gateway-<REF>.estado (modo 600, sin secretos) registra qué cambió ESTE provisionador. La reversión solo deshace lo propio: no
#   desactiva una configuración distinta ni retira credenciales preexistentes o compartidas con otra empresa. Si falla app.env o la recreación de la app, se compensa (se restaura app.env desde su copia y se
#   desactiva la fila propia) y se informa el estado final de forma inequívoca; reejecutar --aplicar converge.
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
    *) echo "argumento desconocido: $1" >&2; exit 2;;
  esac
done
[[ "$REF" =~ ^[A-Z][A-Z0-9_]{0,39}$ ]] || { echo "ABORTADO: --ref inválida (^[A-Z][A-Z0-9_]{0,39}\$)." >&2; exit 2; }
ENV_FILE="$STACK/app.env"; K_RUC="NEXIT_FE_${REF}_RUC"; K_PWD="NEXIT_FE_${REF}_PASSWORD"; ESTADO_FILE="$STACK/.provisionar-gateway-$REF.estado"
dc() { ( cd "$STACK" && "$DOCKER" compose -p nexit -f compose.yml -f app.compose.yml "$@" ); }
fallo() { echo "ABORTADO: $1" >&2; exit "${2:-1}"; }
info() { echo "· $1"; }

# ── archivo de estado (sin secretos, modo 600) ───────────────────────────────────────────────────
est_get() { local l; [[ -f "$ESTADO_FILE" ]] || return 1; while IFS= read -r l || [[ -n "$l" ]]; do [[ "$l" == "$1="* ]] && { printf '%s' "${l#*=}"; return 0; }; done <"$ESTADO_FILE"; return 1; }
est_set() { # clave valor — reemplazo atómico, modo 600 explícito
  local tmp l; tmp="$(umask 077; mktemp "$ESTADO_FILE.XXXXXX")" || fallo "no se pudo crear el archivo de estado." 4
  { [[ -f "$ESTADO_FILE" ]] && while IFS= read -r l || [[ -n "$l" ]]; do [[ "$l" == "$1="* ]] || printf '%s\n' "$l"; done <"$ESTADO_FILE"; printf '%s=%s\n' "$1" "$2"; } >"$tmp"
  chmod 600 "$tmp" && mv "$tmp" "$ESTADO_FILE" || fallo "no se pudo guardar el archivo de estado." 4
}

# ── app.env (valores solo por builtins; nunca se imprimen) ───────────────────────────────────────
valor_env() { # devuelve el valor LITERAL (sin las comillas simples de env_file); 1 si la variable no existe
  local l v; while IFS= read -r l || [[ -n "$l" ]]; do
    if [[ "$l" == "$1="* ]]; then v="${l#*=}"; if [[ ${#v} -ge 2 && "${v:0:1}" == "'" && "${v: -1}" == "'" ]]; then v="${v:1:${#v}-2}"; fi; printf '%s' "$v"; return 0; fi
  done <"$ENV_FILE"; return 1
}
tiene_env() { local v; v="$(valor_env "$1")" || return 1; [[ -n "$v" ]]; }
representable() { # no vacío, sin comilla simple, CR, LF (no cabrían en un valor entre comillas simples de env_file)
  local v="$1"; [[ -n "$v" && "$v" != *"'"* && "$v" != *$'\n'* && "$v" != *$'\r'* ]]
}
copiar_seguro() { # $1 origen, $2 destino: contenido con modo 600 EXPLÍCITO desde el primer byte; aborta si chmod falla
  ( umask 077; cat "$1" >"$2" ) && chmod 600 "$2" || return 1
}
escribir_env() { # $1 = ruc|- ; $2 = password|- ("-" quita las variables) ; reemplazo atómico con temporal 600
  local tmp l; tmp="$(umask 077; mktemp "$ENV_FILE.XXXXXX")" || return 1
  while IFS= read -r l || [[ -n "$l" ]]; do case "$l" in "$K_RUC="*|"$K_PWD="*) ;; *) printf '%s\n' "$l";; esac; done <"$ENV_FILE" >"$tmp" || { rm -f "$tmp"; return 1; }
  if [[ "$1" != "-" ]]; then printf "%s='%s'\n" "$K_RUC" "$1" >>"$tmp"; printf "%s='%s'\n" "$K_PWD" "$2" >>"$tmp"; fi
  chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE" || { rm -f "$tmp"; return 1; }
}
valor_contenedor() { "$DOCKER" exec "$APPC" printenv "$1" </dev/null 2>/dev/null; }
presentes_en_contenedor() { local a b; a="$(valor_contenedor "$K_RUC")"; b="$(valor_contenedor "$K_PWD")"; [[ -n "$a" && -n "$b" ]]; }

# ── 0. Prerrequisitos (sin cambiar nada) ───────────────────────────────────────────────────────────
"$DOCKER" ps >/dev/null 2>&1 || fallo "no hay acceso a Docker con este usuario (se requiere el agente autorizado en la VM)." 3
[[ -f "$ENV_FILE" ]] || fallo "no existe $ENV_FILE (stack incorrecto: use --stack)." 3
PGU="$("$DOCKER" exec "$DBC" printenv POSTGRES_USER </dev/null 2>/dev/null | tr -d '\r\n')"; PGD="$("$DOCKER" exec "$DBC" printenv POSTGRES_DB </dev/null 2>/dev/null | tr -d '\r\n')"
[[ -n "$PGU" && -n "$PGD" ]] || fallo "no se pudo leer POSTGRES_USER/POSTGRES_DB del contenedor $DBC (identidad de la base no verificable; no se presume un rol)." 3
SALIDA_SQL=""
consulta() { # $1 modo ; $2 propio (si|no) → deja la salida en SALIDA_SQL
  SALIDA_SQL="$("$DOCKER" exec -i "$DBC" psql -X -q -At -v ON_ERROR_STOP=1 -U "$PGU" -d "$PGD" -v modo="$1" -v razon="$RAZON" -v ref="$REF" -v url="$URL" -v timeout="$TIMEOUT" -v propio="${2:-no}" -f - <"$SQL" 2>&1)"
}
res() { printf '%s\n' "$SALIDA_SQL" | sed -n 's/^RESULTADO=//p' | tail -1; }
compartida() { printf '%s\n' "$SALIDA_SQL" | sed -n 's/^COMPARTIDA=//p' | tail -1; }

# ── 1. Identidad de la empresa y estado (solo lectura) ─────────────────────────────────────────────
consulta verificar no; ESTADO="$(res)"
case "$ESTADO" in
  EMPRESA_NO_UNICA:*) fallo "la razón social «$RAZON» no identifica UNA empresa (coincidencias: ${ESTADO#EMPRESA_NO_UNICA:}). Use --razon-social más específica." 5;;
  SIN_NEX047) fallo "fe_gateway_config no existe: NEX-047 no está aplicada (otra tarea; no se aplica aquí). No se cambió nada." 5;;
  VERIFICADO:*) ;;
  *) fallo "no se pudo consultar la base (resultado: ${ESTADO:-vacío})." 5;;
esac
FILA="${ESTADO#VERIFICADO:}"
info "empresa «$RAZON» identificada de forma única; fila del gateway: $FILA."
tiene_env "$K_RUC" && tiene_env "$K_PWD" && EN_ARCHIVO=si || EN_ARCHIVO=no
presentes_en_contenedor && EN_CONT=si || EN_CONT=no
info "credenciales $K_RUC/$K_PWD en app.env: $EN_ARCHIVO; en el contenedor $APPC: $EN_CONT."
ETAPA="$(est_get etapa || true)"
[[ -n "$ETAPA" && "$ETAPA" != "ok" && "$ETAPA" != "compensado" && "$ETAPA" != "revertido" ]] && info "ATENCIÓN: una ejecución anterior quedó en la etapa «$ETAPA» (estado parcial): reejecute --aplicar (converge) o --revertir."

if [[ "$MODO" == "verificar" ]]; then
  [[ "$FILA" == "activa_igual" && "$EN_CONT" == "si" ]] && { info "LISTO: configuración activa y credenciales presentes en el contenedor (no prueba que el gateway responda)."; exit 0; }
  info "PENDIENTE: ejecute con --aplicar (agente autorizado)."; exit 10
fi

# ── compensación (solo cambios PROPIOS de esta ejecución) ─────────────────────────────────────────
BAK=""; ENV_ESCRITO_AHORA=no; DB_CAMBIADA_AHORA=no
compensar() { # $1 = motivo
  local m=""
  if [[ "$ENV_ESCRITO_AHORA" == "si" && -n "$BAK" && -f "$BAK" ]]; then copiar_seguro "$BAK" "$ENV_FILE" && m="app.env restaurado desde su copia" || m="NO se pudo restaurar app.env (copia en $(basename "$BAK"))"; fi
  if [[ "$DB_CAMBIADA_AHORA" == "si" ]]; then consulta revertir si; case "$(res)" in DESACTIVADA) m="$m; fila del gateway desactivada";; *) m="$m; NO se pudo desactivar la fila ($(res))";; esac; fi
  est_set etapa compensado >/dev/null 2>&1 || true
  echo "ESTADO FINAL: COMPENSADO tras el fallo «$1» —${m:- sin cambios que deshacer}. La app NO quedó configurada con el gateway; reejecute --aplicar o revise Docker." >&2
}

# ── 2. Aplicar ─────────────────────────────────────────────────────────────────────────────────────
if [[ "$MODO" == "aplicar" ]]; then
  RUC="${NEXIT_PROVISION_RUC:-}"; PWD_="${NEXIT_PROVISION_PASSWORD:-}"
  if [[ -n "$CRED_ARCH" ]]; then
    [[ -f "$CRED_ARCH" ]] || fallo "el archivo de credenciales no existe." 6
    perm="$(stat -c %a "$CRED_ARCH" 2>/dev/null || stat -f %Lp "$CRED_ARCH" 2>/dev/null)"
    [[ "$perm" == "600" || "$perm" == "400" ]] || fallo "el archivo de credenciales debe tener permisos 600/400 (tiene $perm)." 6
    while IFS= read -r l || [[ -n "$l" ]]; do case "$l" in RUC=*) RUC="${l#RUC=}";; PASSWORD=*) PWD_="${l#PASSWORD=}";; esac; done <"$CRED_ARCH"
  fi
  # 2a. PRE-VALIDACIONES (nada cambia todavía): credenciales, representación, conflicto con preexistentes, escritura y Compose
  CAMBIA_ENV=no
  if [[ -n "$RUC" || -n "$PWD_" ]]; then
    representable "$RUC" && representable "$PWD_" || fallo "las credenciales no son representables en app.env (vacías, con comilla simple, CR o LF): no se escribió nada." 6
    if [[ "$EN_ARCHIVO" == "si" ]]; then
      [[ "$(valor_env "$K_RUC")" == "$RUC" && "$(valor_env "$K_PWD")" == "$PWD_" ]] || fallo "CONFLICTO_CREDENCIALES: app.env ya tiene $K_RUC/$K_PWD con otros valores; no se sobrescriben credenciales preexistentes (decisión humana)." 6
    else CAMBIA_ENV=si; fi
  else
    [[ "$EN_ARCHIVO" == "si" ]] || fallo "CREDENCIALES_REQUERIDAS: app.env no tiene $K_RUC/$K_PWD y no se entregó una fuente privada (NEXIT_PROVISION_RUC/NEXIT_PROVISION_PASSWORD o --credenciales-archivo). No se inventan ni se piden por chat." 6
  fi
  if [[ "$CAMBIA_ENV" == "si" ]]; then [[ -w "$ENV_FILE" && -w "$STACK" ]] || fallo "app.env o su directorio no son escribibles; no se cambió nada." 4; fi
  dc config --quiet >/dev/null 2>&1 || fallo "la configuración Compose no es válida; no se cambió nada." 8
  # 2b. Estado (qué es PROPIO): en una reejecución tras un fallo parcial se conserva lo registrado
  # (si la ejecución anterior terminó «ok» NO se reinicia: la proveniencia de lo ya instalado se conserva y la reejecución es idempotente)
  if [[ "$ETAPA" == "" || "$ETAPA" == "compensado" || "$ETAPA" == "revertido" ]]; then
    est_set ref "$REF"; est_set url "$URL"; est_set db_propio no; est_set env_escrito no
    [[ "$EN_ARCHIVO" == "si" ]] && est_set env_previo si || est_set env_previo no
  fi
  est_set etapa iniciado
  # 2c. Fila de gateway
  consulta aplicar no; R="$(res)"
  case "$R" in
    CONFIGURADA|REACTIVADA) DB_CAMBIADA_AHORA=si; est_set db_propio si; info "fila de fe_gateway_config: $R.";;
    YA_CONFIGURADA) info "fila de fe_gateway_config: ya estaba configurada.";;
    SIN_PRIVILEGIO) est_set etapa compensado; fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;;
    CONFLICTO_CONFIG_DISTINTA) est_set etapa compensado; fallo "la empresa ya tiene otra configuración de gateway; no se sustituye sin decisión humana." 7;;
    *) est_set etapa compensado; fallo "resultado inesperado de la base: ${R:-vacío}." 7;;
  esac
  est_set etapa db_ok
  # 2d. app.env
  if [[ "$CAMBIA_ENV" == "si" ]]; then
    BAK="$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
    if ! copiar_seguro "$ENV_FILE" "$BAK"; then unset RUC PWD_; rm -f "$BAK"; compensar "copia de seguridad de app.env (modo 600)"; exit 9; fi
    info "copia previa de app.env: $(basename "$BAK") (modo 600)."
    if escribir_env "$RUC" "$PWD_"; then ENV_ESCRITO_AHORA=si; est_set env_escrito si; est_set etapa env_ok; info "app.env actualizado."
    else unset RUC PWD_; compensar "escritura de app.env"; exit 9; fi
  fi
  # 2e. Recreación de la app y verificación del valor realmente recibido por el contenedor (sin imprimirlo)
  if [[ "$CAMBIA_ENV" == "si" || "$EN_CONT" == "no" ]]; then
    info "recreando SOLO el contenedor app para que lea app.env…"
    if ! dc up -d --no-deps --force-recreate app >/dev/null 2>&1; then unset RUC PWD_; compensar "recreación de la app"; exit 9; fi
  else info "app.env y contenedor ya correctos: no se recrea app."; fi
  ESPERADO_R="${RUC:-$(valor_env "$K_RUC")}"; ESPERADO_P="${PWD_:-$(valor_env "$K_PWD")}"
  if [[ "$(valor_contenedor "$K_RUC")" == "$ESPERADO_R" && "$(valor_contenedor "$K_PWD")" == "$ESPERADO_P" && -n "$ESPERADO_R" && -n "$ESPERADO_P" ]]; then
    unset RUC PWD_ ESPERADO_R ESPERADO_P; est_set etapa ok
    info "VERIFICADO: el contenedor $APPC recibió las dos variables con el valor exacto de app.env (valores no mostrados). CONFIGURADO ≠ gateway operativo: falta la prueba real de autenticación (otra autorización)."
    exit 0
  fi
  unset RUC PWD_ ESPERADO_R ESPERADO_P; compensar "verificación de las variables en el contenedor"; exit 9
fi

# ── 3. Reversión: SOLO lo propio, nunca una configuración distinta ni credenciales preexistentes/compartidas ──
[[ -f "$ESTADO_FILE" && "$(est_get ref || true)" == "$REF" && "$(est_get url || true)" == "$URL" ]] || { info "SIN PROVENIENCIA: no hay registro de que este provisionador haya configurado «$REF»; no se cambia nada."; exit 11; }
PROPIO_DB="$(est_get db_propio || echo no)"; ENV_ESCRITO="$(est_get env_escrito || echo no)"
consulta revertir "$PROPIO_DB"; R="$(res)"; COMP="$(compartida)"
case "$R" in
  DESACTIVADA|YA_INACTIVA|SIN_FILA) info "fila de fe_gateway_config: $R.";;
  CONFIG_DISTINTA_NO_SE_TOCA) info "la fila de la empresa es distinta de la gestionada: NO se toca.";;
  NO_PROPIA_NO_SE_TOCA) info "la fila no fue creada por este provisionador: NO se toca.";;
  SIN_PRIVILEGIO) fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;;
  *) fallo "resultado inesperado de la base: ${R:-vacío}." 7;;
esac
if [[ "$ENV_ESCRITO" == "si" && "${COMP:-0}" == "0" && "$R" != "CONFIG_DISTINTA_NO_SE_TOCA" ]] && { tiene_env "$K_RUC" || tiene_env "$K_PWD"; }; then
  BAK="$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"; copiar_seguro "$ENV_FILE" "$BAK" || fallo "no se pudo crear la copia de app.env con modo 600; las variables NO se retiraron." 4
  escribir_env - - || fallo "no se pudo actualizar app.env (copia: $(basename "$BAK"))." 4
  est_set env_escrito no
  dc up -d --no-deps --force-recreate app >/dev/null 2>&1 || { echo "ESTADO FINAL: PARCIAL — app.env sin las variables pero la app NO se recreó; recupere con la copia $(basename "$BAK") o reintente --revertir." >&2; exit 9; }
  info "variables de credenciales retiradas (las había escrito este provisionador) y app recreada."
else
  info "app.env NO se modifica (credenciales preexistentes, compartidas con otra empresa [COMPARTIDA=${COMP:-0}] o no escritas por este provisionador)."
fi
est_set etapa revertido
info "REVERTIDO (solo lo propio). Si la fila se desactivó, el envío vuelve a responder 409 antes de reservar número."
exit 0
