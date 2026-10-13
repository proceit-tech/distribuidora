/**
 * Catálogos comerciales — estabilización CC-A01…A07 (AUD-CATALOGOS-COMERCIALES-V1 §II, §V y §VI).
 * Sin PostgreSQL ni navegador: helpers puros, cargas con fetch simulado, orden de operaciones de la ruta y análisis del código y del script de reversión.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cargarCatalogoComercial } from "@/lib/comercial/carga";
import { MAX_ENTEROS_CAMBIO, canonicoDecimal, cambioEnAlcance, igualDecimal } from "@/lib/comercial/cambio-decimal";
import { validarFormularioComercial, type FormularioComercial } from "@/lib/comercial/formulario";
import { ErrorComercial, validarTipoCambio } from "@/lib/comercial/validacion";
import { textoConfirmarInactivacionComercial } from "@/lib/comercial/vinculos";
import { exigirVersionComercial } from "@/lib/comercial/version";
import { contador } from "@/lib/clientes/contador-casos";
import { cargaConfiable, crearCompuerta, motivoBloqueoGuardar, permisosVigentes } from "@/lib/productos/catalogos-carga";


const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");

type Resp = { status: number; cuerpo?: unknown } | "red";

const codigo = (f: () => unknown) => {
  try {
    f();

    return "ok";
  } catch (e) {
    const x = e as ErrorComercial;

    return x instanceof ErrorComercial ? `${x.estado}:${x.campo ?? ""}` : `otro:${(e as Error).message}`;
  }
};

export async function verificarCasosComercialEstabilizacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const fetchDe = (rutas: Record<string, Resp>, esperaMs: Record<string, number> = {}) => async (url: string) => {
    if (esperaMs[url]) await new Promise((r) => setTimeout(r, esperaMs[url]));

    const r = rutas[url];

    if (!r || r === "red") throw new TypeError("fetch failed");

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };
  const P = { crear: true, editar: true };
  const U = (ruta: string, historial = false) => `/api/catalogos-comerciales/${ruta}${historial ? "?historial=1" : ""}`;

  // ── CC-A01: versión obligatoria de edición (Canales/Zonas)
  igual("A01 versión: ausente → 409; obsoleta → 409; vigente → pasa", [
    codigo(() => exigirVersionComercial(undefined, "2026-10-12T10:00:00.000002")),
    codigo(() => exigirVersionComercial("2026-10-12T10:00:00.000001", "2026-10-12T10:00:00.000002")),
    codigo(() => exigirVersionComercial("2026-10-12T10:00:00.000002", "2026-10-12T10:00:00.000002")),
  ], ["409:", "409:", "ok"]);
  igual("A01 microsegundos: dos versiones que difieren solo en el último dígito son distintas; versión vacía o no texto → 409", [codigo(() => exigirVersionComercial("2026-10-12T10:00:00.123456", "2026-10-12T10:00:00.123457")), codigo(() => exigirVersionComercial("", "x")), codigo(() => exigirVersionComercial(123, "x"))], ["409:", "409:", "409:"]);

  // Dos editores sobre la misma fila (la ruta serializa con FOR UPDATE: se simula la cola) — el segundo con la versión vieja recibe 409 y no pisa al primero.
  {
    const fila = { nombre: "Mayorista", activo: true, version: "2026-10-12T10:00:00.000001" };
    let cola: Promise<unknown> = Promise.resolve();
    let reloj = 2;
    const editar = (versionEnviada: string, cambio: (f: typeof fila) => void) => {
      const r = cola.then(() => {
        try {
          exigirVersionComercial(versionEnviada, fila.version);
        } catch (e) {
          return (e as ErrorComercial).estado;
        }
        cambio(fila);
        fila.version = `2026-10-12T10:00:00.00000${reloj++}`;

        return 200;
      });

      cola = r;

      return r;
    };
    const v0 = fila.version;
    const [a, b] = await Promise.all([editar(v0, (f) => { f.nombre = "Editado por A"; }), editar(v0, (f) => { f.nombre = "Editado por B"; })]);

    igual("A01 dos editores con la misma versión: el primero guarda, el segundo 409 y no pisa", [a, b, fila.nombre], [200, 409, "Editado por A"]);

    const vigente = fila.version;
    const [c, d] = await Promise.all([editar(vigente, (f) => { f.activo = false; }), editar(vigente, (f) => { f.nombre = "Tarde"; })]);

    igual("A01 inactivar en paralelo con una edición: solo uno aplica; el otro 409 (no revierte el estado)", [c, d, fila.activo, fila.nombre], [200, 409, false, "Editado por A"]);
  }

  const srv = leer("lib/comercial/servidor.ts");
  const editarSrv = srv.slice(srv.indexOf("export async function editarSimple"), srv.indexOf("// ── Tipos de cambio"));
  const iBloqueo = editarSrv.indexOf("FOR UPDATE");
  const iVersion = editarSrv.indexOf("exigirVersionComercial(cuerpo.version");
  const iDup = editarSrv.indexOf("await duplicados(");
  const iUpdate = editarSrv.indexOf("UPDATE ${CFG[tipo].tabla} SET");

  cierto("A01 ruta PUT: tras el FOR UPDATE (empresa de la sesión) se exige la versión y SOLO después van duplicados y el UPDATE; el UPDATE no cambia por la ausencia de versión en otro orden", iBloqueo > 0 && iBloqueo < iVersion && iVersion < iDup && iDup < iUpdate && /WHERE id = \$1 AND empresa_id = \$2 FOR UPDATE/.test(editarSrv));
  cierto("A01 aislamiento: la ruta toma la empresa de la sesión (nunca del cuerpo) y la versión viaja en el listado (SQL_VERSION con microsegundos)", /const empresaId = b\.session\.user\.empresaId/.test(editarSrv) && !/cuerpo\.empresa/.test(srv) && /to_char\(\$\{columna\} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US'\)/.test(leer("lib/comercial/version.ts")) && /SQL_VERSION_COMERCIAL\("t\.actualizado_at"\)\} AS version/.test(srv));

  // ── CC-A02: guard oficial
  const pg = leer("app/(private)/catalogos-comerciales/page.tsx");

  cierto("A02 pantalla: useProtegerCambios(sucio) (menú lateral y enlaces internos), sin beforeunload propio y sin confirmación manual en el enlace a Listas (sin doble aviso)", /useProtegerCambios\(sucio\)/.test(pg) && !/beforeunload/.test(pg) && !/<Link[^>]*onClick/.test(pg.replace(/\n/g, " ")));
  cierto("A02: se conservan las confirmaciones internas por cambio de pestaña, Nuevo/Editar y Cancelar con cambios efectivos", (pg.match(/confirmarDescarte\(\)/g) ?? []).length >= 5);

  // ── CC-A03: respuestas fuera de orden entre pestañas (compuerta + carga real)
  {
    const rutas: Record<string, Resp> = {
      [U("tipos-cambio")]: { status: 200, cuerpo: { tiposCambio: [{ id: "c1" }], monedas: [], permisos: P } },
      [U("canales-venta")]: { status: 200, cuerpo: { canales: [{ id: "k1" }], permisos: { crear: false, editar: false } } },
      [U("zonas")]: { status: 200, cuerpo: { zonas: [{ id: "z1" }], permisos: P } },
    };
    // Pantalla simulada: solo la solicitud vigente escribe el estado.
    const compuerta = crearCompuerta();
    const estado = { filas: [] as unknown[], permisos: { crear: false, editar: false } };
    const cargar = async (ruta: string, clave: string, f: ReturnType<typeof fetchDe>) => {
      const sol = compuerta.nueva();
      const r = await cargarCatalogoComercial(ruta, clave, false, f);

      if (!compuerta.vigente(sol)) return;
      estado.filas = r.filas;
      estado.permisos = r.permisos;
    };
    const f = fetchDe(rutas, { [U("tipos-cambio")]: 60, [U("canales-venta")]: 30 });

    // Cambio rápido: Tipos de cambio (lento) → Canales (medio) → Zonas (rápido, la última).
    await Promise.all([cargar("tipos-cambio", "tiposCambio", f), cargar("canales-venta", "canales", f), cargar("zonas", "zonas", f)]);
    igual("A03 respuestas en orden invertido: la pestaña vigente (Zonas) conserva SUS filas y permisos; las lentas de otras pestañas se descartan", [estado.filas, estado.permisos], [[{ id: "z1" }], P]);

    const compuerta2 = crearCompuerta();
    const e2 = { filas: [] as unknown[] };
    const cargar2 = async (historial: boolean) => {
      const sol = compuerta2.nueva();
      const r = await cargarCatalogoComercial("tipos-cambio", "tiposCambio", historial, fetchDe({ [U("tipos-cambio")]: { status: 200, cuerpo: { tiposCambio: [{ id: "vigentes" }], permisos: P } }, [U("tipos-cambio", true)]: { status: 200, cuerpo: { tiposCambio: [{ id: "historial" }], permisos: P } } }, { [U("tipos-cambio", true)]: 40 }));

      if (compuerta2.vigente(sol)) e2.filas = r.filas;
    };

    await Promise.all([cargar2(true), cargar2(false)]);
    igual("A03 filtro «historial» alternado rápido: gana la última solicitud (la respuesta lenta del historial no pisa la vista vigente)", e2.filas, [{ id: "vigentes" }]);
  }
  cierto("A03 pantalla: usa crearCompuerta y descarta respuestas no vigentes antes de escribir filas/permisos/monedas", /const compuerta = useRef\(crearCompuerta\(\)\)/.test(pg) && /if \(!compuerta\.current\.vigente\(solicitud\)\) return;/.test(pg) && pg.indexOf("compuerta.current.vigente(solicitud)") < pg.indexOf("setFilas(r.filas as Fila[])"));

  // ── CC-A04: errores HTTP/forma y bloqueo de acciones con rascunho preservado
  for (const [status, nombre] of [[401, "401"], [403, "403"], [500, "500"]] as const) {
    const r = await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status, cuerpo: { error: "Fallo." } } }));
    const est = { cargando: false, errorCarga: r.error, errorAuxiliar: "" };

    igual(`A04 ${nombre}: error visible con código, filas vacías, sin permisos vigentes y acciones/guardado bloqueados`, [r.error.includes(`código ${status}`), r.filas, permisosVigentes(P, est), cargaConfiable(est), motivoBloqueoGuardar(est) !== null], [true, [], { crear: false, editar: false }, false, true]);
  }
  igual("A04: 200 sin la clave del catálogo (antes «catálogo vacío») → error de formato; permisos ausentes o mal formados → error", [
    (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { otra: [], permisos: P } } }))).error !== "",
    (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: [] } } }))).error !== "",
    (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: [], permisos: { crear: "si", editar: true } } } }))).error !== "",
    (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: {}, permisos: P } } }))).error !== "",
  ], [true, true, true, true]);
  igual("A04: caída de red y JSON inválido → error de carga; carga correcta → sin error, con filas y permisos", [
    (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: "red" }))).error !== "",
    (await cargarCatalogoComercial("zonas", "zonas", false, async () => new Response("no es json", { status: 200 }))).error !== "",
    await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: [{ id: "z" }], permisos: P } } })),
  ], [true, true, { filas: [{ id: "z" }], permisos: P, monedas: null, error: "" }]);
  igual("A04 tipos de cambio: las monedas deben ser un arreglo si vienen", (await cargarCatalogoComercial("tipos-cambio", "tiposCambio", false, fetchDe({ [U("tipos-cambio")]: { status: 200, cuerpo: { tiposCambio: [], monedas: "USD", permisos: P } } }))).error !== "", true);

  // Simulación de guardar() con formulario ya abierto: no hay POST/PUT sin carga confiable y el borrador se conserva; tras recuperarse, guarda.
  {
    const envios: string[] = [];
    const guardar = (est: { cargando: boolean; errorCarga: string; errorAuxiliar: string }, borrador: { nombre: string }) => {
      const b = motivoBloqueoGuardar(est);

      if (b) return { enviado: false, borrador, error: b };
      envios.push(borrador.nombre);

      return { enviado: true, borrador, error: "" };
    };
    const borrador = { nombre: "Escrito" };
    const a = guardar({ cargando: false, errorCarga: "No fue posible cargar (código 500).", errorAuxiliar: "" }, borrador);
    const b = guardar({ cargando: true, errorCarga: "", errorAuxiliar: "" }, borrador);
    const c = guardar({ cargando: false, errorCarga: "", errorAuxiliar: "" }, borrador);

    igual("A04 simulación de guardar(): con error o carga en curso no se envía y el borrador sigue; recuperada la carga, se envía una vez", [a.enviado, b.enviado, c.enviado, envios, a.borrador === borrador && a.error !== ""], [false, false, true, ["Escrito"], true]);
  }
  const guardarFn = pg.slice(pg.indexOf("async function guardar(event"), pg.indexOf("async function cambiarEstado"));
  const anularFn = pg.slice(pg.indexOf("async function anular"), pg.indexOf("const claseCampo"));

  cierto("A04 pantalla: guardar, cambiarEstado y anular consultan motivoBloqueoGuardar antes de cualquier envío; Guardar/Editar/Corregir/Anular/Inactivar deshabilitados sin carga confiable; permisos vigentes derivados; errorCarga con estado propio", guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < guardarFn.indexOf("enviar(") && pg.slice(pg.indexOf("async function cambiarEstado")).indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && anularFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && anularFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < anularFn.indexOf("fetch(") && (pg.match(/disabled=\{!confiable\}/g) ?? []).length === 4 && /disabled=\{guardando \|\| !confiable\}/.test(pg) && /const permisos = permisosVigentes\(permisosCargados, estadoCarga\)/.test(pg) && /const \[errorCarga, setErrorCarga\]/.test(pg));
  cierto("A04: al cambiar de pestaña los permisos se anulan y se marca «cargando» de inmediato; ante error principal se vacían filas y permisos", /setCargando\(true\);\n    setPermisos\(\{ crear: false, editar: false \}\);\n    setTab\(nuevo\)/.test(pg) && /setFilas\(\[\]\);\n      setPermisos\(\{ crear: false, editar: false \}\);\n      setErrorCarga\(r\.error\)/.test(pg));

  // ── CC-A05: cotización como decimal exacto y alcance numeric(18,6)
  igual("A05 canónico: ceros finales/iniciales no cambian el valor", [canonicoDecimal("7350.500000"), canonicoDecimal("007"), canonicoDecimal("0.100"), canonicoDecimal("12."), canonicoDecimal("abc")], ["7350.5", "7", "0.1", "12", null]);
  igual("A05 una diferencia de 0,000001 en un valor grande se detecta como cambio (Number no la distinguiría)", [Number("123456789012.000001") === Number("123456789012.000002"), igualDecimal("123456789012.000001", "123456789012.000002"), igualDecimal("123456789012.000002", "123456789012.000002000")], [true, false, true]);
  igual("A05 igualdad exacta con el formato de la base («7350.000000») frente al normalizado («7350»)", [igualDecimal("7350.000000", "7350"), igualDecimal("7350.000001", "7350")], [true, false]);
  igual("A05 alcance numeric(18,6): 12 enteros + 6 decimales caben; 13 enteros o 7 decimales no", [cambioEnAlcance("999999999999.999999"), cambioEnAlcance("1000000000000"), cambioEnAlcance("1.1234567"), MAX_ENTEROS_CAMBIO], [true, false, false, 12]);
  igual("A05 servidor (alta): valor fuera de alcance → 400 en «cambio» (no llega a la base como 500); límite aceptado → ok", [
    codigo(() => validarTipoCambio({ fecha: "2026-10-12", monedaCodigo: "USD", cambio: "1000000000000" })),
    codigo(() => validarTipoCambio({ fecha: "2026-10-12", monedaCodigo: "USD", cambio: "999999999999.999999" })),
    codigo(() => validarTipoCambio({ fecha: "2026-10-12", monedaCodigo: "USD", cambio: "7350,5" })),
  ], ["400:cambio", "ok", "ok"]);
  const f0: FormularioComercial = { id: null, codigo: "", nombre: "", fecha: "2026-10-12", monedaCodigo: "USD", cambio: "1000000000000", motivo: "" };

  igual("A05 formulario: el mismo límite se informa en el campo antes de enviar", Object.keys(validarFormularioComercial("cambios", f0)), ["cambio"]);
  cierto("A05 ruta de corrección: compara con igualDecimal (no Number), valida el alcance y mapea el 22003 de PostgreSQL a 400 en «cambio»", /igualDecimal\(a\.cambio, nuevo\)/.test(srv) && !/Number\(a\.cambio\)/.test(srv) && /cambioEnAlcance\(nuevo\)/.test(srv) && /pg\.code === "22003"/.test(srv));

  // ── CC-A06: guarda de la reversión SQL (sin ejecutar nada)
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-045.sql");
  const iGuarda = rev.indexOf("reversión NEX-045 insegura");
  const iCambios = rev.search(/CREATE OR REPLACE FUNCTION public\.nex_aplicar_grants_runtime/);
  const iDrop = rev.indexOf("DROP TABLE IF EXISTS public.tipos_cambio");

  cierto("A06 reversión: la guarda aborta ANTES de reinstalar el envoltorio fijo y de borrar nada, por ledger (versiones posteriores a NEX-045) y por objetos (ayudantes de NEX-052/053)", iGuarda > 0 && iGuarda < iCambios && iCambios < iDrop && /FROM public\.schema_migrations WHERE version > 'NEX-045'/.test(rev) && /nex_aplicar_grants_productos_stock\(\)/.test(rev) && /nex_aplicar_grants_clientes\(\)/.test(rev));
  cierto("A06: se conserva la comprobación original (aborta si hay cotizaciones) y no se tocó ninguna migración (la última sigue siendo NEX-053 y NEX-045 no cambió)", /tipos_cambio tiene filas/.test(rev) && !/CC-A06/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-045-catalogos-comerciales-tipos-cambio.sql")));

  // ── CC-A07: vínculos con Clientes
  const fila = (extra: Record<string, unknown>) => ({ nombre: "Norte", activo: true, usos: 0, clientes: 0, ...extra });

  igual("A07 (a) solo clientes → confirma y nombra los clientes; (b) solo listas/reglas → confirma; (c) ambos → nombra ambos; (d) cero vínculos → sin confirmación", [
    /3 cliente\(s\)/.test(textoConfirmarInactivacionComercial(fila({ clientes: 3 })) ?? "") && !/lista/.test(textoConfirmarInactivacionComercial(fila({ clientes: 3 })) ?? ""),
    /2 lista\(s\) o regla\(s\) de precios/.test(textoConfirmarInactivacionComercial(fila({ usos: 2 })) ?? "") && !/cliente\(s\)/.test(textoConfirmarInactivacionComercial(fila({ usos: 2 })) ?? ""),
    /2 lista\(s\) o regla\(s\) de precios y 3 cliente\(s\)/.test(textoConfirmarInactivacionComercial(fila({ usos: 2, clientes: 3 })) ?? ""),
    textoConfirmarInactivacionComercial(fila({})),
  ], [true, true, true, null]);
  igual("A07: activar un registro inactivo no pide confirmación; ausencia de conteos = 0", [textoConfirmarInactivacionComercial(fila({ activo: false, clientes: 5 })), textoConfirmarInactivacionComercial({ nombre: "X", activo: true })], [null, null]);
  cierto("A07 servidor: cuenta clientes por la columna que corresponde (canal_venta_id / zona_comercial_id) y SIEMPRE con la empresa del catálogo (empresa_id), junto con listas y reglas, sin tocar los conteos anteriores", /FROM clientes cl WHERE cl\.empresa_id = t\.empresa_id AND cl\.\$\{CFG\[tipo\]\.columnaCliente\} = t\.id\) AS clientes/.test(srv) && /canales: \{[^}]*columnaCliente: "canal_venta_id"/.test(srv) && /zonas: \{[^}]*columnaCliente: "zona_comercial_id"/.test(srv) && /FROM listas_precio l WHERE l\.empresa_id = t\.empresa_id/.test(srv) && /FROM lista_precio_reglas r WHERE r\.empresa_id = t\.empresa_id/.test(srv));
  cierto("A07 pantalla: la inactivación usa el texto con vínculos de listas/reglas Y clientes, muestra la columna «Clientes» y la FK/referencia histórica de Clientes no se toca (solo lectura de conteo)", /textoConfirmarInactivacionComercial\(f\)/.test(pg) && /titulo="Clientes"/.test(pg) && !/UPDATE clientes|DELETE FROM clientes/.test(srv));

  // ── Preservado: cambio 100 % manual, historial, aislamiento
  cierto("preservado: la cotización sigue 100 % manual (sin fetch/URL externas), sin DELETE (el historial se conserva: corregir retira + inserta, anular retira) y toda consulta lleva empresa_id", !/fetch\(|https?:\/\//.test(srv) && !/DELETE FROM/.test(srv) && /UPDATE tipos_cambio SET vigente = false/.test(srv) && (srv.match(/empresa_id = \$[12]/g) ?? []).length >= 10);

  return fallos;
}
