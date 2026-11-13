import { createHash } from "node:crypto";

import type { Pool } from "pg";

/**
 * Información adicional de interés para el emisor — J003 `dInfAdic` (MT SIFEN v150, 1 a 5000 caracteres) de la FE y de la NCE. Se compone SOLO en el servidor, a partir de datos autoritativos:
 *  · Observaciones del operador (se preservan íntegras, sin duplicarlas ni recortarlas).
 *  · «Dirección de entrega: …»: SOLO en FE LEGADAS (PRO-328: una FE nueva ya no la compone; la dirección seleccionada viaja como domicilio del receptor). `lineaEntrega` y el parser se conservan para
 *    reconocer esos snapshots históricos; jamás se usan para probar la identidad del destino (eso es por UUID persistido).
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
 * El dInfAdic guardado NO prueba qué escribió el operador (la marca visible y el nombre del vendedor se pueden teclear o cambiar), así que ya no se infiere nada de ese texto. La observación ORIGINAL
 * de una NCE nueva se persiste aparte, inmutable y en la misma transacción de la creación (NEX-071, tabla nce_observaciones_originales). ¿Existe esa migración en esta base?
 */
export async function observacionOriginalDisponible(db: Db): Promise<boolean> {
  const r = await db.query("SELECT to_regclass('public.nce_observaciones_originales') IS NOT NULL AS ok");

  return (r.rows[0] as { ok?: boolean } | undefined)?.ok === true;
}

/** Observación original registrada para una NCE (misma empresa). null = sin registro (NCE anterior a NEX-071, o la migración aún no está aplicada): procedencia desconocida, no se reclasifica. */
export async function observacionOriginalDe(db: Db, empresaId: string, nceId: string): Promise<string | null> {
  if (!(await observacionOriginalDisponible(db))) return null;

  const r = await db.query("SELECT observacion FROM nce_observaciones_originales WHERE empresa_id = $1 AND nce_id = $2", [empresaId, nceId]);
  const f = r.rows[0] as { observacion?: string } | undefined;

  return f && typeof f.observacion === "string" ? f.observacion : null;
}

/**
 * Reintento de una NCE SIN observación original registrada (histórica): solo se acepta si el texto guardado es exactamente el enviado y no contiene ninguna marca de bloque automático (si la contiene,
 * el guardado es un dInfAdic compuesto y la identidad no se puede probar: se rechaza con 409 en vez de aceptar contenido distinto).
 */
export function legadoCoincide(guardada: string | null, observaciones: string): boolean {
  const g = (guardada ?? "").trim();

  return g === observaciones.trim() && !g.split(/\r?\n/).some((l) => l.trim() === MARCA_AUTOMATICA);
}

/**
 * Partes comprobables del dInfAdic persistido de una FE para verificar un REINTENTO (no reconstruye nada: solo compara lo que el operador vuelve a enviar). Exige la forma exacta que produce
 * `componerInfoAdicional`: sin marca, todo el texto son observaciones; con UNA sola marca, lo anterior son las observaciones y lo posterior solo líneas «Dirección de entrega: …» (a lo sumo una) y
 * «Vendedor: …» (a lo sumo una, al final). Cualquier otra forma (varias marcas, bloque vacío o con líneas ajenas) no permite probar qué escribió el operador: null (el llamador responde 409).
 */
export function descomponerInfoAdicional(texto: string | null): { observacion: string; entrega: string | null; vendedor: string | null } | null {
  const lineas = (texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const marcas = lineas.flatMap((l, i) => (l.trim() === MARCA_AUTOMATICA ? [i] : []));

  if (marcas.length === 0) return { observacion: lineas.join("\n").trim(), entrega: null, vendedor: null };
  if (marcas.length > 1) return null;

  const automaticas = lineas.slice(marcas[0] + 1).map((l) => l.trim()).filter((l) => l !== "");
  const entregas = automaticas.filter((l) => l.startsWith(PREFIJO_ENTREGA));
  const vendedores = automaticas.filter((l) => l.startsWith(PREFIJO_VENDEDOR));

  if (automaticas.length === 0 || entregas.length > 1 || vendedores.length > 1 || entregas.length + vendedores.length !== automaticas.length) return null;
  if (vendedores.length === 1 && automaticas[automaticas.length - 1] !== vendedores[0]) return null;

  return { observacion: lineas.slice(0, marcas[0]).join("\n").trim(), entrega: entregas[0] ?? null, vendedor: vendedores[0] ?? null };
}

/** ¿El texto contiene la línea marcadora? (una observación enviada con la marca no permite probar equivalencia con un snapshot compuesto). */
export const contieneMarcaAutomatica = (texto: string): boolean => texto.split(/\r?\n/).some((l) => l.trim() === MARCA_AUTOMATICA);

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
