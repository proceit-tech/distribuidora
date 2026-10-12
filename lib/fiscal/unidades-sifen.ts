/**
 * Tabla 5 del Manual Técnico SIFEN v150 (p. 211–212): codificación de unidades de medida. 34 entradas. La clave es el CÓDIGO NUMÉRICO (E709):
 * la descripción no es única (Metros 87/m y 108/MT) ni la representación distingue mayúsculas (ml 660 ≠ ML 88). Fuente de verdad del SQL de NEX-039
 * (los casos de regresión comparan esta lista con el catálogo cargado por la migración).
 */
export const FUENTE_UNIDADES_SIFEN = "MT150-T5";

export const UNIDADES_SIFEN_TABLA5: ReadonlyArray<{ codigo: number; representacion: string; descripcion: string }> = [
  { codigo: 87, representacion: "m", descripcion: "Metros" },
  { codigo: 2366, representacion: "CPM", descripcion: "Costo por Mil" },
  { codigo: 2329, representacion: "UI", descripcion: "Unidad Internacional" },
  { codigo: 110, representacion: "M3", descripcion: "Metros cúbicos" },
  { codigo: 77, representacion: "UNI", descripcion: "Unidad" },
  { codigo: 86, representacion: "g", descripcion: "Gramos" },
  { codigo: 89, representacion: "LT", descripcion: "Litros" },
  { codigo: 90, representacion: "MG", descripcion: "Miligramos" },
  { codigo: 91, representacion: "CM", descripcion: "Centimetros" },
  { codigo: 92, representacion: "CM2", descripcion: "Centimetros cuadrados" },
  { codigo: 93, representacion: "CM3", descripcion: "Centimetros cubicos" },
  { codigo: 94, representacion: "PUL", descripcion: "Pulgadas" },
  { codigo: 96, representacion: "MM2", descripcion: "Milímetros cuadrados" },
  { codigo: 79, representacion: "kg/m²", descripcion: "Kilogramos s/ metro cuadrado" },
  { codigo: 97, representacion: "AA", descripcion: "Año" },
  { codigo: 98, representacion: "ME", descripcion: "Mes" },
  { codigo: 99, representacion: "TN", descripcion: "Tonelada" },
  { codigo: 100, representacion: "Hs", descripcion: "Hora" },
  { codigo: 101, representacion: "Mi", descripcion: "Minuto" },
  { codigo: 104, representacion: "DET", descripcion: "Determinación" },
  { codigo: 103, representacion: "Ya", descripcion: "Yardas" },
  { codigo: 108, representacion: "MT", descripcion: "Metros" },
  { codigo: 109, representacion: "M2", descripcion: "Metros cuadrados" },
  { codigo: 95, representacion: "MM", descripcion: "Milímetros" },
  { codigo: 666, representacion: "Se", descripcion: "Segundo" },
  { codigo: 102, representacion: "Di", descripcion: "Día" },
  { codigo: 83, representacion: "kg", descripcion: "Kilogramos" },
  { codigo: 88, representacion: "ML", descripcion: "Mililitros" },
  { codigo: 625, representacion: "Km", descripcion: "Kilómetros" },
  { codigo: 660, representacion: "ml", descripcion: "Metro lineal" },
  { codigo: 885, representacion: "GL", descripcion: "Unidad Medida Global" },
  { codigo: 891, representacion: "pm", descripcion: "Por Milaje" },
  { codigo: 869, representacion: "ha", descripcion: "Hectáreas" },
  { codigo: 569, representacion: "ración", descripcion: "Ración" },
];

/** Etiqueta de una unidad para los selectores: código interno · nombre y, si existe, su equivalencia SIFEN (E709/E710). */
export function etiquetaUnidad(u: { codigo: string; nombre: string; sifenCodigo?: number | null; sifenRepresentacion?: string }): string {
  return `${u.codigo} · ${u.nombre}${u.sifenCodigo ? ` (SIFEN ${u.sifenCodigo} · ${u.sifenRepresentacion ?? ""})` : ""}`;
}
