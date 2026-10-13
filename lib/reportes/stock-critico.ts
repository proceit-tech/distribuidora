import type { Pool } from "pg";

import { calcularPlanReposicion } from "@/lib/reposicion/calculo";
import { leerEntradasReposicion } from "@/lib/reposicion/datos";
import { MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import {
  agruparPorProducto, contarReferencias, costoDeProducto, detallesDesdePlan, filtrarDetalles, ordenarDetalles, totalesCritico,
  type CostoCrudo, type ProductoInfo,
} from "@/lib/reportes/stock-critico-plan";
import { conSnapshotLectura } from "@/lib/reportes/snapshot";
import type { StockCriticoFiltros, StockCriticoRespuesta } from "@/types/reportes";

// Reporte 4 — Stock crítico y reposición (solo lectura; no crea compras, pedidos, transferencias ni simulaciones).
//
// UN SOLO MOTOR. Las exigencias, metas, transferencias y compras salen de `calcularPlanReposicion` (el mismo de Inventario > Reposición, sin tránsito) aplicado a los mismos
// datos (`leerEntradasReposicion`: productos activos que controlan stock, depósitos ACTIVOS autorizados del usuario, parámetros por depósito, disponible propio). Este módulo
// solo agrega categoría/marca/familia y el costo de referencia, filtra, agrupa y totaliza (stock-critico-plan.ts). Nada de la política se recalcula aquí.
// Toda la lectura de una solicitud (alcance, motor, enriquecimiento, costos, catálogos y hora) ocurre en UNA conexión y UNA transacción REPEATABLE READ de solo lectura.

type Db = Pick<Pool, "connect">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITUACIONES = ["ALERTAS", "TODAS", "SIN_STOCK", "BAJO_MINIMO", "EN_PUNTO", "SOBRESTOCK", "OK", "SIN_GATILLO"];

export const COBERTURA_STOCK_CRITICO = [
  "Informe de excepciones de solo lectura: muestra el resultado del MISMO cálculo de Inventario > Reposición (parámetros por depósito, disponible propio sin tránsito, transferencia primero desde otros depósitos con parámetros y compra por el resto). No planifica, no simula ni crea compras, pedidos o movimientos; para actuar use Reposición y Movimientos.",
  "Solo incluye productos activos que controlan stock y depósitos activos de su alcance. Un depósito configurado con stock cero aparece (sin stock). Los productos sin parámetros no generan alertas; «cantidad sin gatillo» avisa de una configuración incompleta.",
  "Si un destino necesita reposición pero no tiene máximo ni cantidad de reposición, se informa «sin meta definida»: no se inventa una cantidad. El total consolidado de un producto con parámetros por depósito es solo referencia y no genera alertas.",
  "Las cantidades se suman únicamente dentro de un mismo producto; el informe no tiene una cantidad total de la empresa (unidades distintas). Los totales cuentan destinos y alertas.",
  "El valor de referencia = cantidad sugerida × costo promedio real de inventario_costos (del depósito destino; si falta, el del producto), en moneda base. Es una estimación: no es la valorización del inventario, ni un precio de compra, ni un compromiso. Sin costo registrado no se estima (no se asume 0).",
  "Sobrestock = máximo definido y stock físico propio (disponible + reservado + cuarentena; sin tránsito ni terceros) por encima del máximo del mismo ámbito (el depósito con parámetros propios, o el plan consolidado cuando es el plan real). Es un aviso informativo: no genera compra ni transferencia ni cambia las recomendaciones de Reposición.",
  "Foto actual de los saldos de la solicitud; no considera consumo, plazos de entrega ni compras en camino.",
];

export function parsearFiltrosStockCritico(sp: URLSearchParams): { filtros: StockCriticoFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), categoriaId = uuid("categoriaId"), marcaId = uuid("marcaId"), familiaId = uuid("familiaId");
  if (depositoId === null || categoriaId === null || marcaId === null || familiaId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "PRODUCTO";
  if (vista !== "PRODUCTO" && vista !== "DEPOSITO") return { error: "Vista no válida." };
  const situacion = sp.get("situacion") ?? "ALERTAS";
  if (!SITUACIONES.includes(situacion)) return { error: "Situación no válida." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: { vista, depositoId, categoriaId, marcaId, familiaId, situacion: situacion as StockCriticoFiltros["situacion"], q: (sp.get("q") ?? "").trim().slice(0, 80) },
    pagina, tamano,
  };
}

type F = Record<string, unknown>;

export async function leerStockCritico(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: StockCriticoFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<StockCriticoRespuesta | { error: string; status: number }> {
  return conSnapshotLectura(db, async (c) => {
    const emp = (await c.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0] as { nombre: string; moneda: string };
    const datos = await leerEntradasReposicion(c, empresaId, usuarioId);
    if (filtros.depositoId && !datos.depositos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };

    const ids = datos.depositos.map((d) => d.id);
    const prods = await c.query(
      `SELECT p.id, p.codigo, coalesce(p.codigo_inventario, '') AS ci, coalesce(p.codigo_barras, '') AS gtin, p.descripcion, p.categoria_id AS "categoriaId", coalesce(cat.nombre, '') AS categoria,
              p.marca_id AS "marcaId", p.familia_id AS "familiaId", coalesce(fa.nombre, '') AS familia
         FROM productos p
         LEFT JOIN categorias_producto cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
         LEFT JOIN familias_producto fa ON fa.empresa_id = p.empresa_id AND fa.id = p.familia_id
        WHERE p.empresa_id = $1 AND p.activo AND p.controla_stock`,
      [empresaId],
    );
    const costos = await c.query(
      `SELECT ic.producto_id AS "productoId", ic.deposito_id AS "depositoId", ic.valor_total::text AS valor, ic.cantidad_valorizada::text AS cantidad
         FROM inventario_costos ic WHERE ic.empresa_id = $1 AND ic.deposito_id = ANY($2::uuid[])`,
      [empresaId, ids],
    );

    const productos = new Map<string, ProductoInfo>();

    for (const p of prods.rows as F[]) {
      productos.set(p.id as string, {
        categoriaId: (p.categoriaId as string | null) ?? "", categoria: p.categoria as string, marcaId: (p.marcaId as string | null) ?? "", familiaId: (p.familiaId as string | null) ?? "", familia: p.familia as string,
        busqueda: [p.codigo, p.ci, p.gtin, p.descripcion].join(" ").toLowerCase(),
      });
    }

    const costoDeposito = new Map<string, CostoCrudo>();
    const porProducto = new Map<string, CostoCrudo[]>();

    for (const k of costos.rows as F[]) {
      const crudo = { valor: k.valor as string, cantidad: k.cantidad as string };

      costoDeposito.set(`${k.productoId}|${k.depositoId}`, crudo);
      porProducto.set(k.productoId as string, [...(porProducto.get(k.productoId as string) ?? []), crudo]);
    }

    const costoProducto = new Map([...porProducto].map(([id, l]) => [id, costoDeProducto(l)]));

    // El motor se ejecuta sobre el conjunto COMPLETO de entradas; los filtros se aplican después.
    const plan = calcularPlanReposicion(datos.entradas, { incluirTransito: false });
    const { filas: detalles, referencias } = detallesDesdePlan(plan, { productos, costoDeposito, costoProducto });
    const filtrados = ordenarDetalles(filtrarDetalles(detalles, filtros, productos));
    const vista = filtros.vista === "PRODUCTO" ? ordenarDetalles(agruparPorProducto(filtrados)) : filtrados;
    if (todas && vista.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

    const desde = todas ? 0 : (pagina - 1) * tamano;
    const filas = (todas ? vista : vista.slice(desde, desde + tamano)).map(({ depositoId: _omitido, ...fila }) => { void _omitido; return fila; });
    const cat = await c.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const mar = await c.query(`SELECT id, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const fam = await c.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const ahora = await c.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`);

    return {
      empresa: emp,
      generado: ahora.rows[0].t,
      sello: ahora.rows[0].f,
      filtros,
      pagina: { numero: pagina, tamano, totalFilas: vista.length },
      filas,
      totales: totalesCritico(filtrados, vista.length, contarReferencias(referencias, filtros, productos), emp.moneda),
      catalogos: { depositos: datos.depositos, categorias: cat.rows, marcas: mar.rows, familias: fam.rows },
      cobertura: COBERTURA_STOCK_CRITICO,
    } satisfies StockCriticoRespuesta;
  });
}
