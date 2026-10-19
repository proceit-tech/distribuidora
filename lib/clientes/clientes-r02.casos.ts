/**
 * Clientes (AUD-NEXIT-CLIENTES-DESKTOP-R02) — CLI-D01 (alta con solo CLIENTES.CREAR), CLI-D02 (interfaz según permisos), CLI-D03 (carreras geográficas), CLI-D06 (domicilio fiscal) y CLI-D07
 * (precisión de los límites de crédito). Sin PostgreSQL ni navegador: funciones puras, controladores con promesas controladas y verificación estructural de rutas, layouts y pantallas.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cambiarTipoDireccion, contarFiscales, marcarDireccionFiscal } from "@/lib/clientes/direccion-fiscal";
import { crearCargasGeograficas, type OpcionGeografica } from "@/lib/clientes/geografia-cargas";
import { compararLimites, formatearLimite, limiteTexto, sumarLimitesPorMoneda } from "@/lib/clientes/limite-credito";
import { finalidadGet, puedeLeer } from "@/lib/clientes/permisos-acceso";
import { resolveNavigation, resolverInicio, RUTA_SIN_ACCESO } from "@/lib/navigation/menu";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function diferida<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: Error) => void;
  const p = new Promise<T>((a, b) => { ok = a; ko = b; });

  return { p, ok, ko };
}

type Dir = { k: string; tipo: string; esFiscal: boolean; etiqueta: string; direccion: string; esEntregaDefault: boolean };
const dir = (k: string, tipo: string, esFiscal: boolean, extra: Partial<Dir> = {}): Dir => ({ k, tipo, esFiscal, etiqueta: `et-${k}`, direccion: `calle ${k}`, esEntregaDefault: false, ...extra });
const op = (nombre: string): OpcionGeografica => ({ codigo: nombre, nombre });

export async function verificarCasosClientesR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── CLI-D01: permisos por finalidad y navegación ──────────────────────────────────────────────────────────────────────────────────────────────
  const url = (q: string) => new URL(`http://x/api/clientes${q}`);

  igual("D01: finalidad de cada GET", [finalidadGet(url("?catalogo=distritos&departamento=1")), finalidadGet(url("?modo=catalogos")), finalidadGet(url("?modo=lista")), finalidadGet(url(""))], ["GEOGRAFIA", "CATALOGOS", "LISTA", "OTRO"]);

  const soloCrear = { ver: false, crear: true };
  const soloVer = { ver: true, crear: false };
  const nada = { ver: false, crear: false };

  igual("D01: CREAR-only lee geografía y catálogos mínimos de la alta", [puedeLeer("GEOGRAFIA", soloCrear), puedeLeer("CATALOGOS", soloCrear)], [true, true]);
  igual("D01: CREAR-only NO lee la lista ni ningún otro dato de clientes", [puedeLeer("LISTA", soloCrear), puedeLeer("OTRO", soloCrear)], [false, false]);
  igual("D01: VER-only conserva lista, catálogos y geografía", [puedeLeer("LISTA", soloVer), puedeLeer("CATALOGOS", soloVer), puedeLeer("GEOGRAFIA", soloVer), puedeLeer("OTRO", soloVer)], [true, true, true, true]);
  igual("D01: sin permiso de clientes no hay lectura de ninguna finalidad (EDITAR sin VER ni CREAR tampoco: no es una entrada de lectura)", (["GEOGRAFIA", "CATALOGOS", "LISTA", "OTRO"] as const).map((f) => puedeLeer(f, nada)), [false, false, false, false]);

  const ruta = leer("app/api/clientes/route.ts");

  cierto("D01: GET /api/clientes decide por finalidad (finalidadGet/puedeLeer) y responde 403 sin cambiar la empresa de la sesión; POST sigue exigiendo CREAR", /puedeLeer\(finalidadGet\(url\), \{ ver: tieneVer, crear: tieneCrear \}\)/.test(ruta) && /denyIfNoPermission\(session, "CLIENTES", "CREAR"\)/.test(ruta) && /WHERE c\.empresa_id = \$1/.test(ruta) && /const empresaId = session\.user\.empresaId/.test(ruta));
  cierto("D01: la ficha (GET) sigue exigiendo VER y el PUT EDITAR", /denyIfNoPermission\(session, "CLIENTES", "VER"\)/.test(leer("app/api/clientes/[id]/route.ts")) && /denyIfNoPermission\(session, "CLIENTES", "EDITAR"\)/.test(leer("app/api/clientes/[id]/route.ts")));
  cierto("D01: layouts — módulo VER o CREAR; /clientes/nuevo solo CREAR (sin exigir VER); /clientes/[id] VER; /clientes (página) VER", /hasPermission\(access, "CLIENTES", "VER"\) && !hasPermission\(access, "CLIENTES", "CREAR"\)\) notFound\(\)/.test(leer("app/(private)/clientes/layout.tsx")) && /guardPage\("CLIENTES", "CREAR"\)/.test(leer("app/(private)/clientes/nuevo/layout.tsx")) && !/"VER"/.test(leer("app/(private)/clientes/nuevo/layout.tsx").replace(/\/\/.*/g, "")) && /guardPage\("CLIENTES", "VER"\)/.test(leer("app/(private)/clientes/[id]/layout.tsx")) && /guardPage\("CLIENTES", "VER"\)/.test(leer("app/(private)/clientes/page.tsx")));

  const acc = (permissions: string[], extra: Partial<{ isCompanyAdmin: boolean; isPlatformAdmin: boolean }> = {}) => ({ permissions, isCompanyAdmin: false, isPlatformAdmin: false, ...extra });
  const etiquetas = (a: ReturnType<typeof acc>) => resolveNavigation(a).flatMap((g) => g.items.map((i) => i.label));

  igual("D01: CREAR-only recibe «Nuevo cliente» como destino real (no «Clientes») y su inicio es /clientes/nuevo, no /sin-acceso", [etiquetas(acc(["CLIENTES.CREAR"])), resolverInicio(acc(["CLIENTES.CREAR"]))], [["Nuevo cliente"], "/clientes/nuevo"]);
  igual("D01: VER-only ve «Clientes» (no «Nuevo cliente») y entra a /clientes; VER+CREAR ve solo «Clientes»", [etiquetas(acc(["CLIENTES.VER"])), resolverInicio(acc(["CLIENTES.VER"])), etiquetas(acc(["CLIENTES.VER", "CLIENTES.CREAR"]))], [["Clientes"], "/clientes", ["Clientes"]]);
  igual("D01: EDITAR sin VER ni CREAR no gana acceso (sin menú de Clientes, inicio explícito «sin acceso»)", [etiquetas(acc(["CLIENTES.EDITAR"])), resolverInicio(acc(["CLIENTES.EDITAR"]))], [[], RUTA_SIN_ACCESO]);
  igual("D01: administrador de empresa conserva «Clientes» y panel; administrador global solo Empresas; sin permisos → sin acceso", [etiquetas(acc([], { isCompanyAdmin: true })).includes("Clientes"), etiquetas(acc([], { isCompanyAdmin: true })).includes("Nuevo cliente"), resolverInicio(acc([], { isCompanyAdmin: true })), resolverInicio(acc([], { isPlatformAdmin: true })), resolverInicio(acc([]))], [true, false, "/dashboard", "/administracion/empresas", RUTA_SIN_ACCESO]);

  const nuevo = leer("app/(private)/clientes/nuevo/page.tsx");

  cierto("D01: tras el alta, quien no puede VER no va a /clientes ni a la ficha: pantalla de conclusión con «Registrar otro cliente»; con VER se conserva la redirección; carga inicial de documentos por el creador intacta", /if \(!puedeVer\) \{\s+setAltaFinalizada\(true\);\s+return;\s+\}\s+router\.push\("\/clientes\?ok=creado"\)/.test(nuevo) && /Registrar otro cliente/.test(nuevo) && /\/documentos\/finalizar/.test(nuevo) && /\/documentos`, \{ method: "POST"/.test(nuevo) && /\{puedeVer \? <Link href="\/clientes">Clientes<\/Link>/.test(nuevo));
  cierto("D01: la alta consulta el permiso VER a la API (sesión del servidor), no a parámetros del navegador", /permisos\?: \{ ver\?: boolean \}/.test(nuevo) && /setPuedeVer\(datos\.permisos\?\.ver === true\)/.test(nuevo) && /permisos: \{ ver: tieneVer \}/.test(ruta));
  cierto("D01: la política de documentos del creador (CREAR solo en su alta abierta) no se tocó", existsSync(join(raiz, "lib/clientes/permisos-documentos.ts")) && /esCreador && contexto\.cargaInicialAbierta/.test(leer("lib/clientes/permisos-documentos.ts")));

  // ── CLI-D02: interfaz según permisos ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const lista = leer("app/(private)/clientes/_components/listado-clientes.tsx");
  const ficha = leer("app/(private)/clientes/[id]/page.tsx");

  cierto("D02: «Nuevo cliente» (cabecera y estado vacío) solo con CLIENTES.CREAR, permiso leído del servidor; búsqueda, filtros, orden y paginación intactos", /puedeCrear \? \(\s+<Link href="\/clientes\/nuevo"/.test(lista) && /clientes\.length === 0 && puedeCrear \? \(/.test(lista) && /hasPermission\(access, "CLIENTES", "CREAR"\)/.test(leer("app/(private)/clientes/page.tsx")) && /filtrarClientes/.test(lista) && /PAGE_SIZE/.test(lista));
  cierto("D02: la ficha es de solo lectura sin EDITAR: campos deshabilitados (fieldset), sin «Actualizar cliente», guardar inerte y permiso tomado de la respuesta del servidor", /<fieldset\s+disabled=\{!puedeEditar\}/.test(ficha) && /\{puedeEditar \? \(\s+<button\s+type="submit"/.test(ficha) && /!cliente \|\| !form \|\| !puedeEditar/.test(ficha) && /setPuedeEditar\(datos\.permisos\?\.editar === true\)/.test(ficha) && /permisos: \{ editar: puedeEditar \}/.test(leer("app/api/clientes/[id]/route.ts")));
  cierto("D02: con EDITAR la ficha conserva su formulario y las descargas de documentos siguen siendo enlaces (no se deshabilitan)", /onSubmit=\{guardar\}/.test(ficha) && /<a download href=/.test(leer("app/(private)/clientes/[id]/_components/documentos.tsx")));

  // ── CLI-D03: carreras geográficas con identidad estable ─────────────────────────────────────────────────────────────────────────────────────────
  function geo() {
    const dist = new Map<string, ReturnType<typeof diferida<OpcionGeografica[]>>[]>();
    const ciud = new Map<string, ReturnType<typeof diferida<OpcionGeografica[]>>[]>();
    const e = { distritos: {} as Record<string, string[]>, ciudades: {} as Record<string, string[]>, errores: [] as string[], escrituras: [] as string[] };
    const nombres = (o: OpcionGeografica[]) => o.map((x) => x.nombre);
    const c = crearCargasGeograficas({
      pedirDistritos: (dep) => { const d = diferida<OpcionGeografica[]>(); dist.set(dep, [...(dist.get(dep) ?? []), d]); return d.p; },
      pedirCiudades: (dep, dis) => { const d = diferida<OpcionGeografica[]>(); const k = `${dep}/${dis}`; ciud.set(k, [...(ciud.get(k) ?? []), d]); return d.p; },
      alDistritos: (k, o) => { e.distritos[k] = nombres(o); e.escrituras.push(`D:${k}:${nombres(o).join(",")}`); },
      alCiudades: (k, o) => { e.ciudades[k] = nombres(o); e.escrituras.push(`C:${k}:${nombres(o).join(",")}`); },
      alError: (m) => e.errores.push(m),
    });

    return { c, e, dist: (dep: string, i = 0) => dist.get(dep)![i], ciud: (dep: string, dis: string, i = 0) => ciud.get(`${dep}/${dis}`)![i] };
  }

  {
    // departamento A → B con la respuesta de A tardía
    const g = geo();
    const p1 = g.c.elegirDepartamento("d1", "A");
    const p2 = g.c.elegirDepartamento("d1", "B");

    g.dist("B").ok([op("distB1")]); await p2;
    g.dist("A").ok([op("distA1")]); await p1;
    igual("D03: departamento A→B: la respuesta tardía de A NO pisa los distritos de B", g.e.distritos.d1, ["distB1"]);
    igual("D03: al cambiar el departamento se limpian los catálogos de ciudad", g.e.ciudades.d1, []);
  }
  {
    // distrito A → B con la respuesta de A atrasada
    const g = geo();
    const p1 = g.c.elegirDistrito("d1", "DEP", "A");
    const p2 = g.c.elegirDistrito("d1", "DEP", "B");

    g.ciud("DEP", "B").ok([op("ciuB")]); await p2;
    g.ciud("DEP", "A").ok([op("ciuA")]); await p1;
    igual("D03: distrito A→B: la respuesta atrasada de A no reemplaza las ciudades de B", g.e.ciudades.d1, ["ciuB"]);
    const p3 = g.c.elegirDepartamento("d1", "OTRO");

    igual("D03: cambiar el departamento vacía distrito y ciudad y cancela la ciudad pendiente", [g.e.ciudades.d1, g.e.distritos.d1], [[], []]);
    g.dist("OTRO").ok([op("x")]); await p3;
  }
  {
    // quitar la dirección con consulta pendiente
    const g = geo();
    const p = g.c.elegirDepartamento("d1", "A");

    g.c.quitar("d1");
    const antes = g.e.escrituras.length;

    g.dist("A").ok([op("distA")]); await p;
    igual("D03: quitar una dirección con consulta pendiente: la respuesta tardía no escribe nada", g.e.escrituras.length, antes);
    const q = g.c.elegirDepartamento("d2", "A");

    g.dist("A", 1).ok([op("distA-d2")]); await q;
    igual("D03: la dirección siguiente conserva sus propios catálogos (nada se transfiere por posición)", [g.e.distritos.d1, g.e.distritos.d2], [[], ["distA-d2"]]);
  }
  {
    // dos direcciones simultáneas
    const g = geo();
    const p1 = g.c.elegirDepartamento("d1", "A");
    const p2 = g.c.elegirDepartamento("d2", "B");

    g.dist("B").ok([op("de-B")]); g.dist("A").ok([op("de-A")]); await Promise.all([p1, p2]);
    igual("D03: dos direcciones a la vez tienen resultados independientes", [g.e.distritos.d1, g.e.distritos.d2], [["de-A"], ["de-B"]]);
  }
  {
    // precarga de edición contra una elección manual
    const g = geo();
    const pre = g.c.precargar("k1", "VIEJO", "disV");
    const manual = g.c.elegirDepartamento("k1", "NUEVO");

    g.dist("NUEVO").ok([op("distNuevo")]); await manual;
    g.dist("VIEJO").ok([op("distViejo")]); await pre;
    igual("D03: la precarga antigua no reemplaza la selección posterior del operador y no pide ciudades del distrito viejo", [g.e.distritos.k1, g.e.ciudades.k1, (() => { try { g.ciud("VIEJO", "disV"); return "pidió"; } catch { return "no pidió"; } })()], [["distNuevo"], [], "no pidió"]);

    const h = geo();
    const pre2 = h.c.precargar("k1", "DEP", "DIS");

    h.dist("DEP").ok([op("d1"), op("d2")]); await tick();
    h.ciud("DEP", "DIS").ok([op("c1")]); await pre2;
    igual("D03: la precarga vigente carga distritos y ciudades de la dirección guardada", [h.e.distritos.k1, h.e.ciudades.k1], [["d1", "d2"], ["c1"]]);
  }
  {
    // errores: el vigente se informa, el tardío no; cambiar de país descarta lo pendiente
    const g = geo();
    const p1 = g.c.elegirDepartamento("d1", "A");
    const p2 = g.c.elegirDepartamento("d1", "B");

    g.dist("A").ko(new Error("error tardío de A")); await p1;
    igual("D03: el error tardío de A (ya reemplazado) no se informa", g.e.errores, []);
    g.dist("B").ko(new Error("falla vigente")); await p2;
    igual("D03: el error de la consulta vigente sí se informa", g.e.errores, ["falla vigente"]);

    const h = geo();
    const p = h.c.elegirDepartamento("d1", "A");

    h.c.cambiarPais("d1"); h.dist("A").ok([op("x")]); await p;
    igual("D03: cambiar de país descarta la carga pendiente y deja los catálogos vacíos", [h.e.distritos.d1, h.e.ciudades.d1], [[], []]);
  }

  const hijos = leer("app/(private)/clientes/[id]/_components/hijos.tsx");

  cierto("D03: alta — direcciones con uid estable (no se usa el índice como clave ni para asociar catálogos) y el payload no envía uid", /uid: `d\$\{\+\+secuenciaDireccion\}`/.test(nuevo) && /key=\{direccion\.uid\}/.test(nuevo) && !/PorDireccion\[indice\]/.test(nuevo) && /\{ uid, \.\.\.resto \}/.test(nuevo) && /geo\.quitar\(direccion\.uid\)/.test(nuevo) && /geo\.cambiarPais\(direccion\.uid\)/.test(nuevo));
  cierto("D03: edición — claves estables `k` y controlador de cargas (elegirDepartamento, elegirDistrito, precarga, quitar y país) sin respuestas sin token", /geo\.elegirDepartamento\(d\.k, codigo\)/.test(hijos) && /geo\.elegirDistrito\(d\.k, d\.departamentoCodigo, codigo\)/.test(hijos) && /geo\.precargar\(d\.k, d\.departamentoCodigo, d\.distritoCodigo\)/.test(hijos) && /geo\.quitar\(d\.k\)/.test(hijos) && /geo\.cambiarPais\(d\.k\)/.test(hijos));

  // ── CLI-D06: un solo domicilio fiscal ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const coherente = (l: Dir[]) => contarFiscales(l) <= 1 && l.every((d) => d.tipo !== "FISCAL" || d.esFiscal);
  const base = [dir("A", "FISCAL", true), dir("B", "COMERCIAL", false), dir("C", "ENTREGA", false, { esEntregaDefault: true })];

  {
    const r = cambiarTipoDireccion(base, (d) => d.k === "B", "FISCAL");

    igual("D06: A fiscal → elegir tipo Fiscal en B: A pierde la marca y pasa a COMERCIAL; B es la única fiscal", [r.map((d) => [d.k, d.tipo, d.esFiscal]), coherente(r)], [[["A", "COMERCIAL", false], ["B", "FISCAL", true], ["C", "ENTREGA", false]], true]);
    igual("D06: las demás direcciones y campos no relacionados se conservan (ENTREGA, predeterminada, etiquetas, direcciones)", r.map((d) => [d.etiqueta, d.direccion, d.esEntregaDefault]), base.map((d) => [d.etiqueta, d.direccion, d.esEntregaDefault]));

    const m = marcarDireccionFiscal(base, (d) => d.k === "B", true);

    igual("D06: marcar el checkbox fiscal en B: A pierde marca y tipo FISCAL; B queda fiscal (tipo conservado)", [m.map((d) => [d.k, d.tipo, d.esFiscal]), coherente(m)], [[["A", "COMERCIAL", false], ["B", "COMERCIAL", true], ["C", "ENTREGA", false]], true]);

    const u = marcarDireccionFiscal(base, (d) => d.k === "A", false);

    igual("D06: desmarcar la fiscal de tipo FISCAL ajusta también el tipo (COMERCIAL): sin combinación inválida", [u.map((d) => [d.k, d.tipo, d.esFiscal]), coherente(u), contarFiscales(u)], [[["A", "COMERCIAL", false], ["B", "COMERCIAL", false], ["C", "ENTREGA", false]], true, 0]);

    const t = cambiarTipoDireccion(base, (d) => d.k === "A", "ENTREGA");

    igual("D06: cambiar el tipo de la fiscal a ENTREGA le quita la condición fiscal y no toca las otras", [t.map((d) => [d.k, d.tipo, d.esFiscal]), coherente(t)], [[["A", "ENTREGA", false], ["B", "COMERCIAL", false], ["C", "ENTREGA", false]], true]);

    const legado = [dir("A", "FISCAL", true), dir("B", "SUCURSAL", true)]; // dos marcadas (dato legado)
    const l = marcarDireccionFiscal(legado, (d) => d.k === "B", true);

    igual("D06: dato legado con dos marcas: al marcar B queda una sola fiscal y la salida es coherente", [contarFiscales(l), coherente(l)], [1, true]);

    // secuencia de operaciones: siempre ≤ 1 fiscal
    let estado = base;
    const pasos: Array<(x: Dir[]) => Dir[]> = [
      (x) => cambiarTipoDireccion(x, (d) => d.k === "C", "FISCAL"), (x) => marcarDireccionFiscal(x, (d) => d.k === "B", true), (x) => cambiarTipoDireccion(x, (d) => d.k === "A", "FISCAL"),
      (x) => marcarDireccionFiscal(x, (d) => d.k === "A", false), (x) => cambiarTipoDireccion(x, (d) => d.k === "B", "FISCAL"), (x) => marcarDireccionFiscal(x, (d) => d.k === "C", true),
    ];
    const resultados: boolean[] = [];

    for (const p of pasos) { estado = p(estado); resultados.push(coherente(estado) && estado.length === 3); }
    igual("D06: tras cada operación (tipo y checkbox) hay a lo sumo una fiscal coherente y no se pierde ninguna dirección", resultados, [true, true, true, true, true, true]);
  }

  cierto("D06: la edición usa la regla compartida y NO se modificaron migraciones ni la validación del servicio", /cambiarTipoDireccion\(valor\.direcciones, \(x\) => x\.k === d\.k, v\)/.test(hijos) && /marcarDireccionFiscal\(valor\.direcciones, \(x\) => x\.k === d\.k, m\)/.test(hijos) && /Solo puede haber una dirección fiscal/.test(leer("lib/clientes/relacionados.ts")));

  // ── CLI-D07: límites de crédito exactos ─────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("D07: límite mayor que la precisión segura de Number se conserva exacto", [limiteTexto("99999999999999.9999"), formatearLimite(limiteTexto("99999999999999.9999")), Number("99999999999999.9999") === 100000000000000], ["99999999999999.9999", "99.999.999.999.999,9999", true]);
  igual("D07: cuatro decimales y ceros finales (formato es-PY sin perder centavos)", [formatearLimite(limiteTexto("1234.5000")), formatearLimite(limiteTexto("0.0001")), formatearLimite(limiteTexto("1500000.2500"))], ["1.234,5", "0,0001", "1.500.000,25"]);
  igual("D07: cero, nulo, indefinido o no numérico = 0 (sin inventar valores)", [limiteTexto("0.0000"), limiteTexto(null), limiteTexto(undefined), limiteTexto(""), limiteTexto("abc")], ["0", "0", "0", "0", "0"]);
  {
    const filas = [
      { moneda: "PYG", limiteCredito: limiteTexto("99999999999999.9999") }, { moneda: "PYG", limiteCredito: limiteTexto("0.0001") }, { moneda: "USD", limiteCredito: limiteTexto("1000.5000") },
      { moneda: "USD", limiteCredito: limiteTexto("2000.2500") }, { moneda: "", limiteCredito: limiteTexto("5") }, { moneda: "PYG", limiteCredito: limiteTexto(null) },
    ];
    const suma = sumarLimitesPorMoneda(filas);

    igual("D07: suma exacta de varios clientes, separada por moneda (PYG, USD y «sin moneda»), sin mezclar", suma, { PYG: "100000000000000", USD: "3000.75", "sin moneda": "5" });
    igual("D07: el total se formatea sin perder dígitos", formatearLimite(suma.PYG), "100.000.000.000.000");

    const orden = ["10", "9", "9.0001", "99999999999999.9999", "99999999999999.9998", "0", "0.5"];
    const asc = [...orden].sort(compararLimites);
    const desc = [...orden].sort((a, b) => -compararLimites(a, b));

    igual("D07: orden ascendente numérico exacto (incluye valores que Number confundiría)", asc, ["0", "0.5", "9", "9.0001", "10", "99999999999999.9998", "99999999999999.9999"]);
    igual("D07: orden descendente exacto", desc, [...asc].reverse());
  }
  cierto("D07: la lista no usa Number para el límite: texto desde la API, suma por moneda, orden decimal y formato exacto; el esquema y los límites gravados no se tocan", /limiteCredito: limiteTexto\(fila\.limite_credito\)/.test(lista) && !/Number\(fila\.limite_credito\)/.test(lista) && /sumarLimitesPorMoneda\(clientes\)/.test(lista) && /compararLimites\(a\.limiteCredito, b\.limiteCredito\)/.test(lista) && /limiteCredito: string/.test(leer("types/clientes.ts")));

  return fallos;
}
