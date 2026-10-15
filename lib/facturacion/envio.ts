import type { Pool } from "pg";

import { guardarClasificacionIva, type ClasificacionGuardar, type ResultadoGuardado } from "@/lib/facturacion/ajuste-fiscal";
import { crearFacturaElectronica, type CuerpoFactura } from "@/lib/facturacion/emision";
import { configGatewayValida, enviarDocumentoGateway, leerCredenciales, type ConfigGateway, type Dependencias, type FaseEnvio, type ResultadoEnvio } from "@/lib/facturacion/gateway";
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
  /** Causa del ERROR_ENVIO (define si el reenvío es seguro o exige confirmación). */
  errorTipo: string | null;
  resultado: ResultadoEnvio["resultado"] | "YA_ENVIADO";
  http: number | null;
  mensaje: string | null;
  lote: string | null;
  cdc: string | null;
  estadoGateway: string | null;
  errores: string[];
  fases: FaseEnvio[];
  /** Resultado de «Guardar también en Productos» por producto (solo si el operador lo pidió). */
  ajustesProducto?: ResultadoGuardado[];
};

/** Configuración del gateway de la empresa y presencia de credenciales (sin leerlas hacia afuera). 409 si falta algo. */
export async function configuracionGateway(db: Db, empresaId: string, dep: Dependencias = {}): Promise<ConfigGateway> {
  const cfg = await db.query(`SELECT base_url AS "baseUrl", credencial_ref AS "credencialRef", timeout_ms AS "timeoutMs" FROM fe_gateway_config WHERE empresa_id = $1 AND activo`, [empresaId]);
  const fila = cfg.rows[0] as { baseUrl: string; credencialRef: string; timeoutMs: number } | undefined;

  if (!fila) throw new ErrorFacturacion(409, "La empresa no tiene configurado el gateway de facturación electrónica.");

  const valida = configGatewayValida(empresaId, fila);

  if (!valida) throw new ErrorFacturacion(409, "La configuración del gateway de esta empresa no es válida (URL https y tiempo de espera).");
  if (!leerCredenciales(valida.credencialRef, dep.env)) throw new ErrorFacturacion(409, "Las credenciales del gateway de esta empresa no están configuradas en el servidor.");

  return valida;
}

const SQL_REGISTRAR_ENVIO = "SELECT fe_documento_registrar_envio($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)";

const MENSAJE_INDETERMINADO = "No se pudo guardar el resultado del envío: el resultado es indeterminado. Verifique el documento en el gateway antes de reenviar.";

/** Resultado que describe lo que REALMENTE quedó guardado cuando no se pudo registrar el del gateway: indeterminado, sin lote ni CDC ni cuerpo (lo mismo que la base). */
function comoIndeterminado(r: ResultadoEnvio, mensaje: string = MENSAJE_INDETERMINADO): ResultadoEnvio {
  return {
    ...r, resultado: "RESPUESTA_INVALIDA", estadoLocal: "ENVIO_INDETERMINADO", errorTipo: null, mensaje, lote: null, cdc: null, cdcInformado: null, estadoGateway: null, errores: [], respuesta: null,
    fases: [...r.fases, { fase: "RESPUESTA", ok: false, detalle: mensaje, http: r.http }],
  };
}

async function estadoPersistido(db: Db, empresaId: string, documentoId: string): Promise<string | null> {
  try {
    const q = await db.query("SELECT estado_local AS estado FROM documentos_electronicos WHERE empresa_id = $1 AND id = $2", [empresaId, documentoId]);

    return (q.rows[0] as F | undefined)?.estado ? String((q.rows[0] as F).estado) : null;
  } catch {
    return null;
  }
}

/** Tras perder la confirmación de un cierre (el documento ya no está «ENVIANDO»): se lee el estado REAL guardado; solo se informa lo que la base confirma. */
async function resultadoPersistido(db: Db, empresaId: string, documentoId: string, r: ResultadoEnvio): Promise<ResultadoEnvio> {
  const guardado = await estadoPersistido(db, empresaId, documentoId);

  if (guardado === r.estadoLocal) return r;
  if (guardado === "ENVIADO") return { ...comoIndeterminado(r), resultado: "OK", estadoLocal: "ENVIADO", mensaje: "El documento figura como enviado (confirmado por otra operación)." };
  if (guardado === "ENVIO_INDETERMINADO") return comoIndeterminado(r);

  return comoIndeterminado(r, `${MENSAJE_INDETERMINADO} (estado guardado: ${guardado ?? "no confirmado"})`);
}

/**
 * Persiste el resultado de la transmisión (RN-E2-07) y DEVUELVE el resultado efectivo: lo que la API informa es siempre lo que quedó guardado. Si la base falla DESPUÉS de
 * transmitir: 1 reintento con el mismo resultado; si vuelve a fallar se cierra como ENVIO_INDETERMINADO mínimo y se informa ESE estado (nunca el ENVIADO del gateway); si el
 * cierre se confirmó pero se perdió la respuesta (ENVIO_NO_INICIADO en el reintento) se lee el estado real guardado; si ni eso es posible, 502 (el documento queda ENVIANDO y a
 * los 2 minutos pasa a indeterminado: nunca se reenvía a ciegas).
 */
async function cerrarEnvio(db: Db, empresaId: string, usuarioId: string, documentoId: string, r: ResultadoEnvio): Promise<ResultadoEnvio> {
  const completo = [empresaId, usuarioId, documentoId, r.faseFinal, r.resultado, r.estadoLocal, r.errorTipo, r.http, crypto.randomUUID(), r.estadoGateway, r.mensaje, r.lote, r.cdc, r.cdcInformado, r.respuesta ? JSON.stringify(r.respuesta) : null];
  let fallo = false;

  for (let intento = 0; intento < 2; intento++) {
    try {
      await db.query(SQL_REGISTRAR_ENVIO, completo);

      return r;
    } catch (error) {
      const pg = error as { code?: string; detail?: string };

      if (fallo && pg.detail === "NEX:ENVIO_NO_INICIADO") return resultadoPersistido(db, empresaId, documentoId, r);
      // Errores de negocio de la función (permiso, documento ajeno, estado) no se arreglan reintentando.
      if (pg.code === "42501" || (pg.detail && pg.detail.startsWith("NEX:"))) throw error;
      fallo = true;
    }
  }
  try {
    await db.query(SQL_REGISTRAR_ENVIO, [empresaId, usuarioId, documentoId, r.faseFinal, "RESPUESTA_INVALIDA", "ENVIO_INDETERMINADO", null, r.http, crypto.randomUUID(), null, MENSAJE_INDETERMINADO, null, null, null, null]);

    return comoIndeterminado(r);
  } catch (error) {
    // Alguno de los intentos anteriores pudo haberse confirmado sin que llegara la respuesta.
    if ((error as { detail?: string }).detail === "NEX:ENVIO_NO_INICIADO") return resultadoPersistido(db, empresaId, documentoId, r);
    // El cierre mínimo pudo haberse confirmado aunque falló la respuesta: solo se informa lo que la base confirma.
    if ((await estadoPersistido(db, empresaId, documentoId)) === "ENVIO_INDETERMINADO") return comoIndeterminado(r);

    throw new ErrorFacturacion(502, "El documento pudo haber sido transmitido pero no se pudo guardar el resultado: es indeterminado. Verifique su estado en el gateway antes de reenviar.");
  }
}

/** Envía un documento ya creado (PENDIENTE_ENVIO o ERROR_ENVIO). Lanza ErrorFacturacion/errores de la función SQL si no es enviable. */
export async function enviarDocumento(db: Db, empresaId: string, usuarioId: string, documentoId: string, dep: Dependencias = {}, opciones: { confirmaRechazo?: boolean } = {}): Promise<Omit<RespuestaEnvio, "reutilizado" | "numero" | "documentoId"> & { numero: string }> {
  const config = await configuracionGateway(db, empresaId, dep);
  const inicio = await db.query(
    `SELECT o_resultado AS resultado, o_payload AS payload, o_numero AS numero, o_tipo AS tipo, o_establecimiento AS establecimiento, o_punto AS punto FROM fe_documento_iniciar_envio($1::uuid, $2::uuid, $3::uuid, $4::boolean)`,
    [empresaId, usuarioId, documentoId, opciones.confirmaRechazo === true],
  );
  const fila = inicio.rows[0] as F;
  const numero = String(fila.numero);

  if (fila.resultado !== "INICIADO" || !fila.payload || typeof fila.payload !== "object") {
    throw new ErrorFacturacion(409, "Un envío anterior de este documento quedó sin cerrar: el resultado es indeterminado. Consulte su estado en el gateway antes de reenviar.");
  }

  let r: ResultadoEnvio;

  try {
    const enviado = await enviarDocumentoGateway(config, fila.payload as Record<string, unknown>, { tipo: String(fila.tipo), establecimiento: String(fila.establecimiento), puntoExpedicion: String(fila.punto), numero }, dep);

    if ("sinContrato" in enviado) throw new Error("sin credenciales");
    r = enviado;
  } catch (error) {
    // Fallo inesperado después de iniciar: puede haber salido la solicitud. Se cierra como indeterminado (jamás como error reintentable).
    console.error("Error inesperado al enviar el documento electrónico:", error instanceof Error ? error.message : "desconocido");
    r = {
      resultado: "RED", faseFinal: "TRANSMISION", estadoLocal: "ENVIO_INDETERMINADO", errorTipo: null, cdcInformado: null, http: null, mensaje: "Error interno durante el envío: el resultado es indeterminado.", lote: null, cdc: null,
      estadoGateway: null, errores: [], respuesta: null, fases: [{ fase: "TRANSMISION", ok: false, detalle: "Error interno durante el envío." }],
    };
  }

  r = await cerrarEnvio(db, empresaId, usuarioId, documentoId, r);

  return { numero, estadoLocal: r.estadoLocal, errorTipo: r.errorTipo, resultado: r.resultado, http: r.http, mensaje: r.mensaje, lote: r.lote, cdc: r.cdc, estadoGateway: r.estadoGateway, errores: r.errores, fases: r.fases };
}

/** «Enviar factura»: valida, crea (idempotente) y transmite. Repetir con la misma clave no duplica documento ni numeración ni envío. */
export async function emitirFactura(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura, dep: Dependencias = {}): Promise<RespuestaEnvio> {
  await configuracionGateway(db, empresaId, dep);

  const salida: { guardar: ClasificacionGuardar[] } = { guardar: [] };
  const creado = await crearFacturaElectronica(db, empresaId, usuarioId, cuerpo, salida);
  const documentoId = String(creado.documentoId);
  const numero = String(creado.numero);
  const reutilizado = creado.reutilizado === true;

  // «Guardar también en Productos» (confirmación explícita por línea): DESPUÉS de reservar el documento y ANTES de transmitir, sentencia atómica con bitácora; es idempotente (si el
  // cadastro ya tiene esos valores no cambia nada) y un fallo NO impide emitir: se informa y el ajuste queda solo en esta factura.
  // La idempotencia protege TAMBIÉN el cadastro: solo la creación ORIGINAL del documento puede escribir en Productos. Una repetición de la misma operación (doble clic, reintento,
  // documento ya creado, pendiente, indeterminado o enviado) no toca el producto ni la bitácora, aunque el cadastro haya cambiado entretanto por otra vía.
  const ajustesProducto: ResultadoGuardado[] = [];

  for (const c of salida.guardar) {
    ajustesProducto.push(reutilizado
      ? { productoId: c.productoId, codigo: c.codigo, estado: "OMITIDO", mensaje: "Esta factura ya había sido creada: no se vuelve a escribir en Productos." }
      : await guardarClasificacionIva(db, empresaId, usuarioId, documentoId, c));
  }

  const extra = ajustesProducto.length > 0 ? { ajustesProducto } : {};

  try {
    return { documentoId, reutilizado, ...(await enviarDocumento(db, empresaId, usuarioId, documentoId, dep)), numero, ...extra };
  } catch (error) {
    const pg = error as { detail?: string };

    // Ya enviado (doble clic, reintento tras perder la respuesta): se informa sin reenviar.
    if (pg.detail === "NEX:YA_ENVIADO") {
      return { documentoId, numero, reutilizado, estadoLocal: "ENVIADO", errorTipo: null, resultado: "YA_ENVIADO", http: null, mensaje: "Este documento ya fue enviado al gateway; no se reenvía.", lote: null, cdc: null, estadoGateway: null, errores: [], fases: [], ...extra };
    }
    if (error instanceof ErrorFacturacion) throw new ErrorFacturacion(error.estado, `${error.message} (Documento ${numero})`);
    if (pg.detail && /^NEX:(ENVIO_EN_CURSO|ENVIO_INDETERMINADO|REENVIO_REQUIERE_CONFIRMACION)$/.test(pg.detail)) {
      throw new ErrorFacturacion(409, `${(error as Error).message} (Documento ${numero}).`);
    }

    throw error;
  }
}
