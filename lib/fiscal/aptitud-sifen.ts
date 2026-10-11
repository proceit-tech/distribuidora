/**
 * Aptitud SIFEN de un cliente YA GRABADO (datos mestre del receptor, grupo D3).
 *
 * El PUT tolera valores fiscales anteriores a las reglas para no impedir cambios comerciales legítimos
 * (ver `validarCamposReceptor(…, previos)`), pero eso NO significa que el cliente sirva para emitir:
 * esta evaluación lista, con las MISMAS reglas compartidas, lo que impediría usarlo como receptor.
 * Es informativa (no bloquea ninguna operación) y NUNCA devuelve `apto: true` si hay una inconsistencia
 * detectable: un código desconocido (naturaleza, operación, tipo de persona, tipo de documento, país) es
 * siempre una pendiente, jamás se sustituye por un valor por defecto.
 *
 * Alcance: coherencia interna de los datos del receptor según las reglas del cadastro (D201–D224 del Manual
 * v150 y NT 002/003/005/010/023/024 ya adoptadas en `campos-receptor.ts`). NO es una validación contra la
 * DNIT (existencia del RUC en el Marangatu, estado del contribuyente) ni define la política de emisión V2.
 */
import { validarRucDv } from "@/lib/fiscal/calcular-dv-ruc";
import {
  validarCamposReceptor,
  validarDireccionFiscal,
  validarInnominado,
  validarNaturalezaOperacion,
} from "@/lib/fiscal/campos-receptor";
import { validarNumeroTelefonicoLegado, validarTelefono } from "@/lib/fiscal/telefono";
import { validarPaisPorOperacion } from "@/lib/geografia/referencia";

export type DatosAptitud = {
  naturaleza: string;
  tipoOperacion: string;
  tipoPersona: string;
  paisCodigo: string;
  /** Resultado de buscar `paisCodigo` en el catálogo oficial (referencia_geografica_paises, activo): true/false; null = no se pudo verificar. */
  paisEnCatalogo: boolean | null;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  descripcionDocumento: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  telefono: string;
  celular: string;
  /** País, DDI y código de área de cada número (vacíos = registro anterior sin país). */
  telefonoPais: string;
  telefonoDdi: string;
  telefonoArea: string;
  celularPais: string;
  celularDdi: string;
  celularArea: string;
};

export type DireccionFiscalAptitud = {
  direccion: string;
  numeroCasa: string;
  departamentoCodigo: string;
  distritoCodigo: string;
  ciudadCodigo: string;
  paisCodigo: string;
  paisEnCatalogo: boolean | null;
};

export type AptitudSifen = { apto: boolean; pendientes: string[] };

const NATURALEZAS = ["CONTRIBUYENTE", "NO_CONTRIBUYENTE"];
const OPERACIONES = ["B2B", "B2C", "B2G", "B2F"];
const TIPOS_PERSONA = ["FISICA", "JURIDICA"];
const TIPOS_DOCUMENTO_IDENTIDAD = [
  "CEDULA_PARAGUAYA",
  "PASAPORTE",
  "CEDULA_EXTRANJERA",
  "CARNET_RESIDENCIA",
  "INNOMINADO",
  "TARJETA_DIPLOMATICA",
  "OTRO",
];

function mensajeCatalogoPais(codigo: string, enCatalogo: boolean | null, de: string): string | null {
  if (enCatalogo === true) return null;
  if (enCatalogo === false) return `El país ${de} (${codigo}) no existe o no está activo en el catálogo oficial de países.`;
  return `No fue posible verificar el país ${de} (${codigo}) contra el catálogo oficial de países.`;
}

export function evaluarAptitudSifen(c: DatosAptitud, fiscal: DireccionFiscalAptitud | null): AptitudSifen {
  const pendientes: string[] = [];
  const limpio = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const agregar = (mensaje: string | null) => {
    if (mensaje && !pendientes.includes(mensaje)) pendientes.push(mensaje);
  };

  const naturalezaOk = NATURALEZAS.includes(c.naturaleza);
  const operacionOk = OPERACIONES.includes(c.tipoOperacion);

  // Códigos desconocidos: pendiente explícita, sin valores por defecto.
  if (!naturalezaOk) agregar(`La naturaleza del receptor (${limpio(c.naturaleza) || "vacía"}) no es válida.`);
  if (!operacionOk) agregar(`El tipo de operación (${limpio(c.tipoOperacion) || "vacío"}) no es válido.`);
  if (!TIPOS_PERSONA.includes(c.tipoPersona)) agregar("El tipo de persona (física o jurídica) no está definido o no es válido.");

  // D201 × D202 y D203 (país según operación).
  if (naturalezaOk && operacionOk) agregar(validarNaturalezaOperacion(c.naturaleza, c.tipoOperacion));
  if (!limpio(c.paisCodigo)) {
    agregar("El país del receptor no está informado.");
  } else {
    // D203/D204: el código debe existir (y estar activo) en el catálogo oficial de países; PRY/exterior por sí solo no basta.
    agregar(mensajeCatalogoPais(limpio(c.paisCodigo), c.paisEnCatalogo, "del receptor"));

    if (operacionOk) {
      try {
        validarPaisPorOperacion(c.tipoOperacion, limpio(c.paisCodigo).toUpperCase());
      } catch (error) {
        agregar(error instanceof Error ? error.message : "El país no es compatible con la operación.");
      }
    }
  }

  // D206/D207 (contribuyente) o D208–D210 (no contribuyente).
  if (c.naturaleza === "CONTRIBUYENTE") {
    if (c.tipoDocumento !== "RUC") agregar("Un contribuyente debe identificarse con RUC.");
    const rucDv = validarRucDv(limpio(c.numeroDocumento), limpio(c.dv));
    if (!rucDv.ok) agregar(rucDv.error);
  } else if (c.naturaleza === "NO_CONTRIBUYENTE") {
    if (!TIPOS_DOCUMENTO_IDENTIDAD.includes(c.tipoDocumento)) {
      agregar(`El tipo de documento (${limpio(c.tipoDocumento) || "vacío"}) no es válido para un no contribuyente.`);
    }
    if (limpio(c.dv)) agregar("Un no contribuyente no debe tener DV.");
  }

  // Tamaños y condicionales D209–D216 y nombre D211/D212.
  agregar(
    validarCamposReceptor({
      naturaleza: c.naturaleza,
      tipoDocumento: c.tipoDocumento,
      numeroDocumento: limpio(c.numeroDocumento),
      descripcionDocumento: limpio(c.descripcionDocumento),
      razonSocial: limpio(c.razonSocial),
      nombreFantasia: limpio(c.nombreFantasia),
      email: limpio(c.email),
      telefono: limpio(c.telefono),
      celular: limpio(c.celular),
    }),
  );

  // D214/D215: teléfono y celular por país del número (regla cadastral por país; la serialización XML de V2 es aparte).
  for (const campo of ["telefono", "celular"] as const) {
    const numero = limpio(campo === "telefono" ? c.telefono : c.celular);
    if (numero === "") continue;
    const pais = limpio(campo === "telefono" ? c.telefonoPais : c.celularPais);
    if (pais === "") {
      agregar(validarNumeroTelefonicoLegado(campo, numero));
    } else {
      const r = validarTelefono(campo, {
        numero,
        pais,
        ddi: limpio(campo === "telefono" ? c.telefonoDdi : c.celularDdi),
        area: limpio(campo === "telefono" ? c.telefonoArea : c.celularArea),
      });
      if (!r.ok) agregar(r.error);
    }
  }

  // D208 = 5 (Innominado).
  agregar(
    validarInnominado({
      tipoDocumento: c.tipoDocumento,
      naturaleza: c.naturaleza,
      tipoOperacion: c.tipoOperacion,
      numeroDocumento: limpio(c.numeroDocumento),
      razonSocial: limpio(c.razonSocial),
    }),
  );

  // D213/D218/D219–D223 (domicilio fiscal).
  if (fiscal) {
    if (limpio(fiscal.paisCodigo)) {
      agregar(mensajeCatalogoPais(limpio(fiscal.paisCodigo), fiscal.paisEnCatalogo, "del domicilio fiscal"));
    } else {
      agregar("El país del domicilio fiscal no está informado.");
    }
    agregar(
      validarDireccionFiscal(limpio(fiscal.direccion), limpio(fiscal.numeroCasa), {
        exigir: c.tipoOperacion !== "B2F",
        departamento: limpio(fiscal.departamentoCodigo),
        distrito: limpio(fiscal.distritoCodigo),
        ciudad: limpio(fiscal.ciudadCodigo),
      }),
    );
  } else if (c.tipoOperacion === "B2F") {
    // D213 es obligatorio cuando D202 = 4 (Manual v150).
    agregar("Una operación B2F requiere dirección fiscal del receptor.");
  }

  return { apto: pendientes.length === 0, pendientes };
}
