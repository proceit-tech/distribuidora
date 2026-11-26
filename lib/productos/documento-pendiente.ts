/** Documento que el usuario adjunta al registrar un producto: se carga después de crearlo (necesita el identificador del producto). */
import { validarNombreYTamano } from "@/lib/almacenamiento/archivos-reglas";
import { ErrorValidacion } from "@/lib/productos/errores";
import { localAIso } from "@/lib/proveedores/fechas";
import { validarMetadatosDocumento } from "@/lib/productos/documentos";

export type DocumentoPendiente = {
  uid: string;
  tipo: string;
  /** dd/mm/aaaa */
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
  archivo: File | null;
};

export function documentoPendienteVacio(): DocumentoPendiente {
  return { uid: `pendiente-${Date.now()}-${Math.random().toString(16).slice(2)}`, tipo: "OTRO", fechaEmision: "", fechaVencimiento: "", observacion: "", archivo: null };
}

/** Metadatos en ISO tal como los espera la API. Lanza ErrorValidacion con la ruta del campo (`documentos.<i>.<campo>`). */
export function metadatosIso(p: DocumentoPendiente, indice: number) {
  const emision = localAIso(p.fechaEmision);
  const vencimiento = localAIso(p.fechaVencimiento);

  if (emision === null) throw new ErrorValidacion(`La fecha de emisión del documento ${indice + 1} debe tener el formato dd/mm/aaaa y ser real.`, `documentos.${indice}.fechaEmision`);
  if (vencimiento === null) throw new ErrorValidacion(`La fecha de vencimiento del documento ${indice + 1} debe tener el formato dd/mm/aaaa y ser real.`, `documentos.${indice}.fechaVencimiento`);

  try {
    return validarMetadatosDocumento({ tipo: p.tipo, fechaEmision: emision, fechaVencimiento: vencimiento, observacion: p.observacion });
  } catch (e) {
    if (e instanceof ErrorValidacion) throw new ErrorValidacion(e.message, `documentos.${indice}.${e.campo ?? "observacion"}`);

    throw e;
  }
}

/** Valida todos los documentos adjuntos antes de crear el producto (archivo obligatorio, tipo y tamaño, metadatos). */
export function validarPendientes(pendientes: DocumentoPendiente[]) {
  pendientes.forEach((p, i) => {
    if (!p.archivo) throw new ErrorValidacion(`Seleccione el archivo del documento ${i + 1} o quite el documento.`, `documentos.${i}.archivo`);

    const errorArchivo = validarNombreYTamano(p.archivo.name, p.archivo.size);

    if (errorArchivo) throw new ErrorValidacion(errorArchivo, `documentos.${i}.archivo`);

    metadatosIso(p, i);
  });
}

export function formDataDeDocumento(p: DocumentoPendiente, indice: number): FormData {
  const meta = metadatosIso(p, indice);
  const datos = new FormData();

  if (p.archivo) datos.set("archivo", p.archivo);
  datos.set("tipo", meta.tipo);
  datos.set("fechaEmision", meta.fechaEmision ?? "");
  datos.set("fechaVencimiento", meta.fechaVencimiento ?? "");
  datos.set("observacion", meta.observacion ?? "");

  return datos;
}
