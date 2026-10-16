#!/usr/bin/env bash
# Provisionamiento AUTOMATIZADO, idempotente y reversible del gateway de facturación electrónica de PRUEBA para una empresa (PRO-133, AUD-PRO133-R01/R02/R03). Lo ejecuta el AGENTE AUTORIZADO en la VM
# (Claude Code NO tiene acceso a la VM/Docker/PostgreSQL: este script queda versionado y probado con un docker simulado, pero NO se ha ejecutado contra el ambiente real).
#   provisionar-gateway-prueba.sh [--verificar|--aplicar|--revertir] [--razon-social "CASA MINGO"] [--ref CASAMINGO] [--stack /srv/stacks/distribuidora] [--credenciales-archivo ARCHIVO]
# · --verificar (por defecto) es SOLO LECTURA. --aplicar y --revertir cambian: (1) app.env (copia exclusiva .bak-AAAAMMDDhhmmss.XXXXXX, TODO con modo 600), (2) UNA fila de fe_gateway_config, (3) recrean SOLO la app.
# · La empresa se identifica por RAZÓN SOCIAL (debe haber exactamente una) y el provisionador registra su UUID REAL: la reversión solo actúa sobre esa misma empresa (UUID), nunca sobre otra aunque
#   comparta URL y referencia. Usuario/base de PostgreSQL salen de POSTGRES_USER/POSTGRES_DB del contenedor; el privilegio de escritura se verifica ANTES de cambiar nada.
# · CREDENCIALES: fuente privada (NEXIT_PROVISION_RUC / NEXIT_PROVISION_PASSWORD o archivo KEY=VALUE 600/400). Nunca en argumentos, Git, Linear ni logs. app.env usa comillas simples (env_file de Compose v2: valor
#   LITERAL); se rechazan valores irrepresentables; tras recrear la app se compara lo que el contenedor recibió (sin imprimirlo).
# · SQL: cada llamada a psql es UNA transacción (-1). Si la respuesta se pierde (cliente/conexión) NO se presume que la base no cambió: se RECONSULTA el estado; si tampoco se puede, se declara «ESTADO INDETERMINADO».
# · COMPENSACIÓN HONESTA: «COMPENSADO» solo se informa cuando BD, app.env y contenedor quedaron COMPROBADAMENTE recuperados; si no, «PARCIAL / INTERVENCIÓN NECESARIA» con los datos de recuperación (sin secretos).
#   El archivo de estado ($STACK/.provisionar-gateway-<REF>-<UUID empresa>.estado, 600) se crea ANTES de cualquier cambio; si falla su actualización posterior se compensa con el estado en memoria.
# · NO sobrescribe credenciales preexistentes distintas, NO sustituye una configuración de gateway distinta, NO ejecuta migrations, NO toca numeración ni documentos, NO hace login ni envíos.
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
ENV_FILE="$STACK/app.env"; K_RUC="NEXIT_FE_${REF}_RUC"; K_PWD="NEXIT_FE_${REF}_PASSWORD"; ESTADO_FILE=""   # ESTADO_FILE se fija al conocer el UUID de la empresa
dc() { ( cd "$STACK" && "$DOCKER" compose -p nexit -f compose.yml -f app.compose.yml "$@" ); }
fallo() { echo "ABORTADO: $1" >&2; exit "${2:-1}"; }
info() { echo "· $1"; }

# ── archivo de estado (sin secretos, modo 600). est_set DEVUELVE 1 si falla (no aborta): el llamador decide ──
est_get() { local l; [[ -f "$ESTADO_FILE" ]] || return 1; while IFS= read -r l || [[ -n "$l" ]]; do [[ "$l" == "$1="* ]] && { printf '%s' "${l#*=}"; return 0; }; done <"$ESTADO_FILE"; return 1; }
est_set() { # clave valor — reemplazo atómico, modo 600 explícito
  local tmp l; tmp="$(umask 077; mktemp "$ESTADO_FILE.XXXXXX")" || return 1
  { [[ -f "$ESTADO_FILE" ]] && while IFS= read -r l || [[ -n "$l" ]]; do [[ "$l" == "$1="* ]] || printf '%s\n' "$l"; done <"$ESTADO_FILE"; printf '%s=%s\n' "$1" "$2"; } >"$tmp" || { rm -f "$tmp"; return 1; }
  chmod 600 "$tmp" && mv "$tmp" "$ESTADO_FILE" || { rm -f "$tmp"; return 1; }
}
REG_FALLO=no
reg() { est_set "$1" "$2" || REG_FALLO=si; }   # registro DESPUÉS de un cambio: un fallo se anota y obliga a compensar con el estado en memoria

# ── app.env (valores solo por builtins; nunca se imprimen) ───────────────────────────────────────
valor_env() { # valor LITERAL (sin las comillas simples de env_file); 1 si la variable no existe
  local l v; while IFS= read -r l || [[ -n "$l" ]]; do
    if [[ "$l" == "$1="* ]]; then v="${l#*=}"; if [[ ${#v} -ge 2 && "${v:0:1}" == "'" && "${v: -1}" == "'" ]]; then v="${v:1:${#v}-2}"; fi; printf '%s' "$v"; return 0; fi
  done <"$ENV_FILE"; return 1
}
tiene_env() { local v; v="$(valor_env "$1")" || return 1; [[ -n "$v" ]]; }
representable() { local v="$1"; [[ -n "$v" && "$v" != *"'"* && "$v" != *$'\n'* && "$v" != *$'\r'* ]]; }
copiar_seguro() { ( umask 077; cat "$1" >"$2" ) && chmod 600 "$2"; }   # contenido con modo 600 desde el primer byte; falla si chmod falla
copia_exclusiva() { # copia de app.env con nombre ÚNICO (mktemp, exclusivo, 600): nunca sobrescribe una copia previa. Imprime la ruta.
  local b; b="$(umask 077; mktemp "$ENV_FILE.bak-$(date +%Y%m%d%H%M%S).XXXXXX")" || return 1
  copiar_seguro "$ENV_FILE" "$b" || { rm -f "$b"; return 1; }
  printf '%s' "$b"
}
escribir_env() { # $1 = ruc|- ; $2 = password|- ("-" quita las variables) ; reemplazo atómico con temporal 600
  local tmp l; tmp="$(umask 077; mktemp "$ENV_FILE.XXXXXX")" || return 1
  while IFS= read -r l || [[ -n "$l" ]]; do case "$l" in "$K_RUC="*|"$K_PWD="*) ;; *) printf '%s\n' "$l";; esac; done <"$ENV_FILE" >"$tmp" || { rm -f "$tmp"; return 1; }
  if [[ "$1" != "-" ]]; then printf "%s='%s'\n" "$K_RUC" "$1" >>"$tmp"; printf "%s='%s'\n" "$K_PWD" "$2" >>"$tmp"; fi
  chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE" || { rm -f "$tmp"; return 1; }
}
valor_contenedor() { "$DOCKER" exec "$APPC" printenv "$1" </dev/null 2>/dev/null; }
presentes_en_contenedor() { local a b; a="$(valor_contenedor "$K_RUC")"; b="$(valor_contenedor "$K_PWD")"; [[ -n "$a" && -n "$b" ]]; }
ausentes_en_contenedor() { local a b; a="$(valor_contenedor "$K_RUC")"; b="$(valor_contenedor "$K_PWD")"; [[ -z "$a" && -z "$b" ]]; }

# ── 0. Prerrequisitos (sin cambiar nada) ───────────────────────────────────────────────────────────
"$DOCKER" ps >/dev/null 2>&1 || fallo "no hay acceso a Docker con este usuario (se requiere el agente autorizado en la VM)." 3
[[ -f "$ENV_FILE" ]] || fallo "no existe $ENV_FILE (stack incorrecto: use --stack)." 3
PGU="$("$DOCKER" exec "$DBC" printenv POSTGRES_USER </dev/null 2>/dev/null | tr -d '\r\n')"; PGD="$("$DOCKER" exec "$DBC" printenv POSTGRES_DB </dev/null 2>/dev/null | tr -d '\r\n')"
[[ -n "$PGU" && -n "$PGD" ]] || fallo "no se pudo leer POSTGRES_USER/POSTGRES_DB del contenedor $DBC (identidad de la base no verificable; no se presume un rol)." 3

# ── SQL: una transacción por llamada (-1); código de salida y salida se conservan ───────────────────
SALIDA_SQL=""; CONSULTA_RC=0
consulta() { # $1 modo ; $2 propio (si|no) ; $3 empresa_id registrado (o vacío)
  SALIDA_SQL="$("$DOCKER" exec -i "$DBC" psql -X -q -At -1 -v ON_ERROR_STOP=1 -U "$PGU" -d "$PGD" -v modo="$1" -v razon="$RAZON" -v ref="$REF" -v url="$URL" -v timeout="$TIMEOUT" -v propio="${2:-no}" -v empresa_id="${3:-}" -f - <"$SQL" 2>&1)"; CONSULTA_RC=$?
}
res() { printf '%s\n' "$SALIDA_SQL" | sed -n 's/^RESULTADO=//p' | tail -1; }
compartida() { printf '%s\n' "$SALIDA_SQL" | sed -n 's/^COMPARTIDA=//p' | tail -1; }
empresa_de_salida() { printf '%s\n' "$SALIDA_SQL" | sed -n 's/^EMPRESA_ID=//p' | tail -1; }
estado_actual() { # estado de la fila por una consulta de SOLO LECTURA independiente → imprime p. ej. activa_igual, o NODET
  consulta verificar no; local r; r="$(res)"
  if [[ $CONSULTA_RC -eq 0 && "$r" == VERIFICADO:* ]]; then printf '%s' "${r#VERIFICADO:}"; else printf 'NODET'; fi
}
# Ejecuta una operación SQL de escritura. Si la respuesta se pierde NO se presume "no aplicada": se reconsulta y se infiere por el cambio de estado.
#   $1 aplicar|revertir ; $2 propio ; $3 empresa_id ; $4 estado ANTES (sin_fila|inactiva|activa_igual). Resultado en RES.
sql_escritura() {
  consulta "$1" "$2" "$3"; RES="$(res)"
  if [[ $CONSULTA_RC -eq 0 && -n "$RES" ]]; then return 0; fi
  local antes="$4" despues; despues="$(estado_actual)"
  if [[ "$despues" == "NODET" ]]; then RES="INDETERMINADO"; return 0; fi
  if [[ "$1" == aplicar ]]; then
    case "$antes>$despues" in
      sin_fila\>activa_igual) RES="CONFIGURADA";; inactiva\>activa_igual) RES="REACTIVADA";; activa_igual\>activa_igual) RES="YA_CONFIGURADA";;
      "$antes>$antes") RES="NO_APLICADA";; *) RES="INDETERMINADO";;
    esac
  else
    case "$antes>$despues" in
      activa_igual\>inactiva) RES="DESACTIVADA";; "$antes>$antes") RES="NO_REVERTIDA";; *) RES="INDETERMINADO";;
    esac
  fi
  [[ "$RES" == CONFIGURADA || "$RES" == REACTIVADA || "$RES" == DESACTIVADA ]] && info "la respuesta de la base se perdió; el cambio se comprobó por reconsulta: $RES."
  return 0
}

# ── 1. Identidad de la empresa y estado (solo lectura) ─────────────────────────────────────────────
consulta verificar no; ESTADO="$(res)"
[[ $CONSULTA_RC -eq 0 ]] || fallo "no se pudo consultar la base (la llamada a psql falló)." 5
case "$ESTADO" in
  EMPRESA_NO_UNICA:*) fallo "la razón social «$RAZON» no identifica UNA empresa (coincidencias: ${ESTADO#EMPRESA_NO_UNICA:}). Use --razon-social más específica." 5;;
  SIN_NEX047) fallo "fe_gateway_config no existe: NEX-047 no está aplicada (otra tarea; no se aplica aquí). No se cambió nada." 5;;
  VERIFICADO:*) ;;
  *) fallo "no se pudo consultar la base (resultado: ${ESTADO:-vacío})." 5;;
esac
FILA="${ESTADO#VERIFICADO:}"; EMPRESA_ID="$(empresa_de_salida)"
[[ "$EMPRESA_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fallo "la base no devolvió el UUID de la empresa; no se puede registrar la propiedad." 5
ESTADO_FILE="$STACK/.provisionar-gateway-$REF-$EMPRESA_ID.estado"
info "empresa «$RAZON» identificada de forma única (UUID $EMPRESA_ID); fila del gateway: $FILA."
tiene_env "$K_RUC" && tiene_env "$K_PWD" && EN_ARCHIVO=si || EN_ARCHIVO=no
presentes_en_contenedor && EN_CONT=si || EN_CONT=no
info "credenciales $K_RUC/$K_PWD en app.env: $EN_ARCHIVO; en el contenedor $APPC: $EN_CONT."
ETAPA="$(est_get etapa || true)"
[[ -n "$ETAPA" && "$ETAPA" != "ok" && "$ETAPA" != "compensado" && "$ETAPA" != "revertido" ]] && info "ATENCIÓN: una ejecución anterior quedó en la etapa «$ETAPA» (estado parcial): reejecute --aplicar (converge) o --revertir."

if [[ "$MODO" == "verificar" ]]; then
  [[ "$FILA" == "activa_igual" && "$EN_CONT" == "si" ]] && { info "LISTO: configuración activa y credenciales presentes en el contenedor (no prueba que el gateway responda)."; exit 0; }
  info "PENDIENTE: ejecute con --aplicar (agente autorizado)."; exit 10
fi

# ── compensación VERIFICADA (solo cambios PROPIOS de esta ejecución; usa el estado en memoria, no el archivo) ──
BAK=""; ENV_ESCRITO_AHORA=no; DB_CAMBIADA_AHORA=no; RECREACION_INTENTADA=no
parcial_final() { # $1 detalle
  est_set etapa parcial_intervencion >/dev/null 2>&1 || true
  echo "ESTADO FINAL: PARCIAL / INTERVENCIÓN NECESARIA — $1. Datos de recuperación (sin secretos): empresa_id=$EMPRESA_ID ref=$REF fila_propia=$DB_CAMBIADA_AHORA env_escrito=$ENV_ESCRITO_AHORA copia_app_env=${BAK:+$(basename "$BAK")}. No se reinició ningún envío; revise antes de reejecutar." >&2
  exit 12
}
compensar() { # $1 = motivo
  local ok=si det=""
  if [[ "$ENV_ESCRITO_AHORA" == "si" ]]; then
    if [[ -n "$BAK" && -f "$BAK" ]] && copiar_seguro "$BAK" "$ENV_FILE" && cmp -s "$BAK" "$ENV_FILE"; then det="app.env restaurado y verificado"; else ok=no; det="app.env NO restaurado (copia: $(basename "$BAK"))"; fi
  fi
  if [[ "$DB_CAMBIADA_AHORA" == "si" ]]; then
    sql_escritura revertir si "$EMPRESA_ID" activa_igual
    local fx; fx="$(estado_actual)"
    if [[ "$fx" == "inactiva" ]]; then det="$det; fila desactivada y verificada"; else ok=no; det="$det; fila NO verificada como desactivada (resultado ${RES:-?}, estado leído $fx)"; fi
  fi
  if [[ "$RECREACION_INTENTADA" == "si" ]]; then
    if [[ "$ok" == "si" ]] && dc up -d --no-deps --force-recreate app >/dev/null 2>&1 && ausentes_en_contenedor; then det="$det; contenedor recreado sin las variables nuevas y verificado"; else ok=no; det="$det; contenedor NO comprobado sin las variables nuevas"; fi
  fi
  if [[ "$ok" == "si" ]]; then
    est_set etapa compensado >/dev/null 2>&1 || true
    echo "ESTADO FINAL: COMPENSADO tras el fallo «$1» (comprobado: ${det#; }). La app NO quedó configurada con el gateway; reejecute --aplicar." >&2
    exit 9
  fi
  parcial_final "fallo «$1»; la compensación no se pudo comprobar (${det#; })"
}
tras_cambio() { # tras un cambio: si el registro de estado falló, compensar con el estado en memoria
  if [[ "$REG_FALLO" == "si" ]]; then unset RUC PWD_ ESPERADO_R ESPERADO_P; compensar "registro del archivo de estado"; fi
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
  # 2a. PRE-VALIDACIONES (nada cambia todavía)
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
  # 2b. Archivo de estado: se crea/actualiza ANTES de cualquier cambio (si falla aquí no hay nada que recuperar)
  if [[ "$ETAPA" == "" || "$ETAPA" == "compensado" || "$ETAPA" == "revertido" ]]; then
    est_set empresa_id "$EMPRESA_ID" && est_set ref "$REF" && est_set url "$URL" && est_set db_propio no && est_set env_escrito no && est_set env_previo "$([[ "$EN_ARCHIVO" == "si" ]] && echo si || echo no)" || fallo "no se pudo crear el archivo de estado; no se cambió nada." 4
  fi
  est_set etapa iniciado || fallo "no se pudo actualizar el archivo de estado; no se cambió nada." 4
  # 2c. Fila de gateway (una transacción; resultado perdido → reconsulta; nunca se presume «no aplicada»)
  sql_escritura aplicar no "$EMPRESA_ID" "$FILA"; R="$RES"
  case "$R" in
    CONFIGURADA|REACTIVADA) DB_CAMBIADA_AHORA=si; reg db_propio si; info "fila de fe_gateway_config: $R.";;
    YA_CONFIGURADA) info "fila de fe_gateway_config: ya estaba configurada.";;
    NO_APLICADA) est_set etapa compensado >/dev/null 2>&1; fallo "la base no registró el cambio (comprobado por reconsulta); no se cambió nada." 7;;
    INDETERMINADO) reg db_indeterminado si; echo "ESTADO INDETERMINADO: no se pudo confirmar si la fila de fe_gateway_config de la empresa $EMPRESA_ID cambió (la respuesta se perdió y la reconsulta falló). NO se tocó app.env ni la app. Verifique el estado de la base y use --verificar antes de reintentar." >&2; exit 12;;
    SIN_PRIVILEGIO) est_set etapa compensado >/dev/null 2>&1; fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;;
    CONFLICTO_CONFIG_DISTINTA) est_set etapa compensado >/dev/null 2>&1; fallo "la empresa ya tiene otra configuración de gateway; no se sustituye sin decisión humana." 7;;
    *) est_set etapa compensado >/dev/null 2>&1; fallo "resultado inesperado de la base: ${R:-vacío}." 7;;
  esac
  reg etapa db_ok; tras_cambio
  # 2d. app.env (copia exclusiva 600 → escritura atómica)
  if [[ "$CAMBIA_ENV" == "si" ]]; then
    if ! BAK="$(copia_exclusiva)"; then unset RUC PWD_; BAK=""; compensar "copia de seguridad de app.env (modo 600)"; fi
    info "copia previa de app.env: $(basename "$BAK") (modo 600, nombre exclusivo)."
    if escribir_env "$RUC" "$PWD_"; then ENV_ESCRITO_AHORA=si; reg env_escrito si; reg etapa env_ok; info "app.env actualizado."; tras_cambio
    else unset RUC PWD_; compensar "escritura de app.env"; fi
  fi
  # 2e. Recreación de la app y verificación del valor realmente recibido por el contenedor (sin imprimirlo)
  if [[ "$CAMBIA_ENV" == "si" || "$EN_CONT" == "no" ]]; then
    info "recreando SOLO el contenedor app para que lea app.env…"
    RECREACION_INTENTADA=si
    if ! dc up -d --no-deps --force-recreate app >/dev/null 2>&1; then unset RUC PWD_; compensar "recreación de la app"; fi
  else info "app.env y contenedor ya correctos: no se recrea app."; fi
  ESPERADO_R="${RUC:-$(valor_env "$K_RUC")}"; ESPERADO_P="${PWD_:-$(valor_env "$K_PWD")}"
  if [[ "$(valor_contenedor "$K_RUC")" == "$ESPERADO_R" && "$(valor_contenedor "$K_PWD")" == "$ESPERADO_P" && -n "$ESPERADO_R" && -n "$ESPERADO_P" ]]; then
    unset RUC PWD_ ESPERADO_R ESPERADO_P; reg etapa ok; tras_cambio
    info "VERIFICADO: el contenedor $APPC recibió las dos variables con el valor exacto de app.env (valores no mostrados). CONFIGURADO ≠ gateway operativo: falta la prueba real de autenticación (otra autorización)."
    exit 0
  fi
  unset RUC PWD_ ESPERADO_R ESPERADO_P; compensar "verificación de las variables en el contenedor"
fi

# ── 3. Reversión: SOLO lo propio de ESTA empresa (UUID), nunca otra configuración ni credenciales preexistentes/compartidas ──
[[ -f "$ESTADO_FILE" && "$(est_get empresa_id || true)" == "$EMPRESA_ID" && "$(est_get ref || true)" == "$REF" && "$(est_get url || true)" == "$URL" ]] || { info "SIN PROVENIENCIA: no hay registro de que este provisionador haya configurado «$REF» para la empresa $EMPRESA_ID; no se cambia nada."; exit 11; }
PROPIO_DB="$(est_get db_propio || echo no)"; ENV_ESCRITO="$(est_get env_escrito || echo no)"
# El SQL compara el UUID REGISTRADO con el de la empresa que identifica la razón social.
sql_escritura revertir "$PROPIO_DB" "$(est_get empresa_id || true)" "$FILA"; R="$RES"; COMP="$(compartida)"
case "$R" in
  DESACTIVADA|YA_INACTIVA|SIN_FILA) info "fila de fe_gateway_config: $R.";;
  CONFIG_DISTINTA_NO_SE_TOCA) info "la fila de la empresa es distinta de la gestionada: NO se toca.";;
  NO_PROPIA_NO_SE_TOCA) info "la fila no fue creada por este provisionador: NO se toca.";;
  EMPRESA_DISTINTA_NO_SE_TOCA) fallo "la empresa identificada no es la registrada por el provisionador; no se cambió nada." 11;;
  NO_REVERTIDA) fallo "la base no registró la desactivación (comprobado por reconsulta); no se cambió nada." 7;;
  INDETERMINADO) echo "ESTADO INDETERMINADO: no se pudo confirmar si la fila de la empresa $EMPRESA_ID fue desactivada. NO se tocó app.env. Verifique con --verificar antes de reintentar." >&2; exit 12;;
  SIN_PRIVILEGIO) fallo "el usuario de base «$PGU» no puede escribir en fe_gateway_config; no se cambió nada." 7;;
  *) fallo "resultado inesperado de la base: ${R:-vacío}." 7;;
esac
if [[ "$ENV_ESCRITO" == "si" && "${COMP:-0}" == "0" && "$R" != "CONFIG_DISTINTA_NO_SE_TOCA" ]] && { tiene_env "$K_RUC" || tiene_env "$K_PWD"; }; then
  BAK="$(copia_exclusiva)" || fallo "no se pudo crear la copia de app.env con modo 600; las variables NO se retiraron." 4
  escribir_env - - || fallo "no se pudo actualizar app.env (copia: $(basename "$BAK"))." 4
  est_set env_escrito no || echo "ATENCIÓN: no se pudo actualizar el archivo de estado; datos: empresa_id=$EMPRESA_ID env_escrito=no." >&2
  dc up -d --no-deps --force-recreate app >/dev/null 2>&1 || { echo "ESTADO FINAL: PARCIAL / INTERVENCIÓN NECESARIA — app.env sin las variables pero la app NO se recreó; recupere con la copia $(basename "$BAK") o reintente --revertir. empresa_id=$EMPRESA_ID" >&2; exit 12; }
  ausentes_en_contenedor || { echo "ESTADO FINAL: PARCIAL / INTERVENCIÓN NECESARIA — la app se recreó pero el contenedor aún tiene las variables. empresa_id=$EMPRESA_ID" >&2; exit 12; }
  info "variables de credenciales retiradas (las había escrito este provisionador) y app recreada."
else
  info "app.env NO se modifica (credenciales preexistentes, compartidas con otra empresa [COMPARTIDA=${COMP:-0}] o no escritas por este provisionador)."
fi
est_set etapa revertido || echo "ATENCIÓN: no se pudo actualizar el archivo de estado (etapa revertido)." >&2
info "REVERTIDO (solo lo propio). Si la fila se desactivó, el envío vuelve a responder 409 antes de reservar número."
exit 0
