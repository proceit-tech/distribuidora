/** Pestaña del formulario de Clientes a la que pertenece un mensaje de error de la API (alta y edición). */
export type PestanaCliente = "fiscal" | "comercial" | "contactos" | "direcciones" | "logistica" | "documentos";

export function pestanaDeErrorApi(mensaje: string): PestanaCliente {
  const texto = mensaje.toLowerCase();
  if (/contacto/.test(texto)) return "contactos";
  if (/documento de cliente|nombre de archivo|url segura|fecha de vencimiento de un documento/.test(texto)) {
    return "documentos";
  }
  if (/direcci|ubicaci|departamento|distrito|ciudad|fiscal|entrega predeterminada/.test(texto) && !/identificaci/.test(texto)) {
    return "direcciones";
  }
  if (/frecuencia|días de entrega|ruta|zona|vendedor/.test(texto)) return "logistica";
  if (/crédito|límite|tasa de cambio|conversi|cobro|bloqueo|descuento|moneda|lista de precios|condici|canal|gln|código externo|correo de (facturación|cobranzas)/.test(texto)) {
    return "comercial";
  }
  return "fiscal";
}
