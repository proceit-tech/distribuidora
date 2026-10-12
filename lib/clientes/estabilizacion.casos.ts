/**
 * Rodada de estabilización de Clientes (AUD-CLIENTES-V1 §VII): CLI-A06 (privilegios permanentes de documentos), CLI-A01 (referencias inactivas inalteradas), CLI-A03 (versión
 * optimista), CLI-A04 (catálogo con error) y CLI-A02 (protección de borrador). Sin base de datos: lógica pura, conexiones simuladas y verificaciones estáticas del SQL y de
 * las pantallas. NO prueban PostgreSQL real; los privilegios los comprueba el responsable con scripts/verificar-NEX-053.sql.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { REFERENCIAS_CLIENTE, leerVersionEsperada, validarReferenciasCliente } from "@/lib/clientes/referencias-version";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OTRA = "99999999-9999-4999-8999-999999999999";
const G_VIEJO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G_NUEVO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V_VIEJO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Intérprete mínimo de GRANT/REVOKE sobre nexit_runtime (solo para el ayudante de NEX-053). */
function aplicarPrivilegios(estado: Record<string, Set<string>>, sql: string) {
  for (const m of sql.matchAll(/(GRANT|REVOKE)\s+([A-Z, ]+?)\s+ON\s+public\.(\w+)\s+(?:TO|FROM)\s+nexit_runtime;/g)) {
    const privilegios = m[2].split(",").map((p) => p.trim());
    const conjunto = (estado[m[3]] ??= new Set());

    for (const p of privilegios) {
      if (m[1] === "GRANT") conjunto.add(p);
      else conjunto.delete(p);
    }
  }
}

export async function verificarCasosEstabilizacionClientes(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const sinComentarios = (t: string) => t.replace(/--[^\n]*/g, "");

  // ── CLI-A06: privilegios de documentos tras reaplicar el envoltorio de grants
  const m53 = leer("documentacao/banco/nexit/v1/migraciones/NEX-053-clientes-grants-documentos.sql");
  const m52 = leer("documentacao/banco/nexit/v1/migraciones/NEX-052-productos-cambio-unidad-base-stock.sql");
  const base020 = leer("documentacao/banco/nexit/v1/migraciones/NEX-020-catalogos-producto-escritura-controlada.sql");
  const m31 = leer("documentacao/banco/nexit/v1/migraciones/NEX-031-cliente-documentos-versiones-auditoria.sql");
  const helper = m53.slice(m53.indexOf("CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_clientes()"), m53.indexOf("SELECT public.nex_aplicar_grants_clientes();"));

  // Estado tras la BASE vigente: la lista fija concede escritura a cliente_documentos (incluido DELETE) y deja versiones/eventos solo con SELECT.
  const listaEscritura = base020.slice(base020.indexOf("FOREACH t IN ARRAY ARRAY["), base020.indexOf("] LOOP", base020.indexOf("FOREACH t IN ARRAY ARRAY[")));
  const trasBase: Record<string, Set<string>> = {
    cliente_documentos: new Set(["SELECT", ...(listaEscritura.includes("'cliente_documentos'") ? ["INSERT", "UPDATE", "DELETE"] : [])]),
    cliente_documento_versiones: new Set(["SELECT", ...(listaEscritura.includes("'cliente_documento_versiones'") ? ["INSERT", "UPDATE", "DELETE"] : [])]),
    cliente_documento_eventos: new Set(["SELECT", ...(listaEscritura.includes("'cliente_documento_eventos'") ? ["INSERT", "UPDATE", "DELETE"] : [])]),
  };
  const lista = (e: Record<string, Set<string>>, t: string) => [...(e[t] ?? [])].sort();

  igual("A06 evidencia: tras el reinicio de la base, documentos recupera DELETE y versiones/eventos no tienen INSERT (el defecto confirmado)", [lista(trasBase, "cliente_documentos"), lista(trasBase, "cliente_documento_versiones"), lista(trasBase, "cliente_documento_eventos")], [["DELETE", "INSERT", "SELECT", "UPDATE"], ["SELECT"], ["SELECT"]]);

  const tras053 = Object.fromEntries(Object.entries(trasBase).map(([k, v]) => [k, new Set(v)]));

  aplicarPrivilegios(tras053, helper);

  igual("A06: después del ayudante de NEX-053: documentos sin DELETE (con INSERT y UPDATE para la exclusión lógica); versiones y eventos con SELECT e INSERT, sin UPDATE/DELETE", [lista(tras053, "cliente_documentos"), lista(tras053, "cliente_documento_versiones"), lista(tras053, "cliente_documento_eventos")], [["INSERT", "SELECT", "UPDATE"], ["INSERT", "SELECT"], ["INSERT", "SELECT"]]);

  const tras053Dos = Object.fromEntries(Object.entries(tras053).map(([k, v]) => [k, new Set(v)]));

  aplicarPrivilegios(tras053Dos, helper);

  igual("A06: el ayudante es idempotente (aplicarlo dos veces no cambia nada) y reproduce exactamente el estado de NEX-031 (sin DELETE en documentos, SELECT+INSERT en historiales)", [JSON.stringify(Object.fromEntries(Object.entries(tras053Dos).map(([k, v]) => [k, [...v].sort()]))) === JSON.stringify(Object.fromEntries(Object.entries(tras053).map(([k, v]) => [k, [...v].sort()]))), /REVOKE DELETE ON public\.cliente_documentos FROM nexit_runtime/.test(m31), /GRANT SELECT, INSERT ON public\.cliente_documento_versiones/.test(m31)], [true, true, true]);

  const patronEnvoltorio = /LIKE '(nex\\_aplicar\\_grants\\_%)'/.exec(m52)?.[1] ?? "";
  const comoRegex = new RegExp(`^${patronEnvoltorio.replace(/\\_/g, "_").replace(/_/g, "[_]").replace(/%/g, ".*")}$`);

  cierto("A06: el envoltorio de NEX-052 descubre el ayudante por su nombre (y no descubre ni la base ni el propio envoltorio) y los ayudantes de los demás módulos siguen existiendo", comoRegex.test("nex_aplicar_grants_clientes") && ["nex_aplicar_grants_proveedores", "nex_aplicar_grants_fiscal", "nex_aplicar_grants_productos", "nex_aplicar_grants_comercial", "nex_aplicar_grants_depositos"].every((h) => comoRegex.test(h)) && /NOT IN \('nex_aplicar_grants_runtime', 'nex_aplicar_grants_runtime_base'\)/.test(m52));
  cierto("NEX-053: incremental (exige NEX-031 y NEX-052, no se reaplica), no redefine el envoltorio ni ayudantes de otros módulos, no toca NEX-001…052", /NEX-053 requiere NEX-031/.test(m53) && /NEX-053 requiere NEX-052/.test(m53) && /NEX-053 parece aplicada/.test(m53) && !/CREATE OR REPLACE FUNCTION public\.nex_aplicar_grants_runtime\(\)/.test(m53) && !/nex_aplicar_grants_(proveedores|fiscal|productos|comercial|depositos|facturacion)/.test(sinComentarios(m53)) && !/(DELETE FROM|DROP|ALTER TABLE|TRUNCATE)/i.test(sinComentarios(m53).replace(/REVOKE[^;]*;/g, "")));
  cierto("NEX-053: reversión protegida y verificación con has_table_privilege (parte 1 de solo lectura; la reaplicación solo en entorno de prueba, comentada)", /RAISE EXCEPTION 'nex_aplicar_grants_clientes no existe/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-053.sql")) && (leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-053.sql").match(/has_table_privilege/g) ?? []).length >= 10 && /--   SELECT public\.nex_aplicar_grants_runtime\(\);/.test(leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-053.sql")));
  cierto("A06: la aplicación no emite DELETE sobre cliente_documentos (exclusión lógica) ni UPDATE sobre versiones/eventos", !/DELETE FROM\s+cliente_documentos|UPDATE\s+cliente_documento_(versiones|eventos)|DELETE FROM\s+cliente_documento_(versiones|eventos)/i.test([leer("app/api/clientes/[id]/documentos/route.ts"), leer("lib/clientes/relacionados.ts")].join("\n")));

  // ── CLI-A01: referencias inactivas inalteradas
  type Q = { sql: string; p: unknown[] };
  const conexion = (devuelve: (q: Q) => number) => {
    const consultas: Q[] = [];

    return { consultas, c: { async query(sql: string, p: unknown[] = []) { consultas.push({ sql, p }); return { rows: [], rowCount: devuelve({ sql, p }) }; } } as never };
  };
  const refs = (extra: Record<string, string | null> = {}) => ({ grupoClienteId: null, listaPrecioId: null, rutaEntregaId: null, zonaComercialId: null, vendedorId: null, canalVentaId: null, ...extra });
  const intenta = async (c: never, nuevas: Record<string, string | null>, actuales: Record<string, string | null>) => {
    try {
      await validarReferenciasCliente(c, EMPRESA, nuevas, actuales);

      return "ok";
    } catch (e) {
      return (e as Error).message;
    }
  };

  const sinCambio = conexion(() => 0);

  igual("A01 positivo: la referencia inactiva que el cliente YA tiene y no cambia se tolera sin consultar (aunque el catálogo ya no la ofrezca)", [await intenta(sinCambio.c, refs({ grupoClienteId: G_VIEJO, vendedorId: V_VIEJO }), { grupo_cliente_id: G_VIEJO, vendedor_id: V_VIEJO }), sinCambio.consultas.length], ["ok", 0]);

  const nueva = conexion(() => 0);

  igual("A01 negativo: elegir como NUEVA una referencia inactiva (o de otra empresa) se rechaza con mensaje del campo", [await intenta(nueva.c, refs({ grupoClienteId: G_NUEVO }), { grupo_cliente_id: G_VIEJO }), nueva.consultas[0].p, /activo = true/.test(nueva.consultas[0].sql)], ["El valor seleccionado para grupo de cliente no está disponible.", [G_NUEVO, EMPRESA], true]);

  const activa = conexion(() => 1);

  igual("A01 positivo: cambiar a una referencia ACTIVA de la empresa se acepta (consulta por id y empresa de la sesión); vaciar una referencia también", [await intenta(activa.c, refs({ grupoClienteId: G_NUEVO }), { grupo_cliente_id: G_VIEJO }), activa.consultas[0].p, await intenta(activa.c, refs(), { grupo_cliente_id: G_VIEJO })], ["ok", [G_NUEVO, EMPRESA], "ok"]);
  igual("A01 negativo multiempresa: una referencia que la consulta no encuentra para la empresa de la sesión se rechaza aunque exista en otra", await intenta(conexion(() => 0).c, refs({ vendedorId: OTRA }), { vendedor_id: null }), "El valor seleccionado para vendedor no está disponible.");
  igual("A01: las seis referencias comerciales (grupo, lista, ruta, zona, vendedor, canal) están cubiertas", Object.keys(REFERENCIAS_CLIENTE), ["grupoClienteId", "listaPrecioId", "rutaEntregaId", "zonaComercialId", "vendedorId", "canalVentaId"]);

  const ruta = leer("app/api/clientes/[id]/route.ts");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  const get = ruta.slice(ruta.indexOf("export async function GET"), ruta.indexOf("export async function PUT"));

  cierto("A01: el PUT verifica referencias DESPUÉS de bloquear la fila (FOR UPDATE) con la función probada, y el GET informa las referencias históricas inactivas que el formulario debe mostrar", put.indexOf("FOR UPDATE") < put.indexOf("validarReferenciasCliente(") && !/FROM \$\{tabla\} WHERE id = \$1 AND empresa_id = \$2 AND activo = true/.test(put) && /referenciasHistoricas/.test(get) && /AND NOT activo/.test(get) && (get.match(/empresa_id = \$1/g) ?? []).length >= 6);

  const pagina = leer("app/(private)/clientes/[id]/page.tsx");

  cierto("A01 pantalla: la referencia histórica inactiva se agrega al selector marcada «(inactivo)» sin borrar el vínculo (solo si falta en el catálogo activo)", /referenciasHistoricas/.test(pagina) && /\(inactivo\)/.test(pagina) && /!lista\.some\(\(o\) => o\.id === h\.id\)/.test(pagina));

  // ── CLI-A03: versión optimista
  igual("A03: la versión esperada se normaliza a ISO con milisegundos; ausente, vacía o inválida → null (el guardado se rechaza)", [leerVersionEsperada("2026-10-12T15:15:46.123Z"), leerVersionEsperada("2026-10-12T12:15:46.123-03:00"), leerVersionEsperada(""), leerVersionEsperada("no es fecha"), leerVersionEsperada(undefined), leerVersionEsperada(12345)], ["2026-10-12T15:15:46.123Z", "2026-10-12T15:15:46.123Z", null, null, null, null]);
  cierto("A03: el PUT compara la versión en SQL (milisegundos) DESPUÉS de FOR UPDATE y ANTES de validar o escribir, responde 409 con rollback y NO guarda ni sincroniza contactos/direcciones", /date_trunc\('milliseconds', actualizado_at\) = \$3::timestamptz/.test(put) && put.indexOf("FOR UPDATE") < put.indexOf("version_vigente !== true") && put.indexOf("version_vigente !== true") < put.indexOf("validarCondicionYMoneda(") && put.indexOf("version_vigente !== true") < put.indexOf("UPDATE clientes SET") && put.indexOf("version_vigente !== true") < put.indexOf("sincronizarHijos(") && /status: 409/.test(put.slice(put.indexOf("version_vigente !== true"), put.indexOf("version_vigente !== true") + 800)) && /ROLLBACK/.test(put.slice(put.indexOf("version_vigente !== true"), put.indexOf("version_vigente !== true") + 200)));
  cierto("A03: la respuesta del GET y del PUT trae la versión (ISO) y la pantalla envía actualizadoEn en cada guardado, conservando el formulario ante el 409 (no hay reenvío automático)", /actualizadoEn: c\.actualizado_at instanceof Date \? c\.actualizado_at\.toISOString\(\)/.test(get) && /actualizadoEn: actualizadoAt instanceof Date/.test(put) && /actualizadoEn: cliente\.actualizadoEn/.test(pagina) && /setError\(mensaje\)/.test(pagina) && !/setForm\(null\)/.test(pagina.slice(pagina.indexOf("async function guardar"), pagina.indexOf("async function guardar") + 6000)));
  cierto("A03: sin versión (cuerpo sin actualizadoEn) el parámetro SQL es NULL y la comparación no da verdadero: se rechaza con 409, nunca se sobrescribe a ciegas", /version_vigente !== true/.test(put) && /\[id, empresaId, versionEsperada\]/.test(put));

  // ── CLI-A04: catálogo con error
  const cargar = pagina.slice(pagina.indexOf("async function cargar()"), pagina.indexOf("async function cargar()") + 6500);

  cierto("A04: la ficha verifica rCatalogos.ok ANTES de interpretar el catálogo; ante 401/403/500 muestra el error con el código y NO usa catálogos vacíos ni limpia vínculos", /if \(!rCatalogos\.ok\)/.test(cargar) && cargar.indexOf("!rCatalogos.ok") < cargar.indexOf("await rCatalogos.json()", cargar.indexOf("!rCatalogos.ok") + 30) && /código \$\{rCatalogos\.status\}/.test(cargar) && /status === 401 \|\| rCatalogos\.status === 403/.test(cargar) && /throw new Error/.test(cargar.slice(cargar.indexOf("!rCatalogos.ok"), cargar.indexOf("!rCatalogos.ok") + 600)));
  cierto("A04: un error de la FICHA sigue distinguiéndose del error del catálogo (cada uno con su mensaje)", /!rCliente\.ok/.test(cargar) && /No fue posible cargar el cliente\./.test(cargar) && /No fue posible cargar los catálogos del cliente/.test(cargar));

  // ── CLI-A02: protección de borrador
  const nuevo = leer("app/(private)/clientes/nuevo/page.tsx");
  const docs = leer("app/(private)/clientes/[id]/_components/documentos.tsx");

  cierto("A02: Nuevo cliente avisa si hay datos escritos (ficha distinta de la inicial, contactos, direcciones o documentos) y, tras crear el cliente, solo por archivos aún sin subir; no avisa durante el guardado", /useProtegerCambios\(sucio && !guardando\)/.test(nuevo) && /JSON\.stringify\(formulario\) !== JSON\.stringify\(formularioInicial\)/.test(nuevo) && /documentos\.some\(\(d\) => d\.archivo && !docsSubidos\.includes\(d\.uid\)\)/.test(nuevo));
  cierto("A02: la ficha del cliente compara contra la huella de lo cargado (ficha + contactos + direcciones) y suma el borrador de documento; intacta no avisa y no avisa mientras guarda", /useProtegerCambios\(sucio\)/.test(pagina) && /!saving && \(\(huellaBase !== "" && JSON\.stringify\(\{ form, hijos \}\) !== huellaBase\) \|\| borradorDocumento\)/.test(pagina) && /setHuellaBase\(JSON\.stringify\(\{ form: formularioInicial, hijos: hijosIniciales \}\)\)/.test(pagina));
  cierto("A02: el componente de documentos informa su borrador (alta o edición sin enviar) y lo limpia al desmontarse; el guardado exitoso navega por router (sin popup)", /onBorrador\?: \(hay: boolean\) => void/.test(docs) && /return \(\) => onBorrador\?\.\(false\)/.test(docs) && /onBorrador=\{setBorradorDocumento\}/.test(pagina) && /router\.push\(\s*"\/clientes\?ok=actualizado"/.test(pagina));
  cierto("A02: se reutiliza el mismo mecanismo de Productos/Facturas (useProtegerCambios), sin otro popup propio", /from "@\/lib\/ui\/proteger-cambios"/.test(nuevo) && /from "@\/lib\/ui\/proteger-cambios"/.test(pagina));

  return fallos;
}
