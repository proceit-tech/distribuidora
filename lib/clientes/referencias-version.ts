import type { PoolClient } from "pg";

/**
 * Reglas puras (probadas sin base) de la edición de clientes:
 *  · CLI-A01: una referencia comercial que el cliente YA tiene y no cambia se tolera aunque se haya inactivado después; solo lo nuevo o modificado debe pertenecer
 *    a la empresa y estar activo.
 *  · CLI-A03: la versión que el operador tenía en pantalla (actualizadoEn) se normaliza a ISO con milisegundos para compararla en la base tras bloquear la fila.
 */

/** campo del cuerpo → [tabla, etiqueta, columna del cliente]. */
export const REFERENCIAS_CLIENTE = {
  grupoClienteId: ["grupos_cliente", "grupo de cliente", "grupo_cliente_id"],
  listaPrecioId: ["listas_precio", "lista de precios", "lista_precio_id"],
  rutaEntregaId: ["rutas_entrega", "ruta de entrega", "ruta_entrega_id"],
  zonaComercialId: ["zonas_comerciales", "zona comercial", "zona_comercial_id"],
  vendedorId: ["vendedores", "vendedor", "vendedor_id"],
  canalVentaId: ["canales_venta", "canal de venta", "canal_venta_id"],
} as const;

type Conexion = Pick<PoolClient, "query">;

/** ISO con milisegundos, o null si falta o no es una fecha válida (entonces el guardado se rechaza con 409). */
export function leerVersionEsperada(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.trim() === "") return null;

  const ms = Date.parse(valor);

  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Verifica las referencias del cuerpo. `actuales` = valores hoy guardados en el MISMO cliente (columna → uuid|null). Lo que no cambia no se consulta; lo nuevo o modificado debe
 * existir en la empresa de la sesión y estar activo. Lanza Error con el mensaje para el usuario.
 */
export async function validarReferenciasCliente(conexion: Conexion, empresaId: string, referencias: Record<string, string | null>, actuales: Record<string, string | null | undefined>) {
  for (const [campo, [tabla, etiqueta, columna]] of Object.entries(REFERENCIAS_CLIENTE)) {
    const valor = referencias[campo];

    if (!valor || valor === (actuales[columna] ?? null)) continue;

    const ok = await conexion.query(`SELECT 1 FROM ${tabla} WHERE id = $1 AND empresa_id = $2 AND activo = true`, [valor, empresaId]);

    if (ok.rowCount !== 1) throw new Error(`El valor seleccionado para ${etiqueta} no está disponible.`);
  }
}
