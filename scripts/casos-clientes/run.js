/* eslint-disable @typescript-eslint/no-require-imports */
// Ejecuta los casos de regresión de Clientes ya compilados en .tmp-casos (ver README.md de esta carpeta). Solo lógica pura y archivos del repositorio: NO usa base de datos, red ni servidor.
const Module = require("module");
const path = require("path");
const salida = path.join(process.cwd(), ".tmp-casos");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...resto) {
  if (request.startsWith("@/")) request = path.join(salida, request.slice(2));
  return original.call(this, request, ...resto);
};
(async () => {
  const cargar = (r) => require(path.join(salida, r));
  const { contador } = cargar("lib/clientes/contador-casos.js");
  const tel = cargar("lib/fiscal/telefono.casos.js");
  const apt = cargar("lib/fiscal/aptitud-sifen.casos.js");
  const com = cargar("lib/clientes/comercial.casos.js");
  const nue = cargar("lib/clientes/nueve-ajustes.casos.js");
  const per = cargar("lib/clientes/permisos-documentos.casos.js");
  const cie = cargar("lib/clientes/cierre-modulo.casos.js");
  const prv = cargar("lib/proveedores/proveedores.casos.js");
  const gob = cargar("lib/proveedores/gobernanza.casos.js");
  const dpr = cargar("lib/proveedores/documentos.casos.js");
  const cau = cargar("lib/proveedores/cuentas-auditoria.casos.js");
  const rea = cargar("lib/proveedores/reactivacion.casos.js");
  const esp = cargar("lib/proveedores/estabilizacion.casos.js");
  const pro = cargar("lib/productos/productos.casos.js");
  const sin = cargar("lib/productos/sincronizar.casos.js");
  const fis = cargar("lib/productos/fiscal.casos.js");
  const mig = cargar("lib/productos/migraciones-fiscales.casos.js");
  const arc = cargar("lib/productos/documentos-archivos.casos.js");
  const jer = cargar("lib/productos/jerarquia-catalogos.casos.js");
  const cae = cargar("lib/productos/catalogos-estabilizacion.casos.js");
  const est = cargar("lib/productos/estabilizacion.casos.js");
  const estc = cargar("lib/clientes/estabilizacion.casos.js");
  const lco = cargar("lib/listas-precio/listas-comerciales.casos.js");
  const cce = cargar("lib/comercial/estabilizacion.casos.js");
  const ist = cargar("lib/inventario/stock.casos.js");
  const imv = cargar("lib/inventario/movimientos.casos.js");
  const idp = cargar("lib/inventario/depositos.casos.js");
  const irp = cargar("lib/inventario/reposicion.casos.js");
  const icr = cargar("lib/inventario/cruzados.casos.js");
  const irr = cargar("lib/inventario/residuales.casos.js");
  const rva = cargar("lib/reportes/valorizacion.casos.js");
  const rxl = cargar("lib/reportes/export-xlsx.casos.js");
  const rsc = cargar("lib/reportes/stock-critico.casos.js");
  const rsg = cargar("lib/reportes/stock-general.casos.js");
  const rkd = cargar("lib/reportes/kardex.casos.js");
  const rlo = cargar("lib/reportes/lotes.casos.js");
  const lpe = cargar("lib/listas-precio/estabilizacion.casos.js");
  const srm = cargar("lib/stock/stock-reposicion.casos.js");
  const fac = cargar("lib/facturacion/facturacion.casos.js");
  const fe2 = cargar("lib/facturacion/fat-e2.casos.js");
  const c1 = cargar("lib/ci/verificador-consultas.casos.js");
  const aj = cargar("lib/facturacion/ajuste-fiscal.casos.js");
  const cre = cargar("lib/facturacion/credito.casos.js");
  const pag = cargar("lib/facturacion/pagos.casos.js");
  const mon = cargar("lib/facturacion/monedas.casos.js");
  const suites = [
    ["teléfono y día de cobro", async () => tel.verificarCasosTelefonoYCobro(), () => tel.CASOS_TELEFONO.length + 11 + 6 + 2],
    ["catálogo mundial", async () => tel.verificarCatalogoMundial(), null],
    ["catálogo C8/C9/C10", async () => tel.verificarCatalogoC8C9C10(), null],
    ["coherencia/divergencias del catálogo", async () => tel.verificarCoherenciaYDivergenciasCatalogo(), null],
    ["aptitud SIFEN", async () => apt.verificarCasosAptitud(), () => apt.CASOS_APTITUD_SIFEN.length],
    ["comercial (decimales/pestañas)", async () => com.verificarCasosComercial(), null],
    ["nueve ajustes", async () => nue.verificarCasosNueveAjustes(), null],
    ["permisos de documentos", async () => per.verificarCasosPermisosDocumentos(), null],
    ["cierre del módulo", async () => cie.verificarCasosCierreModulo(), null],
    ["Proveedores V1", async () => prv.verificarCasosProveedores(), null],
    ["Proveedores: gobernanza y aprobación bancaria", async () => gob.verificarCasosGobernanza(), null],
    ["Proveedores: documentos y retenciones", async () => dpr.verificarCasosDocumentosProveedores(), null],
    ["Proveedores: bajas de cuentas y auditoría inmutable", async () => cau.verificarCasosCuentasYAuditoria(), null],
    ["Proveedores: reactivación administrativa de cuentas", async () => rea.verificarCasosReactivacion(), null],
    ["Proveedores: estabilización (versión obligatoria, referencias inactivas, borradores, cierre documental; AUD §V)", async () => esp.verificarCasosEstabilizacionProveedores(), null],
    ["Productos V1", async () => pro.verificarCasosProductos(), null],
    ["Productos: sincronización en dos fases (PRD-AUD-01)", async () => sin.verificarCasosSincronizacion(), null],
    ["Productos: evolución fiscal SIFEN (NEX-039/040, GTIN)", async () => fis.verificarCasosFiscales(), null],
    ["Productos: runner, grants y migraciones 038-040 (PRD-AUD-03…06)", async () => mig.verificarCasosMigracionesFiscales(), null],
    ["Productos: documentos privados, foto, NEX-041 y pantalla (PRD-REV-03…06)", async () => arc.verificarCasosDocumentosProductos(), null],
    ["Productos: jerarquía de catálogos Categoría → Familia → Línea (NEX-044, CAT-012)", async () => jer.verificarCasosJerarquiaCatalogos(), null],
    ["Clientes: estabilización (grants de documentos, referencias inactivas, versión optimista, catálogo con error, borrador; AUD §VII)", async () => estc.verificarCasosEstabilizacionClientes(), null],
    ["Productos: estabilización (unidad base con stock cero, alcance de depósitos, observación, borrador; AUD §XXII)", async () => est.verificarCasosEstabilizacionProductos(), null],
    ["Catálogos de productos: estabilización (auxiliares, respuestas fuera de orden, rascunho, históricas, descendientes, versión; AUD-CAT §VI)", async () => cae.verificarCasosCatalogosEstabilizacion(), null],
    ["Listas de precios y Catálogos comerciales (NEX-045, tipos de cambio manuales)", async () => lco.verificarCasosListasComerciales(), null],
    ["Listas de precios: estabilización (hijos incrementales, versión y Productos, escalones, REF-VENTA, moneda/base, unidad, guard, referencias inactivas; AUD-LPR §V)", async () => lpe.verificarCasosListasEstabilizacion(), null],
    ["Catálogos comerciales: estabilización (versión de edición, guard, respuestas fuera de orden, errores de carga, decimal exacto, guarda de reversión, vínculos con clientes; AUD-CC §VI)", async () => cce.verificarCasosComercialEstabilizacion(), null],
    ["Inventario · Stock (INV-01…04: decimales exactos, moneda por línea, indicadores, atajos con VER+CREAR)", async () => ist.verificarCasosInventarioStock(), null],
    ["Inventario · Movimientos (cuatro operaciones sobre nueve tipos, reglas, motor único, permisos)", async () => imv.verificarCasosInventarioMovimientos(), null],
    ["Inventario · Depósitos (INV-05: carga confiable, permisos tras error, respuestas fuera de orden, rascunho, alcance)", async () => idp.verificarCasosInventarioDepositos(), null],
    ["Inventario · Reposición (recomendación compacta, Simular local, VER+CREAR, invariantes del cálculo, origen compartido)", async () => irp.verificarCasosInventarioReposicion(), null],
    ["Inventario · Pruebas cruzadas (INV-T01/T03/T06/T09: un movimiento, tres lecturas; acceso; responsabilidades exclusivas; Reportes)", async () => icr.verificarCasosInventarioCruzados(), null],
    ["Inventario · Correcciones residuales AUD-INV-R02 (costo unitario exacto, filtro de depósito por URL, validación de cargas de Depósitos y Reposición)", async () => irr.verificarCasosInventarioResiduales(), null],
    ["Reportes · Valorización de inventario (RPT-V01…V06, N02: unidades, snapshot, cobertura sin compensar, cargas confiables, precisión, depósitos inactivos, exportación)", async () => rva.verificarCasosReportesValorizacion(), null],
    ["Reportes · Exportación XLSX/PDF compartida (RPT-R03-01/02: celdas reales del XLSX, n/a, cantidades exactas, compatibilidad de los cinco relatórios)", async () => rxl.verificarCasosExportacionXlsx(), null],
    ["Reportes · Stock crítico y reposición (RPT-C03-01…07, matriz T-C01…T-C09: motor único de Reposición, depósitos sin saldo, sin duplicar, sin cantidades heterogéneas, cargas confiables, snapshot, XLSX/PDF)", async () => rsc.verificarCasosReportesStockCritico(), null],
    ["Reportes · Stock general (RPT-SG-01…09, matriz SG-T01…T09: sin saldo en las dos vistas, nivel como Inventario > Stock, totales por unidad, decimales exactos, cargas confiables, snapshot, XLSX/PDF)", async () => rsg.verificarCasosReportesStockGeneral(), null],
    ["Reportes · Kardex de movimientos (AUD-KDX-R01, RPT-KDX-01…09, matriz KDX-T01…T10: decimales exactos, snapshot, terceros, alcance con inactivos, totales por unidad y propiedad, cargas confiables, permisos, XLSX/PDF)", async () => rkd.verificarCasosReportesKardex(), null],
    ["Reportes · Lotes y vencimientos (AUD-LOT-R01, LOT-R01-01…09, matriz T01…T10: decimales exactos, snapshot, aislamiento y lotes sin saldo, alcance con inactivos, GTIN, totales por unidad (UUID), filtro Sin saldo, cargas confiables, permisos, XLSX/PDF)", async () => rlo.verificarCasosReportesLotes(), null],
    ["Stock, Reposición y contrato Movimientos ↔ documentos (Etapas A, B y C)", async () => srm.verificarCasosStockReposicionMovimientos(), null],
    ["Facturación F-01/F-02: documentos electrónicos, gateway, NEX-047, cálculo fiscal, payload FE y NEX-048", async () => fac.verificarCasosFacturacion(), null],
    ["Facturación FAT-E2 (T-E2-01…15): preflight, recepción ≠ aprobación, rechazos por documento, token, transporte, cierre tras caída de la base, reconciliación por consulta, aislamiento, respuestas maliciosas y vectores fiscales sanitizados", async () => fe2.verificarCasosFatE2(), null],
    ["CI · verificador C1 de consultas SQL de la aplicación (lector de plantillas anidadas, resolución exacta, fragmentos, NO VERIFICABLE con motivo, línea base y política de calidad)", async () => c1.verificarCasosVerificadorC1(), null],
    ["Facturación Fase A (PRO-93): ajuste fiscal de ítems en la factura, guardar en Productos con permiso y bitácora, diagnóstico del punto de expedición, NEX-056 y límites de la fase", async () => aj.verificarCasosAjusteFiscal(), null],
    ["Facturación MFE-B1: crédito Plazo/Cuotas, entrega inicial, conciliación exacta, payload con nombres y tipos MT, Contado/Efectivo intacto y sin reserva de número ante errores", async () => cre.verificarCasosCredito(), null],
    ["Facturación MFE-03 P1: medios de pago (efectivo, transferencia, cheque, tarjeta, otros), múltiples medios, entrega de crédito, suma exacta, errores antes de reservar número", async () => pag.verificarCasosPagos(), null],
    ["Facturación MFE-03 P2: monedas PYG/USD/BRL, tipo de cambio manual, F023 exacto, pagos y crédito en moneda extranjera, sin conversión de precios, snapshot inmutable y errores antes de reservar número", async () => mon.verificarCasosMonedas(), null],
  ];
  let total = 0;
  let fallosTotal = 0;
  for (const [nombre, ejecutar, cuenta] of suites) {
    const antes = contador.n;
    let fallos;
    try { fallos = await ejecutar(); } catch (e) { fallos = ["EXCEPCIÓN: " + (e && e.stack || e)]; }
    const n = (cuenta ? cuenta() : 0) + (contador.n - antes);
    total += n;
    fallosTotal += fallos.length;
    console.log(`${fallos.length === 0 ? "OK  " : "FALLA"} ${nombre}: ${n} comprobaciones contadas`);
    for (const f of fallos) console.log("   - " + f);
  }
  console.log(`TOTAL comprobaciones contadas: ${total}; fallos: ${fallosTotal}`);
})();
