/** CC-A07 — vínculos reales de un canal o zona: listas de precios y reglas por un lado, clientes por otro (cada conteo con la empresa de la sesión). Funciones puras. */
export type VinculosComerciales = { nombre?: string; activo?: boolean; usos?: number; clientes?: number };

/** Texto de confirmación al inactivar; null si no hay ningún vínculo (o si se está activando). Los vínculos nunca se rompen: las FK y las referencias históricas se conservan. */
export function textoConfirmarInactivacionComercial(f: VinculosComerciales): string | null {
  if (!f.activo) return null;

  const listas = f.usos ?? 0;
  const clientes = f.clientes ?? 0;

  if (listas <= 0 && clientes <= 0) return null;

  const partes: string[] = [];

  if (listas > 0) partes.push(`${listas} lista(s) o regla(s) de precios`);
  if (clientes > 0) partes.push(`${clientes} cliente(s)`);

  return `¿Inactivar «${f.nombre}»? Está vinculado a ${partes.join(" y ")}; esos vínculos se conservan (los clientes existentes mantienen su referencia), pero ya no se ofrecerá para nuevos registros.`;
}
