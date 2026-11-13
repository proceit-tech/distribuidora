/** Fechas de Proveedores: la API usa ISO (yyyy-mm-dd); la pantalla (Paraguay) muestra y recibe dd/mm/aaaa. */

export function esFechaIsoReal(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);

  if (!m) return false;

  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** ISO → dd/mm/aaaa ("" si está vacío o no es una fecha real). */
export function isoALocal(iso: string | null | undefined): string {
  if (!iso || !esFechaIsoReal(iso)) return "";

  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** dd/mm/aaaa → ISO; "" si está vacío; null si no es una fecha real con ese formato. */
export function localAIso(local: string): string | null {
  const texto = local.trim();

  if (!texto) return "";

  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);

  if (!m) return null;

  const iso = `${m[3]}-${m[2]}-${m[1]}`;

  return esFechaIsoReal(iso) ? iso : null;
}

/** Fecha de hoy (ISO) en la zona horaria de la operación (Asunción), igual que el resto de funciones de base de datos. */
export function hoyAsuncion(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
