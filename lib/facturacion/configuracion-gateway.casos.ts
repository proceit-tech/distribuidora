/**
 * PRO-133 (UI) — pantalla y API «Configuración → Facturación electrónica»: guardar/cambiar credenciales de la API del gateway por empresa, aislamiento multiempresa, permisos, «Probar conexión» con
 * éxito/errores simulados, ausencia de fuga de clave/token, y la integración con la prontitud y el envío. Sin red, sin PostgreSQL y sin credenciales reales: la base se simula con un modelo en memoria
 * de las funciones SQL de NEX-061 (el SQL real NO se ejecutó aquí; T25 queda versionada para el CI) y el gateway con un fetch simulado. No prueba que el gateway real responda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { guardarConfiguracion, leerConfiguracion, leerGuardado, leerPrueba, probarConexion, respuestaErrorConfiguracion } from "@/lib/facturacion/configuracion-gateway";
import { configuracionGateway, estadoGateway } from "@/lib/facturacion/envio";
import { consultarDocumentoGateway, enviarDocumentoGateway, limpiarCacheTokens, tamanoCacheTokens, type FetchLike } from "@/lib/facturacion/gateway";
import { adjuntarCredencialesDeBase, URL_GATEWAY_PRUEBA } from "@/lib/facturacion/gateway-credenciales";
import { puedeEnviarPorGateway } from "@/lib/facturacion/gateway-estado";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADM_A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1"; // administrador de A (CONFIGURAR)
const OPE_A = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2"; // operador de A: solo CREAR
const ADM_B = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";

type Cfg = { baseUrl: string; activo: boolean; timeoutMs: number; ref: string; version: number; pruebaAt: Date | null; pruebaEstado: string | null };
type Cred = { usuario: string; password: string };

/** Modelo en memoria de las funciones SQL de NEX-061: aplica las MISMAS reglas (permiso, aislamiento por empresa, clave nunca devuelta por «ver», límite de intentos). */
function baseFalsa() {
  const cfg = new Map<string, Cfg>();
  const cred = new Map<string, Cred>();
  const intentos = new Map<string, number>();
  const log: Array<{ empresa: string; usuario: string; accion: string; detalle: unknown }> = [];
  const llamadas: Array<{ sql: string; parametros: unknown[] }> = [];
  const permisos = new Map<string, { empresa: string; acciones: Set<string> }>([
    [ADM_A, { empresa: EMP_A, acciones: new Set(["CONFIGURAR", "CREAR", "VER", "EDITAR"]) }],
    [OPE_A, { empresa: EMP_A, acciones: new Set(["CREAR"]) }],
    [ADM_B, { empresa: EMP_B, acciones: new Set(["CONFIGURAR", "CREAR", "VER", "EDITAR"]) }],
  ]);
  const tiene = (e: string, u: string, a: string) => permisos.get(u)?.empresa === e && permisos.get(u)?.acciones.has(a) === true;
  const prohibido = () => Object.assign(new Error("permission"), { code: "42501" });
  const pg = (detail: string) => Object.assign(new Error("regla"), { code: "P0001", detail });
  let caida = false;

  const db = {
    async query(sql: string, p: unknown[] = []) {
      llamadas.push({ sql, parametros: p });
      if (caida) throw new Error("connection terminated");

      const [e, u] = p as string[];

      if (/FROM fe_gateway_config_ver/.test(sql)) {
        if (!tiene(e, u, "CONFIGURAR")) throw prohibido();

        const c = cfg.get(e);
        const k = cred.get(e);

        return { rows: c ? [{ o_base_url: c.baseUrl, o_api_usuario: k?.usuario ?? null, o_tiene_password: k !== undefined, o_activo: c.activo, o_ultima_prueba_at: c.pruebaAt, o_ultima_prueba_estado: c.pruebaEstado }] : [] };
      }
      if (/FROM empresas WHERE id/.test(sql)) return { rows: [{ razon_social: e === EMP_A ? "CASA MINGO S.A." : "OTRA EMPRESA S.A." }] };
      if (/fe_gateway_config_guardar/.test(sql)) {
        if (!tiene(e, u, "CONFIGURAR")) throw prohibido();

        const [, , url, usuario, password, timeout] = p as [string, string, string, string, string | null, number];
        const prev = cred.get(e);

        if (!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{2,5})?$/.test(url)) throw pg("NEX:URL_INVALIDA");
        if (usuario.trim().length < 1 || usuario.trim().length > 60) throw pg("NEX:USUARIO_INVALIDO");
        if (prev === undefined && password === null) throw pg("NEX:PASSWORD_REQUERIDA");

        const cambia = prev === undefined || prev.usuario !== usuario.trim() || (password !== null && password !== prev.password);
        const c = cfg.get(e) ?? { baseUrl: url, activo: true, timeoutMs: timeout, ref: "NEXIT_DB", version: 0, pruebaAt: null, pruebaEstado: null };

        c.baseUrl = url; c.timeoutMs = timeout; c.activo = true; c.ref = "NEXIT_DB";
        if (cambia) { c.version += 1; c.pruebaAt = null; c.pruebaEstado = null; }
        cfg.set(e, c);
        cred.set(e, { usuario: usuario.trim(), password: password ?? prev!.password });
        log.push({ empresa: e, usuario: u, accion: "GUARDAR", detalle: { base_url: url } });

        return { rows: [] };
      }
      if (/FROM fe_gateway_credenciales_leer/.test(sql)) {
        if (!(tiene(e, u, "CREAR") || tiene(e, u, "EDITAR") || tiene(e, u, "VER") || tiene(e, u, "CONFIGURAR"))) throw prohibido();

        const c = cfg.get(e);
        const k = cred.get(e);

        return { rows: c?.activo && k ? [{ ruc: k.usuario, password: k.password, version: c.version }] : [] };
      }
      if (/fe_gateway_credenciales_existe/.test(sql)) return { rows: [{ ok: cred.has(e) }] };
      if (/fe_gateway_prueba_iniciar/.test(sql)) {
        if (!tiene(e, u, "CONFIGURAR")) throw prohibido();

        const n = (intentos.get(e) ?? 0) + 1;

        if (n > 5) return { rows: [{ espera: 240 }] };
        intentos.set(e, n);

        return { rows: [{ espera: 0 }] };
      }
      if (/fe_gateway_prueba_registrar/.test(sql)) {
        if (!tiene(e, u, "CONFIGURAR")) throw prohibido();

        const [, , estado, guardada, version] = p as [string, string, string, boolean, number | null];

        if (guardada && version === null) throw pg("NEX:VERSION_REQUERIDA");

        // Igual que la función SQL: el resultado solo se aplica si la versión probada sigue siendo la vigente.
        const aplicada = guardada && cfg.get(e)?.version === version;

        if (aplicada) { const c = cfg.get(e)!; c.pruebaAt = new Date("2026-10-16T12:00:00Z"); c.pruebaEstado = estado; }
        log.push({ empresa: e, usuario: u, accion: "PROBAR", detalle: { estado, credenciales_guardadas: guardada, version_probada: version, aplicada } });

        return { rows: [{ aplicada }] };
      }
      if (/FROM fe_gateway_config WHERE empresa_id = \$1 AND activo/.test(sql)) {
        const c = cfg.get(e);

        return { rows: c?.activo ? [{ baseUrl: c.baseUrl, credencialRef: c.ref, timeoutMs: c.timeoutMs }] : [] };
      }

      throw new Error(`consulta inesperada: ${sql.slice(0, 60)}`);
    },
  };

  return { db: db as never, cfg, cred, log, llamadas, caer: () => { caida = true; } };
}

const SECRETOS = { password: "Cl4ve-S1nt€tica!$x", ruc: "80099999-9", token: "TOKEN.SECRETO.JWT" };

/** Gateway simulado: acepta solo (ruc, clave) sintéticos; el resto se rechaza o falla según el usuario. */
function gatewayFalso() {
  const pedidos: Array<{ url: string; auth: string | undefined; cuerpo: Record<string, unknown> }> = [];
  const f: FetchLike = async (url, init) => {
    const cuerpo = JSON.parse(init.body) as Record<string, unknown>;

    pedidos.push({ url, auth: init.headers.Authorization, cuerpo });
    if (cuerpo.ruc === "caido") throw new Error("ECONNREFUSED");
    if (cuerpo.ruc === "lento") { const e = new Error("abort"); e.name = "AbortError"; throw e; }
    if (cuerpo.ruc === "error5xx") return { status: 503, text: async () => "Service Unavailable" };
    if (url.endsWith("/api/login")) {
      return cuerpo.ruc === SECRETOS.ruc && cuerpo.password === SECRETOS.password
        ? { status: 200, text: async () => JSON.stringify({ status: "success", token: SECRETOS.token }) }
        : { status: 400, text: async () => JSON.stringify({ status: "error", message: `credenciales inválidas para ${String(cuerpo.ruc)} / ${String(cuerpo.password)}` }) };
    }

    return { status: 200, text: async () => JSON.stringify({ status: "success", message: "ok", nro_lote: "L-1" }) };
  };

  return { f, pedidos };
}

export async function verificarCasosConfiguracionGateway(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const codigoPg = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as { code?: string }).code ?? "otro"; } };
  const rechaza = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : "otro"; } };

  igual("PRO133-NUEVA-URL: gateway de pruebas confirmado vía /api/login", URL_GATEWAY_PRUEBA, "https://gateway.e-factura-hub.com");

  // ── 1. Guardar y cambiar ───────────────────────────────────────────────────────────────────────
  const b = baseFalsa();
  igual("sin configuración: la pantalla ve «sin configurar», la empresa de la sesión y la URL de prueba fija (sin pedirla)", [(await leerConfiguracion(b.db, EMP_A, ADM_A)).configurado, (await leerConfiguracion(b.db, EMP_A, ADM_A)).empresa, (await leerConfiguracion(b.db, EMP_A, ADM_A)).baseUrl], [false, "CASA MINGO S.A.", URL_GATEWAY_PRUEBA]);
  igual("guardar sin contraseña y sin una previa → error 422 dirigido (no se crea nada)", [await rechaza(guardarConfiguracion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: null })), b.cred.size], [422, 0]);
  await guardarConfiguracion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });
  const v1 = await leerConfiguracion(b.db, EMP_A, ADM_A);
  cierto("tras guardar: configurada, usuario visible, solo «hay contraseña» y la URL del gateway de prueba; la URL y el timeout los fija el servidor", v1.configurado && v1.apiUsuario === SECRETOS.ruc && v1.tienePassword && v1.baseUrl === URL_GATEWAY_PRUEBA && b.cfg.get(EMP_A)?.timeoutMs === 30000 && b.cfg.get(EMP_A)?.ref === "NEXIT_DB");
  cierto("GET/edición NUNCA devuelve la contraseña (ni en ninguna propiedad ni en el JSON completo)", !JSON.stringify(v1).includes(SECRETOS.password) && !Object.keys(v1).some((k) => /pass|clave|secret|token/i.test(k.replace("tienePassword", ""))));
  await guardarConfiguracion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: null });
  cierto("editar con la contraseña en blanco CONSERVA la anterior (sin revelarla) y no cambia la versión de credenciales", b.cred.get(EMP_A)?.password === SECRETOS.password && b.cfg.get(EMP_A)?.version === 1);
  await guardarConfiguracion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: "otra-clave-9" });
  cierto("reemplazar la contraseña la cambia, sube la versión de credenciales y borra el resultado de la última prueba", b.cred.get(EMP_A)?.password === "otra-clave-9" && b.cfg.get(EMP_A)?.version === 2 && b.cfg.get(EMP_A)?.pruebaEstado === null);
  cierto("la bitácora no contiene secretos (ni clave ni RUC)", !JSON.stringify(b.log).includes("otra-clave-9") && !JSON.stringify(b.log).includes(SECRETOS.password) && b.log.length === 3);
  await guardarConfiguracion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });

  // forma de lo que llega del navegador
  igual("validación de forma: usuario obligatorio (1–60), contraseña opcional (≤200), sin caracteres de control; la URL/empresa enviadas se ignoran", [
    typeof leerGuardado({}), typeof leerGuardado({ apiUsuario: "  " }), typeof leerGuardado({ apiUsuario: "x".repeat(61) }), typeof leerGuardado({ apiUsuario: "ok", password: "a\nb" }), typeof leerGuardado({ apiUsuario: "ok", password: "x".repeat(201) }),
    leerGuardado({ apiUsuario: " u ", password: "", empresaId: EMP_B, baseUrl: "http://malo" }), leerGuardado({ apiUsuario: "u", password: "p q$'\"\\" }),
  ], ["string", "string", "string", "string", "string", { apiUsuario: "u", password: null }, { apiUsuario: "u", password: "p q$'\"\\" }]);
  igual("la prueba acepta credenciales opcionales con la misma validación", [typeof leerPrueba({ apiUsuario: "a".repeat(61) }), typeof leerPrueba({ password: "x\ty\u0001" }), leerPrueba({}), leerPrueba({ apiUsuario: "u", password: "p" })], ["string", "string", { apiUsuario: null, password: null }, { apiUsuario: "u", password: "p" }]);

  // ── 2. Aislamiento multiempresa y permisos ──────────────────────────────────────────────────────────
  igual("B no ve nada de A: su configuración está vacía y no contiene el usuario ni la clave de A", [(await leerConfiguracion(b.db, EMP_B, ADM_B)).configurado, JSON.stringify(await leerConfiguracion(b.db, EMP_B, ADM_B)).includes(SECRETOS.ruc)], [false, false]);
  await guardarConfiguracion(b.db, EMP_B, ADM_B, { apiUsuario: "ruc-de-b", password: "clave-de-b" });
  cierto("guardar en B no altera a A (y viceversa): cada empresa conserva SUS credenciales", b.cred.get(EMP_A)?.usuario === SECRETOS.ruc && b.cred.get(EMP_B)?.usuario === "ruc-de-b" && b.cred.get(EMP_B)?.password === "clave-de-b");
  igual("un usuario de A NO puede leer ni guardar la configuración de B (la empresa sale de la sesión; la función SQL verifica pertenencia)", [await rechaza(leerConfiguracion(b.db, EMP_B, ADM_A)), await rechaza(guardarConfiguracion(b.db, EMP_B, ADM_A, { apiUsuario: "x", password: "y" })), await rechaza(probarConexion(b.db, EMP_B, ADM_A, { apiUsuario: null, password: null }))], [403, 403, 403]);
  igual("un operador SIN el permiso CONFIGURAR (aunque pueda facturar) recibe 403 en leer, guardar y probar", [await rechaza(leerConfiguracion(b.db, EMP_A, OPE_A)), await rechaza(guardarConfiguracion(b.db, EMP_A, OPE_A, { apiUsuario: "x", password: "y" })), await rechaza(probarConexion(b.db, EMP_A, OPE_A, { apiUsuario: "x", password: "y" }))], [403, 403, 403]);
  cierto("tras los rechazos las credenciales de A siguen intactas", b.cred.get(EMP_A)?.usuario === SECRETOS.ruc);

  // rutas del servidor: permiso en el servidor y empresa de la sesión
  const rutaCfg = leer("app/api/facturacion/configuracion/route.ts");
  const rutaProbar = leer("app/api/facturacion/configuracion/probar/route.ts");
  const servidor = leer("lib/facturacion/servidor.ts");
  cierto("las tres operaciones de la API exigen FACTURACION_ELECTRONICA.CONFIGURAR en el servidor (no solo ocultar botones) y toman empresa/usuario de la sesión, nunca del cuerpo", (rutaCfg.match(/prepararFacturacion\("CONFIGURAR"\)/g) ?? []).length === 2 && /prepararFacturacion\("CONFIGURAR"\)/.test(rutaProbar) && /"PUNTOS" \| "CONFIGURAR"/.test(servidor) && !/empresaId\s*[:=]\s*(cuerpo|datos|request)/.test(rutaCfg + rutaProbar) && !/b\.empresaId[^\n]*cuerpo|cuerpo[^\n]*empresa/i.test(rutaCfg + rutaProbar));
  cierto("las respuestas de la API no incluyen la contraseña ni el token y no se almacenan en caché del navegador", !/password\s*:\s*(datos|g)\.password/.test(rutaCfg) && /Cache-Control": "no-store"/.test(rutaCfg) && /Cache-Control": "no-store"/.test(rutaProbar) && !/token/i.test(sinCom(rutaCfg + rutaProbar)));
  const layout = leer("app/(private)/configuracion/facturacion-electronica/layout.tsx");
  const menu = leer("lib/navigation/menu.ts");
  cierto("la página está protegida en el servidor (guardPage CONFIGURAR) y el menú «Facturación electrónica» exige ese permiso y apunta a la ruta real", /guardPage\("FACTURACION_ELECTRONICA", "CONFIGURAR"\)/.test(layout) && /label: "Facturación electrónica",\s+href: "\/configuracion\/facturacion-electronica",\s+icon: "settings",\s+permission: "FACTURACION_ELECTRONICA\.CONFIGURAR"/.test(menu) && /"\/configuracion\/facturacion-electronica",/.test(menu));

  // ── 3. Probar conexión (éxito / errores simulados, sin fuga) ────────────────────────────────────────
  const g = gatewayFalso();
  const ok = await probarConexion(b.db, EMP_A, ADM_A, { apiUsuario: null, password: null }, { fetch: g.f });
  cierto("probar con las credenciales GUARDADAS: autenticación correcta, solo POST /api/login con el usuario y clave guardados, y se registra el resultado visible", ok.estado === "OK" && ok.credenciales === "GUARDADAS" && g.pedidos.length === 1 && g.pedidos[0].url === `${URL_GATEWAY_PRUEBA}/api/login` && g.pedidos[0].cuerpo.ruc === SECRETOS.ruc && b.cfg.get(EMP_A)?.pruebaEstado === "OK");
  cierto("la respuesta de la prueba no contiene el token ni la clave y solo trae estado + mensaje + origen de las credenciales", !JSON.stringify(ok).includes(SECRETOS.token) && !JSON.stringify(ok).includes(SECRETOS.password) && Object.keys(ok).sort().join() === "credenciales,estado,mensaje");
  cierto("la prueba NO llama a recepcion_de ni a consulta_de y no guarda el token en la caché", g.pedidos.every((p) => p.url.endsWith("/api/login")) && !g.pedidos.some((p) => /recepcion_de|consulta_de/.test(p.url)) && tamanoCacheTokens() === 0);
  const mal = await probarConexion(b.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: "equivocada" }, { fetch: g.f });
  cierto("credenciales inválidas informadas en pantalla → CREDENCIALES_INVALIDAS, marcadas como NO guardadas (no cambian el estado visible), sin eco de la clave", mal.estado === "CREDENCIALES_INVALIDAS" && mal.credenciales === "INFORMADAS" && b.cfg.get(EMP_A)?.pruebaEstado === "OK" && !JSON.stringify(mal).includes("equivocada"));
  igual("caído / lento / 5xx → NO_DISPONIBLE, TIMEOUT, NO_DISPONIBLE", [(await probarConexion(b.db, EMP_A, ADM_A, { apiUsuario: "caido", password: "x" }, { fetch: g.f })).estado, (await probarConexion(b.db, EMP_A, ADM_A, { apiUsuario: "lento", password: "x" }, { fetch: g.f })).estado, (await probarConexion(b.db, EMP_A, ADM_A, { apiUsuario: "error5xx", password: "x" }, { fetch: g.f })).estado], ["NO_DISPONIBLE", "TIMEOUT", "NO_DISPONIBLE"]);
  const lim = baseFalsa();
  await guardarConfiguracion(lim.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });
  const gl = gatewayFalso();
  let ultimo: string | number = "OK";

  for (let i = 0; i < 7; i++) ultimo = await rechaza(probarConexion(lim.db, EMP_A, ADM_A, { apiUsuario: null, password: null }, { fetch: gl.f }));
  cierto("control de abuso: tras 5 pruebas la siguiente se rechaza con 429 SIN llamar al gateway", ultimo === 429 && gl.pedidos.length === 5);
  igual("sin usuario o sin clave disponibles → 422 dirigido y ninguna llamada al gateway", [await rechaza(probarConexion(baseFalsa().db, EMP_A, ADM_A, { apiUsuario: "solo-usuario", password: null }, { fetch: g.f }))], [422]);
  cierto("«Probar conexión» no toca documentos, numeración ni facturas: ninguna consulta SQL de la prueba nombra documentos_electronicos, fe_puntos_expedicion ni fe_documento_*", !b.llamadas.some((l) => /documentos_electronicos|fe_puntos|fe_documento|inventario/.test(l.sql)));

  // errores de la base nunca filtran la clave
  const caida = baseFalsa();
  caida.caer();
  const resp = respuestaErrorConfiguracion(Object.assign(new Error(`falla con ${SECRETOS.password}`), { code: "XX000" }));
  cierto("un error inesperado devuelve 500 genérico sin el mensaje original (la clave no se filtra) y se registra solo el código", resp.status === 500 && !JSON.stringify(await resp.json()).includes(SECRETOS.password));

  // ── 4. Integración con la emisión y la prontitud ────────────────────────────────────────────────────
  limpiarCacheTokens();
  const e0 = baseFalsa();
  igual("sin configuración la prontitud es «sin configurar» y el envío queda bloqueado", [(await estadoGateway(e0.db, EMP_A, { env: {} })).estado, puedeEnviarPorGateway(await estadoGateway(e0.db, EMP_A, { env: {} })), await rechaza(configuracionGateway(e0.db, EMP_A, { env: {} }, ADM_A))], ["SIN_CONFIGURAR", false, 409]);
  await guardarConfiguracion(e0.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });
  const est = await estadoGateway(e0.db, EMP_A, { env: {} });
  cierto("guardar las credenciales en la pantalla deja la prontitud en CONFIGURADO SIN variables de entorno (no depende de app.env) y habilita el envío", est.estado === "CONFIGURADO" && puedeEnviarPorGateway(est) && !JSON.stringify(est).includes(SECRETOS.password));
  igual("la prontitud es por empresa: B sigue «sin configurar» aunque A esté configurada", (await estadoGateway(e0.db, EMP_B, { env: {} })).estado, "SIN_CONFIGURAR");
  const config = await configuracionGateway(e0.db, EMP_A, { env: {} }, ADM_A);
  cierto("la emisión usa las credenciales de la base de LA EMPRESA de la sesión (no del entorno) y exige un usuario con permisos", config.credenciales?.ruc === SECRETOS.ruc && config.credenciales?.password === SECRETOS.password && config.empresaId === EMP_A && (await codigoPg(configuracionGateway(e0.db, EMP_A, { env: {} }, ADM_B))) === "42501");
  cierto("sin usuario de sesión no se leen credenciales de la base (el preflight falla con 409)", (await rechaza(configuracionGateway(e0.db, EMP_A, { env: {} }))) === 409);
  const gd = gatewayFalso();
  const envio = await enviarDocumentoGateway(config, { iTiDE: 1 }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null } as never, { fetch: gd.f, env: {} });
  cierto("el envío (recepcion_de) se autentica con las credenciales de la base y con Bearer del token obtenido; el resultado no contiene clave ni token", !("sinContrato" in envio) && gd.pedidos[0].url.endsWith("/api/login") && gd.pedidos[0].cuerpo.ruc === SECRETOS.ruc && gd.pedidos[1].url.endsWith("/api/recepcion_de") && gd.pedidos[1].auth === `Bearer ${SECRETOS.token}` && !JSON.stringify(envio).includes(SECRETOS.password) && !JSON.stringify(envio).includes(SECRETOS.token));
  const cons = await consultarDocumentoGateway(config, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null }, { fetch: gd.f, env: {} });
  cierto("la consulta de estado también usa las credenciales de la base (token reutilizado de la caché de ESA empresa)", !("sinContrato" in cons) && gd.pedidos.filter((p) => p.url.endsWith("/api/login")).length === 1 && tamanoCacheTokens() === 1);
  await guardarConfiguracion(e0.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: "clave-nueva-123" });
  cierto("cambiar las credenciales invalida los tokens de la empresa (caché vaciada) y el siguiente envío vuelve a autenticarse con las nuevas", tamanoCacheTokens() === 0 && (await adjuntarCredencialesDeBase(e0.db, { ...config, credenciales: undefined }, ADM_A)).credenciales?.password === "clave-nueva-123");
  const gB = gatewayFalso();
  await guardarConfiguracion(e0.db, EMP_B, ADM_B, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });
  const cfgB = await configuracionGateway(e0.db, EMP_B, { env: {} }, ADM_B);
  await enviarDocumentoGateway(cfgB, { iTiDE: 1 }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null } as never, { fetch: gB.f, env: {} });
  cierto("dos empresas con el mismo usuario/clave NO comparten token: la caché es por empresa (B se autentica por su cuenta)", gB.pedidos.some((p) => p.url.endsWith("/api/login")) && tamanoCacheTokens() === 1);

  // fallback: una empresa con configuración ANTERIOR (variables de entorno) sigue funcionando
  const antiguo = baseFalsa();
  antiguo.cfg.set(EMP_A, { baseUrl: URL_GATEWAY_PRUEBA, activo: true, timeoutMs: 15000, ref: "CASAMINGO", version: 0, pruebaAt: null, pruebaEstado: null });
  igual("compatibilidad: una configuración antigua (referencia de variables de entorno) usa el entorno y no consulta las credenciales de la base", [(await estadoGateway(antiguo.db, EMP_A, { env: { NEXIT_FE_CASAMINGO_RUC: "x", NEXIT_FE_CASAMINGO_PASSWORD: "y" } })).estado, (await estadoGateway(antiguo.db, EMP_A, { env: {} })).estado, antiguo.llamadas.some((l) => /fe_gateway_credenciales_leer/.test(l.sql))], ["CONFIGURADO", "SIN_CREDENCIALES", false]);

  // ── 4b. UI-R01-01: NEXIT_DB es EXCLUSIVO de la base (jamás variables globales) ──────────────────────
  const envGlobal = { NEXIT_FE_NEXIT_DB_RUC: "ruc-global-compartido", NEXIT_FE_NEXIT_DB_PASSWORD: "clave-global-compartida" };
  const ex = baseFalsa();
  ex.cfg.set(EMP_A, { baseUrl: URL_GATEWAY_PRUEBA, activo: true, timeoutMs: 30000, ref: "NEXIT_DB", version: 1, pruebaAt: null, pruebaEstado: null });   // configuración de A sin credenciales en la base
  const exA = await estadoGateway(ex.db, EMP_A, { env: envGlobal });
  igual("UI-R01-01 NEXIT_DB sin credenciales en la base y con variables NEXIT_FE_NEXIT_DB_* presentes en el entorno → SIN_CREDENCIALES (el entorno global NO cuenta) y envío bloqueado", [exA.estado, puedeEnviarPorGateway(exA)], ["SIN_CREDENCIALES", false]);
  igual("UI-R01-01 el preflight del envío responde 409 (antes de reservar numeración) aunque exista el entorno global", await rechaza(configuracionGateway(ex.db, EMP_A, { env: envGlobal }, ADM_A)), 409);
  const gx = gatewayFalso();
  const sinCred = { empresaId: EMP_A, baseUrl: URL_GATEWAY_PRUEBA, credencialRef: "NEXIT_DB", timeoutMs: 30000 };
  const rEnvio = await enviarDocumentoGateway(sinCred, { iTiDE: 1 }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null } as never, { fetch: gx.f, env: envGlobal });
  const rCons = await consultarDocumentoGateway(sinCred, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null }, { fetch: gx.f, env: envGlobal });
  cierto("UI-R01-01 aun si se llegara al cliente del gateway, envío y consulta con NEXIT_DB sin credenciales de la base devuelven «sin credenciales» y NO hacen ninguna llamada de red (el entorno global no se usa)", "sinContrato" in rEnvio && rEnvio.sinContrato === "CREDENCIALES" && "sinContrato" in rCons && rCons.sinContrato === "CREDENCIALES" && gx.pedidos.length === 0);
  await guardarConfiguracion(ex.db, EMP_B, ADM_B, { apiUsuario: "ruc-de-b", password: "clave-de-b" });
  const exB = await estadoGateway(ex.db, EMP_B, { env: envGlobal });
  const cfgExB = await configuracionGateway(ex.db, EMP_B, { env: envGlobal }, ADM_B);
  cierto("UI-R01-01 la empresa B (con SUS credenciales en la base) queda CONFIGURADA y usa las suyas; A sigue bloqueada: no se comparte ninguna credencial entre empresas ni con el entorno", exB.estado === "CONFIGURADO" && cfgExB.credenciales?.ruc === "ruc-de-b" && (await estadoGateway(ex.db, EMP_A, { env: envGlobal })).estado === "SIN_CREDENCIALES");
  igual("UI-R01-01 compatibilidad: una referencia ANTIGUA distinta de NEXIT_DB sigue usando sus variables de entorno (CASAMINGO)", [
    (await consultarDocumentoGateway({ empresaId: EMP_A, baseUrl: URL_GATEWAY_PRUEBA, credencialRef: "CASAMINGO", timeoutMs: 30000 }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null }, { fetch: gx.f, env: { NEXIT_FE_CASAMINGO_RUC: "r", NEXIT_FE_CASAMINGO_PASSWORD: "p" } })) !== undefined,
    gx.pedidos.some((p) => p.url.endsWith("/api/login") && p.cuerpo.ruc === "r"),
  ], [true, true]);
  const emision = leer("lib/facturacion/envio.ts");
  cierto("UI-R01-01 el preflight de credenciales precede a la creación del documento y a la reserva de numeración en emitirFactura", emision.indexOf("await configuracionGateway(db, empresaId, dep, usuarioId);\n\n  const salida") > 0 && emision.indexOf("await configuracionGateway(db, empresaId, dep, usuarioId);\n\n  const salida") < emision.indexOf("await crearFacturaElectronica(db, empresaId, usuarioId, cuerpo, salida)"));

  // ── 4c. UI-R01-02: la prueba se vincula a la VERSIÓN de las credenciales ───────────────────────────────
  const rc = baseFalsa();
  await guardarConfiguracion(rc.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: SECRETOS.password });
  const gr = gatewayFalso();
  // El usuario guarda una contraseña NUEVA mientras la autenticación de la anterior sigue en curso (la respuesta del gateway llega DESPUÉS).
  const fetchCarrera: FetchLike = async (url, init) => {
    await guardarConfiguracion(rc.db, EMP_A, ADM_A, { apiUsuario: SECRETOS.ruc, password: "clave-nueva-durante-la-prueba" });

    return gr.f(url, init);
  };
  const enCurso = await probarConexion(rc.db, EMP_A, ADM_A, { apiUsuario: null, password: null }, { fetch: fetchCarrera });
  const registro = rc.llamadas.filter((l) => /fe_gateway_prueba_registrar/.test(l.sql)).pop();
  cierto("UI-R01-02 la prueba (versión 1) termina DESPUÉS de guardar la contraseña nueva (versión 2): el resultado NO se aplica a la configuración nueva (sigue sin probar) y se informa como credenciales ANTERIORES", enCurso.estado === "OK" && enCurso.credenciales === "ANTERIORES" && rc.cfg.get(EMP_A)?.version === 2 && rc.cfg.get(EMP_A)?.pruebaEstado === null && rc.cfg.get(EMP_A)?.pruebaAt === null);
  cierto("UI-R01-02 la versión probada viaja a la base (se leyó ANTES de la llamada externa): registrar recibe la versión 1, no la vigente al terminar", registro !== undefined && registro.parametros[4] === 1 && registro.parametros[3] === true);
  const normal = await probarConexion(rc.db, EMP_A, ADM_A, { apiUsuario: null, password: null }, { fetch: async (u, i) => gr.f(u, i) });
  cierto("UI-R01-02 una prueba normal de la misma versión (aunque use la clave nueva) se aplica: GUARDADAS y el estado visible queda registrado; la clave nueva fue rechazada por el gateway simulado y así consta", normal.credenciales === "GUARDADAS" && normal.estado === "CREDENCIALES_INVALIDAS" && rc.cfg.get(EMP_A)?.pruebaEstado === "CREDENCIALES_INVALIDAS");
  await new Promise<void>((r) => { setTimeout(r, 0); });
  const lento = baseFalsa();
  await guardarConfiguracion(lento.db, EMP_A, ADM_A, { apiUsuario: "lento", password: "x" });
  const tOut = await probarConexion(lento.db, EMP_A, ADM_A, { apiUsuario: null, password: null }, { fetch: gr.f });
  cierto("UI-R01-02 timeout y error de la MISMA versión siguen registrándose (TIMEOUT aplicado a la versión vigente)", tOut.estado === "TIMEOUT" && tOut.credenciales === "GUARDADAS" && lento.cfg.get(EMP_A)?.pruebaEstado === "TIMEOUT");
  const sqlUi = leer("documentacao/banco/nexit/v1/migraciones/NEX-061-facturacion-gateway-credenciales-empresa.sql").replace(/--.*$/gm, "");
  cierto("UI-R01-02 (SQL) fe_gateway_prueba_registrar exige la versión probada y solo actualiza WHERE credenciales_version = p_version en la misma operación; devuelve si se aplicó y la bitácora guarda la versión", /fe_gateway_prueba_registrar\(p_empresa uuid, p_usuario uuid, p_estado text, p_guardada boolean, p_version integer\) RETURNS boolean/.test(sqlUi) && /WHERE empresa_id = p_empresa AND credenciales_version = p_version/.test(sqlUi) && /NEX:VERSION_REQUERIDA/.test(sqlUi) && /'version_probada', p_version/.test(sqlUi) && /fe_gateway_prueba_registrar\(uuid, uuid, text, boolean, integer\)/.test(sqlUi));
  cierto("UI-R01-02 (pantalla) avisa cuando el resultado corresponde a credenciales anteriores y vuelve a cargar el estado", /ANTERIORES/.test(leer("app/(private)/configuracion/facturacion-electronica/page.tsx")) && /NO se aplicó a la configuración actual/.test(leer("app/(private)/configuracion/facturacion-electronica/page.tsx")));

  // ── 5. Pantalla ──────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/configuracion/facturacion-electronica/page.tsx");
  cierto("la pantalla (español PY) muestra empresa, URL de prueba fija (solo lectura), usuario, contraseña enmascarada con «Mostrar», estado, última conexión probada y los botones Probar conexión y Guardar", /Facturación electrónica/.test(pagina) && /Usuario API \(RUC\)/.test(pagina) && /Contraseña API/.test(pagina) && /type=\{ver \? "text" : "password"\}/.test(pagina) && /Mostrar/.test(pagina) && /Probar conexión/.test(pagina) && /Guardar/.test(pagina) && /Última conexión probada/.test(pagina) && /readOnly/.test(pagina));
  cierto("la pantalla no pide endpoints, referencia técnica ni token; no guarda la contraseña en el navegador (ni localStorage ni estado persistente) y la limpia tras guardar; en edición solo indica que hay una configurada", !/endpoint|credencial_ref|referencia técnica|token/i.test(sinCom(pagina).replace(/aria-/g, "")) && !/localStorage|sessionStorage|document\.cookie/.test(pagina) && /setPassword\(""\)/.test(pagina) && /conf\.tienePassword/.test(pagina) && /autoComplete="new-password"/.test(pagina) && !/value=\{conf\.(password|clave)/.test(pagina));
  const nueva = leer("app/(private)/facturas/nueva/page.tsx");
  cierto("«Nueva factura» mantiene el bloqueo del envío mientras el gateway no esté CONFIGURADO (la prontitud ahora refleja lo guardado en la pantalla de configuración)", /disabled=\{enviando \|\| !puedeEnviarPorGateway\(gateway\)\}/.test(nueva));

  // ── 6. Base de datos: texto de NEX-061 ───────────────────────────────────────────────────────────────
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-061-facturacion-gateway-credenciales-empresa.sql");
  const sql = mig.replace(/--.*$/gm, "");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-061.sql");
  cierto("NEX-061 es incremental (no edita NEX-001…060), exige NEX-047/052, no se reaplica por suposición y reutiliza fe_gateway_config", /requiere NEX-047/.test(mig) && /parece aplicada/.test(mig) && /ALTER TABLE public\.fe_gateway_config\s+ADD COLUMN credenciales_version/.test(sql) && !/(DROP|TRUNCATE|DELETE FROM) /.test(sql.replace(/REVOKE ALL[^;]*;/g, "").replace(/BEFORE TRUNCATE ON/g, "")));
  cierto("la clave vive en una tabla APARTE sin ningún privilegio para el rol de la aplicación (REVOKE ALL) y solo se accede por funciones SECURITY DEFINER; no hay cifrado ni hash (decisión expresa del responsable)", /CREATE TABLE public\.fe_gateway_credenciales/.test(sql) && /REVOKE ALL ON public\.fe_gateway_credenciales, public\.fe_gateway_prueba_limite, public\.fe_gateway_config_log FROM nexit_runtime/.test(sql) && !/GRANT (SELECT|INSERT|UPDATE|ALL)[^;]*fe_gateway_credenciales/.test(sql) && !/crypt\(|digest\(|pgp_sym|gen_salt|sha256/i.test(sql));
  cierto("'fe_gateway_config_ver' NO selecciona la clave (solo tiene_password), la bitácora no guarda secretos y toda función SECURITY DEFINER fija search_path", !/c\.api_password(?! IS NOT NULL)/.test(sql.slice(sql.indexOf("FUNCTION public.fe_gateway_config_ver"), sql.indexOf("FUNCTION public.fe_gateway_config_guardar"))) && /\(c\.api_password IS NOT NULL\)/.test(sql) && !/jsonb_build_object\([^;]*,\s*(p_password|c\.api_password|v_prev\.api_password|api_password)\s*[,)]/.test(sql) && (sql.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length === 6);
  cierto("las funciones de configuración verifican FACTURACION_ELECTRONICA.CONFIGURAR (ver, guardar, probar) y la lectura de credenciales exige un permiso de facturación del usuario; el permiso queda SIN asignar a perfiles (solo el administrador lo tiene por definición)", (sql.match(/usuario_tiene_permiso\(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR'\)/g) ?? []).length >= 4 && /fe_gateway_credenciales_leer[\s\S]*'CREAR'[\s\S]*'EDITAR'[\s\S]*'VER'[\s\S]*'CONFIGURAR'/.test(sql) && /VALUES \('FACTURACION_ELECTRONICA\.CONFIGURAR'[^)]*'ADMINISTRATIVA'\)/.test(sql) && !/perfil_permiso/.test(sql));
  cierto("control de abuso en la base: 5 intentos por ventana de 5 minutos y 3 segundos entre intentos, por empresa", /interval '3 seconds'/.test(sql) && /interval '5 minutes'/.test(sql) && /intentos >= 5/.test(sql));
  cierto("cambiar usuario o clave sube credenciales_version y borra el último resultado de la prueba; guardar reutiliza el ON CONFLICT de la fila de la empresa", /credenciales_version = credenciales_version \+ 1, ultima_prueba_at = NULL, ultima_prueba_estado = NULL/.test(sql) && /ON CONFLICT \(empresa_id\) DO UPDATE/.test(sql));
  cierto("reversión NEX-061: aborta si el permiso está asignado o si hay credenciales sin confirmación expresa; no toca documentos ni numeración", /confirmo_perder_credenciales/.test(rev) && /perfil_permiso/.test(rev) && /REVERSIÓN ABORTADA/.test(rev) && !/documentos_electronicos|fe_puntos|fe_punto_secuencias/.test(rev));
  const t25 = leer("documentacao/banco/nexit/v1/pruebas/T25-nex061-gateway-config.sql");
  const runner = leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh");
  cierto("T25 (SQL) versionada y registrada en el runner: permiso, aislamiento entre empresas, la clave no se devuelve, el rol de la aplicación no lee la tabla de credenciales, versión/limite/bitácora", /T19 T21 T25( T26)?( T27)?( T30)?( T32)?; do/.test(runner) && /has_table_privilege\('nexit_runtime', 'public\.fe_gateway_credenciales'/.test(t25) && /42501/.test(t25) && /fe_gateway_config_ver/.test(t25) && /fe_gateway_prueba_iniciar/.test(t25));

  // ── 7. Alcance: nada fiscal ni de numeración cambió ───────────────────────────────────────────────
  const gw = leer("lib/facturacion/gateway.ts");
  const payload = leer("lib/facturacion/payload-fe.ts");
  cierto("alcance: el contrato de envío/consulta (recepcion_de, consulta_de), el payload SIFEN y la numeración no se modificaron; el gateway solo gana credenciales por empresa y la prueba de login", /\/api\/recepcion_de/.test(gw) && /\/api\/consulta_de/.test(gw) && !/probarLoginGateway|credenciales/.test(payload) && !/fe_punto_secuencias|ultimo_numero/.test(leer("lib/facturacion/configuracion-gateway.ts")));

  return fallos;
}
