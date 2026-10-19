/**
 * Listas de precios (AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R02) — verificaciones focales de LPR-D01…D04, sin PostgreSQL ni navegador: funciones puras y `fetch` simulados, más verificación estructural de rutas,
 * layouts y pantallas (que complementa, no sustituye, las pruebas de comportamiento de los helpers). NO son pruebas integradas de base de datos ni de React.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { decidirGetListas } from "@/lib/listas-precio/acceso-get";
import { cargarCatalogosVerificados, motivoBloqueoGuardarLista } from "@/lib/listas-precio/carga-catalogos";
import { cargarListaConPermisos, cargarListasConPermisos } from "@/lib/listas-precio/cliente-api";
import { clasificarVigencia, crearVigilanteDia, hoyParaVigencia, msHastaProximoDia, sumarDias } from "@/lib/listas-precio/vigencia";
import { resolveNavigation, resolverInicio } from "@/lib/navigation/menu";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");

type Resp = { status: number; cuerpo?: unknown; textoInvalido?: boolean } | "red";

const fetchDe = (r: Resp) => (async () => {
  if (r === "red") throw new TypeError("fetch failed");

  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.textoInvalido) throw new SyntaxError("json"); return r.cuerpo; } } as unknown as Response;
}) as never;

const CATALOGO = { monedas: [{ codigo: "USD", nombre: "Dólar", simbolo: "$" }], gruposCliente: [], zonas: [], canales: [], clientes: [], productos: [], listasBase: [], monedaBase: "USD" };

export async function verificarCasosListasR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── LPR-D01: acceso por finalidad y alta con solo CREAR ───────────────────────────────────────────────────────────────────────────────────────
  const U = (q: string) => new URL("http://x/api/listas-precio" + q);
  const ver = { ver: true, crear: false };
  const crear = { ver: false, crear: true };
  const ambos = { ver: true, crear: true };
  const ninguno = { ver: false, crear: false };
  const resumen = (q: string, p: { ver: boolean; crear: boolean }) => { const d = decidirGetListas(U(q), p); return d.tipo === "permitida" ? `${d.finalidad}:${d.completo ? "completo" : "minimo"}` : d.tipo; };

  igual("D01: CREAR-only obtiene los catálogos de la alta en forma MÍNIMA (sin clientes/productos con costos/listas); VER y CREAR+VER, completos", [resumen("?modo=catalogos", crear), resumen("?modo=catalogos", ver), resumen("?modo=catalogos", ambos)], ["CATALOGOS:minimo", "CATALOGOS:completo", "CATALOGOS:completo"]);
  igual("D01: CREAR-only NO obtiene la lista (sin modo, modo vacío/desconocido, parámetros ajenos) — nada contornea la exigencia de VER", ["", "?modo=", "?modo=lista", "?modo=otro", "?q=a", "?foo=bar"].map((q) => resumen(q, crear)), Array.from({ length: 6 }, () => "denegada"));
  igual("D01: modo=catalogos combinado con otros parámetros es inconsistente (400) para todos; sin permisos nada se atiende", [resumen("?modo=catalogos&x=1", crear), resumen("?modo=catalogos&modo=lista", ver), resumen("?modo=catalogos", ninguno), resumen("", ninguno), resumen("", ver)], ["invalida", "invalida", "denegada", "denegada", "LISTA:completo"]);

  const rutaLista = leer("app/api/listas-precio/route.ts");

  cierto("D01: la ruta decide por finalidad, consulta clientes/productos/listas solo si la respuesta es completa (VER), toma la empresa de la sesión y mantiene POST con CREAR y PUT con EDITAR", /decidirGetListas\(new URL\(request\.url\), \{ ver: !denegadoVer, crear: tieneCrear \}\)/.test(rutaLista) && (rutaLista.match(/decision\.completo/g) ?? []).length >= 3 && /const empresaId = session\.user\.empresaId/.test(rutaLista) && /denyIfNoPermission\(session, "LISTAS_PRECIO", "CREAR"\);\n\s+if \(denegado\) return denegado;/.test(rutaLista) && /"LISTAS_PRECIO", "EDITAR"/.test(leer("app/api/listas-precio/[id]/route.ts")) && !/clientes WHERE empresa_id = \$1[^`]*`\);/.test(rutaLista.replace(/\n/g, " ")));

  const acc = (permissions: string[], extra: Partial<{ isCompanyAdmin: boolean; isPlatformAdmin: boolean }> = {}) => ({ permissions, isCompanyAdmin: false, isPlatformAdmin: false, ...extra });
  const etiquetas = (a: ReturnType<typeof acc>) => resolveNavigation(a).flatMap((g) => g.items.map((i) => i.label));

  igual("D01: CREAR-only recibe «Nueva lista de precios» y entra directo a /listas-precio/nuevo; VER ve «Listas de precios» y no el atajo; EDITAR sin VER/CREAR no gana acceso", [etiquetas(acc(["LISTAS_PRECIO.CREAR"])).filter((e) => /lista/i.test(e)), resolverInicio(acc(["LISTAS_PRECIO.CREAR"])), etiquetas(acc(["LISTAS_PRECIO.VER"])).filter((e) => /lista/i.test(e)), etiquetas(acc(["LISTAS_PRECIO.EDITAR"])).filter((e) => /lista/i.test(e))], [["Nueva lista de precios"], "/listas-precio/nuevo", ["Listas de precios"], []]);

  cierto("D01: layouts — módulo VER o CREAR; /nuevo solo CREAR; listado y ficha conservan VER", /hasPermission\(access, "LISTAS_PRECIO", "VER"\) && !hasPermission\(access, "LISTAS_PRECIO", "CREAR"\)\) notFound\(\)/.test(leer("app/(private)/listas-precio/layout.tsx")) && /guardPage\("LISTAS_PRECIO", "CREAR"\)/.test(leer("app/(private)/listas-precio/nuevo/layout.tsx")) && /guardPage\("LISTAS_PRECIO", "VER"\)/.test(leer("app/(private)/listas-precio/[id]/layout.tsx")) && /guardPage\("LISTAS_PRECIO", "VER"\)/.test(leer("app/(private)/listas-precio/page.tsx")));

  const nuevo = leer("app/(private)/listas-precio/nuevo/page.tsx");
  const form = leer("app/(private)/listas-precio/_components/lista-precio-form.tsx");

  cierto("D01: tras guardar, con VER vuelve a la lista; sin VER aparece «Lista de precios registrada» + «Registrar otra lista» y el formulario no ofrece enlaces a la lista (migas, volver, cancelar)", /if \(ctx\.puedeVer\) \{\s+router\.push\("\/listas-precio\?ok=creado"\)/.test(nuevo) && /setCreada\(true\)/.test(nuevo) && /Registrar otra lista/.test(nuevo) && /puedeVerLista \? <Link href="\/listas-precio">/.test(form) && /puedeVerLista \? \(\s+<Link href="\/listas-precio" className=\{styles\.secondaryButton\}>/.test(form) && /puedeVerLista \? \(\s+<Link href="\/listas-precio" className=\{styles\.cancelButton\}>/.test(form));

  // ── LPR-D02: interfaz por permisos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const originalFetch = globalThis.fetch;
  const conFetch = async <T,>(r: Resp, f: () => Promise<T>) => { globalThis.fetch = fetchDe(r); try { return await f(); } finally { globalThis.fetch = originalFetch; } };
  const L = { id: "1" };

  igual("D02: el listado recibe CREAR de la sesión del servidor: con CREAR habilita «Nueva lista»; sin permisos informados (VER-only o respuesta antigua) NO", [(await conFetch({ status: 200, cuerpo: { listas: [], permisos: { ver: true, crear: true, editar: false } } }, cargarListasConPermisos)).puedeCrear, (await conFetch({ status: 200, cuerpo: { listas: [], permisos: { ver: true, crear: false, editar: false } } }, cargarListasConPermisos)).puedeCrear, (await conFetch({ status: 200, cuerpo: { listas: [] } }, cargarListasConPermisos)).puedeCrear], [true, false, false]);
  igual("D02: la ficha recibe EDITAR de la sesión del servidor: sin EDITAR (o sin dato) es de consulta, con datos intactos; ficha inexistente → null", [(await conFetch({ status: 200, cuerpo: { lista: L, permisos: { editar: true } } }, () => cargarListaConPermisos("1")))?.puedeEditar, (await conFetch({ status: 200, cuerpo: { lista: L, permisos: { editar: false } } }, () => cargarListaConPermisos("1")))?.puedeEditar, (await conFetch({ status: 200, cuerpo: { lista: L } }, () => cargarListaConPermisos("1")))?.puedeEditar, (await conFetch({ status: 200, cuerpo: { lista: L, permisos: { editar: false } } }, () => cargarListaConPermisos("1")))?.lista, await conFetch({ status: 404 }, () => cargarListaConPermisos("1"))], [true, false, false, L, null]);

  const listado = leer("app/(private)/listas-precio/_components/listado-listas.tsx");
  const ficha = leer("app/(private)/listas-precio/[id]/page.tsx");

  cierto("D02 pantallas: «Nueva lista» (cabecera y estado vacío) solo con puedeCrear; la ficha pasa soloLectura={!puedeEditar}; el formulario deshabilita los datos (fieldset) y reemplaza «Actualizar lista» por «Solo lectura», y el submit es inerte; el permiso viene del servidor", /\{puedeCrear \? \(\s+<Link href="\/listas-precio\/nuevo" className=\{ui\.primaryButton\}>/.test(listado) && /listas\.length === 0 && puedeCrear \? \(/.test(listado) && /soloLectura=\{!puedeEditar\}/.test(ficha) && /<fieldset className=\{styles\.content\} disabled=\{soloLectura\}/.test(form) && /\{soloLectura \? \(\s+<span className=\{styles\.meta\}>Solo lectura/.test(form) && /if \(soloLectura\) return;/.test(form) && /permisos: \{ editar: puedeEditar \}/.test(leer("app/api/listas-precio/[id]/route.ts")));

  // ── LPR-D03: vigencia y disponibilidad ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const hoy = "2026-10-19";
  const v = (estado: string, desde: string, hasta: string, activo = true) => clasificarVigencia({ estado, activo, vigenteDesde: desde, vigenteHasta: hasta }, hoy);

  igual("D03: BORRADOR e INACTIVA con fecha final pasada conservan su estado administrativo (no son «Vencida») y no están disponibles", [v("BORRADOR", "", "2026-01-01"), v("INACTIVA", "", "2026-01-01", false), v("INACTIVA", "", "", false)], [{ estadoVisual: "BORRADOR", disponible: false }, { estadoVisual: "INACTIVA", disponible: false }, { estadoVisual: "INACTIVA", disponible: false }]);
  igual("D03: ACTIVA con inicio futuro → «Aún no vigente» (no disponible); con fin pasado → «Vencida»; dentro del rango o sin fechas → «Activa» y disponible", [v("ACTIVA", "2026-10-20", ""), v("ACTIVA", "", "2026-10-18"), v("ACTIVA", "2026-10-01", "2026-12-31"), v("ACTIVA", "", "")], [{ estadoVisual: "AUN_NO_VIGENTE", disponible: false }, { estadoVisual: "VENCIDA", disponible: false }, { estadoVisual: "ACTIVA", disponible: true }, { estadoVisual: "ACTIVA", disponible: true }]);
  igual("D03: los límites son inclusivos — vigente el mismo día de inicio y el mismo día de fin; vencida al día siguiente", [v("ACTIVA", hoy, hoy).disponible, v("ACTIVA", "", hoy).estadoVisual, v("ACTIVA", "", "2026-10-18").estadoVisual], [true, "ACTIVA", "VENCIDA"]);

  // «hoy» se calcula en America/Asuncion (UTC-3): 02:00 UTC del día 20 aún es 19 en Asunción; independiente del huso del dispositivo.
  const instantes = [new Date("2026-10-20T02:59:59Z"), new Date("2026-10-20T03:00:00Z"), new Date("2026-10-19T12:00:00Z")];
  const tzOriginal = process.env.TZ;
  const hoyEn = (tz: string) => { process.env.TZ = tz; try { return instantes.map((i) => hoyParaVigencia(i)); } finally { if (tzOriginal === undefined) delete process.env.TZ; else process.env.TZ = tzOriginal; } };

  igual("D03: el día vigente es el de America/Asuncion con el navegador en cualquier otro huso (Tokio, Los Ángeles, UTC)", [hoyEn("Asia/Tokyo"), hoyEn("America/Los_Angeles"), hoyEn("UTC")], Array.from({ length: 3 }, () => ["2026-10-19", "2026-10-20", "2026-10-19"]));
  igual("D03: la lista vigente hasta el 19 sigue disponible a las 23:59 en Asunción y vence al comenzar el 20, sin depender del huso del dispositivo", [clasificarVigencia({ estado: "ACTIVA", activo: true, vigenteDesde: "", vigenteHasta: "2026-10-19" }, hoyParaVigencia(instantes[0])).disponible, clasificarVigencia({ estado: "ACTIVA", activo: true, vigenteDesde: "", vigenteHasta: "2026-10-19" }, hoyParaVigencia(instantes[1])).estadoVisual], [true, "VENCIDA"]);
  igual("D03: «próximas a vencer» usa el mismo calendario (hoy + 30 días, sin efecto del horario de verano ni de fin de mes)", [sumarDias("2026-10-19", 30), sumarDias("2026-12-20", 15), sumarDias("2026-02-27", 2)], ["2026-11-18", "2027-01-04", "2026-03-01"]);
  cierto("D03 pantalla: el listado clasifica con clasificarVigencia y la fecha de Asunción (no `new Date(...T23:59:59)`), cuenta como «Disponibles» solo las vigentes, ofrece el filtro «Aún no vigentes» y usa la etiqueta común", /clasificarVigencia\(lista, hoy\)/.test(listado) && /if \(v\.disponible\) acc\.activas \+= 1/.test(listado) && /hoyParaVigencia\(\)/.test(listado) && !/T23:59:59/.test(listado) && /value="AUN_NO_VIGENTE"/.test(listado) && /ETIQUETA_ESTADO_VISUAL\[estado\]/.test(listado));

  // ── LPR-D04: carga verificada de los catálogos ───────────────────────────────────────────────────────────────────────────────────────────────
  const cat = (r: Resp) => cargarCatalogosVerificados(fetchDe(r));

  for (const [codigo, texto] of [[401, "Sesión no válida."], [403, "No tiene permiso."], [500, "Error interno."]] as const) {
    const e = await cat({ status: codigo, cuerpo: { error: texto } });

    igual(`D04: HTTP ${codigo} → ERROR con el mensaje y el código; no hay catálogo ni moneda base asumida; Guardar queda bloqueado conservando lo escrito`, [e.estado, e.estado === "ERROR" ? e.mensaje : "", motivoBloqueoGuardarLista(e)?.includes("Lo escrito se conserva")], ["ERROR", `${texto} (código ${codigo})`, true]);
  }

  const red = await cat("red");
  const jsonMalo = await cat({ status: 200, textoInvalido: true });
  const formaMala = await cat({ status: 200, cuerpo: { catalogos: { ...CATALOGO, clientes: "no" } } });
  const sinBase = await cat({ status: 200, cuerpo: { catalogos: { ...CATALOGO, monedaBase: "" } } });
  const sinCatalogos = await cat({ status: 200, cuerpo: {} });

  igual("D04: error de red, JSON inválido y HTTP 200 con estructura incompleta (lista que no es arreglo, moneda base vacía o ausente) son ERROR — nunca catálogos vacíos ni PYG", [red.estado, jsonMalo.estado, formaMala.estado, sinBase.estado, sinCatalogos.estado], ["ERROR", "ERROR", "ERROR", "ERROR", "ERROR"]);

  const ok = await cat({ status: 200, cuerpo: { catalogos: CATALOGO, permisos: { ver: false } } });

  igual("D04: carga válida con moneda base USD → CONFIGURADO con esa moneda (no PYG) y Guardar se habilita; permisos.ver de la sesión informado", [ok.estado, ok.estado === "CONFIGURADO" ? ok.catalogo.monedaBase : "", ok.estado === "CONFIGURADO" ? ok.puedeVer : null, motivoBloqueoGuardarLista(ok), motivoBloqueoGuardarLista({ estado: "CARGANDO" })?.includes("cargando")], ["CONFIGURADO", "USD", false, null, true]);

  // Reintento: tras un ERROR una carga válida deja CONFIGURADO; el borrador del formulario vive en otro estado y no interviene.
  const intentos: Resp[] = [{ status: 500, cuerpo: { error: "caído" } }, { status: 200, cuerpo: { catalogos: CATALOGO } }];
  const secuencia = [await cat(intentos[0]), await cat(intentos[1])].map((e) => e.estado);

  igual("D04: reintento legítimo: ERROR y luego CONFIGURADO", secuencia, ["ERROR", "CONFIGURADO"]);
  cierto("D04 pantalla: la carga usa estados explícitos y «Reintentar» solo relanza la carga (no toca el borrador `form`); el submit se bloquea en el handler y en el botón; la moneda base ya no cae a PYG; sin catálogos válidos no hay opciones vacías en el servidor ni fallback", /cargarCatalogosVerificados\(/.test(form) && /onClick=\{\(\) => setIntento\(\(n\) => n \+ 1\)\}/.test(form) && /if \(bloqueoCarga\) \{\s+setError\(bloqueoCarga\);\s+return;/.test(form) && /disabled=\{saving \|\| bloqueoCarga !== null\}/.test(form) && /catalogo\?\.monedaBase \?\? ""/.test(form) && !/\?\? "PYG"/.test(form) && !/\?\? "PYG"/.test(rutaLista) && !/setForm\([^)]*setIntento|setIntento[^;]*setForm/.test(form));

  // ── LPR-R03-01: la fecha sigue el día de Asunción con la pantalla abierta (reloj controlado) ───────────────────────────────────────────────
  const entorno = (inicio: string) => {
    let t = new Date(inicio).getTime();
    const timers = new Map<number, { en: number; fn: () => void }>();
    const oyentes = new Set<() => void>();
    let seq = 0;
    const cambios: string[] = [];
    let altas = 0;
    let bajas = 0;
    const vig = crearVigilanteDia({
      ahora: () => new Date(t),
      programar: (fn, ms) => { seq += 1; timers.set(seq, { en: t + ms, fn }); return seq; },
      cancelar: (h) => { timers.delete(h as number); },
      suscribir: (fn) => { oyentes.add(fn); altas += 1; return () => { oyentes.delete(fn); bajas += 1; }; },
      alCambiar: (h) => cambios.push(h),
    });
    /** Avanza el reloj; `suspendido` = el navegador no dispara los temporizadores vencidos (equipo suspendido/pestaña dormida). */
    const avanzar = (ms: number, suspendido = false) => {
      const destino = t + ms;

      while (!suspendido) {
        const prox = [...timers.entries()].filter(([, x]) => x.en <= destino).sort((a, b) => a[1].en - b[1].en)[0];

        if (!prox) break;
        t = prox[1].en; timers.delete(prox[0]); prox[1].fn();
      }
      t = destino;
    };

    return { vig, avanzar, cambios, oyentes, timers, altas: () => altas, bajas: () => bajas, evento: () => [...oyentes].forEach((f) => f()) };
  };

  // 19/10/2026 23:58 en Asunción (UTC-3) = 20/10/2026 02:58 UTC
  const e1 = entorno("2026-10-20T02:58:00Z");

  e1.vig.iniciar();

  const vence = { estado: "ACTIVA", activo: true, vigenteDesde: "", vigenteHasta: "2026-10-19" };
  const empieza = { estado: "ACTIVA", activo: true, vigenteDesde: "2026-10-20", vigenteHasta: "" };
  const disponibles = (h: string) => [vence, empieza].filter((l) => clasificarVigencia(l, h).disponible).length;
  const antes = e1.vig.fechaActual();

  igual("R03-01: abierta a las 23:58 de Asunción del 19/10: la lista que vence hoy está disponible y la que empieza mañana «Aún no vigente» (1 disponible)", [antes, clasificarVigencia(vence, antes).estadoVisual, clasificarVigencia(empieza, antes).estadoVisual, disponibles(antes)], ["2026-10-19", "ACTIVA", "AUN_NO_VIGENTE", 1]);

  e1.avanzar(3 * 60_000); // 00:01 del 20/10 sin remontar ni recargar
  const despues = e1.vig.fechaActual();

  igual("R03-01: a las 00:01 del 20/10 el temporizador de la medianoche de Asunción actualiza la fecha UNA vez; vence → VENCIDA, empieza → ACTIVA y el KPI se recalcula (sigue en 1, pero con la otra lista)", [e1.cambios, despues, clasificarVigencia(vence, despues).estadoVisual, clasificarVigencia(empieza, despues).estadoVisual, disponibles(despues), clasificarVigencia(vence, despues).disponible], [["2026-10-20"], "2026-10-20", "VENCIDA", "ACTIVA", 1, false]);

  const programados = e1.timers.size;

  e1.avanzar(60 * 60_000);

  igual("R03-01: tras la virada queda UN solo temporizador hacia la próxima medianoche (sin duplicados) y una hora después no hay cambios espurios", [programados, e1.timers.size, e1.cambios.length], [1, 1, 1]);

  // Equipo suspendido toda la noche: el temporizador no se dispara; al volver el foco/visibilidad se revisa la fecha.
  const e2 = entorno("2026-10-20T02:58:00Z");

  e2.vig.iniciar();
  e2.avanzar(8 * 3_600_000, true);

  igual("R03-01: con el navegador suspendido la fecha no cambia sola; al volver a la pestaña (foco/visibilidad) se actualiza", [e2.cambios.length, (e2.evento(), e2.cambios), e2.vig.fechaActual()], [0, ["2026-10-20"], "2026-10-20"]);

  const antesEv = e2.cambios.length;

  e2.evento();
  e2.evento();

  igual("R03-01: foco/visibilidad repetidos el mismo día no generan actualizaciones ni recursos nuevos", [e2.cambios.length - antesEv, e2.timers.size, e2.oyentes.size], [0, 1, 1]);

  // Un único suscriptor aunque se inicie dos veces; todo se libera al desmontar.
  const e3 = entorno("2026-10-20T12:00:00Z");

  e3.vig.iniciar();
  e3.vig.iniciar();
  e3.vig.detener();

  igual("R03-01: iniciar dos veces no duplica listeners/timers y al desmontar se retiran los listeners y se cancela el temporizador", [e3.altas(), e3.bajas(), e3.oyentes.size, e3.timers.size], [1, 1, 0, 0]);

  // La medianoche es la de Asunción aunque el dispositivo esté en otro huso.
  const msEn = (tz: string) => { process.env.TZ = tz; try { return msHastaProximoDia(new Date("2026-10-20T02:58:00Z")); } finally { if (tzOriginal === undefined) delete process.env.TZ; else process.env.TZ = tzOriginal; } };

  igual("R03-01: faltan 2 minutos para la medianoche de Asunción con el dispositivo en Tokio, Los Ángeles o UTC (no la del huso local)", [msEn("Asia/Tokyo"), msEn("America/Los_Angeles"), msEn("UTC")].map((ms) => Math.round(ms / 60_000)), [2, 2, 2]);

  const lista = leer("app/(private)/listas-precio/_components/listado-listas.tsx");
  const vigSrc = leer("lib/listas-precio/vigencia.ts");

  cierto("R03-01 pantalla: `hoy` es estado actualizado por el vigilante (focus + visibilitychange con limpieza al desmontar); no se recarga la lista por el cambio de fecha ni se reinician filtros/paginación", /const \[hoy, setHoy\] = useState\(\(\) => hoyParaVigencia\(\)\)/.test(lista) && /crearVigilanteDia\(\{/.test(lista) && /window\.addEventListener\("focus", fn\)/.test(lista) && /document\.addEventListener\("visibilitychange", alVolver\)/.test(lista) && /removeEventListener\("focus", fn\)/.test(lista) && /return \(\) => vigilante\.detener\(\)/.test(lista) && /alCambiar: setHoy/.test(lista) && !/useMemo\(\(\) => hoyParaVigencia\(\), \[\]\)/.test(lista) && (lista.match(/cargarListasConPermisos\(\)/g) ?? []).length === 1 && !/fetch\(/.test(vigSrc));

  return fallos;
}
