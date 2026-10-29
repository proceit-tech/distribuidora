import type { Pool } from "pg";

import { TIMEOUT_GATEWAY_MAX_MS, type Dependencias } from "@/lib/facturacion/gateway";
import { UMBRAL_REVISION_HORAS } from "@/lib/facturacion/estados";
import { consultarEstado, ErrorFacturacion } from "@/lib/facturacion/shared";

export { UMBRAL_REVISION_HORAS };

/**
 * Consulta AUTOMÁTICA en el servidor de los documentos pendientes de resultado fiscal (PRO-94, RN-20): funciona sin navegador. Mecanismo reutilizable y parametrizable; la CADENCIA y el
 * horizonte concretos NO son normativos y se definirán para TODOS los documentos en un proyecto común posterior: los valores de abajo son una escalera PRUDENTE y provisional.
 *
 * Seguridad con varias instancias (PRO-338-R02, NEX-077): fe_consulta_reservar_token reserva UN documento con LEASE, token propio y FOR UPDATE SKIP LOCKED (dos instancias nunca reciben el mismo
 * documento); fe_consulta_programar_token fija la próxima consulta y libera el lease SOLO con el token vigente. Cada consulta pasa por consultarEstado → fe_documento_registrar_consulta_auto
 * (token vigente + guardas de estado final): nunca cambia un estado por falta de respuesta, jamás
 * reenvía un documento ni libera saldos por su cuenta. Un documento demasiado tiempo pendiente se marca «Requiere revisión» (en pantalla) y SIGUE consultándose con menor frecuencia.
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

/** Escalera provisional de reintentos en segundos según los intentos automáticos ya realizados; el último valor se repite. */
export const CADENCIA_SEGUNDOS: readonly number[] = [60, 120, 300, 600, 1800, 3600];
/**
 * PRO-338: FE y NCE. La FE quedaba fuera solo por esta lista: fe_consulta_reservar (NEX-062) ya filtra por p_tipos, estados pendientes, lease y actor real, y la función de registro del flujo
 * (fe_documento_registrar_consulta_flujo_nce) ya admite FE y NCE pendientes con CREAR o EDITAR, el mismo criterio con que la reserva elige al actor. No hay un segundo planificador.
 * PRO-338-R02: el worker usa las versiones con token de NEX-077 (mismos criterios + fencing + cdc_informado); sin NEX-077 no consulta.
 */
export const TIPOS_CONSULTA_AUTOMATICA: readonly string[] = ["NCE", "FE"];
export const INTERVALO_TICK_MS = 60_000;

export const segundosHastaProxima = (intentos: number): number => CADENCIA_SEGUNDOS[Math.min(Math.max(0, intentos), CADENCIA_SEGUNDOS.length - 1)];

/**
 * PRO-338-R02 (AUD-R01 F001): peor caso de UNA consulta = login + consulta, y una renovación del token con otro login + consulta (gateway.consultarDocumentoGateway), cada petición acotada por
 * TIMEOUT_GATEWAY_MAX_MS. El lease de cada documento cubre ese peor caso más un margen para la base; como se reserva UN documento por vez, justo antes de consultarlo, el lease no vence mientras
 * espera su turno en un lote (el defecto de la reserva de 10 con 120 s comunes).
 */
export const PETICIONES_MAX_POR_CONSULTA = 4;
export const MARGEN_LEASE_SEGUNDOS = 60;
export const LEASE_SEGUNDOS = Math.ceil((PETICIONES_MAX_POR_CONSULTA * TIMEOUT_GATEWAY_MAX_MS) / 1000) + MARGEN_LEASE_SEGUNDOS;

/**
 * `limitados`: no se llegó a consultar al gateway (empresa sin gateway o credenciales configuradas, tipo sin contrato, documento fuera del alcance del actor). No cuenta como intento.
 * `obsoletos`: la reserva ya no era de este proceso (otro la tomó tras vencer el lease): no se registró ni se reprogramó nada. `sinMigracion`: NEX-077 no está aplicada; no se consultó nada.
 */
export type ResultadoLote = { reservados: number; consultados: number; fallidos: number; sinActor: number; limitados: number; obsoletos: number; sinMigracion: boolean };

export type OpcionesLote = {
  /** Máximo de documentos por ciclo (cada uno se reserva por separado). */
  limite?: number;
  leaseSegundos?: number;
  tipos?: readonly string[];
  dep?: Dependencias;
  /** Pausa entre consultas del mismo lote (límite de ritmo hacia el gateway). */
  pausaMs?: number;
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
};

const dormirReal = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const codigoPg = (e: unknown) => (e as { code?: string } | null)?.code ?? "";
/** NEX-077 ausente: función (42883) o columna (42703) inexistente. */
const faltaNex077 = (e: unknown) => ["42883", "42703"].includes(codigoPg(e));
const esLeaseObsoleto = (e: unknown) => /NEX:LEASE_OBSOLETO/.test(String((e as { detail?: unknown } | null)?.detail ?? ""));
let avisoSinMigracion = false;

/**
 * Un ciclo: hasta `limite` veces reserva UN documento (token propio, NEX-077), lo consulta con el actor autorizado de la reserva y lo programa con ese token. Nunca lanza por fallos individuales.
 * Un worker cuyo token fue reemplazado no registra (la función SQL lo rechaza con la fila bloqueada) ni reprograma/libera la reserva ajena (programar devuelve false).
 */
export async function ejecutarLote(db: Db, o: OpcionesLote = {}): Promise<ResultadoLote> {
  const ahora = o.ahora ?? Date.now;
  const dormir = o.dormir ?? dormirReal;
  const tipos = [...(o.tipos ?? TIPOS_CONSULTA_AUTOMATICA)];
  const res: ResultadoLote = { reservados: 0, consultados: 0, fallidos: 0, sinActor: 0, limitados: 0, obsoletos: 0, sinMigracion: false };

  for (let n = 0; n < (o.limite ?? 10); n += 1) {
    let r;

    try {
      r = await db.query("SELECT o_empresa, o_documento, o_actor, o_tipo, o_intentos, o_token FROM fe_consulta_reservar_token(1, $1::integer, $2::text[])", [o.leaseSegundos ?? LEASE_SEGUNDOS, tipos]);
    } catch (error) {
      if (!faltaNex077(error)) throw error;
      // Sin propiedad verificable de la reserva NO se consulta (no se vuelve a la reserva por lote sin fencing). La consulta manual sigue disponible. Gate: aplicar NEX-077.
      res.sinMigracion = true;
      if (!avisoSinMigracion) console.warn("Consulta automática desactivada: falta la migración NEX-077 (reserva con token).");
      avisoSinMigracion = true;
      return res;
    }

    const f = (r.rows as F[])[0];

    if (!f) break;

    res.reservados += 1;
    const empresa = String(f.o_empresa);
    const documento = String(f.o_documento);
    const token = String(f.o_token);
    const intentos = Number(f.o_intentos);
    let intentado = false;
    let obsoleto = false;

    if (f.o_actor === null || f.o_actor === undefined) {
      res.sinActor += 1;   // ningún usuario con permiso de consulta: se reintenta más tarde, sin tocar el documento
    } else {
      try {
        intentado = true;
        // ZERO-01 / PRO-338: FE y NCE con las reglas del flujo (CREAR o EDITAR, alcance, actor real, solo ENVIADOS o de envío indeterminado sin resultado definitivo; un estado final exige
        // CDC coherente; CDC divergente sin tocar el estado fiscal). PRO-338-R02: registro con el token de la reserva (fe_documento_registrar_consulta_auto) y cdc_informado. La consulta manual no cambia.
        await consultarEstado(db, empresa, String(f.o_actor), documento, o.dep ?? {}, { flujoNce: true, leaseToken: token });
        res.consultados += 1;
      } catch (error) {
        if (error instanceof ErrorFacturacion) {
          // PRO-338: consultarEstado solo lanza ErrorFacturacion ANTES de llamar al gateway (sin configuración, sin credenciales, tipo sin contrato, documento fuera de alcance):
          // no hubo consulta, no se registra un intento inexistente ni se cuenta como tal. Queda la señal operativa en el log (texto propio, sin secretos) y se reprograma.
          intentado = false;
          res.limitados += 1;
          console.warn("Consulta automática no realizada (limitación):", error.estado, error.message.slice(0, 160));
        } else if (esLeaseObsoleto(error)) {
          // La reserva pasó a otro proceso mientras este consultaba: su respuesta NO se registra (la evidencia la obtiene el dueño vigente).
          obsoleto = true;
          res.obsoletos += 1;
          console.warn("Consulta automática descartada: la reserva ya pertenece a otro proceso.");
        } else {
          res.fallidos += 1;
          console.error("Consulta automática fallida:", codigoPg(error) || (error instanceof Error ? error.message.slice(0, 120) : "desconocido"));
        }
      }
    }

    if (!obsoleto) {
      try {
        const p = await db.query("SELECT fe_consulta_programar_token($1::uuid, $2::uuid, $3::timestamptz, $4::boolean, $5::uuid) AS ok", [empresa, documento, new Date(ahora() + segundosHastaProxima(intentado ? intentos : Math.max(intentos, 1)) * 1000).toISOString(), intentado, token]);

        // false: el token ya no es el vigente; no se tocó la reserva ajena.
        if ((p.rows as F[])[0]?.ok === false) res.obsoletos += 1;
      } catch {
        // Sin programar, el lease vence solo y el documento vuelve a ser elegible (con un token nuevo).
      }
    }
    if (o.pausaMs) await dormir(o.pausaMs);
  }

  return res;
}

/**
 * Arranca el planificador del proceso (una sola vez por proceso). Se desactiva con NEXIT_CONSULTA_AUTOMATICA=0, en modo DEMO o sin DATABASE_URL. Varias instancias pueden correrlo a la vez: el lease
 * de la base evita consultas duplicadas.
 */
export function iniciarPlanificador(env: Record<string, string | undefined> = process.env): boolean {
  const g = globalThis as { __nexitConsultaAutomatica?: boolean };

  if (g.__nexitConsultaAutomatica || env.NEXIT_CONSULTA_AUTOMATICA === "0" || env.DEMO_MODE === "true" || !env.DATABASE_URL) return false;

  g.__nexitConsultaAutomatica = true;

  let enCurso = false;
  const tick = async () => {
    if (enCurso) return;

    enCurso = true;
    try {
      const { db } = await import("@/lib/db");

      await ejecutarLote(db, { pausaMs: 500 });
    } catch (error) {
      console.error("Planificador de consultas: error en el ciclo:", (error as { code?: string }).code ?? "desconocido");
    } finally {
      enCurso = false;
    }
  };
  const t = setInterval(() => { void tick(); }, INTERVALO_TICK_MS);

  if (typeof t === "object" && "unref" in t) t.unref();

  return true;
}
