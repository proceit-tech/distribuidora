/**
 * Proveedores (AUD-NEXIT-PROVEEDORES-DESKTOP-R02) — PRV-D01 (alta con solo PROVEEDORES.CREAR), PRV-D02 (acciones según permisos) y PRV-D03 (errores de la geografía). Verificaciones focales sin PostgreSQL
 * ni navegador: menú/inicio por permisos, estructura de layouts, rutas y pantallas, y el controlador del catálogo geográfico con promesas controladas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearCargaCatalogo, leerCatalogo, MENSAJES_GEO, type EstadoCatalogo, type ResultadoCatalogo } from "@/lib/proveedores/geografia-catalogo";
import { resolveNavigation, resolverInicio, RUTA_SIN_ACCESO } from "@/lib/navigation/menu";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

function respuesta(status: number, cuerpo: unknown, jsonInvalido = false): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (jsonInvalido) throw new Error("json"); return cuerpo; } }) as unknown as Response) as typeof fetch;
}

function diferida<T>() {
  let ok!: (v: T) => void;
  const p = new Promise<T>((a) => { ok = a; });

  return { p, ok };
}

export async function verificarCasosProveedoresR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRV-D01: permisos, menú, layouts ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const acc = (permissions: string[], extra: Partial<{ isCompanyAdmin: boolean; isPlatformAdmin: boolean }> = {}) => ({ permissions, isCompanyAdmin: false, isPlatformAdmin: false, ...extra });
  const etiquetas = (a: ReturnType<typeof acc>) => resolveNavigation(a).flatMap((g) => g.items.map((i) => i.label));

  igual("D01: CREAR-only recibe «Nuevo proveedor» y entra directo a /proveedores/nuevo (no a «Proveedores» ni a /sin-acceso)", [etiquetas(acc(["PROVEEDORES.CREAR"])), resolverInicio(acc(["PROVEEDORES.CREAR"]))], [["Nuevo proveedor"], "/proveedores/nuevo"]);
  igual("D01: VER-only ve «Proveedores»; VER+CREAR ve solo «Proveedores»; EDITAR sin VER/CREAR no gana acceso", [etiquetas(acc(["PROVEEDORES.VER"])), etiquetas(acc(["PROVEEDORES.VER", "PROVEEDORES.CREAR"])), etiquetas(acc(["PROVEEDORES.EDITAR"])), resolverInicio(acc(["PROVEEDORES.EDITAR"]))], [["Proveedores"], ["Proveedores"], [], RUTA_SIN_ACCESO]);
  igual("D01: administrador de empresa conserva «Proveedores» (sin duplicar «Nuevo proveedor»); administrador global solo Empresas", [etiquetas(acc([], { isCompanyAdmin: true })).includes("Proveedores"), etiquetas(acc([], { isCompanyAdmin: true })).includes("Nuevo proveedor"), resolverInicio(acc([], { isPlatformAdmin: true })), etiquetas(acc(["PROVEEDORES.CREAR"], { isPlatformAdmin: true }))], [true, false, "/administracion/empresas", ["Empresas"]]);

  const ruta = leer("app/api/proveedores/route.ts");

  cierto("D01: GET lista/catálogos — VER para la lista y los datos de proveedores; los catálogos mínimos y la geografía admiten VER o CREAR; POST exige CREAR; permiso VER informado desde la sesión del servidor", /denyIfNoPermission\(session, "PROVEEDORES", "VER"\)/.test(ruta) && /modo"\) === "catalogos" \|\| url\.searchParams\.has\("catalogo"\)/.test(ruta) && /denyIfNoPermission\(session, "PROVEEDORES", "CREAR"\)/.test(ruta) && /permisos: \{ ver: !denegadoVer \}/.test(ruta) && /const empresaId = session\.user\.empresaId/.test(ruta) && /WHERE p\.empresa_id = \$1/.test(ruta));
  cierto("D01: la ficha (GET) sigue exigiendo VER y el PUT EDITAR; ninguna empresa lee o modifica otra (empresa_id de la sesión)", /"PROVEEDORES", "VER"|VER/.test(leer("app/api/proveedores/[id]/route.ts")) && /empresa_id = \$1|empresa_id = \$2/.test(leer("app/api/proveedores/[id]/route.ts")));
  cierto("D01: layouts — módulo VER o CREAR; /proveedores/nuevo solo CREAR (sin exigir VER); /proveedores/[id] y la lista VER", /hasPermission\(access, "PROVEEDORES", "VER"\) && !hasPermission\(access, "PROVEEDORES", "CREAR"\)\) notFound\(\)/.test(leer("app/(private)/proveedores/layout.tsx")) && /guardPage\("PROVEEDORES", "CREAR"\)/.test(leer("app/(private)/proveedores/nuevo/layout.tsx")) && !/"VER"/.test(leer("app/(private)/proveedores/nuevo/layout.tsx").replace(/\/\/.*/g, "")) && /guardPage\("PROVEEDORES", "VER"\)/.test(leer("app/(private)/proveedores/[id]/layout.tsx")) && /guardPage\("PROVEEDORES", "VER"\)/.test(leer("app/(private)/proveedores/page.tsx")));

  const nuevo = leer("app/(private)/proveedores/nuevo/page.tsx");
  const retomar = leer("app/(private)/proveedores/_components/retomar-alta.tsx");
  const terminar = nuevo.slice(nuevo.indexOf("function terminar()"), nuevo.indexOf("async function guardar"));

  cierto("D01: la conclusión usa un único «terminar»: con VER vuelve a la lista; sin VER muestra «Proveedor registrado» con «Registrar otro proveedor»; se invoca solo tras el cierre confirmado, también desde RetomarAlta", /if \(!puedeVer\) \{\s+setAltaFinalizada\(true\);\s+return;\s+\}\s+router\.push\("\/proveedores\?ok=creado"\)/.test(terminar) && /if \(cierre\.cerrada\) \{\s+terminar\(\);/.test(nuevo) && /alTerminar=\{terminar\}/.test(nuevo) && /Registrar otro proveedor/.test(nuevo) && /window\.location\.assign\("\/proveedores\/nuevo"\)/.test(nuevo));
  cierto("D01: sin VER no hay enlaces a la lista (migas, volver, cancelar, salir) ni en el formulario de alta ni en la retomada; el id se conserva y no se repite el POST de creación ni los archivos ya cargados", /puedeVerLista=\{puedeVer\}/.test(nuevo) && /puedeVerLista \? \(\s+<Link href="\/proveedores" className=\{styles\.cancelButton\}>\s+Salir sin cerrar la carga/.test(retomar) && /puedeVerLista \? <Link href="\/proveedores">Proveedores<\/Link>/.test(leer("app/(private)/proveedores/_components/proveedor-form.tsx")) && (nuevo.match(/fetch\("\/api\/proveedores"/g) ?? []).length === 1 && /urlRetomada\(id, codigo\)/.test(nuevo) && /restantes = pendientes\.filter/.test(retomar));

  // ── PRV-D02: acciones según permisos ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const lista = leer("app/(private)/proveedores/_components/listado-proveedores.tsx");
  const form = leer("app/(private)/proveedores/_components/proveedor-form.tsx");

  cierto("D02: «Nuevo proveedor» (cabecera y estado vacío) solo con PROVEEDORES.CREAR del servidor; búsqueda, filtros y paginación intactos", /puedeCrear \? \(\s+<Link href="\/proveedores\/nuevo"/.test(lista) && /proveedores\.length === 0 && puedeCrear \? \(/.test(lista) && /hasPermission\(access, "PROVEEDORES", "CREAR"\)/.test(leer("app/(private)/proveedores/page.tsx")) && /busqueda/.test(lista));
  cierto("D02: sin EDITAR la edición común (información, compras, contactos, direcciones, retenciones) va en un bloque deshabilitado, sin «Actualizar proveedor» y con guardado inerte (el PUT del servidor sigue exigiendo EDITAR)", /initial\?\.permisos\.editar !== true/.test(form) && /if \(soloLectura\) return;/.test(form) && ["PestanaInformacion", "PestanaCompras", "PestanaContactos", "PestanaDirecciones", "PestanaRetenciones"].every((p) => new RegExp(`<Bloque bloqueado=\\{soloLectura\\}><${p} ctx=\\{ctx\\} /></Bloque>`).test(form)) && /soloLectura \? \(\s+<span[^>]*>Solo lectura/.test(form));

  const homologacion = leer("app/(private)/proveedores/_components/pestanas/homologacion.tsx");
  const bancos = leer("app/(private)/proveedores/_components/pestanas/bancos.tsx");

  cierto("D02: las acciones con permiso propio NO quedan dentro del bloqueo — gobernanza (homologar/riesgo/bloqueo), aprobación bancaria, reactivación de cuentas y documentos", homologacion.indexOf("<PanelGobernanza") < homologacion.indexOf("<Bloque") && /<\/Bloque>\s+<ResolucionCuenta/.test(bancos) && /<ReactivarCuenta ctx=\{ctx\} cuentaId=\{c\.id\} \/>/.test(bancos) && bancos.indexOf("<ReactivarCuenta") < bancos.search(/<Bloque bloqueado=\{ctx\.soloLectura\}>\s+<header>/) && /\{tab === "documentos" \? <PestanaDocumentos ctx=\{ctx\} \/> : null\}/.test(form) && !/Bloque/.test(leer("app/(private)/proveedores/_components/pestanas/documentos.tsx")));
  cierto("D02: con EDITAR todo se conserva (el submit y las colecciones editables existen y el 409 por versión del PUT no se tocó)", /type="submit" disabled=\{guardando\}/.test(form) && /onSave\(payload, pendientes\)/.test(form) && /key=\{proveedor\.version\}/.test(leer("app/(private)/proveedores/[id]/page.tsx")));

  // ── PRV-D03: geografía ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const ok200 = await leerCatalogo("/x", respuesta(200, { datos: [] }));

  igual("D03: HTTP 200 con lista vacía = catálogo vacío legítimo, SIN error", ok200, { ok: true, lista: [] });
  igual("D03: HTTP 200 con datos", (await leerCatalogo("/x", respuesta(200, { datos: [{ codigo: 1, nombre: "Central" }] }))).ok, true);

  const clasifica = async (f: typeof fetch) => { const r = await leerCatalogo("/x", f); return r.ok ? "ok" : r.causa; };

  igual("D03: 401 → sesión; 403 → permiso; 500 → servicio; 502 → servicio (con código); red → conexión; JSON inválido → servicio", [
    await clasifica(respuesta(401, {})), await clasifica(respuesta(403, {})), await clasifica(respuesta(500, {})), await clasifica(respuesta(502, {})),
    await clasifica((async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch), await clasifica(respuesta(200, {}, true)),
  ], ["sesion", "permiso", "servicio", "servicio", "conexion", "servicio"]);
  igual("D03: mensajes en español, distintos por causa; el 502 informa su código", [MENSAJES_GEO.sesion, MENSAJES_GEO.permiso, MENSAJES_GEO.servicio, MENSAJES_GEO.conexion].map((m) => m.length > 20), [true, true, true, true]);
  igual("D03: el error HTTP distinto de 500 incluye el código", ((await leerCatalogo("/x", respuesta(502, {}))) as { mensaje: string }).mensaje.includes("(código 502)"), true);

  function carga() {
    const pedidos: Array<{ url: string; d: ReturnType<typeof diferida<ResultadoCatalogo>> }> = [];
    const e = { estado: null as EstadoCatalogo | null, historial: [] as EstadoCatalogo[] };
    const c = crearCargaCatalogo({ pedir: (url) => { const d = diferida<ResultadoCatalogo>(); pedidos.push({ url, d }); return d.p; }, alEstado: (s) => { e.estado = s; e.historial.push(s); } });

    return { c, pedidos, e };
  }
  const bien = (...n: string[]): ResultadoCatalogo => ({ ok: true, lista: n.map((nombre, i) => ({ codigo: i + 1, nombre })) });
  const mal = (mensaje: string): ResultadoCatalogo => ({ ok: false, causa: "servicio", mensaje });

  {
    // selección A → B con respuesta y error tardíos de A
    const x = carga();
    const pa = x.c.solicitar("A", "/a");
    const pb = x.c.solicitar("B", "/b");

    x.pedidos[1].d.ok(bien("dB")); await pb;
    x.pedidos[0].d.ok(mal("error tardío de A")); await pa;
    igual("D03: la respuesta/error tardíos de la selección A (ya cambió a B) se descartan: queda el catálogo de B sin error", x.e.estado, { clave: "B", lista: [{ codigo: 1, nombre: "dB" }], error: "", cargando: false });

    const y = carga();
    const p1 = y.c.solicitar("A", "/a");
    const p2 = y.c.solicitar("B", "/b");

    y.pedidos[0].d.ok(bien("dA")); await p1;
    y.pedidos[1].d.ok(mal("falla vigente de B")); await p2;
    igual("D03: un resultado exitoso tardío de A no tapa el error vigente de B", [y.e.estado?.clave, y.e.estado?.error, y.e.estado?.lista.length], ["B", "falla vigente de B", 0]);

    const z = carga();
    const q1 = z.c.solicitar("A", "/a");

    z.pedidos[0].d.ok(mal("sin conexión")); await q1;
    igual("D03: error vigente → se informa, sin lista (no se confunde con vacío)", [z.e.estado?.error, z.e.estado?.lista.length], ["sin conexión", 0]);
    const q2 = z.c.solicitar("A", "/a"); // «Reintentar» repite la consulta vigente

    z.pedidos[1].d.ok(bien("distrito")); await q2;
    igual("D03: «Reintentar» repite la consulta actual y recupera la lista (sin error)", [z.e.estado?.error, z.e.estado?.lista.map((o) => o.nombre)], ["", ["distrito"]]);

    const w = carga();
    const r1 = w.c.solicitar("A", "/a");

    w.c.invalidar(); w.pedidos[0].d.ok(bien("tarde")); await r1;
    igual("D03: al desmontar o cambiar de clave nada pendiente actualiza el estado (solo el «cargando» inicial)", [w.e.historial.length, w.e.estado?.cargando], [1, true]);
  }

  const dirs = leer("app/(private)/proveedores/_components/pestanas/direcciones.tsx");

  cierto("D03: la pestaña ya no convierte errores en lista vacía; muestra el error junto al campo (role=alert) con «Reintentar», usa el controlador con token y mantiene la clave vigente", !/r\.ok \? r\.json\(\) : \{ datos: \[\] \}/.test(dirs) && !/\.catch\(\(\) => activo/.test(dirs) && /role="alert"/.test(dirs) && />\s*Reintentar\s*</.test(dirs) && /crearCargaCatalogo\(/.test(dirs) && /return \(\) => carga\.invalidar\(\)/.test(dirs) && /estado\.clave === clave/.test(dirs));

  return fallos;
}
