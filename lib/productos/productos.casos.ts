/**
 * Casos de regresión de Productos V1: validación única (sin truncar, decimales exactos, referencias y reglas por campo),
 * sincronización selectiva de colecciones (conexión SIMULADA), formulario ↔ contrato y verificaciones estáticas de las rutas y SQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ErrorValidacion } from "@/lib/productos/errores";
import { formularioAPayload, formularioDesdeDetalle, formularioInicial } from "@/lib/productos/formulario";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { pestanaDeCampo } from "@/lib/productos/pestanas";
import { eliminarHijos, guardarHijos } from "@/lib/productos/sincronizar";
import { validarReferencias } from "@/lib/productos/shared";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";
const U1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const U2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const C1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const C2 = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const D1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const K1 = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";

type Consulta = { sql: string; parametros: unknown[] };

// Fixture de producto no vendible: las pruebas ajenas a la regla DEC-PRD-U02 no dependen de la clasificación fiscal (la regla se prueba aparte con vendible: true).
const base = { descripcion: "Producto", descripcionFactura: "Producto factura", unidadMedidaId: U1, vendible: false };
const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

function conexionSimulada(porTabla: Record<string, Array<Record<string, unknown>>>, fallaDelete?: string) {
  const registro: Consulta[] = [];
  const conexion = {
    async query(sql: string, parametros: unknown[] = []) {
      registro.push({ sql, parametros });

      const sel = /FROM (producto_\w+) t WHERE (producto_id|producto_kit_id) = \$1 AND empresa_id = \$2 FOR UPDATE/.exec(sql);

      if (sel) {
        const filas = porTabla[sel[1]] ?? [];

        return { rows: filas.map((f) => ({ fila: f })), rowCount: filas.length };
      }
      if (/^\s*DELETE FROM/.test(sql) && fallaDelete) throw Object.assign(new Error("referenciada"), { code: fallaDelete });

      return { rows: [], rowCount: 0 };
    },
  } as never;

  return { conexion, registro };
}

export async function verificarCasosProductos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  /** Resultado de normalizar: campo del error (o "ok"). */
  const campoDe = (cuerpo: Record<string, unknown>, modo: "crear" | "editar" = "crear") => {
    try {
      normalizarProducto({ ...base, ...cuerpo }, { modo, productoId: PROD });

      return "ok";
    } catch (e) {
      return e instanceof ErrorValidacion ? (e.campo ?? "sin-campo") : "excepcion";
    }
  };
  const valido = (cuerpo: Record<string, unknown>, modo: "crear" | "editar" = "crear") => normalizarProducto({ ...base, ...cuerpo }, { modo, productoId: PROD });

  // ── Sin truncamiento silencioso (PRD-A04)
  igual("descripción 300 ok", campoDe({ descripcion: "x".repeat(300) }), "ok");
  igual("descripción 301 rechazada", campoDe({ descripcion: "x".repeat(301) }), "descripcion");
  igual("descripción factura 121 rechazada", campoDe({ descripcionFactura: "x".repeat(121) }), "descripcionFactura");
  igual("código SIFEN 21 rechazado", campoDe({ codigoSifen: "x".repeat(21) }), "codigoSifen");
  igual("información de factura 501 rechazada", campoDe({ informacionFactura: "x".repeat(501) }), "informacionFactura");
  igual("observación 1001 rechazada", campoDe({ observacion: "x".repeat(1001) }), "observacion");
  igual("procedencia 101 rechazada", campoDe({ procedencia: "x".repeat(101) }), "procedencia");
  igual("código de código-barras 81 rechazado", campoDe({ codigoBarras: "x".repeat(81) }), "codigoBarras");
  igual("valor con espacios se recorta sin cortar", valido({ descripcion: "  Hola  " }).descripcion, "Hola");

  // ── Decimales exactos (PRD-A03)
  igual("precio vacío = sin precio (null, no 0)", valido({ precioVentaReferencia: "" }).precioVentaReferencia, null);
  igual("precio 0 se conserva como 0", valido({ precioVentaReferencia: "0" }).precioVentaReferencia, "0.0000");
  igual("precio exacto 12345678.1234", valido({ precioVentaReferencia: "12345678.1234" }).precioVentaReferencia, "12345678.1234");
  igual("precio con 5 decimales rechazado (no se redondea)", campoDe({ precioVentaReferencia: "10.12345" }), "precioVentaReferencia");
  igual("precio con coma rechazado", campoDe({ precioVentaReferencia: "10,5" }), "precioVentaReferencia");
  igual("precio con notación científica rechazado", campoDe({ precioVentaReferencia: "1e3" }), "precioVentaReferencia");
  igual("precio negativo rechazado", campoDe({ precioVentaReferencia: "-1" }), "precioVentaReferencia");
  igual("float impreciso (0.1+0.2) rechazado", campoDe({ precioVentaReferencia: 0.1 + 0.2 }), "precioVentaReferencia");
  igual("demasiados enteros rechazado", campoDe({ precioVentaReferencia: "123456789012345" }), "precioVentaReferencia");
  igual("stock mínimo omitido = 0", valido({}).stockMinimo, "0.0000");
  igual("stock mínimo exacto 0.0001", valido({ stockMinimo: "0.0001" }).stockMinimo, "0.0001");
  igual("peso con 5 decimales rechazado", campoDe({ pesoNetoKg: "1.00001" }), "pesoNetoKg");
  igual("porcentaje de merma 100 ok", valido({ porcentajeMerma: "100" }).porcentajeMerma, "100.0000");
  igual("porcentaje de merma 100.0001 rechazado", campoDe({ porcentajeMerma: "100.0001" }), "porcentajeMerma");
  igual("vida útil no entera rechazada", campoDe({ vidaUtilDias: "1.5" }), "vidaUtilDias");

  // ── Factores, cantidades (>0) y reglas de colecciones
  const pres = (extra: Record<string, unknown>) => ({ unidades: [{ unidadMedidaId: U1, nombrePresentacion: "Caja", factorConversion: "12", ...extra }] });

  igual("presentación: factor 12 canónico", valido(pres({})).unidades[0].factorConversion, "12.000000");
  igual("presentación: factor 0 rechazado", campoDe(pres({ factorConversion: "0" })), "unidades.0.factorConversion");
  igual("presentación: factor 0.000001 ok", campoDe(pres({ factorConversion: "0.000001" })), "ok");
  igual("presentación: factor con 7 decimales rechazado", campoDe(pres({ factorConversion: "1.0000001" })), "unidades.0.factorConversion");
  igual("presentación: factor obligatorio", campoDe(pres({ factorConversion: "" })), "unidades.0.factorConversion");
  igual("presentación: nombre obligatorio", campoDe(pres({ nombrePresentacion: "" })), "unidades.0.nombrePresentacion");
  igual("solo una unidad base", campoDe({ unidades: [{ unidadMedidaId: U1, nombrePresentacion: "A", factorConversion: "1", esUnidadBase: true }, { unidadMedidaId: U1, nombrePresentacion: "B", factorConversion: "1", esUnidadBase: true }] }), "unidades.1.esUnidadBase");

  const prov = (extra: Record<string, unknown>) => ({ proveedores: [{ proveedorId: C1, ...extra }] });

  igual("proveedor: factor vacío = 1", valido(prov({})).proveedores[0].factorConversion, "1.000000");
  igual("proveedor: factor 0 rechazado (PRD-A07)", campoDe(prov({ factorConversion: "0" })), "proveedores.0.factorConversion");
  igual("proveedor: costo con moneda ok", campoDe(prov({ costoReferencia: "100.5", monedaCodigo: "PYG" })), "ok");
  igual("proveedor: costo sin moneda rechazado", campoDe(prov({ costoReferencia: "100" })), "proveedores.0.monedaCodigo");
  igual("proveedor: costo con 5 decimales rechazado", campoDe(prov({ costoReferencia: "1.00001", monedaCodigo: "PYG" })), "proveedores.0.costoReferencia");
  igual("proveedor: un solo principal", campoDe({ proveedores: [{ proveedorId: C1, esPrincipal: true }, { proveedorId: C2, esPrincipal: true }] }), "proveedores.1.esPrincipal");
  igual("proveedor: seleccionar proveedor", campoDe({ proveedores: [{}] }), "proveedores.0.proveedorId");

  igual("código: SKU_PROVEEDOR admitido (PRD-A06)", campoDe({ codigos: [{ tipo: "SKU_PROVEEDOR", codigo: "ABC-1" }] }), "ok");
  igual("código: GTIN de 7 dígitos rechazado", campoDe({ codigos: [{ tipo: "GTIN", codigo: "1234567" }] }), "codigos.0.codigo");
  igual("código: EAN-13 ok", campoDe({ codigos: [{ tipo: "EAN", codigo: "7891234567895" }] }), "ok");
  igual("código: tipo inválido rechazado", campoDe({ codigos: [{ tipo: "XYZ", codigo: "1" }] }), "codigos.0.tipo");
  igual("código: un solo principal", campoDe({ codigos: [{ tipo: "OTRO", codigo: "a", esPrincipal: true }, { tipo: "OTRO", codigo: "b", esPrincipal: true }] }), "codigos.1.esPrincipal");
  igual("código: repetido (tipo + código) rechazado", campoDe({ codigos: [{ tipo: "OTRO", codigo: "a" }, { tipo: "OTRO", codigo: "a" }] }), "codigos.1.codigo");

  igual("depósito repetido rechazado", campoDe({ depositos: [{ depositoId: D1 }, { depositoId: D1 }] }), "depositos.1.depositoId");
  igual("depósito: stock con 5 decimales rechazado", campoDe({ depositos: [{ depositoId: D1, stockMinimo: "1.00001" }] }), "depositos.0.stockMinimo");

  igual("alternativo: consigo mismo rechazado", campoDe({ alternativos: [{ productoAlternativoId: PROD }] }), "alternativos.0.productoAlternativoId");
  igual("alternativo: prioridad 0 rechazada", campoDe({ alternativos: [{ productoAlternativoId: C1, prioridad: "0" }] }), "alternativos.0.prioridad");
  igual("alternativo: tipo por defecto SUSTITUTO", valido({ alternativos: [{ productoAlternativoId: C1 }] }).alternativos[0].tipo, "SUSTITUTO");

  igual("componentes en un no-KIT rechazados", campoDe({ componentes: [{ productoComponenteId: C1, cantidad: "1" }] }), "componentes.0.productoComponenteId");
  igual("componentes en un KIT ok", campoDe({ tipoProducto: "KIT", componentes: [{ productoComponenteId: C1, cantidad: "1.5" }] }), "ok");
  igual("componente: cantidad 0 rechazada", campoDe({ tipoProducto: "KIT", componentes: [{ productoComponenteId: C1, cantidad: "0" }] }), "componentes.0.cantidad");
  igual("componente: kit consigo mismo rechazado", campoDe({ tipoProducto: "KIT", componentes: [{ productoComponenteId: PROD, cantidad: "1" }] }), "componentes.0.productoComponenteId");

  // ── Documentos: ya NO forman parte de la ficha (NEX-041): se gestionan con sus propias acciones (archivo privado, versiones)
  const conDocs = valido({ documentos: [{ tipo: "OTRO", nombreArchivo: "x.pdf", urlArchivo: "https://x/x.pdf" }], eliminaciones: { documentos: [C1] } });

  igual("documentos enviados en la ficha no se procesan ni se persisten", [Object.prototype.hasOwnProperty.call(conDocs, "documentos"), Object.prototype.hasOwnProperty.call(conDocs.eliminaciones, "documentos")], [false, false]);

  // ── Información / SIFEN (E8: validaciones cadastrales fundamentadas)
  igual("línea sin familia rechazada", campoDe({ lineaId: C1 }), "familiaId");
  igual("NCM de 5 dígitos rechazado (6–8)", campoDe({ ncm: "12345" }), "ncm");
  igual("NCM de 8 dígitos ok", campoDe({ ncm: "12345678" }), "ok");
  igual("NCM no numérico rechazado", campoDe({ ncm: "12AB5678" }), "ncm");
  igual("partida arancelaria de 2 dígitos rechazada", campoDe({ partidaArancelaria: "12" }), "partidaArancelaria");
  igual("DNCP específico de 2 caracteres rechazado (3–4)", campoDe({ dncpEspecifico: "12" }), "dncpEspecifico");
  igual("DNCP específico de 3 ok", campoDe({ dncpEspecifico: "123" }), "ok");
  igual("DNCP general de 9 rechazado", campoDe({ dncpGeneral: "123456789" }), "dncpGeneral");
  igual("país de origen inválido rechazado", campoDe({ paisOrigenCodigo: "PY" }), "paisOrigenCodigo");
  igual("relación de mercadería 3 rechazada", campoDe({ relacionMercaderia: "3" }), "relacionMercaderia");
  igual("tipo de producto inválido rechazado", campoDe({ tipoProducto: "OTRO" }), "tipoProducto");
  igual("descripción obligatoria", campoDe({ descripcion: " " }), "descripcion");
  igual("descripción para factura obligatoria", campoDe({ descripcionFactura: "" }), "descripcionFactura");
  igual("unidad base obligatoria", campoDe({ unidadMedidaId: "" }), "unidadMedidaId");

  // ── Inventario inicial
  const apertura = (extra: Record<string, unknown>, otros: Record<string, unknown> = {}) => ({ controlaStock: true, inventarioInicial: { cantidad: "10", costoUnitario: "5", depositoId: D1, ...extra }, ...otros });

  igual("apertura válida", campoDe(apertura({})), "ok");
  igual("apertura canónica", valido(apertura({})).inventarioInicial, { cantidad: "10.0000", costoUnitario: "5.0000", depositoId: D1 });
  igual("apertura sin costo rechazada (no se inventa costo)", campoDe(apertura({ costoUnitario: "" })), "inventarioInicial.costoUnitario");
  igual("apertura sin depósito rechazada", campoDe(apertura({ depositoId: "" })), "inventarioInicial.depositoId");
  igual("apertura sin controlar stock rechazada", campoDe(apertura({}, { controlaStock: false })), "inventarioInicial.cantidad");
  igual("apertura por lote rechazada", campoDe(apertura({}, { modoControlStock: "LOTE" })), "inventarioInicial.cantidad");
  igual("apertura en edición rechazada", campoDe(apertura({}), "editar"), "inventarioInicial.cantidad");
  igual("apertura con 5 decimales rechazada", campoDe(apertura({ cantidad: "1.00001" })), "inventarioInicial.cantidad");
  igual("apertura en cero = sin movimiento", valido(apertura({ cantidad: "0" })).inventarioInicial.cantidad, null);

  // ── Identificadores persistentes de las colecciones
  const ids = valido({ codigos: [{ id: U2, tipo: "OTRO", codigo: "a" }, { id: "nuevo-codigo-1", tipo: "OTRO", codigo: "b" }], eliminaciones: { codigos: [U1, U1, "basura"], depositos: [C1] } }, "editar");

  igual("id UUID se conserva en la edición", ids.codigos[0].id, U2);
  igual("id temporal = alta (null)", ids.codigos[1].id, null);
  igual("eliminaciones: solo UUID y sin duplicados", ids.eliminaciones.codigos, [U1]);
  igual("eliminaciones de otras colecciones", ids.eliminaciones.depositos, [C1]);
  igual("en el alta todos los ids son nuevos", valido({ codigos: [{ id: U2, tipo: "OTRO", codigo: "a" }] }, "crear").codigos[0].id, null);

  // ── Pestaña de cada error
  igual("pestana: descripcion → general", pestanaDeCampo("descripcion"), "general");
  igual("pestana: ncm → sifen", pestanaDeCampo("ncm"), "sifen");
  igual("pestana: codigos.0.codigo → sifen", pestanaDeCampo("codigos.0.codigo"), "sifen");
  igual("pestana: stockMinimo → stock", pestanaDeCampo("stockMinimo"), "stock");
  igual("pestana: depositos.0.depositoId → stock", pestanaDeCampo("depositos.0.depositoId"), "stock");
  igual("pestana: proveedores.1.factorConversion → compras", pestanaDeCampo("proveedores.1.factorConversion"), "compras");
  igual("pestana: pesoNetoKg → logistica", pestanaDeCampo("pesoNetoKg"), "logistica");
  igual("pestana: componentes.0.cantidad → kit", pestanaDeCampo("componentes.0.cantidad"), "kit");
  igual("pestana: documentos.0.urlArchivo → documentos", pestanaDeCampo("documentos.0.urlArchivo"), "documentos");
  igual("el error lleva su pestaña", (() => { try { normalizarProducto({ ...base, ncm: "1" }); return null; } catch (e) { return (e as ErrorValidacion).pestana; } })(), "sifen");

  // ── Sincronización selectiva (PRD-API-01)
  const datos = valido(
    {
      codigos: [
        { id: U1, tipo: "OTRO", codigo: "cambia", esPrincipal: false },
        { id: "tmp", tipo: "OTRO", codigo: "nuevo", esPrincipal: true },
      ],
      eliminaciones: { codigos: [U2] },
    },
    "editar",
  );
  const existentes = { producto_codigos: [{ id: U1, es_principal: true, codigo: "viejo" }, { id: U2, es_principal: false, codigo: "x" }] };
  const g = conexionSimulada(existentes);

  await eliminarHijos(g.conexion, EMPRESA, PROD, datos);
  await guardarHijos(g.conexion, EMPRESA, PROD, datos);

  const sqls = g.registro.map((c) => c.sql);

  igual("sync: nunca borra en bloque", sqls.some((s) => /DELETE FROM \w+ WHERE (producto_id|producto_kit_id) = \$1 AND empresa_id = \$2\s*$/.test(s)), false);
  igual("sync: un único DELETE (la eliminación explícita) por id", sqls.filter((s) => /^\s*DELETE FROM/.test(s)).length, 1);
  cierto("sync: DELETE filtrado por id, producto y empresa", g.registro.filter((c) => /^\s*DELETE FROM/.test(c.sql)).every((c) => c.parametros[0] === U2 && c.parametros[1] === PROD && c.parametros[2] === EMPRESA));
  cierto("sync: la baja va protegida por savepoint", sqls.some((s) => /^SAVEPOINT baja_hija/.test(s)) && sqls.some((s) => /^RELEASE SAVEPOINT baja_hija/.test(s)));
  const ups = g.registro.filter((c) => /^\s*UPDATE producto_codigos/.test(c.sql));

  igual("sync: una fila existente se actualiza por id (un UPDATE)", ups.length, 1);
  cierto("sync: UPDATE solo si algo cambió (IS DISTINCT FROM) y filtrado por empresa y producto", /IS DISTINCT FROM/.test(ups[0]?.sql ?? "") && ups[0].parametros[0] === U1 && ups[0].parametros[1] === PROD && ups[0].parametros[2] === EMPRESA);
  const ins = g.registro.filter((c) => /^\s*INSERT INTO producto_codigos/.test(c.sql));

  igual("sync: la fila nueva se inserta (un INSERT)", ins.length, 1);
  cierto("sync: la principal anterior se desmarca ANTES de insertar la nueva principal", g.registro.findIndex((c) => /^\s*UPDATE producto_codigos/.test(c.sql)) < g.registro.findIndex((c) => /^\s*INSERT INTO producto_codigos/.test(c.sql)));
  cierto("sync: ninguna sentencia DELETE-ALL + INSERT", !sqls.some((s) => /DELETE FROM producto_codigos WHERE producto_id = \$1 AND empresa_id = \$2$/.test(s.trim())));

  // Registro referenciado → no se destruye y el error es claro
  const r = conexionSimulada(existentes, "23503");
  const eliminarRef = valido({ eliminaciones: { codigos: [U2] } }, "editar");
  const errRef = await eliminarHijos(r.conexion, EMPRESA, PROD, eliminarRef).then(
    () => null,
    (e) => e as ErrorValidacion,
  );

  igual("referenciado: 409 con campo de la colección", [errRef?.estado, errRef?.campo], [409, "codigos"]);
  cierto("referenciado: se revierte el savepoint", r.registro.some((c) => /^ROLLBACK TO SAVEPOINT baja_hija/.test(c.sql)));

  // Fila inexistente / de otro producto
  const ajeno = valido({ codigos: [{ id: C1, tipo: "OTRO", codigo: "z" }] }, "editar");
  const errAjeno = await guardarHijos(conexionSimulada(existentes).conexion, EMPRESA, PROD, ajeno).then(
    () => null,
    (e) => e as ErrorValidacion,
  );

  igual("fila inexistente o ajena: 409 sin escrituras", errAjeno?.estado, 409);
  const ambos = valido({ codigos: [{ id: U1, tipo: "OTRO", codigo: "z" }], eliminaciones: { codigos: [U1] } }, "editar");
  const errAmbos = await eliminarHijos(conexionSimulada(existentes).conexion, EMPRESA, PROD, ambos).then(
    () => null,
    (e) => e as ErrorValidacion,
  );

  igual("modificada y eliminada a la vez: 400", errAmbos?.estado, 400);

  // Fila ausente del envío: no se toca
  const ausente = conexionSimulada(existentes);

  await guardarHijos(ausente.conexion, EMPRESA, PROD, valido({}, "editar"));
  igual("fila ausente del envío: sin UPDATE/INSERT/DELETE", ausente.registro.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/.test(c.sql)).length, 0);

  // Componentes: la FK del kit es producto_kit_id
  const cc = conexionSimulada({ producto_componentes: [] });

  await guardarHijos(cc.conexion, EMPRESA, PROD, valido({ tipoProducto: "KIT", componentes: [{ productoComponenteId: C1, cantidad: "2" }] }, "editar"));
  cierto("componentes se insertan por producto_kit_id", cc.registro.some((c) => /^\s*INSERT INTO producto_componentes \(producto_kit_id,/.test(c.sql)));

  // ── Referencias (familia, línea, categoría, marca, proveedor, depósito, unidades)
  function refs(catalogo: Record<string, { activo: boolean; familia_id?: string } | undefined>) {
    const reg: Consulta[] = [];
    const conexion = {
      async query(sql: string, parametros: unknown[] = []) {
        reg.push({ sql, parametros });

        const tabla = /FROM (\w+) WHERE/.exec(sql)?.[1] ?? "";
        const fila = catalogo[`${tabla}:${String(parametros[1] ?? parametros[0])}`] ?? catalogo[`${tabla}:${String(parametros[0])}`];

        return fila ? { rows: [fila], rowCount: 1 } : { rows: [], rowCount: 0 };
      },
    } as never;

    return { conexion, reg };
  }
  const refError = async (cuerpo: Record<string, unknown>, catalogo: Parameters<typeof refs>[0], previo = {}) => {
    const x = refs(catalogo);
    const e = await validarReferencias(x.conexion, EMPRESA, valido(cuerpo, "editar"), previo).then(
      () => null,
      (err) => err as ErrorValidacion,
    );

    return { campo: e ? e.campo : "ok", reg: x.reg };
  };
  const base1 = { [`unidades_medida:${U1}`]: { activo: true } };

  igual("referencias: todo ok", (await refError({}, base1)).campo, "ok");
  igual("referencias: unidad inexistente", (await refError({}, {})).campo, "unidadMedidaId");
  igual("referencias: categoría de otra empresa o inexistente", (await refError({ categoriaId: C1 }, base1)).campo, "categoriaId");
  igual("referencias: marca inexistente", (await refError({ marcaId: C1 }, base1)).campo, "marcaId");
  igual("referencias: categoría inactiva (nueva) rechazada", (await refError({ categoriaId: C1 }, { ...base1, [`categorias_producto:${C1}`]: { activo: false } })).campo, "categoriaId");
  igual("referencias: categoría inactiva ya asignada se admite", (await refError({ categoriaId: C1 }, { ...base1, [`categorias_producto:${C1}`]: { activo: false } }, { categoria_id: C1 })).campo, "ok");
  igual("referencias: proveedor inexistente", (await refError({ proveedores: [{ proveedorId: C2 }] }, base1)).campo, "proveedores.0.proveedorId");
  igual("referencias: depósito inexistente", (await refError({ depositos: [{ depositoId: D1 }] }, base1)).campo, "depositos.0.depositoId");
  igual("referencias: línea de otra familia rechazada", (await refError({ familiaId: C1, lineaId: C2 }, { ...base1, [`familias_producto:${C1}`]: { activo: true }, [`lineas_producto:${C2}`]: { activo: true, familia_id: K1 } })).campo, "lineaId");
  igual("referencias: línea de su familia ok", (await refError({ familiaId: C1, lineaId: C2 }, { ...base1, [`familias_producto:${C1}`]: { activo: true }, [`lineas_producto:${C2}`]: { activo: true, familia_id: C1 } })).campo, "ok");
  const consulta = await refError({ categoriaId: C1, depositos: [{ depositoId: D1 }] }, {});

  cierto("referencias: catálogos de la empresa se consultan con empresa_id", consulta.reg.filter((c) => /FROM (categorias_producto|depositos|proveedores|marcas_producto|familias_producto)/.test(c.sql)).every((c) => /empresa_id = \$2/.test(c.sql) && c.parametros[1] === EMPRESA));

  // ── Formulario ↔ contrato
  const catalogos = { categorias: [], marcas: [], familias: [], lineas: [], monedaReferencia: "PYG", unidades: [], impuestos: [{ id: K1, codigo: "IVA10", nombre: "IVA 10%", porcentaje: "10.00" }], proveedores: [], depositos: [{ id: D1, codigo: "D", nombre: "Dep" }], paises: [], monedas: [], productos: [] } as CatalogoProductos;
  const inicial = formularioInicial(catalogos);

  igual("formulario inicial: sin precio, stock mínimo 0 y depósito único preseleccionado", [inicial.precioVentaReferencia, inicial.stockMinimo, inicial.inventarioInicial.depositoId, inicial.impuestoId], ["", "0", D1, K1]);
  igual("alta: el payload no envía código", formularioAPayload({ ...inicial, codigo: "PRD-9" }, "crear").codigo, "");
  igual("alta: la descripción se normaliza a mayúsculas", formularioAPayload({ ...inicial, descripcion: " abc " }, "crear").descripcion, "ABC");

  const detalle = {
    id: PROD, codigo: "PRD-000007", codigoInventario: "", codigoSifen: "", codigoBarras: "", descripcion: "X", descripcionFactura: "X", tipoProducto: "MERCADERIA",
    categoriaId: "", marcaId: "", familiaId: "", lineaId: "", procedencia: "", unidadMedidaId: U1, impuestoId: "", afectacionIva: "", proporcionGravadaIva: "", controlaStock: true, modoControlStock: "CANTIDAD",
    permiteTerceros: false, requiereVencimiento: false, stockMinimo: "1.5000", stockMaximo: "", puntoReposicion: "", precioVentaReferencia: "9999999.9999", monedaPrecioReferencia: "PYG",
    stockActual: "3.1234", stockPorDeposito: [], costoPromedio: "10.1234", historialUnidadBase: [], aperturaRegistrada: null, partidaArancelaria: "", ncm: "", dncpGeneral: "", dncpEspecifico: "",
    paisOrigenCodigo: "PRY", paisOrigenNombre: "Paraguay", informacionFactura: "", relacionMercaderia: "", porcentajeMerma: "", cantidadMerma: "", vendible: true, comprable: true,
    requiereInspeccionCalidad: false, vidaUtilDias: "", pesoNetoKg: "0.0001", pesoBrutoKg: "", largoCm: "", anchoCm: "", altoCm: "", volumenM3: "", imagenUrl: "", observacion: "", activo: true,
    codigos: [{ id: U1, tipo: "SKU_PROVEEDOR", codigo: "A1", descripcion: "", esPrincipal: true }], unidades: [], proveedores: [], depositos: [], alternativos: [], componentes: [],
    documentos: [], imagenPrivada: null, esCreador: true, cargaDocumentosInicialAbierta: false, permisosDocumentos: { cargar: true, gestionar: true, historial: true, finalizar: true }, creadoEn: "", actualizadoEn: "",
  } as ProductoDetalle;
  const f = formularioDesdeDetalle(detalle);

  igual("detalle → formulario: decimales exactos sin pérdida", [f.precioVentaReferencia, f.stockMinimo, f.pesoNetoKg], ["9999999.9999", "1.5000", "0.0001"]);
  const p = formularioAPayload(f, "editar");
  const n = normalizarProducto(p, { modo: "editar", productoId: PROD });

  igual("edición: el payload conserva el código", p.codigo, "PRD-000007");
  igual("ciclo detalle → payload → API: precio exacto", n.precioVentaReferencia, "9999999.9999");
  igual("ciclo: ids persistentes conservados", n.codigos[0].id, U1);
  igual("edición: no envía inventario inicial", (p.inventarioInicial as { cantidad: string }).cantidad, "");

  // ── Verificaciones estáticas de las rutas y de la persistencia
  const put = leer("app/api/productos/[id]/route.ts");
  const post = leer("app/api/productos/route.ts");
  const shared = leer("lib/productos/shared.ts");
  const norm = leer("lib/productos/normalizar.ts");

  cierto("PUT: no borra ni recrea las hijas (sin TABLAS_HIJAS ni insertarHijos)", !/TABLAS_HIJAS|insertarHijos|DELETE FROM \$\{tabla\}/.test(put));
  cierto("PUT: eliminaciones → producto → actualizaciones/altas, en ese orden", put.indexOf("eliminarHijos(") < put.indexOf("UPDATE productos SET") && put.indexOf("UPDATE productos SET") < put.indexOf("guardarHijos("));
  cierto("PUT: el código interno no se actualiza y un cambio se rechaza", /datos\.codigo !== actual\.codigo/.test(put) && /filter\(\(\[nombre\]\) => nombre !== "codigo"\)/.test(put));
  cierto("PUT: transacción y ROLLBACK ante error", /BEGIN/.test(put) && /ROLLBACK/.test(put));
  cierto("PUT: producto y empresa de la sesión (FOR UPDATE por id y empresa)", /WHERE id = \$1 AND empresa_id = \$2 FOR UPDATE/.test(put));
  cierto("PUT: exige PRODUCTOS.EDITAR y GET PRODUCTOS.VER", /denyIfNoPermission\(session, "PRODUCTOS", "EDITAR"\)/.test(put) && /denyIfNoPermission\(session, "PRODUCTOS", "VER"\)/.test(put));
  cierto("POST: exige PRODUCTOS.CREAR y MOVIMIENTOS.CREAR para el inventario inicial", /denyIfNoPermission\(session, "PRODUCTOS", "CREAR"\)/.test(post) && /denyIfNoPermission\(session, "MOVIMIENTOS", "CREAR"\)/.test(post));
  cierto("POST: el código siempre es automático (rechaza uno enviado)", /El código interno se genera automáticamente/.test(post) && /await siguienteCodigo\(/.test(post));
  cierto("POST: referencias validadas dentro de la transacción", post.indexOf("validarReferencias(") > post.indexOf("BEGIN"));
  cierto("GET/PUT: sin float8 (decimales como texto)", !/float8/.test(put) && !/float8/.test(post));
  cierto("GET: stock, costo, precio y cantidades salen ::text", /precio::text/.test(put) && /round\(sum\(c\.valor_total\) \/ sum\(c\.cantidad_valorizada\), 4\)::text/.test(put) && /sum\(s\.cantidad\)::text/.test(put) && /ml\.cantidad::text/.test(put));
  cierto("shared: sin Number() ni .slice() sobre datos del usuario", !/\bNumber\(/.test(shared) && !/\.slice\(0,/.test(shared.replace(/left\(nombre, 30\)/, "")));
  cierto("normalizar: sin Number() sobre importes ni truncamiento", !/Number\(texto\)|parseFloat|\.slice\(0, ?maximo/.test(norm.replace("const n = Number(texto);", "")));
  cierto("normalizar: el límite se rechaza, no se corta", /admite hasta \$\{maximo\} caracteres/.test(norm));
  cierto("catálogos de la empresa: validación por empresa_id", /porEmpresa \? " AND empresa_id = \$2"/.test(shared));
  cierto("el precio de referencia se envía como cadena decimal", /precio: string \| null/.test(shared));

  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-038-productos-codigo-inmutable.sql");

  cierto("NEX-038: trigger que impide cambiar el código", /NEW\.codigo IS DISTINCT FROM OLD\.codigo/.test(mig) && /BEFORE UPDATE OF codigo ON public\.productos/.test(mig));
  cierto("NEX-038: no toca filas existentes ni migraciones previas", !/(UPDATE|DELETE|INSERT)\s+(INTO\s+)?public\.productos/i.test(mig.replace(/BEFORE UPDATE OF codigo ON public\.productos/, "")));
  cierto("NEX-038: reversión versionada", /DROP TRIGGER IF EXISTS productos_codigo_inmutable_trg/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-038.sql")));

  return fallos;
}
