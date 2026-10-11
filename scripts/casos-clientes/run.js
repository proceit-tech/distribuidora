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
