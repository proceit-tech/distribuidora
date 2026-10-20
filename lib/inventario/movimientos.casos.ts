/**
 * Inventario — Movimientos (ORDEM §2.B, INV-T04). Cuatro operaciones visuales sobre los nueve tipos técnicos, sin tocar el motor: reglas del formulario y de la API intactas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { aplicarTipo, formularioInicial, ORDEN_TIPOS, precargarDesdeConsulta, TIPOS_INFO, validarMovimiento } from "@/lib/movimientos/formulario";
import { GRUPOS, ORDEN_GRUPOS, grupoDeTipo, tipoInicialDelGrupo, tiposAgrupados } from "@/lib/movimientos/grupos";
import { motivoObligatorio } from "@/lib/movimientos/reglas";
import { prepararMovimiento, TIPOS } from "@/lib/movimientos/shared";
import type { CatalogoMovimientos, MovimientoStockTipo } from "@/types/movimientos-stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const HOY = "2026-10-13";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [PROD, PROD_LOTE, PROD_SERIE, DEP_A, DEP_B, DEP_X] = [U(1), U(2), U(3), U(11), U(12), U(13)];

const catalogo: CatalogoMovimientos = {
  monedaBase: "PYG",
  depositos: [
    { id: DEP_A, codigo: "A", nombre: "Central", permitido: true },
    { id: DEP_B, codigo: "B", nombre: "Norte", permitido: true },
    { id: DEP_X, codigo: "X", nombre: "Ajeno", permitido: false },
  ] as CatalogoMovimientos["depositos"],
  productos: [
    { id: PROD, codigo: "P-1", descripcion: "Leche", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stock: [], lotes: [] },
    { id: PROD_LOTE, codigo: "P-2", descripcion: "Yogur", unidadMedidaNombre: "Unidad", modoControl: "LOTE", stock: [], lotes: [] },
    { id: PROD_SERIE, codigo: "P-3", descripcion: "Notebook", unidadMedidaNombre: "Unidad", modoControl: "UNIDAD_ETIQUETADA", stock: [], lotes: [] },
  ] as CatalogoMovimientos["productos"],
};

export async function verificarCasosInventarioMovimientos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const f = (tipo: MovimientoStockTipo, extra: Record<string, unknown> = {}) => ({ ...aplicarTipo(formularioInicial(HOY), tipo), productoId: PROD, cantidad: 2, ...extra }) as ReturnType<typeof formularioInicial>;
  const campos = (x: ReturnType<typeof formularioInicial>) => Object.keys(validarMovimiento(x, catalogo, HOY));
  const api = (d: Record<string, unknown>) => {
    try {
      prepararMovimiento(d);

      return "ok";
    } catch (e) {
      return (e as Error).message;
    }
  };

  // ── Agrupación: cuatro operaciones, nueve tipos, ninguno perdido ni repetido
  igual("grupos: exactamente cuatro operaciones, en el orden aprobado", ORDEN_GRUPOS.map((g) => GRUPOS[g].etiqueta), ["Entrada / Salida", "Transferencia", "Ajuste", "Cambio de estado"]);
  igual("grupos: cubren los nueve tipos técnicos existentes, cada uno una sola vez (enums y SQL intactos)", [[...tiposAgrupados()].sort(), [...TIPOS].sort(), tiposAgrupados().length, new Set(tiposAgrupados()).size], [[...TIPOS].sort(), [...TIPOS].sort(), 9, 9]);
  igual("grupos: el formulario conoce los mismos nueve tipos (TIPOS_INFO/ORDEN_TIPOS)", [[...ORDEN_TIPOS].sort(), Object.keys(TIPOS_INFO).length], [[...TIPOS].sort(), 9]);
  igual("grupos: cada tipo pertenece al grupo esperado y al elegir una operación queda su primer subtipo", [
    grupoDeTipo("ENTRADA"), grupoDeTipo("SALIDA"), grupoDeTipo("TRANSFERENCIA"), grupoDeTipo("AJUSTE_POSITIVO"), grupoDeTipo("AJUSTE_NEGATIVO"),
    grupoDeTipo("RESERVA"), grupoDeTipo("LIBERACION_RESERVA"), grupoDeTipo("CUARENTENA"), grupoDeTipo("LIBERACION_CUARENTENA"),
    ORDEN_GRUPOS.map(tipoInicialDelGrupo),
  ], ["ENTRADA_SALIDA", "ENTRADA_SALIDA", "TRANSFERENCIA", "AJUSTE", "AJUSTE", "CAMBIO_ESTADO", "CAMBIO_ESTADO", "CAMBIO_ESTADO", "CAMBIO_ESTADO", ["ENTRADA", "TRANSFERENCIA", "AJUSTE_POSITIVO", "RESERVA"]]);
  igual("grupos: Cambio de estado ofrece reserva/liberación y cuarentena/liberación; Ajuste distingue sobrante y faltante", [GRUPOS.CAMBIO_ESTADO.tipos.map((t) => t.tipo), GRUPOS.AJUSTE.tipos.map((t) => t.etiqueta)], [["RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA"], ["Ajuste positivo (sobrante)", "Ajuste negativo (faltante)"]]);

  // ── Las reglas por tipo no cambian (matriz de campos)
  igual("reglas por tipo intactas: origen/destino/costo de los nueve tipos", ORDEN_TIPOS.map((t) => [t, TIPOS_INFO[t].origen, TIPOS_INFO[t].destino, TIPOS_INFO[t].costo]), [
    ["ENTRADA", false, true, true], ["SALIDA", true, false, false], ["TRANSFERENCIA", true, true, false], ["AJUSTE_POSITIVO", false, true, true], ["AJUSTE_NEGATIVO", true, false, false],
    ["RESERVA", true, false, false], ["LIBERACION_RESERVA", true, false, false], ["CUARENTENA", true, false, false], ["LIBERACION_CUARENTENA", true, false, false],
  ]);

  // ── Validación del formulario por operación (positivos y negativos)
  igual("Entrada/Salida: la entrada exige destino y costo (el costo no se inventa); con ambos es válida", [campos(f("ENTRADA")), campos(f("ENTRADA", { depositoDestinoId: DEP_A, costoUnitario: 1500, origen: "COMPRA" }))], [["costoUnitario", "depositoDestinoId"], []]);
  igual("Entrada/Salida: la salida exige origen; entrada o salida MANUAL exigen motivo, COMPRA/VENTA no", [campos(f("SALIDA")), campos(f("SALIDA", { depositoOrigenId: DEP_A, origen: "VENTA" })), campos(f("SALIDA", { depositoOrigenId: DEP_A, origen: "MANUAL" })), campos(f("SALIDA", { depositoOrigenId: DEP_A, origen: "MANUAL", motivo: "Merma de recepción" }))], [["depositoOrigenId"], [], ["motivo"], []]);
  igual("Transferencia: origen y destino distintos y autorizados; sin costo ni motivo obligatorio", [
    campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_A })), campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_X })), campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B })),
  ], [["depositoDestinoId"], ["depositoDestinoId"], []]);
  igual("Ajuste: positivo exige costo y motivo; negativo exige motivo", [
    campos(f("AJUSTE_POSITIVO", { depositoDestinoId: DEP_A })), campos(f("AJUSTE_POSITIVO", { depositoDestinoId: DEP_A, costoUnitario: 10, motivo: "Conteo físico" })),
    campos(f("AJUSTE_NEGATIVO", { depositoOrigenId: DEP_A })), campos(f("AJUSTE_NEGATIVO", { depositoOrigenId: DEP_A, motivo: "Rotura" })),
  ], [["costoUnitario", "motivo"], [], ["motivo"], []]);
  igual("Cambio de estado: las cuatro variantes exigen depósito y motivo y no piden costo ni destino", ["RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA"].map((t) => [campos(f(t as MovimientoStockTipo, { depositoOrigenId: DEP_A })), campos(f(t as MovimientoStockTipo, { depositoOrigenId: DEP_A, motivo: "Control de calidad" })), motivoObligatorio(t, "MANUAL")]), [
    [["motivo"], [], true], [["motivo"], [], true], [["motivo"], [], true], [["motivo"], [], true],
  ]);
  igual("cantidad ≤ 0 o más de 4 decimales, fecha futura y producto con unidad identificada se rechazan (sin ofrecer la acción imposible)", [
    campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B, cantidad: 0 })), campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B, cantidad: 1.00001 })),
    campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B, fecha: "2026-10-14" })), campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B, productoId: PROD_SERIE })),
  ], [["cantidad"], ["cantidad"], ["fecha"], ["productoId"]]);
  igual("producto por lote: el lote es obligatorio", campos(f("TRANSFERENCIA", { depositoOrigenId: DEP_A, depositoDestinoId: DEP_B, productoId: PROD_LOTE })), ["lote"]);

  // ── La API aplica lo mismo (autoridad del servidor)
  const base = { productoId: PROD, cantidad: 2, fecha: HOY };

  igual("API: misma matriz — entrada sin costo, ajuste sin motivo, transferencia al mismo depósito y tipo desconocido se rechazan; los válidos pasan", [
    api({ ...base, tipo: "ENTRADA", depositoDestinoId: DEP_A }), api({ ...base, tipo: "AJUSTE_NEGATIVO", depositoOrigenId: DEP_A }), api({ ...base, tipo: "TRANSFERENCIA", depositoOrigenId: DEP_A, depositoDestinoId: DEP_A }), api({ ...base, tipo: "OTRO" }),
    api({ ...base, tipo: "ENTRADA", depositoDestinoId: DEP_A, costoUnitario: 10 }), api({ ...base, tipo: "TRANSFERENCIA", depositoOrigenId: DEP_A, depositoDestinoId: DEP_B }), api({ ...base, tipo: "RESERVA", depositoOrigenId: DEP_A, motivo: "Pedido 12" }),
  ].map((x) => (x === "ok" ? "ok" : "rechazado")), ["rechazado", "rechazado", "rechazado", "rechazado", "ok", "ok", "ok"]);

  // ── Precarga desde Stock / Reposición: el tipo de la dirección fija la operación correspondiente
  const p = precargarDesdeConsulta(new URLSearchParams({ producto: PROD, tipo: "TRANSFERENCIA", depositoOrigen: DEP_A, depositoDestino: DEP_B, cantidad: "3" }), catalogo, formularioInicial(HOY));

  igual("precarga desde un atajo: la operación mostrada es Transferencia y nada se registra hasta confirmar", [grupoDeTipo(p.formulario.tipo), p.formulario.depositoOrigenId, p.formulario.depositoDestinoId, p.formulario.cantidad, p.precargado, p.descartados], ["TRANSFERENCIA", DEP_A, DEP_B, 3, true, []]);
  igual("precarga: un depósito ajeno o una unidad identificada se descartan", precargarDesdeConsulta(new URLSearchParams({ producto: PROD_SERIE, tipo: "TRANSFERENCIA", depositoOrigen: DEP_X }), catalogo, formularioInicial(HOY)).descartados, ["el producto", "el depósito origen"]);

  // ── Código: un solo motor, anulación por contramovimiento, permisos
  const nuevo = leer("app/(private)/movimientos/nuevo/page.tsx");
  const lista = leer("app/(private)/movimientos/page.tsx");
  const shared = leer("lib/movimientos/shared.ts");
  const anular = leer("app/api/movimientos/[id]/anular/route.ts");
  const apiLista = leer("app/api/movimientos/route.ts");

  cierto("pantalla «Nuevo movimiento»: la operación (cuatro grupos) y el subtipo salen de lib/movimientos/grupos; la clave de idempotencia y la validación previa siguen", /GRUPOS\[g\]\.etiqueta/.test(nuevo) && /cambiarGrupo/.test(nuevo) && /infoGrupo\.tipos\.map/.test(nuevo) && /crearControlRegistro\(\{ generarClave: \(\) => crypto\.randomUUID\(\)/.test(nuevo) && /control\.current\.registrar\(datos\)/.test(nuevo) && /validarMovimiento\(datos, catalogo, hoyAsuncion\(\)\)/.test(nuevo) && !/ORDEN_TIPOS/.test(nuevo));
  cierto("motor único: el registro pasa por inventario_registrar_movimiento y la anulación por inventario_anular_movimiento (contramovimiento); no hay otra ruta de escritura de saldos", /inventario_registrar_movimiento/.test(shared) && /inventario_anular_movimiento/.test(anular) && !/UPDATE stock_saldos|INSERT INTO stock_saldos|DELETE FROM movimientos_inventario/.test(shared + anular + apiLista));
  cierto("permisos: POST exige MOVIMIENTOS.CREAR, anular MOVIMIENTOS.ANULAR, el historial MOVIMIENTOS.VER; «Nuevo movimiento» del historial solo aparece con CREAR (permisos del servidor, de la respuesta vigente)", /denyIfNoPermission\(session, "MOVIMIENTOS", "CREAR"\)/.test(apiLista) && /"ANULAR"/.test(anular) && /denyIfNoPermission\(session, "MOVIMIENTOS", "VER"\)/.test(apiLista) && /datos\?\.permisos\?\.crear === true/.test(lista) && /permisos: \{ crear: hasPermission\(acceso, "MOVIMIENTOS", "CREAR"\) \}/.test(apiLista));
  cierto("historial: el filtro agrupa los nueve tipos por operación (optgroup) y Kardex/exportaciones siguen en Reportes (sin exportador aquí)", /<optgroup key=\{g\} label=\{GRUPOS\[g\]\.etiqueta\}>/.test(lista) && !/Exportar|xlsx/i.test(lista + nuevo));

  return fallos;
}
