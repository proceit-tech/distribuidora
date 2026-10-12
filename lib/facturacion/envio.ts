import type { Pool } from "pg";

import { crearFacturaElectronica, type CuerpoFactura } from "@/lib/facturacion/emision";
import { enviarDocumentoGateway, leerCredenciales, type ConfigGateway, type Dependencias, type FaseEnvio, type ResultadoEnvio } from "@/lib/facturacion/gateway";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

/**
 * Envío de la Factura Electrónica al gateway (recepcion_de) desde el servidor. Ciclo:
 *   1) preflight: gateway configurado y credenciales presentes ANTES de reservar numeración (si no se puede enviar, no se consume número);
 *   2) crear el documento (idempotente por clave; reserva el número una sola vez);
 *   3) fe_documento_iniciar_envio: exclusión mutua (ENVIANDO) y payload inmutable; un envío indeterminado NUNCA se reenvía a ciegas;
 *   4) transmisión FUERA de transacción;
 *   5) fe_documento_registrar_envio: intento (fase, HTTP, resultado, lote/CDC solo si el gateway los informó) y estado local.
 * Nunca toca estado_sifen: el HTTP 200 de recepción no es aprobación; la aprobación solo la fija la consulta de estado.
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export type RespuestaEnvio = {
  documentoId: string;
  numero: string;
  reutilizado: boolean;
  /** Estado local resultante del envío. */
  estadoLocal: string;
  resultado: ResultadoEnvio["resultado"] | "YA_ENVIADO";
  http: number | null;
  mensaje: string | null;
  lote: string | null;
  cdc: string | null;
  estadoGateway: string | null;
  errores: string[];
  fases: FaseEnvio[];
};

/** Configuración del gateway de la empresa y presencia de credenciales (sin leerlas hacia afuera). 409 si falta algo. */
export async function configuracionGateway(db: Db, empresaId: string, dep: Dependencias = {}): Promise<ConfigGateway> {
  const cfg = await db.query(`SELECT base_url AS "baseUrl", credencial_ref AS "credencialRef", timeout_ms AS "timeoutMs" FROM fe_gateway_config WHERE empresa_id = $1 AND activo`, [empresaId]);
  const fila = cfg.rows[0] as { baseUrl: string; credencialRef: string; timeoutMs: number } | undefined;

  if (!fila) throw new ErrorFacturacion(409, "La empresa no tiene configurado el gateway de facturación electrónica.");
  if (!leerCredenciales(fila.credencialRef, dep.env)) throw new ErrorFacturacion(409, "Las credenciales del gateway de esta empresa no están configuradas en el servidor.");

  return { ...fila, empresaId };
}

/** Envía un documento ya creado (PENDIENTE_ENVIO o ERROR_ENVIO). Lanza ErrorFacturacion/errores de la función SQL si no es enviable. */
export async function enviarDocumento(db: Db, empresaId: string, usuarioId: string, documentoId: string, dep: Dependencias = {}): Promise<Omit<RespuestaEnvio, "reutilizado" | "numero" | "documentoId"> & { numero: string }> {
  const config = await configuracionGateway(db, empresaId, dep);
  const inicio = await db.query(`SELECT o_resultado AS resultado, o_payload AS payload, o_numero AS numero FROM fe_documento_iniciar_envio($1::uuid, $2::uuid, $3::uuid)`, [empresaId, usuarioId, documentoId]);
  const fila = inicio.rows[0] as F;
  const numero = String(fila.numero);

  if (fila.resultado !== "INICIADO" || !fila.payload || typeof fila.payload !== "object") {
    throw new ErrorFacturacion(409, "Un envío anterior de este documento quedó sin cerrar: el resultado es indeterminado. Consulte su estado en el gateway antes de reenviar.");
  }

  let r: ResultadoEnvio;

  try {
    const enviado = await enviarDocumentoGateway(config, fila.payload as Record<string, unknown>, dep);

    if ("sinContrato" in enviado) throw new Error("sin credenciales");
    r = enviado;
  } catch (error) {
    // Fallo inesperado después de iniciar: puede haber salido la solicitud. Se cierra como indeterminado (jamás como error reintentable).
    console.error("Error inesperado al enviar el documento electrónico:", error instanceof Error ? error.message : "desconocido");
    r = {
      resultado: "RED", faseFinal: "TRANSMISION", estadoLocal: "ENVIO_INDETERMINADO", http: null, mensaje: "Error interno durante el envío: el resultado es indeterminado.", lote: null, cdc: null,
      estadoGateway: null, errores: [], respuesta: null, fases: [{ fase: "TRANSMISION", ok: false, detalle: "Error interno durante el envío." }],
    };
  }

  await db.query(`SELECT fe_documento_registrar_envio($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`, [
    empresaId, usuarioId, documentoId, r.faseFinal, r.resultado, r.estadoLocal, r.http, crypto.randomUUID(), r.estadoGateway, r.mensaje, r.lote, r.cdc, r.respuesta ? JSON.stringify(r.respuesta) : null,
  ]);

  return { numero, estadoLocal: r.estadoLocal, resultado: r.resultado, http: r.http, mensaje: r.mensaje, lote: r.lote, cdc: r.cdc, estadoGateway: r.estadoGateway, errores: r.errores, fases: r.fases };
}

/** «Enviar factura»: valida, crea (idempotente) y transmite. Repetir con la misma clave no duplica documento ni numeración ni envío. */
export async function emitirFactura(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura, dep: Dependencias = {}): Promise<RespuestaEnvio> {
  await configuracionGateway(db, empresaId, dep);

  const creado = await crearFacturaElectronica(db, empresaId, usuarioId, cuerpo);
  const documentoId = String(creado.documentoId);
  const numero = String(creado.numero);
  const reutilizado = creado.reutilizado === true;

  try {
    return { documentoId, reutilizado, ...(await enviarDocumento(db, empresaId, usuarioId, documentoId, dep)), numero };
  } catch (error) {
    const pg = error as { detail?: string };

    // Ya enviado (doble clic, reintento tras perder la respuesta): se informa sin reenviar.
    if (pg.detail === "NEX:YA_ENVIADO") {
      return { documentoId, numero, reutilizado, estadoLocal: "ENVIADO", resultado: "YA_ENVIADO", http: null, mensaje: "Este documento ya fue enviado al gateway; no se reenvía.", lote: null, cdc: null, estadoGateway: null, errores: [], fases: [] };
    }
    if (error instanceof ErrorFacturacion) throw new ErrorFacturacion(error.estado, `${error.message} (Documento ${numero})`);
    if (pg.detail && /^NEX:(ENVIO_EN_CURSO|ENVIO_INDETERMINADO)$/.test(pg.detail)) {
      throw new ErrorFacturacion(409, `${(error as Error).message} (Documento ${numero}).`);
    }

    throw error;
  }
}
