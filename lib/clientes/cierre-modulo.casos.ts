/**
 * Casos de regresión del cierre del módulo Clientes V1 (decisiones finales 1–10, 2026-10-11): GLN con dígito GS1, frecuencia
 * mensual (día 1–31), filtros de la lista, aptitud/compuerta fiscal con aislamiento por empresa y verificaciones estáticas del
 * código de las rutas. `verificarCasosCierreModulo()` devuelve los fallos (lista vacía = todos coinciden). Datos ficticios.
 */
import { readFileSync } from "node:fs";
import { contador } from "@/lib/clientes/contador-casos";
import { join } from "node:path";

import { evaluarAptitudCliente, evaluarAptitudEmpresa, mensajeRegularizacionFiscal } from "@/lib/clientes/aptitud-cliente";
import { FILTROS_VACIOS, filtrarClientes, type FiltrosListado } from "@/lib/clientes/filtros-listado";
import { leerDiaMes, validarFrecuenciaYDias } from "@/lib/clientes/logistica";
import { digitoGs1, validarGln } from "@/lib/fiscal/campos-receptor";
import type { ClienteLista } from "@/types/clientes";

const EMPRESA_A = "11111111-1111-4111-8111-111111111111";
const EMPRESA_B = "22222222-2222-4222-8222-222222222222";

function cliente(parcial: Partial<ClienteLista>): ClienteLista {
  return {
    id: "c0",
    codigo: "CLI-000001",
    naturaleza: "NO_CONTRIBUYENTE",
    tipoOperacion: "B2C",
    tipoDocumento: "CEDULA_PARAGUAYA",
    numeroDocumento: "1234567",
    dv: "",
    razonSocial: "JUAN PEREZ",
    nombreFantasia: "",
    paisNombre: "Paraguay",
    email: "",
    telefono: "",
    celular: "",
    gln: "",
    telefonoDdi: "",
    celularDdi: "",
    contactoPrincipal: { nombre: "", telefono: "", celular: "", telefonoDdi: "", celularDdi: "" },
    limiteCredito: "0",
    moneda: "PYG",
    grupoClienteId: "",
    aptitudApto: true,
    aptitudPendientes: [],
    grupoCliente: "",
    condicionPago: "",
    vendedor: "",
    rutaEntrega: "",
    zonaComercial: "",
    bloqueadoVentas: false,
    activo: true,
    ...parcial,
  };
}

/** Base de datos simulada: responde por fragmento de SQL y registra los parámetros para comprobar el aislamiento por empresa. */
function dbFalsa(clientes: Array<Record<string, unknown>>, direcciones: Array<Record<string, unknown>>) {
  const llamadas: Array<{ sql: string; valores: unknown[] }> = [];

  return {
    llamadas,
    db: {
      query: async (sql: string, valores: unknown[] = []) => {
        llamadas.push({ sql, valores });

        const empresa = valores[0];
        const clienteId = valores[1];

        if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }, { codigo: "BRA" }], rowCount: 2 };
        if (/FROM direcciones_cliente/.test(sql)) {
          const filas = direcciones.filter((d) => d.empresa_id === empresa && (clienteId === undefined || d.cliente_id === clienteId));
          return { rows: filas, rowCount: filas.length };
        }
        if (/FROM clientes c/.test(sql)) {
          const filas = clientes.filter((c) => c.empresa_id === empresa && (clienteId === undefined || c.id === clienteId));
          return { rows: filas, rowCount: filas.length };
        }

        return { rows: [], rowCount: 0 };
      },
    },
  };
}

const base = {
  empresa_id: EMPRESA_A,
  naturaleza_receptor: 2,
  tipo_operacion: 2,
  tipo_persona: "FISICA",
  pais_codigo: "PRY",
  tipo_documento: "CEDULA_PARAGUAYA",
  descripcion_documento_identidad: null,
  numero_documento: "1234567",
  dv: null,
  razon_social: "JUAN PEREZ",
  nombre_fantasia: null,
  email: null,
  telefono: null,
  celular: null,
  telefono_ddi: null,
  celular_ddi: null,
  telefono_pais: null,
  telefono_area: null,
  celular_pais: null,
  celular_area: null,
};

export async function verificarCasosCierreModulo(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (obtenido !== esperado) fallos.push(`${nombre}: esperado ${String(esperado)}, obtenido ${String(obtenido)}`);
  };
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");

  // ---- Decisión 7: GLN opcional; exacto 13 dígitos + dígito verificador GS1
  igual("GLN vacío es válido (opcional)", validarGln(""), null);
  igual("GLN válido 7501031311309", validarGln("7501031311309"), null);
  igual("GLN válido 4006381333931", validarGln("4006381333931"), null);
  igual("GLN válido 0000000000000", validarGln("0000000000000"), null);
  igual("GLN con dígito incorrecto", validarGln("7501031311300") !== null, true);
  igual("GLN de 12 dígitos", validarGln("750103131130") !== null, true);
  igual("GLN de 14 dígitos", validarGln("75010313113090") !== null, true);
  igual("GLN con letras", validarGln("75010313113A9") !== null, true);
  igual("GLN con espacio", validarGln("7501031 311309") !== null, true);
  igual("dígito GS1 de 750103131130", digitoGs1("750103131130"), 9);
  igual("dígito GS1 de 400638133393", digitoGs1("400638133393"), 1);
  for (let ultimo = 0; ultimo <= 9; ultimo += 1) {
    const valido = validarGln(`750103131130${ultimo}`) === null;
    igual(`solo un dígito de control es válido (${ultimo})`, valido, ultimo === 9);
  }

  // ---- Decisión 9: MENSUAL con día 1–31; A_DEMANDA sin calendario; las demás frecuencias intactas
  igual("MENSUAL con día 1", validarFrecuenciaYDias("MENSUAL", [], 1), null);
  igual("MENSUAL con día 31", validarFrecuenciaYDias("MENSUAL", [], "31"), null);
  igual("MENSUAL con día 15 y días de semana", validarFrecuenciaYDias("MENSUAL", [1, 2], 15), null);
  igual("MENSUAL sin día", validarFrecuenciaYDias("MENSUAL", [], "") !== null, true);
  igual("MENSUAL con día 0", validarFrecuenciaYDias("MENSUAL", [], 0) !== null, true);
  igual("MENSUAL con día 32", validarFrecuenciaYDias("MENSUAL", [], 32) !== null, true);
  igual("MENSUAL con día 1.5", validarFrecuenciaYDias("MENSUAL", [], "1.5") !== null, true);
  igual("MENSUAL con día texto", validarFrecuenciaYDias("MENSUAL", [], "abc") !== null, true);
  igual("MENSUAL con día negativo", validarFrecuenciaYDias("MENSUAL", [], "-5") !== null, true);
  igual("A_DEMANDA sin calendario", validarFrecuenciaYDias("A_DEMANDA", [], ""), null);
  igual("A_DEMANDA con día del mes", validarFrecuenciaYDias("A_DEMANDA", [], 10) !== null, true);
  igual("SEMANAL con día del mes", validarFrecuenciaYDias("SEMANAL", [1], 10) !== null, true);
  igual("SEMANAL sin días sigue exigiéndolos", validarFrecuenciaYDias("SEMANAL", []) !== null, true);
  igual("QUINCENAL sin días sigue exigiéndolos", validarFrecuenciaYDias("QUINCENAL", []) !== null, true);
  igual("DIARIA sin días sigue permitida", validarFrecuenciaYDias("DIARIA", []), null);
  igual("leerDiaMes vacío", leerDiaMes("  "), null);
  igual("leerDiaMes 07", leerDiaMes("07"), 7);
  igual("leerDiaMes 100", Number.isNaN(leerDiaMes("100")), true);

  // ---- Decisión 8: filtros de la lista
  const lista = [
    cliente({ id: "a", razonSocial: "ALFA SA", moneda: "PYG", grupoClienteId: "g1", grupoCliente: "Mayoristas", aptitudApto: true, activo: true, bloqueadoVentas: false, tipoOperacion: "B2B", naturaleza: "CONTRIBUYENTE" }),
    cliente({ id: "b", razonSocial: "BETA SRL", moneda: "USD", grupoClienteId: "g2", grupoCliente: "Minoristas", aptitudApto: false, aptitudPendientes: ["DV"], activo: true, bloqueadoVentas: true, tipoOperacion: "B2F" }),
    cliente({ id: "c", razonSocial: "GAMMA", moneda: "", grupoClienteId: "", aptitudApto: true, activo: false, bloqueadoVentas: false, tipoOperacion: "B2C", contactoPrincipal: { nombre: "Ana Gómez", telefono: "0981 123 456", celular: "", telefonoDdi: "595", celularDdi: "" } }),
  ];
  const ids = (f: Partial<FiltrosListado>) => filtrarClientes(lista, { ...FILTROS_VACIOS, ...f }).map((c) => c.id).join("");

  igual("sin filtros", ids({}), "abc");
  igual("situación activos", ids({ estado: "ACTIVOS" }), "ab");
  igual("situación inactivos", ids({ estado: "INACTIVOS" }), "c");
  igual("bloqueados", ids({ bloqueo: "BLOQUEADOS" }), "b");
  igual("sin bloqueo", ids({ bloqueo: "SIN_BLOQUEO" }), "ac");
  igual("aptos SIFEN", ids({ aptitud: "APTOS" }), "ac");
  igual("no aptos SIFEN", ids({ aptitud: "NO_APTOS" }), "b");
  igual("grupo g1", ids({ grupo: "g1" }), "a");
  igual("moneda USD", ids({ moneda: "USD" }), "b");
  igual("sin moneda", ids({ moneda: "SIN_MONEDA" }), "c");
  igual("operación B2F", ids({ operacion: "B2F" }), "b");
  igual("naturaleza contribuyente", ids({ naturaleza: "CONTRIBUYENTE" }), "a");
  igual("búsqueda por nombre", ids({ busqueda: "beta" }), "b");
  igual("búsqueda por contacto principal", ids({ busqueda: "gómez" }), "c");
  igual("búsqueda por teléfono con espacios", ids({ busqueda: "981123456" }), "c");
  igual("búsqueda + filtros combinados", ids({ busqueda: "a", estado: "ACTIVOS", bloqueo: "SIN_BLOQUEO" }), "a");
  igual("combinación sin resultados", ids({ moneda: "USD", estado: "INACTIVOS" }), "");

  // ---- Decisión 10: aptitud y compuerta fiscal con el estado real; aislamiento por empresa
  const registros = [
    { ...base, id: "ok", numero_documento: "1234567", razon_social: "JUAN PEREZ" },
    { ...base, id: "legado-ruc", naturaleza_receptor: 1, tipo_operacion: 1, tipo_persona: "JURIDICA", tipo_documento: "RUC", numero_documento: "80000005", dv: "9", razon_social: "EMPRESA SA" },
    { ...base, id: "b2f-sin-dir", tipo_operacion: 4, pais_codigo: "BRA", tipo_documento: "PASAPORTE", numero_documento: "AB123456" },
    { ...base, id: "otra", empresa_id: EMPRESA_B, razon_social: "AJENO SA" },
  ];
  const { db, llamadas } = dbFalsa(registros, []);
  const lote = await evaluarAptitudEmpresa(db, EMPRESA_A);

  igual("empresa A ve solo sus clientes", [...lote.keys()].sort().join(","), "b2f-sin-dir,legado-ruc,ok");
  igual("cliente completo es apto", lote.get("ok")?.apto, true);
  igual("legado con DV incorrecto NO es apto (exige regularización)", lote.get("legado-ruc")?.apto, false);
  igual("B2F sin dirección fiscal NO es apto", lote.get("b2f-sin-dir")?.apto, false);
  igual("compuerta: apto → sin mensaje", mensajeRegularizacionFiscal(lote.get("ok") ?? null), null);
  igual("compuerta: no apto → rechaza listando pendientes", (mensajeRegularizacionFiscal(lote.get("legado-ruc") ?? null) ?? "").startsWith("Antes de guardar debe regularizar"), true);
  igual("cliente de otra empresa invisible para A", (await evaluarAptitudCliente(db, EMPRESA_A, "otra")) === null, true);
  igual("el cliente de B es visible para B", (await evaluarAptitudCliente(db, EMPRESA_B, "otra"))?.apto, true);
  igual("toda consulta recibe la empresa como primer parámetro", llamadas.every((l) => l.valores[0] === EMPRESA_A || l.valores[0] === EMPRESA_B || /referencia_geografica_paises/.test(l.sql)), true);
  igual("toda consulta de clientes/direcciones filtra empresa_id", llamadas.filter((l) => /FROM (clientes|direcciones_cliente)/.test(l.sql)).every((l) => l.sql.includes("empresa_id = $1")), true);

  const conDireccion = dbFalsa(
    [{ ...base, id: "b2f", tipo_operacion: 4, pais_codigo: "BRA", tipo_documento: "PASAPORTE", numero_documento: "AB123456" }],
    [{ empresa_id: EMPRESA_A, cliente_id: "b2f", direccion: "Rua das Flores 10", numero_casa: "10", departamento_codigo: null, distrito_codigo: null, ciudad_codigo: null, pais_codigo: "BRA" }],
  );
  igual("B2F con dirección fiscal en el exterior es apto", (await evaluarAptitudCliente(conDireccion.db, EMPRESA_A, "b2f"))?.apto, true);

  // ---- Verificaciones estáticas del código de las rutas
  const put = leer("app/api/clientes/[id]/route.ts");
  igual("PUT aplica la compuerta fiscal", /mensajeRegularizacionFiscal\(await evaluarAptitudCliente\(conexion/.test(put), true);
  igual("PUT valida el GLN siempre (también legados)", /const errorGln = validarGln\(glnTexto\);/.test(put), true);
  igual("PUT exige importes sin cambios al cambiar de moneda", /no modifique los importes de los límites en el mismo guardado/.test(put), true);
  igual("PUT persiste el día del mes", /dia_mes_entrega = \$54/.test(put), true);
  const post = leer("app/api/clientes/route.ts");
  igual("POST aplica la compuerta fiscal", /mensajeRegularizacionFiscal\(await evaluarAptitudCliente\(conexion/.test(post), true);
  igual("POST persiste el día del mes", /dia_mes_entrega\s*\)/.test(post) && /\$52/.test(post), true);
  igual("la lista devuelve la aptitud calculada en servidor", /evaluarAptitudEmpresa\(db, empresaId\)/.test(post), true);
  igual("la lista filtra por empresa_id de la sesión", /WHERE c\.empresa_id = \$1/.test(post), true);
  const nex32 = leer("documentacao/banco/nexit/v1/migraciones/NEX-032-clientes-dia-mes-entrega.sql");
  igual("NEX-032 limita el día a 1–31 y a MENSUAL", /BETWEEN 1 AND 31 AND frecuencia_entrega = 'MENSUAL'/.test(nex32), true);

  return fallos;
}
