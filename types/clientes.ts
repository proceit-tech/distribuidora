export type ClienteNaturaleza =
  | "CONTRIBUYENTE"
  | "NO_CONTRIBUYENTE";

export type ClienteOperacion =
  | "B2B"
  | "B2C"
  | "B2G"
  | "B2F";

export type ClienteTipoPersona =
  | "JURIDICA"
  | "FISICA";

/** Fila de la lista de clientes (viene de GET /api/clientes, nunca de datos de prueba). */
export type ClienteLista = {
  id: string;
  codigo: string;
  /** "DESCONOCIDA" = código no reconocido en la base: se muestra como dato a revisar, nunca como otro valor válido. */
  naturaleza: ClienteNaturaleza | "DESCONOCIDA";
  tipoOperacion: ClienteOperacion | "DESCONOCIDA";
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  paisNombre: string;
  email: string;
  telefono: string;
  celular: string;
  gln: string;
  telefonoDdi: string;
  celularDdi: string;
  /** Contacto marcado como principal en la pestaña Contactos (campos vacíos si no hay). */
  contactoPrincipal: { nombre: string; telefono: string; celular: string; telefonoDdi: string; celularDdi: string };
  /** Decimal exacto en texto (numeric(18,4)); nunca Number. */
  limiteCredito: string;
  /** Moneda de los límites (moneda predeterminada del cliente); vacía si no está definida. */
  moneda: string;
  grupoClienteId: string;
  /** Aptitud SIFEN calculada por el servidor con las reglas compartidas (vacío de pendientes = apto). */
  aptitudApto: boolean;
  aptitudPendientes: string[];
  grupoCliente: string;
  condicionPago: string;
  vendedor: string;
  rutaEntrega: string;
  zonaComercial: string;
  bloqueadoVentas: boolean;
  activo: boolean;
};

/** Cliente completo (GET /api/clientes/[id]); los *Id son UUID de catálogos de la empresa. */
export type ClienteDetalle = {
  id: string;
  codigo: string;
  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoPersona: ClienteTipoPersona;
  paisCodigo: string;
  paisNombre: string;
  tipoDocumento: string;
  descripcionDocumentoIdentidad: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  emailCopia: string;
  telefono: string;
  celular: string;
  telefonoDdi: string;
  celularDdi: string;
  telefonoPais: string;
  telefonoArea: string;
  celularPais: string;
  celularArea: string;
  limiteCredito: string;
  limiteCreditoTemporal: string;
  fechaVencimientoCredito: string;
  grupoClienteId: string;
  condicionPagoId: string;
  monedaCodigoPredeterminada: string;
  listaPrecioId: string;
  canalVentaId: string;
  vendedorId: string;
  codigoExterno: string;
  gln: string;
  descuentoComercialPct: string;
  bloqueadoVentas: boolean;
  motivoBloqueoVentas: string;
  diaPreferidoCobro: number | null;
  requiereOrdenCompra: boolean;
  emailFacturacion: string;
  emailCobranzas: string;
  recibeDocumentoElectronico: boolean;
  rutaEntregaId: string;
  zonaComercialId: string;
  frecuenciaEntrega: string;
  /** Día del mes (1–31) de entrega cuando la frecuencia es MENSUAL; vacío en cualquier otro caso. */
  diaMesEntrega: string;
  diasEntrega: number[];
  observacionComercial: string;
  observacionLogistica: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};
