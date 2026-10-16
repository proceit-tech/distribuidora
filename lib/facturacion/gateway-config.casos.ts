/**
 * PRO-133 — prontitud del gateway de PRUEBA y provisionamiento automatizado. Sin red, sin PostgreSQL, sin Docker real y sin credenciales reales: el estado se calcula con una base simulada y el
 * script de provisionamiento se ejecuta (bash real) contra un «docker» SIMULADO con credenciales SINTÉTICAS. NO se ejecutó contra la VM; el parser real de Docker Compose y PostgreSQL NO están
 * disponibles aquí: el «docker» simulado interpreta app.env con la gramática documentada de env_file (comillas simples = valor literal). «CONFIGURADO» no prueba que el gateway responda.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { estadoGateway } from "@/lib/facturacion/envio";
import { ESTADOS_GATEWAY, puedeEnviarPorGateway } from "@/lib/facturacion/gateway-estado";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";

const dbCon = (rows: unknown[] | Error) => ({ async query() { if (rows instanceof Error) throw rows; return { rows }; } }) as never;

// «docker» simulado: estado en archivos; registra TODAS las llamadas (argumentos) en un log para comprobar que ningún secreto viaja por ellos. Interpreta app.env como env_file de Compose:
// valor entre comillas simples = LITERAL (sin interpolación ni escapes). El contenedor ve una FOTO de app.env tomada al recrearlo (no el archivo en vivo).
// Fallos adversariales por banderas: perder_respuesta=<modo> (el cambio SE aplica pero psql sale con error y sin salida), caido_tras_perder (psql queda caído), psql_caido, falla_recreate (siempre),
// falla_recreate_una_vez, valor_contenedor_distinto, compose_invalido.
const DOCKER_FALSO = `#!/usr/bin/env bash
F="$FAKE_DIR"; echo "$*" >>"$F/log"
valor() { local l v; while IFS= read -r l || [[ -n "$l" ]]; do if [[ "$l" == "$1="* ]]; then v="\${l#*=}"; if [[ \${#v} -ge 2 && "\${v:0:1}" == "'" && "\${v: -1}" == "'" ]]; then v="\${v:1:\${#v}-2}"; fi; printf '%s' "$v"; return 0; fi; done <"$F/contenedor_env"; return 1; }
case "$1" in
  ps) exit 0;;
  exec)
    if [[ "$*" == *printenv\\ POSTGRES_USER* ]]; then echo usuario_real; exit 0; fi
    if [[ "$*" == *printenv\\ POSTGRES_DB* ]]; then echo base_real; exit 0; fi
    if [[ "$*" == *psql* ]]; then
      cat >/dev/null; [[ -f "$F/psql_caido" ]] && exit 1
      modo=""; propio=""; eid=""; for a in "$@"; do [[ "$a" == modo=* ]] && modo="\${a#modo=}"; [[ "$a" == propio=* ]] && propio="\${a#propio=}"; [[ "$a" == empresa_id=* ]] && eid="\${a#empresa_id=}"; done
      fila="$(cat "$F/fila")"; n="$(cat "$F/empresas")"; comp="$(cat "$F/compartida")"; uuid="$(cat "$F/empresa_uuid")"
      out="$(
      if [[ "$(cat "$F/tabla")" == no ]]; then echo "RESULTADO=SIN_NEX047"; echo "EMPRESA_ID="; echo "COMPARTIDA=0"; exit 0; fi
      if [[ "$n" != 1 ]]; then echo "RESULTADO=EMPRESA_NO_UNICA:$n"; echo "EMPRESA_ID="; echo "COMPARTIDA=0"; exit 0; fi
      case "$modo" in
        verificar) echo "RESULTADO=VERIFICADO:$fila";;
        aplicar) if [[ "$(cat "$F/priv")" == no ]]; then echo "RESULTADO=SIN_PRIVILEGIO"; elif [[ "$fila" == sin_fila ]]; then echo activa_igual >"$F/fila"; echo "RESULTADO=CONFIGURADA"; elif [[ "$fila" == inactiva ]]; then echo activa_igual >"$F/fila"; echo "RESULTADO=REACTIVADA"; elif [[ "$fila" == activa_igual ]]; then echo "RESULTADO=YA_CONFIGURADA"; else echo "RESULTADO=CONFLICTO_CONFIG_DISTINTA"; fi;;
        revertir) if [[ "$eid" != "$uuid" ]]; then echo "RESULTADO=EMPRESA_DISTINTA_NO_SE_TOCA"; elif [[ "$fila" == sin_fila ]]; then echo "RESULTADO=SIN_FILA"; elif [[ "$fila" == activa_distinta ]]; then echo "RESULTADO=CONFIG_DISTINTA_NO_SE_TOCA"; elif [[ "$propio" != si ]]; then echo "RESULTADO=NO_PROPIA_NO_SE_TOCA"; elif [[ "$fila" == activa_igual ]]; then echo inactiva >"$F/fila"; echo "RESULTADO=DESACTIVADA"; else echo "RESULTADO=YA_INACTIVA"; fi;;
      esac; echo "EMPRESA_ID=$uuid"; echo "COMPARTIDA=$comp"
      )"
      if [[ -f "$F/perder_respuesta" && "$(cat "$F/perder_respuesta")" == "$modo" ]]; then [[ -f "$F/caido_tras_perder" ]] && touch "$F/psql_caido"; exit 1; fi
      printf '%s\n' "$out"; exit 0
    fi
    if [[ "$*" == *printenv* ]]; then [[ -f "$F/contenedor_ok" ]] || exit 1; nombre="\${@: -1}"; v="$(valor "$nombre")"; rc=$?; [[ -f "$F/valor_contenedor_distinto" && -n "$v" ]] && v="\${v}X"; printf '%s' "$v"; exit $rc; fi
    exit 0;;
  compose)
    if [[ "$*" == *config* ]]; then [[ -f "$F/compose_invalido" ]] && exit 1; exit 0; fi
    if [[ "$*" == *force-recreate* ]]; then
      echo RECREATE >>"$F/log"
      [[ -f "$F/falla_recreate" ]] && exit 1
      if [[ -f "$F/falla_recreate_una_vez" ]]; then rm -f "$F/falla_recreate_una_vez"; exit 1; fi
      cp "$ENV_REAL" "$F/contenedor_env"; touch "$F/contenedor_ok"; exit 0
    fi
    exit 0;;
esac
exit 0
`;

// mv / chmod que fallan en condiciones concretas (simulan fallos de disco/permisos): mv sobre app.env; mv sobre el archivo de estado DESPUÉS de que la base cambió; chmod sobre app.env.
const MV_FALSO = `#!/usr/bin/env bash
dest="\${@: -1}"
if [[ -f "$FAKE_DIR/falla_mv_env" && "$dest" == *app.env ]]; then exit 1; fi
if [[ -f "$FAKE_DIR/falla_estado_tras_db" && "$dest" == *.estado && "$(cat "$FAKE_DIR/fila")" != sin_fila ]]; then exit 1; fi
exec /bin/mv "$@"
`;

const CHMOD_FALSO = `#!/usr/bin/env bash
if [[ -f "$FAKE_DIR/falla_chmod_env" && "\${@: -1}" == *app.env ]]; then exit 1; fi
exec /usr/bin/chmod "$@"
`;

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const estadoDe = (stack: string, uuid = UUID_A) => join(stack, `.provisionar-gateway-CASAMINGO-${uuid}.estado`);

type Escenario = { dir: string; poner: (n: string, v: string) => void; stack: string; env: NodeJS.ProcessEnv; correr: (args: string[], extra?: Record<string, string>) => { codigo: number; salida: string }; archivo: (n: string) => string; marca: (n: string) => void };

function montar(opciones: { fila?: string; empresas?: string; priv?: string; envInicial?: string; compartida?: string; tabla?: string } = {}): Escenario {
  const { fila = "sin_fila", empresas = "1", priv = "si", envInicial = "OTRA_VARIABLE=valor-publico\n", compartida = "0", tabla = "si" } = opciones;
  const dir = mkdtempSync(join(tmpdir(), "pro133-"));
  const stack = join(dir, "stack");
  const bin = join(dir, "bin");

  mkdirSync(stack); mkdirSync(bin);
  writeFileSync(join(stack, "app.env"), envInicial); chmodSync(join(stack, "app.env"), 0o644);
  writeFileSync(join(stack, "compose.yml"), "name: nexit\n"); writeFileSync(join(stack, "app.compose.yml"), "services: {}\n");
  for (const [n, v] of [["fila", fila], ["empresas", empresas], ["priv", priv], ["compartida", compartida], ["tabla", tabla], ["log", ""], ["empresa_uuid", UUID_A], ["contenedor_env", ""]]) writeFileSync(join(dir, n), v);
  writeFileSync(join(bin, "docker"), DOCKER_FALSO); chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(join(bin, "mv"), MV_FALSO); chmodSync(join(bin, "mv"), 0o755);
  writeFileSync(join(bin, "chmod"), CHMOD_FALSO); chmodSync(join(bin, "chmod"), 0o755);

  const env: NodeJS.ProcessEnv = { ...process.env, FAKE_DIR: dir, ENV_REAL: join(stack, "app.env"), NEXIT_DOCKER: join(bin, "docker"), PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };

  delete env.NEXIT_PROVISION_RUC; delete env.NEXIT_PROVISION_PASSWORD;

  return {
    dir, stack, env,
    archivo: (n: string) => (n === "log" ? readFileSync(join(dir, n), "utf8") : readFileSync(join(dir, n), "utf8").trim()),
    marca: (n: string) => writeFileSync(join(dir, n), "1"),
    poner: (n: string, v: string) => writeFileSync(join(dir, n), v),
    correr: (args, extra = {}) => {
      const r = spawnSync("bash", [join(raiz, "documentacao/banco/nexit/v1/scripts/provisionar-gateway-prueba.sh"), "--stack", stack, ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 60000 });

      return { codigo: r.status ?? -1, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    },
  };
}

export async function verificarCasosGatewayConfig(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const fila = { baseUrl: "https://gateway-bebidas-py.e-factura-hub.com", credencialRef: "CASAMINGO", timeoutMs: 30000 };
  const env = { NEXIT_FE_CASAMINGO_RUC: "0000000-0", NEXIT_FE_CASAMINGO_PASSWORD: "clave-de-prueba-sintetica" };
  const e = async (rows: unknown[] | Error, entorno: Record<string, string | undefined> = env) => (await estadoGateway(dbCon(rows), EMPRESA, { env: entorno })).estado;

  // ── 1. Los estados se distinguen (GT-01…GT-06) ─────────────────────────────────────────────────
  igual("GT-01 lectura completada sin fila activa → SIN_CONFIGURAR", await e([]), "SIN_CONFIGURAR");
  igual("GT-02 URL no https / con ruta → INVALIDA", [await e([{ ...fila, baseUrl: "http://gateway.test" }]), await e([{ ...fila, baseUrl: "https://gateway.test/ruta" }])], ["INVALIDA", "INVALIDA"]);
  igual("GT-03 fila válida pero sin variables NEXIT_FE_<REF>_* (o solo una) → SIN_CREDENCIALES", [await e([fila], {}), await e([fila], { NEXIT_FE_CASAMINGO_RUC: "x" }), await e([fila], { NEXIT_FE_CASAMINGO_PASSWORD: "x" })], ["SIN_CREDENCIALES", "SIN_CREDENCIALES", "SIN_CREDENCIALES"]);
  igual("referencia con otro nombre → SIN_CREDENCIALES (no se cruzan referencias)", await e([{ ...fila, credencialRef: "OTRA" }]), "SIN_CREDENCIALES");
  igual("GT-04 fila válida y credenciales presentes → CONFIGURADO", await e([fila]), "CONFIGURADO");
  igual("GT-05 CUALQUIER excepción de la consulta (conexión, permiso, tabla inexistente) → NO_DISPONIBLE, distinto de SIN_CONFIGURAR, y sin lanzar", [await e(new Error("connection terminated")), await e(Object.assign(new Error("permission denied"), { code: "42501" })), await e(Object.assign(new Error("relation does not exist"), { code: "42P01" }))], ["NO_DISPONIBLE", "NO_DISPONIBLE", "NO_DISPONIBLE"]);
  cierto("NO_DISPONIBLE y SIN_CONFIGURAR son estados y mensajes distintos, y el mensaje de NO_DISPONIBLE no filtra detalles del error", (await estadoGateway(dbCon(new Error("password authentication failed for user x")), EMPRESA, { env })).mensaje !== (await estadoGateway(dbCon([]), EMPRESA, { env })).mensaje && !/password|authentication|user x/.test((await estadoGateway(dbCon(new Error("password authentication failed for user x")), EMPRESA, { env })).mensaje));

  // ── 2. Nada sensible sale; aislamiento por sesión ──────────────────────────────────────────────
  const todos = JSON.stringify(await Promise.all([[], [fila], [{ ...fila, baseUrl: "http://x" }], new Error("boom")].map((r) => estadoGateway(dbCon(r as never), EMPRESA, { env }))));
  cierto("la respuesta de estado no contiene URL, referencia, RUC ni clave y solo trae estado + mensaje", !/gateway-bebidas|CASAMINGO|0000000-0|clave-de-prueba/.test(todos) && Object.keys(await estadoGateway(dbCon([fila]), EMPRESA, { env })).sort().join() === "estado,mensaje");
  igual("solo CONFIGURADO habilita el envío (NO_DISPONIBLE y null/cargando también lo bloquean)", [...ESTADOS_GATEWAY.map((s) => puedeEnviarPorGateway({ estado: s, mensaje: "" })), puedeEnviarPorGateway(null)], [false, false, false, true, false, false]);
  igual("GT-06 la consulta usa la empresa de la sesión (cada empresa su propia fila)", await (async () => { const llamadas: unknown[][] = []; await estadoGateway({ async query(_s: string, p: unknown[]) { llamadas.push(p); return { rows: [] }; } } as never, EMPRESA, { env }); return llamadas; })(), [[EMPRESA]]);

  // ── 3. Servidor y pantalla ──────────────────────────────────────────────────────────────────────
  const envio = leer("lib/facturacion/envio.ts");
  const ruta = leer("app/api/facturas/catalogos/route.ts");
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  cierto("el estado usa la MISMA comprobación del preflight de envío y el preflight 409 sigue intacto antes de reservar número", /export async function estadoGateway/.test(envio) && /configGatewayValida\(empresaId, fila\)/.test(envio) && /leerCredenciales\(valida\.credencialRef, dep\.env\)/.test(envio) && /La empresa no tiene configurado el gateway de facturación electrónica\./.test(envio) && /await configuracionGateway\(/.test(envio));
  cierto("el catálogo de la factura entrega el estado del gateway de la empresa de la sesión (sin red ni secretos)", /estadoGateway\(b\.db, b\.empresaId\)/.test(ruta));
  cierto("pantalla: aviso visible cuando el gateway no está CONFIGURADO (incluido NO_DISPONIBLE) y «Enviar factura» deshabilitado (también mientras carga); Revisar sigue disponible", /gateway !== null && !puedeEnviarPorGateway\(gateway\)/.test(pagina) && /disabled=\{enviando \|\| !puedeEnviarPorGateway\(gateway\)\}/.test(pagina) && /setGateway\(j\.gateway \?\? null\)/.test(pagina) && /disabled=\{!puedeGuardar\} onClick=\{grabar\}/.test(pagina));

  // ── 4. Provisionamiento automatizado: texto versionado ─────────────────────────────────────────
  const sh = leer("documentacao/banco/nexit/v1/scripts/provisionar-gateway-prueba.sh");
  const sql = leer("documentacao/banco/nexit/v1/scripts/provisionar-gateway-prueba.sql");
  const doc = leer("documentacao/infra/CONFIGURACION-GATEWAY-FE-PRUEBA.md");
  const codigoSql = sql.replace(/--.*$/gm, "");
  cierto("R01-03: el usuario/base de PostgreSQL salen de POSTGRES_USER/POSTGRES_DB del contenedor (sin rol fijo) y el SQL verifica INSERT/UPDATE antes de escribir; no queda «nexit_app» presumido", /printenv POSTGRES_USER/.test(sh) && /printenv POSTGRES_DB/.test(sh) && !/nexit_app/.test(sh.replace(/#.*$/gm, "")) && /has_table_privilege\(current_user, 'public\.fe_gateway_config', 'INSERT'\)/.test(codigoSql) && /SIN_PRIVILEGIO/.test(codigoSql));
  cierto("la empresa se identifica por RAZÓN SOCIAL y debe ser única; el SQL solo toca fe_gateway_config (sin migraciones, numeración ni documentos) y no contiene credenciales", /razon_social/.test(codigoSql) && /EMPRESA_NO_UNICA/.test(codigoSql) && !/password|token/i.test(codigoSql.replace(/nexit\./g, "")) && !/(UPDATE|INSERT INTO|DELETE FROM) public\.(?!fe_gateway_config)/.test(codigoSql) && !/DROP|TRUNCATE|documentos_electronicos|fe_punto|schema_migrations/i.test(codigoSql) && /CASA MINGO/.test(sh));
  cierto("R02-05: la existencia de fe_gateway_config se comprueba FUERA del bloque DO tipado (\\if) y el bloque no usa %ROWTYPE de la tabla: sin NEX-047 devuelve SIN_NEX047 sin compilar ni operar sobre una tabla inexistente", /to_regclass\('public\.fe_gateway_config'\) IS NOT NULL AS tiene_tabla \\gset/.test(sql) && /\\if :tiene_tabla\s+DO \$\$/.test(sql) && /\\else\s+SELECT set_config\('nexit\.resultado', 'SIN_NEX047'/.test(sql) && !/%ROWTYPE/.test(codigoSql) && /v_cfg record;/.test(codigoSql));
  cierto("R02-01 (texto): la reversión del SQL exige propio=si y que la fila coincida EXACTAMENTE con URL y referencia gestionadas; informa cuántas OTRAS empresas comparten la referencia", /nexit\.propio'\) <> 'si' THEN v_res := 'NO_PROPIA_NO_SE_TOCA'/.test(codigoSql) && /NOT v_igual THEN v_res := 'CONFIG_DISTINTA_NO_SE_TOCA'/.test(codigoSql) && /credencial_ref = current_setting\('nexit\.ref'\) AND empresa_id <> v_empresa/.test(codigoSql) && /COMPARTIDA=/.test(codigoSql));
  cierto("credenciales: fuente privada (variables del agente o archivo 600/400), escritas con builtins (nunca en argumentos), comillas simples de env_file, copias y temporales con modo 600 explícito (abortan si chmod falla); no se imprimen valores ni se piden por chat; no hay login ni envíos", /NEXIT_PROVISION_PASSWORD/.test(sh) && /"600" \|\| "\$perm" == "400"/.test(sh) && /\.bak-/.test(sh) && /\( umask 077; cat "\$1" >"\$2" \) && chmod 600 "\$2"/.test(sh) && !/cp -p/.test(sh) && /chmod 600 "\$tmp" && mv "\$tmp" "\$ENV_FILE"/.test(sh) && /printf "%s='%s'\\n"/.test(sh) && !/echo[^\n]*\$\{?(RUC|PWD_)/.test(sh) && !/curl|wget|api\/login|recepcion_de/.test(sh.replace(/#.*$/gm, "")));
  cierto("procedimiento documentado: automatizado e idempotente, a cargo del agente autorizado, impedimento real declarado y NO aplicado; formato env_file, reversión solo de lo propio y recuperación; sin pasos manuales para el responsable", /provisionar-gateway-prueba\.sh/.test(doc) && /NO aplicado en la VM/.test(doc) && /agente autorizado/.test(doc) && /no prueba conexión/.test(doc) && /comillas simples/.test(doc) && /solo lo propio/.test(doc) && !/Pasos \(responsable|app\.env\.bak/.test(doc));

  // ── 5. Provisionamiento automatizado: ejecución real del script contra un docker simulado (credenciales SINTÉTICAS) ──
  const RUC = "RUC-SINTETICO-123";
  const CLAVE = "clave-sintetica-no-real-987";
  const cred = { NEXIT_PROVISION_RUC: RUC, NEXIT_PROVISION_PASSWORD: CLAVE };
  const lineasEnv = (s: Escenario) => readFileSync(join(s.stack, "app.env"), "utf8");
  const copias = (s: Escenario) => readdirSync(s.stack).filter((n) => n.startsWith("app.env.bak-"));
  const recreaciones = (s: Escenario) => (s.archivo("log").match(/^RECREATE$/gm) ?? []).length;
  const modo = (ruta: string) => statSync(ruta).mode & 0o777;
  const escenarios: Escenario[] = [];
  const nuevo = (o: Parameters<typeof montar>[0] = {}) => { const s = montar(o); escenarios.push(s); return s; };
  const BASE = "OTRA_VARIABLE=valor-publico\n";

  try {
    const a = nuevo();
    const va = a.correr(["--verificar"]);
    igual("--verificar es solo lectura: sin fila → pendiente (10), nada cambia", [va.codigo, lineasEnv(a), a.archivo("fila"), recreaciones(a), copias(a).length, existsSync(estadoDe(a.stack))], [10, BASE, "sin_fila", 0, 0, false]);

    const b = nuevo();
    const sin = b.correr(["--aplicar"]);
    cierto("--aplicar sin fuente privada de credenciales y sin ellas en app.env → CREDENCIALES_REQUERIDAS (6), sin cambios ni simulación", sin.codigo === 6 && /CREDENCIALES_REQUERIDAS/.test(sin.salida) && lineasEnv(b) === BASE && b.archivo("fila") === "sin_fila" && recreaciones(b) === 0);

    const c = nuevo();
    const ap = c.correr(["--aplicar"], cred);
    const logC = c.archivo("log");
    cierto("--aplicar con credenciales: fila creada, app.env con las dos variables entre comillas simples (el resto intacto), UNA copia previa, app recreada una vez, y el contenedor recibió el valor EXACTO", ap.codigo === 0 && c.archivo("fila") === "activa_igual" && lineasEnv(c).includes(BASE) && lineasEnv(c).includes(`NEXIT_FE_CASAMINGO_RUC='${RUC}'\n`) && lineasEnv(c).includes(`NEXIT_FE_CASAMINGO_PASSWORD='${CLAVE}'\n`) && copias(c).length === 1 && recreaciones(c) === 1 && /VERIFICADO/.test(ap.salida));
    cierto("los secretos NO aparecen en la salida, en ningún argumento de docker (log) ni en el archivo de estado", !ap.salida.includes(RUC) && !ap.salida.includes(CLAVE) && !logC.includes(RUC) && !logC.includes(CLAVE) && !readFileSync(estadoDe(c.stack), "utf8").includes(CLAVE));
    cierto("R01-03: la base se consulta con el usuario y la base leídos del contenedor, nunca con un rol presumido", /-U usuario_real -d base_real/.test(logC) && !/nexit_app/.test(logC));
    if (process.platform !== "win32") {
      cierto("R02-03: app.env (era 0644), su copia previa y el archivo de estado terminan con modo 600; no queda ningún temporal", modo(join(c.stack, "app.env")) === 0o600 && modo(join(c.stack, copias(c)[0])) === 0o600 && modo(estadoDe(c.stack)) === 0o600 && !readdirSync(c.stack).some((n) => /\.[A-Za-z0-9]{6}$/.test(n) && !n.includes("bak")));
    }

    const c2 = c.correr(["--aplicar"], cred);
    cierto("idempotencia: segunda ejecución → sin nueva copia, sin recrear app, fila YA_CONFIGURADA y mismo app.env", c2.codigo === 0 && copias(c).length === 1 && recreaciones(c) === 1 && /ya estaba configurada/.test(c2.salida) && lineasEnv(c).split("NEXIT_FE_CASAMINGO_RUC=").length === 2);
    const c3 = c.correr(["--aplicar"]);
    cierto("ejecución sin fuente nueva con credenciales ya presentes: conserva todo (sin cambios)", c3.codigo === 0 && copias(c).length === 1 && recreaciones(c) === 1);
    const v2 = c.correr(["--verificar"]);
    igual("--verificar tras aplicar → LISTO (0)", [v2.codigo, /LISTO/.test(v2.salida)], [0, true]);

    // ── R02-02: valores con caracteres especiales llegan IDÉNTICOS al contenedor ─────────────────
    const especiales = ["pa$$w0rd", "${HOME}/x", "con espacios y # numeral", 'comillas "dobles" y \\ barra', "$(echo no)`id`", "tab\tfin", "%s %d \\n", "=igual=", " inicio y fin "];
    let identicos = true; let estructura = true;
    for (const clave of especiales) {
      const s = nuevo();
      const r = s.correr(["--aplicar"], { NEXIT_PROVISION_RUC: RUC, NEXIT_PROVISION_PASSWORD: clave });
      const linea = lineasEnv(s).split("\n").find((l) => l.startsWith("NEXIT_FE_CASAMINGO_PASSWORD="));
      // Lo que el contenedor «recibió» (interpretado con la gramática de env_file) coincide byte a byte con lo entregado; el archivo conserva exactamente UNA línea por variable.
      const recibido = spawnSync("bash", ["-c", '"$NEXIT_DOCKER" exec nexit-app printenv NEXIT_FE_CASAMINGO_PASSWORD'], { env: s.env, encoding: "utf8" }).stdout;

      if (!(r.codigo === 0 && recibido === clave && linea === `NEXIT_FE_CASAMINGO_PASSWORD='${clave}'`)) identicos = false;
      if (lineasEnv(s).split("\n").filter((l) => l.startsWith("NEXIT_FE_")).length !== 2 || !lineasEnv(s).startsWith(BASE)) estructura = false;
      if (r.salida.includes(clave) || s.archivo("log").includes(clave)) identicos = false;
    }
    cierto(`R02-02: ${especiales.length} contraseñas sintéticas con $, \${…}, #, espacios, comillas dobles, barras, \`…\`, tab, % y = se escriben entre comillas simples y llegan IDÉNTICAS (byte a byte) al contenedor, sin imprimirse`, identicos);
    cierto("R02-02: cada una deja exactamente dos líneas NEXIT_FE_* y las demás variables intactas (sin entradas extra ni interpolación)", estructura);
    for (const [nombre, valor] of [["comilla simple", "it's"], ["salto de línea", "a\nb"], ["retorno de carro", "a\rb"]] as const) {
      const s = nuevo();
      const r = s.correr(["--aplicar"], { NEXIT_PROVISION_RUC: RUC, NEXIT_PROVISION_PASSWORD: valor });
      cierto(`R02-02: una clave con ${nombre} es IRREPRESENTABLE: se rechaza (6) sin tocar app.env, la base ni la app`, r.codigo === 6 && /no son representables/.test(r.salida) && lineasEnv(s) === BASE && s.archivo("fila") === "sin_fila" && recreaciones(s) === 0 && !existsSync(estadoDe(s.stack)));
    }

    // ── R02-01: la reversión solo deshace lo propio ───────────────────────────────────────────────
    const rv = c.correr(["--revertir"]);
    cierto("--revertir tras --aplicar propio: fila desactivada (no borrada), variables retiradas (resto intacto, con copia), app recreada, y --verificar queda PENDIENTE", rv.codigo === 0 && c.archivo("fila") === "inactiva" && !/NEXIT_FE_CASAMINGO/.test(lineasEnv(c)) && lineasEnv(c).includes(BASE) && copias(c).length === 2 && recreaciones(c) === 2 && c.correr(["--verificar"]).codigo === 10);
    cierto("la reversión tampoco imprime ni registra secretos", !rv.salida.includes(CLAVE) && !c.archivo("log").includes(CLAVE));

    const sinEstado = nuevo({ fila: "activa_igual", envInicial: `${BASE}NEXIT_FE_CASAMINGO_RUC='${RUC}'\nNEXIT_FE_CASAMINGO_PASSWORD='${CLAVE}'\n` });
    const r1 = sinEstado.correr(["--revertir"]);
    cierto("GT-R02-01 sin registro de proveniencia (la configuración ya existía): --revertir NO cambia nada (11): fila activa y credenciales intactas", r1.codigo === 11 && /SIN PROVENIENCIA/.test(r1.salida) && sinEstado.archivo("fila") === "activa_igual" && lineasEnv(sinEstado).includes(CLAVE) && copias(sinEstado).length === 0 && recreaciones(sinEstado) === 0);

    const distinta = nuevo({ fila: "activa_distinta" });
    writeFileSync(estadoDe(distinta.stack), `empresa_id=${UUID_A}\nref=CASAMINGO\nurl=https://gateway-bebidas-py.e-factura-hub.com\ndb_propio=si\nenv_escrito=si\netapa=ok\n`);
    const r2 = distinta.correr(["--revertir"]);
    cierto("GT-R02-01 gateway activo DISTINTO de la configuración gestionada: --revertir no lo desactiva ni toca las variables de otra configuración", /NO se toca/.test(r2.salida) && distinta.archivo("fila") === "activa_distinta" && recreaciones(distinta) === 0 && copias(distinta).length === 0);

    const ajena = nuevo({ fila: "activa_igual", envInicial: `${BASE}NEXIT_FE_CASAMINGO_RUC='${RUC}'\nNEXIT_FE_CASAMINGO_PASSWORD='${CLAVE}'\n` });
    writeFileSync(estadoDe(ajena.stack), `empresa_id=${UUID_A}\nref=CASAMINGO\nurl=https://gateway-bebidas-py.e-factura-hub.com\ndb_propio=no\nenv_escrito=no\nenv_previo=si\netapa=ok\n`);
    const r3 = ajena.correr(["--revertir"]);
    cierto("GT-R02-02 credenciales y fila PREEXISTENTES (registro: no propias): --revertir conserva la fila activa y NO retira las variables ni recrea la app", r3.codigo === 0 && /no fue creada por este provisionador/.test(r3.salida) && ajena.archivo("fila") === "activa_igual" && lineasEnv(ajena).includes(CLAVE) && recreaciones(ajena) === 0 && copias(ajena).length === 0);

    const compartida = nuevo({ fila: "sin_fila", compartida: "1" });
    compartida.correr(["--aplicar"], cred);
    const r4 = compartida.correr(["--revertir"]);
    cierto("GT-R02-02 referencia de credenciales compartida con OTRA empresa: --revertir desactiva solo la fila propia y NO retira las variables (las usa otra empresa)", r4.codigo === 0 && compartida.archivo("fila") === "inactiva" && /COMPARTIDA=1/.test(r4.salida) && lineasEnv(compartida).includes(`NEXIT_FE_CASAMINGO_RUC='${RUC}'`) && recreaciones(compartida) === 1);

    const b2 = nuevo({ fila: "sin_fila" });
    igual("--revertir sin registro y sin nada configurado → convergente (11), sin copias ni recreaciones", [b2.correr(["--revertir"]).codigo, copias(b2).length, recreaciones(b2)], [11, 0, 0]);

    // ── Pre-validaciones y conflictos ────────────────────────────────────────────────────────────
    const d = nuevo({ empresas: "2" });
    const dr = d.correr(["--aplicar"], cred);
    cierto("empresa no única (razón social ambigua) → aborta (5) sin cambios", dr.codigo === 5 && /no identifica UNA empresa/.test(dr.salida) && lineasEnv(d) === BASE && recreaciones(d) === 0);

    const f = nuevo({ priv: "no" });
    const fr = f.correr(["--aplicar"], cred);
    cierto("sin privilegio de escritura → aborta (7) ANTES de tocar app.env o recrear (y sin copias)", fr.codigo === 7 && lineasEnv(f) === BASE && copias(f).length === 0 && recreaciones(f) === 0 && f.archivo("fila") === "sin_fila");

    const g = nuevo({ fila: "activa_distinta" });
    const gr = g.correr(["--aplicar"], cred);
    cierto("existe otra configuración distinta → no se sustituye (7), app.env intacto", gr.codigo === 7 && /otra configuración/.test(gr.salida) && lineasEnv(g) === BASE);

    const pre = nuevo({ envInicial: `${BASE}NEXIT_FE_CASAMINGO_RUC='otro-ruc'\nNEXIT_FE_CASAMINGO_PASSWORD='otra-clave'\n` });
    const pr = pre.correr(["--aplicar"], cred);
    cierto("credenciales PREEXISTENTES distintas → no se sobrescriben (6, CONFLICTO_CREDENCIALES) y la base no cambia", pr.codigo === 6 && /CONFLICTO_CREDENCIALES/.test(pr.salida) && lineasEnv(pre).includes("otra-clave") && !lineasEnv(pre).includes(CLAVE) && pre.archivo("fila") === "sin_fila");

    // ── R02-05: NEX-047 ausente ──────────────────────────────────────────────────────────────────
    const nt = nuevo({ tabla: "no" });
    const ntr = nt.correr(["--aplicar"], cred);
    cierto("GT-R02-06 sin fe_gateway_config → diagnóstico NEX-047 (5) y NINGÚN cambio (app.env, copias, app)", ntr.codigo === 5 && /NEX-047 no está aplicada/.test(ntr.salida) && lineasEnv(nt) === BASE && copias(nt).length === 0 && recreaciones(nt) === 0);

    // ── R02-04: ejecución parcial ────────────────────────────────────────────────────────────────
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      const ro = nuevo();
      chmodSync(ro.stack, 0o555);
      const ror = ro.correr(["--aplicar"], cred);
      chmodSync(ro.stack, 0o755);
      cierto("GT-R02-05 directorio de app.env no escribible → aborta ANTES de la base (4), sin cambios", ror.codigo === 4 && ro.archivo("fila") === "sin_fila" && lineasEnv(ro) === BASE);
    }

    const inv = nuevo(); inv.marca("compose_invalido");
    const ir = inv.correr(["--aplicar"], cred);
    cierto("GT-R02-05 configuración Compose inválida → aborta ANTES de la base (8), sin cambios", ir.codigo === 8 && inv.archivo("fila") === "sin_fila" && lineasEnv(inv) === BASE && recreaciones(inv) === 0);

    const fm = nuevo(); fm.marca("falla_mv_env");
    const fmr = fm.correr(["--aplicar"], cred);
    cierto("GT-R02-05 falla al reemplazar app.env DESPUÉS de crear la fila: COMPENSA (fila desactivada), app.env intacto, estado final inequívoco (9), sin secretos en la salida", fmr.codigo === 9 && /ESTADO FINAL: COMPENSADO/.test(fmr.salida) && fm.archivo("fila") === "inactiva" && lineasEnv(fm) === BASE && recreaciones(fm) === 0 && !fmr.salida.includes(CLAVE));
    rmSync(join(fm.dir, "falla_mv_env"));
    const fmOk = fm.correr(["--aplicar"], cred);
    cierto("GT-R02-05 recuperación: tras el fallo, reejecutar --aplicar converge (reactiva la fila, escribe app.env, recrea app, verifica)", fmOk.codigo === 0 && fm.archivo("fila") === "activa_igual" && lineasEnv(fm).includes(`NEXIT_FE_CASAMINGO_RUC='${RUC}'`) && recreaciones(fm) === 1);

    const fr2 = nuevo(); fr2.marca("falla_recreate");
    const fr2r = fr2.correr(["--aplicar"], cred);
    cierto("R03-02 la recreación falla SIEMPRE: se restaura app.env y se desactiva la fila, pero el contenedor NO se puede comprobar → PARCIAL / INTERVENCIÓN NECESARIA (12), nunca «COMPENSADO tras»", fr2r.codigo === 12 && /PARCIAL \/ INTERVENCIÓN NECESARIA/.test(fr2r.salida) && !/COMPENSADO tras/.test(fr2r.salida) && lineasEnv(fr2) === BASE && fr2.archivo("fila") === "inactiva" && copias(fr2).length === 1 && !fr2r.salida.includes(CLAVE) && new RegExp("empresa_id=" + UUID_A).test(fr2r.salida));

    const fr3 = nuevo(); fr3.marca("falla_recreate_una_vez");
    const fr3r = fr3.correr(["--aplicar"], cred);
    cierto("R03-02 la primera recreación falla y la segunda (con app.env restaurado) funciona: COMPENSADO (9) solo porque BD, app.env y contenedor se comprueban (contenedor sin las variables nuevas, 2 intentos)", fr3r.codigo === 9 && /ESTADO FINAL: COMPENSADO tras/.test(fr3r.salida) && /contenedor recreado sin las variables nuevas y verificado/.test(fr3r.salida) && lineasEnv(fr3) === BASE && fr3.archivo("fila") === "inactiva" && recreaciones(fr3) === 2);
    if (process.platform !== "win32") cierto("GT-R02-03 la copia conservada tras la compensación y el app.env restaurado mantienen modo 600", modo(join(fr3.stack, copias(fr3)[0])) === 0o600 && modo(join(fr3.stack, "app.env")) === 0o600);

    // ── R03-01: la propiedad se vincula al UUID real de la empresa ─────────────────────────────────────
    const ma = nuevo();
    ma.correr(["--aplicar"], cred);
    const estadoA = readFileSync(estadoDe(ma.stack), "utf8");
    cierto("R03-01 el archivo de estado registra el UUID real de la empresa y su nombre lo incluye; sin secretos", new RegExp("^empresa_id=" + UUID_A + "$", "m").test(estadoA) && !estadoA.includes(CLAVE));
    ma.poner("empresa_uuid", UUID_B);   // la misma razón social ahora identifica a OTRA empresa (B) con la misma URL y referencia
    const antesB = [lineasEnv(ma), ma.archivo("fila"), recreaciones(ma), copias(ma).length];
    const rb = ma.correr(["--revertir"]);
    cierto("T-R03-01 empresa B con la misma URL/referencia (la razón social cambió de empresa): --revertir NO modifica ninguna (11), ni la fila, ni app.env, ni la app", rb.codigo === 11 && /SIN PROVENIENCIA/.test(rb.salida) && JSON.stringify([lineasEnv(ma), ma.archivo("fila"), recreaciones(ma), copias(ma).length]) === JSON.stringify(antesB) && existsSync(estadoDe(ma.stack, UUID_A)) && !existsSync(estadoDe(ma.stack, UUID_B)));
    const ab = ma.correr(["--aplicar"], cred);
    cierto("T-R03-01 aplicar sobre B crea SU propio registro; el de A no se mezcla", /UUID bbbbbbbb/.test(ab.salida) && existsSync(estadoDe(ma.stack, UUID_B)) && existsSync(estadoDe(ma.stack, UUID_A)));

    // ── R03-02: COMPENSADO solo si se comprueba; si no, PARCIAL ─────────────────────────────────────
    const pc = nuevo(); pc.marca("falla_recreate"); pc.poner("perder_respuesta", "revertir"); pc.marca("caido_tras_perder");
    const pcr = pc.correr(["--aplicar"], cred);
    cierto("T-R03-02 falla la desactivación SQL (respuesta perdida y base caída) + falla la recreación: PARCIAL (12), jamás COMPENSADO; la lectura separada del estado real muestra que la fila quedó inactiva", pcr.codigo === 12 && /PARCIAL \/ INTERVENCIÓN NECESARIA/.test(pcr.salida) && !/COMPENSADO tras/.test(pcr.salida) && /fila NO verificada como desactivada/.test(pcr.salida) && pc.archivo("fila") === "inactiva");
    const pe = nuevo(); pe.marca("falla_recreate"); pe.marca("falla_chmod_env");
    const per = pe.correr(["--aplicar"], cred);
    cierto("T-R03-02 falla la restauración de app.env (chmod): PARCIAL (12) con los datos de recuperación y la copia; la fila sí se desactiva y se informa", per.codigo === 12 && /app\.env NO restaurado \(copia: app\.env\.bak-/.test(per.salida) && !/COMPENSADO tras/.test(per.salida) && !per.salida.includes(CLAVE));

    // ── R03-03: tras recrear la app, la comprobación de valores falla ───────────────────────────────
    const vd = nuevo(); vd.marca("valor_contenedor_distinto");
    const vdr = vd.correr(["--aplicar"], cred);
    cierto("T-R03-03 el contenedor recibe un valor distinto tras recrear: se restaura app.env, se desactiva la fila, se RECREA de nuevo y se comprueba que no queda ninguna variable nueva → COMPENSADO (9) con 2 recreaciones", vdr.codigo === 9 && /ESTADO FINAL: COMPENSADO tras el fallo «verificación de las variables en el contenedor»/.test(vdr.salida) && lineasEnv(vd) === BASE && vd.archivo("fila") === "inactiva" && recreaciones(vd) === 2 && !vdr.salida.includes(CLAVE) && !vd.archivo("log").includes(CLAVE));

    // ── R03-04: falla la gravación del archivo de estado DESPUÉS de cambiar la base ─────────────────
    const fe = nuevo(); fe.marca("falla_estado_tras_db");
    const fer = fe.correr(["--aplicar"], cred);
    cierto("T-R03-04 el archivo de estado no se puede actualizar tras cambiar la base: error controlado, compensación con el estado en memoria (fila desactivada), app.env intacto, nunca éxito ni silencio", fer.codigo === 9 && /COMPENSADO tras el fallo «registro del archivo de estado»/.test(fer.salida) && fe.archivo("fila") === "inactiva" && lineasEnv(fe) === BASE && recreaciones(fe) === 0);
    cierto("el archivo de estado se crea ANTES de cualquier cambio: existe (con la empresa y la etapa) aunque la escritura de app.env falle después de crear la fila", existsSync(estadoDe(fm.stack)) && /^empresa_id=/m.test(readFileSync(estadoDe(fm.stack), "utf8")) && /^etapa=/m.test(readFileSync(estadoDe(fm.stack), "utf8")));

    // ── R03-04/T-R03-05: respuesta SQL perdida: no se presume «no aplicada» ──────────────────────────
    const lp = nuevo(); lp.poner("perder_respuesta", "aplicar");
    const lpr = lp.correr(["--aplicar"], cred);
    cierto("T-R03-05 se pierde la respuesta de la base DESPUÉS de aplicar: se RECONSULTA, se comprueba el cambio (CONFIGURADA recuperada) y la ejecución continúa hasta el final verificado; propiedad registrada", lpr.codigo === 0 && /se comprobó por reconsulta: CONFIGURADA/.test(lpr.salida) && lp.archivo("fila") === "activa_igual" && /^db_propio=si$/m.test(readFileSync(estadoDe(lp.stack), "utf8")) && /VERIFICADO/.test(lpr.salida));
    const lq = nuevo(); lq.poner("perder_respuesta", "aplicar"); lq.marca("caido_tras_perder");
    const lqr = lq.correr(["--aplicar"], cred);
    cierto("T-R03-05 se pierde la respuesta Y la reconsulta también falla: ESTADO INDETERMINADO (12) sin tocar app.env ni la app; no se afirma que la base no cambió (la fila sí quedó activa)", lqr.codigo === 12 && /ESTADO INDETERMINADO/.test(lqr.salida) && lineasEnv(lq) === BASE && recreaciones(lq) === 0 && copias(lq).length === 0 && lq.archivo("fila") === "activa_igual");
    const lr = nuevo(); lr.correr(["--aplicar"], cred); lr.poner("perder_respuesta", "revertir");
    const lrr = lr.correr(["--revertir"]);
    cierto("T-R03-05 se pierde la respuesta de la REVERSIÓN: se reconsulta (DESACTIVADA comprobada) y se completa la retirada de las variables propias", lrr.codigo === 0 && /se comprobó por reconsulta: DESACTIVADA/.test(lrr.salida) && lr.archivo("fila") === "inactiva" && !/NEXIT_FE_CASAMINGO/.test(lineasEnv(lr)));

    // ── T-R03-06: copias exclusivas, 600 y sin sobrescribir ──────────────────────────────────────────
    const bk = nuevo();
    bk.correr(["--aplicar"], cred); bk.correr(["--revertir"]); bk.correr(["--aplicar"], cred);
    const nombres = copias(bk);
    const contenidos = nombres.map((n) => readFileSync(join(bk.stack, n), "utf8"));
    cierto("T-R03-06 tres copias consecutivas (posiblemente en el mismo segundo) tienen nombres DISTINTOS, ninguna sobrescribe a otra y la primera conserva el app.env original", nombres.length === 3 && new Set(nombres).size === 3 && contenidos.filter((c) => c === BASE).length === 2 && contenidos.some((c) => c.includes("NEXIT_FE_CASAMINGO_RUC")) && nombres.every((n) => /^app\.env\.bak-\d{14}\.[A-Za-z0-9]{6}$/.test(n)));
    if (process.platform !== "win32") cierto("T-R03-06 todas las copias con modo 600", nombres.every((n) => modo(join(bk.stack, n)) === 0o600));
    cierto("T-R03-06 la copia se crea con mktemp exclusivo (no con un nombre derivado solo del segundo)", /mktemp "\$ENV_FILE\.bak-\$\(date \+%Y%m%d%H%M%S\)\.XXXXXX"/.test(sh) && !/bak="\$ENV_FILE\.bak-\$\(date/.test(sh));

    if (process.platform !== "win32") {
      const h = nuevo(); const arch = join(h.dir, "cred.txt");
      writeFileSync(arch, `RUC=${RUC}\nPASSWORD=${CLAVE}\n`); chmodSync(arch, 0o644);
      const hr = h.correr(["--aplicar", "--credenciales-archivo", arch]);
      cierto("archivo de credenciales con permisos abiertos se rechaza (6)", hr.codigo === 6 && lineasEnv(h) === BASE);
      chmodSync(arch, 0o600);
      const hr2 = h.correr(["--aplicar", "--credenciales-archivo", arch]);
      cierto("archivo 600 aceptado como fuente privada", hr2.codigo === 0 && lineasEnv(h).includes(`NEXIT_FE_CASAMINGO_RUC='${RUC}'`));
    }
  } finally {
    for (const s of escenarios) { try { chmodSync(s.stack, 0o755); } catch { /* ya borrado */ } rmSync(s.dir, { recursive: true, force: true }); }
  }

  cierto("ningún archivo del repositorio contiene credenciales: el provisionamiento solo usa variables del entorno del agente", !existsSync(join(raiz, "app.env")));

  return fallos;
}
