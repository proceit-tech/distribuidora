/**
 * Estabilización de Proveedores (AUD-PROVEEDORES-V1 §V): PRV-M01 (versión obligatoria, 409), PRV-M02 (grupo y medio de pago históricos inactivos), PRV-M03 (protección de
 * borradores) y PRV-M04 (cierre de la carga documental verificado, sin duplicar el alta). Sin base de datos: lógica pura, conexiones simuladas y verificaciones estáticas.
 * NO prueban PostgreSQL ni el navegador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { leerRetomada, subirDocumentosPendientes, urlRetomada } from "@/lib/proveedores/alta";
import { cerrarCargaInicialProveedor } from "@/lib/proveedores/cierre-carga";
import type { DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import { decidirAccesoDocumento, type AccionDocumento } from "@/lib/proveedores/permisos-documentos";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { exigirVersion, exigirVersionPresente, validarReferencias } from "@/lib/proveedores/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OTRA = "99999999-9999-4999-8999-999999999999";
const PROV = "22222222-2222-4222-8222-222222222222";
const G_VIEJO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G_ACTIVO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const G_AJENO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const M_VIEJO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const M_ACTIVO = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export async function verificarCasosEstabilizacionProveedores(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const lanza = (f: () => void) => {
    try {
      f();

      return null;
    } catch (e) {
      return e as ErrorValidacion;
    }
  };

  // ── PRV-M01: versión obligatoria
  const V1 = "2026-10-12T15:15:46.123456";
  const V2 = "2026-10-12T15:20:01.654321";
  const resultado = (enviada: unknown, actual: unknown) => {
    const e = lanza(() => exigirVersion(enviada, actual));

    return e ? [e.estado, /Falta la versión|Otro usuario/.test(e.message), /no se guardó ningún cambio/i.test(e.message)] : "ok";
  };

  igual("M01 positivo: la versión vigente se acepta", resultado(V1, V1), "ok");
  igual("M01 negativo: sin versión, vacía, solo espacios, numérica o nula → 409 (nunca se ignora la guarda)", [resultado(undefined, V1), resultado("", V1), resultado("   ", V1), resultado(12345, V1), resultado(null, V1)], Array(5).fill([409, true, true]));
  igual("M01 negativo: versión obsoleta o malformada → 409", [resultado(V2, V1), resultado("no-es-version", V1), resultado(V1.slice(0, 19), V1)], Array(3).fill([409, true, true]));

  // Dos pestañas: ambas cargan V1; A guarda (la versión pasa a V2); B intenta guardar con V1 → 409; B recarga y guarda con V2
  let vigente = V1;
  const guardar = (enviada: string) => {
    const r = resultado(enviada, vigente);

    if (r === "ok") vigente = V2;

    return r;
  };

  igual("M01 concurrencia (2 pestañas): A guarda; B con la versión anterior recibe 409; tras recargar B guarda; ninguna escritura sin versión vigente", [guardar(V1), guardar(V1), guardar(V2)], ["ok", [409, true, true], "ok"]);

  const ruta = leer("app/api/proveedores/[id]/route.ts");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  const pos = (t: string) => put.indexOf(t);

  cierto("M01: el PUT exige la versión DESPUÉS de bloquear la fila y ANTES de validar gobernados/referencias/documento y de escribir proveedor, eventos o hijos; la guarda condicional antigua desapareció", pos("FOR UPDATE") > 0 && pos("FOR UPDATE") < pos("exigirVersion(body.version, actual.version)") && pos("exigirVersion(") < pos("gobernados") && pos("exigirVersion(") < pos("validarReferencias(") && pos("exigirVersion(") < pos("UPDATE proveedores x SET") && pos("exigirVersion(") < pos("registrarEvento(") && pos("exigirVersion(") < pos("sincronizarHijos(") && !/typeof body\.version === "string" &&/.test(ruta));
  cierto("M01: el ErrorValidacion 409 se traduce a HTTP 409 con ROLLBACK (nada se escribe) y la versión sigue siendo actualizado_at con microsegundos, sin migración nueva", /ROLLBACK/.test(put.slice(put.indexOf("} catch (error)"))) && /respuestaError\(error, "actualizar"\)/.test(put) && /HH24:MI:SS\.US/.test(put) && /409/.test(leer("lib/proveedores/shared.ts").slice(leer("lib/proveedores/shared.ts").indexOf("export function exigirVersion"), leer("lib/proveedores/shared.ts").indexOf("export function exigirVersion") + 900)));
  cierto("M01: el formulario envía la versión en la edición (y no en el alta); el alta (POST) no la exige", /\.\.\.\(modo === "editar" \? \{ version, eliminaciones \} : \{\}\)/.test(leer("lib/proveedores/formulario.ts")) && !/exigirVersion/.test(leer("app/api/proveedores/route.ts")));

  // ── PRV-M02: referencias históricas inactivas
  type Q = { sql: string; p: unknown[] };
  const activos = new Set([G_ACTIVO, M_ACTIVO]);
  const deEmpresa = new Set([G_VIEJO, G_ACTIVO, M_VIEJO, M_ACTIVO]);
  const conexion = () => {
    const consultas: Q[] = [];

    return {
      consultas,
      c: {
        async query(sql: string, p: unknown[] = []) {
          consultas.push({ sql, p });
          if (/FROM (grupos_proveedor|medios_pago) WHERE id = \$1 AND empresa_id = \$2/.test(sql)) {
            const existe = p[1] === EMPRESA && deEmpresa.has(p[0] as string) && (!/activo = true/.test(sql) || activos.has(p[0] as string));

            return { rows: [], rowCount: existe ? 1 : 0 };
          }

          return { rows: [], rowCount: 1 };
        },
      } as never,
    };
  };
  const datos = (grupo: string | null, medio: string | null) => ({ grupoProveedorId: grupo, medioPagoId: medio, condicionPagoId: null, monedaCodigo: null, incotermCodigo: null, paisCodigo: "PRY", direcciones: [], cuentasBancarias: [], retenciones: [] }) as never;
  const valida = async (grupo: string | null, medio: string | null, previo: { grupoProveedorId?: string | null; medioPagoId?: string | null } = {}, empresa = EMPRESA) => {
    try {
      await validarReferencias(conexion().c, datos(grupo, medio), empresa, previo);

      return "ok";
    } catch (e) {
      return `${(e as ErrorValidacion).campo}`;
    }
  };

  igual("M02 positivo: grupo y medio de pago históricos INACTIVOS, idénticos a los guardados, se toleran (editar teléfono/dirección sin tocar esos vínculos)", await valida(G_VIEJO, M_VIEJO, { grupoProveedorId: G_VIEJO, medioPagoId: M_VIEJO }), "ok");
  igual("M02 negativo: elegir como NUEVO un grupo o medio inactivo se rechaza con el campo exacto", [await valida(G_VIEJO, null, { grupoProveedorId: G_ACTIVO }), await valida(null, M_VIEJO, { medioPagoId: M_ACTIVO })], ["grupoProveedorId", "medioPagoPreferidoId"]);
  igual("M02 positivo: cambiar a un grupo/medio ACTIVO de la empresa se acepta; vaciar los vínculos también", [await valida(G_ACTIVO, M_ACTIVO, { grupoProveedorId: G_VIEJO, medioPagoId: M_VIEJO }), await valida(null, null, { grupoProveedorId: G_VIEJO, medioPagoId: M_VIEJO })], ["ok", "ok"]);
  igual("M02 multiempresa: un vínculo de otra empresa se rechaza aunque coincida con el 'previo' (la comprobación de pertenencia se mantiene) y el POST (sin previo) sigue exigiendo activos", [await valida(G_AJENO, null, { grupoProveedorId: G_AJENO }), await valida(G_VIEJO, null), await valida(G_ACTIVO, M_ACTIVO), await valida(G_VIEJO, null, { grupoProveedorId: G_VIEJO }, OTRA)], ["grupoProveedorId", "grupoProveedorId", "ok", "grupoProveedorId"]);

  const sqlHistorico = conexion();

  await validarReferencias(sqlHistorico.c, datos(G_VIEJO, M_VIEJO), EMPRESA, { grupoProveedorId: G_VIEJO, medioPagoId: M_VIEJO });

  igual("M02: el vínculo sin cambio se verifica solo por pertenencia a la empresa (sin 'activo')", [sqlHistorico.consultas.filter((q) => /grupos_proveedor|medios_pago/.test(q.sql)).every((q) => !/activo/.test(q.sql))], [true]);

  const sqlNuevo = conexion();

  await validarReferencias(sqlNuevo.c, datos(G_ACTIVO, M_ACTIVO), EMPRESA, {});

  igual("M02: sin 'previo' (alta o valor modificado) ambas consultas exigen activo = true", sqlNuevo.consultas.filter((q) => /grupos_proveedor|medios_pago/.test(q.sql)).map((q) => /activo = true/.test(q.sql)), [true, true]);
  cierto("M02: el PUT toma los vínculos guardados bajo FOR UPDATE (columnas grupo_proveedor_id y medio_pago_preferido_id) y los pasa a validarReferencias; el POST no pasa previo", /grupo_proveedor_id::text AS grupo_proveedor_id, medio_pago_preferido_id::text AS medio_pago_preferido_id/.test(put) && /validarReferencias\(conexion, datos, empresaId, \{ grupoProveedorId: actual\.grupo_proveedor_id as string \| null, medioPagoId: actual\.medio_pago_preferido_id as string \| null \}\)/.test(put) && /validarReferencias\(conexion, datos, empresaId\);/.test(leer("app/api/proveedores/route.ts")));
  cierto("M02: el GET informa los vínculos históricos inactivos de la empresa de la sesión y el formulario los agrega «(inactivo)» al selector sin ofrecer otros inactivos ni ampliar el catálogo", /referenciasHistoricas/.test(ruta) && /AND NOT activo/.test(ruta) && (ruta.slice(ruta.indexOf("export async function GET")).match(/empresa_id = \$1 AND id = \$[23]::uuid AND NOT activo/g) ?? []).length === 2 && /\(inactivo\)/.test(leer("app/(private)/proveedores/_components/proveedor-form.tsx")) && /!lista\.some\(\(o\) => o\.id === h\.id\)/.test(leer("app/(private)/proveedores/_components/proveedor-form.tsx")) && !/NOT activo/.test(leer("app/api/proveedores/route.ts")));

  // ── PRV-M03: protección de borradores
  const form = leer("app/(private)/proveedores/_components/proveedor-form.tsx");
  const docs = leer("app/(private)/proveedores/_components/pestanas/documentos.tsx");

  cierto("M03: el formulario usa el hook oficial con cambios de la ficha, documentos adjuntos pendientes y documento en preparación, y se desactiva al guardar; formulario intacto no avisa", /useProtegerCambios\(\(sucio \|\| pendientes\.length > 0 \|\| borradorDocumento\) && !guardado\)/.test(form) && /setGuardado\(true\)/.test(form) && /const sucio = form !== formularioBase && JSON\.stringify\(form\) !== JSON\.stringify\(formularioBase\)/.test(form) && /from "@\/lib\/ui\/proteger-cambios"/.test(form));
  cierto("M03: cambiar de pestaña desde Documentos con un documento en preparación pide confirmación específica (y solo entonces); sin borrador cambia sin avisos", /tab === "documentos" && pestana !== "documentos" && borradorDocumento && !window\.confirm\(/.test(form) && /Hay un documento en preparación/.test(form));
  cierto("M03: la pestaña de documentos informa su borrador (alta o edición) al formulario y lo limpia al desmontarse; el contexto lo declara", /marcarBorrador\(hayBorrador\)/.test(docs) && /return \(\) => marcarBorrador\(false\)/.test(docs) && /nuevo !== null \|\| editando !== null/.test(docs) && /marcarBorradorDocumento: \(hay: boolean\) => void/.test(leer("app/(private)/proveedores/_components/contexto.ts")) && /marcarBorradorDocumento: setBorradorDocumento/.test(form));
  cierto("M03: Volver/Cancelar siguen siendo enlaces internos interceptados por el hook (sin modales duplicados); el guardado navega por router", /<Link href="\/proveedores" className=\{styles\.secondaryButton\}>/.test(form) && /<Link href="\/proveedores" className=\{styles\.cancelButton\}>/.test(form) && /router\.push\("\/proveedores\?ok=actualizado"\)/.test(leer("app/(private)/proveedores/[id]/page.tsx")));

  // ── PRV-M04: cierre de la carga documental
  type Respuesta = { status: number; cuerpo?: unknown } | "red";
  const fetchDe = (...respuestas: Respuesta[]) => {
    const llamadas: Array<{ url: string; metodo?: string }> = [];
    const cola = [...respuestas];

    return {
      llamadas,
      f: async (url: string, init?: RequestInit) => {
        llamadas.push({ url, metodo: init?.method });

        const r = cola.shift() ?? { status: 200 };

        if (r === "red") throw new TypeError("fetch failed");

        return new Response(r.cuerpo === undefined ? null : typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo), { status: r.status });
      },
    };
  };
  const cerrar = async (...r: Respuesta[]) => {
    const x = fetchDe(...r);

    return { r: await cerrarCargaInicialProveedor(PROV, x.f), llamadas: x.llamadas };
  };

  const ok = await cerrar({ status: 200, cuerpo: { ok: true } });
  const r401 = await cerrar({ status: 401, cuerpo: { error: "Su sesión ha finalizado." } });
  const r403 = await cerrar({ status: 403, cuerpo: { error: "No tiene permiso." } });
  const r500 = await cerrar({ status: 500, cuerpo: "no json" });
  const red = await cerrar("red");

  igual("M04 positivo: 200 cierra la carga (POST a /documentos/finalizar del proveedor, id codificado)", [ok.r, ok.llamadas], [{ cerrada: true }, [{ url: `/api/proveedores/${PROV}/documentos/finalizar`, metodo: "POST" }]]);
  igual("M04 negativo: 401, 403, 500 y caída de red NO son éxito: conservan estado HTTP y mensaje útil (genérico si el cuerpo no es JSON)", [r401.r, r403.r, r500.r, red.r], [
    { cerrada: false, estado: 401, mensaje: "Su sesión ha finalizado." }, { cerrada: false, estado: 403, mensaje: "No tiene permiso." },
    { cerrada: false, estado: 500, mensaje: "No fue posible cerrar la carga inicial de documentos." }, { cerrada: false, estado: null, mensaje: "No hubo conexión con el servidor para cerrar la carga inicial de documentos." },
  ]);

  const reintento = fetchDe({ status: 500 }, { status: 200 }, { status: 200 });
  const a = await cerrarCargaInicialProveedor(PROV, reintento.f);
  const b = await cerrarCargaInicialProveedor(PROV, reintento.f);
  const c = await cerrarCargaInicialProveedor(PROV, reintento.f);

  igual("M04 reintento idempotente: fallo → éxito → éxito; todas las llamadas van al MISMO endpoint de cierre y ninguna al de creación", [a.cerrada, b.cerrada, c.cerrada, reintento.llamadas.every((l) => l.url === `/api/proveedores/${PROV}/documentos/finalizar` && l.metodo === "POST")], [false, true, true, true]);

  const finalizar = leer("app/api/proveedores/[id]/documentos/finalizar/route.ts");

  cierto("M04: el endpoint de cierre conserva su autoridad (PROVEEDORES.EDITAR o creador con la carga abierta) y es idempotente; no se concedió lectura ni edición general", /exigir\("FINALIZAR_CARGA", auth\.permisos, estado\)/.test(finalizar) && /UPDATE proveedores SET carga_documentos_inicial_abierta = false WHERE id = \$1 AND empresa_id = \$2/.test(finalizar) && /Idempotente/.test(finalizar));

  // ── PRV-R01-01/02: retomada tras recarga y reenvío de anexos fallidos (sin crear otro proveedor)
  const uidA = "doc-a";
  const uidB = "doc-b";
  const archivo = (n: string) => new File([new Uint8Array([37, 80, 68, 70, 45])], n, { type: "application/pdf" });
  const pendiente = (uid: string, nombre: string): DocumentoPendiente => ({ uid, tipo: "OTRO", fechaEmision: "", fechaVencimiento: "", observacion: "", archivo: archivo(nombre) });
  const urlsSubida: string[] = [];
  const fetchSubida = (resultados: Record<string, Respuesta>) => {
    return async (url: string, init?: RequestInit) => {
      urlsSubida.push(`${init?.method} ${url}`);

      const nombre = ((init?.body as FormData).get("archivo") as File).name;
      const r = resultados[nombre] ?? { status: 200 };

      if (r === "red") throw new TypeError("fetch failed");

      return new Response(JSON.stringify(r.cuerpo ?? { ok: true }), { status: r.status });
    };
  };

  const primera = await subirDocumentosPendientes(PROV, [pendiente(uidA, "a.pdf"), pendiente(uidB, "b.pdf")], fetchSubida({ "b.pdf": { status: 500, cuerpo: { error: "Almacenamiento no disponible." } } }));

  igual("R01-02: con 2 anexos (1 éxito, 1 fallo) se informa cuál subió y cuál falló con su código y mensaje", [primera.subidos, primera.fallidos], [[uidA], [{ uid: uidB, estado: 500, mensaje: "Almacenamiento no disponible." }]]);

  urlsSubida.length = 0;

  const reintento2 = await subirDocumentosPendientes(PROV, [pendiente(uidB, "b.pdf")], fetchSubida({}));

  igual("R01-02: el reintento envía SOLO el documento fallido (el que ya subió no se duplica) y siempre al POST de documentos del MISMO proveedor, nunca a POST /api/proveedores", [reintento2.subidos, reintento2.fallidos, urlsSubida], [[uidB], [], [`POST /api/proveedores/${PROV}/documentos`]]);

  const caida = await subirDocumentosPendientes(PROV, [pendiente(uidA, "a.pdf"), pendiente(uidB, "b.pdf")], fetchSubida({ "a.pdf": "red", "b.pdf": { status: 403, cuerpo: { error: "No tiene permiso." } } }));

  igual("R01-02: caída de red y 403 de un documento no abortan los demás; cada fallo conserva estado (null para red) y mensaje útil", caida.fallidos, [{ uid: uidA, estado: null, mensaje: "No hubo conexión con el servidor al cargar el documento." }, { uid: uidB, estado: 403, mensaje: "No tiene permiso." }]);
  igual("R01-02: un documento sin archivo o con metadatos inválidos cuenta como fallo del documento (no lanza)", (await subirDocumentosPendientes(PROV, [{ ...pendiente(uidA, "a.pdf"), fechaEmision: "31/02/2026" }], fetchSubida({}))).fallidos.map((f) => [f.uid, f.estado]), [[uidA, null]]);

  igual("R01-01: la URL de retomada conserva el id y el código; tras una recarga se reconstruye (id válido); identificadores inválidos o inyectados se ignoran", [
    urlRetomada(PROV, "PRV-000012"), leerRetomada(`?retomar=${PROV}&codigo=PRV-000012`), leerRetomada(`?retomar=${PROV}`), leerRetomada("?retomar=no-es-uuid"), leerRetomada(`?retomar=${PROV}&codigo=<script>`), leerRetomada(""),
  ], [`/proveedores/nuevo?retomar=${PROV}&codigo=PRV-000012`, { id: PROV, codigo: "PRV-000012" }, { id: PROV, codigo: "" }, null, { id: PROV, codigo: "" }, null]);

  const nuevo = leer("app/(private)/proveedores/nuevo/page.tsx");
  const retomar = leer("app/(private)/proveedores/_components/retomar-alta.tsx");
  const alta = nuevo.slice(nuevo.indexOf("async function guardar"), nuevo.indexOf("if (retomada)"));

  cierto("R01-01/02: el alta conserva el id en la URL (replaceState) y en pantalla tanto si fallan anexos como si falla el cierre; NO redirige a la ficha (exige VER) y hay un único POST de creación", (alta.match(/fetch\("\/api\/proveedores"/g) ?? []).length === 1 && (alta.match(/window\.history\.replaceState\(null, "", urlRetomada\(id, codigo\)\)/g) ?? []).length === 2 && !/router\.push\(`\/proveedores\/\$\{id\}/.test(nuevo) && /leerRetomada\(window\.location\.search\)/.test(nuevo) && /if \(retomada\)/.test(nuevo) && nuevo.indexOf("if (retomada)") < nuevo.indexOf("<ProveedorForm"));
  cierto("R01-01/02: la pantalla de retomada solo usa las rutas del alta (subir documentos y cerrar la carga), pide volver a elegir archivos tras una recarga, saca de la lista los ya subidos y no contiene ninguna llamada de creación", /subirDocumentosPendientes\(id, pendientes\)/.test(retomar) && /cerrarCargaInicialProveedor\(id\)/.test(retomar) && /pendientes\.filter\(\(p\) => !r\.subidos\.includes\(p\.uid\)\)/.test(retomar) && /seleccione nuevamente solo los que falten/.test(retomar) && !/\/api\/proveedores"/.test(retomar) && /useProtegerCambios/.test(retomar) && /disabled=\{ocupado \|\| pendientes\.length > 0\}/.test(retomar));

  // ── PRV-R01-03: cierre idempotente para el creador, sin ampliar CARGAR
  const soloCrear = { ver: false, editar: false, crear: true };
  const ctx = (esCreador: boolean, abierta: boolean) => ({ esCreador, cargaInicialAbierta: abierta });
  const permitidoPor = (accion: AccionDocumento, permisos: { ver: boolean; editar: boolean; crear: boolean }, contexto: { esCreador: boolean; cargaInicialAbierta: boolean } | null) => decidirAccesoDocumento(accion, permisos, contexto).permitido;

  igual("R01-03: el creador con solo CREAR puede repetir el cierre aunque la carga ya esté cerrada (200 perdido → reintento 200)", [permitidoPor("FINALIZAR_CARGA", soloCrear, ctx(true, true)), permitidoPor("FINALIZAR_CARGA", soloCrear, ctx(true, false))], [true, true]);
  igual("R01-03 negativo: otro usuario, proveedor inexistente/otra empresa (contexto null) o sin CREAR no pueden cerrar; el creador NO puede cargar documentos tras el cierre ni reemplazar/editar/eliminar", [
    permitidoPor("FINALIZAR_CARGA", soloCrear, ctx(false, false)), permitidoPor("FINALIZAR_CARGA", soloCrear, null), permitidoPor("FINALIZAR_CARGA", { ver: true, editar: false, crear: false }, ctx(true, false)),
    permitidoPor("CARGAR", soloCrear, ctx(true, false)), permitidoPor("REEMPLAZAR", soloCrear, ctx(true, false)), permitidoPor("EDITAR_DATOS", soloCrear, ctx(true, true)), permitidoPor("ELIMINAR", soloCrear, ctx(true, true)),
  ], Array(7).fill(false));
  igual("R01-03: la decisión marca cargaInicial según el estado real (abierta o ya cerrada)", [decidirAccesoDocumento("FINALIZAR_CARGA", soloCrear, ctx(true, true)), decidirAccesoDocumento("FINALIZAR_CARGA", soloCrear, ctx(true, false))], [{ permitido: true, cargaInicial: true }, { permitido: true, cargaInicial: false }]);
  cierto("R01-03: la ruta de cierre sigue filtrando por la empresa de la sesión (contexto null → 404) y es un UPDATE idempotente", /contextoCargaInicial\(id, empresaId, auth\.sesion\.user\.id\)/.test(finalizar) && /if \(estado === null\) return proveedorNoEncontrado\(\)/.test(finalizar) && /WHERE id = \$1 AND empresa_id = \$2/.test(finalizar));

  // ── PRV-R01-04: catálogos mínimos de la alta para CREAR-only
  const lista = leer("app/api/proveedores/route.ts");
  const get = lista.slice(lista.indexOf("export async function GET"));
  const posGet = (t: string) => get.indexOf(t);

  cierto("R01-04: sin VER, solo modo=catalogos y los catálogos geográficos se sirven a quien tiene CREAR; cualquier otra consulta (lista) sigue denegada; el POST sigue exigiendo CREAR", /const soloAlta = url\.searchParams\.get\("modo"\) === "catalogos" \|\| url\.searchParams\.has\("catalogo"\)/.test(get) && /!soloAlta \|\| \(await denyIfNoPermission\(session, "PROVEEDORES", "CREAR"\)\)\) return denegadoVer/.test(get) && /denyIfNoPermission\(session, "PROVEEDORES", "CREAR"\)/.test(lista.slice(lista.indexOf("export async function POST"))));
  cierto("R01-04: en modo catálogos no se consulta ningún proveedor (la consulta de lista queda reemplazada por vacío) y todo filtra por empresa de la sesión; la exención se evalúa antes de cualquier lectura", /soloCatalogos\s*\n?\s*\? Promise\.resolve\(\{ rows: \[\] as unknown\[\] \}\)/.test(get) && posGet("denegadoVer") < posGet("const db = await obtenerDb()") && posGet("denegadoVer") < posGet("catalogoGeografico(url, db)"));

  // ── PRV-R01-05: precedencia de la versión
  const putSrc = leer("app/api/proveedores/[id]/route.ts");
  const putBloque = putSrc.slice(putSrc.indexOf("export async function PUT"));
  const resultadoPresente = (v: unknown) => { const e = lanza(() => exigirVersionPresente(v)); return e ? e.estado : "ok"; };

  igual("R01-05: la ausencia de versión se informa 409 (antes de normalizar un cuerpo inválido); con versión presente el control pasa a la comparación bajo bloqueo", [resultadoPresente(undefined), resultadoPresente(""), resultadoPresente(V1)], [409, 409, "ok"]);
  cierto("R01-05: en el PUT la presencia de la versión se exige antes de normalizarProveedor y la comparación exacta sigue después del FOR UPDATE", putBloque.indexOf("exigirVersionPresente(body.version)") > 0 && putBloque.indexOf("exigirVersionPresente(body.version)") < putBloque.indexOf("normalizarProveedor(body)") && putBloque.indexOf("FOR UPDATE") < putBloque.indexOf("exigirVersion(body.version, actual.version)"));

  // ── Alcance: sin migraciones nuevas ni cambios en Clientes/Productos funcionales
  cierto("Alcance: ningún archivo de migración nuevo y los controles bancarios/homologación no se tocan (el PUT conserva la guarda de datos gobernados)", /Los datos gobernados no se cambian por la edición común/.test(put) && /Este dato se modifica solo con la acción específica/.test(put));

  return fallos;
}
