/**
 * Aptitud SIFEN de un cliente YA GRABADO (datos mestre del receptor, grupo D3).
 *
 * El PUT tolera valores fiscales anteriores a las reglas para no impedir cambios comerciales legítimos
 * (ver `validarCamposReceptor(…, previos)`), pero eso NO significa que el cliente sirva para emitir:
 * esta evaluación lista, con las MISMAS reglas compartidas, lo que impediría usarlo como receptor.
 * Es informativa (no bloquea ninguna operación) y el cadastro nunca se declara "apto" si hay pendientes.
 */
import { validarRucDv } from "@/lib/fiscal/calcular-dv-ruc";
import { validarCamposReceptor, validarDireccionFiscal, validarInnominado } from "@/lib/fiscal/campos-receptor";

export type DatosAptitud = {
  naturaleza: string;
  tipoOperacion: string;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  descripcionDocumento: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  telefono: string;
  celular: string;
};

export type DireccionFiscalAptitud = {
  direccion: string;
  numeroCasa: string;
  departamentoCodigo: string;
  distritoCodigo: string;
  ciudadCodigo: string;
};

export type AptitudSifen = { apto: boolean; pendientes: string[] };

export function evaluarAptitudSifen(c: DatosAptitud, fiscal: DireccionFiscalAptitud | null): AptitudSifen {
  const pendientes: string[] = [];
  const sinNada = (v: string) => (v ?? "").trim();

  if (c.naturaleza === "CONTRIBUYENTE") {
    const rucDv = validarRucDv(sinNada(c.numeroDocumento), sinNada(c.dv));
    if (!rucDv.ok) pendientes.push(rucDv.error);
  }

  const errorCampos = validarCamposReceptor({
    naturaleza: c.naturaleza,
    tipoDocumento: c.tipoDocumento,
    numeroDocumento: sinNada(c.numeroDocumento),
    descripcionDocumento: sinNada(c.descripcionDocumento),
    razonSocial: sinNada(c.razonSocial),
    nombreFantasia: sinNada(c.nombreFantasia),
    email: sinNada(c.email),
    telefono: sinNada(c.telefono),
    celular: sinNada(c.celular),
  });
  if (errorCampos) pendientes.push(errorCampos);

  const errorInnominado = validarInnominado({
    tipoDocumento: c.tipoDocumento,
    naturaleza: c.naturaleza,
    tipoOperacion: c.tipoOperacion,
    numeroDocumento: sinNada(c.numeroDocumento),
    razonSocial: sinNada(c.razonSocial),
  });
  if (errorInnominado) pendientes.push(errorInnominado);

  if (fiscal) {
    const errorFiscal = validarDireccionFiscal(sinNada(fiscal.direccion), sinNada(fiscal.numeroCasa), {
      exigir: c.tipoOperacion !== "B2F",
      departamento: sinNada(fiscal.departamentoCodigo),
      distrito: sinNada(fiscal.distritoCodigo),
      ciudad: sinNada(fiscal.ciudadCodigo),
    });
    if (errorFiscal) pendientes.push(errorFiscal);
  } else if (c.tipoOperacion === "B2F") {
    // D213 es obligatorio cuando D202 = 4 (Manual v150).
    pendientes.push("Una operación B2F requiere dirección fiscal del receptor.");
  }

  return { apto: pendientes.length === 0, pendientes };
}
