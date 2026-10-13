/**
 * Inventario — Depósitos (ORDEM §2.C, INV-05, INV-T05). Sin PostgreSQL ni navegador: carga con fetch simulado, estados de autorización tras errores, respuestas fuera de orden y análisis del código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cargarDepositos, depositoDesdeConsulta, enlaceStockDeDeposito } from "@/lib/depositos/carga";
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
  const OK = (permisos: Record<string, unknown> = { crear: true, editar: true, stock: true }, depositos: unknown[] = [{ id: U(1), codigo: "A", nombre: "Central" }]) => ({
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

    await Promise.all([recargar(OK(undefined, [{ id: "vieja" }]), 50), recargar(OK(undefined, [{ id: "nueva" }]), 5)]);
    igual("INV-T05 respuesta lenta de una recarga anterior no pisa a la más reciente", estado.lista, [{ id: "nueva" }]);
  }

  // ── Atajo «Ver stock»: el filtro se aplica de verdad
  igual("«Ver stock»: la dirección lleva el depósito y Stock solo lo aplica si existe en el alcance; un id desconocido o ausente se ignora", [
    enlaceStockDeDeposito(U(1)), depositoDesdeConsulta(`?deposito=${U(1)}`, [U(1), U(2)]), depositoDesdeConsulta(`?deposito=${U(9)}`, [U(1)]), depositoDesdeConsulta("", [U(1)]),
  ], [`/stock?deposito=${U(1)}`, U(1), null, null]);

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
  cierto("pantalla: respuesta de usuarios fuera de orden descartada (compuertaPanel) y formato verificado", /compuertaPanel\.current\.vigente\(solicitud\)/.test(pagina) && /Array\.isArray\(j\.usuarios\)/.test(pagina));
  cierto("alcance: no hay editor de parámetros de reposición, ni saldos, ni movimientos en Depósitos; sin DELETE físico ni ruta paralela de stock", !/stock_minimo|stockMinimo|punto_reposicion|puntoReposicion|stockMaximo|cantidadReposicion/.test(pagina) && !/stock_saldos|inventario_registrar_movimiento|DELETE FROM depositos/.test(apis + pagina) && !/export async function DELETE/.test(apiLista));
  cierto("SQL/API preservados: creación, edición (sucursal inmutable tras movimientos), cambio de estado con saldo, asignación y revocación con eventos persistentes — siguen siendo funciones SQL SECURITY DEFINER invocadas por las APIs", /deposito_crear/.test(apis) && /deposito_editar/.test(apis) && /deposito_cambiar_estado/.test(apis) && /deposito_usuario_asignar/.test(apis) && /deposito_usuario_revocar/.test(apis) && /deposito_usuario_eventos_inmutable/.test(mig));
  cierto("«Ver stock» solo aparece con STOCK.VER y saldo, y apunta al filtro real de Stock (?deposito=); permisos de la API incluyen stock", /puedeVerStock && d\.conSaldo/.test(pagina) && /enlaceStockDeDeposito\(d\.id\)/.test(pagina) && /stock: hasPermission\(acceso, "STOCK", "VER"\)/.test(leer("lib/depositos/servidor.ts")) && /depositoDesdeConsulta\(window\.location\.search/.test(leer("app/(private)/stock/page.tsx")));

  return fallos;
}
