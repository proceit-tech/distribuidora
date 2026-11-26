/**
 * E04 (PRO-200) — dirección de ENTREGA en la Factura Electrónica. El operador elige entre las direcciones YA registradas del cliente (sucursales/destinos); no se crean desde la FE y no cambian ni el domicilio
 * fiscal del receptor, ni el establecimiento emisor, ni el payload SIFEN. La lista y la validación del servidor salen de la MISMA regla SQL (`fe_entrega_opciones`, NEX-068, PRO-206): TODA dirección registrada del
 * cliente que no sea exclusivamente el domicilio fiscal (ENTREGA, SUCURSAL, COMERCIAL, OTRA); el fiscal solo si está marcado predeterminado de entrega. Siempre del cliente y la empresa de la sesión.
 */
import type { Pool } from "pg";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export type OpcionEntrega = {
  id: string; tipo: string; etiqueta: string; descripcion: string; direccion: string; numeroCasa: string; complemento: string; departamento: string; distrito: string; ciudad: string; pais: string;
  contactoNombre: string; contactoTelefono: string; horario: string; esDefault: boolean;
};

const t = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Destinos elegibles del cliente (solo lectura). Cliente ajeno, inexistente o sin destinos → lista vacía (no se distingue, no se filtra información). */
export async function opcionesEntrega(db: Db, empresaId: string, usuarioId: string, clienteId: string): Promise<OpcionEntrega[]> {
  const r = await db.query(
    `SELECT o_id AS id, o_tipo AS tipo, o_etiqueta AS etiqueta, o_descripcion AS descripcion, o_direccion AS direccion, o_numero_casa AS "numeroCasa", o_complemento AS complemento, o_departamento AS departamento,
            o_distrito AS distrito, o_ciudad AS ciudad, o_pais AS pais, o_contacto_nombre AS "contactoNombre", o_contacto_telefono AS "contactoTelefono", o_horario AS horario, o_es_default AS "esDefault"
       FROM fe_entrega_opciones($1::uuid, $2::uuid, $3::uuid)`,
    [empresaId, usuarioId, clienteId],
  );

  return (r.rows as F[]).map((f) => ({
    id: t(f.id), tipo: t(f.tipo), etiqueta: t(f.etiqueta), descripcion: t(f.descripcion), direccion: t(f.direccion), numeroCasa: t(f.numeroCasa), complemento: t(f.complemento), departamento: t(f.departamento),
    distrito: t(f.distrito), ciudad: t(f.ciudad), pais: t(f.pais), contactoNombre: t(f.contactoNombre), contactoTelefono: t(f.contactoTelefono), horario: t(f.horario), esDefault: f.esDefault === true,
  }));
}

/** Nombre corto del destino: etiqueta, si no descripción, si no el tipo. */
export const nombreEntrega = (o: OpcionEntrega): string => o.etiqueta.trim() || o.descripcion.trim() || o.tipo;
/** Dirección completa legible (calle, número, complemento, ciudad, departamento). */
export const direccionCompleta = (o: OpcionEntrega): string =>
  [[o.direccion, o.numeroCasa].filter((x) => x.trim() !== "").join(" "), o.complemento, o.ciudad, o.departamento].map((x) => x.trim()).filter((x) => x !== "").join(", ");

export type ResultadoEntrega = { ok: true; opcion: OpcionEntrega | null } | { ok: false; error: string };

export const MENSAJE_ENTREGA_REQUERIDA = "El cliente tiene direcciones de entrega registradas: seleccione la dirección de entrega.";
export const MENSAJE_ENTREGA_INVALIDA = "La dirección de entrega elegida no pertenece al cliente seleccionado o ya no está disponible. Revise la factura de nuevo.";

/** Regla del servidor: sin destinos registrados, la FE sale sin destino (si llega un id, es inválido); con destinos hay que elegir uno de SU lista. */
export function resolverEntrega(opciones: OpcionEntrega[], direccionId: string | undefined): ResultadoEntrega {
  if (direccionId === undefined) return opciones.length === 0 ? { ok: true, opcion: null } : { ok: false, error: MENSAJE_ENTREGA_REQUERIDA };

  const o = opciones.find((x) => x.id === direccionId);

  return o ? { ok: true, opcion: o } : { ok: false, error: MENSAJE_ENTREGA_INVALIDA };
}

/** Para el resumen previo al envío (sin identificadores internos de más). */
export const resumenEntrega = (o: OpcionEntrega) => ({ nombre: nombreEntrega(o), tipo: o.tipo, direccion: direccionCompleta(o), contacto: [o.contactoNombre, o.contactoTelefono].map((x) => x.trim()).filter((x) => x !== "").join(" · "), horario: o.horario });

/** Solicitud de la pantalla al servidor de NEXIT (solo viaja el id del cliente). */
export async function pedirOpcionesEntrega(clienteId: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<OpcionEntrega[]> {
  const r = await fetchFn("/api/facturas/clientes/" + encodeURIComponent(clienteId) + "/entrega", { cache: "no-store", signal });
  const j = (await r.json().catch(() => null)) as { opciones?: OpcionEntrega[]; error?: string } | null;

  if (!r.ok) throw new Error(typeof j?.error === "string" && j.error ? j.error : "No fue posible cargar las direcciones de entrega del cliente.");
  if (!j || !Array.isArray(j.opciones)) throw new Error("No fue posible cargar las direcciones de entrega del cliente.");

  return j.opciones;
}
