/**
 * Estados de un documento electrónico. Tres ejes INDEPENDIENTES (no se reducen a un «aprobado» booleano): envío local, estado SIFEN informado por el
 * gateway y estado del e-mail. Los textos son de pantalla (español, PY). Este módulo es puro: lo usan el servidor, la pantalla y las pruebas.
 */

export const TIPOS_DOCUMENTO = ["FE", "NCE", "NDE", "NRE", "AFE"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ETIQUETA_TIPO: Record<TipoDocumento, string> = {
  FE: "Factura electrónica",
  NCE: "Nota de crédito",
  NDE: "Nota de débito",
  NRE: "Nota de remisión",
  AFE: "Autofactura",
};

/** Horas sin resultado fiscal definitivo a partir de las cuales una NCE muestra «Requiere revisión» (provisional; la cadencia y el horizonte comunes a todos los documentos se definirán aparte). Solo etiqueta. */
export const UMBRAL_REVISION_HORAS = 24;

export const ESTADOS_LOCAL = ["PENDIENTE_ENVIO", "ENVIANDO", "ENVIO_INDETERMINADO", "ENVIADO", "ERROR_ENVIO"] as const;
export const ESTADOS_SIFEN = ["SIN_CONSULTA", "PENDIENTE", "APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO", "NO_RECONOCIDO"] as const;
export const ESTADOS_EMAIL = ["NO_INFORMADO", "SIN_EMAIL", "PENDIENTE", "ENVIADO", "ERROR"] as const;

export type EstadoLocal = (typeof ESTADOS_LOCAL)[number];
export type EstadoSifen = (typeof ESTADOS_SIFEN)[number];
export type EstadoEmail = (typeof ESTADOS_EMAIL)[number];

export const ETIQUETA_LOCAL: Record<EstadoLocal, string> = {
  PENDIENTE_ENVIO: "Pendiente de envío",
  ENVIANDO: "Enviando",
  ENVIO_INDETERMINADO: "Envío indeterminado",
  ENVIADO: "Enviado",
  ERROR_ENVIO: "Error de envío",
};

export const ETIQUETA_SIFEN: Record<EstadoSifen, string> = {
  SIN_CONSULTA: "Sin consultar",
  PENDIENTE: "Pendiente de respuesta",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
  INUTILIZADO: "Inutilizado",
  NO_RECONOCIDO: "Estado no reconocido",
};

export const ETIQUETA_EMAIL: Record<EstadoEmail, string> = {
  NO_INFORMADO: "Sin información de e-mail",
  SIN_EMAIL: "Sin e-mail",
  PENDIENTE: "E-mail pendiente",
  ENVIADO: "E-mail enviado",
  ERROR: "Error de e-mail",
};

export const ETIQUETA_RESULTADO_INTENTO: Record<string, string> = {
  OK: "Consulta satisfactoria",
  NO_ENCONTRADO: "Documento no encontrado en el gateway",
  ERROR_HTTP: "Error HTTP del gateway",
  TIMEOUT: "Tiempo de espera agotado",
  RED: "Error de red",
  RESPUESTA_INVALIDA: "Respuesta no interpretable",
  CDC_DIVERGENTE: "CDC distinto del registrado",
};

/** Etiqueta del resultado de un intento según su tipo: un OK de ENVÍO significa «recibido por el gateway», nunca aprobación SIFEN. */
export function etiquetaIntento(tipo: string, resultado: string): string {
  if (tipo === "ENVIO") {
    return (
      ({ OK: "Recepción confirmada por el gateway (estado fiscal por consultar)", ERROR_HTTP: "Rechazado o error del gateway", TIMEOUT: "Tiempo de espera agotado (indeterminado)", RED: "Error de red (indeterminado)", RESPUESTA_INVALIDA: "Respuesta no concluyente: recepción NO confirmada (indeterminado)" } as Record<string, string>)[resultado] ?? resultado
    );
  }

  return ETIQUETA_RESULTADO_INTENTO[resultado] ?? resultado;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Traduce el campo «Estado» que informa el gateway. SOLO se acepta una coincidencia exacta con un estado conocido; cualquier otro texto queda como
 * NO_RECONOCIDO (se conserva el texto original en estado_gateway_texto). Un HTTP 200 por sí solo nunca produce APROBADO.
 */
export function estadoSifenDesdeGateway(texto: unknown): EstadoSifen {
  if (typeof texto !== "string") return "NO_RECONOCIDO";

  switch (sinTildes(texto).trim().toLowerCase()) {
    case "aprobado":
      return "APROBADO";
    case "rechazado":
      return "RECHAZADO";
    case "cancelado":
      return "CANCELADO";
    case "inutilizado":
      return "INUTILIZADO";
    case "pendiente":
      return "PENDIENTE";
    default:
      return "NO_RECONOCIDO";
  }
}

/**
 * PRO-338-R02 (AUD-R01 F002): ÚNICA definición de «enviado sin resultado fiscal final». La usan el badge amarillo (presentacion-sifen.ts) y el indicador/filtro PEND_RESPUESTA (shared.ts), así que
 * ningún documento amarillo queda fuera del indicador. ENVIO_INDETERMINADO también cuenta en PEND_ENVIO (la transmisión no está confirmada): ese documento está en las dos fases a la vez, y
 * así lo explican los textos de ayuda de ambas tarjetas. APROBADO / RECHAZADO solo cuentan el estado fiscal persistido (una alerta CDC_DIVERGENTE no cambia estado_sifen).
 */
export const ESTADOS_LOCAL_TRANSMITIDO: readonly EstadoLocal[] = ["ENVIADO", "ENVIO_INDETERMINADO"];
export const ESTADOS_SIFEN_SIN_FINAL: readonly EstadoSifen[] = ["SIN_CONSULTA", "PENDIENTE", "NO_RECONOCIDO"];

/** Indicadores de la pantalla (tarjetas). Cada uno es también un filtro; la definición SQL equivalente vive en lib/facturacion/shared.ts. */
export const GRUPOS_INDICADOR = ["PEND_ENVIO", "PEND_RESPUESTA", "APROBADO", "RECHAZADO", "EMAIL_ENVIADO", "EMAIL_ERROR", "SIN_EMAIL"] as const;
export type GrupoIndicador = (typeof GRUPOS_INDICADOR)[number];

export function numeroDocumento(d: { establecimiento: string; puntoExpedicion: string; numero: string; serie?: string | null }) {
  return `${d.establecimiento}-${d.puntoExpedicion}-${d.numero}${d.serie ? ` (${d.serie})` : ""}`;
}
