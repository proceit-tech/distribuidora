/**
 * Casos de regresión de `evaluarAptitudSifen` (combinaciones válidas e inválidas del receptor).
 * No se ejecutan automáticamente (el proyecto no tiene corredor de pruebas y el notebook no ejecuta nada):
 * el responsable o la auditoría pueden correrlos con cualquier ejecutor de TypeScript llamando a
 * `verificarCasosAptitud()`; devuelve la lista de fallos (vacía = todos los casos coinciden).
 * Los RUC son sintéticos (vectores de `VETORES-DV-RUC-DNIT-2026-10-11.md`), no contribuyentes reales.
 */
import { evaluarAptitudSifen, type DatosAptitud, type DireccionFiscalAptitud } from "@/lib/fiscal/aptitud-sifen";

const base: DatosAptitud = {
  naturaleza: "NO_CONTRIBUYENTE",
  tipoOperacion: "B2C",
  tipoPersona: "FISICA",
  paisCodigo: "PRY",
  paisEnCatalogo: true,
  tipoDocumento: "CEDULA_PARAGUAYA",
  numeroDocumento: "1234567",
  dv: "",
  descripcionDocumento: "",
  razonSocial: "JUAN PEREZ",
  nombreFantasia: "",
  email: "",
  telefono: "",
  celular: "",
};

const contribuyente: DatosAptitud = {
  ...base,
  naturaleza: "CONTRIBUYENTE",
  tipoOperacion: "B2B",
  tipoPersona: "JURIDICA",
  tipoDocumento: "RUC",
  numeroDocumento: "80000005",
  dv: "6",
  razonSocial: "EMPRESA SA",
};

const direccionPry: DireccionFiscalAptitud = {
  direccion: "Avda. Mcal. López 1234",
  numeroCasa: "1234",
  departamentoCodigo: "1",
  distritoCodigo: "1",
  ciudadCodigo: "1",
  paisCodigo: "PRY",
  paisEnCatalogo: true,
};

const sinGeografia: DireccionFiscalAptitud = {
  direccion: "Dirección exterior 1",
  numeroCasa: "1",
  departamentoCodigo: "",
  distritoCodigo: "",
  ciudadCodigo: "",
  paisCodigo: "BRA",
  paisEnCatalogo: true,
};

type Caso = { nombre: string; datos: DatosAptitud; fiscal?: DireccionFiscalAptitud | null; apto: boolean; pendiente?: string };

export const CASOS_APTITUD_SIFEN: Caso[] = [
  // ---- Válidos
  { nombre: "contribuyente jurídico B2B, RUC/DV correctos", datos: contribuyente, apto: true },
  { nombre: "contribuyente físico B2C, RUC de 3 dígitos", datos: { ...contribuyente, tipoPersona: "FISICA", tipoOperacion: "B2C", numeroDocumento: "123", dv: "6" }, apto: true },
  { nombre: "contribuyente B2G", datos: { ...contribuyente, tipoOperacion: "B2G" }, apto: true },
  { nombre: "contribuyente con dirección fiscal y geografía completa", datos: contribuyente, fiscal: direccionPry, apto: true },
  { nombre: "no contribuyente B2C con cédula paraguaya", datos: base, apto: true },
  { nombre: "no contribuyente B2C Innominado", datos: { ...base, tipoDocumento: "INNOMINADO", numeroDocumento: "0", razonSocial: "Sin Nombre" }, apto: true },
  {
    nombre: "no contribuyente B2F en Brasil con pasaporte y dirección fiscal sin geografía paraguaya",
    datos: { ...base, tipoOperacion: "B2F", paisCodigo: "BRA", tipoDocumento: "PASAPORTE", numeroDocumento: "AB123456" },
    fiscal: { ...sinGeografia, direccion: "Rua das Flores 10", numeroCasa: "10" },
    apto: true,
  },
  // ---- Inválidos: natureza × operación × país
  { nombre: "contribuyente B2F", datos: { ...contribuyente, tipoOperacion: "B2F", paisCodigo: "BRA" }, apto: false, pendiente: "contribuyente" },
  { nombre: "no contribuyente B2B", datos: { ...base, tipoOperacion: "B2B" }, apto: false, pendiente: "no contribuyente" },
  { nombre: "B2F con país Paraguay", datos: { ...base, tipoOperacion: "B2F", tipoDocumento: "PASAPORTE", numeroDocumento: "AB1" }, fiscal: sinGeografia, apto: false, pendiente: "B2F" },
  { nombre: "B2C con país extranjero", datos: { ...base, paisCodigo: "BRA" }, apto: false, pendiente: "Paraguay" },
  { nombre: "país vacío", datos: { ...base, paisCodigo: "" }, apto: false, pendiente: "país" },
  { nombre: "código de operación desconocido (no se sustituye por B2C)", datos: { ...base, tipoOperacion: "DESCONOCIDA_9" }, apto: false, pendiente: "tipo de operación" },
  { nombre: "código de naturaleza desconocido", datos: { ...base, naturaleza: "DESCONOCIDA_7" }, apto: false, pendiente: "naturaleza" },
  { nombre: "tipo de persona vacío", datos: { ...base, tipoPersona: "" }, apto: false, pendiente: "tipo de persona" },
  // ---- País y catálogo oficial (C5)
  { nombre: "B2F con país extranjero válido en el catálogo (BRA)", datos: { ...base, tipoOperacion: "B2F", paisCodigo: "BRA", paisEnCatalogo: true, tipoDocumento: "PASAPORTE", numeroDocumento: "AB123456" }, fiscal: sinGeografia, apto: true },
  { nombre: "B2F con país inexistente ZZZ", datos: { ...base, tipoOperacion: "B2F", paisCodigo: "ZZZ", paisEnCatalogo: false, tipoDocumento: "PASAPORTE", numeroDocumento: "AB123456" }, fiscal: sinGeografia, apto: false, pendiente: "catálogo oficial de países" },
  { nombre: "B2C con código PRY inactivo/inexistente en el catálogo", datos: { ...base, paisEnCatalogo: false }, apto: false, pendiente: "catálogo oficial de países" },
  { nombre: "país no verificable (catálogo no consultado)", datos: { ...base, paisEnCatalogo: null }, apto: false, pendiente: "No fue posible verificar" },
  { nombre: "domicilio fiscal con país inexistente", datos: { ...base, tipoOperacion: "B2F", paisCodigo: "BRA", paisEnCatalogo: true, tipoDocumento: "PASAPORTE", numeroDocumento: "AB123456" }, fiscal: { ...sinGeografia, paisCodigo: "ZZZ", paisEnCatalogo: false }, apto: false, pendiente: "domicilio fiscal" },
  // ---- Inválidos: identificación
  { nombre: "DV incorrecto", datos: { ...contribuyente, dv: "5" }, apto: false, pendiente: "DV" },
  { nombre: "RUC con letras", datos: { ...contribuyente, numeroDocumento: "80A00005" }, apto: false, pendiente: "RUC" },
  { nombre: "RUC con 9 dígitos (DV pegado)", datos: { ...contribuyente, numeroDocumento: "800000056" }, apto: false, pendiente: "RUC" },
  { nombre: "contribuyente con documento que no es RUC", datos: { ...contribuyente, tipoDocumento: "CEDULA_PARAGUAYA" }, apto: false, pendiente: "RUC" },
  { nombre: "no contribuyente con tipo RUC", datos: { ...base, tipoDocumento: "RUC" }, apto: false, pendiente: "tipo de documento" },
  { nombre: "no contribuyente con DV", datos: { ...base, dv: "1" }, apto: false, pendiente: "DV" },
  { nombre: "documento de más de 20 caracteres", datos: { ...base, numeroDocumento: "123456789012345678901" }, apto: false, pendiente: "número de documento" },
  { nombre: "documento Otro sin descripción", datos: { ...base, tipoDocumento: "OTRO" }, apto: false, pendiente: "descripción" },
  { nombre: "Innominado en B2F", datos: { ...base, tipoOperacion: "B2F", paisCodigo: "BRA", tipoDocumento: "INNOMINADO", numeroDocumento: "0", razonSocial: "Sin Nombre" }, fiscal: sinGeografia, apto: false, pendiente: "Innominado" },
  { nombre: "Innominado con nombre distinto", datos: { ...base, tipoDocumento: "INNOMINADO", numeroDocumento: "0", razonSocial: "Pedro" }, apto: false, pendiente: "Innominado" },
  { nombre: "razón social de 2 caracteres", datos: { ...base, razonSocial: "AB" }, apto: false, pendiente: "razón social" },
  // ---- Inválidos: domicilio fiscal
  { nombre: "B2F sin dirección fiscal", datos: { ...base, tipoOperacion: "B2F", paisCodigo: "BRA", tipoDocumento: "PASAPORTE", numeroDocumento: "AB1" }, fiscal: null, apto: false, pendiente: "B2F requiere" },
  { nombre: "dirección fiscal B2C sin geografía", datos: contribuyente, fiscal: { ...direccionPry, departamentoCodigo: "", distritoCodigo: "", ciudadCodigo: "" }, apto: false, pendiente: "departamento" },
  { nombre: "dirección fiscal con número de casa no numérico", datos: contribuyente, fiscal: { ...direccionPry, numeroCasa: "s/n" }, apto: false, pendiente: "número de casa" },
];

/** Devuelve los casos cuyo resultado no coincide con lo esperado (lista vacía = regresión superada). */
export function verificarCasosAptitud(): string[] {
  const fallos: string[] = [];

  for (const caso of CASOS_APTITUD_SIFEN) {
    const r = evaluarAptitudSifen(caso.datos, caso.fiscal ?? null);

    if (r.apto !== caso.apto) {
      fallos.push(`${caso.nombre}: esperado apto=${caso.apto}, obtenido apto=${r.apto} (${r.pendientes.join(" | ")})`);
    } else if (caso.pendiente && !r.pendientes.some((p) => p.toLowerCase().includes(caso.pendiente!.toLowerCase()))) {
      fallos.push(`${caso.nombre}: ninguna pendiente menciona "${caso.pendiente}" (${r.pendientes.join(" | ")})`);
    }
  }

  return fallos;
}
