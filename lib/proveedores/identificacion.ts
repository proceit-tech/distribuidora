import { calcularDvRuc, esRucValido, MENSAJE_RUC_INVALIDO } from "@/lib/fiscal/calcular-dv-ruc";

/**
 * Identificación del proveedor (DEC-PRV-05). Reutiliza SOLO el cálculo del DV (módulo 11 DNIT); no aplica ninguna regla del
 * receptor SIFEN. Paraguay exige RUC; el exterior usa el documento fiscal de su país (formato libre 1–50, sin espacios,
 * sin inventar validaciones universales). Un proveedor del exterior puede, además, tener un RUC paraguayo (entonces rige igual).
 */
export const TIPOS_DOCUMENTO_PARAGUAY = [{ valor: "RUC", etiqueta: "RUC" }] as const;
export const TIPOS_DOCUMENTO_EXTERIOR = [
  { valor: "ID_FISCAL", etiqueta: "Identificación fiscal del país" },
  { valor: "CUIT", etiqueta: "CUIT" },
  { valor: "PASAPORTE", etiqueta: "Pasaporte" },
  { valor: "CEDULA_EXTRANJERA", etiqueta: "Documento de identidad extranjero" },
  { valor: "RUC", etiqueta: "RUC paraguayo" },
  { valor: "OTRO", etiqueta: "Otro documento" },
] as const;

export type EntradaIdentificacion = { paisCodigo: string; tipoDocumento: string; numeroDocumento: string; dv: string };
export type SalidaIdentificacion = { tipoDocumento: string; numeroDocumento: string; dv: string | null };
export type ResultadoIdentificacion = { ok: true; datos: SalidaIdentificacion } | { ok: false; error: string; campo: "tipoDocumento" | "numeroDocumento" | "dv" };

export function tiposDocumentoDe(paisCodigo: string) {
  return paisCodigo === "PRY" ? TIPOS_DOCUMENTO_PARAGUAY : TIPOS_DOCUMENTO_EXTERIOR;
}

export function validarIdentificacion(entrada: EntradaIdentificacion): ResultadoIdentificacion {
  const tipo = entrada.tipoDocumento.trim().toUpperCase();
  const numeroCrudo = entrada.numeroDocumento.trim();
  const dv = entrada.dv.trim();

  if (!tipo) return { ok: false, error: "Seleccione el tipo de documento.", campo: "tipoDocumento" };
  if (tipo.length > 30) return { ok: false, error: "El tipo de documento supera los 30 caracteres.", campo: "tipoDocumento" };
  if (!numeroCrudo) return { ok: false, error: tipo === "RUC" ? "Ingrese el RUC." : "Ingrese el número de documento.", campo: "numeroDocumento" };
  if (/\s/.test(numeroCrudo)) return { ok: false, error: "El número de documento no debe contener espacios.", campo: "numeroDocumento" };

  if (entrada.paisCodigo === "PRY" && tipo !== "RUC") {
    return { ok: false, error: "Un proveedor de Paraguay debe identificarse con RUC.", campo: "tipoDocumento" };
  }

  if (tipo === "RUC") {
    if (!esRucValido(numeroCrudo)) return { ok: false, error: MENSAJE_RUC_INVALIDO, campo: "numeroDocumento" };

    const esperado = calcularDvRuc(numeroCrudo) as string;

    if (!dv) return { ok: false, error: `Falta el DV del RUC (DV esperado: ${esperado}).`, campo: "dv" };
    if (dv !== esperado) return { ok: false, error: `El DV informado no corresponde al RUC (DV esperado: ${esperado}).`, campo: "dv" };

    return { ok: true, datos: { tipoDocumento: tipo, numeroDocumento: numeroCrudo, dv: esperado } };
  }

  if (numeroCrudo.length > 50) return { ok: false, error: "El número de documento supera los 50 caracteres.", campo: "numeroDocumento" };
  if (dv) return { ok: false, error: "El DV solo corresponde al RUC paraguayo.", campo: "dv" };

  return { ok: true, datos: { tipoDocumento: tipo, numeroDocumento: numeroCrudo.toUpperCase(), dv: null } };
}
