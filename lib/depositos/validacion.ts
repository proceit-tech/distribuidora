/** Reglas puras del formulario de Depósitos (sin servidor): las usan la pantalla y la API. La base (deposito_crear/editar) es la autoridad. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export const CODIGO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/;
export const NOMBRE_MAX = 120;

export type CampoDeposito = "codigo" | "nombre" | "sucursalId";
export type ErroresDeposito = Partial<Record<CampoDeposito, string>>;
export type FormularioDeposito = { codigo: string; nombre: string; sucursalId: string };

/** Mismas reglas que las funciones SQL (la base es la autoridad). El orden de las claves es el orden visual: la primera recibe el foco. */
export function validarDeposito(f: FormularioDeposito, creando: boolean): ErroresDeposito {
  const e: ErroresDeposito = {};
  const codigo = f.codigo.trim();
  const nombre = f.nombre.trim();

  if (creando) {
    if (!codigo) e.codigo = "El código es obligatorio.";
    else if (!CODIGO_RE.test(codigo)) e.codigo = "Use de 1 a 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios.";
  }
  if (!nombre) e.nombre = "El nombre es obligatorio.";
  else if (nombre.length > NOMBRE_MAX) e.nombre = `El nombre no puede superar los ${NOMBRE_MAX} caracteres.`;
  if (!esUuid(f.sucursalId)) e.sucursalId = "Seleccione la sucursal.";

  return e;
}

export function formularioDepositoSucio(actual: FormularioDeposito, base: FormularioDeposito): boolean {
  const n = (f: FormularioDeposito) => [f.codigo.trim(), f.nombre.trim(), f.sucursalId];

  return JSON.stringify(n(actual)) !== JSON.stringify(n(base));
}
