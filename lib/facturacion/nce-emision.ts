import type { Pool } from "pg";

import { parseDec } from "@/lib/facturacion/calculo";
import { configuracionGateway, enviarDocumento, type RespuestaEnvio } from "@/lib/facturacion/envio";
import type { Dependencias } from "@/lib/facturacion/gateway";
import { crearNotaCredito, prepararNce, traducirErrorNce, type CuerpoNce } from "@/lib/facturacion/nce";
import { consultarEstado, ErrorFacturacion } from "@/lib/facturacion/shared";

/**
 * «Emitir Nota de Crédito» (PRO-94): preflight del gateway ANTES de reservar numeración → validación y payload (nada se escribe) → creación transaccional e idempotente de la NCE (reserva el número
 * UNA vez, con la FE original bloqueada) → envío al gateway FUERA de transacción con la misma exclusión mutua del envío de facturas (FAT-E2). HTTP 200 / lote NO es aprobación SIFEN; el estado
 * fiscal solo lo fija la consulta con tipoDoc NCE. Un timeout o respuesta ambigua queda INDETERMINADO y jamás se reenvía a ciegas.
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

/**
 * Repetición de la misma operación (doble clic, reintento tras perder la respuesta): si ya existe una NCE con esa clave de idempotencia se reutiliza SIN revalidar saldos (la propia NCE ya
 * consumió/bloquea el saldo y la validación fallaría contra sí misma). Se comprueba que la FE, el motivo y las líneas sean los mismos; si no, conflicto (la clave no se reutiliza con otro contenido).
 */
export async function repeticion(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoNce): Promise<{ documentoId: string; numero: string } | null> {
  const r = await db.query(
    `SELECT d.id, d.numero, d.tipo, d.sucursal_id AS "sucursalId", d.punto_expedicion AS "puntoCodigo", o.fe_id AS "feId", o.motivo, o.observacion FROM documentos_electronicos d LEFT JOIN nce_origen o ON o.empresa_id = d.empresa_id AND o.nce_id = d.id
      WHERE d.empresa_id = $1 AND d.clave_idempotencia = $2 AND sucursal_en_alcance($1::uuid, $3::uuid, d.sucursal_id)`,
    [empresaId, cuerpo.claveIdempotencia, usuarioId],
  );
  const d = r.rows[0] as F | undefined;

  if (!d) return null;

  const conflicto = () => new ErrorFacturacion(409, "La clave de la operación ya se usó con otro contenido. Recargue el formulario e intente de nuevo.");

  if (d.tipo !== "NCE" || d.feId !== cuerpo.facturaId || Number(d.motivo) !== cuerpo.motivo) throw conflicto();

  // Identidad completa (NCE-R01-03): sucursal, punto de expedición y observación también deben coincidir.
  const punto = await db.query("SELECT codigo FROM fe_puntos_expedicion WHERE empresa_id = $1 AND id = $2 AND sucursal_id = $3", [empresaId, cuerpo.puntoId, cuerpo.sucursalId]);
  const observacion = cuerpo.observacion.trim() === "" ? null : cuerpo.observacion.trim();

  if (d.sucursalId !== cuerpo.sucursalId || (punto.rows[0] as F | undefined)?.codigo !== d.puntoCodigo || (d.observacion ?? null) !== observacion) throw conflicto();

  const lineas = (await db.query("SELECT linea, cantidad::text AS cantidad, monto::text AS monto FROM nce_lineas WHERE empresa_id = $1 AND nce_id = $2", [empresaId, String(d.id)])).rows as F[];

  // INT-02: correspondencia BIYECTIVA por ordinal. Un ordinal repetido en el cuerpo nunca puede coincidir con dos líneas guardadas (ni una línea guardada con dos pedidas), y cada ordinal guardado
  // debe estar pedido exactamente una vez con el mismo valor (cantidad en Devolución; monto en 3/4/8), en precisión decimal. El orden de las líneas no importa; el ordinal distingue las líneas.
  const pedidas = new Map<number, { cantidad?: string; monto?: string }>();

  for (const l of cuerpo.lineas) {
    if (pedidas.has(l.linea)) throw conflicto();

    pedidas.set(l.linea, l);
  }
  if (lineas.length !== pedidas.size) throw conflicto();

  const campo = cuerpo.motivo === 2 ? "cantidad" : "monto";

  for (const g of lineas) {
    const p = pedidas.get(Number(g.linea));
    const pedido = p ? parseDec(p[campo], 8) : null;
    const guardado = parseDec(String(g[campo]), 8);

    if (p === undefined || pedido === null || guardado === null || pedido !== guardado) throw conflicto();
  }

  return { documentoId: String(d.id), numero: String(d.numero) };
}

export async function emitirNce(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoNce, dep: Dependencias = {}): Promise<RespuestaEnvio> {
  // 1) Gateway configurado y credenciales presentes ANTES de reservar numeración (409 sin consumir número).
  await configuracionGateway(db, empresaId, dep, usuarioId);

  let documentoId: string;
  let numero: string;
  let reutilizado: boolean;

  try {
    const previa = await repeticion(db, empresaId, usuarioId, cuerpo);

    if (previa) {
      ({ documentoId, numero } = previa);
      reutilizado = true;
    } else {
      // 2) Validación completa y payload (sin escribir) → 3) creación transaccional (revalida bajo bloqueo de la FE y reserva el número una sola vez).
      const prep = await prepararNce(db, empresaId, usuarioId, cuerpo);
      const creado = await crearNotaCredito(db, empresaId, usuarioId, cuerpo, prep);

      documentoId = String(creado.documentoId);
      numero = String(creado.numero);
      reutilizado = creado.reutilizado === true;
    }
  } catch (error) {
    return traducirErrorNce(error);
  }

  // 4) Envío (misma exclusión mutua y evidencia que la factura).
  try {
    return { documentoId, reutilizado, ...(await enviarDocumento(db, empresaId, usuarioId, documentoId, dep)), numero };
  } catch (error) {
    const pg = error as { detail?: string };

    if (pg.detail === "NEX:YA_ENVIADO") {
      return { documentoId, numero, reutilizado, estadoLocal: "ENVIADO", errorTipo: null, resultado: "YA_ENVIADO", http: null, mensaje: "Esta nota de crédito ya fue enviada al gateway; no se reenvía.", lote: null, cdc: null, estadoGateway: null, errores: [], fases: [] };
    }
    if (error instanceof ErrorFacturacion) throw new ErrorFacturacion(error.estado, `${error.message} (Nota de crédito ${numero})`);
    if (pg.detail && /^NEX:(ENVIO_EN_CURSO|ENVIO_INDETERMINADO|REENVIO_REQUIERE_CONFIRMACION|NCE_RECHAZADA)$/.test(pg.detail)) {
      throw new ErrorFacturacion(409, `${(error as Error).message} (Nota de crédito ${numero}).`);
    }

    throw error;
  }
}

/**
 * Antes de listar las facturas de un cliente (RN-01): consulta, con límites, las FE ya enviadas que aún no figuran como aprobadas (máx. 5 y no consultadas hace menos de 60 s), para que una factura
 * recién aprobada por SIFEN pueda seleccionarse. Un fallo de una consulta no interrumpe la búsqueda: esa factura simplemente no aparece como aprobada.
 */
/**
 * Al abrir una factura original (NCE-R01-04): consulta, con límites (máx. 3 y no consultadas hace menos de 60 s), sus NCE enviadas aún sin resultado, para mostrar saldo/bloqueo al día. Es la MISMA
 * consulta del worker (consultarEstado con sus guardas); no reenvía nada y un fallo no interrumpe la lectura.
 */
export async function reconciliarNcePendientes(db: Db, empresaId: string, usuarioId: string, feId: string, dep: Dependencias = {}): Promise<number> {
  const r = await db.query(
    `SELECT n.id FROM nce_origen o JOIN documentos_electronicos n ON n.empresa_id = o.empresa_id AND n.id = o.nce_id
      WHERE o.empresa_id = $1 AND o.fe_id = $3 AND n.estado_local = 'ENVIADO' AND n.estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE') AND sucursal_en_alcance($1::uuid, $2::uuid, n.sucursal_id)
        AND (n.ultima_consulta_at IS NULL OR n.ultima_consulta_at < now() - interval '60 seconds')
      ORDER BY n.creado_at DESC LIMIT 3`,
    [empresaId, usuarioId, feId],
  );
  let n = 0;

  for (const f of r.rows as F[]) {
    try {
      await consultarEstado(db, empresaId, usuarioId, String(f.id), dep, { flujoNce: true });
      n += 1;
    } catch (error) {
      console.error("No se pudo consultar una nota de crédito pendiente:", error instanceof Error ? error.message : "desconocido");
    }
  }

  return n;
}

export async function reconciliarFacturasPendientes(db: Db, empresaId: string, usuarioId: string, clienteId: string, dep: Dependencias = {}): Promise<number> {
  const r = await db.query(
    `SELECT d.id FROM documentos_electronicos d
      WHERE d.empresa_id = $1 AND d.tipo = 'FE' AND d.cliente_id = $3 AND d.estado_local IN ('ENVIADO', 'ENVIO_INDETERMINADO') AND d.estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO') AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id)
        AND (d.ultima_consulta_at IS NULL OR d.ultima_consulta_at < now() - interval '60 seconds')
      ORDER BY d.fecha_emision DESC, d.id DESC LIMIT 5`,
    [empresaId, usuarioId, clienteId],
  );
  let n = 0;

  for (const f of r.rows as F[]) {
    try {
      await consultarEstado(db, empresaId, usuarioId, String(f.id), dep, { flujoNce: true });
      n += 1;
    } catch (error) {
      console.error("No se pudo consultar una factura pendiente:", error instanceof Error ? error.message : "desconocido");
    }
  }

  return n;
}
