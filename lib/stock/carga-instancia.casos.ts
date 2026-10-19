/**
 * STK-D02 — moneda base por instancia en la pantalla de Stock: promesas controladas sobre `iniciarCargaStock` (el mismo helper que usa la pantalla), sin navegador ni base.
 * El «estado de pantalla» se simula con el mismo patrón: cada instancia escribe solo en lo suyo y únicamente mientras sigue vigente.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { formatearCostoUnitarioTexto, formatearMontoTexto } from "@/lib/inventario/decimal";
import { iniciarCargaStock, monedaDeRespuesta } from "@/lib/stock/carga-instancia";
import type { StockRespuesta } from "@/types/stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

type Pantalla = { moneda: string | null; filas: string[]; error: string; cargando: boolean; eventos: number };
const resp = (moneda: string, filas: string[]) => ({ stock: filas, monedaBase: moneda }) as unknown as StockRespuesta;
const diferida = () => {
  let ok: (r: StockRespuesta) => void = () => undefined;
  let ko: (e: Error) => void = () => undefined;
  const p = new Promise<StockRespuesta>((res, rej) => { ok = res; ko = rej; });

  return { p, ok, ko };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Instancia del componente: mismo cableado que `useEffect(() => iniciarCargaStock(...))`. */
const montar = (cargar: () => Promise<StockRespuesta>) => {
  const st: Pantalla = { moneda: null, filas: [], error: "", cargando: true, eventos: 0 };
  const desmontar = iniciarCargaStock(cargar, {
    alCompletar: (r, moneda) => { st.eventos += 1; st.moneda = moneda; st.filas = r.stock as unknown as string[]; },
    alFallar: (m) => { st.eventos += 1; st.error = m; },
    alFinalizar: () => { st.cargando = false; },
  });

  return { st, desmontar };
};

export async function verificarCasosStockCargaInstancia(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // 1) A pendiente, A desmontada, B válida y la respuesta tardía de A se ignora por completo.
  const dA = diferida();
  const dB = diferida();
  const A = montar(() => dA.p);

  A.desmontar();

  const B = montar(() => dB.p);

  dB.ok(resp("PYG", ["empresa-B"]));
  await tick();
  dA.ok(resp("USD", ["empresa-A"]));
  await tick();

  igual("D02: la respuesta tardía de A (desmontada) no cambia la moneda ni las filas de B ni genera eventos en A", [B.st.moneda, B.st.filas, B.st.cargando, A.st.moneda, A.st.filas, A.st.eventos, A.st.cargando], ["PYG", ["empresa-B"], false, null, [], 0, true]);

  // 2) Monedas distintas, instancias simultáneas, sin contaminación en ningún orden de llegada.
  const dC = diferida();
  const dD = diferida();
  const C = montar(() => dC.p);
  const D = montar(() => dD.p);

  dD.ok(resp("USD", ["D"]));
  await tick();
  dC.ok(resp("PYG", ["C"]));
  await tick();

  igual("D02: dos instancias con monedas distintas conservan cada una la suya (respuesta de la otra llegando antes o después)", [[C.st.moneda, C.st.filas], [D.st.moneda, D.st.filas]], [["PYG", ["C"]], ["USD", ["D"]]]);

  // 3) Error / moneda ausente o inválida: nada de PYG ficticio.
  const dE = diferida();
  const E = montar(() => dE.p);

  dE.ko(new Error("No fue posible cargar el stock."));
  await tick();

  const sinMoneda = montar(async () => ({ stock: ["x"] }) as unknown as StockRespuesta);
  const vacia = montar(async () => resp("  ", ["x"]));

  await tick();
  igual("D02: error de carga o respuesta sin moneda base válida → moneda null (la pantalla muestra «—», nunca PYG) y el error se informa solo en la instancia vigente", [E.st.moneda, E.st.error, E.st.cargando, sinMoneda.st.moneda, vacia.st.moneda, monedaDeRespuesta({ monedaBase: undefined as unknown as string }), monedaDeRespuesta({ monedaBase: 5 as unknown as string })], [null, "No fue posible cargar el stock.", false, null, null, null, null]);

  // Un error tardío de una instancia desmontada tampoco se muestra.
  const dF = diferida();
  const F = montar(() => dF.p);

  F.desmontar();
  dF.ko(new Error("tarde"));
  await tick();

  igual("D02: el error tardío de una instancia desmontada no se publica", [F.st.error, F.st.eventos, F.st.cargando], ["", 0, true]);

  // 4) Actualización legítima: costo y valor con la moneda de la respuesta; 5) la referencia de venta conserva su moneda propia.
  const G = montar(async () => resp("USD", ["g"]));

  await tick();

  const fmtCosto = (m: string | null) => (m ? formatearCostoUnitarioTexto("12.3400", m) : "—");
  const fmtValor = (m: string | null) => (m ? formatearMontoTexto("1234.50", m) : "—");
  const fmtRef = (texto: string, monedaPrecio: string, base: string | null) => (!(monedaPrecio || base) ? "—" : formatearMontoTexto(texto, monedaPrecio || base));

  igual("D02: una carga legítima muestra costo y valor con la moneda base recibida (USD, no PYG) y «—» mientras no se conoce", [G.st.moneda, fmtCosto(G.st.moneda) === formatearCostoUnitarioTexto("12.3400", "USD"), fmtValor(G.st.moneda) === formatearMontoTexto("1234.50", "USD"), fmtCosto(G.st.moneda) !== formatearCostoUnitarioTexto("12.3400", "PYG"), fmtCosto(null), fmtValor(null)], ["USD", true, true, true, "—", "—"]);
  igual("D02: la venta referencial usa SU moneda (aunque la base sea otra), cae a la base solo si no trae moneda y es «—» si no hay ninguna", [fmtRef("10000", "PYG", "USD") === formatearMontoTexto("10000", "PYG"), fmtRef("10000", "", "USD") === formatearMontoTexto("10000", "USD"), fmtRef("10000", "", null), fmtRef("10000", "PYG", "USD") !== fmtRef("10000", "", "USD")], [true, true, "—", true]);

  const pagina = leer("app/(private)/stock/page.tsx");

  cierto("D02 pantalla: sin variable de módulo mutable (`MONEDA_BASE`); la moneda es estado de la instancia que sale de su propia respuesta vía iniciarCargaStock; costo, valor y referencia usan monedaBase/monedaPrecio sin fallback a PYG", !/MONEDA_BASE/.test(pagina) && !/\blet [A-Z_]+ = "PYG"/.test(pagina) && /const \[monedaBase, setMonedaBase\] = useState<string \| null>\(null\)/.test(pagina) && /return iniciarCargaStock\(cargarStock, \{/.test(pagina) && /monedaBase \? formatearCostoUnitarioTexto\(item\.costoPromedioTexto, monedaBase\) : "—"/.test(pagina) && /item\.monedaPrecio \|\| monedaBase/.test(pagina) && !/"PYG"/.test(pagina));

  return fallos;
}
