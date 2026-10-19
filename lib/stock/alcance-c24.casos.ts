/**
 * C24 / STK-D01 (solo Stock) — visibilidad de productos y lectura de «Sin stock» según el alcance de depósitos. SIN PostgreSQL: `leerStock` real contra una conexión SIMULADA que aplica la semántica de las consultas
 * (empresa, productos activos/inactivos con saldo, filtros de alcance por usuario_deposito); la simulación reconoce los filtros de alcance en el SQL, de modo que si faltaran, los casos fallan. NO prueba el motor SQL real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { leerStock } from "@/lib/stock/shared";
import { alcanceDeStock, descripcionSinStock, etiquetaNivel, indicadoresStock, vistaPorDeposito } from "@/lib/stock/vista";
import type { StockItem } from "@/types/stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

const EMP = "11111111-1111-4111-8111-111111111111";
const OTRA = "99999999-9999-4999-8999-999999999999";
const DEP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U_A = "u-solo-a";
const U_FULL = "u-todos";
const U_NONE = "u-sin-depositos";

type Prod = { id: string; empresa: string; codigo: string; activo: boolean };
type Saldo = { producto: string; deposito: string; cantidad: number };

const PRODUCTOS: Prod[] = [
  { id: "P1", empresa: EMP, codigo: "ACTIVO-SOLO-B", activo: true },
  { id: "P2", empresa: EMP, codigo: "ACTIVO-SIN-SALDOS", activo: true },
  { id: "P3", empresa: EMP, codigo: "ACTIVO-CERO-EN-A", activo: true },
  { id: "P4", empresa: EMP, codigo: "INACTIVO-SOLO-B", activo: false },
  { id: "P5", empresa: EMP, codigo: "INACTIVO-CON-A", activo: false },
  { id: "P6", empresa: OTRA, codigo: "OTRA-EMPRESA", activo: true },
];
const SALDOS: Saldo[] = [
  { producto: "P1", deposito: DEP_B, cantidad: 15 },
  { producto: "P3", deposito: DEP_A, cantidad: 0 },
  { producto: "P4", deposito: DEP_B, cantidad: 7 },
  { producto: "P5", deposito: DEP_A, cantidad: 10 },
  { producto: "P6", deposito: DEP_A, cantidad: 99 },
];
const DEPOSITOS = [{ id: DEP_A, nombre: "Central" }, { id: DEP_B, nombre: "Norte" }];
/** usuario → depósitos autorizados; null = alcance TODOS. */
const AUTORIZADOS: Record<string, string[] | null> = { [U_A]: [DEP_A], [U_FULL]: null, [U_NONE]: [] };

/** Conexión simulada: aplica empresa, el filtro de alcance (solo si el SQL lo incluye) y la regla de productos inactivos. */
function conexion(consultas: string[] = []) {
  return {
    async query(sqlCrudo: string, params: unknown[] = []) {
      const sql = sqlCrudo.replace(/\s+/g, " ");
      const empresa = params[0] as string;
      const usuario = /JOIN usuarios u ON/.test(sql) ? (params[params.length - 1] as string) : null;
      const permitidos = (d: string) => {
        const a = usuario ? AUTORIZADOS[usuario] : null;

        return a === null || a === undefined ? true : a.includes(d);
      };

      consultas.push(sql);
      if (/FROM productos p/.test(sql)) {
        // El EXISTS de productos inactivos solo se limita al alcance si el SQL lo incluye en la subconsulta.
        const exists = /s\.cantidad > 0 AND s\.deposito_id IN \(SELECT d\.id FROM depositos d JOIN usuarios/.test(sql);
        const rows = PRODUCTOS.filter((p) => p.empresa === empresa && (p.activo || SALDOS.some((s) => s.producto === p.id && s.cantidad > 0 && (!exists || permitidos(s.deposito))))).map((p) => ({
          id: p.id, codigo: p.codigo, codigoInventario: "", codigoBarras: "", descripcion: p.codigo, categoria: "", marca: "", familia: "", linea: "", procedencia: "", unidadMedidaId: "u", unidadMedidaNombre: "Unidad",
          modoControl: "CANTIDAD", stockMinimo: 0, stockMaximo: 0, puntoReposicion: 0, actualizadoEn: "",
        }));

        return { rows, rowCount: rows.length };
      }
      if (/FROM stock_saldos s/.test(sql)) {
        const acota = /s\.deposito_id IN \(SELECT d\.id FROM depositos d JOIN usuarios/.test(sql);
        const rows = SALDOS.filter((s) => s.cantidad !== 0 && PRODUCTOS.find((p) => p.id === s.producto)?.empresa === empresa && (!acota || permitidos(s.deposito))).map((s, i) => ({
          id: `s${i}`, productoId: s.producto, depositoId: s.deposito, depositoCodigo: s.deposito === DEP_A ? "A" : "B", depositoNombre: s.deposito === DEP_A ? "Central" : "Norte",
          estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: s.cantidad, cantidadTexto: String(s.cantidad), lote: "", vencimiento: "",
        }));

        return { rows, rowCount: rows.length };
      }
      if (/FROM inventario_costos c/.test(sql)) {
        const acota = /c\.deposito_id IN \(SELECT d\.id FROM depositos d JOIN usuarios/.test(sql);
        const rows = SALDOS.filter((s) => s.cantidad !== 0 && PRODUCTOS.find((p) => p.id === s.producto)?.empresa === empresa && (!acota || permitidos(s.deposito))).map((s) => ({
          productoId: s.producto, depositoId: s.deposito, cantidad: s.cantidad, valor: s.cantidad * 100, valorTexto: String(s.cantidad * 100), cantidadTexto: String(s.cantidad),
        }));

        return { rows, rowCount: rows.length };
      }
      if (/SELECT count\(\*\)::int AS n FROM depositos WHERE/.test(sql)) return { rows: [{ n: DEPOSITOS.length }], rowCount: 1 };
      if (/SELECT count\(\*\)::int AS n FROM \(/.test(sql)) {
        const n = usuario === null ? DEPOSITOS.length : DEPOSITOS.filter((d) => permitidos(d.id)).length;

        return { rows: [{ n }], rowCount: 1 };
      }
      if (/SELECT d\.id, d\.nombre FROM depositos d/.test(sql)) {
        const rows = DEPOSITOS.filter((d) => !/IN \(SELECT d\.id FROM depositos d JOIN usuarios/.test(sql) || permitidos(d.id));

        return { rows, rowCount: rows.length };
      }
      if (/FROM empresas/.test(sql)) return { rows: [{ nombre: "Empresa", moneda: "PYG" }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  } as never;
}

export async function verificarCasosStockAlcanceC24(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const ids = (r: { stock: unknown[] }) => (r.stock as StockItem[]).map((i) => i.productoId);
  const por = (r: { stock: unknown[] }, id: string) => (r.stock as StockItem[]).find((i) => i.productoId === id)!;

  const rA = await leerStock(conexion(), EMP, null, U_A);
  const rFull = await leerStock(conexion(), EMP, null, U_FULL);
  const rNone = await leerStock(conexion(), EMP, null, U_NONE);

  // 1) Usuario solo en A; producto activo con stock exclusivamente en B.
  const p1 = por(rA, "P1");

  igual("C24-1: P1 (activo, 15 unidades solo en B) aparece en el catálogo de quien solo ve A, SIN cantidades, depósitos, lotes ni costos de B, y su situación es «sin disponible en depósitos autorizados» (no «sin stock» de la empresa)", [p1.disponible, p1.totalFisico, p1.depositos, p1.lotes, p1.valorInventario, p1.costoPromedioTexto, p1.nivel, etiquetaNivel(p1.nivel, rA.alcance ?? "COMPLETO"), rA.alcance, JSON.stringify(rA).includes("Norte"), JSON.stringify(rA).includes('"cantidad":15')], [0, 0, [], [], 0, null, "SIN_STOCK", "Sin disponible en depósitos autorizados", "PARCIAL", false, false]);

  // 2) Activo sin stock en ningún depósito; 3) activo legítimamente zerado en A.
  igual("C24-2/3: el producto activo sin saldos y el activo en cero en A siguen consultables (no se eliminan por no tener saldo positivo)", [por(rA, "P2")?.nivel, por(rA, "P3")?.nivel, por(rA, "P3")?.disponible], ["SIN_STOCK", "SIN_STOCK", 0]);

  // 4) inactivo con saldo solo en B (sin acceso); 5) inactivo con saldo en A (autorizado).
  igual("C24-4/5: el inactivo con saldo solo en B NO es visible para quien solo ve A (la existencia de saldo fuera del alcance no decide); el inactivo con saldo en A sí, con su disponible", [ids(rA).includes("P4"), ids(rA).includes("P5"), por(rA, "P5")?.disponible, [...ids(rA)].sort()], [false, true, 10, ["P1", "P2", "P3", "P5"]]);

  // 6) Alcance completo.
  igual("C24-6: con alcance completo se ve todo el universo de la empresa (incluye el inactivo con saldo en cualquier depósito), saldos de ambos depósitos y «Sin stock» literal", [rFull.alcance, ids(rFull).includes("P4"), ids(rFull).includes("P5"), por(rFull, "P1").disponible, por(rFull, "P1").depositos.length, etiquetaNivel("SIN_STOCK", rFull.alcance ?? "COMPLETO"), por(rFull, "P2").nivel], ["COMPLETO", true, true, 15, 1, "Sin stock", "SIN_STOCK"]);

  // 7) Sin depósitos autorizados.
  igual("C24-7: sin depósitos autorizados → alcance SIN_DEPOSITOS, catálogo activo visible sin ningún saldo/costo/lote, inactivos ocultos, sin depósitos en el selector y etiqueta de ausencia de acceso (no «Sin stock» de la empresa)", [rNone.alcance, [...ids(rNone)].sort(), (rNone.stock as StockItem[]).every((i) => i.depositos.length === 0 && i.disponible === 0 && i.valorInventario === 0), rNone.depositosAutorizados, etiquetaNivel("SIN_STOCK", rNone.alcance ?? "COMPLETO"), descripcionSinStock("SIN_DEPOSITOS")], ["SIN_DEPOSITOS", ["P1", "P2", "P3"], true, [], "Sin acceso a depósitos", "Sin depósitos autorizados: no hay saldos que informar"]);

  // 8) Otra empresa.
  igual("C24-8: el producto de otra empresa no aparece nunca (con cualquier alcance) y todas las consultas llevan la empresa de la sesión", [ids(rA).includes("P6"), ids(rFull).includes("P6"), ids(rNone).includes("P6")], [false, false, false]);

  // 9) Indicadores = población mostrada.
  const iA = indicadoresStock(rA.stock as StockItem[]);
  const iFull = indicadoresStock(rFull.stock as StockItem[]);

  igual("C24-9: los indicadores cuentan exactamente la población mostrada (SKU, disponible y «sin stock» coinciden con las filas)", [iA, (rA.stock as StockItem[]).length, (rA.stock as StockItem[]).filter((i) => i.nivel === "SIN_STOCK").length, iFull, (rFull.stock as StockItem[]).length], [{ sku: 4, disponible: 10, sinStock: 3, stockBajo: 0 }, 4, 3, { sku: 5, disponible: 32, sinStock: 2, stockBajo: 0 }, 5]);

  // 10) Consulta por depósito.
  const p5 = por(rA, "P5");

  igual("C24-10: la consulta por depósito solo expone el alcance — P5 en A con sus valores; P1 no tiene vista en A ni en B (B no existe para este usuario); la vista no mezcla otros depósitos", [vistaPorDeposito(p5, DEP_A)?.disponible, vistaPorDeposito(p5, DEP_A)?.valorInventarioTexto, vistaPorDeposito(p1, DEP_A), vistaPorDeposito(p1, DEP_B), vistaPorDeposito(por(rFull, "P1"), DEP_B)?.disponible, vistaPorDeposito(por(rFull, "P1"), DEP_A)], [10, "1000", null, null, 15, null]);

  // Alcance y consultas de la capa de servicio.
  igual("C24: alcanceDeStock — sin restricción completo; todos los depósitos completo; menos depósitos parcial; cero depósitos con empresa con depósitos = sin depósitos; empresa sin depósitos no se trata como falta de acceso", [alcanceDeStock(false, 0, 0), alcanceDeStock(true, 2, 2), alcanceDeStock(true, 1, 2), alcanceDeStock(true, 0, 2), alcanceDeStock(true, 0, 0)], ["COMPLETO", "COMPLETO", "PARCIAL", "SIN_DEPOSITOS", "COMPLETO"]);

  const consultas: string[] = [];

  await leerStock(conexion(consultas), EMP, null, U_A);
  const sqlProductos = consultas.find((s) => /FROM productos p/.test(s)) ?? "";
  const pagina = leer("app/(private)/stock/page.tsx");
  const compartido = leer("lib/stock/shared.ts");

  cierto("C24 servicio y pantalla: el EXISTS de productos inactivos queda limitado al alcance (mismo filtro que saldos/costos), Stock sigue siendo solo lectura, y la pantalla usa el alcance para etiquetas, indicadores («—» sin depósitos) y aviso", /s\.cantidad > 0 AND s\.deposito_id IN \(SELECT d\.id FROM depositos d JOIN usuarios/.test(sqlProductos) && /\$\{filtroAlcanceS\}\)\)/.test(compartido) && !/INSERT|UPDATE|DELETE/i.test(compartido) && /etiquetaNivel\(item\.nivel, alcance\)/.test(pagina) && /alcance === "SIN_DEPOSITOS" \? "—"/.test(pagina) && /Usted no tiene depósitos autorizados/.test(pagina) && /descripcionSinStock\(alcance\)/.test(pagina));

  return fallos;
}
