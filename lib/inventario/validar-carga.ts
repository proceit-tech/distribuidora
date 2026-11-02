/**
 * INV-R02-03 — validación ESTRUCTURAL de los registros de las cargas de Depósitos y Reposición (helpers puros, sin React).
 * `Array.isArray` no basta: un elemento `null`, un tipo equivocado o un número no finito rompería la pantalla o el cálculo. Si algún registro no cumple la
 * forma mínima que consumen la tela y `calcularPlanReposicion`, la carga completa se rechaza (sin conceder permisos ni sustituir la lista anterior).
 * Las listas realmente vacías son válidas.
 */
export type Registro = Record<string, unknown>;

export const esRegistro = (v: unknown): v is Registro => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === "string";
const textoNoVacio = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numeroONulo = (v: unknown): boolean => v === null || numero(v);

export const depositoValido = (v: unknown): boolean =>
  esRegistro(v) && textoNoVacio(v.id) && texto(v.codigo) && texto(v.nombre) && typeof v.activo === "boolean" &&
  texto(v.sucursalId) && texto(v.sucursalNombre) && texto(v.sucursalCodigo) && typeof v.conMovimientos === "boolean" && typeof v.conSaldo === "boolean";

export const sucursalValida = (v: unknown): boolean => esRegistro(v) && textoNoVacio(v.id) && texto(v.codigo) && texto(v.nombre) && typeof v.activo === "boolean";

export const actorValido = (v: unknown): boolean => v === null || v === undefined || (esRegistro(v) && (v.alcanceDepositos === "TODOS" || v.alcanceDepositos === "ASIGNADOS"));

const parametrosValidos = (v: unknown): boolean =>
  esRegistro(v) && numeroONulo(v.minimo) && numeroONulo(v.punto) && numeroONulo(v.maximo) && numeroONulo(v.cantidadReposicion);

const otroDepositoValido = (v: unknown): boolean => esRegistro(v) && textoNoVacio(v.id) && texto(v.nombre) && numero(v.disponible) && numeroONulo(v.minimo) && numeroONulo(v.punto);

const proveedorValido = (v: unknown): boolean =>
  v === null || (esRegistro(v) && texto(v.nombre) && numeroONulo(v.plazoDias) && numeroONulo(v.cantidadMinimaCompra));

export const entradaReposicionValida = (v: unknown): boolean =>
  esRegistro(v) && textoNoVacio(v.clave) && (v.ambito === "DEPOSITO" || v.ambito === "CONSOLIDADO") && textoNoVacio(v.productoId) &&
  texto(v.productoCodigo) && texto(v.productoDescripcion) && texto(v.marca) && texto(v.unidad) &&
  (v.depositoId === null || textoNoVacio(v.depositoId)) && texto(v.depositoNombre) &&
  esRegistro(v.saldo) && numero(v.saldo.disponible) && numero(v.saldo.reservado) && numero(v.saldo.cuarentena) && numero(v.saldo.transito) &&
  parametrosValidos(v.parametros) && Array.isArray(v.otrosDepositos) && v.otrosDepositos.every(otroDepositoValido) && proveedorValido(v.proveedorPrincipal) &&
  (v.soloReferencia === undefined || typeof v.soloReferencia === "boolean") &&
  (v.modoControl === undefined || v.modoControl === "CANTIDAD" || v.modoControl === "LOTE" || v.modoControl === "UNIDAD_ETIQUETADA");

export const depositoSimpleValido = (v: unknown): boolean => esRegistro(v) && textoNoVacio(v.id) && texto(v.nombre);

/** true si es un arreglo (posiblemente vacío) cuyos elementos cumplen todos el validador. */
export const listaValida = (v: unknown, item: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(item);

/** INV-R03-01 — usuario del panel «Usuarios» de un depósito (campos que lee la tela y que decide autorizar/revocar). */
export const usuarioAccesoValido = (v: unknown): boolean =>
  esRegistro(v) && textoNoVacio(v.id) && texto(v.usuario) && texto(v.nombre) && texto(v.apellido) && texto(v.estado) &&
  (v.alcanceDepositos === "TODOS" || v.alcanceDepositos === "ASIGNADOS") && texto(v.alcanceSucursales) &&
  typeof v.asignado === "boolean" && (v.asignadoAt === null || texto(v.asignadoAt)) && typeof v.sucursalCompatible === "boolean" && typeof v.esUsted === "boolean";

/** INV-R03-01 — evento del historial de accesos (fecha parseable, tipo y origen conocidos). */
export const eventoAccesoValido = (v: unknown): boolean =>
  esRegistro(v) && textoNoVacio(v.id) && (v.evento === "ATRIBUIR" || v.evento === "REVOCAR") && (v.origen === "MANUAL" || v.origen === "CREACION") &&
  texto(v.creadoAt) && !Number.isNaN(Date.parse(v.creadoAt)) && texto(v.usuarioNombre) && texto(v.usuarioCodigo) && texto(v.actorNombre) && texto(v.actorCodigo);
