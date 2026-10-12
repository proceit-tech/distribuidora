/**
 * Revisión de Listas de Precios y Catálogos comerciales (Tipos de cambio manuales, Canales de venta, Zonas comerciales).
 * Sin base de datos: cálculos puros, validaciones con conexión simulada y análisis del código y de la migración NEX-045.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ajusteMasivo, decimalesMoneda, fechaLocalAIso, formatoMoneda, hoyAsuncion, isoAFechaLocal, margenBruto, normalizarCambio, redondearMoneda, tramosSuperpuestos } from "@/lib/listas-precio/calculos";
import { ErrorComercial, validarCatalogoSimple, validarTipoCambio } from "@/lib/comercial/validacion";
import { formularioComercialSucio, validarFormularioComercial, type FormularioComercial } from "@/lib/comercial/formulario";
import { advertenciasLista, idDeCampo, listaSucia, nuevoItemLista, opcionesConSeleccion, tabDeCampo, validarListaFormulario } from "@/lib/listas-precio/formulario";
import { ErrorLista, prepararLista, validarListaBase, validarReferenciasComerciales } from "@/lib/listas-precio/shared";
import type { NuevaListaPrecio } from "@/types/lista-precio";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";
const ZONA = "33333333-3333-4333-8333-333333333333";
const BASE = "44444444-4444-4444-8444-444444444444";
const LISTA = "55555555-5555-4555-8555-555555555555";

const cuerpo = (extra: Record<string, unknown> = {}) => ({ nombre: "Mayorista", vigenteDesde: "2026-10-12", ...extra });

const lanza = (f: () => unknown) => {
  try {
    f();

    return null;
  } catch (e) {
    return e as { message: string; campo?: string | null };
  }
};

export async function verificarCasosListasComerciales(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Margen (LP-16/17): bruto sobre el precio, sin 0 falso ni Infinity
  igual("margen de la captura real: 180.000 de costo y 336.000 de venta = 46,43 %", margenBruto(336000, 180000), 46.43);
  igual("precio igual al costo: 0 %", margenBruto(100, 100), 0);
  igual("precio menor que el costo: margen negativo", margenBruto(80, 100), -25);
  igual("precio 0 con costo > 0: sin margen (no Infinity)", margenBruto(0, 100), null);
  igual("costo 0: sin margen definido (no 100 % ni 0 %)", margenBruto(100, 0), null);
  igual("precio y costo 0: sin margen", margenBruto(0, 0), null);
  igual("valores no finitos: sin margen", [margenBruto(Number.NaN, 5), margenBruto(10, Number.POSITIVE_INFINITY)], [null, null]);
  igual("precio negativo: sin margen", margenBruto(-5, 3), null);

  // ── Moneda: precisión y formato
  igual("PYG sin decimales, USD/BRL/EUR con 2", [decimalesMoneda("PYG"), decimalesMoneda("USD"), decimalesMoneda("brl")], [0, 2, 2]);
  igual("redondeo PYG (mitad hacia arriba) y USD", [redondearMoneda(1234.5, "PYG"), redondearMoneda(1.005, "USD"), redondearMoneda(2.345, "USD")], [1235, 1.01, 2.35]);
  igual("nunca -0", Object.is(redondearMoneda(-0.2, "PYG"), -0), false);
  igual("formato es-PY por moneda", [formatoMoneda(1234567, "PYG"), formatoMoneda(1234.5, "USD")], ["1.234.567", "1.234,50"]);

  // ── Ajuste masivo (LP-18): desde el precio base, no acumula, no toca descuentos, omite sin base
  const items = [{ precioBase: 10000 }, { precioBase: 0 }, { precioBase: 333 }];
  const menos10 = ajusteMasivo(items, -10, "PYG");
  const mas5 = ajusteMasivo(items, 5, "PYG");

  igual("-10 % desde el precio base, redondeado a la moneda; el de base 0 se omite y se informa", menos10, { aplicados: 2, omitidosSinBase: 1, precios: [9000, null, 300] });
  igual("+5 % positivo", mas5.precios, [10500, null, 350]);
  igual("repetir el ajuste da el mismo resultado (no acumula)", ajusteMasivo(items, -10, "PYG").precios, menos10.precios);
  igual("en USD conserva 2 decimales", ajusteMasivo([{ precioBase: 19.99 }], 10, "USD").precios, [21.99]);
  igual("el precio nunca es negativo", ajusteMasivo([{ precioBase: 50 }], -150, "PYG").precios, [0]);
  igual("sin productos: nada que aplicar", ajusteMasivo([], 5, "PYG"), { aplicados: 0, omitidosSinBase: 0, precios: [] });

  // ── Escalones
  igual("escalones contiguos sin solape", tramosSuperpuestos([{ cantidadMinima: 1, cantidadMaxima: 9 }, { cantidadMinima: 10, cantidadMaxima: null }]), []);
  igual("escalones que se solapan", tramosSuperpuestos([{ cantidadMinima: 1, cantidadMaxima: 10 }, { cantidadMinima: 10, cantidadMaxima: 20 }, { cantidadMinima: 50, cantidadMaxima: null }]), [0, 1]);
  igual("dos tramos abiertos se solapan", tramosSuperpuestos([{ cantidadMinima: 1, cantidadMaxima: null }, { cantidadMinima: 5, cantidadMaxima: null }]), [0, 1]);

  // ── Fechas (LP-11) y cotización manual
  igual("hoy en Asunción cerca de la medianoche UTC no salta de día", hoyAsuncion(new Date("2026-10-13T01:30:00Z")), "2026-10-12");
  igual("dd/mm/aaaa ↔ ISO", [fechaLocalAIso("12/10/2026"), isoAFechaLocal("2026-10-12"), fechaLocalAIso("2026-10-12")], ["2026-10-12", "12/10/2026", "2026-10-12"]);
  igual("fechas imposibles o mal formadas se rechazan", [fechaLocalAIso("31/02/2026"), fechaLocalAIso("12/13/2026"), fechaLocalAIso("hoy"), fechaLocalAIso("")], [null, null, null, null]);
  igual("cotización: formatos es-PY y punto decimal", [normalizarCambio("7350"), normalizarCambio("7.350,50"), normalizarCambio("7350,5"), normalizarCambio("7.350"), normalizarCambio("7350.25"), normalizarCambio("0,000001")], ["7350", "7350.50", "7350.5", "7350", "7350.25", "0.000001"]);
  igual("cotización inválida: vacío, 0, negativo, letras, 7 decimales, doble coma", [normalizarCambio(""), normalizarCambio("0"), normalizarCambio("-5"), normalizarCambio("abc"), normalizarCambio("1,0000001"), normalizarCambio("1,2,3")], [null, null, null, null, null, null]);

  // ── Tipos de cambio: validación (decisión: Fecha, Moneda, Cambio; manual; PYG por 1 unidad)
  const tc = (d: Record<string, unknown>) => lanza(() => validarTipoCambio(d));

  igual("tipo de cambio válido", validarTipoCambio({ fecha: "12/10/2026", monedaCodigo: "usd", cambio: "7.350,5" }), { fecha: "2026-10-12", monedaCodigo: "USD", cambio: "7350.5" });
  igual("fecha obligatoria y válida", [tc({ monedaCodigo: "USD", cambio: "1" })?.campo, tc({ fecha: "31/02/2026", monedaCodigo: "USD", cambio: "1" })?.campo], ["fecha", "fecha"]);
  igual("moneda obligatoria y distinta de PYG (cotización base = 1)", [tc({ fecha: "12/10/2026", cambio: "1" })?.campo, tc({ fecha: "12/10/2026", monedaCodigo: "PYG", cambio: "1" })?.campo], ["monedaCodigo", "monedaCodigo"]);
  igual("cotización positiva obligatoria", [tc({ fecha: "12/10/2026", monedaCodigo: "USD", cambio: "0" })?.campo, tc({ fecha: "12/10/2026", monedaCodigo: "USD", cambio: "-3" })?.campo, tc({ fecha: "12/10/2026", monedaCodigo: "USD" })?.campo], ["cambio", "cambio", "cambio"]);
  igual("error tipado con campo", tc({ fecha: "12/10/2026", monedaCodigo: "USD", cambio: "x" }) instanceof ErrorComercial, true);
  igual("canales/zonas: código y nombre obligatorios con límites", [lanza(() => validarCatalogoSimple({ nombre: "A" }))?.campo, lanza(() => validarCatalogoSimple({ codigo: "A" }))?.campo, lanza(() => validarCatalogoSimple({ codigo: "x".repeat(41), nombre: "A" }))?.campo, lanza(() => validarCatalogoSimple({ codigo: "A", nombre: "x".repeat(121) }))?.campo], ["codigo", "nombre", "codigo", "nombre"]);
  igual("canal/zona válido conserva el estado indicado", validarCatalogoSimple({ codigo: " CN1 ", nombre: " Mostrador ", activo: false }), { codigo: "CN1", nombre: "Mostrador", activo: false });

  const f0: FormularioComercial = { id: null, codigo: "", nombre: "", fecha: "2026-10-12", monedaCodigo: "", cambio: "", motivo: "" };

  igual("formulario nuevo de cambio: moneda y cambio obligatorios, en orden visual", Object.keys(validarFormularioComercial("cambios", f0)), ["monedaCodigo", "cambio"]);
  igual("corregir solo exige la cotización", Object.keys(validarFormularioComercial("cambios", { ...f0, id: "x", monedaCodigo: "USD" })), ["cambio"]);
  igual("formulario de canal: código y nombre", Object.keys(validarFormularioComercial("canales", f0)), ["codigo", "nombre"]);
  igual("cambios sin guardar en catálogos comerciales", [formularioComercialSucio(f0, f0), formularioComercialSucio({ ...f0, cambio: "7350" }, f0), formularioComercialSucio(null, null)], [false, true, false]);

  // ── Servidor de listas: margen calculado por el servidor, estado/activo coherentes, errores por campo
  const p = (extra: Record<string, unknown>) => ({ productoId: PROD, precioLista: 336000, costoReferencia: 180000, margenPct: 0, ...extra });
  const lista = prepararLista(cuerpo({ estado: "INACTIVA", activo: true, productos: [p({}), p({ productoId: "66666666-6666-4666-8666-666666666666", precioLista: 0, margenPct: 99 })] }));

  igual("el servidor recalcula el margen e ignora el enviado (46,43 y sin dato → 0)", lista.productos.map((x) => x.margen), [46.43, 0]);
  igual("«activo» se deriva del estado (INACTIVA no puede ser activa) y ACTIVA sí", [lista.activo, prepararLista(cuerpo({ estado: "ACTIVA", activo: false })).activo, prepararLista(cuerpo({ estado: "BORRADOR" })).activo], [false, true, false]);
  igual("error de nombre con campo", [lanza(() => prepararLista(cuerpo({ nombre: "" })))?.campo, lanza(() => prepararLista(cuerpo({ vigenteDesde: "" })))?.campo], ["nombre", "vigenteDesde"]);
  igual("vigencia final anterior rechazada en su campo", lanza(() => prepararLista(cuerpo({ vigenteHasta: "2026-01-01" })))?.campo, "vigenteHasta");
  igual("precio negativo, descuento > 100 y cantidad ≤ 0 rechazados con la ruta del campo", [lanza(() => prepararLista(cuerpo({ productos: [p({ precioLista: -1 })] })))?.campo, lanza(() => prepararLista(cuerpo({ productos: [p({ descuentoPct: 101 })] })))?.campo, lanza(() => prepararLista(cuerpo({ productos: [p({ cantidadMinima: 0 })] })))?.campo], ["productos.0.precioLista", "productos.0.descuentoPct", "productos.0.cantidadMinima"]);
  igual("escalón con máximo menor que el mínimo", lanza(() => prepararLista(cuerpo({ productos: [p({ escalas: [{ cantidadMinima: 10, cantidadMaxima: 5, precio: 1 }] })] })))?.campo, "productos.0.escalas.0.cantidadMaxima");
  igual("producto repetido", lanza(() => prepararLista(cuerpo({ productos: [p({}), p({})] })))?.campo, "productos");
  igual("regla no general sin referencia", lanza(() => prepararLista(cuerpo({ reglasComerciales: [{ tipoAplicacion: "ZONA" }] })))?.campo, "reglasComerciales.0.referenciaId");
  igual("regla con tipo inválido y vigencia invertida", [lanza(() => prepararLista(cuerpo({ reglasComerciales: [{ tipoAplicacion: "OTRO" }] })))?.campo, lanza(() => prepararLista(cuerpo({ reglasComerciales: [{ tipoAplicacion: "GENERAL", vigenteDesde: "2026-10-12", vigenteHasta: "2026-01-01" }] })))?.campo], ["reglasComerciales.0.tipoAplicacion", "reglasComerciales.0.vigenteHasta"]);
  igual("regla: descuento máximo y prioridad en rango", [lanza(() => prepararLista(cuerpo({ reglasComerciales: [{ tipoAplicacion: "GENERAL", descuentoMaximoPct: 120 }] })))?.campo, lanza(() => prepararLista(cuerpo({ reglasComerciales: [{ tipoAplicacion: "GENERAL", prioridad: -1 }] })))?.campo], ["reglasComerciales.0.descuentoMaximoPct", "reglasComerciales.0.prioridad"]);
  cierto("ErrorLista es el error tipado de la validación", lanza(() => prepararLista(cuerpo({ nombre: "" }))) instanceof ErrorLista);

  // ── Lista base (misma moneda y tipo; ciclo) y referencias comerciales con conexión simulada
  function conexion(respuestas: Array<[RegExp, Array<Record<string, unknown>>]>) {
    const reg: Array<{ sql: string; parametros: unknown[] }> = [];

    return {
      reg,
      c: {
        async query(sql: string, parametros: unknown[] = []) {
          reg.push({ sql, parametros });
          const r = respuestas.find(([re]) => re.test(sql));

          return { rows: r ? r[1] : [], rowCount: r ? r[1].length : 0 };
        },
      } as never,
    };
  }
  const baseUsd = conexion([[/FROM listas_precio WHERE empresa_id = \$1 AND id = \$2/, [{ tipo_lista: "VENTA", moneda_codigo: "USD" }]]]);
  const campoBase = async (x: ReturnType<typeof conexion>, previo: { baseId: string | null; moneda: string; tipo: string } | null, moneda = "PYG", tipo = "VENTA") =>
    validarListaBase(x.c, EMPRESA, null, BASE, { moneda, tipo, previo }).then(
      () => "ok",
      (e: ErrorLista) => e.campo,
    );

  igual("lista base en otra moneda: rechazada al crear", await campoBase(baseUsd, null), "listaBaseId");
  igual("lista base de otro tipo: rechazada al crear", await campoBase(conexion([[/FROM listas_precio/, [{ tipo_lista: "COMPRA", moneda_codigo: "PYG" }]]]), null), "listaBaseId");
  igual("lista histórica con la misma base/moneda/tipo no se bloquea al editar", await campoBase(baseUsd, { baseId: BASE, moneda: "PYG", tipo: "VENTA" }), "ok");
  igual("cambiar la base en una lista histórica sí exige coherencia", await campoBase(baseUsd, { baseId: null, moneda: "PYG", tipo: "VENTA" }), "listaBaseId");
  igual("misma moneda y tipo: válida", await campoBase(conexion([[/FROM listas_precio/, [{ tipo_lista: "VENTA", moneda_codigo: "PYG" }]]]), null), "ok");
  igual("base inexistente en la empresa", await campoBase(conexion([]), null), "listaBaseId");
  igual("la lista no puede ser su propia base", await validarListaBase(conexion([]).c, EMPRESA, BASE, BASE).then(() => "ok", (e: ErrorLista) => e.campo), "listaBaseId");

  const datosRef = prepararLista(cuerpo({ zonaId: ZONA, reglasComerciales: [{ tipoAplicacion: "ZONA", referenciaId: ZONA }] }));
  const ref = async (x: ReturnType<typeof conexion>, listaId: string | null) => validarReferenciasComerciales(x.c, EMPRESA, listaId, datosRef).then(() => "ok", (e: ErrorLista) => e.campo);

  igual("referencia inexistente o de otra empresa: rechazada en su campo", await ref(conexion([]), null), "zonaId");
  igual("zona inactiva y nueva: rechazada", await ref(conexion([[/FROM zonas_comerciales/, [{ activo: false }]]]), null), "zonaId");
  igual("zona inactiva que la lista YA tenía: se conserva (cabecera y regla)", await ref(conexion([[/FROM listas_precio/, [{ zona_comercial_id: ZONA }]], [/FROM lista_precio_reglas/, [{ referencia_id: ZONA }]], [/FROM zonas_comerciales/, [{ activo: false }]]]), LISTA), "ok");
  igual("zona activa: válida", await ref(conexion([[/FROM zonas_comerciales/, [{ activo: true }]]]), null), "ok");
  const consulta = conexion([[/FROM zonas_comerciales/, [{ activo: true }]]]);

  await ref(consulta, null);
  cierto("las referencias se consultan siempre con la empresa de la sesión", consulta.reg.filter((q) => /FROM zonas_comerciales/.test(q.sql)).every((q) => /empresa_id = \$2/.test(q.sql) && q.parametros[1] === EMPRESA));

  // ── Formulario: validación por campo, advertencias, alta de ítems
  const nueva = (extra: Partial<NuevaListaPrecio> = {}): NuevaListaPrecio => ({ ...prepararFormulario(), ...extra });

  function prepararFormulario(): NuevaListaPrecio {
    return {
      codigo: "", nombre: "Mayorista", descripcion: "", tipo: "VENTA", monedaCodigo: "PYG", estado: "ACTIVA", modoPrecio: "PRECIO_FIJO", incluyeIva: true,
      listaBaseId: "", listaBaseCodigo: "", listaBaseNombre: "", ajusteGeneralPct: 0, vigenteDesde: "2026-10-12", vigenteHasta: "", prioridad: 10,
      permiteDescuentoAdicional: true, descuentoMaximoPct: 5, grupoClienteId: "", grupoClienteNombre: "", clienteId: "", clienteCodigo: "", clienteNombre: "",
      zonaId: "", zonaNombre: "", canalVentaId: "", canalVentaNombre: "", productos: [], reglasComerciales: [], activo: true, observacion: "",
    };
  }
  const catalogoProducto = { id: PROD, codigo: "P-1", descripcion: "Leche", unidadMedidaId: "u", unidadMedidaNombre: "Unidad", costoPromedio: 180000.4, precioReferencia: 336000 as number | null };
  const ctx = { monedaLista: "PYG", monedaBase: "PYG", vigenteDesde: "2026-10-12", vigenteHasta: "", id: "i1" };

  igual("lista válida: sin errores", validarListaFormulario(nueva()), {});
  igual("nombre y vigencia obligatorios, en ese orden", Object.keys(validarListaFormulario(nueva({ nombre: " ", vigenteDesde: "" }))), ["nombre", "vigenteDesde"]);
  const item = nuevoItemLista(catalogoProducto, ctx);

  igual("alta de ítem con precio de referencia: costo/precio redondeados a PYG y margen calculado (no 0 %)", [item.costoReferencia, item.precioLista, item.margenPct], [180000, 336000, 46.43]);
  const sinRef = nuevoItemLista({ ...catalogoProducto, precioReferencia: null }, ctx);

  igual("sin precio de referencia: precio 0, NUNCA el costo, y margen 0", [sinRef.precioLista, sinRef.precioBase, sinRef.costoReferencia, sinRef.margenPct], [0, 0, 180000, 0]);
  const otraMoneda = nuevoItemLista(catalogoProducto, { ...ctx, monedaLista: "USD" });

  igual("lista en otra moneda: no se copian costo ni precio (sin conversión aprobada)", [otraMoneda.costoReferencia, otraMoneda.precioLista, otraMoneda.monedaCodigo], [0, 0, "USD"]);
  igual("advertencia de activos sin precio", advertenciasLista(nueva({ productos: [item, sinRef, { ...sinRef, id: "i3", activo: false }] })).sinPrecio, 1);
  igual("advertencia de escalones superpuestos", advertenciasLista(nueva({ productos: [{ ...item, escalas: [{ id: "a", cantidadMinima: 1, cantidadMaxima: 10, precio: 1, descuentoPct: 0 }, { id: "b", cantidadMinima: 5, cantidadMaxima: null, precio: 1, descuentoPct: 0 }] }] })).escalonesSuperpuestos, [0]);
  const malos = validarListaFormulario(nueva({ productos: [{ ...item, precioLista: -1, cantidadMinima: 0, escalas: [{ id: "a", cantidadMinima: 5, cantidadMaxima: 2, precio: 0, descuentoPct: 0 }] }], reglasComerciales: [{ id: "r", tipoAplicacion: "CLIENTE", referenciaId: "", referenciaCodigo: "", referenciaNombre: "", prioridad: 1, cantidadMinima: 1, permiteDescuentoAdicional: true, descuentoMaximoPct: 0, vigenteDesde: "", vigenteHasta: "", activo: true }] }));

  igual("errores por ruta de campo en productos, escalones y reglas", Object.keys(malos), ["productos.0.precioLista", "productos.0.cantidadMinima", "productos.0.escalas.0.cantidadMaxima", "reglasComerciales.0.referenciaId"]);
  igual("cada error pertenece a su pestaña", [tabDeCampo("nombre"), tabDeCampo("productos.2.precioLista"), tabDeCampo("reglasComerciales.0.referenciaId"), tabDeCampo("zonaId"), tabDeCampo("listaBaseId")], ["informacion", "productos", "reglas", "reglas", "informacion"]);
  igual("id de elemento estable para enfocar", idDeCampo("productos.2.precioLista"), "lp-productos-2-precioLista");
  igual("opciones: activas más la seleccionada aunque esté inactiva (y respaldo si no vino del catálogo)", [opcionesConSeleccion([{ id: "a", activo: true }, { id: "b", activo: false }, { id: "c", activo: false }], "b").map((o) => o.id), opcionesConSeleccion([{ id: "a", activo: true }], "z", { id: "z" }).map((o) => o.id)], [["a", "b"], ["a", "z"]]);
  igual("cambios sin guardar de la lista", [listaSucia(nueva(), JSON.stringify(nueva())), listaSucia(nueva({ nombre: "Otra" }), JSON.stringify(nueva())), listaSucia(null, "x")], [false, true, false]);

  // ── Migración NEX-045
  const m = leer("documentacao/banco/nexit/v1/migraciones/NEX-045-catalogos-comerciales-tipos-cambio.sql");
  const sql = sinComentarios(m);
  const r = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-045.sql");

  cierto("NEX-045: tipos_cambio por empresa, cotización > 0, moneda ≠ PYG, versión y FK de usuarios por empresa", /CREATE TABLE public\.tipos_cambio/.test(sql) && /empresa_id\s+uuid\s+NOT NULL REFERENCES public\.empresas/.test(sql) && /CHECK \(cambio > 0\)/.test(sql) && /moneda_codigo <> 'PYG'/.test(sql) && /UNIQUE \(empresa_id, fecha, moneda_codigo, version\)/.test(sql) && /FOREIGN KEY \(empresa_id, creado_por\) REFERENCES public\.usuarios \(empresa_id, id\)/.test(sql));
  cierto("NEX-045: una sola cotización vigente por empresa/fecha/moneda (índice parcial) y el historial se conserva", /CREATE UNIQUE INDEX tipos_cambio_vigente_uq ON public\.tipos_cambio \(empresa_id, fecha, moneda_codigo\) WHERE vigente/.test(sql));
  cierto("NEX-045: inmutable (solo retirar), sin DELETE ni TRUNCATE, grants SELECT/INSERT y UPDATE solo de columnas de retiro", /tipos_cambio solo admite retirar/.test(sql) && /BEFORE UPDATE OR DELETE ON public\.tipos_cambio/.test(sql) && /BEFORE TRUNCATE ON public\.tipos_cambio/.test(sql) && /GRANT SELECT, INSERT ON public\.tipos_cambio TO nexit_runtime/.test(sql) && /GRANT UPDATE \(vigente, retirado_por, retirado_at\) ON public\.tipos_cambio/.test(sql) && !/GRANT[^;]*DELETE/.test(sql));
  cierto("NEX-045: canales y zonas reutilizados (sin tablas ni columnas nuevas), INSERT/UPDATE sin DELETE y unicidad solo si no hay duplicados", !/CREATE TABLE public\.(canales_venta|zonas_comerciales)/.test(sql) && !/ALTER TABLE/.test(sql) && /GRANT SELECT, INSERT, UPDATE ON public\.canales_venta, public\.zonas_comerciales/.test(sql) && /nombres o códigos duplicados[\s\S]*no se modifican datos/.test(m) && (sql.match(/CREATE UNIQUE INDEX/g) ?? []).length === 5);
  cierto("NEX-045: no modifica datos existentes ni convierte precios", !/\b(UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s+TABLE|INSERT\s+INTO)\b/.test(sql.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, "")));
  cierto("NEX-045: el envoltorio de grants llama a base + proveedores + fiscal + productos + comercial (resistente a la reaplicación) y exige las migraciones previas", /PERFORM public\.nex_aplicar_grants_runtime_base\(\);\s*PERFORM public\.nex_aplicar_grants_proveedores\(\);\s*PERFORM public\.nex_aplicar_grants_fiscal\(\);\s*PERFORM public\.nex_aplicar_grants_productos\(\);\s*PERFORM public\.nex_aplicar_grants_comercial\(\);/.test(sql) && /requiere NEX-037, NEX-039 y NEX-041/.test(m) && /NEX-045 parece aplicada/.test(m) && /SELECT public\.nex_aplicar_grants_comercial\(\);\s*$/.test(sql));
  cierto("reversión NEX-045: aborta si hay cotizaciones, restaura el envoltorio de NEX-041 y devuelve solo lectura a canales/zonas", /tipos_cambio\) THEN\s+RAISE EXCEPTION/.test(r) && /nex_aplicar_grants_productos\(\);\s*END \$\$;\s*DROP FUNCTION IF EXISTS public\.nex_aplicar_grants_comercial/.test(r) && /GRANT SELECT ON public\.canales_venta, public\.zonas_comerciales TO nexit_runtime/.test(r));
  cierto("migraciones en orden (…044 → 045)", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-04[45]/.test(f)).sort().join(",") === "NEX-044-familias-categoria-jerarquia.sql,NEX-045-catalogos-comerciales-tipos-cambio.sql");
  cierto("no existía otra estructura cambiaria en las migraciones v1 (se creó una sola tabla)", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => !/NEX-045/.test(f) && /^NEX-/.test(f)).every((f) => !/CREATE TABLE[^;(]*(tipos?_cambio|tasas?_cambio|cotizacion_moneda)/i.test(leer(`documentacao/banco/nexit/v1/migraciones/${f}`))));

  // ── Servidor y pantallas (análisis del código)
  const srv = leer("lib/comercial/servidor.ts");
  const pagina = leer("app/(private)/catalogos-comerciales/page.tsx");
  const form = leer("app/(private)/listas-precio/_components/lista-precio-form.tsx");
  const listaApi = leer("app/api/listas-precio/route.ts");
  const menu = leer("lib/navigation/menu.ts");

  cierto("servidor comercial: empresa y usuario siempre de la sesión, permisos LISTAS_PRECIO VER/CREAR/EDITAR, sin DELETE", /b\.session\.user\.empresaId/.test(srv) && !/cuerpo\.empresa/.test(srv) && ["VER", "CREAR", "EDITAR"].every((a) => srv.includes(`preparar("${a}")`)) && /denyIfNoPermission\(session, "LISTAS_PRECIO", accion\)/.test(srv) && !/DELETE FROM/.test(srv));
  cierto("tipos de cambio: duplicado vigente → 409, bloqueo por empresa+fecha+moneda, corregir = retirar + nueva versión, anular conserva el historial", /pg_advisory_xact_lock/.test(srv) && /Ya existe una cotización vigente para esa fecha y moneda/.test(srv) && /SET vigente = false, retirado_por/.test(srv) && /Number\(a\.version\) \+ 1/.test(srv) && !/UPDATE tipos_cambio SET cambio/.test(srv));
  cierto("tipos de cambio: PYG excluido del selector y sin conversión automática de precios ni integraciones externas", /codigo <> 'PYG'/.test(srv) && !/fetch\(|https?:\/\//.test(srv) && !/precio_lista|costo_referencia/.test(srv));
  cierto("canales/zonas: unicidad por nombre y código dentro de la empresa y vínculos contados con listas y reglas", /lower\(btrim\(nombre\)\)/.test(srv) && /lower\(btrim\(codigo\)\)/.test(srv) && /FROM listas_precio l WHERE/.test(srv) && /FROM lista_precio_reglas r WHERE/.test(srv));
  cierto("rutas: canales, zonas y tipos de cambio (con corregir y anular) bajo /api/catalogos-comerciales", ["canales-venta/route.ts", "canales-venta/[id]/route.ts", "zonas/route.ts", "zonas/[id]/route.ts", "tipos-cambio/route.ts", "tipos-cambio/[id]/route.ts", "tipos-cambio/[id]/anular/route.ts"].every((f) => leer(`app/api/catalogos-comerciales/${f}`).length > 50));
  cierto("menú único «Catálogos comerciales» protegido por LISTAS_PRECIO.VER y página con las tres pestañas", /label: "Catálogos comerciales"/.test(menu) && /href: "\/catalogos-comerciales"/.test(menu) && ["Tipos de cambio", "Canales de venta", "Zonas comerciales"].every((t) => pagina.includes(`label: "${t}"`)) && /guardPage\("LISTAS_PRECIO", "VER"\)/.test(leer("app/(private)/catalogos-comerciales/layout.tsx")));
  cierto("pantalla comercial: solo Fecha, Moneda y Cambio visibles (motivo únicamente al corregir), cambios sin guardar, errores por campo, anular con confirmación", /Cambio <b>\*<\/b>/.test(pagina) && /corrigiendo \? \(/.test(pagina) && /beforeunload/.test(pagina) && /aria-invalid/.test(pagina) && /window\.confirm\(`¿Anular/.test(pagina) && !/Compra|Venta|Fuente/.test(pagina.replace(/Canales de venta|canal de venta|Nuevo canal de venta/g, "")));
  cierto("selectores de listas: zonas y canales reales (con inactivos solo si ya estaban seleccionados)", /FROM zonas_comerciales WHERE empresa_id = \$1 ORDER BY nombre/.test(listaApi) && /FROM canales_venta WHERE empresa_id = \$1 ORDER BY nombre/.test(listaApi) && /opcionesConSeleccion\(catalogo\?\.zonas/.test(form) && /opcionesConSeleccion\(catalogo\?\.canales/.test(form));
  cierto("formulario de listas: sin aviso de código automático, sin «Lista activa» duplicada, sin encabezados redundantes", !/Código automático|El código LP-XXX|Lista activa|FICHA DE PRECIOS|NUEVA LISTA|Defina precios, vigencia/.test(form));
  cierto("formulario de listas: fechas locales (no UTC), el costo nunca es precio de venta y el margen sale de la función única", !/toISOString\(\)\.slice/.test(form) && !/precioReferencia \?\? producto\.costoPromedio/.test(form) && !/Math\.round\(\s*precio/.test(form) && /margenBruto\(/.test(form) && /hoyAsuncion\(\)/.test(form) && /CampoFecha/.test(form));
  cierto("formulario de listas: protección de cambios no guardados (salir, cancelar, beforeunload), errores por campo con pestaña y foco, confirmación del ajuste masivo", /confirmarSalida/.test(form) && /beforeunload/.test(form) && /mostrarErrores/.test(form) && /setTab\(tabDeCampo\(primero\)\)/.test(form) && /window\.confirm\(texto\)/.test(form));
  cierto("el ajuste masivo no modifica descuentos (sin descuentoPct en la función)", !/aplicarAjuste[\s\S]{0,900}descuentoPct/.test(form.slice(form.indexOf("function aplicarAjuste"), form.indexOf("function cambiarProducto"))));

  return fallos;
}
