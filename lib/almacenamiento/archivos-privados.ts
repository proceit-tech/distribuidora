/**
 * Almacenamiento PRIVADO de archivos (documentos de Clientes, V1).
 *
 * Los archivos viven en un directorio de un volumen persistente de la VM, FUERA de `public/` y sin ninguna URL pública:
 * solo se entregan por una API autenticada que verifica `empresa_id`. La raíz sale SIEMPRE de la variable de entorno
 * `NEXIT_ARCHIVOS_DIR` (sin valor por defecto: si falta, la carga/descarga responde 503 en lugar de escribir dentro de la
 * aplicación). Procedimiento operativo de la VM: documentacao/infra/VOLUMEN-ARCHIVOS-PRIVADOS.md (preparado en Git, no ejecutado).
 *
 * Clave interna: `<empresa_id>/clientes/<cliente_id>/<archivo_id>` (tres UUID generados por el servidor). El nombre que
 * subió el usuario NUNCA forma parte de la ruta (solo se guarda como metadato), por lo que no hay traversal posible; además
 * toda ruta resuelta se verifica contra la raíz.
 *
 * Política V1 PROPUESTA (el responsable no fijó tipos/tamaño/retención; ver documentación): PDF, PNG, JPG, DOCX y XLSX,
 * máximo 10 MB por archivo, contenido verificado por firma (no solo por extensión), sin ejecutables ni comprimidos genéricos.
 * Eliminar un documento borra el archivo del volumen (no hay papelera); la retención/copia de seguridad es del volumen.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from "@/lib/almacenamiento/archivos-reglas";

export { EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAVE = /^[0-9a-f-]{36}\/(clientes|proveedores)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

export class ErrorArchivo extends Error {
  constructor(
    mensaje: string,
    readonly estado: number = 400,
  ) {
    super(mensaje);
  }
}

function raiz(): string {
  const dir = process.env.NEXIT_ARCHIVOS_DIR?.trim();

  if (!dir) throw new ErrorArchivo("El almacenamiento de archivos no está configurado en el servidor.", 503);

  return resolve(dir);
}

/** Nombre original saneado para mostrar/descargar: sin rutas ni caracteres de control, hasta 255 caracteres. */
export function nombreSeguro(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? "";
  const limpio = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim();

  if (!limpio || limpio === "." || limpio === "..") throw new ErrorArchivo("El archivo no tiene un nombre válido.");
  if (limpio.length > 255) throw new ErrorArchivo("El nombre del archivo supera los 255 caracteres.");

  return limpio;
}

export type ArchivoValidado = { buffer: Buffer; nombre: string; mime: string; tamano: number; sha256: string };

/** Valida extensión permitida, tamaño y firma del contenido. Lanza ErrorArchivo con mensaje para el usuario. */
export function validarArchivo(nombreOriginal: string, contenido: ArrayBuffer | Buffer): ArchivoValidado {
  const nombre = nombreSeguro(nombreOriginal);
  const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);
  const ext = nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "";
  const tipo = TIPOS_PERMITIDOS.find((t) => t.ext === ext);

  if (!tipo) throw new ErrorArchivo(`Tipo de archivo no permitido. Formatos admitidos: ${EXTENSIONES_TEXTO}.`);
  if (buffer.length === 0) throw new ErrorArchivo("El archivo está vacío.");
  if (buffer.length > TAMANO_MAXIMO_BYTES) throw new ErrorArchivo(`El archivo supera el máximo de ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`, 413);
  if (!tipo.firma.every((byte, i) => buffer[i] === byte)) {
    throw new ErrorArchivo(`El contenido del archivo no corresponde a un .${tipo.ext} válido.`);
  }

  return { buffer, nombre, mime: tipo.mime, tamano: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
}

/** Clave interna `<empresa>/<ámbito>/<entidad>/<uuid>`: el ámbito (clientes o proveedores) separa los archivos de cada módulo. */
export function nuevaClave(empresaId: string, entidadId: string, ambito: "clientes" | "proveedores" = "clientes"): string {
  if (!UUID.test(empresaId) || !UUID.test(entidadId)) throw new ErrorArchivo("Identificador no válido.");

  return `${empresaId}/${ambito}/${entidadId}/${randomUUID()}`;
}

function rutaDe(clave: string): string {
  if (!CLAVE.test(clave)) throw new ErrorArchivo("Clave de archivo no válida.");

  const base = raiz();
  const ruta = resolve(base, clave);

  if (!ruta.startsWith(`${base}${sep}`)) throw new ErrorArchivo("Ruta de archivo no válida.");

  return ruta;
}

/** Escribe de forma atómica (archivo temporal + rename) y sin sobrescribir. */
export async function guardarArchivo(clave: string, buffer: Buffer): Promise<void> {
  const ruta = rutaDe(clave);
  const temporal = `${ruta}.${randomUUID()}.tmp`;

  await mkdir(dirname(ruta), { recursive: true, mode: 0o700 });
  await writeFile(temporal, buffer, { flag: "wx", mode: 0o600 });
  await rename(temporal, ruta);
}

export async function leerArchivo(clave: string): Promise<Buffer> {
  try {
    return await readFile(rutaDe(clave));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ErrorArchivo("El archivo no se encuentra en el almacenamiento.", 404);
    throw error;
  }
}

/** Borra el archivo; si ya no existe no es un error (la fila de la base es la fuente de verdad). */
export async function borrarArchivo(clave: string): Promise<void> {
  try {
    await unlink(rutaDe(clave));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
