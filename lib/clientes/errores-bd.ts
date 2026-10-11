/** Traduce violaciones de restricciones de PostgreSQL de Clientes a mensajes que nombran la causa real. */
const POR_RESTRICCION: Record<string, string> = {
  clientes_empresa_identificacion_key: "Ya existe un cliente con esa identificación.",
  clientes_empresa_innominado_key: "Ya existe el cliente Innominado de esta empresa; reutilícelo en lugar de crear otro.",
  clientes_empresa_external_codigo_key: "Ya existe un cliente con ese código externo.",
  clientes_empresa_codigo_key: "No fue posible asignar el código del cliente; intente nuevamente.",
  cliente_contactos_uno_principal_key: "Solo puede haber un contacto principal por cliente.",
  direcciones_cliente_uno_fiscal_key: "Solo puede haber una dirección fiscal por cliente.",
  direcciones_cliente_uno_defecto_entrega_key: "Solo puede haber una dirección de entrega predeterminada por cliente.",
};

export function mensajeRestriccionCliente(error: { code?: string; constraint?: string }): string | null {
  if (error.code === "23505") {
    return (error.constraint && POR_RESTRICCION[error.constraint]) || "Ya existe un registro con un valor que debe ser único.";
  }

  if (error.code === "22001") return "Un valor supera la longitud máxima permitida por la base de datos.";

  return null;
}
