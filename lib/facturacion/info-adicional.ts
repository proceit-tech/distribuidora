import { createHash } from "node:crypto";

import type { Pool } from "pg";

/**
 * Información adicional de interés para el emisor — J003 `dInfAdic` (MT SIFEN v150, 1 a 5000 caracteres) de la FE y de la NCE. Se compone SOLO en el servidor, a partir de datos autoritativos:
 *  · Observaciones del operador (se preservan íntegras, sin duplicarlas ni recortarlas).
 *  · «Dirección de entrega: …» con el destino que el servidor validó para el cliente y la empresa de la sesión (FE; nunca el domicilio fiscal; sin destino no hay línea).
 *  · «Vendedor: nombre apellido» del usuario autenticado que EMITE el documento (empresa de la sesión), no un dato enviado por el navegador.
 * La cadena resultante es la que viaja en el payload inmutable (snapshot histórico). El navegador solo envía las observaciones crudas, así que revisar o reintentar nunca acumula líneas.
 * No es un campo del XML firmado: es un dato comercial del JSON del proveedor.
 */
type Db = Pick<Pool, "query">;

export const LIMITE_INFO_ADICIONAL = 5000;
const PREFIJO_ENTREGA = "Dirección de entrega: ";
const PREFIJO_VENDEDOR = "Vendedor: ";
/** Línea que separa el texto libre del operador de los datos automáticos del sistema. */
export const MARCA_AUTOMATICA = "[Datos automáticos del sistema]";
const limpio = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim();

/** «Dirección de entrega: SUCURSAL — dirección». null si no hay destino. */
export function lineaEntrega(destino: { nombre: string; direccion: string } | null): string | null {
  if (!destino) return null;

  const nombre = limpio(destino.nombre);
  const direccion = limpio(destino.direccion);

  if (nombre === "" && direccion === "") return null;

  return `${PREFIJO_ENTREGA}${[nombre, direccion].filter(Boolean).join(" — ")}`;
}

/** «Vendedor: Nombre Apellido». null si la cuenta no tiene nombre persistido. */
export function lineaVendedor(nombre: string | null | undefined, apellido: string | null | undefined): string | null {
  const completo = limpio(`${nombre ?? ""} ${apellido ?? ""}`);

  return completo === "" ? null : `${PREFIJO_VENDEDOR}${completo}`;
}

/**
 * Observaciones del operador y datos automáticos del sistema, en un solo texto pero SEPARADOS por una línea marcadora fija: todo lo anterior a la marca es texto libre del operador (se preserva íntegro, aunque
 * escriba «Vendedor: …» o «Dirección de entrega: …») y solo lo posterior es la identificación autoritativa (entrega validada, vendedor autenticado). Una observación manual nunca sustituye ni evita la línea
 * automática. Sin datos automáticos no hay marca. Orden estable: observaciones, marca, entrega, vendedor.
 */
export function componerInfoAdicional(p: { observaciones: string; entrega?: string | null; vendedor?: string | null }): string {
  const obs = p.observaciones.trim();
  const automaticas = [p.entrega, p.vendedor].filter((l): l is string => typeof l === "string" && l !== "");

  return (automaticas.length === 0 ? [obs] : [obs, MARCA_AUTOMATICA, ...automaticas]).filter((t) => t !== "").join("\n");
}

/**
 * Observaciones propias de un texto ya compuesto (precarga de la corrección de una NCE rechazada). Un texto almacenado no trae procedencia (la marca visible la puede teclear el operador), así que el bloque
 * final solo se retira si su origen es VERIFICABLE con un dato persistido: después de la última marca debe haber UNA línea y coincidir EXACTAMENTE con «Vendedor: …» del usuario que creó esa NCE
 * (`vendedorEmisor`, leído de documentos_electronicos.creado_por → usuarios). Una NCE solo compone el vendedor (nunca «Dirección de entrega»). Sin emisor verificable, sin coincidencia exacta o sin marca se
 * conserva TODO el texto: ante la duda prevalece la integridad de lo que escribió el operador (a costa de, quizá, dejar un «Vendedor:» antiguo).
 */
export function separarObservacion(texto: string, vendedorEmisor: string | null): string {
  const lineas = texto.split(/\r?\n/);
  const marca = lineas.map((l) => l.trim()).lastIndexOf(MARCA_AUTOMATICA);

  if (marca < 0 || vendedorEmisor === null) return texto.trim();

  const cola = lineas.slice(marca + 1).map((l) => l.trim());

  return cola.length === 1 && cola[0] === vendedorEmisor ? lineas.slice(0, marca).join("\n").trim() : texto.trim();
}

/**
 * ¿El dInfAdic guardado corresponde a estas observaciones crudas (las que reenvía el operador al repetir la operación)? Igual tal cual, o esas observaciones seguidas de la marca y UNA línea «Vendedor: …».
 * No depende del nombre actual del usuario (un renombrado posterior no convierte un reintento legítimo en conflicto) ni elimina nada del texto: solo compara contra lo que el propio operador aportó.
 */
export function coincideConObservaciones(guardada: string | null, observaciones: string): boolean {
  const obs = observaciones.trim();
  const g = guardada === null ? "" : guardada.trim();

  if (g === obs) return true;

  const cabecera = obs === "" ? MARCA_AUTOMATICA + "\n" : obs + "\n" + MARCA_AUTOMATICA + "\n";
  const resto = g.startsWith(cabecera) ? g.slice(cabecera.length) : null;

  return resto !== null && !resto.includes("\n") && resto.startsWith(PREFIJO_VENDEDOR);
}

/** «Vendedor: …» del usuario que CREÓ el documento (dato persistido, misma empresa). null si no existe o no tiene nombre. */
export async function vendedorEmisorDe(db: Db, empresaId: string, documentoId: string): Promise<string | null> {
  const r = await db.query(
    "SELECT u.nombre, u.apellido FROM documentos_electronicos d JOIN usuarios u ON u.empresa_id = d.empresa_id AND u.id = d.creado_por WHERE d.empresa_id = $1 AND d.id = $2",
    [empresaId, documentoId],
  );
  const f = r.rows[0] as { nombre?: string | null; apellido?: string | null } | undefined;

  return f ? lineaVendedor(f.nombre, f.apellido) : null;
}

/** Huella (SHA-256) del dInfAdic final: identifica el texto exacto que el operador revisó; al emitir se compara con el que el servidor volvería a componer. */
export function huellaInfoAdicional(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Snapshot de la información adicional de una emisión YA creada con esta clave de idempotencia (reintento / respuesta perdida): se reutiliza TAL CUAL el dInfAdic persistido, de modo que ni un cambio posterior
 * de nombre del vendedor ni la edición o baja de la dirección de entrega alteran el contenido del documento ni provocan un falso conflicto de idempotencia. undefined = no existe documento con esa clave.
 */
export async function infoAdicionalPersistida(db: Db, empresaId: string, clave: string): Promise<string | null | undefined> {
  const r = await db.query(
    `SELECT s.payload->>'dInfAdic' AS info
       FROM documentos_electronicos d JOIN documento_electronico_solicitudes s ON s.empresa_id = d.empresa_id AND s.documento_id = d.id
      WHERE d.empresa_id = $1::uuid AND d.clave_idempotencia = $2 ORDER BY s.version ASC LIMIT 1`,
    [empresaId, clave],
  );
  const f = r.rows[0] as { info?: string | null } | undefined;

  return f === undefined ? undefined : typeof f.info === "string" ? f.info : null;
}

/** Vendedor = usuario autenticado que emite, leído de la base para ESA empresa (nunca del navegador). null si no existe (no se inventa). */
export async function vendedorDe(db: Db, empresaId: string, usuarioId: string): Promise<string | null> {
  const r = await db.query("SELECT nombre, apellido FROM usuarios WHERE empresa_id = $1 AND id = $2", [empresaId, usuarioId]);
  const f = r.rows[0] as { nombre?: string | null; apellido?: string | null } | undefined;

  return f ? lineaVendedor(f.nombre, f.apellido) : null;
}
