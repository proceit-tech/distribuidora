/**
 * Normaliza SOLO el texto inicial del precio para un input editable.
 * El catálogo puede traer 82500.0000: debe mostrarse como 82500 al enfocar.
 * Mantiene fracciones reales (12.2500 => 12.25), sin redondear ni convertir a Number.
 * NO se usa en onChange: se debe poder escribir "12.", "12.0", borrar y corregir sin saltos.
 * Los importes FUERA del foco se muestran con formatearMontoVisual y moneda.
 */
export function precioParaEdicion(t: string | null | undefined): string {
  if (t === null || t === undefined) return "";
  const m = /^(\d{1,30})(?:\.(\d{1,12}))?$/.exec(t);

  if (!m) return t;

  const fraccion = (m[2] ?? "").replace(/0+$/, "");

  return fraccion ? `${m[1]}.${fraccion}` : m[1];
}
