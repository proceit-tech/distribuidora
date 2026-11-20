/**
 * Catálogos comerciales — estabilización CC-A01…A07 (AUD-CATALOGOS-COMERCIALES-V1 §II, §V y §VI).
 * Sin PostgreSQL ni navegador: helpers puros, cargas con fetch simulado, orden de operaciones de la ruta y análisis del código y del script de reversión.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { decidirGetComercial } from "@/lib/comercial/acceso-get";
import { cargarCatalogoComercial, cargarMonedasAlta } from "@/lib/comercial/carga";
import { resolveNavigation } from "@/lib/navigation/menu";
import { crearExclusion } from "@/lib/productos/catalogos-operacion";
import { MAX_ENTEROS_CAMBIO, cambioEnAlcance, canonicoDecimal, compararDecimales, formatearCambio, igualDecimal } from "@/lib/comercial/cambio-decimal";
import { normalizarCambio } from "@/lib/listas-precio/calculos";
import { aplicarCambioCampo, validarFormularioComercial, type FormularioComercial } from "@/lib/comercial/formulario";
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
  const pg = leer("app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx");

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
      const r = await cargarCatalogoComercial("tipos-cambio", "tiposCambio", historial, fetchDe({ [U("tipos-cambio")]: { status: 200, cuerpo: { tiposCambio: [{ id: "vigentes" }], monedas: [], permisos: P } }, [U("tipos-cambio", true)]: { status: 200, cuerpo: { tiposCambio: [{ id: "historial" }], monedas: [], permisos: P } } }, { [U("tipos-cambio", true)]: 40 }));

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

  cierto("A04 pantalla: guardar, cambiarEstado y anular consultan motivoBloqueoGuardar antes de cualquier envío; Guardar/Editar/Corregir/Anular/Inactivar deshabilitados sin carga confiable; permisos vigentes derivados; errorCarga con estado propio", guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && guardarFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < guardarFn.indexOf("enviar(") && pg.slice(pg.indexOf("async function cambiarEstado")).indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && anularFn.indexOf("motivoBloqueoGuardar(estadoCarga)") > 0 && anularFn.indexOf("motivoBloqueoGuardar(estadoCarga)") < anularFn.indexOf("fetch(") && (pg.match(/disabled=\{!confiable( \|\| ocupado)?\}/g) ?? []).length === 4 && /disabled=\{guardando \|\| !confiable\}/.test(pg) && /const permisos = permisosVigentes\(permisosCargados, estadoCarga\)/.test(pg) && /const \[errorCarga, setErrorCarga\]/.test(pg));
  cierto("A04: al cambiar de pestaña los permisos se anulan y se marca «cargando» de inmediato; ante error principal se vacían filas y permisos", /setCargando\(true\);\n    setPermisos\(\{ crear: false, editar: false \}\);\n    setTab\(nuevo\)/.test(pg) && /setFilas\(\[\]\);\n      setPermisos\(\{ crear: false, editar: false \}\);\n      setMonedas\(\[\]\);[^\n]*\n      setErrorCarga\(r\.error\)/.test(pg));

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

  // ── CC-R03-01: presentación, edición y orden sin pérdida de precisión
  const LIM = ["123456789012.000001", "123456789012.000002", "999999999999.999999"];

  igual("R03 formato es-PY exacto en los límites de numeric(18,6) (el Number+Intl anterior daba «123.456.789.012» y «1.000.000.000.000»)", LIM.map(formatearCambio), ["123.456.789.012,000001", "123.456.789.012,000002", "999.999.999.999,999999"]);
  igual("R03 el formato anterior con Number perdía la diferencia (control de la regresión)", [new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(Number(LIM[0])) === new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(Number(LIM[1])), formatearCambio(LIM[0]) === formatearCambio(LIM[1])], [true, false]);
  igual("R03 valores usuales en formato paraguayo: 7350,5 · 7350.000001 · 7350 · 1,234 (no se confunde con 1.234 miles) · 0,000001 · cero a la izquierda y ceros finales", [
    formatearCambio("7350.5"), formatearCambio("7350.000001"), formatearCambio("7350.000000"), formatearCambio("1.234"), formatearCambio("0.000001"), formatearCambio("007350.500000"), formatearCambio("1234567"),
  ], ["7.350,5", "7.350,000001", "7.350", "1,234", "0,000001", "7.350,5", "1.234.567"]);
  igual("R03 entrada vacía o inválida → vacío (nunca «NaN»)", ["", "abc", "1e5", "-3"].map(formatearCambio), ["", "", "", ""]);
  igual("R03 ida y vuelta: lo que se pone en «Corregir» (es-PY exacto) vuelve a normalizarse al MISMO decimal almacenado — sin cambio falso y sin dirty", [
    ...LIM, "7350.5", "7350.000001", "1.234", "0.000001", "7350",
  ].map((v) => normalizarCambio(formatearCambio(v)) === canonicoDecimal(v) && igualDecimal(normalizarCambio(formatearCambio(v)) ?? "", v)), [true, true, true, true, true, true, true, true]);
  igual("R03 escribir lo mismo que ya está guardado no cuenta como cambio (el servidor rechaza «la cotización no cambió»); un 0,000001 distinto sí", [igualDecimal(normalizarCambio(formatearCambio(LIM[0])) ?? "", LIM[0]), igualDecimal(normalizarCambio(formatearCambio(LIM[0])) ?? "", LIM[1])], [true, false]);
  igual("R03 formulario: el valor exacto de «Corregir» pasa la validación (alcance 12+6) incluso en el máximo", [LIM.map((v) => Object.keys(validarFormularioComercial("cambios", { ...f0, id: "x", cambio: formatearCambio(v) }))), cambioEnAlcance(LIM[2])], [[[], [], []], true]);
  igual("R03 orden exacto: .000001 < .000002 < 999999999999.999999; enteros de distinto largo; fracciones de distinto largo; iguales con ceros", [
    compararDecimales(LIM[0], LIM[1]), compararDecimales(LIM[1], LIM[0]), compararDecimales(LIM[1], LIM[2]), compararDecimales("999", "1000"), compararDecimales("7350.5", "7350.499999"), compararDecimales("7350.50", "7350.500000"), compararDecimales("", "0"),
  ], [-1, 1, -1, -1, 1, 0, 0]);
  igual("R03 ordenar una lista de cotizaciones por cambio conserva el orden decimal exacto (con Number los dos primeros empataban)", [LIM[2], LIM[1], "7350.5", LIM[0], "0.000001"].sort(compararDecimales), ["0.000001", "7350.5", LIM[0], LIM[1], LIM[2]]);
  {
    const pgc = leer("app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx");

    cierto("R03 pantalla: ya no hay Number() en la apresentación, la edición ni el orden de la cotización; «Corregir» se abre con formatearCambio del texto de la API, y la tabla y el orden usan los helpers exactos", !/Number\(a\.cambio|Number\(b\.cambio|Number\(f\.cambio|new Intl\.NumberFormat/.test(pgc) && /cambio: formatearCambio\(f\.cambio \?\? ""\)/.test(pgc) && /\{formatearCambio\(f\.cambio \?\? "0"\)\}/.test(pgc) && /return compararDecimales\(a\.cambio \?\? "0", b\.cambio \?\? "0"\)/.test(pgc));
    cierto("R03 regresión: versión de la cotización, historial, anular y la comparación del servidor siguen como estaban (igualDecimal) y no se tocó el servidor", /igualDecimal\(a\.cambio, nuevo\)/.test(srv) && /UPDATE tipos_cambio SET vigente = false/.test(srv) && /Number\(x\.version \?\? 0\) > Number\(f\.version \?\? 0\)/.test(pgc));
  }

  // ── Preservado: cambio 100 % manual, historial, aislamiento
  cierto("preservado: la cotización sigue 100 % manual (sin fetch/URL externas), sin DELETE (el historial se conserva: corregir retira + inserta, anular retira) y toda consulta lleva empresa_id", !/fetch\(|https?:\/\//.test(srv) && !/DELETE FROM/.test(srv) && /UPDATE tipos_cambio SET vigente = false/.test(srv) && (srv.match(/empresa_id = \$[12]/g) ?? []).length >= 10);

  // ── CC-D01 (PRO-173): alta con solo CREAR ───────────────────────────────────────────────────────────────────────────────────────────────────
  const G = (q: string) => new URL("http://x/api/catalogos-comerciales/tipos-cambio" + q);
  const soloVer = { ver: true, crear: false };
  const soloCrear = { ver: false, crear: true };
  const ambos = { ver: true, crear: true };
  const nada = { ver: false, crear: false };
  const res = (q: string, p: { ver: boolean; crear: boolean }) => { const d = decidirGetComercial(G(q), p); return d.tipo === "permitida" ? d.finalidad : d.tipo; };

  igual("D01: modo=monedas lo atienden CREAR-only, VER y ambos; sin permisos (incluido EDITAR-only, que no gana VER ni CREAR) se deniega", [res("?modo=monedas", soloCrear), res("?modo=monedas", soloVer), res("?modo=monedas", ambos), res("?modo=monedas", nada)], ["MONEDAS", "MONEDAS", "MONEDAS", "denegada"]);
  igual("D01: CREAR-only NO obtiene la lista ni el historial (sin modo, historial=1, modo vacío o desconocido, parámetros ajenos): nada contornea VER", ["", "?historial=1", "?modo=", "?modo=lista", "?modo=otro", "?q=a"].map((q) => res(q, soloCrear)), Array.from({ length: 6 }, () => "denegada"));
  igual("D01: modo=monedas repetido o combinado con otros parámetros es inconsistente (400) para todos; VER conserva la lista y el historial", [res("?modo=monedas&modo=lista", soloCrear), res("?modo=monedas&historial=1", soloVer), res("?modo=monedas&x=1", ambos), res("", soloVer), res("?historial=1", soloVer)], ["invalida", "invalida", "invalida", "LISTA", "LISTA"]);

  const monedasOk = { monedas: [{ codigo: "USD", nombre: "Dólar", simbolo: "$" }], permisos: { ver: false } };
  const alta = (r: Resp) => cargarMonedasAlta(fetchDe({ "/api/catalogos-comerciales/tipos-cambio?modo=monedas": r }));

  igual("D01: la consulta mínima del alta usa solo `modo=monedas`; devuelve monedas y el permiso VER de la sesión (para no ofrecer enlaces prohibidos); 403/500/red/forma inválida son error, no selector vacío", [await alta({ status: 200, cuerpo: monedasOk }), (await alta({ status: 403, cuerpo: { error: "No tiene permiso." } })), await alta("red"), await alta({ status: 200, cuerpo: { monedas: "USD" } }), await alta({ status: 200, cuerpo: {} }), await alta({ status: 200, cuerpo: { monedas: [] } })], [{ ok: true, monedas: monedasOk.monedas, puedeVer: false }, { ok: false, mensaje: "No tiene permiso. (código 403)" }, { ok: false, mensaje: "No hubo conexión para cargar las monedas." }, { ok: false, mensaje: "La respuesta de las monedas no tiene el formato esperado." }, { ok: false, mensaje: "La respuesta de las monedas no tiene el formato esperado." }, { ok: true, monedas: [], puedeVer: false }]);

  const srvC = leer("lib/comercial/servidor.ts");
  const acc = (permissions: string[], extra: Partial<{ isCompanyAdmin: boolean; isPlatformAdmin: boolean }> = {}) => ({ permissions, isCompanyAdmin: false, isPlatformAdmin: false, ...extra });
  const etiquetas = (a: ReturnType<typeof acc>) => resolveNavigation(a).flatMap((g) => g.items.map((i) => i.label)).filter((e) => /comercial/i.test(e));

  igual("D01: CREAR-only ve «Nuevo catálogo comercial» (y no el listado); VER ve «Catálogos comerciales» (y no el atajo); EDITAR-only no gana acceso", [etiquetas(acc(["LISTAS_PRECIO.CREAR"])), etiquetas(acc(["LISTAS_PRECIO.VER"])), etiquetas(acc(["LISTAS_PRECIO.EDITAR"]))], [["Nuevo catálogo comercial"], ["Catálogos comerciales"], []]);
  cierto("D01 servidor y pantallas: la consulta de monedas solo devuelve monedas y el permiso VER, la empresa sale de la sesión, POST sigue con CREAR; layouts VER-o-CREAR, /nuevo solo CREAR y listado con VER; la conclusión no ofrece enlaces sin VER", /finalidad === "MONEDAS" \? "VER_O_CREAR" : "VER"/.test(srvC) && /NextResponse\.json\(\{ monedas: \(await b\.db\.query\(SQL_MONEDAS_COTIZABLES\)\)\.rows, permisos: \{ ver: hasPermission/.test(srvC) && /const empresaId = b\.session\.user\.empresaId; \/\/ nunca del cuerpo/.test(srvC) && /preparar\("CREAR"\)/.test(srvC) && /hasPermission\(access, "LISTAS_PRECIO", "VER"\) && !hasPermission\(access, "LISTAS_PRECIO", "CREAR"\)\) notFound\(\)/.test(leer("app/(private)/catalogos-comerciales/layout.tsx")) && /guardPage\("LISTAS_PRECIO", "CREAR"\)/.test(leer("app/(private)/catalogos-comerciales/nuevo/layout.tsx")) && /guardPage\("LISTAS_PRECIO", "VER"\)/.test(leer("app/(private)/catalogos-comerciales/page.tsx")) && /Registrar otro/.test(leer("app/(private)/catalogos-comerciales/nuevo/page.tsx")) && /\{puedeVer \? \(\s+<Link href="\/catalogos-comerciales"/.test(leer("app/(private)/catalogos-comerciales/nuevo/page.tsx")));

  // ── CC-D02 (PRO-174): gravación exclusiva y respuestas atrasadas ──────────────────────────────────────────────────────────────────────────────
  // Modelo de la pantalla con las MISMAS piezas reales (crearExclusion y crearCompuerta) y las mismas guardas que los manejadores.
  const pantalla = () => {
    const excl = crearExclusion();
    const comp = crearCompuerta();
    const st = { tab: "cambios", form: null as string | null, filas: ["cambios-0"] as string[], aperturas: 0, errorForm: "", exito: 0, cargasEscritas: [] as string[] };
    const abrirF = (nombre: string) => { if (excl.activa()) return false; st.form = nombre; st.aperturas += 1; return true; };
    const cancelar = () => { if (excl.activa()) return false; st.form = null; return true; };
    const cambiarTab = (t: string) => { if (excl.activa() || t === st.tab) return false; st.tab = t; st.form = null; return true; };
    const cargar = async (tab: string, respuesta: Promise<string[]>) => { const s = comp.nueva(); const filas = await respuesta; if (!comp.vigente(s)) return; st.filas = filas; st.cargasEscritas.push(tab); };
    /** guardar: exclusión síncrona; éxito → cierra el formulario y recarga; error → el formulario y el borrador se conservan. */
    const guardar = (enviar: Promise<void>, recarga: Promise<string[]>) => excl.ejecutar(async () => {
      try { await enviar; st.form = null; st.exito += 1; await cargar(st.tab, recarga); } catch (e) { st.errorForm = (e as Error).message; }
    });
    const mutar = (operacion: Promise<void>) => excl.ejecutar(async () => { await operacion; });

    return { excl, st, abrirF, cancelar, cambiarTab, cargar, guardar, mutar };
  };

  const p1 = pantalla();
  let liberar1: () => void = () => undefined;
  const put1 = new Promise<void>((res) => { liberar1 = res; });

  p1.abrirF("A");
  const g1 = p1.guardar(put1, Promise.resolve(["cambios-1"]));

  igual("D02: con un PUT pendiente no se cambia de pestaña ni se abre otro formulario (Nuevo/Editar/Corregir) ni se cancela el actual", [p1.excl.activa(), p1.cambiarTab("canales"), p1.abrirF("B"), p1.cancelar(), p1.st.tab, p1.st.form, p1.st.aperturas], [true, false, false, false, "cambios", "A", 1]);

  const segundo = await p1.guardar(Promise.resolve(), Promise.resolve([]));
  const estadoMut = await p1.mutar(Promise.resolve());

  igual("D02: un segundo POST/PUT y las mutaciones de inactivar/anular no se ejecutan mientras la gravación está pendiente", [segundo, estadoMut, p1.excl.activa()], [{ ejecutada: false }, { ejecutada: false }, true]);

  liberar1();
  await g1;

  igual("D02: al terminar con éxito se cierra SOLO el formulario de esa operación, se recargan las filas y las operaciones legítimas vuelven (cambiar de pestaña, abrir otro formulario)", [p1.st.form, p1.st.exito, p1.st.filas, p1.excl.activa(), p1.cambiarTab("canales"), p1.abrirF("C"), p1.st.form], [null, 1, ["cambios-1"], false, true, true, "C"]);

  const p2 = pantalla();

  p2.abrirF("conflicto");
  await p2.guardar(Promise.reject(new Error("La versión del registro cambió. Recargue.")), Promise.resolve(["no se usa"]));

  igual("D02: error 409 → el formulario y su borrador se conservan, no hay éxito falso y la exclusión se libera para reintentar", [p2.st.form, p2.st.errorForm, p2.st.exito, p2.excl.activa(), p2.abrirF("otro")], ["conflicto", "La versión del registro cambió. Recargue.", 0, false, true]);

  const p3 = pantalla();
  let liberarAnular: () => void = () => undefined;
  const anulando = p3.mutar(new Promise<void>((res) => { liberarAnular = res; }));

  igual("D02: anular/inactivar pendiente bloquea el guardado y el cambio de pestaña; se libera al terminar y también si la mutación falla", [p3.excl.activa(), p3.cambiarTab("zonas"), (await p3.guardar(Promise.resolve(), Promise.resolve([]))).ejecutada, (liberarAnular(), (await anulando).ejecutada), p3.excl.activa(), await p3.mutar(Promise.reject(new Error("falló"))).catch((e: Error) => e.message), p3.excl.activa()], [true, false, false, true, false, "falló", false]);

  // GET atrasado: la carga de la pestaña anterior no pisa las filas de la pestaña actual (compuerta).
  const p4 = pantalla();
  let liberarVieja: (v: string[]) => void = () => undefined;
  const vieja = p4.cargar("cambios", new Promise<string[]>((res) => { liberarVieja = res; }));

  p4.cambiarTab("canales");
  await p4.cargar("canales", Promise.resolve(["canal-1"]));
  liberarVieja(["cambio-viejo"]);
  await vieja;

  igual("D02: una carga atrasada de la pestaña anterior no sustituye las filas de la pestaña actual", [p4.st.filas, p4.st.cargasEscritas], [["canal-1"], ["canales"]]);

  const compSrc = leer("app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx");

  cierto("D02 pantalla real: guardar, cambiarEstado y anular adquieren la exclusión de forma síncrona (crearExclusion) y la liberan en finally; pestañas, Nuevo, Cancelar, Editar/Corregir/Anular/Inactivar y el historial se deshabilitan y sus manejadores se niegan con la exclusión activa; se mantiene la compuerta GET", (compSrc.match(/exclusion\.current\.ejecutar\(/g) ?? []).length === 3 && (compSrc.match(/if \(exclusion\.current\.activa\(\)\) return;/g) ?? []).length === 3 && /event\.preventDefault\(\);\n\s+if \(!form \|\| exclusion\.current\.activa\(\)\) return;/.test(compSrc) && /if \(exclusion\.current\.activa\(\) \|\| nuevo === tab/.test(compSrc) && (compSrc.match(/setOcupado\(false\)/g) ?? []).length === 3 && (compSrc.match(/disabled=\{!confiable \|\| ocupado\}/g) ?? []).length === 4 && /aria-current=\{tab === t\.id \? "page" : undefined\} disabled=\{ocupado\}/.test(compSrc) && /disabled=\{ocupado\}\n\s+onClick=\{\(\) => \{\n\s+if \(!ocupado && confirmarDescarte\(\)\) cerrar\(\)/.test(compSrc) && /compuerta\.current\.vigente\(solicitud\)/.test(compSrc) && /useProtegerCambios\(sucio\)/.test(compSrc));

  // ── CC-D03 (PRO-175): monedas obligatorias en Tipos de cambio ─────────────────────────────────────────────────────────────────────────────
  const tc = (cuerpo: unknown, status = 200) => cargarCatalogoComercial("tipos-cambio", "tiposCambio", false, fetchDe({ [U("tipos-cambio")]: { status, cuerpo } }));
  const sinMonedas = { tiposCambio: [], permisos: P };

  const rA = await tc(sinMonedas);
  const rB = await tc({ ...sinMonedas, monedas: null });
  const rC = await tc({ ...sinMonedas, monedas: "USD" });
  const rD = await tc({ ...sinMonedas, monedas: {} });
  const rE = await tc({ ...sinMonedas, monedas: [{ nombre: "sin código" }] });

  igual("D03: HTTP 200 SIN monedas, con null, texto, objeto o elementos sin código → error, filas vacías y permisos neutralizados (no se habilita crear con selector vacío)", [rA, rB, rC, rD, rE].map((r) => [r.error !== "", r.filas, r.permisos, r.monedas]), Array.from({ length: 5 }, () => [true, [], { crear: false, editar: false }, null]));
  igual("D03: `monedas: []` es válida (no hay monedas disponibles) y una respuesta completa pasa con sus monedas", [(await tc({ ...sinMonedas, monedas: [] })).error, (await tc({ ...sinMonedas, monedas: [] })).monedas, (await tc({ tiposCambio: [{ id: "c1" }], monedas: [{ codigo: "USD", nombre: "Dólar", simbolo: "$" }], permisos: P })).monedas], ["", [], [{ codigo: "USD", nombre: "Dólar", simbolo: "$" }]]);
  igual("D03: Canales y Zonas no necesitan `monedas` (siguen siendo válidos sin ellas) pero si vienen deben ser un arreglo", [(await cargarCatalogoComercial("canales-venta", "canales", false, fetchDe({ [U("canales-venta")]: { status: 200, cuerpo: { canales: [], permisos: P } } }))).error, (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: [], permisos: P } } }))).error, (await cargarCatalogoComercial("zonas", "zonas", false, fetchDe({ [U("zonas")]: { status: 200, cuerpo: { zonas: [], monedas: "x", permisos: P } } }))).error !== ""], ["", "", true]);

  // 403/500 y reintento: tras un fallo los datos y permisos anteriores no son utilizables; el reintento válido restablece la carga.
  const f403 = await tc({ error: "Sin permiso." }, 403);
  const f500 = await tc({ error: "Falló." }, 500);
  const reintento = await tc({ tiposCambio: [{ id: "c1" }], monedas: [{ codigo: "USD", nombre: "", simbolo: "" }], permisos: P });
  const estadoFallo = { cargando: false, errorCarga: f403.error, errorAuxiliar: "" };

  igual("D03: 403 y 500 → error con código y permisos neutralizados (la pantalla vacía monedas, filas y permisos y bloquea crear/editar/guardar con el borrador intacto); el reintento válido restablece una carga confiable", [f403.error, f500.error, f403.monedas, permisosVigentes(P, estadoFallo), cargaConfiable(estadoFallo), motivoBloqueoGuardar(estadoFallo)?.includes("Lo escrito se conserva"), reintento.error, cargaConfiable({ cargando: false, errorCarga: reintento.error, errorAuxiliar: "" })], ["Sin permiso. (código 403)", "Falló. (código 500)", null, { crear: false, editar: false }, false, true, "", true]);
  cierto("D03 pantalla: tras un error de carga se vacían las monedas obsoletas y el aviso ofrece «Reintentar» (relanza la carga sin tocar el borrador)", /setMonedas\(\[\]\); \/\/ CC-D03/.test(compSrc) && /disabled=\{ocupado \|\| cargando\} onClick=\{\(\) => void cargar\(\)\}>\s+Reintentar/.test(compSrc) && /clave === "tiposCambio"/.test(leer("lib/comercial/carga.ts")));

  // ── CC-R03-01 (PRO-176): los campos no se editan durante la gravación ─────────────────────────────────────────────────────────────────────────
  const borrador = (nombre: string): FormularioComercial => ({ id: null, codigo: "C1", nombre, fecha: "2026-10-19", monedaCodigo: "USD", cambio: "7350,50", motivo: "m" });
  /** Simula un envío: el servidor recibe lo que había al pulsar Guardar; el operador intenta editar mientras está pendiente. */
  const envio = async (resultado: "ok" | "409" | "red", abierto: FormularioComercial) => {
    const excl = crearExclusion();
    let borr = abierto;
    let enviado = "";
    let liberar: () => void = () => undefined;
    const respuesta = new Promise<void>((res) => { liberar = res; });
    const op = excl.ejecutar(async () => {
      enviado = borr.nombre;
      await respuesta;
      if (resultado === "409") throw new Error("La versión del registro cambió.");
      if (resultado === "red") throw new TypeError("fetch failed");
    });
    // handler `actualizar` del componente: evalúa la exclusión al momento del cambio
    const editar = (campo: Parameters<typeof aplicarCambioCampo>[1], valor: string) => { borr = aplicarCambioCampo(borr, campo, valor, excl.activa()); };

    editar("nombre", "Canal B");
    const durante = borr.nombre;

    liberar();
    const fin = await op.catch((e: Error) => ({ ejecutada: false as const, error: e.message }));

    return { enviado, durante, fin, tras: (editar("nombre", "Canal C"), borr.nombre), activa: excl.activa(), borr, editar };
  };

  const rOk = await envio("ok", borrador("Canal A"));
  const r409 = await envio("409", borrador("Canal A"));
  const rRed = await envio("red", borrador("Canal A"));

  igual("R03-01: con el POST/PUT pendiente el borrador NO cambia (se envió «Canal A» y sigue siendo «Canal A»), también en la edición de un registro (PUT)", [rOk.enviado, rOk.durante, r409.durante, rRed.durante], ["Canal A", "Canal A", "Canal A", "Canal A"]);
  igual("R03-01: HTTP 200 concluye sin perder ni mezclar datos (lo guardado es lo revisado); tras terminar la exclusión se libera y se puede volver a editar", [rOk.fin, rOk.activa, rOk.tras], [{ ejecutada: true, valor: undefined }, false, "Canal C"]);
  igual("R03-01: HTTP 409 y error de red mantienen el formulario con los valores enviados y liberan la edición para corregir y reintentar", [r409.fin, r409.borr.codigo, r409.borr.cambio, r409.activa, r409.tras, rRed.fin, rRed.activa, rRed.tras], [{ ejecutada: false, error: "La versión del registro cambió." }, "C1", "7350,50", false, "Canal C", { ejecutada: false, error: "fetch failed" }, false, "Canal C"]);

  const camposTodos = ["fecha", "monedaCodigo", "cambio", "motivo", "codigo", "nombre"] as const;
  const bloqueadoTodo = camposTodos.map((c) => aplicarCambioCampo(borrador("Canal A"), c, "X", true));
  const libreTodo = camposTodos.map((c) => aplicarCambioCampo(borrador("Canal A"), c, "X", false)[c]);

  igual("R03-01: los seis campos (Fecha, Moneda, Cambio, Motivo, Código, Nombre) quedan intactos con la exclusión activa (mismo objeto) y vuelven a editarse al liberarse", [bloqueadoTodo.every((b) => b.nombre === "Canal A" && b.codigo === "C1" && b.cambio === "7350,50" && b.motivo === "m" && b.fecha === "2026-10-19" && b.monedaCodigo === "USD"), libreTodo], [true, ["X", "X", "X", "X", "X", "X"]]);

  const compR = leer("app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx");
  const nuevaR = leer("app/(private)/catalogos-comerciales/nuevo/page.tsx");

  cierto("R03-01 pantallas (listado y /nuevo): `actualizar` se niega con la exclusión activa y usa el helper real; Fecha (CampoFecha), Moneda, Cambio, Motivo, Código y Nombre se deshabilitan con la gravación; la lógica de exclusión de PRO-174 sigue igual", /if \(exclusion\.current\.activa\(\)\) return;\n\s+setForm\(\(a\) => \(a \? aplicarCambioCampo\(a, campo, valor, false\) : a\)\)/.test(compR) && /if \(exclusion\.current\.activa\(\)\) return;\n\s+setForm\(\(a\) => aplicarCambioCampo\(a, campo, valor, false\)\)/.test(nuevaR) && /<CampoFecha id=\{idCampo\("fecha"\)\} valor=\{form\.fecha\} disabled=\{corrigiendo \|\| ocupado\}/.test(compR) && /<select \{\.\.\.ariaCampo\("monedaCodigo"\)\} value=\{form\.monedaCodigo\} disabled=\{corrigiendo \|\| ocupado\}/.test(compR) && ["cambio", "motivo", "codigo", "nombre"].every((c) => new RegExp(`disabled=\\{ocupado\\} (value|onChange)?[^\\n]*form\\.${c}|form\\.${c}[^\\n]*`).test(compR)) && (compR.match(/disabled=\{ocupado\} value=\{form\./g) ?? []).length + (compR.match(/disabled=\{ocupado\} value=\{form\.cambio\}/g) ?? []).length >= 4 && /<CampoFecha valor=\{form\.fecha\} disabled=\{ocupado\}/.test(nuevaR) && /<select value=\{form\.monedaCodigo\} disabled=\{ocupado\}/.test(nuevaR) && (nuevaR.match(/disabled=\{ocupado\} value=\{form\./g) ?? []).length === 3 && (compR.match(/exclusion\.current\.ejecutar\(/g) ?? []).length === 3);

  // ── CC-R03-02 (PRO-177): 400 para consulta inválida, ejercitando la cadena real de listarCambios ───────────────────────────────────────────
  const rutaSrv = leer("lib/comercial/servidor.ts");

  cierto("R03-02 estructura: la finalidad INVALIDA solo exige sesión (acción SESION); MONEDAS exige VER o CREAR; el resto, VER", /preparar\(finalidad === "INVALIDA" \? "SESION" : finalidad === "MONEDAS" \? "VER_O_CREAR" : "VER"\)/.test(rutaSrv));

  type Permisos = Set<string>;
  /** Ejecuta la cadena REAL de `listarCambios` (sesión → finalidad → autorización → consultas) con sesión, permisos y base simulados; cada llamada instala y retira sus simulacros. */
  const ruta = async (sesion: boolean, permisos: Permisos, q: string) => {
    const consultas: Array<{ sql: string; params: unknown[] }> = [];
    const { NextResponse: NR } = await import("next/server");
    const falsos: Record<string, unknown> = {
      "@/lib/auth/session": { getCurrentSession: async () => (sesion ? { user: { id: "u1", empresaId: "EMP-1" }, demo: false } : null) },
      "@/lib/auth/permissions": {
        denyIfNoPermission: async (_s: unknown, _r: string, accion: string) => (permisos.has(accion) ? null : NR.json({ error: "No tiene permiso para esta acción." }, { status: 403 })),
        getAccessContext: async () => ({}),
        hasPermission: (_a: unknown, _r: string, accion: string) => permisos.has(accion),
      },
      "@/lib/db": { db: { query: async (sql: string, params: unknown[] = []) => { consultas.push({ sql: sql.replace(/\s+/g, " "), params }); return { rows: [] }; } } },
    };
    const previos: Array<[string, NodeJS.Module | undefined]> = [];
    const rutaSrvJs = require.resolve("@/lib/comercial/servidor");
    const envPrevio = [process.env.DATABASE_URL, process.env.DEMO_MODE];

    for (const [m, exports] of Object.entries(falsos)) {
      const r = require.resolve(m);

      previos.push([r, require.cache[r]]);
      require.cache[r] = { id: r, filename: r, loaded: true, exports, children: [], paths: [] } as unknown as NodeJS.Module;
    }
    delete require.cache[rutaSrvJs];
    process.env.DATABASE_URL = "postgres://prueba";
    delete process.env.DEMO_MODE;

    try {
      const { listarCambios } = (await import("@/lib/comercial/servidor")) as typeof import("@/lib/comercial/servidor");
      const r = await listarCambios(new Request("http://x/api/catalogos-comerciales/tipos-cambio" + q));
      const cuerpo = (await r.json()) as Record<string, unknown>;

      return { status: r.status, claves: Object.keys(cuerpo).sort(), consultas: consultas.map((c) => c.sql), params: consultas.map((c) => c.params[0]) };
    } finally {
      for (const [r, previo] of previos) { if (previo) require.cache[r] = previo; else delete require.cache[r]; }
      delete require.cache[rutaSrvJs];
      if (envPrevio[0] === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = envPrevio[0];
      if (envPrevio[1] !== undefined) process.env.DEMO_MODE = envPrevio[1];
    }
  };
  const CREAR = new Set(["CREAR"]);
  const VER = new Set(["VER"]);

  {
    igual("R03-02: sin sesión → 401 en toda consulta (incluidas las inválidas) y sin tocar la base", [(await ruta(false, new Set(), "?modo=monedas")).status, (await ruta(false, new Set(), "?modo=monedas&historial=1")).status, (await ruta(false, new Set(), "")).status, (await ruta(false, new Set(), "?modo=monedas")).consultas.length], [401, 401, 401, 0]);

    const monedasCrear = await ruta(true, CREAR, "?modo=monedas");

    igual("R03-02: CREAR-only con `modo=monedas` válido → 200 con respuesta MÍNIMA (solo monedas y permisos); la única consulta SQL es la de monedas (sin historial, clientes, listas ni costos)", [monedasCrear.status, monedasCrear.claves, monedasCrear.consultas.length, /FROM monedas/.test(monedasCrear.consultas[0] ?? ""), monedasCrear.consultas.some((s) => /tipos_cambio|clientes|listas_precio|costo/i.test(s))], [200, ["monedas", "permisos"], 1, true, false]);

    const invalidas = [await ruta(true, CREAR, "?modo=monedas&historial=1"), await ruta(true, CREAR, "?modo=monedas&modo=monedas"), await ruta(true, CREAR, "?modo=monedas&x=1")];

    igual("R03-02: CREAR-only con consulta inválida (`modo=monedas&historial=1`, `modo=monedas` duplicado, parámetro extra) → 400 (no 403) y sin datos ni consultas a la base", invalidas.map((r) => [r.status, r.claves, r.consultas.length]), Array.from({ length: 3 }, () => [400, ["error"], 0]));

    const prohibidas = [await ruta(true, CREAR, ""), await ruta(true, CREAR, "?historial=1"), await ruta(true, CREAR, "?modo=otro"), await ruta(true, CREAR, "?modo=")];

    igual("R03-02: CREAR-only que pide el listado, el historial o un modo desconocido/vacío → 403 y nada se consulta (lo desconocido no concede la finalidad mínima)", prohibidas.map((r) => [r.status, r.consultas.length]), Array.from({ length: 4 }, () => [403, 0]));

    const verMonedas = await ruta(true, VER, "?modo=monedas");
    const verLista = await ruta(true, VER, "?historial=1");

    igual("R03-02: VER-only con la consulta mínima → 200 mínima; con la lista/historial → 200 completa, siempre con la empresa de la sesión (EMP-1), y una consulta inválida también recibe 400", [verMonedas.status, verMonedas.claves, verLista.status, verLista.claves, verLista.params[0], (await ruta(true, VER, "?modo=monedas&historial=1")).status], [200, ["monedas", "permisos"], 200, ["monedas", "permisos", "tiposCambio"], "EMP-1", 400]);

    const nada = await ruta(true, new Set(), "?modo=monedas&historial=1");

    igual("R03-02: una sesión válida sin permisos recibe 400 en una consulta inválida (sin datos) y 403 en la mínima válida o en el listado", [nada.status, nada.claves, nada.consultas.length, (await ruta(true, new Set(), "?modo=monedas")).status, (await ruta(true, new Set(), "")).status], [400, ["error"], 0, 403, 403]);
  }

  return fallos;
}
