/**
 * Prontitud del gateway de facturación electrónica de UNA empresa (PRO-133). Solo estados y textos (sin red, sin secretos): los usa el servidor para informarlo y la pantalla de la factura
 * para distinguir «gateway no configurado» de «gateway disponible» ANTES de enviar. «CONFIGURADO» significa que existe una fila activa válida y que el servidor tiene las credenciales de la
 * referencia; NO prueba que el gateway responda ni que las credenciales sean aceptadas (eso solo lo demuestra una autenticación real).
 */
export const ESTADOS_GATEWAY = ["SIN_CONFIGURAR", "INVALIDA", "SIN_CREDENCIALES", "CONFIGURADO", "NO_DISPONIBLE"] as const;

export type EstadoGateway = (typeof ESTADOS_GATEWAY)[number];
export type EstadoGatewayUI = { estado: EstadoGateway; mensaje: string };

export const MENSAJES_GATEWAY: Record<EstadoGateway, string> = {
  SIN_CONFIGURAR: "La empresa no tiene configurado el gateway de facturación electrónica. No se puede enviar: solicite al administrador la configuración.",
  INVALIDA: "La configuración del gateway de esta empresa no es válida (URL https y tiempo de espera). No se puede enviar.",
  SIN_CREDENCIALES: "Las credenciales del gateway de esta empresa no están configuradas en el servidor. No se puede enviar.",
  CONFIGURADO: "Gateway configurado para esta empresa.",
  // La consulta a la base FALLÓ: no se sabe si hay configuración. Nunca se presenta como «no configurado» (evita diagnósticos y altas duplicadas por error).
  NO_DISPONIBLE: "No fue posible verificar la configuración del gateway (servicio de datos no disponible). No se puede enviar ahora; reintente en unos minutos.",
};

export const puedeEnviarPorGateway = (g: EstadoGatewayUI | null | undefined): boolean => g?.estado === "CONFIGURADO";
