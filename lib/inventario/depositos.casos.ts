/**
 * Inventario — Depósitos (ORDEM §2.C, INV-05, INV-T05). Sin PostgreSQL ni navegador: carga con fetch simulado, estados de autorización tras errores, respuestas fuera de orden y análisis del código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cargarDepositos, cargarPanelAcceso, enlaceStockDeDeposito, interpretarDepositoUrl } from "@/lib/depositos/carga";
import { validarDeposito } from "@/lib/depositos/validacion";
import { cargaConfiable, crearCompuerta, motivoBloqueoGuardar, permisosVigentes } from "@/lib/productos/catalogos-carga";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Resp = { status: number; cuerpo?: unknown } | "red" | "texto";

export async function verificarCasosInventarioDepositos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const fetchDe = (r: Resp, espera = 0) => async () => {
    if (espera) await new Promise((x) => setTimeout(x, espera));
    if (r === "red") throw new TypeError("fetch failed");
    if (r === "texto") return new Response("no es json", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };
  const DEP = (id: string, nombre: string) => ({ id, codigo: "A", nombre, activo: true, sucursalId: U(5), sucursalNombre: "Matriz", sucursalCodigo: "S1", conMovimientos: false, conSaldo: true });
  const OK = (permisos: Record<string, unknown> = { crear: true, editar: true, stock: true }, depositos: unknown[] = [DEP(U(1), "Central")]) => ({
    status: 200,
    cuerpo: { depositos, sucursales: [{ id: U(5), codigo: "S1", nombre: "Matriz", activo: true }], permisos, actor: { alcanceDepositos: "ASIGNADOS" } },
  });

  // ── INV-05: carga confiable
  const ok = await cargarDepositos(fetchDe(OK()));

  igual("carga correcta: lista, sucursales, actor y permisos (CREAR/EDITAR/STOCK) tal como los entrega la API", [ok.error, ok.datos?.depositos.length, ok.datos?.sucursales.length, ok.datos?.permisos, ok.datos?.actor], ["", 1, 1, { crear: true, editar: true, stock: true }, { alcanceDepositos: "ASIGNADOS" }]);

  for (const status of [401, 403, 500]) {
    const r = await cargarDepositos(fetchDe({ status, cuerpo: { error: "Fallo." } }));
    const est = { cargando: false, errorCarga: r.error, errorAuxiliar: "" };

    igual(`INV-05 ${status} tras una carga previa buena: sin datos, error con código, sin permisos vigentes y acciones/guardado bloqueados`, [r.datos, r.error.includes(`código ${status}`), permisosVigentes({ crear: true, editar: true }, est), cargaConfiable(est), motivoBloqueoGuardar(est) !== null], [null, true, { crear: false, editar: false }, false, true]);
  }
  igual("INV-05 respuesta malformada (sin la lista, sin sucursales, permisos ausentes o no booleanos), JSON inválido y caída de red → error de carga, nunca «sin depósitos»", [
    (await cargarDepositos(fetchDe({ status: 200, cuerpo: { sucursales: [], permisos: { crear: true, editar: true } } }))).datos,
    (await cargarDepositos(fetchDe({ status: 200, cuerpo: { depositos: [], permisos: { crear: true, editar: true } } }))).datos,
    (await cargarDepositos(fetchDe({ status: 200, cuerpo: { depositos: [], sucursales: [] } }))).datos,
    (await cargarDepositos(fetchDe({ status: 200, cuerpo: { depositos: [], sucursales: [], permisos: { crear: "si", editar: true } } }))).datos,
    (await cargarDepositos(fetchDe("texto"))).error !== "",
    (await cargarDepositos(fetchDe("red"))).error !== "",
  ], [null, null, null, null, true, true]);
  igual("INV-05 el permiso de Stock ausente equivale a falso (el enlace «Ver stock» no se ofrece)", (await cargarDepositos(fetchDe(OK({ crear: true, editar: false })))).datos?.permisos.stock, false);

  // Secuencia: carga buena (EDITAR) → recarga con 500 → recuperación. Mientras tanto la carga en curso tampoco habilita nada.
  {
    const enCurso = { cargando: true, errorCarga: "", errorAuxiliar: "" };
    const falla = { cargando: false, errorCarga: "No fue posible cargar los depósitos. (código 500)", errorAuxiliar: "" };
    const sana = { cargando: false, errorCarga: "", errorAuxiliar: "" };
    const P = { crear: true, editar: true };

    igual("INV-05 secuencia: carga en curso → sin permisos; fallo → sin permisos; recuperación → los permisos de la carga vigente", [permisosVigentes(P, enCurso), permisosVigentes(P, falla), permisosVigentes(P, sana)], [{ crear: false, editar: false }, { crear: false, editar: false }, P]);

    // Guardar con formulario abierto: no se envía nada mientras la carga no sea confiable y el borrador queda; recuperada, se envía.
    const envios: string[] = [];
    const guardar = (est: typeof sana, borrador: { nombre: string }) => {
      const b = motivoBloqueoGuardar(est);

      if (b) return { enviado: false, borrador, error: b };
      envios.push(borrador.nombre);

      return { enviado: true, borrador, error: "" };
    };
    const borrador = { nombre: "Depósito Norte" };
    const a = guardar(falla, borrador);
    const b = guardar(enCurso, borrador);
    const c = guardar(sana, borrador);

    igual("INV-05 formulario abierto: con carga fallida o en curso no hay POST/PATCH y el borrador se conserva; tras recuperarse se guarda una vez", [a.enviado, b.enviado, c.enviado, envios, a.borrador === borrador && a.error !== ""], [false, false, true, ["Depósito Norte"], true]);
  }

  // Respuestas fuera de orden: la última solicitud iniciada gana
  {
    const compuerta = crearCompuerta();
    const estado: { lista: unknown[] } = { lista: [] };
    const recargar = async (r: Resp, espera: number) => {
      const sol = compuerta.nueva();
      const res = await cargarDepositos(fetchDe(r, espera));

      if (!compuerta.vigente(sol)) return;
      estado.lista = res.datos?.depositos ?? [];
    };

    await Promise.all([recargar(OK(undefined, [DEP("vieja", "V")]), 50), recargar(OK(undefined, [DEP("nueva", "N")]), 5)]);
    igual("INV-T05 respuesta lenta de una recarga anterior no pisa a la más reciente", (estado.lista as Array<{ id: string }>).map((d) => d.id), ["nueva"]);
  }

  // ── Atajo «Ver stock»: el filtro se aplica de verdad
  igual("«Ver stock»: la dirección lleva el depósito y Stock lo valida contra los depósitos autorizados (uno desconocido se avisa, nunca se ignora en silencio)", [
    enlaceStockDeDeposito(U(1)), interpretarDepositoUrl(`?deposito=${U(1)}`, [{ id: U(1), nombre: "A" }, { id: U(2), nombre: "B" }]).tipo, interpretarDepositoUrl(`?deposito=${U(9)}`, [{ id: U(1), nombre: "A" }]).tipo, interpretarDepositoUrl("", [{ id: U(1), nombre: "A" }]).tipo,
  ], [`/stock?deposito=${U(1)}`, "SELECCIONADO", "NO_DISPONIBLE", "SIN_PARAMETRO"]);

  // ── Reglas de formulario preservadas
  igual("formulario: código obligatorio y con formato al crear; al editar solo nombre y sucursal; nombre ≤ 120", [
    Object.keys(validarDeposito({ codigo: "", nombre: "", sucursalId: "" }, true)), Object.keys(validarDeposito({ codigo: "bad code", nombre: "N", sucursalId: U(5) }, true)), Object.keys(validarDeposito({ codigo: "", nombre: "N", sucursalId: U(5) }, false)), Object.keys(validarDeposito({ codigo: "A1", nombre: "x".repeat(121), sucursalId: U(5) }, true)),
  ], [["codigo", "nombre", "sucursalId"], ["codigo"], [], ["nombre"]]);

  // ── Código
  const pagina = leer("app/(private)/depositos/page.tsx");
  const apiLista = leer("app/api/depositos/route.ts");
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql");
  const apis = ["app/api/depositos/route.ts", "app/api/depositos/[id]/route.ts", "app/api/depositos/[id]/estado/route.ts", "app/api/depositos/[id]/usuarios/route.ts", "app/api/depositos/[id]/usuarios/[usuarioId]/route.ts"].map(leer).join("\n");

  cierto("pantalla: el estado de autorización se deriva de la carga vigente (permisosVigentes) y un fallo descarta lista y permisos (setDatos(null)); la carga usa compuerta y verificación de forma", /permisosVigentes\(\{ crear: datos\?\.permisos\.crear === true, editar: datos\?\.permisos\.editar === true \}, estadoCarga\)/.test(pagina) && /setDatos\(null\);\n      setErrorCarga\(r\.error\)/.test(pagina) && /compuerta\.current\.vigente\(solicitud\)/.test(pagina) && /cargarDepositos<Deposito, Sucursal>/.test(pagina));
  cierto("pantalla: guardar, cambiar estado y gestión de usuarios (autorizar/revocar) consultan motivoBloqueoGuardar antes de cualquier envío; Crear/Editar/Usuarios/Activar/Inactivar/Autorizar/Revocar se deshabilitan sin carga confiable", (pagina.match(/motivoBloqueoGuardar\(estadoCarga\)/g) ?? []).length === 3 && (pagina.match(/!confiable/g) ?? []).length >= 6 && /guardando \|\| !confiable/.test(pagina));
  cierto("pantalla: el formulario sucio no se toca al recargar (cargar() no modifica form/base) y el guard oficial sigue activo", !/setForm|setBase/.test(pagina.slice(pagina.indexOf("const cargar = useCallback"), pagina.indexOf("useEffect(() => {\n    let activo = true;"))) && /useProtegerCambios\(sucio\)/.test(pagina));
  cierto("pantalla: respuesta de usuarios fuera de orden descartada (compuertaPanel) y formato verificado", /compuertaPanel\.current\.vigente\(solicitud\)/.test(pagina) && /cargarPanelAcceso</.test(pagina));
  cierto("alcance: no hay editor de parámetros de reposición, ni saldos, ni movimientos en Depósitos; sin DELETE físico ni ruta paralela de stock", !/stock_minimo|stockMinimo|punto_reposicion|puntoReposicion|stockMaximo|cantidadReposicion/.test(pagina) && !/stock_saldos|inventario_registrar_movimiento|DELETE FROM depositos/.test(apis + pagina) && !/export async function DELETE/.test(apiLista));
  cierto("SQL/API preservados: creación, edición (sucursal inmutable tras movimientos), cambio de estado con saldo, asignación y revocación con eventos persistentes — siguen siendo funciones SQL SECURITY DEFINER invocadas por las APIs", /deposito_crear/.test(apis) && /deposito_editar/.test(apis) && /deposito_cambiar_estado/.test(apis) && /deposito_usuario_asignar/.test(apis) && /deposito_usuario_revocar/.test(apis) && /deposito_usuario_eventos_inmutable/.test(mig));
  cierto("«Ver stock» solo aparece con STOCK.VER y saldo, y apunta al filtro real de Stock (?deposito=); permisos de la API incluyen stock", /puedeVerStock && d\.conSaldo/.test(pagina) && /enlaceStockDeDeposito\(d\.id\)/.test(pagina) && /stock: hasPermission\(acceso, "STOCK", "VER"\)/.test(leer("lib/depositos/servidor.ts")) && /interpretarDepositoUrl\(window\.location\.search/.test(leer("app/(private)/stock/page.tsx")));

  // ── INV-R03-01: panel «Usuarios» / historial de accesos
  const USR = (extra: Record<string, unknown> = {}) => ({ id: U(40), usuario: "ana", nombre: "Ana", apellido: "Paz", estado: "ACTIVO", alcanceDepositos: "ASIGNADOS", alcanceSucursales: "TODAS", asignado: false, asignadoAt: null, sucursalCompatible: true, esUsted: false, ...extra });
  const EVT = (extra: Record<string, unknown> = {}) => ({ id: U(50), evento: "ATRIBUIR", origen: "MANUAL", creadoAt: "2026-10-13T12:00:00.000Z", usuarioNombre: "Ana Paz", usuarioCodigo: "ana", actorNombre: "Beto", actorCodigo: "beto", ...extra });
  const rutas = (usr: Resp, evt: Resp, espera = 0) => async (url: string) => {
    if (espera) await new Promise((x) => setTimeout(x, espera));

    return fetchDe(url.endsWith("/usuarios") ? usr : evt)();
  };
  const okU = (usuarios: unknown): Resp => ({ status: 200, cuerpo: { usuarios } });
  const okE = (eventos: unknown): Resp => ({ status: 200, cuerpo: { eventos } });
  const ok2 = await cargarPanelAcceso(rutas(okU([USR(), USR({ id: U(41), asignado: true, asignadoAt: "2026-10-13T10:00:00.000Z" })]), okE([EVT(), EVT({ id: U(51), evento: "REVOCAR", origen: "CREACION" })])), U(1));

  igual("R03-01 panel: respuestas completas válidas → usuarios y eventos", [ok2.error, ok2.datos?.usuarios.length, ok2.datos?.eventos.length], ["", 2, 2]);
  igual("R03-01 panel: listas vacías legítimas son válidas", (await cargarPanelAcceso(rutas(okU([]), okE([])), U(1))).datos, { usuarios: [], eventos: [] });

  const usuariosMalos: Array<[string, unknown]> = [["null", [null]], ["objeto vacío", [{}]], ["no arreglo", {}], ["texto", "abc"], ["alcance inválido", [USR({ alcanceDepositos: "X" })]], ["asignado no booleano", [USR({ asignado: "si" })]], ["sin id", [USR({ id: "" })]], ["nombre numérico", [USR({ nombre: 5 })]], ["asignadoAt numérico", [USR({ asignadoAt: 5 })]], ["una buena y una nula", [USR(), null]]];
  const eventosMalos: Array<[string, unknown]> = [["null", [null]], ["objeto", {}], ["texto", "abc"], ["evento desconocido", [EVT({ evento: "X" })]], ["origen desconocido", [EVT({ origen: "X" })]], ["fecha inválida", [EVT({ creadoAt: "no-fecha" })]], ["sin fecha", [EVT({ creadoAt: undefined })]], ["actor numérico", [EVT({ actorCodigo: 1 })]], ["una buena y una nula", [EVT(), null]]];

  for (const [n, v] of usuariosMalos) {
    const x = await cargarPanelAcceso(rutas(okU(v), okE([])), U(1));

    igual(`R03-01 usuarios inválidos con HTTP 200 (${n}): sin datos y error recuperable`, [x.datos, x.error !== ""], [null, true]);
  }

  for (const [n, v] of eventosMalos) {
    const x = await cargarPanelAcceso(rutas(okU([USR()]), okE(v)), U(1));

    igual(`R03-01 eventos inválidos con HTTP 200 (${n}): sin datos (tampoco los usuarios válidos) y error recuperable`, [x.datos, x.error !== ""], [null, true]);
  }

  for (const status of [401, 403, 500]) {
    const a = await cargarPanelAcceso(rutas({ status, cuerpo: { error: "Fallo." } }, okE([])), U(1));
    const b = await cargarPanelAcceso(rutas(okU([USR()]), { status, cuerpo: { error: "Fallo." } }), U(1));

    igual(`R03-01 HTTP ${status} en usuarios o en historial: sin datos y con código`, [a.datos, a.error.includes(`código ${status}`), b.datos, b.error.includes(`código ${status}`)], [null, true, null, true]);
  }

  igual("R03-01 red caída, JSON inválido y cuerpo vacío → error recuperable sin datos", [(await cargarPanelAcceso(rutas("red", okE([])), U(1))).datos, (await cargarPanelAcceso(rutas("texto", okE([])), U(1))).datos, (await cargarPanelAcceso(rutas({ status: 200 }, okE([])), U(1))).datos], [null, null, null]);
  igual("R03-01 recuperación: tras un fallo, el reintento válido devuelve los datos", [(await cargarPanelAcceso(rutas(okU([null]), okE([])), U(1))).datos, (await cargarPanelAcceso(rutas(okU([USR()]), okE([EVT()])), U(1))).datos?.usuarios.length], [null, 1]);

  {
    // Alternancia rápida A → B: la respuesta lenta de A no sustituye la de B
    const compuerta = crearCompuerta();
    const estado: { panel: string } = { panel: "" };
    const abrir = async (dep: string, espera: number) => {
      const sol = compuerta.nueva();
      const res = await cargarPanelAcceso(rutas(okU([USR({ id: dep })]), okE([]), espera), dep);

      if (!compuerta.vigente(sol)) return;
      estado.panel = res.datos ? (res.datos.usuarios[0] as { id: string }).id : "error";
    };

    await Promise.all([abrir("A", 40), abrir("B", 5)]);
    igual("R03-01 alternancia rápida A→B: gana el panel B", estado.panel, "B");
    await abrir("C", 0);
    compuerta.nueva();
    await Promise.all([abrir("D", 30), (async () => { compuerta.nueva(); })()]);
    igual("R03-01 cerrar/reabrir invalida la respuesta pendiente: no pisa el estado vigente", estado.panel, "C");
  }

  const panelSrc = pagina;

  cierto("R03-01 pantalla: abrirUsuarios usa la carga validada con compuertaPanel; fallo → panel sin datos (fallo: true) con «Reintentar» y mensajes de error; operaciones POST/DELETE de acceso y bloqueo por motivoBloqueoGuardar intactos", /cargarPanelAcceso<UsuarioDeposito, EventoAcceso>/.test(panelSrc) && /compuertaPanel\.current\.vigente\(solicitud\)/.test(panelSrc) && /fallo: true/.test(panelSrc) && /abrirUsuarios\(panel\.deposito\)/.test(panelSrc) && /method: autorizar \? "POST" : "DELETE"/.test(panelSrc) && /usuarios\/\$\{u\.id\}/.test(panelSrc) && /motivoBloqueoGuardar\(estadoCarga\)/.test(panelSrc) && !/jh\.eventos \?\? \[\]/.test(panelSrc));

  return fallos;
}
