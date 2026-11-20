/**
 * Productos (AUD-NEXIT-PRODUCTOS-DESKTOP-R02) — verificaciones focales de PRD-D01…D06, sin PostgreSQL ni navegador: funciones puras, controladores con promesas controladas, simulaciones de la secuencia de
 * edición (NO son pruebas integradas de base de datos) y verificación estructural de rutas, layouts y pantallas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { decidirGet } from "@/lib/productos/acceso-get";
import { cerrarRetomada, estadoTrasEnvio, ID_FOTO, quitarArchivo, registrarEnvio, leerEstadoRetomada, MENSAJE_ABANDONO, leerRetomada, subirDocumentosPendientes, subirFoto, urlRetomada } from "@/lib/productos/alta";
import { puedeCambiarPestana } from "@/lib/productos/borrador-documento";
import { documentoPendienteVacio } from "@/lib/productos/documento-pendiente";
import { decidirAccesoDocumento } from "@/lib/productos/permisos-documentos";
import { resolveNavigation, resolverInicio, RUTA_SIN_ACCESO } from "@/lib/navigation/menu";
import { ErrorValidacion } from "@/lib/productos/errores";
import { eliminacionesVacias, formularioAPayload, type FormularioProducto } from "@/lib/productos/formulario";
import { respuestaError } from "@/lib/productos/shared";
import { exigirVersion, exigirVersionPresente } from "@/lib/productos/version";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

function lanza(f: () => void): { estado: number; mensaje: string } | null {
  try {
    f();

    return null;
  } catch (e) {
    return e instanceof ErrorValidacion ? { estado: e.estado, mensaje: e.message } : { estado: -1, mensaje: String(e) };
  }
}

export async function verificarCasosProductosR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRD-D03: concurrencia de edición ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const V1 = "2026-10-19T14:03:22.123456";
  const V2 = "2026-10-19T14:05:01.654321";

  igual("D03: versión ausente, vacía o no textual → 409 antes de validar", [undefined, "", "   ", null, 123, {}].map((v) => lanza(() => exigirVersionPresente(v))?.estado), [409, 409, 409, 409, 409, 409]);
  igual("D03: la versión vigente exacta se acepta; una distinta → 409", [lanza(() => exigirVersion(V1, V1)), lanza(() => exigirVersion(V1, V2))?.estado], [null, 409]);
  igual("D03: la precisión de microsegundos se conserva (…123456 ≠ …123457 → 409; no se reduce a milisegundos)", [lanza(() => exigirVersion("2026-10-19T14:03:22.123456", "2026-10-19T14:03:22.123457"))?.estado, lanza(() => exigirVersion("2026-10-19T14:03:22.123", "2026-10-19T14:03:22.123456"))?.estado], [409, 409]);
  cierto("D03: el mensaje del 409 es claro y orienta a recargar (sin cambios guardados)", /Recargue la ficha/.test(lanza(() => exigirVersion(V1, V2))?.mensaje ?? "") && /no se guardó ningún cambio/i.test(lanza(() => exigirVersion(V1, V2))?.mensaje ?? ""));

  {
    // Dos editores A/B sobre la misma ficha (simulación de la secuencia: fila bloqueada → comparar versión → escribir)
    const base = { descripcion: "ARROZ", version: V1, hijos: ["u1"] };
    let bd = { ...base };
    const guardar = (enviada: string, cambio: Partial<typeof base>) => {
      const e = lanza(() => exigirVersion(enviada, bd.version));

      if (e) return e.estado;

      bd = { ...bd, ...cambio, version: V2 }; // actualizado_at = now() renueva la versión

      return 200;
    };
    const aDatos = guardar(V1, { descripcion: "ARROZ A" });
    const bDatos = guardar(V1, { descripcion: "ARROZ B", hijos: [] });

    igual("D03: dos editores — A (versión actual) guarda; B (versión obsoleta) recibe 409 y NO modifica descripción ni hijos", [aDatos, bDatos, bd.descripcion, bd.hijos], [200, 409, "ARROZ A", ["u1"]]);
    igual("D03: tras releer la versión nueva B puede guardar", guardar(V2, { descripcion: "ARROZ B" }), 200);
  }

  const ruta = leer("app/api/productos/[id]/route.ts");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  const pos = (t: string) => put.indexOf(t);

  cierto("D03: el PUT exige la versión presente al inicio, la compara DESPUÉS del FOR UPDATE y ANTES de validar o escribir (referencias, alcance, unidad, hijos, precio, UPDATE)", pos("exigirVersionPresente(cuerpo.version)") > 0 && pos("empresa_id = $2 FOR UPDATE") > pos("exigirVersionPresente") && pos("exigirVersion(cuerpo.version") > pos("empresa_id = $2 FOR UPDATE") && ["resolverPais(", "validarReferencias(", "validarAlcanceConfiguraciones(", "validarCambioUnidadBase(", "eliminarHijos(", "UPDATE productos SET", "guardarHijos(", "fijarPrecioReferencia("].every((t) => pos("exigirVersion(cuerpo.version") < pos(t)));
  cierto("D03: el GET entrega la versión con microsegundos (UTC, texto) y el conflicto hace ROLLBACK", /AS version,/.test(ruta) && /HH24:MI:SS\.US/.test(ruta) && /\$\{SQL_VERSION\} AS version/.test(ruta) && /ROLLBACK/.test(put));

  const resp = respuestaError(new ErrorValidacion("Otro usuario modificó este producto", null, 409), "actualizar");
  const cuerpo = (await resp.json()) as { error: string; campo: string | null };

  igual("D03: un ErrorValidacion 409 sale como HTTP 409 (antes se degradaba a 400) conservando el campo", [resp.status, cuerpo.campo, /Otro usuario/.test(cuerpo.error), respuestaError(new ErrorValidacion("x", "descripcion"), "actualizar").status], [409, null, true, 400]);

  const f = { version: V1, descripcion: "x", codigo: "PRD-1", inventarioInicial: { cantidad: "", costoUnitario: "", depositoId: "" }, eliminaciones: eliminacionesVacias() } as unknown as FormularioProducto;

  igual("D03: el formulario de edición envía la versión; el de alta no", [formularioAPayload(f, "editar").version, "version" in formularioAPayload(f, "crear")], [V1, false]);

  const form = leer("app/(private)/productos/_components/producto-form.tsx");

  cierto("D03: ante un 409 la pantalla ofrece recargar la ficha de forma deliberada (con confirmación) y nunca sobrescribe en silencio", /setConflicto\(mode === "edit" && e\.estado === 409\)/.test(form) && /Recargar la ficha actual/.test(form) && /window\.confirm\("Se descartarán sus cambios sin guardar/.test(form));

  // ── PRD-D01: alta con solo PRODUCTOS.CREAR ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const u = (q: string) => new URL("http://x/api/productos" + q);
  const crearSolo = { ver: false, crear: true };
  const verSolo = { ver: true, crear: false };
  const ninguno = { ver: false, crear: false };
  const atender = (q: string, p: { ver: boolean; crear: boolean }) => {
    const d = decidirGet(u(q), p);

    return d.tipo === "permitida" ? { tipo: d.tipo, lista: d.finalidad === "LISTA", productosExistentes: d.incluirProductos } : { tipo: d.tipo, lista: false, productosExistentes: false };
  };

  igual("D01: CREAR-only lee los catálogos mínimos de la alta SIN la lista de productos existentes (C24 pendiente) y sin listado", atender("?modo=catalogos", crearSolo), { tipo: "permitida", lista: false, productosExistentes: false });
  igual("D01: CREAR-only NO obtiene la lista (sin modo, modo=lista, modo vacío o desconocido, parámetros ajenos)", ["", "?modo=lista", "?modo=", "?modo=otro", "?catalogo=x", "?foo=bar", "?q=a"].map((q) => atender(q, crearSolo).tipo), Array.from({ length: 7 }, () => "denegada"));
  igual("D01: modo=catalogos combinado con otros parámetros es inconsistente (400) para todos", [atender("?modo=catalogos&x=1", crearSolo).tipo, atender("?modo=catalogos&modo=lista&q=1", verSolo).tipo, atender("?modo=catalogos&catalogo=", crearSolo).tipo], ["invalida", "invalida", "invalida"]);
  igual("D01: VER conserva lista y catálogos completos (incluida la lista de productos para la composición de KIT)", [atender("", verSolo), atender("?modo=catalogos", verSolo)], [{ tipo: "permitida", lista: true, productosExistentes: true }, { tipo: "permitida", lista: false, productosExistentes: true }]);
  igual("D01: sin permisos nada se atiende; ninguna consulta de CREAR-only devuelve la lista ni productos existentes", [atender("?modo=catalogos", ninguno).tipo, atender("", ninguno).tipo, ["", "?modo=lista", "?modo=catalogos", "?modo=", "?modo=catalogos&x=1"].some((q) => atender(q, crearSolo).lista || atender(q, crearSolo).productosExistentes)], ["denegada", "denegada", false]);

  const rutaLista = leer("app/api/productos/route.ts");

  cierto("D01: la ruta decide por finalidad antes de la excepción, devuelve productos existentes solo con VER, informa permisos.ver desde la sesión y mantiene POST con CREAR y el aislamiento por empresa", /decidirGet\(new URL\(request\.url\), \{ ver: !denegadoVer, crear: tieneCrear \}\)/.test(rutaLista) && /decision\.tipo === "invalida"/.test(rutaLista) && /soloCatalogos && decision\.incluirProductos/.test(rutaLista) && /permisos: \{ ver: !denegadoVer \}/.test(rutaLista) && /denyIfNoPermission\(session, "PRODUCTOS", "CREAR"\)/.test(rutaLista) && /WHERE p\.empresa_id = \$1/.test(rutaLista));
  cierto("D01: layouts — módulo VER o CREAR; /productos/nuevo solo CREAR; /productos, /productos/[id] y /productos/catalogos conservan VER", /hasPermission\(access, "PRODUCTOS", "VER"\) && !hasPermission\(access, "PRODUCTOS", "CREAR"\)\) notFound\(\)/.test(leer("app/(private)/productos/layout.tsx")) && /guardPage\("PRODUCTOS", "CREAR"\)/.test(leer("app/(private)/productos/nuevo/layout.tsx")) && !/"VER"/.test(leer("app/(private)/productos/nuevo/layout.tsx").replace(/\/\/.*/g, "")) && ["page.tsx", "[id]/layout.tsx", "catalogos/layout.tsx"].every((x) => /guardPage\("PRODUCTOS", "VER"\)/.test(leer("app/(private)/productos/" + x))));

  const acc = (permissions: string[], extra: Partial<{ isCompanyAdmin: boolean; isPlatformAdmin: boolean }> = {}) => ({ permissions, isCompanyAdmin: false, isPlatformAdmin: false, ...extra });
  const etiquetas = (a: ReturnType<typeof acc>) => resolveNavigation(a).flatMap((g) => g.items.map((i) => i.label));

  igual("D01: CREAR-only recibe «Nuevo producto» y entra directo a /productos/nuevo; VER ve «Productos» (y los catálogos de productos); EDITAR sin VER/CREAR no gana acceso", [etiquetas(acc(["PRODUCTOS.CREAR"])), resolverInicio(acc(["PRODUCTOS.CREAR"])), etiquetas(acc(["PRODUCTOS.VER"])), etiquetas(acc(["PRODUCTOS.EDITAR"])), resolverInicio(acc(["PRODUCTOS.EDITAR"]))], [["Nuevo producto"], "/productos/nuevo", ["Productos", "Catálogos de productos"], [], RUTA_SIN_ACCESO]);
  igual("D01: administrador de empresa conserva «Productos» sin duplicar «Nuevo producto»; administrador global solo Empresas", [etiquetas(acc([], { isCompanyAdmin: true })).includes("Productos"), etiquetas(acc([], { isCompanyAdmin: true })).includes("Nuevo producto"), etiquetas(acc(["PRODUCTOS.CREAR"], { isPlatformAdmin: true }))], [true, false, ["Empresas"]]);

  // ── PRD-D02: foto y documentos rastreados por separado; retomada sin duplicar ──────────────────────────────────────────────────────────────────
  const PROD = "11111111-1111-4111-8111-111111111111";
  const doc = (nombre: string) => ({ ...documentoPendienteVacio(), uid: "u-" + nombre, archivo: new File(["x"], nombre, { type: "application/pdf" }) });
  const llamadas: string[] = [];
  const falla = (...fallan: string[]) => (async (url: string, init?: RequestInit) => {
    const nombre = init?.body instanceof FormData ? ((init.body.get("archivo") as File | null)?.name ?? "") : "";

    llamadas.push(init?.method + " " + url + (nombre ? " " + nombre : ""));
    if (fallan.includes(nombre)) return { ok: false, status: 500, json: async () => ({ error: "falla " + nombre }) } as unknown as Response;
    if (fallan.includes("red")) throw new TypeError("fetch failed");

    return { ok: true, status: 201, json: async () => ({}) } as unknown as Response;
  }) as never;
  const a = doc("a.pdf");
  const b = doc("b.pdf");
  const primero = await subirDocumentosPendientes(PROD, [a, b], falla("b.pdf"));

  igual("D02: un documento falla tras el POST: el otro queda confirmado y solo el fallido queda pendiente (con su causa); todo va al mismo producto", [primero.subidos, primero.fallidos.map((x) => [x.uid, x.estado, x.mensaje]), llamadas.every((l) => l.includes(PROD + "/documentos"))], [["u-a.pdf"], [["u-b.pdf", 500, "falla b.pdf"]], true]);
  llamadas.length = 0;
  const reintento = await subirDocumentosPendientes(PROD, [b], falla());

  igual("D02: el reintento reenvía SOLO el fallido (lo confirmado no se repite) y nunca llama a POST /api/productos", [reintento.subidos, llamadas, llamadas.some((l) => l.endsWith("/api/productos"))], [["u-b.pdf"], ["POST /api/productos/" + PROD + "/documentos b.pdf"], false]);
  llamadas.length = 0;
  igual("D02: la foto se rastrea aparte — fallo conserva la foto, éxito la libera; caída de red es fallo de la foto", [(await subirFoto(PROD, new File(["f"], "f.png", { type: "image/png" }), falla("f.png"))).ok, (await subirFoto(PROD, new File(["f"], "g.png", { type: "image/png" }), falla())).ok, (await subirFoto(PROD, new File(["f"], "h.png"), falla("red"))).ok], [false, true, false]);
  igual("D02: la retomada se conserva en la URL (id y código) y sobrevive a una recarga; ids inválidos o inyectados se ignoran", [urlRetomada(PROD, "PRD-000012"), leerRetomada("?retomar=" + PROD + "&codigo=PRD-000012"), leerRetomada("?retomar=no-es-uuid"), leerRetomada("?retomar=" + PROD + "&codigo=<script>"), leerRetomada("")], ["/productos/nuevo?retomar=" + PROD + "&codigo=PRD-000012", { id: PROD, codigo: "PRD-000012" }, null, { id: PROD, codigo: "" }, null]);

  const nuevaPagina = leer("app/(private)/productos/nuevo/page.tsx");
  const retomar = leer("app/(private)/productos/_components/retomar-alta.tsx");
  const terminar = nuevaPagina.slice(nuevaPagina.indexOf("function terminar()"), nuevaPagina.indexOf("async function guardar"));
  const guardarFn = nuevaPagina.slice(nuevaPagina.indexOf("async function guardar"), nuevaPagina.indexOf("if (altaFinalizada)"));

  cierto("D02: un único POST de creación; los fallos de foto/documentos llevan a la retomada con el MISMO id (replaceState) en vez de abrir la ficha; el cierre se confirma antes de concluir", (nuevaPagina.match(/fetch\("\/api\/productos"/g) ?? []).length === 1 && /window\.history\.replaceState\(null, "", urlRetomada\(id, codigo, "(?:archivos|cierre)"\)\)/.test(guardarFn) && !/router\.push\(.\/productos\/\$\{id\}/.test(nuevaPagina) && /if \(cierre\.cerrada\) \{\s+terminar\(\);/.test(guardarFn) && /fotoPendiente === null && fallidos\.length === 0/.test(guardarFn));
  cierto("D02: con VER vuelve a la lista; sin VER «Producto registrado» + «Registrar otro producto» sin enlaces prohibidos (miga, volver, cancelar, salir) y la retomada usa solo las rutas del alta", /if \(!puedeVer\) \{\s+setAltaFinalizada\(true\);\s+return;\s+\}\s+router\.push\("\/productos"\)/.test(terminar) && /Registrar otro producto/.test(nuevaPagina) && /window\.location\.assign\("\/productos\/nuevo"\)/.test(nuevaPagina) && /puedeVerLista=\{puedeVer\}/.test(nuevaPagina) && /puedeVerLista \? \(\s+<Link href="\/productos" className=\{styles\.cancelButton\}>\s+Salir sin cerrar/.test(retomar) && !/fetch\("\/api\/productos"/.test(retomar) && /subirFoto\(id, foto\)/.test(retomar) && /setFoto\(null\)/.test(retomar) && /pendientes\.filter\(\(p\) => !r\.subidos\.includes\(p\.uid\)\)/.test(retomar));

  // ── PRD-D04: cierre idempotente solo para el creador ──────────────────────────────────────────────────────────────────────────────────────────
  const crear = { ver: false, editar: false, crear: true };
  // ── PRD-R03-01: la retomada tras recargar no permite cerrar en silencio ───────────────────────────────────────────────────────────────
  llamadas.length = 0;
  const urlTrasFalla = urlRetomada(PROD, "PRD-000012", "archivos");
  const urlSoloCierre = urlRetomada(PROD, "PRD-000012", "cierre");

  igual("R03-01: un documento falla → la URL de retomada conserva el indicador «archivos» (solo id, código e indicador; nada de archivos ni credenciales) y la recarga lo lee", [urlTrasFalla, leerEstadoRetomada(new URL("http://x" + urlTrasFalla).search), leerRetomada(new URL("http://x" + urlTrasFalla).search)], ["/productos/nuevo?retomar=" + PROD + "&codigo=PRD-000012&pend=archivos", "archivos", { id: PROD, codigo: "PRD-000012" }]);
  igual("R03-01: solo falló el cierre → indicador «cierre»; URL antigua, vacía o manipulada se trata como «archivos» (nunca se presume que todo se envió)", [leerEstadoRetomada("?pend=cierre"), leerEstadoRetomada("?retomar=" + PROD), leerEstadoRetomada("?pend="), leerEstadoRetomada("?pend=nada"), leerEstadoRetomada(new URL("http://x" + urlSoloCierre).search)], ["cierre", "archivos", "archivos", "archivos", "cierre"]);

  let preguntas1 = 0;
  let cierres = 0;
  const cierreOk = async () => { cierres += 1; return { cerrada: true } as const; };
  const cierreFalla = async () => { cierres += 1; return { cerrada: false, estado: 500, mensaje: "falló el cierre" } as const; };
  const rCancelada = await cerrarRetomada(true, () => { preguntas1 += 1; return false; }, cierreOk);

  igual("R03-01: tras recargar con pendencia, «Cerrar» pregunta; CANCELAR no llama al servidor, no concluye y mantiene la retomada", [rCancelada, preguntas1, cierres], [{ cerrada: false, cancelada: true, mensaje: "" }, 1, 0]);
  igual("R03-01: el texto de confirmación es el definido", MENSAJE_ABANDONO, "Hay archivos que no pudieron cargarse. Si finaliza ahora, esos archivos no se adjuntarán al producto. ¿Desea finalizar sin los archivos pendientes?");

  const rFallaCierre = await cerrarRetomada(true, () => true, cierreFalla);
  const rReintento = await cerrarRetomada(true, () => true, cierreOk);

  igual("R03-01: CONFIRMAR solicita el cierre; un error HTTP del cierre NO concluye (queda en retomada con su causa) y el reintento concluye solo con respuesta OK", [rFallaCierre, rReintento, cierres], [{ cerrada: false, cancelada: false, mensaje: "falló el cierre (código 500)" }, { cerrada: true }, 2]);

  cierres = 0;
  preguntas1 = 0;
  const rSoloCierre = await cerrarRetomada(false, () => { preguntas1 += 1; return false; }, cierreOk);

  igual("R03-01: si solo falló el cierre (todos los archivos confirmados) se reintenta directo, sin falsa advertencia de archivos pendientes", [rSoloCierre, preguntas1, cierres], [{ cerrada: true }, 0, 1]);

  llamadas.length = 0;
  const trasRecarga = await subirDocumentosPendientes(PROD, [b], falla());
  const tras = await cerrarRetomada(true, () => true, cierreOk);

  igual("R03-01: tras recargar se reenvía SOLO lo que el operador vuelve a elegir (el documento A ya confirmado no se reenvía), siempre al mismo producto, sin crear otro", [trasRecarga.subidos, llamadas, llamadas.some((l) => l.endsWith("/api/productos")), tras], [["u-b.pdf"], ["POST /api/productos/" + PROD + "/documentos b.pdf"], false, { cerrada: true }]);

  const inciertoRed = await subirDocumentosPendientes(PROD, [b], falla("red"));

  igual("R03-01: caída de red con resultado incierto conserva el documento como pendiente y avisa que se verifique antes de reenviar", [inciertoRed.subidos, inciertoRed.fallidos.map((x) => x.estado), /resultado incierto/.test(inciertoRed.fallidos[0]?.mensaje ?? "")], [[], [null], true]);

  const retomarSrc = leer("app/(private)/productos/_components/retomar-alta.tsx");
  const paginaNueva = leer("app/(private)/productos/nuevo/page.tsx");

  cierto("R03-01: la pantalla usa cerrarRetomada con window.confirm y el estado de la URL; solo marca «cierre» con pendientes exactos de la misma sesión; la página lee el indicador al recargar y escribe el correcto en cada replaceState; un único POST de creación y sin almacenamiento del navegador", /cerrarRetomada\(estado === "archivos", \(m\) => window\.confirm\(m\), \(\) => cerrarCargaInicial\(id\)\)/.test(retomarSrc) && /estadoTrasEnvio\(fallas\.length, pendientesExactas, abandono\)/.test(retomarSrc) && /estado: leerEstadoRetomada\(window\.location\.search\), exacta: false/.test(paginaNueva) && /urlRetomada\(id, codigo, "cierre"\)/.test(paginaNueva) && /urlRetomada\(id, codigo, "archivos"\)/.test(paginaNueva) && (paginaNueva.match(/fetch\("\/api\/productos"/g) ?? []).length === 1 && !/localStorage|sessionStorage/.test(retomarSrc + paginaNueva));
  igual("R03-01: CREAR-only sigue sin ficha ni lista (el indicador de la URL no concede nada): consulta ajena denegada, catálogos mínimos permitidos y la ficha exige VER", [decidirGet(new URL("http://x/api/productos?retomar=" + PROD + "&pend=cierre"), { ver: false, crear: true }).tipo, decidirGet(new URL("http://x/api/productos?modo=catalogos"), { ver: false, crear: true }).tipo, /guardPage\("PRODUCTOS", "VER"\)/.test(leer("app/(private)/productos/[id]/layout.tsx"))], ["denegada", "permitida", true]);

  // ── PRD-R04-01: quitar un pendiente no equivale a haberlo enviado ─────────────────────────────────────────────────────────────────────────
  // Modelo de la retomada con la misma lógica que usa el componente: originales A y B fallidos; «quitar» marca abandono si es original; tras enviar se decide el estado.
  llamadas.length = 0;
  const dA = doc("A.pdf");
  const dB = doc("B.pdf");
  const originalesR04 = [dA.uid, dB.uid];
  const abandonoR04 = quitarArchivo(originalesR04, dA.uid).abandono;
  const envioB = await subirDocumentosPendientes(PROD, [dB], falla());
  const estadoQuitandoA = estadoTrasEnvio(envioB.fallidos.length, true, abandonoR04);

  igual("R04-01: dos documentos fallan; se quita A y se envía B con éxito → NO pasa a «cierre» (A no se envió): el cierre sigue exigiendo la decisión explícita", [envioB.subidos, estadoQuitandoA, llamadas], [["u-B.pdf"], null, ["POST /api/productos/" + PROD + "/documentos B.pdf"]]);

  let confirmaciones = 0;
  const llamadasCierre: number[] = [];
  const cerrarR04 = async () => { llamadasCierre.push(1); return { cerrada: true } as const; };
  const cancelaAbandono = await cerrarRetomada(estadoQuitandoA !== "cierre", () => { confirmaciones += 1; return false; }, cerrarR04);

  igual("R04-01: CANCELAR la confirmación mantiene la retomada sin llamar al servidor ni cambiar el estado", [cancelaAbandono, confirmaciones, llamadasCierre.length], [{ cerrada: false, cancelada: true, mensaje: "" }, 1, 0]);
  igual("R04-01: CONFIRMAR el abandono de A permite la conclusión consciente (una sola pregunta, un cierre)", [await cerrarRetomada(true, () => true, cerrarR04), llamadasCierre.length], [{ cerrada: true }, 1]);

  igual("R04-01: la foto pendiente original quitada y el último pendiente quitado (lista vacía, sin envío) tampoco habilitan el cierre directo; lo agregado y quitado en la retomada no cuenta como abandono", [estadoTrasEnvio(0, true, true), quitarArchivo(originalesR04, "u-nuevo").abandono, quitarArchivo(originalesR04, dA.uid).abandono, estadoTrasEnvio(0, false, false)], [null, false, true, null]);

  llamadas.length = 0;
  const todos = await subirDocumentosPendientes(PROD, [dA, dB], falla());
  const directo = await cerrarRetomada(estadoTrasEnvio(todos.fallidos.length, true, false) !== "cierre", () => { throw new Error("no debe preguntar"); }, cerrarR04);

  igual("R04-01: A y B confirmados por el servidor y sin abandono → «cierre» y cierre directo sin falsa confirmación; nada se reenvía ni se crea otro producto", [todos.subidos, estadoTrasEnvio(todos.fallidos.length, true, false), directo, llamadas.length, llamadas.some((l) => l.endsWith("/api/productos"))], [["u-A.pdf", "u-B.pdf"], "cierre", { cerrada: true }, 2, false]);
  igual("R04-01: tras recargar (pend=archivos) sigue exigiendo confirmación aunque no haya fallas; pend=cierre permite el retry directo", [estadoTrasEnvio(0, false, false), leerEstadoRetomada("?pend=archivos"), leerEstadoRetomada("?pend=cierre")], [null, "archivos", "cierre"]);

  const retomarR04 = leer("app/(private)/productos/_components/retomar-alta.tsx");

  cierto("R04-01: «Quitar» (documento y foto) registra el abandono y el estado tras el envío sale de estadoTrasEnvio con ese abandono, no de fallas === 0", /quitar\(p\.uid\)/.test(retomarR04) && /quitar\(ID_FOTO\)/.test(retomarR04) && /estadoTrasEnvio\(fallas\.length, pendientesExactas, abandono\)/.test(retomarR04) && !/fallas\.length === 0 && pendientesExactas/.test(retomarR04));

  // ── PRD-R05-01: los archivos NUEVOS cuyo envío falló también cuentan como abandono al quitarlos ─────────────────────────────────────────────
  // Simulación de la retomada con las MISMAS funciones que usa la pantalla (subirFoto/subirDocumentosPendientes + registrarEnvio/quitarArchivo/estadoTrasEnvio/cerrarRetomada).
  type Sim = { docs: ReturnType<typeof doc>[]; foto: File | null; fallidos: string[]; abandono: boolean; exactas: boolean; estado: "archivos" | "cierre" };
  const sim = (docs: ReturnType<typeof doc>[], foto: File | null = null, exactas = true): Sim => ({ docs, foto, fallidos: [...(foto ? [ID_FOTO] : []), ...docs.map((d) => d.uid)], abandono: false, exactas, estado: "archivos" });
  const quitarSim = (st: Sim, id: string) => { const q = quitarArchivo(st.fallidos, id); st.fallidos = q.fallidos; if (q.abandono) st.abandono = true; if (id === ID_FOTO) st.foto = null; else st.docs = st.docs.filter((d) => d.uid !== id); };
  const agregarSim = (st: Sim, d: ReturnType<typeof doc>) => { st.docs = [...st.docs, d]; };
  const enviarSim = async (st: Sim, enviar: never) => {
    const confirmados: string[] = [];
    const fallos: string[] = [];

    if (st.foto) { const r = await subirFoto(PROD, st.foto, enviar); if (r.ok) { confirmados.push(ID_FOTO); st.foto = null; } else fallos.push(ID_FOTO); }

    const r = await subirDocumentosPendientes(PROD, st.docs, enviar);

    confirmados.push(...r.subidos);
    fallos.push(...r.fallidos.map((f) => f.uid));
    st.docs = st.docs.filter((d) => !r.subidos.includes(d.uid));
    st.fallidos = registrarEnvio(st.fallidos, confirmados, fallos);
    st.estado = estadoTrasEnvio(fallos.length, st.exactas, st.abandono) ?? st.estado;
  };
  const cierresR05: number[] = [];
  const cerrarR05 = async () => { cierresR05.push(1); return { cerrada: true } as const; };
  const cerrarSim = async (st: Sim, responde: boolean) => cerrarRetomada(st.estado === "archivos", () => responde, cerrarR05);

  llamadas.length = 0;
  const A5 = doc("A5.pdf");
  const C5 = doc("C5.pdf");
  const s1 = sim([A5]);

  agregarSim(s1, C5);
  await enviarSim(s1, falla("A5.pdf", "C5.pdf"));
  quitarSim(s1, C5.uid);
  await enviarSim(s1, falla());

  igual("R05-01: A original y C nuevo fallan; se quita C y A se confirma → NO pasa a «cierre» (C falló y se abandonó): mantiene «archivos» y exige confirmación", [s1.abandono, s1.estado, s1.fallidos, s1.docs.length], [true, "archivos", [], 0]);

  cierresR05.length = 0;

  igual("R05-01: CANCELAR el abandono de C no llama al cierre; CONFIRMAR lo solicita y solo concluye con la respuesta OK del servidor", [await cerrarSim(s1, false), cierresR05.length, await cerrarSim(s1, true), cierresR05.length], [{ cerrada: false, cancelada: true, mensaje: "" }, 0, { cerrada: true }, 1]);

  const F5 = new File(["f"], "F5.png", { type: "image/png" });
  const s2 = sim([A5]);

  s2.foto = F5;
  s2.fallidos = [A5.uid];
  await enviarSim(s2, falla("A5.pdf", "F5.png"));
  quitarSim(s2, ID_FOTO);
  await enviarSim(s2, falla());

  igual("R05-01: foto NUEVA que falló y se quitó, con A confirmado después → también exige confirmación (abandono de la foto)", [s2.abandono, s2.estado, await cerrarSim(s2, false)], [true, "archivos", { cerrada: false, cancelada: true, mensaje: "" }]);

  const D5 = doc("D5.pdf");
  const s3 = sim([A5]);

  agregarSim(s3, D5);
  quitarSim(s3, D5.uid); // nunca se intentó enviar: no es abandono
  await enviarSim(s3, falla());
  cierresR05.length = 0;

  igual("R05-01: documento nuevo quitado ANTES de cualquier intento no genera falso abandono → «cierre» directo, sin pregunta", [s3.abandono, s3.estado, await cerrarRetomada(s3.estado === "archivos", () => { throw new Error("no debe preguntar"); }, cerrarR05)], [false, "cierre", { cerrada: true }]);

  const E5 = doc("E5.pdf");
  const s4 = sim([]);

  agregarSim(s4, E5);
  await enviarSim(s4, falla("E5.pdf"));
  s4.exactas = true;
  await enviarSim(s4, falla());

  igual("R05-01: documento nuevo que falla y luego se envía con éxito: ya no es pendiente, no hay abandono y el cierre es directo", [s4.fallidos, s4.abandono, s4.estado], [[], false, "cierre"]);

  llamadas.length = 0;
  const s5 = sim([A5, C5]);

  await enviarSim(s5, falla());

  igual("R05-01: todos confirmados → «cierre» directo; un reintento posterior no reenvía lo confirmado; ningún POST de creación", [s5.estado, s5.docs.length, llamadas.length, llamadas.some((l) => l.endsWith("/api/productos"))], ["cierre", 0, 2, false]);
  igual("R05-01: recarga con pend=archivos sigue protegida (confirma aunque no haya fallas) y pend=cierre reintenta directo", [estadoTrasEnvio(0, false, false), leerEstadoRetomada("?pend=archivos"), leerEstadoRetomada("?pend=cierre")], [null, "archivos", "cierre"]);
  cierto("R05-01: la pantalla usa registrarEnvio/quitarArchivo con la foto y los uid, y el estado sale de estadoTrasEnvio", /registrarEnvio\(fallidos, confirmados, fallos\)/.test(retomarR04) && /quitarArchivo\(fallidos, id\)/.test(retomarR04) && /quitar\(ID_FOTO\)/.test(retomarR04) && /fallos\.push\(ID_FOTO\)/.test(retomarR04));

  const fin = (p: { ver: boolean; editar: boolean; crear: boolean }, ctx: { esCreador: boolean; cargaInicialAbierta: boolean } | null) => decidirAccesoDocumento("FINALIZAR_CARGA", p, ctx).permitido;

  igual("D04: el creador con CREAR cierra con la carga abierta y puede REPETIR el cierre ya cerrado (respuesta HTTP perdida)", [fin(crear, { esCreador: true, cargaInicialAbierta: true }), fin(crear, { esCreador: true, cargaInicialAbierta: false })], [true, true]);
  igual("D04: otro usuario (no creador), otra empresa/producto inexistente (contexto null), VER-only y sin permisos NO pueden usar el retry", [fin(crear, { esCreador: false, cargaInicialAbierta: false }), fin(crear, { esCreador: false, cargaInicialAbierta: true }), fin(crear, null), fin({ ver: true, editar: false, crear: false }, { esCreador: true, cargaInicialAbierta: false }), fin({ ver: false, editar: false, crear: false }, { esCreador: true, cargaInicialAbierta: false })], [false, false, false, false, false]);
  igual("D04: no se reabre ni se amplía la carga — tras el cierre el creador NO puede cargar documentos ni editar datos/versiones; EDITAR conserva todo", [decidirAccesoDocumento("CARGAR", crear, { esCreador: true, cargaInicialAbierta: false }).permitido, decidirAccesoDocumento("EDITAR_DATOS", crear, { esCreador: true, cargaInicialAbierta: true }).permitido, decidirAccesoDocumento("VER_HISTORIAL", crear, { esCreador: true, cargaInicialAbierta: false }).permitido, decidirAccesoDocumento("CARGAR", crear, { esCreador: true, cargaInicialAbierta: true }).permitido, fin({ ver: true, editar: true, crear: false }, { esCreador: false, cargaInicialAbierta: false })], [false, false, false, true, true]);
  cierto("D04: la ruta de cierre solo marca cerrada (nunca reabre) y toma empresa y usuario de la sesión", /carga_documentos_inicial_abierta = false WHERE id = \$1 AND empresa_id = \$2/.test(leer("app/api/productos/[id]/documentos/finalizar/route.ts")) && !/= true/.test(leer("app/api/productos/[id]/documentos/finalizar/route.ts")) && /auth\.sesion\.user\.id/.test(leer("app/api/productos/[id]/documentos/finalizar/route.ts")));

  // ── PRD-D05: interfaz según permisos ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const listado = leer("app/(private)/productos/_components/listado-productos.tsx");
  const formulario = leer("app/(private)/productos/_components/producto-form.tsx");
  const informacion = leer("app/(private)/productos/_components/pestanas/informacion.tsx");

  cierto("D05: «Nuevo producto» (cabecera y estado vacío) solo con PRODUCTOS.CREAR del servidor", /puedeCrear \? \(\s+<Link href="\/productos\/nuevo"/.test(listado) && /productos\.length === 0 && puedeCrear \? \(/.test(listado) && /hasPermission\(access, "PRODUCTOS", "CREAR"\)/.test(leer("app/(private)/productos/page.tsx")));
  cierto("D05: sin EDITAR la ficha es de consulta — datos maestros en bloque deshabilitado, sin «Actualizar producto» y guardado inerte; el permiso viene de la respuesta del servidor", /initial\?\.permisos\.editar !== true/.test(formulario) && /if \(soloLectura\) return;/.test(formulario) && ["PestanaSifen", "PestanaInventario", "PestanaCompras", "PestanaLogistica", "PestanaKit"].every((p) => new RegExp("<Bloque bloqueado=\\{soloLectura\\}><" + p + " ctx=\\{ctx\\} /></Bloque>").test(formulario)) && /soloLectura \? \(\s+<span[^>]*>Solo lectura/.test(formulario) && /permisos: \{ editar: permisosDoc\.editar \}/.test(leer("app/api/productos/[id]/route.ts")));
  cierto("D05: la foto (permiso propio) y los documentos NO quedan dentro del bloqueo", informacion.indexOf("<FotoProducto") > informacion.indexOf("</Bloque>") && informacion.indexOf("<FotoProducto") < informacion.lastIndexOf("<Bloque") && /\{tab === "documentos" \? <PestanaDocumentos ctx=\{ctx\} \/> : null\}/.test(formulario) && !/<Bloque/.test(leer("app/(private)/productos/_components/pestanas/documentos.tsx")) && !/<Bloque/.test(leer("app/(private)/productos/_components/pestanas/foto.tsx")));

  // ── PRD-D06: borrador de documento ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const preguntas: string[] = [];
  const cancelar = (m: string) => { preguntas.push(m); return false; };
  const aceptar = (m: string) => { preguntas.push(m); return true; };

  igual("D06: con borrador, salir de Documentos pide confirmación; CANCELAR mantiene la pestaña (no cambia) y el borrador", [puedeCambiarPestana("documentos", "general", true, cancelar), preguntas.length], [false, 1]);
  igual("D06: CONFIRMAR permite cambiar (descarta solo el borrador); sin borrador, o desde otra pestaña, o dentro de Documentos no se pregunta", [puedeCambiarPestana("documentos", "general", true, aceptar), puedeCambiarPestana("documentos", "general", false, cancelar), puedeCambiarPestana("general", "stock", true, cancelar), puedeCambiarPestana("documentos", "documentos", true, cancelar), preguntas.length], [true, true, true, true, 2]);

  const docs = leer("app/(private)/productos/_components/pestanas/documentos.tsx");

  cierto("D06: la pestaña informa el borrador (nuevo o edición) al formulario, que lo protege al cambiar de pestaña y al salir de la página (useProtegerCambios); el borrador se limpia al desmontar", /const hayBorrador = nuevo !== null \|\| editando !== null/.test(docs) && /marcarBorrador\(hayBorrador\);\s+return \(\) => marcarBorrador\(false\)/.test(docs) && /puedeCambiarPestana\(tab, pestana, borradorDocumento, \(m\) => window\.confirm\(m\)\)/.test(formulario) && /useProtegerCambios\(\(sucio \|\| pendientes\.length > 0 \|\| fotoPendiente !== null \|\| borradorDocumento\) && !guardado\)/.test(formulario));

  return fallos;
}
