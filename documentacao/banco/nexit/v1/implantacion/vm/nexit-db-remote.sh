#!/usr/bin/env bash
# =====================================================================
# nexit-db-remote.sh — ÚNICO punto de entrada de la implantación del banco Nexit en la VM.
# Se instala en la VM como "comando forzado" de una clave SSH dedicada (ver 05-IMPLANTACION-AUTOMATIZADA.md):
#     command="/opt/nexit-deploy/nexit-db-remote.sh",restrict ssh-ed25519 AAAA... nexit-github-deploy
# Así la clave del flujo de GitHub NO abre un shell: solo puede pedir los subcomandos de la lista blanca de abajo.
# Estado: PREPARADO, NO INSTALADO NI EJECUTADO en la VM (requiere autorización expresa del responsable).
#
# Subcomandos (todos con argumentos validados; ninguno interpreta texto como código):
#   entorno                       verificación de solo lectura del entorno (contenedor, versión, espacio, migraciones registradas)
#   recibir <sha> <sha256-tar>    recibe por stdin el paquete (tar.gz) de la versión y lo valida
#   planificar <sha>              lista las migraciones pendientes (no cambia nada)
#   respaldar <sha>               pg_dump -Fc + globals + sha256 + listado de verificación
#   probar-restauracion <sha>     restaura ese respaldo en un entorno DESCARTABLE y compara conteos/estructura
#   copiar-externo <sha>          copia respaldo + sha256 a almacenamiento externo (gs:// o file://) y verifica el hash
#   migrar <sha>                  aplica las migraciones pendientes (solo si respaldo, restauración y copia externa están al día)
#   verificar <sha> [produccion]  valida la estructura instalada (scripts/verificar-instalacion.sh)
#   pruebas-post <sha>            verificación + pruebas funcionales con el rol nexit_runtime (todo en una transacción revertida)
#   sembrar-catalogos <sha>       aplica S-001 (catálogos globales; idempotente)
#   inicializar-empresa           crea la empresa real y su administrador (datos por stdin; el HASH por entorno, nunca por argv)
#   definir-clave-runtime         define la contraseña del rol nexit_runtime (por stdin; sin registrar la sentencia)
#   restaurar-nueva <archivo>     restaura un respaldo en una base NUEVA (nunca sobrescribe 'nexit'); el cambio de base lo hace un humano
# Configuración: /etc/nexit/deploy.conf (propiedad de root, no editable por el usuario de despliegue). Variables:
#   NEXIT_MODO=docker|local (local solo para pruebas)   NEXIT_DB_CONTENEDOR=nexit-db   NEXIT_DB_NOMBRE=nexit   NEXIT_DB_ADMIN=nexit_app
#   NEXIT_RAIZ=/var/lib/nexit-deploy   NEXIT_RESPALDOS=/var/backups/nexit   NEXIT_BACKUP_URI=gs://bucket/ruta   NEXIT_EXIGE_COPIA_EXTERNA=1
# =====================================================================
set -euo pipefail
umask 077
CONF="${NEXIT_DEPLOY_CONF:-/etc/nexit/deploy.conf}"
[[ -r "$CONF" ]] || { echo "ERROR: falta $CONF" >&2; exit 70; }
# shellcheck disable=SC1090
source "$CONF"
MODO="${NEXIT_MODO:-docker}"; CONT="${NEXIT_DB_CONTENEDOR:-nexit-db}"; DBN="${NEXIT_DB_NOMBRE:-nexit}"; ADMIN="${NEXIT_DB_ADMIN:-nexit_app}"
RAIZ="${NEXIT_RAIZ:-/var/lib/nexit-deploy}"; RESP="${NEXIT_RESPALDOS:-/var/backups/nexit}"; URI="${NEXIT_BACKUP_URI:-}"; EXIGE_EXT="${NEXIT_EXIGE_COPIA_EXTERNA:-1}"
MAX_EDAD_MIN="${NEXIT_MAX_EDAD_MINUTOS:-360}"      # respaldo/restauración/copia deben ser de las últimas 6 h para poder migrar
mkdir -p "$RAIZ/releases" "$RAIZ/state" "$RAIZ/log" "$RESP"

die()  { echo "ERROR: $1" >&2; exit "${2:-1}"; }
log()  { echo "[$(date -u +%FT%TZ)] $*"; }
CMD="${SSH_ORIGINAL_COMMAND:-$*}"
# Separar subcomando y argumentos SIN evaluar nada (read con IFS por espacios; sin eval, sin expansión de globs).
set -f; read -r -a ARGV <<<"$CMD"; set +f
SUB="${ARGV[0]:-}"; A1="${ARGV[1]:-}"; A2="${ARGV[2]:-}"
[[ ${#ARGV[@]} -le 3 ]] || die "demasiados argumentos" 64
re_sha='^[0-9a-f]{40}$'; re_sha256='^[0-9a-f]{64}$'
LOGF="$RAIZ/log/$(date -u +%Y%m%dT%H%M%SZ)-${SUB:-x}.log"
exec > >(tee -a "$LOGF") 2>&1

# --- acceso a PostgreSQL (docker exec en la VM; "local" solo para el ensayo en un clúster descartable) ---
PGA() { # psql administrador; NEX_* se pasan por entorno (no por argv) con -e
  if [[ "$MODO" == docker ]]; then docker exec -i -e NEX_HASH -e NEX_PW "$CONT" psql -X -q -At -v ON_ERROR_STOP=1 -U "$ADMIN" -d "$DBN" "$@"
  else psql -X -q -At -v ON_ERROR_STOP=1 -d "$DBN" "$@"; fi; }
EN_DB() { # ejecutar un comando con las variables PG* del administrador (contenedor o local)
  if [[ "$MODO" == docker ]]; then docker exec -i -e PGUSER="$ADMIN" -e PGDATABASE="$DBN" "$CONT" "$@"; else env PGDATABASE="$DBN" "$@"; fi; }
REL="$RAIZ/releases/${A1}/v1"
preparar_release_en_db() { # deja la versión disponible donde corre el cliente psql; imprime la ruta
  if [[ "$MODO" == docker ]]; then
    docker exec "$CONT" rm -rf /tmp/nexit-release >/dev/null; docker cp "$REL/." "$CONT:/tmp/nexit-release/" >/dev/null; echo /tmp/nexit-release
  else echo "$REL"; fi; }
limpiar_release_en_db() { [[ "$MODO" == docker ]] && docker exec "$CONT" rm -rf /tmp/nexit-release >/dev/null || true; }
flag_real() { [[ "$DBN" == "nexit" ]] && echo "--permitir-banco-real" || true; }
exigir_sha() { [[ "$A1" =~ $re_sha ]] || die "sha inválido (se esperan 40 hex)" 64; [[ -d "$REL" ]] || die "la versión $A1 no fue recibida (ejecute 'recibir')" 65; }
marca() { echo "$(date -u +%s) $2" >"$RAIZ/state/$1"; }
marca_reciente() { # archivo de estado existe y es de los últimos MAX_EDAD_MIN minutos
  local f="$RAIZ/state/$1"; [[ -s "$f" ]] || return 1; local t; t="$(cut -d' ' -f1 "$f")"; (( $(date -u +%s) - t <= MAX_EDAD_MIN * 60 )); }
bloquear() { exec 9>"$RAIZ/lock"; flock -n 9 || die "hay otra operación de implantación en curso" 75; }

case "$SUB" in
entorno)
  log "modo=$MODO contenedor=$CONT base=$DBN"
  if [[ "$MODO" == docker ]]; then
    [[ "$(docker inspect -f '{{.State.Running}}' "$CONT")" == true ]] || die "el contenedor $CONT no está en ejecución"
    docker inspect -f 'imagen={{.Config.Image}} estado={{.State.Status}}' "$CONT"
  fi
  PGA -c "select 'postgres='||current_setting('server_version')||' base='||current_database()||' tamaño='||pg_size_pretty(pg_database_size(current_database()))"
  PGA -c "select 'superusuario_admin='||rolsuper from pg_roles where rolname = current_user"
  PGA -c "select 'nexit_runtime='||coalesce((select 'existe' from pg_roles where rolname='nexit_runtime'),'no existe')"
  if [[ "$(PGA -c "select to_regclass('public.schema_migrations') is not null")" == t ]]; then
    PGA -c "select 'migración registrada '||version from schema_migrations order by version"
  else echo "schema_migrations no existe (base sin migraciones de Nexit)"; fi
  libre_mb="$(df -Pm "$RESP" | awk 'NR==2{print $4}')"; echo "espacio libre en respaldos: ${libre_mb} MB"; (( libre_mb > 2048 )) || die "menos de 2 GB libres en $RESP"
  ;;

recibir)
  [[ "$A1" =~ $re_sha && "$A2" =~ $re_sha256 ]] || die "uso: recibir <sha-git-40> <sha256-del-tar>" 64
  bloquear
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  head -c 20971520 >"$T/p.tgz"                                  # máximo 20 MB
  [[ "$(sha256sum "$T/p.tgz" | cut -d' ' -f1)" == "$A2" ]] || die "el hash del paquete no coincide"
  # solo archivos regulares y carpetas bajo v1/, sin rutas absolutas ni '..', sin enlaces
  tar -tzvf "$T/p.tgz" | awk '{print substr($1,1,1)}' | grep -qv '^[-d]$' && die "el paquete contiene enlaces o archivos especiales"
  tar -tzf "$T/p.tgz" | grep -Eq '(^/|(^|/)\.\.(/|$))' && die "el paquete contiene rutas peligrosas"
  tar -tzf "$T/p.tgz" | grep -Ev '^(\./)?v1(/|$)' | grep -q . && die "el paquete contiene rutas fuera de v1/"
  rm -rf "$RAIZ/releases/$A1"; mkdir -p "$RAIZ/releases/$A1"
  tar -xzf "$T/p.tgz" -C "$RAIZ/releases/$A1" --no-same-owner --no-same-permissions
  [[ -d "$RAIZ/releases/$A1/v1/migraciones" && -x "$RAIZ/releases/$A1/v1/scripts/aplicar-migraciones.sh" ]] || die "paquete incompleto"
  log "versión $A1 recibida: $(ls "$RAIZ/releases/$A1/v1/migraciones" | wc -l) migraciones"
  ;;

planificar)
  exigir_sha; R="$(preparar_release_en_db)"
  EN_DB bash "$R/scripts/aplicar-migraciones.sh" $(flag_real) --solo-listar
  limpiar_release_en_db
  ;;

respaldar)
  exigir_sha; bloquear
  F="$RESP/$(date -u +%Y%m%dT%H%M%SZ)-pre-$A1.dump"
  log "respaldo → $F"
  if [[ "$MODO" == docker ]]; then
    docker exec "$CONT" pg_dump -U "$ADMIN" -Fc -d "$DBN" >"$F"
    docker exec "$CONT" pg_dumpall -U "$ADMIN" --globals-only >"$F.globals.sql"
  else pg_dump -Fc -d "$DBN" >"$F"; pg_dumpall --globals-only >"$F.globals.sql"; fi
  [[ -s "$F" ]] || die "respaldo vacío"
  (cd "$RESP" && sha256sum "$(basename "$F")" "$(basename "$F").globals.sql" >"$(basename "$F").sha256")
  if [[ "$MODO" == docker ]]; then n="$(docker exec -i "$CONT" pg_restore --list <"$F" | wc -l)"; else n="$(pg_restore --list "$F" | wc -l)"; fi
  (( n > 10 )) || die "el listado del respaldo es sospechosamente corto ($n)"
  log "respaldo verificado por listado ($n entradas) y sha256 registrado"
  marca "$A1.respaldo" "$F"
  ;;

probar-restauracion)
  exigir_sha; bloquear
  [[ -s "$RAIZ/state/$A1.respaldo" ]] || die "no hay respaldo para $A1 (ejecute 'respaldar')"
  F="$(cut -d' ' -f2- "$RAIZ/state/$A1.respaldo")"; [[ -s "$F" ]] || die "no existe el respaldo $F"
  (cd "$RESP" && sha256sum -c "$(basename "$F").sha256" >/dev/null) || die "el sha256 del respaldo no coincide"
  CONTEOS="select string_agg(format('%s=%s', relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', relname), false, true, '')))[1]::text), ',' order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
  ORIG="$(PGA -c "$CONTEOS")"
  if [[ "$MODO" == docker ]]; then
    IMG="$(docker inspect -f '{{.Config.Image}}' "$CONT")"; TMPC="nexit-restore-test-$$"
    # entorno aislado: sin red, contraseña aleatoria efímera, se destruye al terminar
    docker run -d --rm --name "$TMPC" --network none -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)" "$IMG" >/dev/null
    trap 'docker rm -f "$TMPC" >/dev/null 2>&1 || true' EXIT
    for _ in $(seq 1 60); do docker exec "$TMPC" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    docker exec "$TMPC" pg_isready -U postgres >/dev/null || die "el entorno de restauración no arrancó"
    docker exec -i "$TMPC" psql -X -q -U postgres -d postgres <"$F.globals.sql" >/dev/null 2>&1 || true   # roles (los ya existentes dan aviso, no error fatal)
    docker exec "$TMPC" createdb -U postgres restauracion_prueba
    docker exec -i "$TMPC" pg_restore -U postgres -d restauracion_prueba --no-owner <"$F" >/dev/null 2>"$RAIZ/log/restauracion-$A1.err" || log "pg_restore terminó con avisos (ver restauracion-$A1.err)"
    REST="$(docker exec "$TMPC" psql -X -q -At -U postgres -d restauracion_prueba -c "$CONTEOS")"
    VER=ok
  else
    TMPDB="${DBN}_restauracion_prueba"
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $TMPDB WITH (FORCE)" -c "CREATE DATABASE $TMPDB"
    pg_restore -d "$TMPDB" --no-owner "$F" >/dev/null 2>"$RAIZ/log/restauracion-$A1.err" || log "pg_restore terminó con avisos"
    REST="$(psql -X -q -At -d "$TMPDB" -c "$CONTEOS")"
    VER=ok
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $TMPDB WITH (FORCE)"
  fi
  [[ "$ORIG" == "$REST" ]] || die "la base restaurada difiere en conteos de tablas"
  [[ -n "$ORIG" ]] || log "AVISO: la base no tiene tablas; la prueba solo comprueba que el respaldo se restaura"
  log "restauración probada: conteos idénticos en todas las tablas (la estructura Nexit se verifica después de migrar)"
  marca "$A1.restauracion-ok" "$(sha256sum "$F" | cut -d' ' -f1)"
  ;;

copiar-externo)
  exigir_sha; [[ -n "$URI" ]] || die "NEXIT_BACKUP_URI no configurado" 78
  [[ -s "$RAIZ/state/$A1.respaldo" ]] || die "no hay respaldo para $A1"
  F="$(cut -d' ' -f2- "$RAIZ/state/$A1.respaldo")"; B="$(basename "$F")"
  case "$URI" in
    gs://*) gcloud storage cp "$F" "$F.globals.sql" "$F.sha256" "$URI/" >/dev/null
            [[ "$(gcloud storage cat "$URI/$B" | sha256sum | cut -d' ' -f1)" == "$(sha256sum "$F" | cut -d' ' -f1)" ]] || die "la copia externa no coincide";;
    file://*) D="${URI#file://}"; mkdir -p "$D"; cp "$F" "$F.globals.sql" "$F.sha256" "$D/"
            [[ "$(sha256sum "$D/$B" | cut -d' ' -f1)" == "$(sha256sum "$F" | cut -d' ' -f1)" ]] || die "la copia externa no coincide";;
    *) die "esquema de NEXIT_BACKUP_URI no soportado";;
  esac
  log "copia externa verificada por sha256: $URI/$B"
  marca "$A1.externo-ok" "$URI/$B"
  ;;

migrar)
  exigir_sha; bloquear
  marca_reciente "$A1.respaldo" || die "no hay un respaldo reciente (< ${MAX_EDAD_MIN} min) para $A1" 73
  marca_reciente "$A1.restauracion-ok" || die "falta la prueba de restauración reciente para $A1" 73
  [[ "$EXIGE_EXT" != 1 ]] || marca_reciente "$A1.externo-ok" || die "falta la copia externa reciente para $A1" 73
  [[ "$(sha256sum "$(cut -d' ' -f2- "$RAIZ/state/$A1.respaldo")" | cut -d' ' -f1)" == "$(cut -d' ' -f2 "$RAIZ/state/$A1.restauracion-ok")" ]] || die "el respaldo probado no es el actual" 73
  R="$(preparar_release_en_db)"
  log "aplicando migraciones pendientes (una transacción por archivo; checksums SHA-256)"
  EN_DB bash "$R/scripts/aplicar-migraciones.sh" $(flag_real)
  limpiar_release_en_db
  marca "$A1.migrada" "ok"
  log "migraciones aplicadas"
  ;;

verificar)
  exigir_sha; R="$(preparar_release_en_db)"
  EN_DB bash "$R/scripts/verificar-instalacion.sh" $([[ "$A2" == produccion ]] && echo --produccion)
  limpiar_release_en_db
  ;;

pruebas-post)
  exigir_sha; R="$(preparar_release_en_db)"
  EN_DB bash "$R/scripts/verificar-instalacion.sh"
  # Prueba funcional con el rol de la aplicación, sin crear datos: todo dentro de una transacción que se revierte.
  PGA <<'SQL'
BEGIN;
SET LOCAL ROLE nexit_runtime;
SELECT 'runtime lee clientes: ' || count(*) FROM clientes;
SELECT 'runtime lee dashboard: ' || count(*) FROM v_dashboard_resumen;
SELECT 'runtime lee kardex: ' || count(*) FROM v_kardex;
DO $$ BEGIN
  BEGIN UPDATE stock_saldos SET cantidad = cantidad; RAISE EXCEPTION 'FALLA: el runtime pudo escribir stock_saldos';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: el runtime NO escribe stock_saldos directamente'; END;
  BEGIN PERFORM demo_reiniciar('demo-modelo'); RAISE EXCEPTION 'FALLA: el runtime pudo ejecutar demo_reiniciar';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: el runtime NO ejecuta funciones DEMO'; END;
END $$;
ROLLBACK;
SQL
  limpiar_release_en_db
  log "pruebas posteriores OK"
  ;;

sembrar-catalogos)
  exigir_sha; bloquear; R="$(preparar_release_en_db)"
  PGA -f "$R/seeds/S-001-catalogos-globales.sql" >/dev/null   # idempotente; solo catálogos globales (no crea empresas ni datos de demostración)
  limpiar_release_en_db; log "catálogos globales aplicados (S-001)"
  ;;

inicializar-empresa)
  bloquear
  # stdin: líneas clave=valor (codigo, razon_social, ruc, dv, usuario, nombre, apellido, email, hash). Se validan por clave; nada se evalúa.
  declare -A V=(); while IFS= read -r l; do
    [[ "$l" =~ ^(codigo|razon_social|ruc|dv|usuario|nombre|apellido|email|hash)=(.*)$ ]] || die "línea inválida en la entrada"
    V[${BASH_REMATCH[1]}]="${BASH_REMATCH[2]}"; done
  for k in codigo razon_social ruc dv usuario nombre hash; do [[ -n "${V[$k]:-}" ]] || die "falta $k"; done
  export NEX_HASH="${V[hash]}"
  PGA -v codigo="${V[codigo]}" -v razon="${V[razon_social]}" -v ruc="${V[ruc]}" -v dv="${V[dv]}" -v usuario="${V[usuario]}" -v nombre="${V[nombre]}" -v apellido="${V[apellido]:-}" -v email="${V[email]:-}" <<'SQL'
\getenv h NEX_HASH
SELECT 'empresa_id=' || nex_inicializar_empresa(:'codigo', :'razon', :'ruc', :'dv', :'usuario', :'nombre', NULLIF(:'apellido', ''), NULLIF(:'email', ''), :'h');
SQL
  unset NEX_HASH
  ;;

definir-clave-runtime)
  bloquear
  IFS= read -r NEX_PW || true; [[ ${#NEX_PW} -ge 24 ]] || die "la contraseña del rol debe tener al menos 24 caracteres" 64
  export NEX_PW
  PGA <<'SQL'
SET log_statement = 'none'; SET log_min_duration_statement = -1; SET log_min_error_statement = 'panic';
\getenv pw NEX_PW
ALTER ROLE nexit_runtime PASSWORD :'pw';
SQL
  unset NEX_PW; log "contraseña de nexit_runtime definida (no se registró la sentencia)"
  ;;

restaurar-nueva)
  [[ "$A1" =~ ^[0-9]{8}T[0-9]{6}Z-pre-[0-9a-f]{40}\.dump$ ]] || die "nombre de respaldo inválido" 64
  F="$RESP/$A1"; [[ -s "$F" ]] || die "no existe $F"; bloquear
  (cd "$RESP" && sha256sum -c "$A1.sha256" >/dev/null) || die "sha256 no coincide"
  N="nexit_restaurada_$(date -u +%Y%m%d%H%M%S)"
  if [[ "$MODO" == docker ]]; then
    docker exec "$CONT" createdb -U "$ADMIN" "$N"; docker exec -i "$CONT" pg_restore -U "$ADMIN" -d "$N" --no-owner <"$F" || true
  else psql -X -q -d postgres -c "CREATE DATABASE $N"; pg_restore -d "$N" --no-owner "$F" || true; fi
  log "restaurado en la base NUEVA $N. No se tocó '$DBN'. Para volver a producción: detener la aplicación, renombrar bases y reiniciar (ver runbook)."
  ;;

*) die "subcomando no permitido: '${SUB}'" 64 ;;
esac
