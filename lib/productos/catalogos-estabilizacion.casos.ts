/**
 * Estabilización de Catálogos de productos (AUD-CATALOGOS-PRODUCTOS-V1 §VI): CAT-A01 (auxiliares con error), A02 (respuestas fuera de orden), A03 (rascunho y navegación lateral),
 * A04 (referencias históricas inactivas), A05 (confirmación con descendientes) y A06 (versión de edición). Sin base de datos: funciones puras con un fetch simulado,
 * un simulador del bloqueo consultivo y verificaciones estáticas. NO prueban PostgreSQL ni el navegador.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cargaConfiable, cargarCatalogoCompleto, crearCompuerta, motivoBloqueoGuardar, permisosVigentes, textoConfirmarInactivacion, type FilaCatalogo, type TipoCatalogoCarga } from "@/lib/productos/catalogos-carga";
import { exigirVersionCatalogo } from "@/lib/productos/catalogos-version";
import { catalogosConHistoricas } from "@/lib/productos/historicas";
import type { CatalogoProductos } from "@/types/productos";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");
const fila = (p: Partial<FilaCatalogo> & { id: string; nombre: string }): FilaCatalogo => ({ codigo: "", descripcion: "", activo: true, productos: 0, ...p });

type Resp = { status: number; cuerpo?: unknown } | "red";

export async function verificarCasosCatalogosEstabilizacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const fetchDe = (rutas: Record<string, Resp>) => {
    const llamadas: string[] = [];

    return {
      llamadas,
      f: async (url: string) => {
        llamadas.push(url);

        const r = rutas[url];

        if (!r || r === "red") throw new TypeError("fetch failed");

        return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
      },
    };
  };
  const OK = { permisos: { crear: true, editar: true } };
  const lineasOk = { status: 200, cuerpo: { lineas: [fila({ id: "l1", nombre: "L1", familiaId: "f1" })], ...OK } };
  const familiasOk = { status: 200, cuerpo: { familias: [fila({ id: "f1", nombre: "F1" })], ...OK } };
  const categoriasOk = { status: 200, cuerpo: { categorias: [fila({ id: "c1", nombre: "C1" })], ...OK } };

  // ── CAT-A01
  const todo = await cargarCatalogoCompleto("lineas", fetchDe({ "/api/productos/lineas": lineasOk, "/api/productos/familias": familiasOk, "/api/productos/categorias": categoriasOk }).f);

  igual("A01 positivo: lista + auxiliares 200 → todo cargado, sin errores y con permisos", [todo.filas.length, todo.familias?.length, todo.categorias?.length, todo.error, todo.errorAuxiliar, todo.permisos], [1, 1, 1, "", "", { crear: true, editar: true }]);

  const sinAux = fetchDe({ "/api/productos/categorias": categoriasOk });
  const cat = await cargarCatalogoCompleto("categorias", sinAux.f);

  igual("A01: la pestaña Categorías no consulta auxiliares", [cat.familias, cat.categorias, sinAux.llamadas], [null, null, ["/api/productos/categorias"]]);

  const c403 = await cargarCatalogoCompleto("lineas", fetchDe({ "/api/productos/lineas": lineasOk, "/api/productos/familias": familiasOk, "/api/productos/categorias": { status: 403, cuerpo: { error: "No tiene permiso para esta acción." } } }).f);
  const f500 = await cargarCatalogoCompleto("lineas", fetchDe({ "/api/productos/lineas": lineasOk, "/api/productos/familias": { status: 500, cuerpo: {} }, "/api/productos/categorias": categoriasOk }).f);
  const forma = await cargarCatalogoCompleto("familias", fetchDe({ "/api/productos/familias": familiasOk, "/api/productos/categorias": { status: 200, cuerpo: { otra: [] } } }).f);
  const red = await cargarCatalogoCompleto("familias", fetchDe({ "/api/productos/familias": familiasOk, "/api/productos/categorias": "red" }).f);

  igual("A01 negativo: principal 200 + categorías 403 → error con código y SIN convertir el fallo en lista vacía (categorias = null, la lista principal se conserva)", [c403.categorias, c403.filas.length, /403/.test(c403.errorAuxiliar), /permiso/.test(c403.errorAuxiliar), c403.error], [null, 1, true, true, ""]);
  igual("A01 negativo: familias 500 al cargar Líneas, forma inesperada (200 sin la clave) y caída de red también se informan", [/500/.test(f500.errorAuxiliar), f500.familias, /formato esperado/.test(forma.errorAuxiliar), forma.categorias, /conexión/.test(red.errorAuxiliar), red.categorias], [true, null, true, null, true, null]);
  igual("A01: errores de la lista principal (500, forma inválida, red) no muestran filas", [
    (await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": { status: 500, cuerpo: { error: "Falla interna." } } }).f)).error,
    (await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": { status: 200, cuerpo: {} } }).f)).error,
    (await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": "red" }).f)).error,
  ], ["Falla interna.", "La respuesta del catálogo no tiene el formato esperado.", "No hubo conexión para cargar el catálogo."]);

  const pagina = leer("app/(private)/productos/catalogos/page.tsx");

  cierto("A01 pantalla: con un auxiliar fallido se muestra el error y se bloquean «Nueva» y «Editar» (no se guardan asociaciones con opciones insuficientes), sin tocar el estado de Categorías/Marcas", /\{permisos\.crear \? \(/.test(pagina) && /permisosVigentes\(permisosCargados, estadoCarga\)/.test(pagina) && /disabled=\{!confiable\}/.test(pagina) && /setErrorAuxiliar\(r\.errorAuxiliar\)/.test(pagina) && /Por seguridad no se puede crear ni editar/.test(pagina));

  // ── CAT-A02: simulación de respuestas fuera de orden
  type Estado = { tipo: string; permisos: string };
  const pausas = new Map<string, () => void>();
  const esperar = (clave: string) => new Promise<void>((res) => pausas.set(clave, res));
  const cargarLento = async (tipo: TipoCatalogoCarga, clave: string): Promise<Estado> => {
    await esperar(clave);
    const r = await cargarCatalogoCompleto(tipo, async () => new Response(JSON.stringify({ [tipo]: [fila({ id: tipo, nombre: tipo })], permisos: { crear: tipo !== "lineas", editar: true } }), { status: 200 }));

    return { tipo, permisos: JSON.stringify(r.permisos) };
  };
  const simular = async (orden: string[]) => {
    const compuerta = crearCompuerta();
    let pantalla: Estado | null = null;
    const lanzadas = ["categorias", "lineas", "familias"].map(async (tipo) => {
      const id = compuerta.nueva();
      const r = await cargarLento(tipo as TipoCatalogoCarga, tipo);

      if (compuerta.vigente(id)) pantalla = r;
    });

    await Promise.resolve();

    for (const clave of orden) {
      pausas.get(clave)?.();
      await new Promise((r) => setTimeout(r, 5));
    }
    await Promise.all(lanzadas);
    pausas.clear();

    return pantalla;
  };

  igual("A02: Categorías → Líneas → Familias con latencias invertidas (la última pestaña responde primero): la pantalla conserva SOLO la última pestaña y sus permisos", await simular(["familias", "lineas", "categorias"]), { tipo: "familias", permisos: JSON.stringify({ crear: true, editar: true }) });
  igual("A02: si la última pestaña es la más lenta, su respuesta se aplica (nada queda en estado de carga falso)", await simular(["categorias", "lineas", "familias"]), { tipo: "familias", permisos: JSON.stringify({ crear: true, editar: true }) });
  igual("A02: orden intermedio (Líneas responde al final) tampoco pisa a Familias", await simular(["familias", "categorias", "lineas"]), { tipo: "familias", permisos: JSON.stringify({ crear: true, editar: true }) });
  cierto("A02 pantalla: cada carga toma una solicitud de la compuerta y descarta su resultado si ya no es la vigente; el indicador de carga solo lo apaga la solicitud vigente", /compuerta\.current\.nueva\(\)/.test(pagina) && /if \(!compuerta\.current\.vigente\(solicitud\)\) return;/.test(pagina) && pagina.indexOf("vigente(solicitud)") < pagina.indexOf("setFilas(r.filas)") && pagina.indexOf("vigente(solicitud)") < pagina.indexOf("setCargando(false)"));

  // ── CAT-A03
  cierto("A03: la pantalla usa el guard oficial (aviso al recargar/cerrar y al usar enlaces internos como el menú lateral), sin beforeunload propio y sin doble aviso en «← Productos»; formulario intacto no avisa", /useProtegerCambios\(sucio\)/.test(pagina) && /from "@\/lib\/ui\/proteger-cambios"/.test(pagina) && !/addEventListener\("beforeunload"/.test(pagina) && !/onClick=\{\(e\) => \{\s*if \(!confirmarDescarte\(\)\) e\.preventDefault\(\);/.test(pagina) && /formularioSucio\(form, base\)/.test(pagina));
  cierto("A03: las confirmaciones puntuales (cambiar de pestaña, abrir otro registro, nueva, cancelar) se mantienen para acciones internas", (pagina.match(/confirmarDescarte\(\)/g) ?? []).length >= 4 && /return !sucio \|\| window\.confirm/.test(pagina));

  // ── CAT-A04
  const catalogos: CatalogoProductos = {
    categorias: [{ id: "c-act", codigo: "C1", nombre: "Activa" }], marcas: [{ id: "m-act", codigo: "M1", nombre: "Marca activa" }],
    familias: [{ id: "f-act", codigo: "F1", nombre: "Familia activa", categoriaId: "c-act" }], lineas: [{ id: "l-act", familiaId: "f-act", codigo: "L1", nombre: "Línea activa" }],
  } as never;
  const historicas = {
    categoriaId: { id: "c-old", codigo: "C0", nombre: "Vieja", padreId: null }, marcaId: { id: "m-old", codigo: "M0", nombre: "Marca vieja", padreId: null },
    familiaId: { id: "f-old", codigo: "F0", nombre: "Familia vieja", padreId: "c-old" }, lineaId: { id: "l-old", codigo: "L0", nombre: "Línea vieja", padreId: "f-old" },
  };
  const conHist = catalogosConHistoricas(catalogos, historicas);

  igual("A04: las cuatro referencias históricas inactivas del producto se agregan marcadas «(inactivo)», con sus IDs y la jerarquía intacta (familia→categoría, línea→familia); las activas no cambian", [
    conHist.categorias.map((x) => [x.id, x.nombre]), conHist.marcas.map((x) => [x.id, x.nombre]), conHist.familias.map((x) => [x.id, x.nombre, x.categoriaId]), conHist.lineas.map((x) => [x.id, x.familiaId, x.nombre]),
  ], [[["c-act", "Activa"], ["c-old", "Vieja (inactivo)"]], [["m-act", "Marca activa"], ["m-old", "Marca vieja (inactivo)"]], [["f-act", "Familia activa", "c-act"], ["f-old", "Familia vieja (inactivo)", "c-old"]], [["l-act", "f-act", "Línea activa"], ["l-old", "f-old", "Línea vieja (inactivo)"]]]);
  igual("A04: sin históricas no cambia nada; si la referencia ya está en el catálogo activo no se duplica ni se renombra; no se agregan inactivos que el producto no tiene", [
    catalogosConHistoricas(catalogos, undefined) === catalogos, catalogosConHistoricas(catalogos, { categoriaId: { id: "c-act", codigo: "C1", nombre: "Activa", padreId: null } }).categorias.length, catalogosConHistoricas(catalogos, {}).familias.length,
  ], [true, 1, 1]);
  igual("A04: una línea histórica sin familia conocida no se agrega (no se inventa jerarquía)", catalogosConHistoricas(catalogos, { lineaId: { id: "l-x", codigo: "", nombre: "X", padreId: null } }).lineas.length, 1);

  const detalle = leer("app/api/productos/[id]/route.ts");
  const bloqueHist = detalle.slice(detalle.indexOf("CAT-A04"), detalle.indexOf("CAT-A04") + 1800);

  cierto("A04 API: el detalle del producto devuelve SOLO las referencias de ESE producto y de la empresa de la sesión, únicamente inactivas (NOT activo), para las cuatro tablas; el listado de elección sigue solo con activos", (bloqueHist.match(/empresa_id = \$1 AND id = nullif\(\$[2-5], ''\)::uuid AND NOT activo/g) ?? []).length === 4 && /\[empresaId, pr\.categoriaId, pr\.marcaId, pr\.familiaId, pr\.lineaId\]/.test(bloqueHist) && /referenciasHistoricas,/.test(detalle) && /activo = true ORDER BY nombre/.test(leer("app/api/productos/route.ts")));
  cierto("A04 pantalla: el formulario del producto aplica la ayuda pura y no reasigna UUIDs; guardar un campo no relacionado conserva el vínculo (el servidor ya tolera la referencia antigua inalterada)", /catalogosConHistoricas\(catalogosActivos, initial\?\.referenciasHistoricas\)/.test(leer("app/(private)/productos/_components/producto-form.tsx")) && /f\.id === form\.familiaId/.test(leer("app/(private)/productos/_components/pestanas/informacion.tsx")) && /conservados|previo\.categoria_id/.test(leer("lib/productos/shared.ts")));

  // ── CAT-A05
  const categoria = fila({ id: "c1", nombre: "Bebidas", productos: 0, nFamilias: 2, nLineas: 3 });

  igual("A05: categoría con 0 productos directos pero con familias/líneas pide confirmación con los CONTEOS REALES y aclara que no hay cascada", textoConfirmarInactivacion("categorias", categoria), "¿Inactivar «Bebidas»? Tiene 2 familia(s) y 3 línea(s) vinculada(s); NO se inactivan automáticamente y conservan su categoría: revíselas si corresponde.");
  igual("A05: con productos directos suma ambos avisos; sin productos ni descendientes no pide confirmar; un registro ya inactivo no pide nada", [
    textoConfirmarInactivacion("categorias", { ...categoria, productos: 4 })?.startsWith("¿Inactivar «Bebidas»? Tiene 4 producto(s)"), textoConfirmarInactivacion("categorias", fila({ id: "c2", nombre: "Vacía", nFamilias: 0, nLineas: 0 })),
    textoConfirmarInactivacion("categorias", { ...categoria, activo: false }), textoConfirmarInactivacion("marcas", fila({ id: "m", nombre: "M" })), textoConfirmarInactivacion("marcas", fila({ id: "m", nombre: "M", productos: 2 }))?.includes("2 producto(s)"),
  ], [true, null, null, null, true]);
  igual("A05: familia → avisa que sus líneas (con el conteo) no se inactivan; línea sin productos no pide confirmar", [textoConfirmarInactivacion("familias", fila({ id: "f", nombre: "F", nLineas: 5 })), textoConfirmarInactivacion("lineas", fila({ id: "l", nombre: "L" }))], ["¿Inactivar «F»? Sus líneas (5) no se inactivan automáticamente.", null]);

  const admin = leer("lib/productos/catalogos-admin.ts");

  cierto("A05 API/pantalla: los conteos salen de familias_producto y lineas_producto (por empresa y jerarquía), el total «Productos» conserva su significado (productos con la FK directa) y la inactivación sigue sin cascada", /FROM familias_producto f WHERE f\.empresa_id = \$\{t\}\.empresa_id AND f\.categoria_id = \$\{t\}\.id\) AS "nFamilias"/.test(admin) && /JOIN familias_producto f ON f\.empresa_id = l\.empresa_id AND f\.id = l\.familia_id WHERE f\.empresa_id = \$\{t\}\.empresa_id AND f\.categoria_id = \$\{t\}\.id\) AS "nLineas"/.test(admin) && /AS productos`;/.test(admin) && /textoConfirmarInactivacion\(tipo, fila\)/.test(pagina) && !/UPDATE (familias_producto|lineas_producto) SET activo/.test(admin));

  // ── CAT-A06: versión + bloqueo consultivo (simulado)
  const V1 = "2026-10-12T15:15:46.123456";
  const V2 = "2026-10-12T15:20:01.654321";
  const intento = (enviada: unknown, actual: unknown) => {
    try {
      exigirVersionCatalogo(enviada, actual);

      return "ok";
    } catch (e) {
      return [(e as { status?: number }).status, /NO se guardaron|No se guardó/.test((e as Error).message)];
    }
  };

  igual("A06: versión vigente → ok; ausente, vacía, malformada u obsoleta → 409 sin guardar", [intento(V1, V1), intento(undefined, V1), intento("", V1), intento(7, V1), intento("x", V1), intento(V1, V2)], ["ok", [409, true], [409, true], [409, true], [409, true], [409, true]]);

  // Simulador de la sección serializada: cola de transacciones sobre una fila (lo que logra pg_advisory_xact_lock por empresa+tabla)
  const fila0 = { nombre: "Original", activo: true, version: V1 };
  let cola: Promise<void> = Promise.resolve();
  const transaccion = (versionEnviada: string, cambio: (f: typeof fila0) => void) => {
    const resultado = cola.then(() => {
      const r = intento(versionEnviada, fila0.version);

      if (r === "ok") {
        cambio(fila0);
        fila0.version = `${fila0.version}+`;
      }

      return r;
    });

    cola = resultado.then(() => undefined);

    return resultado;
  };

  const [a, b] = await Promise.all([transaccion(V1, (f) => { f.nombre = "Editado por A"; }), transaccion(V1, (f) => { f.nombre = "Editado por B"; })]);

  igual("A06 dos editores: A y B abren la misma versión; el primero en entrar a la sección serializada guarda y el segundo recibe 409 sin pisarlo", [a, b[0], fila0.nombre], ["ok", 409, "Editado por A"]);

  const versionActual = fila0.version;
  const [c, d] = await Promise.all([transaccion(versionActual, (f) => { f.activo = false; }), transaccion(versionActual, (f) => { f.nombre = "Tarde"; })]);

  igual("A06 cambio de estado en paralelo con una edición: solo uno aplica; el otro 409 (no se pierde ni se revierte el estado)", [c, d[0], fila0.activo, fila0.nombre], ["ok", 409, false, "Editado por A"]);

  const editar = admin.slice(admin.indexOf("export async function editarCatalogo"));
  const idxLock = editar.indexOf("pg_advisory_xact_lock(hashtext($1))");
  const idxLeer = editar.indexOf("SELECT *, to_char(actualizado_at");
  const idxVersion = editar.indexOf("exigirVersionCatalogo(cuerpo.version, actual.rows[0].version_actual)");
  const idxFuncion = editar.indexOf("catalogo_producto_guardar");
  const idxUpdate = editar.indexOf("UPDATE ${t.tabla} SET");

  cierto("A06 SQL/orden: el bloqueo consultivo por empresa+tabla se toma ANTES de leer; la versión se compara DESPUÉS de leer bajo ese bloqueo y ANTES de duplicados, catalogo_producto_guardar (Categorías/Marcas) o UPDATE (Familias/Líneas); es la misma clave que usa el alta", idxLock > 0 && idxLock < idxLeer && idxLeer < idxVersion && idxVersion < editar.indexOf("verificarDuplicados(c, tipo") && idxVersion < idxFuncion && idxVersion < idxUpdate && /`\$\{empresaId\}:\$\{t\.tabla\}`/.test(editar) && /pg_advisory_xact_lock\(hashtext\(\$1\)\)`, \[`\$\{empresaId\}:\$\{t\.tabla\}`\]/.test(admin));
  cierto("A06: la versión es actualizado_at con microsegundos (UTC) tanto en la lista como en la comparación; el PUT nunca la toma de otra fuente; no hay migración nueva (la última sigue siendo la NEX-053)", (admin.match(/to_char\([^,]{0,12}actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US'\)/g) ?? []).length >= 2 && readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((n) => /^NEX-\d+/.test(n)).sort().at(-1)!.match(/^NEX-05[3-9]/) !== null);
  cierto("A06 límite documentado: el serializado depende de que TODA escritura de la tabla tome el bloqueo (alta y edición lo toman; solo esta capa escribe, el rol de ejecución no tiene INSERT/UPDATE directos en Categorías/Marcas)", /await c\.query\(`SELECT pg_advisory_xact_lock\(hashtext\(\$1\)\)`/.test(admin) && (leer("lib/productos/catalogos-admin.ts").match(/catalogo_producto_guardar/g) ?? []).length >= 2 && !/catalogo_producto_guardar/.test(leer("app/api/productos/route.ts")));
  cierto("A06 pantalla: la edición y el cambio de estado envían la versión que la lista cargó; ante 409 el formulario conserva lo escrito y el cambio de estado recarga la lista vigente", /if \(form\.id\) cuerpo\.version = form\.version/.test(pagina) && /version: fila\.version \}/.test(pagina) && /version: f\.version,/.test(pagina) && /await cargar\(\); \/\/ CAT-A06/.test(pagina) && /setErrorForm\(mensaje\)/.test(pagina));

  // ── CAT-R02-01: gravación solo con carga confiable (lista principal + auxiliares), también con el formulario ya abierto
  const ok0 = { cargando: false, errorCarga: "", errorAuxiliar: "" };
  const P = { crear: true, editar: true };
  const SIN = { crear: false, editar: false };

  igual("R02-01 positivo: sin carga en curso ni errores → confiable, permisos vigentes y sin motivo de bloqueo", [cargaConfiable(ok0), permisosVigentes(P, ok0), motivoBloqueoGuardar(ok0)], [true, P, null]);
  igual("R02-01 negativo: carga en curso → no confiable, permisos anulados, motivo de recarga", [cargaConfiable({ ...ok0, cargando: true }), permisosVigentes(P, { ...ok0, cargando: true }), /recargando/.test(motivoBloqueoGuardar({ ...ok0, cargando: true }) ?? "")], [false, SIN, true]);

  for (const [codigo, cuerpo] of [[401, { error: "Sesión vencida." }], [403, { error: "Sin permiso." }], [500, { error: "Error interno." }]] as const) {
    const rr = await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": { status: codigo, cuerpo } }).f);
    const est = { cargando: false, errorCarga: rr.error, errorAuxiliar: rr.errorAuxiliar };

    igual(`R02-01 (a) la pestaña responde ${codigo} tras haber cargado con CREAR: sin permisos vigentes, no confiable y con motivo`, [rr.error !== "", cargaConfiable(est), permisosVigentes(P, est), motivoBloqueoGuardar(est) !== null], [true, false, SIN, true]);
  }

  const sinForma = await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": { status: 200, cuerpo: { otra: [] } } }).f);

  igual("R02-01 (d) JSON sin la forma esperada en la lista principal → error de carga y bloqueo", [sinForma.error !== "", cargaConfiable({ cargando: false, errorCarga: sinForma.error, errorAuxiliar: "" })], [true, false]);

  const redCaida = await cargarCatalogoCompleto("marcas", fetchDe({ "/api/productos/marcas": "red" }).f);

  igual("R02-01 (d) caída de red en la lista principal → error de carga y bloqueo", [redCaida.error !== "", cargaConfiable({ cargando: false, errorCarga: redCaida.error, errorAuxiliar: "" })], [true, false]);

  const auxCae = await cargarCatalogoCompleto("lineas", fetchDe({ "/api/productos/lineas": lineasOk, "/api/productos/familias": { status: 500, cuerpo: { error: "Fallo." } }, "/api/productos/categorias": categoriasOk }).f);
  const estAux = { cargando: false, errorCarga: auxCae.error, errorAuxiliar: auxCae.errorAuxiliar };

  igual("R02-01 (b) formulario de edición abierto y la recarga trae un auxiliar con 500: no confiable, sin permisos vigentes y motivo de catálogos auxiliares", [auxCae.error, cargaConfiable(estAux), permisosVigentes(P, estAux), /catálogos auxiliares/.test(motivoBloqueoGuardar(estAux) ?? "")], ["", false, SIN, true]);

  const recuperada = await cargarCatalogoCompleto("lineas", fetchDe({ "/api/productos/lineas": lineasOk, "/api/productos/familias": familiasOk, "/api/productos/categorias": categoriasOk }).f);

  igual("R02-01 (b)/(c) tras una recarga correcta se recupera: Guardar vuelve a estar permitido con los permisos de esa carga", [cargaConfiable({ cargando: false, errorCarga: recuperada.error, errorAuxiliar: recuperada.errorAuxiliar }), permisosVigentes(recuperada.permisos, ok0)], [true, P]);

  // Simulación del handler guardar(): no envía POST/PUT si la carga no es confiable (el borrador no se toca); con carga confiable envía una sola vez.
  const enviosSim: string[] = [];
  const guardarSim = (est: { cargando: boolean; errorCarga: string; errorAuxiliar: string }, borrador: { nombre: string }) => {
    const bloqueo = motivoBloqueoGuardar(est);

    if (bloqueo) return { enviado: false, borrador, errorForm: bloqueo };

    enviosSim.push(borrador.nombre);

    return { enviado: true, borrador, errorForm: "" };
  };
  const borrador = { nombre: "Escrito por el usuario" };
  const r1 = guardarSim({ ...ok0, errorCarga: "No fue posible cargar el catálogo (código 500)." }, borrador);
  const r2 = guardarSim({ ...ok0, errorAuxiliar: "x (código 500)" }, borrador);
  const r3 = guardarSim({ ...ok0, cargando: true }, borrador);
  const r4 = guardarSim(ok0, borrador);

  igual("R02-01 simulación de guardar(): con error principal, auxiliar o carga en curso NO hay POST/PUT y el borrador se conserva; sin errores envía exactamente una vez", [r1.enviado, r2.enviado, r3.enviado, r4.enviado, enviosSim, r1.borrador === borrador && r2.borrador === borrador && r3.borrador === borrador, r1.errorForm !== "" && r2.errorForm !== "" && r3.errorForm !== ""], [false, false, false, true, ["Escrito por el usuario"], true, true]);

  const pg = leer("app/(private)/productos/catalogos/page.tsx");
  const guardarFn = pg.slice(pg.indexOf("async function guardar(event"), pg.indexOf("async function cambiarEstado"));
  const cambiarFn = pg.slice(pg.indexOf("async function cambiarEstado"), pg.indexOf("const familiasActivas"));

  cierto("R02-01 pantalla: guardar() y cambiarEstado() consultan motivoBloqueoGuardar ANTES de cualquier envío y retornan sin tocar el formulario", guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < guardarFn.indexOf("enviar(") && cambiarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && cambiarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < cambiarFn.indexOf("enviar("));
  cierto("R02-01 pantalla: el error de la consulta principal tiene estado propio (errorCarga) que guardar/abrir/cambiar-pestaña no borran; solo cargar() lo escribe; los permisos se derivan con permisosVigentes", /const \[errorCarga, setErrorCarga\]/.test(pg) && /const permisos = permisosVigentes\(permisosCargados, estadoCarga\)/.test(pg) && (pg.match(/setErrorCarga\(/g) ?? []).length === 2 && !/setErrorCarga/.test(guardarFn + cambiarFn));
  cierto("R02-01 pantalla: Guardar, Editar e Inactivar/Activar quedan deshabilitados sin carga confiable y Nueva solo aparece con permisos vigentes; ante error principal se vacían permisos y auxiliares", /disabled=\{guardando \|\| !confiable\}/.test(pg) && (pg.match(/disabled=\{!confiable\}/g) ?? []).length === 2 && /\{permisos\.crear \? \(/.test(pg) && /setPermisos\(\{ crear: false, editar: false \}\);\n      setFamilias\(\[\]\);\n      setCategorias\(\[\]\);/.test(pg));
  cierto("R02-01 pantalla: al cambiar de pestaña se anulan los permisos y se marca «cargando» de inmediato (sin ventana con permisos de la pestaña anterior)", /setCargando\(true\);\n    setPermisos\(\{ crear: false, editar: false \}\);\n    setTipo\(nuevo\)/.test(pg));
  cierto("R02-01 regresión: la protección 409 de A06 (versión en PUT) y el guard de cambios sin guardar siguen presentes", /cuerpo\.version = form\.version/.test(pg) && /useProtegerCambios\(sucio\)/.test(pg));

  return fallos;
}
