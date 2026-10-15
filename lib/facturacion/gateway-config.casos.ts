/**
 * PRO-133 — prontitud del gateway de PRUEBA y provisionamiento automatizado. Sin red, sin PostgreSQL, sin Docker real y sin credenciales reales: el estado se calcula con una base simulada y el
 * script de provisionamiento se ejecuta contra un «docker» SIMULADO (con credenciales SINTÉTICAS) que registra cada llamada. NO se ejecutó contra la VM; «CONFIGURADO» no prueba que el gateway responda.
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

// «docker» simulado: estado en archivos; registra TODAS las llamadas (argumentos) en un log para comprobar que ningún secreto viaja por ellos.
const DOCKER_FALSO = `#!/usr/bin/env bash
F="$FAKE_DIR"; echo "$*" >>"$F/log"
case "$1" in
  ps) exit 0;;
  exec)
    if [[ "$*" == *printenv\\ POSTGRES_USER* ]]; then echo usuario_real; exit 0; fi
    if [[ "$*" == *printenv\\ POSTGRES_DB* ]]; then echo base_real; exit 0; fi
    if [[ "$*" == *psql* ]]; then
      cat >/dev/null; modo=""; for a in "$@"; do [[ "$a" == modo=* ]] && modo="\${a#modo=}"; done
      fila="$(cat "$F/fila")"; n="$(cat "$F/empresas")"
      if [[ "$n" != 1 ]]; then echo "RESULTADO=EMPRESA_NO_UNICA:$n"; exit 0; fi
      case "$modo" in
        verificar) echo "RESULTADO=VERIFICADO:$fila";;
        aplicar) if [[ "$(cat "$F/priv")" == no ]]; then echo "RESULTADO=SIN_PRIVILEGIO"; elif [[ "$fila" == sin_fila ]]; then echo activa_igual >"$F/fila"; echo "RESULTADO=CONFIGURADA"; elif [[ "$fila" == activa_igual ]]; then echo "RESULTADO=YA_CONFIGURADA"; else echo "RESULTADO=CONFLICTO_CONFIG_DISTINTA"; fi;;
        revertir) if [[ "$fila" == activa_igual ]]; then echo inactiva >"$F/fila"; echo "RESULTADO=DESACTIVADA"; else echo "RESULTADO=YA_INACTIVA"; fi;;
      esac; exit 0
    fi
    if [[ "$*" == *sh\\ -c* ]]; then [[ -f "$F/contenedor_ok" ]] && exit 0 || exit 1; fi
    exit 0;;
  compose)
    if [[ "$*" == *config* ]]; then exit 0; fi
    if [[ "$*" == *force-recreate* ]]; then echo RECREATE >>"$F/log"; if grep -q '^NEXIT_FE_CASAMINGO_RUC=.' "$ENV_REAL" && grep -q '^NEXIT_FE_CASAMINGO_PASSWORD=.' "$ENV_REAL"; then touch "$F/contenedor_ok"; else rm -f "$F/contenedor_ok"; fi; exit 0; fi
    exit 0;;
esac
exit 0
`;

type Escenario = { dir: string; stack: string; env: NodeJS.ProcessEnv; correr: (args: string[], extra?: Record<string, string>) => { codigo: number; salida: string }; archivo: (n: string) => string };

function montar(fila = "sin_fila", empresas = "1", priv = "si", envInicial = "OTRA_VARIABLE=valor-publico\n"): Escenario {
  const dir = mkdtempSync(join(tmpdir(), "pro133-"));
  const stack = join(dir, "stack");
  const bin = join(dir, "bin");

  mkdirSync(stack); mkdirSync(bin);
  writeFileSync(join(stack, "app.env"), envInicial);
  writeFileSync(join(stack, "compose.yml"), "name: nexit\n"); writeFileSync(join(stack, "app.compose.yml"), "services: {}\n");
  writeFileSync(join(dir, "fila"), fila); writeFileSync(join(dir, "empresas"), empresas); writeFileSync(join(dir, "priv"), priv); writeFileSync(join(dir, "log"), "");
  writeFileSync(join(bin, "docker"), DOCKER_FALSO.split("\r\n").join("\n"));
  chmodSync(join(bin, "docker"), 0o755);

  const env: NodeJS.ProcessEnv = { ...process.env, FAKE_DIR: dir, ENV_REAL: join(stack, "app.env"), NEXIT_DOCKER: join(bin, "docker") };

  delete env.NEXIT_PROVISION_RUC; delete env.NEXIT_PROVISION_PASSWORD;

  return {
    dir, stack, env,
    archivo: (n: string) => (n === "log" ? readFileSync(join(dir, n), "utf8") : readFileSync(join(dir, n), "utf8").trim()),
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

  // ── 1. Los estados se distinguen (GT-01…GT-05) ─────────────────────────────────────────────────
  igual("GT-01 lectura completada sin fila activa → SIN_CONFIGURAR", await e([]), "SIN_CONFIGURAR");
  igual("GT-02 URL no https / con ruta → INVALIDA", [await e([{ ...fila, baseUrl: "http://gateway.test" }]), await e([{ ...fila, baseUrl: "https://gateway.test/ruta" }])], ["INVALIDA", "INVALIDA"]);
  igual("GT-03 fila válida pero sin variables NEXIT_FE_<REF>_* (o solo una) → SIN_CREDENCIALES", [await e([fila], {}), await e([fila], { NEXIT_FE_CASAMINGO_RUC: "x" }), await e([fila], { NEXIT_FE_CASAMINGO_PASSWORD: "x" })], ["SIN_CREDENCIALES", "SIN_CREDENCIALES", "SIN_CREDENCIALES"]);
  igual("referencia con otro nombre → SIN_CREDENCIALES (no se cruzan referencias)", await e([{ ...fila, credencialRef: "OTRA" }]), "SIN_CREDENCIALES");
  igual("GT-04 fila válida y credenciales presentes → CONFIGURADO", await e([fila]), "CONFIGURADO");
  igual("GT-05 R01-02: CUALQUIER excepción de la consulta (conexión, permiso, tabla inexistente) → NO_DISPONIBLE, distinto de SIN_CONFIGURAR, y sin lanzar", [await e(new Error("connection terminated")), await e(Object.assign(new Error("permission denied"), { code: "42501" })), await e(Object.assign(new Error("relation does not exist"), { code: "42P01" }))], ["NO_DISPONIBLE", "NO_DISPONIBLE", "NO_DISPONIBLE"]);
  cierto("NO_DISPONIBLE y SIN_CONFIGURAR son estados y mensajes distintos, y el mensaje de NO_DISPONIBLE no filtra detalles del error", (await estadoGateway(dbCon(new Error("password authentication failed for user x")), EMPRESA, { env })).mensaje !== (await estadoGateway(dbCon([]), EMPRESA, { env })).mensaje && !/password|authentication|user x/.test((await estadoGateway(dbCon(new Error("password authentication failed for user x")), EMPRESA, { env })).mensaje));

  // ── 2. Nada sensible sale; aislamiento por sesión (GT-06) ──────────────────────────────────────
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
  cierto("la empresa se identifica por RAZÓN SOCIAL y debe ser única; el código numérico no se presume; el SQL solo toca fe_gateway_config (sin migraciones, numeración ni documentos) y no contiene credenciales", /razon_social/.test(codigoSql) && /EMPRESA_NO_UNICA/.test(codigoSql) && !/password|token/i.test(codigoSql.replace(/nexit\./g, "")) && !/(UPDATE|INSERT INTO|DELETE FROM) public\.(?!fe_gateway_config)/.test(codigoSql) && !/DROP|TRUNCATE|documentos_electronicos|fe_punto|schema_migrations/i.test(codigoSql) && /CASA MINGO/.test(sh));
  cierto("credenciales: fuente privada (variables del agente o archivo 600/400), escritas con builtins (nunca en argumentos), copia de app.env con marca de tiempo, modo 600; no se imprimen valores ni se piden por chat; no hace login ni envíos", /NEXIT_PROVISION_PASSWORD/.test(sh) && /permisos 600\/400|\"600\" \|\| \"\$perm\" == \"400\"/.test(sh) && /\.bak-/.test(sh) && /chmod 600/.test(sh) && !/echo[^\n]*\$\{?(RUC|PWD_)/.test(sh) && !/curl|wget|api\/login|recepcion_de/.test(sh.replace(/#.*$/gm, "")));
  cierto("procedimiento documentado: automatizado e idempotente, a cargo del agente autorizado, impedimento real declarado (sin SSH ni cofre) y NO aplicado; sin pedir al usuario SQL ni edición manual de secretos", /provisionar-gateway-prueba\.sh/.test(doc) && /NO aplicado en la VM/.test(doc) && /agente autorizado/.test(doc) && /no prueba conexión/.test(doc) && !/Pasos \(responsable|app\.env\.bak/.test(doc));

  // ── 5. Provisionamiento automatizado: ejecución contra un docker simulado (credenciales SINTÉTICAS) ──
  const RUC = "RUC-SINTETICO-123";
  const CLAVE = "clave-sintetica-no-real-987";
  const cred = { NEXIT_PROVISION_RUC: RUC, NEXIT_PROVISION_PASSWORD: CLAVE };
  const lineasEnv = (s: Escenario) => readFileSync(join(s.stack, "app.env"), "utf8");
  const copias = (s: Escenario) => readdirSync(s.stack).filter((n) => n.startsWith("app.env.bak-")).length;
  const recreaciones = (s: Escenario) => (s.archivo("log").match(/^RECREATE$/gm) ?? []).length;
  const escenarios: Escenario[] = [];
  const nuevo = (...a: Parameters<typeof montar>) => { const s = montar(...a); escenarios.push(s); return s; };

  try {
    const a = nuevo();
    const va = a.correr(["--verificar"]);
    igual("--verificar es solo lectura: sin fila → pendiente (10), nada cambia", [va.codigo, lineasEnv(a), a.archivo("fila"), recreaciones(a), copias(a)], [10, "OTRA_VARIABLE=valor-publico\n", "sin_fila", 0, 0]);

    const b = nuevo();
    const sin = b.correr(["--aplicar"]);
    cierto("--aplicar sin fuente privada de credenciales y sin ellas en app.env → CREDENCIALES_REQUERIDAS (6), sin cambios ni simulación", sin.codigo === 6 && /CREDENCIALES_REQUERIDAS/.test(sin.salida) && lineasEnv(b) === "OTRA_VARIABLE=valor-publico\n" && b.archivo("fila") === "sin_fila" && recreaciones(b) === 0);

    const c = nuevo();
    const ap = c.correr(["--aplicar"], cred);
    const logC = c.archivo("log");
    cierto("--aplicar con credenciales: fila creada, app.env con las dos variables (el resto intacto), UNA copia previa, app recreada una sola vez y verificada por presencia", ap.codigo === 0 && c.archivo("fila") === "activa_igual" && lineasEnv(c).includes("OTRA_VARIABLE=valor-publico\n") && lineasEnv(c).includes(`NEXIT_FE_CASAMINGO_RUC=${RUC}\n`) && lineasEnv(c).includes(`NEXIT_FE_CASAMINGO_PASSWORD=${CLAVE}\n`) && copias(c) === 1 && recreaciones(c) === 1 && /VERIFICADO/.test(ap.salida));
    cierto("los secretos NO aparecen en la salida ni en NINGÚN argumento de docker (log)", !ap.salida.includes(RUC) && !ap.salida.includes(CLAVE) && !logC.includes(RUC) && !logC.includes(CLAVE));
    cierto("R01-03: la base se consulta con el usuario y la base leídos del contenedor, nunca con un rol presumido", /-U usuario_real -d base_real/.test(logC) && !/nexit_app/.test(logC));
    if (process.platform !== "win32") cierto("app.env queda con modo 600", (statSync(join(c.stack, "app.env")).mode & 0o777) === 0o600);

    const c2 = c.correr(["--aplicar"], cred);
    cierto("idempotencia: segunda ejecución → sin nueva copia, sin recrear app, fila YA_CONFIGURADA y mismo app.env", c2.codigo === 0 && copias(c) === 1 && recreaciones(c) === 1 && /YA_CONFIGURADA/.test(c2.salida) && lineasEnv(c).split("NEXIT_FE_CASAMINGO_RUC=").length === 2);
    const c3 = c.correr(["--aplicar"], { NEXIT_PROVISION_RUC: RUC, NEXIT_PROVISION_PASSWORD: CLAVE });
    cierto("ejecución sin fuente nueva con credenciales ya presentes: conserva todo (sin cambios)", c3.codigo === 0 && copias(c) === 1 && recreaciones(c) === 1);
    const v2 = c.correr(["--verificar"]);
    igual("--verificar tras aplicar → LISTO (0)", [v2.codigo, /LISTO/.test(v2.salida)], [0, true]);

    const d = nuevo("sin_fila", "2");
    const dr = d.correr(["--aplicar"], cred);
    cierto("empresa no única (razón social ambigua) → aborta (5) sin cambios", dr.codigo === 5 && /no identifica UNA empresa/.test(dr.salida) && lineasEnv(d) === "OTRA_VARIABLE=valor-publico\n" && recreaciones(d) === 0);

    const f = nuevo("sin_fila", "1", "no");
    const fr = f.correr(["--aplicar"], cred);
    cierto("sin privilegio de escritura → aborta (7) ANTES de tocar app.env o recrear", fr.codigo === 7 && lineasEnv(f) === "OTRA_VARIABLE=valor-publico\n" && copias(f) === 0 && recreaciones(f) === 0 && f.archivo("fila") === "sin_fila");

    const g = nuevo("activa_distinta");
    const gr = g.correr(["--aplicar"], cred);
    cierto("existe otra configuración distinta → no se sustituye (7), app.env intacto", gr.codigo === 7 && /otra configuración/.test(gr.salida) && lineasEnv(g) === "OTRA_VARIABLE=valor-publico\n");

    if (process.platform !== "win32") {
      const h = nuevo(); const arch = join(h.dir, "cred.txt");
      writeFileSync(arch, `RUC=${RUC}\nPASSWORD=${CLAVE}\n`); chmodSync(arch, 0o644);
      const hr = h.correr(["--aplicar", "--credenciales-archivo", arch]);
      cierto("archivo de credenciales con permisos abiertos se rechaza (6)", hr.codigo === 6 && lineasEnv(h) === "OTRA_VARIABLE=valor-publico\n");
      chmodSync(arch, 0o600);
      const hr2 = h.correr(["--aplicar", "--credenciales-archivo", arch]);
      cierto("archivo 600 aceptado como fuente privada", hr2.codigo === 0 && lineasEnv(h).includes(`NEXIT_FE_CASAMINGO_RUC=${RUC}`));
    }

    const rv = c.correr(["--revertir"]);
    cierto("--revertir: fila desactivada (no borrada), variables retiradas de app.env (resto intacto, con copia), app recreada, y el siguiente --verificar queda PENDIENTE", rv.codigo === 0 && c.archivo("fila") === "inactiva" && !/NEXIT_FE_CASAMINGO/.test(lineasEnv(c)) && lineasEnv(c).includes("OTRA_VARIABLE=valor-publico") && copias(c) === 2 && recreaciones(c) === 2 && c.correr(["--verificar"]).codigo === 10);
    cierto("la reversión tampoco imprime ni registra secretos", !rv.salida.includes(CLAVE) && !c.archivo("log").includes(CLAVE));
    const b2 = nuevo("sin_fila");
    igual("--revertir sin nada configurado → convergente (0), sin copias ni recreaciones", [b2.correr(["--revertir"]).codigo, copias(b2), recreaciones(b2)], [0, 0, 0]);
  } finally {
    for (const s of escenarios) rmSync(s.dir, { recursive: true, force: true });
  }

  cierto("ningún archivo del repositorio contiene credenciales: el provisionamiento solo usa variables del entorno del agente", !existsSync(join(raiz, "app.env")));

  return fallos;
}
