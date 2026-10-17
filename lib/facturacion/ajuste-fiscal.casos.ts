/**
 * PRO-93 Fase A — ajuste fiscal de ítems en la propia factura, «Guardar también en Productos» y diagnóstico del punto de expedición. Sin red y sin PostgreSQL: base simulada que
 * responde por el texto de cada consulta; lo que se prueba es la lógica del servidor (permisos, validaciones, qué llega al payload inmutable, qué se escribe y qué NO) y la
 * estructura de la migración NEX-056 y de la pantalla. La migración y la sentencia atómica de guardado NO se ejecutaron en PostgreSQL por esta suite.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { limpiarCacheTokens } from "@/lib/facturacion/gateway";
import { emitirFactura } from "@/lib/facturacion/envio";
import { AJUSTE_VACIO, ajusteParaEnvio, leerAjuste, problemasFiscales, productoIncompleto, valoresEfectivos, type ProductoBase } from "@/lib/facturacion/ajuste-item";
import { guardarClasificacionIva } from "@/lib/facturacion/ajuste-fiscal";
import { catalogosFactura, crearFacturaElectronica, leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const PRODUCTO = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const cuerpoBase = (lineas: unknown[]) => ({ claveIdempotencia: "clave-de-prueba-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas });
const filaCliente = { codigo: "CLI-000001", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "EMPRESA SINTETICA SA", nombre_fantasia: null, email: "a@b.com", email_copia: null, email_facturacion: null, telefono: null, celular: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
const completo = { id: PRODUCTO, codigo: "P-1", descripcion: "Producto de prueba", unidadSifen: 77, unidadSimbolo: "UNI", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };
const incompleto = { ...completo, unidadSifen: null, unidadSimbolo: null, unidadVigente: null, afectacion: null, tasa: null, precio: null, monedaPrecio: null };

type Llamada = { sql: string; parametros: unknown[] };
type Opciones = { producto?: Record<string, unknown>; permisos?: string[]; unidades?: Array<{ codigo: number; representacion: string; vigente: boolean }> };

function baseSimulada(o: Opciones = {}) {
  const llamadas: Llamada[] = [];
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      llamadas.push({ sql, parametros });
      if (/usuario_tiene_permiso/.test(sql)) {
        // El permiso llega por parámetros (ajuste fiscal, editar productos) o como literales del SQL (permiso de precio).
        const lit = /'([A-Z_]+)',\s*'([A-Z_]+)'\)/.exec(sql);
        const codigo = parametros.length >= 4 ? `${String(parametros[2])}.${String(parametros[3])}` : lit ? `${lit[1]}.${lit[2]}` : "";

        return { rows: [{ ok: (o.permisos ?? []).includes(codigo) }], rowCount: 1 };
      }
      if (/FROM unidades_medida_sifen WHERE codigo = ANY/.test(sql)) return { rows: (o.unidades ?? []).filter((u) => (parametros[0] as number[]).includes(u.codigo)), rowCount: 1 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql) && !/WITH ant AS/.test(sql)) return { rows: [o.producto ?? completo], rowCount: 1 };
      if (/fe_documento_crear_fe/.test(sql)) return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: false }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  };

  return { db: db as never, llamadas, escrituras: () => llamadas.filter((l) => /fe_documento_crear_fe|WITH ant AS|INSERT INTO|UPDATE /.test(l.sql)) };
}

const PERMISO_AJUSTE = "FACTURACION_ELECTRONICA.AJUSTE_FISCAL";
const PERMISO_PRECIO = "FACTURACION_ELECTRONICA.PRECIO";
const PERMISO_PRODUCTOS = "PRODUCTOS.EDITAR";
const UNIDADES = [{ codigo: 77, representacion: "UNI", vigente: true }, { codigo: 83, representacion: "kg", vigente: true }, { codigo: 99, representacion: "OLD", vigente: false }];

export async function verificarCasosAjusteFiscal(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const resultado = async (p: Promise<unknown>) => {
    try { await p; return "OK"; } catch (e) { return e instanceof ErrorValidacionFiscal ? `${e.estado}:${e.detalles.join("|")}` : e instanceof ErrorFacturacion ? `${e.estado}:${e.message}` : `ERR:${String(e)}`; }
  };
  const preparar = (o: Opciones, lineas: unknown[]) => { const b = baseSimulada(o); const c = leerCuerpoFactura(cuerpoBase(lineas)); return { b, p: typeof c === "string" ? Promise.reject(new Error(c)) : prepararFactura(b.db, EMPRESA, USUARIO, c) }; };
  const linea = (extra: Record<string, unknown> = {}) => ({ productoId: PRODUCTO, cantidad: "1", ...extra });
  const base = (p: Record<string, unknown> = completo): ProductoBase => p as unknown as ProductoBase;

  // ── Forma del ajuste (leerAjuste / leerCuerpoFactura)
  igual("forma: ajuste válido completo (unidad, IVA, descripción, GTIN, guardar) y ajuste vacío/ausente", [
    leerAjuste({ unidadSifen: 77, afectacion: 4, tasa: 10, proporcion: "50", descripcion: " Servicio ", gtin: "7791234567890", guardarClasificacion: true }), leerAjuste({}), leerAjuste(undefined), leerAjuste(null),
  ], [{ unidadSifen: 77, afectacion: 4, tasa: 10, proporcion: "50", descripcion: "Servicio", gtin: "7791234567890", guardarClasificacion: true }, undefined, undefined, undefined]);
  igual("forma: valores inválidos se rechazan con mensaje (campo no admitido, unidad 0/6 dígitos, afectación 5, tasa 7, proporción mal formada, descripción vacía o >120, GTIN corto, guardar no booleano)", [
    { x: 1 }, { unidadSifen: 0 }, { unidadSifen: 100000 }, { afectacion: 5, tasa: 10 }, { afectacion: 1, tasa: 7 }, { afectacion: 4, tasa: 10, proporcion: "abc" }, { descripcion: "  " }, { descripcion: "x".repeat(121) }, { gtin: "123" }, { guardarClasificacion: "si" }, [], "texto",
  ].map((x) => typeof leerAjuste(x)), Array(12).fill("string"));
  igual("forma: la clasificación de IVA viaja COMPLETA — afectación sin tasa, tasa sin afectación, parcial sin proporción, proporción sin parcial, y «guardar» sin IVA se rechazan", [
    { afectacion: 1 }, { tasa: 10 }, { afectacion: 4, tasa: 10 }, { afectacion: 1, tasa: 10, proporcion: "50" }, { guardarClasificacion: true }, { afectacion: 1, tasa: 10 }, { afectacion: 3, tasa: 0, proporcion: null },
  ].map((x) => typeof leerAjuste(x)), ["string", "string", "string", "string", "string", "object", "object"]);
  igual("forma: leerCuerpoFactura conserva el ajuste válido por línea, rechaza uno inválido y sigue ignorando IVA/afectación/total/empresa sueltos del navegador", [
    (leerCuerpoFactura(cuerpoBase([linea({ ajuste: { unidadSifen: 83 } })])) as { lineas: Array<{ ajuste?: unknown }> }).lineas[0].ajuste, typeof leerCuerpoFactura(cuerpoBase([linea({ ajuste: { unidadSifen: 0 } })])),
    JSON.stringify(leerCuerpoFactura(cuerpoBase([linea({ afectacion: 3, tasa: 0, empresaId: "otra" })]))).includes("otra"),
  ], [{ unidadSifen: 83 }, "string", false]);

  // ── Valores efectivos y pendientes en el navegador (módulo puro)
  const p0 = base(incompleto);
  const ajusteCompleto = { ...AJUSTE_VACIO, unidadSifen: "77", afectacion: "1", tasa: "10" };

  igual("efectivos: un producto incompleto tiene pendientes (IVA, unidad y precio); con unidad + IVA + precio en la línea no queda ninguno", [
    productoIncompleto(p0), problemasFiscales(p0, AJUSTE_VACIO, ""), problemasFiscales(p0, ajusteCompleto, "11000"), productoIncompleto(base()),
  ], [true, ["sin clasificación de IVA", "sin unidad de medida SIFEN", "sin precio de venta en guaraníes"], [], false]);
  igual("efectivos: coherencia de IVA en la línea — tasa faltante, tasa 5/10 para gravado, 0 para exento, proporción para parcial", [
    problemasFiscales(base(), { ...AJUSTE_VACIO, afectacion: "1" }, "100"), problemasFiscales(base(), { ...AJUSTE_VACIO, afectacion: "1", tasa: "0" }, "100"), problemasFiscales(base(), { ...AJUSTE_VACIO, afectacion: "3", tasa: "10" }, "100"),
    problemasFiscales(base(), { ...AJUSTE_VACIO, afectacion: "4", tasa: "10" }, "100"), problemasFiscales(base(), { ...AJUSTE_VACIO, afectacion: "4", tasa: "10", proporcion: "50" }, "100"),
  ], [["falta la tasa de IVA"], ["la tasa de IVA debe ser 5 % o 10 %"], ["exonerado/exento lleva tasa 0 %"], ["falta la proporción gravada (mayor que 0 y menor que 100)"], []]);
  igual("envío: solo viaja lo que cambió respecto del cadastro; sin cambios no hay ajuste; «guardar» solo acompaña a un cambio de IVA", [
    ajusteParaEnvio(base(), AJUSTE_VACIO), ajusteParaEnvio(base(), { ...AJUSTE_VACIO, afectacion: "1", tasa: "10", guardar: true }), ajusteParaEnvio(base(), { ...AJUSTE_VACIO, afectacion: "3", tasa: "0", guardar: true }),
    ajusteParaEnvio(base(incompleto), ajusteCompleto), ajusteParaEnvio(base(), { ...AJUSTE_VACIO, descripcion: "Otra", gtinModo: "informar", gtin: "7791234567890" }), valoresEfectivos(base(), { ...AJUSTE_VACIO, unidadSifen: "83" }).unidadSifen,
  ], [undefined, undefined, { afectacion: 3, tasa: 0, proporcion: null, guardarClasificacion: true }, { unidadSifen: 77, afectacion: 1, tasa: 10, proporcion: null }, { descripcion: "Otra", gtin: "7791234567890" }, 83]);

  // ── Servidor: permisos, validaciones y payload
  const sinPermiso = preparar({ producto: incompleto, permisos: [PERMISO_PRECIO] }, [linea({ precio: "11000", ajuste: { unidadSifen: 77, afectacion: 1, tasa: 10 } })]);

  igual("servidor: ajustar sin FACTURACION_ELECTRONICA.AJUSTE_FISCAL → 403 y no se escribe nada", [(await resultado(sinPermiso.p)).slice(0, 4), sinPermiso.b.escrituras().length], ["403:", 0]);

  const conPermiso = baseSimulada({ producto: incompleto, permisos: [PERMISO_AJUSTE, PERMISO_PRECIO], unidades: UNIDADES });
  const cuerpoOk = leerCuerpoFactura(cuerpoBase([linea({ precio: "11000", ajuste: { unidadSifen: 83, afectacion: 1, tasa: 10, descripcion: "Producto fiscal", gtin: "7791234567890" } })])) as never;
  const prep = await prepararFactura(conPermiso.db, EMPRESA, USUARIO, cuerpoOk);
  const payloadPrep = prep.payload as unknown as { Detalles: Array<Record<string, unknown>>; Subtotales: Array<Record<string, unknown>> };
  const det = payloadPrep.Detalles[0];

  igual("servidor: producto incompleto + ajuste + precio con permisos → el payload usa unidad 83, IVA gravado 10 %, descripción y GTIN de la línea, precio 11000 y total/IVA calculados por el motor FAT-E1", [
    det.cUniMed, det.iAfecIVA, det.dTasaIVA, det.dDesProSer, det.dGtin, det.dPUniProSer, payloadPrep.Subtotales[0].dTotGralOpe, payloadPrep.Subtotales[0].dIVA10,
  ], [83, 1, 10, "Producto fiscal", "7791234567890", 11000, 11000, 1000]);
  igual("servidor: el resumen informa los campos ajustados y la unidad elegida; ningún ajuste pidió guardar → nada para guardar en Productos", [prep.resumen.lineas[0].ajustes, prep.resumen.lineas[0].unidad, prep.guardar.length, conPermiso.escrituras().length], [["unidad SIFEN", "IVA", "descripción fiscal", "GTIN"], "kg", 0, 0]);
  igual("servidor: la previa no escribe nada (ni número, ni documento, ni cadastro)", conPermiso.llamadas.filter((l) => /fe_documento_crear_fe|INSERT INTO|UPDATE |WITH ant AS/.test(l.sql)).length, 0);
  igual("servidor: producto SIN precio de lista en guaraníes — sin precio en la línea → 422; con precio pero sin permiso de precio → 403; precio en la línea con permiso → se factura", [
    (await resultado(preparar({ producto: incompleto, permisos: [PERMISO_AJUSTE], unidades: UNIDADES }, [linea({ ajuste: { unidadSifen: 77, afectacion: 1, tasa: 10 } })]).p)).slice(0, 4),
    (await resultado(preparar({ producto: incompleto, permisos: [PERMISO_AJUSTE], unidades: UNIDADES }, [linea({ precio: "5000", ajuste: { unidadSifen: 77, afectacion: 1, tasa: 10 } })]).p)).slice(0, 4),
    await resultado(preparar({ producto: incompleto, permisos: [PERMISO_AJUSTE, PERMISO_PRECIO], unidades: UNIDADES }, [linea({ precio: "5000", ajuste: { unidadSifen: 77, afectacion: 1, tasa: 10 } })]).p),
  ], ["422:", "403:", "OK"]);
  igual("servidor: precio de lista en OTRA moneda no se toma como guaraníes (hay que informar el precio en la línea)", (await resultado(preparar({ producto: { ...completo, monedaPrecio: "USD", precio: "10" }, permisos: [] }, [linea()]).p)).slice(0, 4), "422:");
  igual("servidor: unidad inexistente o no vigente en el catálogo oficial → 422 (ni se infiere ni se crea)", [
    (await resultado(preparar({ producto: incompleto, permisos: [PERMISO_AJUSTE, PERMISO_PRECIO], unidades: UNIDADES }, [linea({ precio: "5000", ajuste: { unidadSifen: 55, afectacion: 1, tasa: 10 } })]).p)).includes("no existe en el catálogo"),
    (await resultado(preparar({ producto: incompleto, permisos: [PERMISO_AJUSTE, PERMISO_PRECIO], unidades: UNIDADES }, [linea({ precio: "5000", ajuste: { unidadSifen: 99, afectacion: 1, tasa: 10 } })]).p)).includes("no está vigente"),
  ], [true, true]);
  igual("servidor: la validación fiscal sigue mandando — exento con tasa 10, gravado parcial sin proporción válida, GTIN con dígitos inválidos en el cadastro, y 77 (unidad) con cantidad fraccionaria se rechazan", [
    (await resultado(preparar({ permisos: [PERMISO_AJUSTE] }, [linea({ ajuste: { afectacion: 3, tasa: 10 } })]).p)).includes("tasa de IVA"),
    (await resultado(preparar({ permisos: [PERMISO_AJUSTE] }, [linea({ ajuste: { afectacion: 4, tasa: 10, proporcion: "100" } })]).p)).includes("proporción gravada"),
    (await resultado(preparar({ permisos: [PERMISO_AJUSTE] }, [linea({ cantidad: "1.5" })]).p)).includes("cantidad debe ser un número entero"),
    (await resultado(preparar({ permisos: [PERMISO_AJUSTE], unidades: UNIDADES }, [linea({ cantidad: "1.5", ajuste: { unidadSifen: 83 } })]).p)),
  ], [true, true, true, "OK"]);
  const sinAjuste = preparar({ producto: incompleto }, [linea()]);

  igual("servidor: producto incompleto sin ajuste → 422 «unidad de medida con equivalencia SIFEN» y sin consultar permisos de ajuste", [(await resultado(sinAjuste.p)).slice(0, 4), sinAjuste.b.llamadas.some((l) => /usuario_tiene_permiso/.test(l.sql))], ["422:", false]);
  igual("servidor: un ajuste que solo cambia descripción/GTIN de un producto completo también exige el permiso de ajuste", (await resultado(preparar({ permisos: [] }, [linea({ ajuste: { descripcion: "Otra" } })]).p)).slice(0, 4), "403:");

  // ── «Guardar también en Productos»
  igual("guardar: pedir guardar sin PRODUCTOS.EDITAR → 403 (el operador usa «Solo esta factura»)", (await resultado(preparar({ permisos: [PERMISO_AJUSTE] }, [linea({ ajuste: { afectacion: 3, tasa: 0, guardarClasificacion: true } })]).p)).slice(0, 4), "403:");

  const guardable = baseSimulada({ permisos: [PERMISO_AJUSTE, PERMISO_PRODUCTOS] });
  const salida = { guardar: [] as Array<{ productoId: string; codigo: string; afectacion: number; tasa: number; proporcion: string | null }> };

  await crearFacturaElectronica(guardable.db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpoBase([linea({ ajuste: { afectacion: 3, tasa: 0, guardarClasificacion: true } })])) as never, salida);

  igual("guardar: con confirmación y PRODUCTOS.EDITAR la creación entrega la clasificación a guardar (solo IVA); sin la opción no entrega nada", [
    salida.guardar, (await (async () => { const s2 = { guardar: [] as typeof salida.guardar }; await crearFacturaElectronica(baseSimulada({ permisos: [PERMISO_AJUSTE] }).db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpoBase([linea({ ajuste: { afectacion: 3, tasa: 0 } })])) as never, s2); return s2.guardar; })()),
  ], [[{ productoId: PRODUCTO, codigo: "P-1", afectacion: 3, tasa: 0, proporcion: null }], []]);

  const guardarCon = async (permisos: string[], cte: Record<string, number> | Error, impuestos = [{ id: "i1" }]) => {
    const llamadas: Llamada[] = [];
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        llamadas.push({ sql, parametros });
        if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: permisos.includes(`${String(parametros[2])}.${String(parametros[3])}`) }] };
        if (/FROM impuestos/.test(sql)) return { rows: impuestos };
        if (/WITH ant AS/.test(sql)) { if (cte instanceof Error) throw cte; return { rows: [cte] }; }

        return { rows: [] };
      },
    } as never;
    const r = await guardarClasificacionIva(db, EMPRESA, USUARIO, DOC, { productoId: PRODUCTO, codigo: "P-1", afectacion: 1, tasa: 10, proporcion: null });

    return { r, llamadas };
  };
  const g1 = await guardarCon([PERMISO_PRODUCTOS], { existe: 1, cambio: 1, anotado: 1 });
  const g2 = await guardarCon([PERMISO_PRODUCTOS], { existe: 1, cambio: 0, anotado: 0 });
  const g3 = await guardarCon([], { existe: 1, cambio: 1, anotado: 1 });
  const g4 = await guardarCon([PERMISO_PRODUCTOS], Object.assign(new Error("no existe la relación"), { code: "42P01" }));
  const g5 = await guardarCon([PERMISO_PRODUCTOS], { existe: 0, cambio: 0, anotado: 0 });
  const g6 = await guardarCon([PERMISO_PRODUCTOS], { existe: 1, cambio: 1, anotado: 1 }, [{ id: "a" }, { id: "b" }]);

  igual("guardar: estados — GUARDADO (cambió y quedó en bitácora), SIN_CAMBIO (el cadastro ya lo tenía), ERROR sin permiso, ERROR si falta la bitácora (NEX-056) o el producto, ERROR si el impuesto no es único; nunca lanza", [
    g1.r.estado, g2.r.estado, g3.r.estado, g4.r.estado, g4.r.mensaje.includes("NEX-056"), g5.r.estado, g6.r.estado,
  ], ["GUARDADO", "SIN_CAMBIO", "ERROR", "ERROR", true, "ERROR", "ERROR"]);

  const sentencia = g1.llamadas.find((l) => /WITH ant AS/.test(l.sql))!;

  cierto("guardar: UNA sola sentencia atómica (bloqueo FOR UPDATE, UPDATE solo si difiere, INSERT en la bitácora) filtrada por empresa; modifica SOLO impuesto/afectación/proporción (jamás unidad, precio, costo ni stock)", /FOR UPDATE OF p/.test(sentencia.sql) && /IS DISTINCT FROM/.test(sentencia.sql)
    && /INSERT INTO producto_clasificacion_fiscal_log/.test(sentencia.sql) && (sentencia.sql.match(/empresa_id = \$1/g) ?? []).length >= 2 && /SET impuesto_id = \$3::uuid, afectacion_iva = \$4::smallint, proporcion_gravada_iva = \$5::numeric, actualizado_at = now\(\)/.test(sentencia.sql)
    && !/unidad_medida|precio|costo|stock|descripcion/i.test(sentencia.sql.replace(/producto_clasificacion_fiscal_log|descripcion/g, "")) && sentencia.parametros[0] === EMPRESA && sentencia.parametros[6] === USUARIO && sentencia.parametros[5] === DOC);
  igual("guardar: sin permiso o con clasificación incoherente (exento con 10 %) no se ejecuta ninguna escritura", [g3.llamadas.some((l) => /WITH ant AS/.test(l.sql)), (await (async () => {
    const q: Llamada[] = []; const db = { async query(sql: string, p: unknown[] = []) { q.push({ sql, parametros: p }); return /usuario_tiene_permiso/.test(sql) ? { rows: [{ ok: true }] } : { rows: [] }; } } as never;
    const x = await guardarClasificacionIva(db, EMPRESA, USUARIO, DOC, { productoId: PRODUCTO, codigo: "P-1", afectacion: 3, tasa: 10, proporcion: null });

    return [x.estado, q.some((l) => /WITH ant AS/.test(l.sql))];
  })())], [false, ["ERROR", false]]);

  // ── Punto de expedición (FE-UX-01): catálogo con último número, inactivos y unidades; la factura nunca escribe en fe_puntos_expedicion
  const cat: Llamada[] = [];
  const dbCat = {
    async query(sql: string, parametros: unknown[] = []) {
      cat.push({ sql, parametros });
      if (/FROM sucursales sc\s+LEFT JOIN fe_puntos_expedicion/.test(sql)) return { rows: [{ id: SUC, nombre: "Casa Central", establecimiento: "001", puntos: [{ id: PUNTO, codigo: "002", nombre: "Caja", ultimoNumero: 49999 }], puntosInactivos: 1 }] };
      if (/FROM unidades_medida_sifen WHERE vigente/.test(sql)) return { rows: [{ codigo: 77, representacion: "UNI", descripcion: "Unidad" }] };

      return { rows: [{ n: 2 }] };
    },
  } as never;
  const catalogo = await catalogosFactura(dbCat, EMPRESA, USUARIO);

  igual("punto: el catálogo informa último número y puntos inactivos por sucursal, las sucursales sin establecimiento y las unidades SIFEN vigentes; solo lectura", [
    (catalogo.sucursales[0] as { puntos: Array<{ ultimoNumero: number }>; puntosInactivos: number }).puntos[0].ultimoNumero, (catalogo.sucursales[0] as { puntosInactivos: number }).puntosInactivos, catalogo.sucursalesSinEstablecimiento, catalogo.unidadesSifen.length,
    cat.every((l) => /^\s*SELECT/i.test(l.sql)),
  ], [49999, 1, 2, 1, true]);
  cierto("punto: ningún código de la factura escribe en fe_puntos_expedicion (no crea, no activa, no cambia el número) — solo la función SQL de reserva de NEX-048 lo hace al enviar", ["lib/facturacion/emision.ts", "lib/facturacion/ajuste-fiscal.ts", "lib/facturacion/ajuste-item.ts", "app/api/facturas/catalogos/route.ts"].every((f) => !/(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?fe_puntos_expedicion/i.test(leer(f))));

  // ── Estructura: envío, pantalla, migración y límites de la fase
  const envio = leer("lib/facturacion/envio.ts");
  const editor0 = leer("app/(private)/facturas/nueva/ajuste-fiscal-item.tsx");

  cierto("envío: «guardar en Productos» ocurre después de reservar el documento y antes de transmitir, es idempotente, un fallo no impide emitir y el resultado se devuelve al operador", envio.indexOf("crearFacturaElectronica(db") < envio.indexOf("guardarClasificacionIva(db") && envio.indexOf("guardarClasificacionIva(db") < envio.indexOf("enviarDocumento(db, empresaId, usuarioId, documentoId, dep)") && /ajustesProducto/.test(envio));

  const pagina = leer("app/(private)/facturas/nueva/page.tsx");

  cierto("pantalla: layout conservado (mismos cartones y resumen), editor fiscal por línea solo con permiso, producto incompleto añadible con permiso y bloqueado con el mensaje original sin él, diagnóstico del punto y próximo número referencial", ["sec-operacion", "sec-cliente", "sec-detalle", "sec-info", "sec-totales"].every((id) => pagina.includes(id))
    && /<EditorFiscalItem/.test(pagina) && /puedeAjustarFiscal \? \(/.test(pagina) && /permisos=\{{ puedeAjustarFiscal, puedeEditarPrecio }\}/.test(pagina) && /No se puede facturar/.test(leer("lib/facturacion/ajuste-item.ts")) && /Sin punto de expedición activo/.test(pagina) && /Próximo N\.º \(referencial\)/.test(pagina)
    && !/fetch\("\/api\/productos/.test(pagina) && !/<input[^>]*(codigo|ultimo)/i.test(pagina.slice(pagina.indexOf("sec-operacion"), pagina.indexOf("sec-cliente"))));

  const editor = leer("app/(private)/facturas/nueva/ajuste-fiscal-item.tsx");

  cierto("editor: elección explícita «Solo esta factura» (predeterminada) o «Guardar también en Productos» (deshabilitada sin PRODUCTOS.EDITAR); unidad, descripción y GTIN declarados como solo-documento; sin opción de crear punto ni de editar numeración", /Solo esta factura \(recomendado\)/.test(editor) && /Guardar también en Productos/.test(editor) && /disabled=\{!puedeEditarProductos\}/.test(editor) && /checked=\{!ajuste\.guardar\}/.test(editor) && /valen solo para esta factura: no cambian el producto ni su unidad de stock/.test(editor) && !/punto|numeraci/i.test(editor.replace(/punto de expedici[oó]n/gi, "")));

  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-056-facturacion-ajuste-fiscal.sql");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-056.sql");

  cierto("NEX-056: solo el permiso AJUSTE_FISCAL (sin asignar) y una bitácora inmutable con FKs compuestas por empresa; no toca productos, documentos ni migraciones previas; grants solo SELECT/INSERT; reversión que protege perfiles y evidencia", /INSERT INTO public\.permisos[\s\S]{0,200}'FACTURACION_ELECTRONICA\.AJUSTE_FISCAL'/.test(mig)
    && /FOREIGN KEY \(empresa_id, producto_id\)[\s\S]{0,200}public\.productos \(empresa_id, id\)/.test(mig) && /FOREIGN KEY \(empresa_id, usuario_id\)/.test(mig) && /FOREIGN KEY \(empresa_id, documento_id\)/.test(mig) && /BEFORE UPDATE OR DELETE/.test(mig) && /BEFORE TRUNCATE/.test(mig)
    && /GRANT SELECT, INSERT ON public\.producto_clasificacion_fiscal_log TO nexit_runtime/.test(mig) && !/ALTER TABLE|UPDATE public\.productos|DROP /.test(mig.replace(/--.*$/gm, "")) && /perfil_permiso/.test(rev) && /tiene registros/.test(rev) && /DROP TABLE public\.producto_clasificacion_fiscal_log/.test(rev));
  const sqlApp = leer("lib/facturacion/ajuste-fiscal.ts");
  const normal = (t: string) => t.replace(/\s+/g, " ").trim();
  const sentenciaApp = normal(/`(WITH ant AS[\s\S]*?anotado)`/.exec(sqlApp)?.[1] ?? "");
  const t18 = leer("documentacao/banco/nexit/v1/pruebas/T18-nex056-ajuste-fiscal.sql");
  const sentenciaPrueba = normal(/\$q\$\s*(WITH ant AS[\s\S]*?anotado)\$q\$/.exec(t18)?.[1] ?? "");

  cierto("T18 (PostgreSQL descartable en el CI): prueba la MISMA sentencia que ejecuta la aplicación (texto idéntico), el permiso, la bitácora inmutable, el aislamiento por empresa y los privilegios; está en la batería", sentenciaApp.length > 200 && sentenciaApp === sentenciaPrueba
    && /T12 T13 T14 T15 T16 T18/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")) && /FOR UPDATE OF p/.test(t18) && /23503/.test(t18) && /TRUNCATE/.test(t18));

  // ── R01-02: GTIN de tres estados — usar el del producto / informar otro / «Sin GTIN (solo esta factura)»
  const conGtin = base({ ...completo, gtin: "7791234567890" });

  igual("GTIN: tres estados distintos en el navegador — usar el del producto (nada que enviar), informar otro (viaja el nuevo) y «Sin GTIN» (viaja null EXPLÍCITO solo si el producto tenía GTIN)", [
    ajusteParaEnvio(conGtin, AJUSTE_VACIO), ajusteParaEnvio(conGtin, { ...AJUSTE_VACIO, gtinModo: "informar", gtin: "7791234567891" }), ajusteParaEnvio(conGtin, { ...AJUSTE_VACIO, gtinModo: "sin" }),
    ajusteParaEnvio(base(), { ...AJUSTE_VACIO, gtinModo: "sin" }), ajusteParaEnvio(conGtin, { ...AJUSTE_VACIO, gtinModo: "informar", gtin: "7791234567890" }),
    valoresEfectivos(conGtin, AJUSTE_VACIO).gtin, valoresEfectivos(conGtin, { ...AJUSTE_VACIO, gtinModo: "sin" }).gtin, valoresEfectivos(conGtin, { ...AJUSTE_VACIO, gtinModo: "informar", gtin: "7791234567891" }).gtin,
  ], [undefined, { gtin: "7791234567891" }, { gtin: null }, undefined, undefined, "7791234567890", null, "7791234567891"]);
  igual("GTIN: «informar» exige un valor válido (vacío o de largo incorrecto queda pendiente); «Sin GTIN» no deja pendiente ni modifica el cadastro", [
    problemasFiscales(conGtin, { ...AJUSTE_VACIO, gtinModo: "informar" }, "100"), problemasFiscales(conGtin, { ...AJUSTE_VACIO, gtinModo: "informar", gtin: "123" }, "100"), problemasFiscales(conGtin, { ...AJUSTE_VACIO, gtinModo: "sin" }, "100"),
  ], [["falta el GTIN (o elija «Sin GTIN»)"], ["GTIN inválido"], []]);
  igual("GTIN en el servidor: gtin null explícito se acepta (E714 es opcional), requiere el permiso de ajuste, llega como null al payload y NO se confunde con «sin ajuste»; un GTIN de largo inválido sigue rechazado", [
    leerAjuste({ gtin: null }), (await resultado(preparar({ producto: { ...completo, gtin: "7791234567890" }, permisos: [] }, [linea({ ajuste: { gtin: null } })]).p)).slice(0, 4), typeof leerAjuste({ gtin: "123" }),
    await (async () => {
      const b = baseSimulada({ producto: { ...completo, gtin: "7791234567890" }, permisos: [PERMISO_AJUSTE] });
      const p = await prepararFactura(b.db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpoBase([linea({ ajuste: { gtin: null } })])) as never);
      const d = (p.payload as unknown as { Detalles: Array<Record<string, unknown>> }).Detalles[0];

      return [d.dGtin, p.resumen.lineas[0].ajustes, b.escrituras().length];
    })(),
    (await (async () => { const b = baseSimulada({ producto: { ...completo, gtin: "7791234567890" }, permisos: [] }); const p = await prepararFactura(b.db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpoBase([linea()])) as never); return (p.payload as unknown as { Detalles: Array<Record<string, unknown>> }).Detalles[0].dGtin; })()),
  ], [{ gtin: null }, "403:", "string", [null, ["GTIN"], 0], "7791234567890"]);
  cierto("GTIN en la pantalla: selector de tres opciones (Usar el del producto / Informar otro GTIN / Sin GTIN (solo esta factura)); el campo de texto solo aparece al informar", /Sin GTIN \(solo esta factura\)/.test(editor0) && /Usar el del producto/.test(editor0) && /Informar otro GTIN/.test(editor0) && /ajuste\.gtinModo === "informar" \? \(/.test(editor0));

  // ── R01-01: la idempotencia protege también el cadastro (replay de una factura ya creada/enviada)
  limpiarCacheTokens();

  const mundo = {
    iva: { afectacion: 1, tasa: 10 }, log: [] as unknown[], sentencias: 0, posts: 0, crear: 0, estadoDoc: "NUEVO" as "NUEVO" | "ENVIADO" | "INDETERMINADO", payload: null as string | null,
  };
  const dbReplay = {
    async query(sql: string, parametros: unknown[] = []) {
      if (/usuario_tiene_permiso/.test(sql)) { const lit = /'([A-Z_]+)',\s*'([A-Z_]+)'\)/.exec(sql); const c = parametros.length >= 4 ? `${String(parametros[2])}.${String(parametros[3])}` : lit ? `${lit[1]}.${lit[2]}` : ""; return { rows: [{ ok: [PERMISO_AJUSTE, PERMISO_PRODUCTOS].includes(c) }] }; }
      if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: "https://gw.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 }] };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "E", sucursal: "S", establecimiento: "001", punto: "002", puntoNombre: "P" }], rowCount: 1 };
      if (/FROM impuestos/.test(sql)) return { rows: [{ id: "i-" + String(parametros[0]) }] };
      if (/WITH ant AS/.test(sql)) {
        mundo.sentencias += 1;
        const cambia = mundo.iva.afectacion !== Number(parametros[3]) || mundo.iva.tasa !== Number(parametros[7]);

        if (cambia) { mundo.log.push({ anterior: { ...mundo.iva }, nuevo: { afectacion: parametros[3], tasa: parametros[7] } }); mundo.iva = { afectacion: Number(parametros[3]), tasa: Number(parametros[7]) }; }

        return { rows: [{ existe: 1, cambio: cambia ? 1 : 0, anotado: cambia ? 1 : 0 }] };
      }
      if (/FROM productos p/.test(sql)) return { rows: [{ ...completo, afectacion: mundo.iva.afectacion, tasa: mundo.iva.tasa }], rowCount: 1 };
      if (/fe_documento_crear_fe/.test(sql)) { mundo.crear += 1; mundo.payload = String(parametros[9]); return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: mundo.crear > 1 }], rowCount: 1 }; }
      if (/fe_documento_iniciar_envio/.test(sql)) {
        if (mundo.estadoDoc === "ENVIADO") throw Object.assign(new Error("ya enviado"), { detail: "NEX:YA_ENVIADO" });
        if (mundo.estadoDoc === "INDETERMINADO") throw Object.assign(new Error("indeterminado"), { detail: "NEX:ENVIO_INDETERMINADO" });

        return { rows: [{ resultado: "INICIADO", payload: JSON.parse(mundo.payload ?? "{}"), numero: "0050000", tipo: "FE", establecimiento: "001", punto: "002" }] };
      }
      if (/fe_documento_registrar_envio/.test(sql)) { mundo.estadoDoc = "ENVIADO"; return { rows: [{}] }; }

      return { rows: [], rowCount: 0 };
    },
  } as never;
  const fetchReplay = (async (url: string) => {
    if (url.endsWith("/api/login")) return { status: 200, text: async () => JSON.stringify({ status: "success", token: "token.sintetico.no-real" }) };
    mundo.posts += 1;

    return { status: 200, text: async () => JSON.stringify({ status: "success", message: "Documento recibido", nro_lote: "L-1" }) };
  }) as never;
  const cuerpoReplay = leerCuerpoFactura(cuerpoBase([linea({ ajuste: { afectacion: 3, tasa: 0, guardarClasificacion: true } })])) as never;
  const dep = { fetch: fetchReplay, env: { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: "clave-sintetica-no-real" } };

  const primera = await emitirFactura(dbReplay, EMPRESA, USUARIO, cuerpoReplay, dep);

  igual("replay 1/3 — emisión original: guarda la clasificación en Productos UNA vez (IVA 1/10 → 3/0), anota la bitácora, transmite una sola vez y el aviso al operador es GUARDADO", [
    primera.estadoLocal, primera.ajustesProducto?.map((a) => a.estado), mundo.iva, mundo.log.length, mundo.sentencias, mundo.posts,
  ], ["ENVIADO", ["GUARDADO"], { afectacion: 3, tasa: 0 }, 1, 1, 1]);

  mundo.iva = { afectacion: 1, tasa: 10 }; // un tercero reclasifica el producto por otra vía después de la emisión

  const segunda = await emitirFactura(dbReplay, EMPRESA, USUARIO, cuerpoReplay, dep);

  igual("replay 2/3 — repetir la MISMA operación sobre una factura ya ENVIADA: no toca el producto (queda como lo dejó el tercero), no escribe otra bitácora, no ejecuta la sentencia, no consume número ni retransmite; el operador ve OMITIDO", [
    segunda.resultado, segunda.reutilizado, segunda.ajustesProducto?.map((a) => a.estado), mundo.iva, mundo.log.length, mundo.sentencias, mundo.posts, mundo.crear,
  ], ["YA_ENVIADO", true, ["OMITIDO"], { afectacion: 1, tasa: 10 }, 1, 1, 1, 2]);

  mundo.estadoDoc = "INDETERMINADO";

  const tercera = await resultado(emitirFactura(dbReplay, EMPRESA, USUARIO, cuerpoReplay, dep));

  igual("replay 3/3 — documento con envío indeterminado: la repetición se rechaza (409) y tampoco escribe en Productos ni en la bitácora", [tercera.slice(0, 4), mundo.iva, mundo.log.length, mundo.sentencias, mundo.posts], ["409:", { afectacion: 1, tasa: 10 }, 1, 1, 1]);
  cierto("replay: la omisión depende de que el documento ya existiera (reutilizado), no del estado de envío; solo la creación original llama a guardarClasificacionIva", /reutilizado\s*\n?\s*\?\s*\{[^}]*estado: "OMITIDO"/.test(leer("lib/facturacion/envio.ts").replace(/\r/g, "")) || (/estado: "OMITIDO"/.test(leer("lib/facturacion/envio.ts")) && /reutilizado/.test(leer("lib/facturacion/envio.ts"))));

  cierto("límites de la fase A (el crédito se habilitó después, en MFE-B1): sin monedas, tipos 5–13 ni competencia; el cálculo, el payload fiscal y el envío FAT-E2 no importan nada del ajuste", !/ajuste-item|ajuste-fiscal/.test(leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/reconciliacion.ts")) && /TIPOS_TRANSACCION = \{ 1: /.test(leer("lib/facturacion/payload-fe.ts")) && !/competencia/i.test(pagina + editor));

  return fallos;
}
