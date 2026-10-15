/**
 * PRO-133 — configuración del gateway de PRUEBA y prontitud en la pantalla. Sin red, sin PostgreSQL y sin credenciales reales: el estado se calcula con una base simulada y un entorno inyectado;
 * el SQL de aprovisionamiento y la reversión NO se ejecutaron (solo se verifica su texto versionado). «CONFIGURADO» no prueba que el gateway responda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { estadoGateway } from "@/lib/facturacion/envio";
import { ESTADOS_GATEWAY, puedeEnviarPorGateway } from "@/lib/facturacion/gateway-estado";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";

const dbCon = (rows: unknown[] | Error) => ({ async query() { if (rows instanceof Error) throw rows; return { rows }; } }) as never;

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

  // ── 1. Los cuatro estados se distinguen ────────────────────────────────────────────────────────
  igual("sin fila activa → SIN_CONFIGURAR", await e([]), "SIN_CONFIGURAR");
  igual("URL no https / con ruta → INVALIDA", [await e([{ ...fila, baseUrl: "http://gateway.test" }]), await e([{ ...fila, baseUrl: "https://gateway.test/ruta" }])], ["INVALIDA", "INVALIDA"]);
  igual("fila válida pero sin variables NEXIT_FE_<REF>_* (o solo una) → SIN_CREDENCIALES", [await e([fila], {}), await e([fila], { NEXIT_FE_CASAMINGO_RUC: "x" }), await e([fila], { NEXIT_FE_CASAMINGO_PASSWORD: "x" })], ["SIN_CREDENCIALES", "SIN_CREDENCIALES", "SIN_CREDENCIALES"]);
  igual("referencia con otro nombre → SIN_CREDENCIALES (no se cruzan referencias)", await e([{ ...fila, credencialRef: "OTRA" }]), "SIN_CREDENCIALES");
  igual("fila válida y credenciales presentes → CONFIGURADO", await e([fila]), "CONFIGURADO");
  igual("fallo de lectura (p. ej. sin NEX-047) → SIN_CONFIGURAR, sin lanzar", await e(new Error("relation does not exist")), "SIN_CONFIGURAR");

  // ── 2. Nada sensible sale ───────────────────────────────────────────────────────────────────────
  const todos = JSON.stringify(await Promise.all([[], [fila], [{ ...fila, baseUrl: "http://x" }]].map((r) => estadoGateway(dbCon(r), EMPRESA, { env }))));
  cierto("la respuesta de estado no contiene URL, referencia, RUC ni clave y solo trae estado + mensaje", !/gateway-bebidas|CASAMINGO|0000000-0|clave-de-prueba/.test(todos) && Object.keys(await estadoGateway(dbCon([fila]), EMPRESA, { env })).sort().join() === "estado,mensaje");
  igual("solo CONFIGURADO habilita el envío (null/cargando también lo bloquea)", [...ESTADOS_GATEWAY.map((s) => puedeEnviarPorGateway({ estado: s, mensaje: "" })), puedeEnviarPorGateway(null)], [false, false, false, true, false]);
  igual("la consulta usa la empresa de la sesión", await (async () => { const llamadas: unknown[][] = []; await estadoGateway({ async query(_s: string, p: unknown[]) { llamadas.push(p); return { rows: [] }; } } as never, EMPRESA, { env }); return llamadas; })(), [[EMPRESA]]);

  // ── 3. Servidor y pantalla ──────────────────────────────────────────────────────────────────────
  const envio = leer("lib/facturacion/envio.ts");
  const ruta = leer("app/api/facturas/catalogos/route.ts");
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  cierto("el estado usa la MISMA comprobación del preflight de envío (fila activa → configGatewayValida → leerCredenciales) y el preflight 409 sigue intacto antes de reservar número", /export async function estadoGateway/.test(envio) && /configGatewayValida\(empresaId, fila\)/.test(envio) && /leerCredenciales\(valida\.credencialRef, dep\.env\)/.test(envio) && /La empresa no tiene configurado el gateway de facturación electrónica\./.test(envio) && /await configuracionGateway\(/.test(envio));
  cierto("el catálogo de la factura entrega el estado del gateway de la empresa de la sesión (sin red ni secretos)", /estadoGateway\(b\.db, b\.empresaId\)/.test(ruta));
  cierto("pantalla: aviso visible cuando el gateway no está CONFIGURADO y «Enviar factura» deshabilitado (también mientras carga); Revisar sigue disponible", /gateway !== null && !puedeEnviarPorGateway\(gateway\)/.test(pagina) && /disabled=\{enviando \|\| !puedeEnviarPorGateway\(gateway\)\}/.test(pagina) && /setGateway\(j\.gateway \?\? null\)/.test(pagina) && /disabled=\{!puedeGuardar\} onClick=\{grabar\}/.test(pagina));

  // ── 4. Aprovisionamiento versionado, sin secretos ───────────────────────────────────────────────
  const sql = leer("documentacao/banco/nexit/v1/scripts/configurar-gateway-prueba-NEX-047.sql");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-gateway-prueba-NEX-047.sql");
  const doc = leer("documentacao/infra/CONFIGURACION-GATEWAY-FE-PRUEBA.md");
  const codigo = sql.replace(/--.*$/gm, "");
  cierto("script de aprovisionamiento: manual, una sola empresa por código, aborta si NEX-047 falta / la empresa no es única / ya tiene fila, inserta solo URL de prueba https + referencia lógica + timeout, sin credenciales ni otras tablas", /fe_gateway_config no existe/.test(codigo) && /no existe o no es única/.test(codigo) && /ya tiene una configuración de gateway: no se sobrescribe/.test(codigo) && /INSERT INTO public\.fe_gateway_config \(empresa_id, base_url, credencial_ref, timeout_ms, activo\)/.test(codigo) && /https:\/\/gateway-bebidas-py\.e-factura-hub\.com/.test(codigo) && !/password|token/i.test(codigo) && !/UPDATE|DELETE|DROP|TRUNCATE|documentos_electronicos|fe_punto/i.test(codigo));
  cierto("reversión: desactiva (no borra) solo la fila de la empresa indicada", /SET activo = false/.test(rev) && !/DELETE|DROP|TRUNCATE/i.test(rev.replace(/--.*$/gm, "")) && /e\.codigo = :'empresa'/.test(rev));
  cierto("procedimiento documentado: variables NEXIT_FE_CASAMINGO_* solo en app.env (fuera de Git), recreación solo de la app, verificación de presencia sin imprimir valores, reversión y límites (no prueba conexión, sin migrations/numeración/transmisión)", /NEXIT_FE_CASAMINGO_RUC/.test(doc) && /app\.env/.test(doc) && /--no-deps --force-recreate app/.test(doc) && /credenciales=presentes/.test(doc) && !/printenv NEXIT_FE|echo \$NEXIT_FE/.test(doc) && /NO aplicado en la VM/.test(doc) && /no prueba conexión/.test(doc));

  return fallos;
}
