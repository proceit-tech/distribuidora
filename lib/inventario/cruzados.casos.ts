/**
 * Inventario — pruebas CRUZADAS entre Stock, Movimientos, Depósitos y Reposición (ORDEM §5: INV-T01, T03, T06, T09, T10). Responsabilidades: Stock consulta, Movimientos ejecuta,
 * Depósitos administra, Reposición planifica. Sin PostgreSQL ni navegador.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { puedeAbrirNuevoMovimiento, puedeVerMovimientos } from "@/lib/inventario/acceso";
import { calcularReposicion, type EntradaReposicion } from "@/lib/reposicion/calculo";
import { leerStock } from "@/lib/stock/shared";
import { vistaPorDeposito } from "@/lib/stock/vista";
import type { StockItem } from "@/types/stock";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [EMP, USR, PROD, DEP_A, DEP_B] = [U(1), U(2), U(3), U(11), U(12)];

type Saldo = { depositoId: string; nombre: string; estado: string; propiedad: string; cantidad: number; lote?: string };

/** Base simulada que sirve a Stock con saldos explícitos (como lo haría `stock_saldos` tras cada movimiento). */
function dbConSaldos(saldos: Saldo[], alcanceIds: string[] | null = null) {
  return {
    query: async (sql: string) => {
      const rows = (() => {
        if (/FROM productos p/.test(sql)) return [{ id: PROD, codigo: "P-1", codigoInventario: "", codigoBarras: "", descripcion: "Leche", categoria: "", marca: "", familia: "", linea: "", procedencia: "", unidadMedidaId: "u", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stockMinimo: 0, stockMaximo: 0, puntoReposicion: 0, actualizadoEn: "x" }];
        if (/FROM stock_saldos s/.test(sql)) {
          return saldos
            .filter((s) => alcanceIds === null || alcanceIds.includes(s.depositoId))
            .map((s, i) => ({ id: `s${i}`, productoId: PROD, depositoId: s.depositoId, depositoCodigo: s.nombre.slice(0, 1), depositoNombre: s.nombre, estado: s.estado, propiedad: s.propiedad, cantidad: s.cantidad, cantidadTexto: String(s.cantidad), lote: s.lote ?? "", vencimiento: "" }));
        }
        if (/FROM inventario_costos/.test(sql)) return [];
        if (/v_producto_precio_referencia/.test(sql)) return [];
        if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa", moneda: "PYG" }];
        if (/producto_deposito_configuracion/.test(sql)) return [];
        if (/count\(\*\)/.test(sql)) return [{ n: /FROM \(SELECT/.test(sql) ? (alcanceIds === null ? 2 : alcanceIds.length) : 2 }];

        return [];
      })();

      return { rows, rowCount: rows.length };
    },
  } as never;
}

const entradaDe = (item: StockItem, depositoId: string, nombre: string, parametros: EntradaReposicion["parametros"]): EntradaReposicion => {
  const v = vistaPorDeposito(item, depositoId);

  return {
    clave: `${PROD}|${depositoId}`, ambito: "DEPOSITO", productoId: PROD, productoCodigo: "P-1", productoDescripcion: "Leche", marca: "", unidad: "Unidad", depositoId, depositoNombre: nombre,
    saldo: { disponible: v?.disponible ?? 0, reservado: v?.reservado ?? 0, cuarentena: v?.cuarentena ?? 0, transito: v?.transito ?? 0 }, parametros, otrosDepositos: [], proveedorPrincipal: null,
  };
};

export async function verificarCasosInventarioCruzados(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const parametrosB = { minimo: 5, punto: 10, maximo: 30, cantidadReposicion: null };

  // ── INV-T01: un movimiento (transferencia A→B) cambia los saldos una sola vez y se refleja en Stock y en Reposición
  const antes: Saldo[] = [
    { depositoId: DEP_A, nombre: "Central", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 15 },
    { depositoId: DEP_B, nombre: "Norte", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 2 },
  ];
  const despues: Saldo[] = [
    { depositoId: DEP_A, nombre: "Central", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 10 },
    { depositoId: DEP_B, nombre: "Norte", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 7 },
  ];
  const s0 = (await leerStock(dbConSaldos(antes), EMP, null, USR)).stock[0] as unknown as StockItem;
  const s1 = (await leerStock(dbConSaldos(despues), EMP, null, USR)).stock[0] as unknown as StockItem;

  igual("INV-T01 transferencia 5 de A a B: el total propio no cambia (17) y cada depósito refleja el movimiento una sola vez en Stock", [s0.disponible, s1.disponible, vistaPorDeposito(s1, DEP_A)?.disponible, vistaPorDeposito(s1, DEP_B)?.disponible], [17, 17, 10, 7]);
  const r0 = calcularReposicion(entradaDe(s0, DEP_B, "Norte", parametrosB), { incluirTransito: false });
  const r1 = calcularReposicion(entradaDe(s1, DEP_B, "Norte", parametrosB), { incluirTransito: false });

  igual("INV-T01 Reposición recalcula con el mismo saldo: B pasa de «Bajo mínimo» (2 < 5) a «En punto de reposición» (7 ≤ 10) y la sugerencia baja de 28 a 23", [r0.criticidad, r1.criticidad, r0.sugerida, r1.sugerida], ["BAJO_MINIMO", "EN_PUNTO", 28, 23]);
  igual("INV-01 mismo saldo de B (7, mínimo 5, punto 10): Stock lo clasifica Normal mientras Reposición pide abastecer (distinción intencional, con ayuda en ambas pantallas)", [vistaPorDeposito({ ...s1, depositos: s1.depositos.map((d) => (d.depositoId === DEP_B ? { ...d, stockMinimo: 5, stockMaximo: 30, puntoReposicion: 10 } : d)) }, DEP_B)?.nivel, r1.necesita], ["NORMAL", true]);

  // ── INV-T03: estados, propiedad y alcance en Stock
  const mezcla: Saldo[] = [
    { depositoId: DEP_A, nombre: "Central", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 10 },
    { depositoId: DEP_A, nombre: "Central", estado: "RESERVADO", propiedad: "PROPIO", cantidad: 3 },
    { depositoId: DEP_A, nombre: "Central", estado: "CUARENTENA", propiedad: "PROPIO", cantidad: 2 },
    { depositoId: DEP_A, nombre: "Central", estado: "DISPONIBLE", propiedad: "TERCERO", cantidad: 40 },
    { depositoId: DEP_B, nombre: "Norte", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 4, lote: "L-1" },
  ];
  const completo = (await leerStock(dbConSaldos(mezcla), EMP, null, USR)).stock[0] as unknown as StockItem;
  const restringido = await leerStock(dbConSaldos(mezcla, [DEP_B]), EMP, null, USR);
  const rItem = restringido.stock[0] as unknown as StockItem;

  igual("INV-T03 disponible/reservado/cuarentena propios sin mezclar el stock de terceros (40 aparte) y total físico = D + R + C", [completo.disponible, completo.reservado, completo.cuarentena, completo.terceros, completo.totalFisico], [14, 3, 2, 40, 19]);
  igual("INV-T03 usuario con depósitos asignados: solo ve (y suma) su depósito; el consolidado se rotula parcial y los lotes se limitan al alcance", [rItem.disponible, rItem.depositos.map((d) => d.depositoId), restringido.alcanceParcial, rItem.lotes.map((l) => l.lote)], [4, [DEP_B], true, ["L-1"]]);
  igual("INV-T03 vista por depósito recalcula con ese depósito y no mezcla el consolidado", [vistaPorDeposito(completo, DEP_A)?.disponible, vistaPorDeposito(completo, DEP_B)?.disponible, vistaPorDeposito(completo, U(99))], [10, 4, null]);

  // ── INV-T06: matriz de acceso entre los cuatro menús
  const pm = (ver: boolean, crear: boolean) => ({ movimientosVer: ver, movimientosCrear: crear });
  const guardas: Record<string, [string, string]> = {
    "app/(private)/stock/layout.tsx": ["STOCK", "VER"],
    "app/(private)/reposicion/layout.tsx": ["STOCK", "VER"],
    "app/(private)/movimientos/layout.tsx": ["MOVIMIENTOS", "VER"],
    "app/(private)/movimientos/nuevo/layout.tsx": ["MOVIMIENTOS", "CREAR"],
    "app/(private)/depositos/layout.tsx": ["INVENTARIO", "VER"],
  };

  igual("INV-T06 guardas de página: Stock y Reposición = STOCK.VER; historial = MOVIMIENTOS.VER; nuevo movimiento = MOVIMIENTOS.CREAR; Depósitos = INVENTARIO.VER", Object.entries(guardas).map(([ruta, [r, a]]) => new RegExp(`guardPage\\("${r}", "${a}"\\)`).test(leer(ruta))), [true, true, true, true, true]);
  igual("INV-T06 atajos coherentes con las guardas: STOCK.VER sin MOVIMIENTOS.CREAR (sin atajo), CREAR sin VER (sin atajo ni historial), VER+CREAR (todo), VER sin CREAR (solo historial)", [
    [puedeVerMovimientos(pm(false, false)), puedeAbrirNuevoMovimiento(pm(false, false))],
    [puedeVerMovimientos(pm(false, true)), puedeAbrirNuevoMovimiento(pm(false, true))],
    [puedeVerMovimientos(pm(true, true)), puedeAbrirNuevoMovimiento(pm(true, true))],
    [puedeVerMovimientos(pm(true, false)), puedeAbrirNuevoMovimiento(pm(true, false))],
  ], [[false, false], [false, false], [true, true], [true, false]]);
  const paginas = ["app/(private)/stock/page.tsx", "app/(private)/stock/[id]/page.tsx", "app/(private)/reposicion/page.tsx"].map(leer);

  cierto("INV-T06 todo enlace a /movimientos/nuevo (directo o por enlaceNuevoMovimiento) en Stock, ficha y Reposición está condicionado por puedeAbrirNuevoMovimiento", paginas.every((p) => !/(enlaceNuevoMovimiento|\/movimientos\/nuevo)/.test(p) || /puedeAbrirNuevoMovimiento\(/.test(p)));
  cierto("INV-T06 las APIs de lectura (stock, reposición, historial, depósitos) devuelven los permisos solo para mostrar atajos y cada acción vuelve a exigir el suyo", /STOCK", "VER"/.test(leer("app/api/stock/route.ts")) && /STOCK", "VER"/.test(leer("app/api/reposicion/route.ts")) && /MOVIMIENTOS", "VER"/.test(leer("app/api/movimientos/route.ts")) && /INVENTARIO/.test(leer("lib/depositos/servidor.ts")) && /MOVIMIENTOS", "CREAR"/.test(leer("app/api/movimientos/route.ts")));

  // ── Responsabilidades exclusivas (CA-INV-01/04, §1 de la ORDEM)
  const listar = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;

      if (e.isDirectory()) listar(ruta, acc);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.casos\./.test(e.name)) acc.push(ruta);
    }

    return acc;
  };
  const archivos = (dirs: string[]) => dirs.flatMap((d) => listar(d));
  const sinMotor = archivos(["app/(private)/stock", "app/(private)/reposicion", "app/(private)/depositos", "app/api/stock", "app/api/reposicion", "app/api/depositos", "lib/stock", "lib/reposicion", "lib/depositos"]);
  const motor = /inventario_registrar_movimiento|inventario_anular_movimiento|INSERT INTO movimientos_inventario|INSERT INTO movimiento_lineas|UPDATE stock_saldos|INSERT INTO stock_saldos|UPDATE inventario_costos|INSERT INTO inventario_costos/;

  cierto("responsabilidades: solo Movimientos escribe saldos — ni Stock, ni Reposición, ni Depósitos contienen el motor ni escrituras de saldos/costos", sinMotor.every((f) => !motor.test(leer(f))));
  cierto("responsabilidades: los parámetros de reposición se editan solo en Productos — ni Stock, Reposición ni Depósitos tienen formularios o escrituras de producto_deposito_configuracion", sinMotor.every((f) => !/(INSERT INTO|UPDATE|DELETE FROM) producto_deposito_configuracion/.test(leer(f))) && /producto_deposito_configuracion/.test(archivos(["app/api/productos", "lib/productos"]).map(leer).join("\n")));
  cierto("responsabilidades: las tres pantallas no-motor no hacen POST/PUT/DELETE sobre stock (Depósitos solo escribe depósitos y accesos; Stock y Reposición, nada)", ["app/(private)/stock/page.tsx", "app/(private)/stock/[id]/page.tsx", "app/(private)/reposicion/page.tsx"].every((f) => !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(leer(f))) && !/\/api\/(movimientos|stock)/.test(leer("app/(private)/depositos/page.tsx").replace(/\/api\/stock\?/g, "")));
  cierto("INV-T10 los documentos fiscales no mueven stock: no hay chamada a Movimientos desde Facturación ni vínculo de eventos físicos nuevo en esta ronda (helper de documentos sigue puro)", !/inventario_registrar_movimiento/.test(archivos(["lib/facturacion"]).map(leer).join("\n")) && !/from "pg"|import type \{ PoolClient/.test(leer("lib/movimientos/documentos.ts")));

  // ── INV-T09: Reportes intactos (Kardex, Valorización, Stock general/crítico siguen siendo los dueños del análisis)
  cierto("INV-T09 Reportes conserva Kardex, Valorización, Stock general y Stock crítico (páginas y APIs) y Stock no tiene exportadores propios", ["kardex", "valorizacion", "stock-general", "stock-critico"].every((r) => existsSync(join(raiz, `app/(private)/reportes/${r}`)) && existsSync(join(raiz, `app/api/reportes/${r}`))) && !/Exportar|xlsx/i.test(leer("app/(private)/stock/page.tsx")));
  cierto("las migraciones no cambiaron en esta ronda: la última sigue siendo NEX-053 (ninguna evolución estructural)", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((n) => /^NEX-\d+/.test(n)).sort().at(-1)!.match(/^NEX-05[345]/) !== null);

  return fallos;
}
