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
  const lpe = cargar("lib/listas-precio/estabilizacion.casos.js");
  const srm = cargar("lib/stock/stock-reposicion.casos.js");
  const fac = cargar("lib/facturacion/facturacion.casos.js");
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
    ["Stock, Reposición y contrato Movimientos ↔ documentos (Etapas A, B y C)", async () => srm.verificarCasosStockReposicionMovimientos(), null],
    ["Facturación F-01/F-02: documentos electrónicos, gateway, NEX-047, cálculo fiscal, payload FE y NEX-048", async () => fac.verificarCasosFacturacion(), null],
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
