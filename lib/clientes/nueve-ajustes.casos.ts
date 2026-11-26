/**
 * Casos de regresión de los nueve ajustes CLI-VIS-01…09 (conversión de moneda, frecuencia × días, dirección fiscal B2F,
 * reglas y validación de archivos). No se ejecutan automáticamente: `verificarCasosNueveAjustes()` devuelve los fallos
 * (lista vacía = todos coinciden). Datos ficticios.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { ErrorArchivo, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarNombreYTamano, TAMANO_MAXIMO_BYTES } from "@/lib/almacenamiento/archivos-reglas";
import { convertirImporte, convertirLimites, requiereConversion, validarTasa } from "@/lib/clientes/cambio";
import { validarFrecuenciaYDias } from "@/lib/clientes/logistica";
import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";
import { validarMetadatosDocumento } from "@/lib/clientes/documentos";

export function verificarCasosNueveAjustes(): string[] {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (obtenido !== esperado) fallos.push(`${nombre}: esperado ${String(esperado)}, obtenido ${String(obtenido)}`);
  };
  const lanza = (nombre: string, f: () => unknown) => {
    contador.n += 1;
    try {
      f();
      fallos.push(`${nombre}: debía fallar`);
    } catch {
      /* esperado */
    }
  };

  // ---- CLI-VIS-05/06: conversión exacta (BigInt), half-up a 4 decimales
  igual("1000 × 7500", convertirImporte("1000", "7500"), "7500000");
  igual("1500.5 × 0.00013333", convertirImporte("1500.5", "0.00013333"), "0.2001");
  igual("half-up hacia arriba", convertirImporte("0.0001", "0.5"), "0.0001"); // 0.00005 → 0.0001
  igual("half-up hacia abajo", convertirImporte("0.0001", "0.4999"), "0"); // 0.00004999 → 0
  igual("18 cifras exactas", convertirImporte("12345678901234.5678", "1"), "12345678901234.5678");
  igual("0 × tasa", convertirImporte("0", "7500"), "0");
  const c = convertirLimites("1000", "250.5", "7500,25");
  igual("límite convertido", c.limiteDestino, "7500250");
  igual("temporal convertido (250.5 × 7500.25)", c.temporalDestino, "1878812.625");
  igual("temporal null se conserva", convertirLimites("10", null, "2").temporalDestino, null);
  lanza("tasa 0", () => validarTasa("0"));
  lanza("tasa negativa", () => validarTasa("-7500"));
  lanza("tasa con miles", () => validarTasa("7.500,25"));
  lanza("tasa vacía", () => validarTasa(""));
  lanza("resultado fuera de rango", () => convertirLimites("99999999999999", null, "10"));
  igual("requiere conversión: límites en cero", requiereConversion("0", null), false);
  igual("requiere conversión: límite normal", requiereConversion("0.0001", null), true);
  igual("requiere conversión: solo temporal", requiereConversion("0", "5"), true);

  // ---- CLI-VIS-07 / decisión 10: frecuencia × días (obligatorios en semanal y quincenal; diaria usa los elegidos)
  igual("SEMANAL sin días", validarFrecuenciaYDias("SEMANAL", []) !== null, true);
  igual("QUINCENAL sin días", validarFrecuenciaYDias("QUINCENAL", []) !== null, true);
  igual("SEMANAL con días", validarFrecuenciaYDias("SEMANAL", [1, 4]), null);
  igual("DIARIA sin días (sin exigencia aprobada)", validarFrecuenciaYDias("DIARIA", []), null);
  igual("DIARIA con días", validarFrecuenciaYDias("DIARIA", [1, 2, 3, 4, 5]), null);
  igual("MENSUAL sin días de semana pero con día del mes", validarFrecuenciaYDias("MENSUAL", [], 5), null);
  igual("MENSUAL sin día del mes (decisión 9: se solicita)", validarFrecuenciaYDias("MENSUAL", []) !== null, true);
  igual("A_DEMANDA sin días (no se inventa regla)", validarFrecuenciaYDias("A_DEMANDA", []), null);
  igual("sin frecuencia, sin días", validarFrecuenciaYDias("", []), null);
  igual("frecuencia inválida", validarFrecuenciaYDias("SEMESTRAL", [1]) !== null, true);
  igual("día 0", validarFrecuenciaYDias("SEMANAL", [0]) !== null, true);
  igual("día 8", validarFrecuenciaYDias("SEMANAL", [8]) !== null, true);
  igual("día repetido", validarFrecuenciaYDias("SEMANAL", [2, 2]) !== null, true);

  // ---- CLI-VIS-06: dirección fiscal condicional
  igual("B2F sin dirección fiscal", validarDireccionFiscalRequerida("B2F", false) !== null, true);
  igual("B2F con dirección fiscal", validarDireccionFiscalRequerida("B2F", true), null);
  for (const operacion of ["B2B", "B2C", "B2G"]) igual(`${operacion} sin dirección fiscal (facultativa)`, validarDireccionFiscalRequerida(operacion, false), null);

  // ---- CLI-VIS-01: archivos (firma, extensión, tamaño, nombre)
  const pdf = Buffer.from("%PDF-1.4 ficticio");
  igual("PDF válido", validarArchivo("constancia.pdf", pdf).mime, "application/pdf");
  igual("nombre con ruta se sanea", validarArchivo("..\\..\\etc\\contrato.PDF", pdf).nombre, "contrato.PDF");
  lanza("extensión no permitida", () => validarArchivo("virus.exe", pdf));
  lanza("sin extensión", () => validarArchivo("archivo", pdf));
  lanza("firma que no corresponde", () => validarArchivo("falso.pdf", Buffer.from("MZ-ejecutable")));
  lanza("archivo vacío", () => validarArchivo("vacio.pdf", Buffer.alloc(0)));
  lanza("nombre vacío", () => validarArchivo("   ", pdf));
  igual("png con firma correcta", validarArchivo("a.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])).mime, "image/png");
  igual("docx = zip", validarArchivo("a.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])).tamano, 5);
  igual("sha256 de 64 hex", /^[0-9a-f]{64}$/.test(validarArchivo("a.pdf", pdf).sha256), true);
  igual("validación previa de interfaz: tamaño", validarNombreYTamano("a.pdf", TAMANO_MAXIMO_BYTES + 1) !== null, true);
  igual("validación previa de interfaz: tamaño máximo exacto", validarNombreYTamano("a.pdf", TAMANO_MAXIMO_BYTES), null);
  try {
    validarArchivo("grande.pdf", Buffer.concat([pdf, Buffer.alloc(TAMANO_MAXIMO_BYTES)]));
    fallos.push("archivo de más de 10 MB: debía fallar");
  } catch (e) {
    igual("archivo > 10 MB → 413", e instanceof ErrorArchivo && e.estado === 413, true);
  }

  // ---- Metadatos de documentos
  igual("metadatos válidos", validarMetadatosDocumento({ tipo: "contrato", fechaEmision: "01/02/2026", fechaVencimiento: "01/03/2026" }).fechaVencimiento, "2026-03-01");
  lanza("fecha imposible", () => validarMetadatosDocumento({ tipo: "OTRO", fechaEmision: "31/02/2026" }));
  lanza("vencimiento anterior a emisión", () => validarMetadatosDocumento({ tipo: "OTRO", fechaEmision: "02/02/2026", fechaVencimiento: "01/02/2026" }));
  lanza("tipo inválido", () => validarMetadatosDocumento({ tipo: "FOTO" }));
  lanza("observación de 501 caracteres", () => validarMetadatosDocumento({ tipo: "OTRO", observacion: "x".repeat(501) }));

  return fallos;
}
