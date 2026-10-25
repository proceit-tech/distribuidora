/**
 * Validación de los datos de un usuario de la empresa (alta y edición). Espejo de usr_exigir_datos / usr_normalizar_* de NEX-074: la base repite todas estas reglas.
 * Todos los campos son obligatorios. La CI y el teléfono son TEXTO (nunca números: se conservan los ceros iniciales); solo se normalizan separadores sin tocar los dígitos.
 */
export type CampoUsuario = "nombre" | "apellido" | "ci" | "email" | "telefono" | "usuario" | "contrasena";
export type DatosUsuario = { nombre: string; apellido: string; ci: string; email: string; telefono: string };

/** CI: se aceptan puntos y espacios al escribirla (1.234.567) y se guarda solo con dígitos. */
export const normalizarCi = (v: string): string => v.trim().replace(/[\s.]/g, "");
/** Teléfono: se descartan espacios, guiones, puntos y paréntesis; se conserva el «+» inicial y los ceros iniciales. */
export const normalizarTelefono = (v: string): string => v.trim().replace(/[\s().-]/g, "");

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ResultadoValidacion<T> = { ok: true; datos: T } | { ok: false; errores: Partial<Record<CampoUsuario, string>> };

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

export function validarDatosUsuario(entrada: Record<string, unknown>): ResultadoValidacion<DatosUsuario> {
  const errores: Partial<Record<CampoUsuario, string>> = {};
  const nombre = texto(entrada.nombre).trim();
  const apellido = texto(entrada.apellido).trim();
  const ci = normalizarCi(texto(entrada.ci));
  const email = texto(entrada.email).trim();
  const telefono = normalizarTelefono(texto(entrada.telefono));

  if (nombre.length < 1 || nombre.length > 120) errores.nombre = "El nombre es obligatorio (hasta 120 caracteres).";
  if (apellido.length < 1 || apellido.length > 120) errores.apellido = "El apellido es obligatorio (hasta 120 caracteres).";
  if (ci === "") errores.ci = "La CI es obligatoria.";
  else if (!/^[0-9]{4,10}$/.test(ci)) errores.ci = "La CI debe tener de 4 a 10 dígitos (puede escribirla con puntos).";
  if (email === "") errores.email = "El correo electrónico es obligatorio.";
  else if (email.length > 200 || !EMAIL.test(email)) errores.email = "El correo electrónico no es válido.";
  if (telefono === "") errores.telefono = "El teléfono es obligatorio.";
  else if (!/^\+?[0-9]{6,15}$/.test(telefono)) errores.telefono = "El teléfono debe tener de 6 a 15 dígitos (puede usar +, espacios o guiones).";

  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, datos: { nombre, apellido, ci, email, telefono } };
}

/** Datos de acceso del alta: usuario (identificación de acceso) y contraseña inicial. */
export function validarAccesoUsuario(entrada: Record<string, unknown>): ResultadoValidacion<{ usuario: string; contrasena: string }> {
  const errores: Partial<Record<CampoUsuario, string>> = {};
  const usuario = texto(entrada.usuario).trim().toLowerCase();
  const contrasena = texto(entrada.contrasena);

  if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(usuario)) errores.usuario = "El usuario debe tener de 3 a 60 caracteres: letras minúsculas, números, punto o guion.";
  if (contrasena.length < 10 || contrasena.length > 200) errores.contrasena = "La contraseña inicial debe tener de 10 a 200 caracteres.";
  else if (contrasena.toLowerCase() === usuario) errores.contrasena = "La contraseña inicial no puede ser igual al usuario.";

  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, datos: { usuario, contrasena } };
}
