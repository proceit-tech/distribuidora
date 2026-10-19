/**
 * Dashboard (AUD-NEXIT-DASHBOARD-DESKTOP-R02) — verificaciones dirigidas, sin PostgreSQL ni navegador: base simulada que captura SQL y parámetros, controlador de carga con promesas controladas,
 * formato decimal exacto, navegación por permisos y estructura de la pantalla. NO prueba la semántica SQL contra PostgreSQL (el predicado de alcance es el mismo del historial de Movimientos).
 * F-DASH-01 (Sin stock / universo de productos) queda PENDIENTE de decisión funcional y no se modifica.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { claveContexto, crearCargaDashboard } from "@/lib/dashboard/carga";
import { montoTexto, redondearDecimalTexto } from "@/lib/dashboard/formato";
import { alcanceIntegral, esPeriodo, leerDashboard, type PermisosPanel } from "@/lib/dashboard/shared";
import { ALCANCE_MOVIMIENTO } from "@/lib/movimientos/historial";
import { puedeVerDashboard, resolverInicio, RUTA_SIN_ACCESO } from "@/lib/navigation/menu";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

type Llamada = { sql: string; params: unknown[] };

function dbSimulada(opciones: { depositos?: Array<{ id: string; nombre: string }>; ultimos?: Array<Record<string, unknown>>; valor?: string } = {}) {
  const llamadas: Llamada[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      llamadas.push({ sql, params });

      if (sql.includes("GROUP BY m.fecha_movimiento")) return { rows: [] };
      if (sql.includes("LIMIT 6")) return { rows: opciones.ultimos ?? [] };
      if (sql.includes("FROM depositos d")) return { rows: opciones.depositos ?? [{ id: "dA", nombre: "Depósito A" }] };
      if (sql.includes("to_char(current_date")) return { rows: [{ hoy: "2026-10-18" }] };
      if (sql.includes("FROM empresas")) return { rows: [{ nombre: "Empresa", moneda: "PYG" }] };
      if (sql.includes("FROM productos WHERE")) return { rows: [{ activos: 1, controlan: 1 }] };
      if (sql.includes("FROM clientes")) return { rows: [{ activos: 1 }] };
      if (sql.includes("FROM productos p")) return { rows: [] };
      if (sql.includes("inventario_costos")) return { rows: [{ valor: opciones.valor ?? "0", productos: 0 }] };
      if (sql.includes("stock_lotes")) return { rows: [{ vencidos: 0, por_vencer: 0 }] };

      return { rows: [] };
    },
  };

  return { db: db as never, llamadas };
}

const TODOS: PermisosPanel = { productos: true, clientes: true, stock: true, movimientos: true };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function diferida<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: Error) => void;
  const p = new Promise<T>((a, b) => { ok = a; ko = b; });

  return { p, ok, ko };
}

export async function verificarCasosDashboard(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── F-DASH-08: períodos ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("F-DASH-08: solo 7d, 15d, 30d y 90d son períodos", ["7d", "15d", "30d", "90d"].map(esPeriodo), [true, true, true, true]);
  igual("F-DASH-08: constructor, __proto__, toString, hasOwnProperty, vacío, mayúsculas y desconocidos se rechazan", ["constructor", "__proto__", "toString", "hasOwnProperty", "", "7D", "1d", "180d", "prototype"].map(esPeriodo), Array.from({ length: 9 }, () => false));
  {
    const s = dbSimulada();
    const r = await leerDashboard(s.db, "E1", "U1", TODOS, "constructor" as never, "");

    igual("F-DASH-08: el servicio responde 400 (sin error interno ni consultas) ante un período inválido", [r, s.llamadas.length], [{ error: "Período no válido.", status: 400 }, 0]);
    cierto("F-DASH-08: la API valida con esPeriodo (no con «in») y devuelve 400", /esPeriodo\(periodoTexto\)/.test(leer("app/api/dashboard/route.ts")) && !/periodo in PERIODOS/.test(leer("app/api/dashboard/route.ts")) && /Período no válido\." \}, \{ status: 400 \}/.test(leer("app/api/dashboard/route.ts")));
  }

  // ── F-DASH-06: alcance integral de depósitos ─────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = dbSimulada({ depositos: [{ id: "dA", nombre: "A" }] });

    await leerDashboard(s.db, "E1", "UA", TODOS, "7d", "");

    const graf = s.llamadas.find((l) => l.sql.includes("GROUP BY m.fecha_movimiento"))!;
    const ult = s.llamadas.find((l) => l.sql.includes("LIMIT 6"))!;
    const pred = (n: number) => ALCANCE_MOVIMIENTO.split("$2").join(`$${n}`);

    cierto("F-DASH-06: el predicado de alcance integral es EXACTAMENTE el del historial de Movimientos (todos los depósitos del movimiento en el alcance del usuario)", alcanceIntegral(5) === pred(5) && /deposito_origen_id IS NULL OR m\.deposito_origen_id IN/.test(alcanceIntegral(5)) && /deposito_destino_id IS NULL OR m\.deposito_destino_id IN/.test(alcanceIntegral(5)));
    cierto("F-DASH-06: gráfico/indicadores aplican el alcance integral con el usuario de la sesión ($5) además del filtro de depósitos", graf.sql.includes(alcanceIntegral(5)) && graf.params[4] === "UA" && graf.params[0] === "E1" && /deposito_origen_id = ANY\(\$2::uuid\[\]\) OR m\.deposito_destino_id = ANY\(\$2::uuid\[\]\)/.test(graf.sql));
    cierto("F-DASH-06: «Últimos movimientos» aplica el mismo alcance integral con el usuario de la sesión ($3)", ult.sql.includes(alcanceIntegral(3)) && ult.params.length === 3 && ult.params[0] === "E1" && ult.params[2] === "UA" && /deposito_origen_id = ANY\(\$2::uuid\[\]\) OR m\.deposito_destino_id = ANY\(\$2::uuid\[\]\)/.test(ult.sql));
    cierto("F-DASH-06: el filtro de depósito del panel (origen o destino seleccionado) sigue separado de la autorización integral y los nombres de depósito solo salen de movimientos ya autorizados", /AND \$\{alcanceIntegral\(3\)\}|alcanceIntegral\(3\)/.test(leer("lib/dashboard/shared.ts")) && /concat_ws\(' → ', dor\.nombre, dde\.nombre\)/.test(ult.sql));
    cierto("F-DASH-06: el usuario nunca viene del cliente: empresa y usuario son los de la sesión y no hay parámetros externos en el SQL de alcance", /leerDashboard\(\s*db, session\.user\.empresaId, session\.user\.id/.test(leer("app/api/dashboard/route.ts")));
  }
  {
    // aislamiento entre empresas: cada llamada lleva su propia empresa en $1 y en los filtros de movimientos
    const a = dbSimulada();
    const b = dbSimulada();

    await leerDashboard(a.db, "EMPRESA-A", "U1", TODOS, "7d", "");
    await leerDashboard(b.db, "EMPRESA-B", "U2", TODOS, "7d", "");

    const mA = a.llamadas.filter((l) => l.sql.includes("movimientos_inventario"));
    const mB = b.llamadas.filter((l) => l.sql.includes("movimientos_inventario"));

    igual("aislamiento: las consultas de movimientos de cada empresa usan solo su empresa y su usuario", [mA.every((l) => l.params[0] === "EMPRESA-A" && l.sql.includes("m.empresa_id = $1")), mB.every((l) => l.params[0] === "EMPRESA-B" && l.sql.includes("m.empresa_id = $1")), mA.some((l) => l.params.includes("U2")), mB.some((l) => l.params.includes("U1"))], [true, true, false, false]);
  }

  // ── F-DASH-03: movimientos anulados e inversos ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    const fila = (id: string, situacion: string, anula: string | null) => ({ id, numero: `MOV-${id}`, tipo: "ENTRADA", fecha: "2026-10-18", hora: "10:00", producto: "Arroz", lineas: 1, cantidad: 5, depositos: "A", usuario: "u", situacion, anula_numero: anula });
    const s = dbSimulada({ ultimos: [fila("1", "REGISTRADO", null), fila("2", "ANULADO", null), fila("3", "INVERSO", "MOV-2")] });
    const r = await leerDashboard(s.db, "E1", "U1", TODOS, "7d", "");

    cierto("F-DASH-03: respuesta válida", !("error" in r));
    if (!("error" in r)) igual("F-DASH-03: la lista muestra el estado real (registrado, anulado e inverso de anulación con su referencia)", r.ultimos?.map((m) => [m.situacion, m.anulaNumero]), [["REGISTRADO", null], ["ANULADO", null], ["INVERSO", "MOV-2"]]);

    const ult = s.llamadas.find((l) => l.sql.includes("LIMIT 6"))!;

    cierto("F-DASH-03: el SQL clasifica INVERSO (anula_a_id), ANULADO (estado) y REGISTRADO, resuelve el número anulado y NO oculta el histórico; el gráfico conserva solo los registrados vigentes", /WHEN m\.anula_a_id IS NOT NULL THEN 'INVERSO' WHEN m\.estado = 'ANULADO' THEN 'ANULADO' ELSE 'REGISTRADO'/.test(ult.sql) && /LEFT JOIN movimientos_inventario ma/.test(ult.sql) && !/estado = 'REGISTRADO'/.test(ult.sql) && /estado = 'REGISTRADO' AND m\.anula_a_id IS NULL/.test(leer("lib/dashboard/shared.ts")));
    const pag = leer("app/(private)/dashboard/page.tsx");

    cierto("F-DASH-03: la pantalla rotula «anulado» e «inverso de …» y no presenta un anulado con el tono de actividad vigente", /m\.situacion === "ANULADO" \? " · anulado"/.test(pag) && /" · inverso de "/.test(pag) && /m\.situacion === "REGISTRADO" \? tipo\.clase : "statusWarning"/.test(pag));
  }

  // ── Perfiles y permisos (secciones y enlaces) ───────────────────────────────────────────────────────────────────────────────────────────────
  {
    const sin: PermisosPanel = { productos: false, clientes: false, stock: false, movimientos: false };
    const s = dbSimulada();
    const r = await leerDashboard(s.db, "E1", "U1", sin, "7d", "");

    if (!("error" in r)) {
      igual("permisos: solo DASHBOARD.VER → todas las secciones null y acceso sin módulos", [r.kpis.productos, r.kpis.clientes, r.kpis.inventario, r.kpis.movimientos, r.kpis.stockCritico, r.serie, r.stock, r.alertas, r.ultimos, r.acceso], [null, null, null, null, null, null, null, null, null, sin]);
      igual("permisos: sin permisos de módulo no se consultan movimientos, stock ni valor de inventario", s.llamadas.filter((l) => /movimientos_inventario|stock_saldos|inventario_costos/.test(l.sql)).length, 0);
    }

    const m = dbSimulada();
    const rm = await leerDashboard(m.db, "E1", "U1", { ...sin, movimientos: true }, "7d", "");

    if (!("error" in rm)) igual("permisos: + MOVIMIENTOS.VER → serie y últimos con acceso.movimientos y sin datos de stock", [rm.serie !== null, rm.ultimos !== null, rm.stock, rm.alertas, rm.acceso.movimientos, rm.acceso.stock], [true, true, null, null, true, false]);

    const st = dbSimulada({ valor: "1234.5000" });
    const rs = await leerDashboard(st.db, "E1", "U1", { ...sin, stock: true }, "7d", "");

    if (!("error" in rs)) igual("permisos: + STOCK.VER → stock y valor de inventario, sin movimientos", [rs.stock !== null, rs.kpis.inventario?.valor, rs.serie, rs.ultimos, rs.acceso.stock], [true, "1234.5000", null, null, true]);

    const pag = leer("app/(private)/dashboard/page.tsx");

    cierto("F-DASH-05: los tres enlaces secundarios (Ver movimientos, Ver todos, Ver inventario) solo se muestran con el permiso del destino; las tarjetas siguen protegidas", /datos\?\.acceso\.movimientos \? \(\s+<Link href="\/movimientos">\s+Ver movimientos/.test(pag) && /datos\?\.acceso\.movimientos \? \(\s+<Link href="\/movimientos">\s+Ver todos/.test(pag) && /datos\?\.acceso\.stock \? \(\s+<Link href="\/stock">\s+Ver inventario/.test(pag) && /kpi\.habilitada \? \(/.test(pag));
  }

  // ── F-DASH-07: precisión monetaria ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("F-DASH-07: total elevado sin pérdida (más de 2^53) en guaraníes", montoTexto("9007199254740993.4000", "PYG"), "Gs. 9.007.199.254.740.993");
  igual("F-DASH-07: redondeo a la mitad hacia arriba en guaraníes", [montoTexto("0.4999", "PYG"), montoTexto("0.5", "PYG"), montoTexto("1234567.5000", "PYG")], ["Gs. 0", "Gs. 1", "Gs. 1.234.568"]);
  igual("F-DASH-07: otras monedas con 2 decimales exactos", [montoTexto("1234567.8950", "USD"), montoTexto("99999999999999.9949", "USD"), montoTexto("10.0000", "BRL")], ["USD 1.234.567,9", "USD 99.999.999.999.999,99", "BRL 10"]);
  igual("F-DASH-07: negativos y cero", [redondearDecimalTexto("-0.5", 0), redondearDecimalTexto("-0.4", 0), redondearDecimalTexto("0", 2), redondearDecimalTexto("-1234.5678", 2)], ["-1", "0", "0.00", "-1234.57"]);
  igual("F-DASH-07: un texto que no es decimal no se inventa", montoTexto("abc", "PYG"), "Gs. abc");
  {
    const s = dbSimulada({ valor: "123456789012345678.1234" });
    const r = await leerDashboard(s.db, "E1", "U1", TODOS, "7d", "");
    const sqlValor = s.llamadas.find((l) => l.sql.includes("inventario_costos"))!.sql;

    if (!("error" in r)) igual("F-DASH-07: el valor del inventario viaja como texto decimal exacto desde SQL hasta la pantalla", [typeof r.kpis.inventario?.valor, r.kpis.inventario?.valor], ["string", "123456789012345678.1234"]);

    cierto("F-DASH-07: el SQL ya no convierte el valor del inventario a float8 y la pantalla no usa Number para el dinero", /coalesce\(sum\(valor_total\), 0\)::text AS valor/.test(sqlValor) && !/valor_total\), 0\)::float8/.test(sqlValor) && /montoTexto\(k\.inventario\.valor/.test(leer("app/(private)/dashboard/page.tsx")) && !/function money\(/.test(leer("app/(private)/dashboard/page.tsx")));
  }

  // ── F-DASH-02: contexto período/depósito con respuestas y errores tardíos ───────────────────────────────────────────────────────────────────────
  function carga() {
    const pedidos: Array<{ p: string; d: string; x: ReturnType<typeof diferida<string>> }> = [];
    const e = { resultado: null as { clave: string; datos: string } | null, falla: null as { clave: string; mensaje: string } | null, cargando: false };
    const c = crearCargaDashboard<string>({
      cargar: (p, d) => { const x = diferida<string>(); pedidos.push({ p, d, x }); return x.p; },
      alResultado: (clave, datos) => { e.resultado = { clave, datos }; e.falla = null; }, alError: (clave, mensaje) => { e.falla = { clave, mensaje }; }, alCargando: (b) => { e.cargando = b; },
    });
    // misma derivación que la pantalla: solo se muestra lo que coincide con el contexto seleccionado
    const mostrado = (periodo: string, dep: string) => ({ datos: e.resultado?.clave === claveContexto(periodo, dep) ? e.resultado.datos : null, error: e.falla?.clave === claveContexto(periodo, dep) ? e.falla.mensaje : "" });

    return { c, pedidos, e, mostrado };
  }

  {
    const x = carga();

    void x.c.solicitar("7d", "A"); x.pedidos[0].x.ok("datos-7d-A"); await tick();
    igual("F-DASH-02: con 7d/A seleccionado se muestran sus datos", x.mostrado("7d", "A").datos, "datos-7d-A");
    igual("F-DASH-02: al cambiar a 90d/B los datos de 7d/A dejan de mostrarse al instante (antes de que responda)", x.mostrado("90d", "B"), { datos: null, error: "" });
    void x.c.solicitar("90d", "B");
    x.pedidos[1].x.ko(new Error("falla 90d/B")); await tick();
    igual("F-DASH-02: error de A→B: no quedan datos de A bajo el rótulo B y se muestra el error de B", x.mostrado("90d", "B"), { datos: null, error: "falla 90d/B" });
    igual("F-DASH-02: el error de B no aparece en otro contexto", x.mostrado("7d", "A").error, "");
  }
  {
    // respuesta atrasada de A después de pedir B; A→B→A fuera de orden; error atrasado
    const x = carga();

    void x.c.solicitar("7d", "A"); void x.c.solicitar("30d", "B");
    x.pedidos[0].x.ok("tarde-A"); await tick();
    igual("F-DASH-02: la respuesta atrasada de A (ya cambió a B) se descarta y no apaga «Actualizando…»", [x.e.resultado, x.e.cargando], [null, true]);
    x.pedidos[1].x.ok("datos-B"); await tick();
    igual("F-DASH-02: B vigente se aplica", [x.mostrado("30d", "B").datos, x.e.cargando], ["datos-B", false]);

    const y = carga();

    void y.c.solicitar("7d", "A"); void y.c.solicitar("30d", "B"); void y.c.solicitar("7d", "A");
    y.pedidos[2].x.ok("A-nuevo"); y.pedidos[0].x.ok("A-viejo"); y.pedidos[1].x.ok("B"); await tick();
    igual("F-DASH-02: A→B→A fuera de orden: solo la última solicitud (A) queda", [y.e.resultado?.datos, y.mostrado("7d", "A").datos, y.mostrado("30d", "B").datos], ["A-nuevo", "A-nuevo", null]);

    const z = carga();

    void z.c.solicitar("7d", "A"); void z.c.solicitar("30d", "B");
    z.pedidos[0].x.ko(new Error("error atrasado de A")); await tick();
    igual("F-DASH-02: el error atrasado de A no se muestra en B ni apaga la carga de B", [z.e.falla, z.e.cargando], [null, true]);

    const w = carga();

    void w.c.solicitar("7d", "A"); w.pedidos[0].x.ok("v1"); await tick();
    void w.c.solicitar("7d", "A"); w.pedidos[1].x.ko(new Error("fallo al actualizar")); await tick();
    igual("F-DASH-02: «Actualizar» del mismo contexto: se conserva el resultado anterior de ese contexto y se informa el error (recuperación posible)", [w.mostrado("7d", "A").datos, w.mostrado("7d", "A").error], ["v1", "fallo al actualizar"]);
    void w.c.solicitar("7d", "A"); w.pedidos[2].x.ok("v2"); await tick();
    igual("F-DASH-02: la recuperación tras el error limpia el error y muestra los datos nuevos", [w.mostrado("7d", "A").datos, w.mostrado("7d", "A").error], ["v2", ""]);

    const v = carga();

    void v.c.solicitar("7d", "A"); v.c.invalidar(); v.pedidos[0].x.ok("tras-desmontar"); await tick();
    igual("F-DASH-02: al desmontar nada pendiente actualiza la pantalla", v.e.resultado, null);
    const pag = leer("app/(private)/dashboard/page.tsx");

    cierto("F-DASH-02: la pantalla muestra solo datos/errores del contexto seleccionado y las opciones de depósito no dependen de los datos ocultos", /resultado\?\.clave === clave \? resultado\.datos : null/.test(pag) && /falla\?\.clave === clave \? falla\.mensaje : ""/.test(pag) && /opcionesDeposito\.map/.test(pag) && /return \(\) => carga\.invalidar\(\)/.test(pag));
  }

  // ── F-DASH-04: navegación y permisos ────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const admin = { permissions: [], isCompanyAdmin: true, isPlatformAdmin: false };
    const plataforma = { permissions: [], isCompanyAdmin: false, isPlatformAdmin: true };
    const conDash = { permissions: ["DASHBOARD.VER", "CLIENTES.VER"], isCompanyAdmin: false, isPlatformAdmin: false };
    const soloClientes = { permissions: ["CLIENTES.VER"], isCompanyAdmin: false, isPlatformAdmin: false };
    const soloMov = { permissions: ["MOVIMIENTOS.VER"], isCompanyAdmin: false, isPlatformAdmin: false };
    const nada = { permissions: [], isCompanyAdmin: false, isPlatformAdmin: false };

    igual("F-DASH-04: inicio por perfil (admin de empresa, DASHBOARD.VER, plataforma)", [resolverInicio(admin), resolverInicio(conDash), resolverInicio(plataforma)], ["/dashboard", "/dashboard", "/administracion/empresas"]);
    igual("F-DASH-04: sin DASHBOARD.VER va a la primera página operativa realmente autorizada", [resolverInicio(soloClientes), resolverInicio(soloMov)], ["/clientes", "/movimientos"]);
    igual("F-DASH-04: sin ningún destino autorizado → página explícita «sin acceso» (distinta de /dashboard y de /)", [resolverInicio(nada), RUTA_SIN_ACCESO.startsWith("/")], ["/sin-acceso", true]);
    igual("F-DASH-04: puedeVerDashboard (la plataforma nunca opera una empresa; sin VER no hay panel)", [puedeVerDashboard(admin), puedeVerDashboard(conDash), puedeVerDashboard(soloClientes), puedeVerDashboard(plataforma), puedeVerDashboard(nada)], [true, true, false, false, false]);

    const side = leer("components/layout/sidebar/sidebar.tsx");
    const lay = leer("app/(private)/dashboard/layout.tsx");

    cierto("F-DASH-04: la marca y la entrada «Panel general» de la barra lateral dependen del inicio/permiso real (sin enlaces fijos a /dashboard para todos); el ancho y la estructura de la barra no cambian", /href=\{inicioHref\}/.test(side) && /\{puedeDashboard \? \(/.test(side) && (side.match(/href="\/dashboard"/g) ?? []).length === 1 && /dashboardLink/.test(side));
    cierto("F-DASH-04: raíz, login y página de login resuelven el inicio por permisos; el layout del panel redirige sin DASHBOARD.VER sin bucle; /sin-acceso no redirige", /resolverInicio\(access\)/.test(leer("app/page.tsx")) && /router\.replace\("\/"\)/.test(leer("components/auth/login-form.tsx")) && /redirect\("\/"\)/.test(leer("app/(public)/login/page.tsx")) && /!puedeVerDashboard\(access\)\) redirect\(resolverInicio\(access\)\)/.test(lay) && existsSync(join(raiz, "app/(private)/sin-acceso/page.tsx")) && !/redirect|permanentRedirect/.test(leer("app/(private)/sin-acceso/page.tsx")));
    cierto("F-DASH-04: no se concedieron permisos nuevos (la API sigue exigiendo DASHBOARD.VER y los módulos conservan su guardPage)", /hasPermission\(access, "DASHBOARD", "VER"\)/.test(leer("app/api/dashboard/route.ts")) && !/DASHBOARD/.test(leer("lib/navigation/menu.ts").replace(/puedeVerDashboard|DASHBOARD\.VER/g, "")));
  }

  // ── F-DASH-01 permanece pendiente (no se tocó el universo de productos) ─────────────────────────────────────────────────────────────────────────
  {
    const s = dbSimulada();

    await leerDashboard(s.db, "E1", "U1", TODOS, "7d", "");

    const q = s.llamadas.find((l) => l.sql.includes("FROM productos p"))!.sql;

    cierto("F-DASH-01 queda PENDIENTE de decisión funcional: el universo de productos y el LEFT JOIN de saldos no se modificaron (sin INNER JOIN)", /FROM productos p\s+LEFT JOIN stock_saldos s/.test(q) && !/INNER JOIN stock_saldos/.test(q) && /WHERE p\.empresa_id = \$1 AND p\.activo AND p\.controla_stock/.test(q));
  }

  return fallos;
}
