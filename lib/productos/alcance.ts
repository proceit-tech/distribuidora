import type { PoolClient } from "pg";

import { ErrorValidacion } from "@/lib/productos/errores";
import type { DatosProducto } from "@/lib/productos/normalizar";

/**
 * Alcance de CONSULTA de depósitos en Productos: el mismo criterio que Stock (lib/stock/shared.ts PERMITIDOS, NEX-046 deposito_en_alcance): alcance TODOS o depósitos
 * asignados, ACTIVOS O NO (el saldo y el historial de un depósito inactivo no desaparecen). Las operaciones NUEVAS (apertura de inventario, movimientos) siguen exigiendo
 * depósito activo (usuario_puede_deposito) y no se tocan aquí. No depende de la migración NEX-046: usa solo usuarios y usuario_deposito.
 * `columna`, `empresa` y `usuario` son fragmentos SQL propios del código (nunca texto del usuario).
 */
export const alcanceConsultaDeposito = (columna: string, empresa: string, usuario: string) =>
  `EXISTS (SELECT 1 FROM usuarios u_alc WHERE u_alc.empresa_id = ${empresa}::uuid AND u_alc.id = ${usuario}::uuid
      AND (u_alc.alcance_depositos = 'TODOS'
           OR EXISTS (SELECT 1 FROM usuario_deposito ud_alc WHERE ud_alc.empresa_id = u_alc.empresa_id AND ud_alc.usuario_id = u_alc.id AND ud_alc.deposito_id = ${columna})))`;

/**
 * PRD-R02-02: las políticas por depósito fuera del alcance del usuario no se ven ni se tocan. Como la sincronización es selectiva (una fila ausente del envío no se
 * borra), ocultarlas en la lectura no las destruye al guardar; aquí además se rechaza cualquier intento (aun fabricado) de crear, modificar o eliminar una política de
 * un depósito fuera de alcance.
 */
export async function validarAlcanceConfiguraciones(conexion: PoolClient, empresaId: string, usuarioId: string, productoId: string, datos: DatosProducto) {
  const idsExistentes = [...datos.depositos.map((x) => x.id), ...datos.eliminaciones.depositos].filter((x): x is string => !!x);
  const depositosNuevos = datos.depositos.map((x) => x.depositoId).filter((x): x is string => !!x);

  if (idsExistentes.length === 0 && depositosNuevos.length === 0) return;

  // Depósito actual de cada fila a modificar o eliminar.
  const filas = idsExistentes.length
    ? await conexion.query("SELECT deposito_id::text FROM producto_deposito_configuracion WHERE empresa_id = $1 AND producto_id = $2 AND id = ANY($3::uuid[])", [empresaId, productoId, idsExistentes])
    : { rows: [] as Array<{ deposito_id: string }> };
  const candidatos = [...new Set([...depositosNuevos, ...(filas.rows as Array<{ deposito_id: string }>).map((f) => f.deposito_id)])];
  const permitidos = await conexion.query(`SELECT d.id::text AS id FROM depositos d WHERE d.empresa_id = $1 AND d.id = ANY($3::uuid[]) AND ${alcanceConsultaDeposito("d.id", "$1", "$2")}`, [empresaId, usuarioId, candidatos]);
  const ok = new Set((permitidos.rows as Array<{ id: string }>).map((r) => r.id));

  if (candidatos.some((d) => !ok.has(d))) {
    throw new ErrorValidacion("No tiene alcance sobre uno de los depósitos de las políticas por depósito de este producto.", "depositos", 403);
  }
}
