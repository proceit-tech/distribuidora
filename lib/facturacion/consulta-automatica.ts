import type { Pool } from "pg";

import type { Dependencias } from "@/lib/facturacion/gateway";
import { UMBRAL_REVISION_HORAS } from "@/lib/facturacion/estados";
import { consultarEstado } from "@/lib/facturacion/shared";

export { UMBRAL_REVISION_HORAS };

/**
 * Consulta AUTOMÁTICA en el servidor de los documentos pendientes de resultado fiscal (PRO-94, RN-20): funciona sin navegador. Mecanismo reutilizable y parametrizable; la CADENCIA y el
 * horizonte concretos NO son normativos y se definirán para TODOS los documentos en un proyecto común posterior: los valores de abajo son una escalera PRUDENTE y provisional.
 *
 * Seguridad con varias instancias: fe_consulta_reservar toma un lote con LEASE y FOR UPDATE SKIP LOCKED (dos instancias nunca reciben el mismo documento); fe_consulta_programar fija la próxima
 * consulta y libera el lease. Cada consulta pasa por consultarEstado → fe_documento_registrar_consulta (guardas de estado final de NEX-054): nunca cambia un estado por falta de respuesta, jamás
 * reenvía un documento ni libera saldos por su cuenta. Un documento demasiado tiempo pendiente se marca «Requiere revisión» (en pantalla) y SIGUE consultándose con menor frecuencia.
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

/** Escalera provisional de reintentos en segundos según los intentos automáticos ya realizados; el último valor se repite. */
export const CADENCIA_SEGUNDOS: readonly number[] = [60, 120, 300, 600, 1800, 3600];
export const TIPOS_CONSULTA_AUTOMATICA: readonly string[] = ["NCE"];
export const INTERVALO_TICK_MS = 60_000;

export const segundosHastaProxima = (intentos: number): number => CADENCIA_SEGUNDOS[Math.min(Math.max(0, intentos), CADENCIA_SEGUNDOS.length - 1)];

export type ResultadoLote = { reservados: number; consultados: number; fallidos: number; sinActor: number };

export type OpcionesLote = {
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

/** Un lote: reserva, consulta cada documento (con el usuario autorizado que devuelve la reserva) y programa la siguiente. Nunca lanza por fallos individuales. */
export async function ejecutarLote(db: Db, o: OpcionesLote = {}): Promise<ResultadoLote> {
  const ahora = o.ahora ?? Date.now;
  const dormir = o.dormir ?? dormirReal;
  const r = await db.query("SELECT o_empresa, o_documento, o_actor, o_tipo, o_intentos FROM fe_consulta_reservar($1::integer, $2::integer, $3::text[])", [o.limite ?? 10, o.leaseSegundos ?? 120, [...(o.tipos ?? TIPOS_CONSULTA_AUTOMATICA)]]);
  const filas = r.rows as F[];
  const res: ResultadoLote = { reservados: filas.length, consultados: 0, fallidos: 0, sinActor: 0 };

  for (const f of filas) {
    const empresa = String(f.o_empresa);
    const documento = String(f.o_documento);
    const intentos = Number(f.o_intentos);
    let intentado = false;

    if (f.o_actor === null || f.o_actor === undefined) {
      res.sinActor += 1;   // ningún usuario con permiso de consulta: se reintenta más tarde, sin tocar el documento
    } else {
      try {
        intentado = true;
        // ZERO-01: las NCE se consultan con la función del flujo NCE (CREAR o EDITAR, alcance, actor real); el worker solo trata NCE.
        await consultarEstado(db, empresa, String(f.o_actor), documento, o.dep ?? {}, { flujoNce: String(f.o_tipo) === "NCE" });
        res.consultados += 1;
      } catch (error) {
        res.fallidos += 1;
        console.error("Consulta automática fallida:", (error as { code?: string; message?: string }).code ?? (error instanceof Error ? error.message.slice(0, 120) : "desconocido"));
      }
    }

    try {
      await db.query("SELECT fe_consulta_programar($1::uuid, $2::uuid, $3::timestamptz, $4::boolean)", [empresa, documento, new Date(ahora() + segundosHastaProxima(intentado ? intentos : Math.max(intentos, 1)) * 1000).toISOString(), intentado]);
    } catch {
      // Sin programar, el lease vence solo y el documento vuelve a ser elegible.
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
