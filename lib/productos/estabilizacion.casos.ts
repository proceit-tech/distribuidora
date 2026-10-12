/**
 * Rodada de estabilización de Productos (AUD-PRODUCTOS-V1 §XXII): PRD-A21/U07 (cambio de unidad base con stock cero, serializado), PRD-A23 (alcance de depósitos),
 * PRD-A24 (observación del documento = 500) y PRD-A04/A05 (protección del borrador). Sin base de datos: lógica pura con conexiones simuladas y verificaciones
 * estáticas del SQL y de las rutas. NO prueban el comportamiento real de PostgreSQL (la serialización la prueba el responsable con scripts/verificar-NEX-052.sql).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { alcanceConsultaDeposito, validarAlcanceConfiguraciones } from "@/lib/productos/alcance";
import { ErrorValidacion } from "@/lib/productos/errores";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { validarMetadatosDocumento } from "@/lib/productos/documentos";
import { validarCambioUnidadBase } from "@/lib/productos/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const PROD = "22222222-2222-4222-8222-222222222222";
const U1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const U2 = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

export async function verificarCasosEstabilizacionProductos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const lanza = (f: () => unknown) => {
    try {
      f();

      return null;
    } catch (e) {
      return e as ErrorValidacion;
    }
  };
  const norm = (t: string) => t.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

  // ── PRD-A24: observación del documento = 500 (CHECK de NEX-007)
  const obs = (n: number) => validarMetadatosDocumento({ tipo: "FICHA_TECNICA", observacion: "x".repeat(n) });

  igual("A24: observación de exactamente 500 caracteres se acepta", obs(500).observacion?.length, 500);
  igual("A24: 501 caracteres se rechazan con error de campo útil", [lanza(() => obs(501))?.campo, /500/.test(lanza(() => obs(501))?.message ?? "")], ["observacion", true]);
  igual("A24: la base mantiene el CHECK de 500 y la ficha del producto conserva su propio límite de 1000", [/observacion\s+text\s+CHECK \(char_length\(observacion\) <= 500\)/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-007-productos.sql")), /opcional\(d\.observacion, "La observación", "observacion", 1000\)/.test(leer("lib/productos/normalizar.ts"))], [true, true]);
  cierto("A24: la pantalla de documentos limita a 500 (UI y API alineadas)", /observacion: v \}\)\} maxLength=\{500\}/.test(leer("app/(private)/productos/_components/pestanas/documentos.tsx")) && !/maxLength=\{1000\}/.test(leer("app/(private)/productos/_components/pestanas/documentos.tsx")));

  // ── PRD-A21 / U07: cambio de unidad base
  type Llamada = { sql: string; p: unknown[] };
  const conexion = (opciones: { funcion?: boolean; detalle?: string; otro?: boolean }) => {
    const llamadas: Llamada[] = [];

    return {
      llamadas,
      c: {
        async query(sql: string, p: unknown[] = []) {
          llamadas.push({ sql, p });
          if (/to_regprocedure/.test(sql)) return { rows: [{ ok: opciones.funcion !== false }], rowCount: 1 };
          if (/producto_cambiar_unidad_base_validar/.test(sql)) {
            if (opciones.detalle) throw Object.assign(new Error("db"), { detail: opciones.detalle, code: "P0001" });
            if (opciones.otro) throw Object.assign(new Error("caída"), { code: "57P01" });
          }

          return { rows: [], rowCount: 0 };
        },
      } as never,
    };
  };
  const cambio = async (o: Parameters<typeof conexion>[0]) => {
    const x = conexion(o);

    try {
      await validarCambioUnidadBase(x.c, EMPRESA, USUARIO, PROD, U1, U2);

      return { ok: true, llamadas: x.llamadas, error: null as null | ErrorValidacion };
    } catch (e) {
      return { ok: false, llamadas: x.llamadas, error: e as ErrorValidacion };
    }
  };

  const sinMigracion = await cambio({ funcion: false });
  const conStock = await cambio({ detalle: "NEX:STOCK_NO_CERO" });
  const conCosto = await cambio({ detalle: "NEX:COSTO_VALORIZADO" });
  const concurrente = await cambio({ detalle: "NEX:UNIDAD_CAMBIO_CONCURRENTE" });
  const libre = await cambio({});
  const inesperado = await cambio({ otro: true });

  igual("A21: sin la función de NEX-052 el cambio de unidad se RECHAZA (409, campo unidadMedidaId) y no se llama a nada más", [sinMigracion.ok, sinMigracion.error?.campo, sinMigracion.error?.estado, /NEX-052/.test(sinMigracion.error?.message ?? ""), sinMigracion.llamadas.length], [false, "unidadMedidaId", 409, true, 1]);
  igual("A21 negativo: saldos distintos de cero (cualquier depósito/estado/propiedad/lote) → 409 con mensaje de stock", [conStock.ok, conStock.error?.estado, conStock.error?.campo, /stock/.test(conStock.error?.message ?? "")], [false, 409, "unidadMedidaId", true]);
  igual("A21 negativo: cantidad valorizada y cambio concurrente también bloquean con 409", [conCosto.error?.estado, /valorizada/.test(conCosto.error?.message ?? ""), concurrente.error?.estado, /Recargue/.test(concurrente.error?.message ?? "")], [409, true, 409, true]);
  igual("A21 positivo: con stock cero la función de la base recibe empresa, usuario, producto, unidad anterior y nueva EN ESE ORDEN (todo de la sesión, nada del cuerpo)", [libre.ok, libre.llamadas[1].p], [true, [EMPRESA, USUARIO, PROD, U1, U2]]);
  igual("A21: un error inesperado de la base no se disfraza de validación (se propaga)", [inesperado.ok, (inesperado.error as unknown as { code?: string }).code], [false, "57P01"]);

  const put = leer("app/api/productos/[id]/route.ts");
  const bloquePut = put.slice(put.indexOf("export async function PUT"));
  const post = leer("app/api/productos/route.ts");

  cierto("A21: el PUT llama a la validación solo si la unidad persistida existe y DIFIERE de la enviada, dentro de la transacción, tras bloquear el producto y ANTES del UPDATE", /datos\.unidadMedidaId && actual\.unidad_medida_id && datos\.unidadMedidaId !== actual\.unidad_medida_id/.test(bloquePut) && bloquePut.indexOf("BEGIN") < bloquePut.indexOf("FOR UPDATE") && bloquePut.indexOf("FOR UPDATE") < bloquePut.indexOf("validarCambioUnidadBase(") && bloquePut.indexOf("validarCambioUnidadBase(") < bloquePut.indexOf("UPDATE productos SET"));
  cierto("A21: el alta (POST) no usa la validación de cambio y el PUT sin cambio de unidad no consulta stock", !/validarCambioUnidadBase/.test(post) && (bloquePut.match(/validarCambioUnidadBase\(/g) ?? []).length === 1);

  const m52 = leer("documentacao/banco/nexit/v1/migraciones/NEX-052-productos-cambio-unidad-base-stock.sql");
  const m14 = leer("documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql");
  const rev52 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-052.sql");
  const ver52 = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-052.sql");
  const cuerpoAgregar = (t: string) => {
    const i = t.indexOf("CREATE OR REPLACE FUNCTION inventario_agregar_linea(");
    const j = t.indexOf("END $$;", i);

    return norm(t.slice(i, j + 7));
  };

  igual("A29: inventario_agregar_linea de NEX-052 es idéntica a la de NEX-014 salvo el FOR SHARE del producto (sin reescribir lógica de stock)", cuerpoAgregar(m52), cuerpoAgregar(m14).replace("WHERE empresa_id = p_empresa AND id = p_producto;", "WHERE empresa_id = p_empresa AND id = p_producto FOR SHARE;"));
  igual("A29: la reversión restaura exactamente el cuerpo de NEX-014", cuerpoAgregar(rev52), cuerpoAgregar(m14));
  cierto("A29: todos los escritores de stock pasan por inventario_agregar_linea (registrar y anular), y ninguna migración posterior a NEX-014 escribe stock_saldos", (() => {
    const registrar = m14.slice(m14.indexOf("FUNCTION inventario_registrar_movimiento("), m14.indexOf("FUNCTION inventario_anular_movimiento("));
    const anular = m14.slice(m14.indexOf("FUNCTION inventario_anular_movimiento("), m14.indexOf("FUNCTION nex_aplicar_grants_runtime()"));
    const dir = join(raiz, "documentacao/banco/nexit/v1/migraciones");
    const posteriores = readdirSync(dir).filter((f) => /^NEX-0(1[5-9]|[2-9]\d)-/.test(f) && !f.startsWith("NEX-052"));

    return /PERFORM inventario_agregar_linea\(/.test(registrar) && /PERFORM inventario_agregar_linea\(/.test(anular) && posteriores.every((f) => !/(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?stock_saldos/i.test(norm(readFileSync(join(dir, f), "utf8"))));
  })());
  cierto("A21 SQL: la función bloquea el producto FOR UPDATE, exige permiso PRODUCTOS.EDITAR, unidad esperada, stock_saldos y cantidad valorizada en cero y registra el historial", (() => {
    const f = norm(m52.slice(m52.indexOf("FUNCTION public.producto_cambiar_unidad_base_validar")));

    return /SECURITY DEFINER SET search_path = public, pg_temp/.test(f) && /usuario_tiene_permiso\(p_empresa, p_usuario, 'PRODUCTOS', 'EDITAR'\)/.test(f) && /FROM public\.productos WHERE empresa_id = p_empresa AND id = p_producto FOR UPDATE/.test(f)
      && /v_actual IS DISTINCT FROM p_anterior/.test(f) && /FROM public\.stock_saldos WHERE empresa_id = p_empresa AND producto_id = p_producto AND cantidad <> 0/.test(f) && /FROM public\.inventario_costos WHERE empresa_id = p_empresa AND producto_id = p_producto AND \(cantidad_valorizada <> 0 OR valor_total <> 0\)/.test(f)
      && /INSERT INTO public\.producto_unidad_base_historial/.test(f) && !/movimientos_inventario/.test(f.slice(0, f.indexOf("INSERT INTO public.producto_unidad_base_historial")));
  })());
  cierto("A21 SQL: el historial es inmutable, solo lo escribe la función (el runtime solo lee) y el cambio no recalcula precios ni toca documentos históricos", /BEFORE UPDATE OR DELETE ON public\.producto_unidad_base_historial/.test(m52) && /GRANT SELECT ON public\.producto_unidad_base_historial TO nexit_runtime/.test(m52) && !/INSERT, UPDATE|DELETE ON public\.producto_unidad_base_historial TO/.test(m52) && !/lista_precio|documentos_electronicos|producto_unidades/.test(norm(m52.slice(m52.indexOf("FUNCTION public.producto_cambiar_unidad_base_validar")))));
  cierto("NEX-052: incremental con precondiciones y no-reaplicación, reversión protegida, verificación de solo lectura y envoltorio de grants que descubre todos los ayudantes", /NEX-052 requiere/.test(m52) && /NEX-052 parece aplicada/.test(m52) && /ABORTA si el historial/.test(rev52) && /RAISE EXCEPTION 'el historial de unidad base tiene filas/.test(rev52) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(norm(ver52).replace(/'[^']*'/g, "")) && /LIKE 'nex\\_aplicar\\_grants\\_%'/.test(m52) && /NOT IN \('nex_aplicar_grants_runtime', 'nex_aplicar_grants_runtime_base'\)/.test(m52));

  // ── PRD-A23 / PRD-R02-01 / PRD-R02-02: alcance de depósitos (paridad con Stock), políticas ocultas y conservadas
  const detalle = leer("app/api/productos/[id]/route.ts").slice(0, leer("app/api/productos/[id]/route.ts").indexOf("export async function PUT"));
  const stockSrc = leer("lib/stock/shared.ts");
  const m46 = leer("documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql");
  const frag = alcanceConsultaDeposito("s.deposito_id", "$1", "$2");

  cierto("R02-01: el criterio de Stock es 'TODOS o asignados, activos o no' y la función de gestión de NEX-046 lo confirma; el fragmento de Productos usa el MISMO criterio (usuarios.alcance_depositos + usuario_deposito, sin exigir depositos.activo)", /alcance_depositos = 'TODOS'/.test(stockSrc) && /activos o no/.test(stockSrc) && !/d\.activo/.test(stockSrc.slice(stockSrc.indexOf("const PERMITIDOS"), stockSrc.indexOf("export async function leerStock"))) && /deposito_en_alcance/.test(m46) && /activos o no/.test(m46) && /u_alc\.alcance_depositos = 'TODOS'/.test(frag) && /usuario_deposito ud_alc/.test(frag) && !/activo/.test(frag));
  igual("R02-01: el fragmento filtra por la empresa y el usuario de la sesión (parámetros), con la columna de depósito pedida", [/u_alc\.empresa_id = \$1::uuid AND u_alc\.id = \$2::uuid/.test(frag), /ud_alc\.deposito_id = s\.deposito_id/.test(frag), /ud_alc\.empresa_id = u_alc\.empresa_id/.test(frag)], [true, true, true]);
  cierto("R02-01: lista, detalle (stock por depósito, total, costo y apertura) usan el alcance de consulta y ya no usan usuario_puede_deposito (que exige depósito activo) ni las vistas globales; el catálogo de depósitos para nuevas aperturas SÍ sigue exigiendo depósito activo y operable", (post.match(/\$\{alcanceConsultaDeposito\("(s\.deposito_id|c\.deposito_id|mi\.deposito_destino_id)", "\$1", "\$2"\)\}/g) ?? []).length === 3 && (detalle.match(/\$\{alcanceConsultaDeposito\("(s\.deposito_id|c\.deposito_id|mi\.deposito_destino_id|deposito_id)", "\$2", "\$3"\)\}/g) ?? []).length === 5 && !/usuario_puede_deposito/.test(detalle) && !/(FROM|JOIN) (v_stock_producto|v_producto_costo_promedio)/.test(post + detalle) && /FROM depositos WHERE empresa_id = \$1 AND activo = true AND usuario_puede_deposito\(\$1::uuid, \$2::uuid, id\)/.test(post));
  cierto("R02-01: no se tocan las funciones de permisos de movimiento (usuario_puede_deposito sigue exigiendo activo en NEX-014) ni se agrega ninguna escritura de stock", /JOIN depositos d ON d\.empresa_id = u\.empresa_id AND d\.id = p_deposito AND d\.activo/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql")) && !/INSERT INTO stock|UPDATE stock|inventario_registrar/.test(leer("lib/productos/alcance.ts")));
  cierto("A23: todo sigue filtrado por empresa_id de la sesión (multiempresa) y el bajo-mínimo se calcula con el disponible visible", /s\.empresa_id = p\.empresa_id/.test(post) && /c\.empresa_id = p\.empresa_id/.test(post) && /COALESCE\(sp\.disponible, 0\) < p\.stock_minimo/.test(post) && /s\.empresa_id = \$2 AND s\.producto_id = \$1/.test(detalle));

  const configSql = detalle.slice(detalle.indexOf("FROM producto_deposito_configuracion c") - 400, detalle.indexOf("FROM producto_deposito_configuracion c") + 700);

  cierto("R02-02: el detalle devuelve solo las políticas por depósito del alcance del usuario (misma regla que el stock)", /JOIN depositos d ON d\.empresa_id = c\.empresa_id AND d\.id = c\.deposito_id/.test(configSql) && /\$\{alcanceConsultaDeposito\("c\.deposito_id", "\$2", "\$3"\)\}/.test(configSql) && /\[id, empresaId, session\.user\.id\]/.test(configSql));

  // Conservación: la sincronización no borra por omisión y el PUT rechaza tocar políticas fuera de alcance
  type Q = { sql: string; p: unknown[] };
  const D_VISIBLE = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
  const D_OCULTO = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
  const CFG_OCULTA = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
  const CFG_VISIBLE = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
  const conexionAlcance = (visibles: string[]) => {
    const consultas: Q[] = [];

    return {
      consultas,
      c: {
        async query(sql: string, p: unknown[] = []) {
          consultas.push({ sql, p });
          if (/FROM producto_deposito_configuracion/.test(sql)) {
            const ids = p[2] as string[];

            return { rows: ids.map((id) => ({ deposito_id: id === CFG_OCULTA ? D_OCULTO : D_VISIBLE })), rowCount: ids.length };
          }
          if (/FROM depositos d/.test(sql)) return { rows: (p[2] as string[]).filter((d) => visibles.includes(d)).map((id) => ({ id })), rowCount: 0 };

          return { rows: [], rowCount: 0 };
        },
      } as never,
    };
  };
  const cuerpoDepositos = (depositos: unknown[], eliminar: string[] = []) => normalizarProducto({ descripcion: "P", descripcionFactura: "P", unidadMedidaId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", vendible: false, depositos, eliminaciones: { depositos: eliminar } }, { modo: "editar" });
  const resultado = async (visibles: string[], depositos: unknown[], eliminar: string[] = []) => {
    const x = conexionAlcance(visibles);

    try {
      await validarAlcanceConfiguraciones(x.c, "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222", cuerpoDepositos(depositos, eliminar));

      return { ok: true, estado: 0, consultas: x.consultas.length };
    } catch (e) {
      return { ok: false, estado: (e as ErrorValidacion).estado, consultas: x.consultas.length };
    }
  };
  const fila = (id: string | null, depositoId: string) => ({ id, depositoId, stockMinimo: "1" });

  igual("R02-02 positivo: usuario restringido que edita solo una política visible (las ocultas ni se envían) se acepta", (await resultado([D_VISIBLE], [fila(CFG_VISIBLE, D_VISIBLE)])).ok, true);
  igual("R02-02 negativo: modificar (por id) o eliminar una política de un depósito fuera de alcance se rechaza 403, aunque la solicitud sea fabricada", [(await resultado([D_VISIBLE], [fila(CFG_OCULTA, D_VISIBLE)])).estado, (await resultado([D_VISIBLE], [], [CFG_OCULTA])).estado], [403, 403]);
  igual("R02-02 negativo: crear una política nueva para un depósito fuera de alcance se rechaza 403 (no se revela que ya exista)", (await resultado([D_VISIBLE], [fila(null, D_OCULTO)])).estado, 403);
  igual("R02-02 positivo: administrador/alcance TODOS (todos los depósitos visibles) puede editar y eliminar cualquier política", [(await resultado([D_VISIBLE, D_OCULTO], [fila(CFG_OCULTA, D_OCULTO)])).ok, (await resultado([D_VISIBLE, D_OCULTO], [], [CFG_OCULTA])).ok], [true, true]);
  igual("R02-02: sin políticas en la solicitud no se consulta nada (los registros no enviados no se tocan)", (await resultado([], [])).consultas, 0);

  const sincro = leer("lib/productos/sincronizar.ts");

  cierto("R02-02 conservación: la sincronización no borra por omisión (solo eliminaciones explícitas por id) y el PUT valida el alcance antes de sincronizar", /una fila ausente del envío no se toca/.test(sincro) && /únicamente se eliminan las filas que el usuario pidió eliminar explícitamente/.test(sincro) && put.indexOf("validarAlcanceConfiguraciones(") > put.indexOf("validarReferencias(") && put.indexOf("validarAlcanceConfiguraciones(") < put.indexOf("eliminarHijos("));
  cierto("R02-02: la comprobación filtra por la empresa de la sesión y usa el mismo fragmento de alcance", /WHERE empresa_id = \$1 AND producto_id = \$2 AND id = ANY\(\$3::uuid\[\]\)/.test(leer("lib/productos/alcance.ts")) && /WHERE d\.empresa_id = \$1 AND d\.id = ANY\(\$3::uuid\[\]\) AND \$\{alcanceConsultaDeposito\("d\.id", "\$1", "\$2"\)\}/.test(leer("lib/productos/alcance.ts")));

  // ── PRD-R02-03: historial de la unidad base consultable
  const inventarioUi = leer("app/(private)/productos/_components/pestanas/inventario.tsx");

  cierto("R02-03: el detalle lee el historial (anterior, nueva, fecha en hora de Paraguay y responsable) solo si la tabla de NEX-052 existe, filtrado por empresa y producto, del más reciente al más antiguo; sin migración devuelve lista vacía", /to_regclass\('public\.producto_unidad_base_historial'\) IS NOT NULL/.test(detalle) && /FROM producto_unidad_base_historial h/.test(detalle) && /WHERE h\.empresa_id = \$2 AND h\.producto_id = \$1 ORDER BY h\.cambiado_at DESC/.test(detalle) && /AT TIME ZONE 'America\/Asuncion'/.test(detalle.slice(detalle.indexOf("producto_unidad_base_historial h") - 400, detalle.indexOf("producto_unidad_base_historial h"))) && /: \[\];/.test(detalle) && /historialUnidadBase,/.test(detalle));
  cierto("R02-03: la ficha (pestaña Inventario, solo al editar) lista el historial en modo lectura con los datos pedidos y sin controles de edición; types lo declara", /Historial de la unidad base \(solo lectura\)/.test(inventarioUi) && /Sin cambios de unidad base registrados/.test(inventarioUi) && /h\.unidadAnterior} → \$\{h\.unidadNueva\}/.test(inventarioUi.replace(/\\/g, "")) && !/ctx\.set\("historial/.test(inventarioUi) && /historialUnidadBase: \{ fecha: string; unidadAnterior: string; unidadNueva: string; responsable: string \}\[\]/.test(leer("types/productos.ts")));
  cierto("R02-03: el historial sigue siendo inmutable y de escritura exclusiva de la función (el runtime solo lee); la ficha no ofrece editarlo", /BEFORE UPDATE OR DELETE ON public\.producto_unidad_base_historial/.test(m52) && /GRANT SELECT ON public\.producto_unidad_base_historial TO nexit_runtime/.test(m52) && !/INSERT INTO producto_unidad_base_historial|UPDATE producto_unidad_base_historial|DELETE FROM producto_unidad_base_historial/.test(put + post + detalle));

  // ── PRD-R02-04: la reversión de NEX-052 respeta la dependencia con NEX-053
  const rev = norm(rev52);
  const posGuarda = rev.indexOf("nex_aplicar_grants_clientes()");

  cierto("R02-04: la reversión de NEX-052 se niega mientras exista NEX-053 (objeto nex_aplicar_grants_clientes o fila NEX-053 en schema_migrations) y esa guarda se evalúa ANTES de cualquier cambio; el orden es 053 → 052", posGuarda > 0 && posGuarda < rev.indexOf("CREATE OR REPLACE FUNCTION") && /WHERE version = 'NEX-053'/.test(rev) && /RAISE EXCEPTION 'NEX-053 sigue aplicada/.test(rev) && /RAISE EXCEPTION 'schema_migrations registra NEX-053/.test(rev) && /053 -> 052/.test(rev) && rev.indexOf("RAISE EXCEPTION 'NEX-053 sigue aplicada") < rev.indexOf("DROP TABLE"));
  cierto("R02-04: la guarda lee schema_migrations de forma dinámica (no falla si el libro no existe) y usa el mismo formato de versión del runner ('NEX-053'); la reversión de NEX-053 sigue disponible y no depende de 052", /EXECUTE \$q\$SELECT EXISTS \(SELECT 1 FROM public\.schema_migrations/.test(rev52) && /IF to_regclass\('public\.schema_migrations'\) IS NOT NULL/.test(rev52) && /version="\$\{base%%-\*\}-\$\(echo "\$base" \| cut -d- -f2\)"/.test(leer("documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh")) && /DROP FUNCTION public\.nex_aplicar_grants_clientes\(\)/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-053.sql")) && !/NEX-052/.test(norm(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-053.sql"))));
  cierto("R02-04: ni NEX-052 ni NEX-053 ni ninguna migración NEX-001…051 se modifican en esta rodada (solo el script de reversión y verificación)", !/nex_aplicar_grants_clientes/.test(m52.replace(/--[^\n]*/g, "")));

  // ── PRD-A04/A05: protección de borrador
  const form = leer("app/(private)/productos/_components/producto-form.tsx");

  cierto("A04/A05: el formulario protege cambios de ficha, documentos pendientes y foto pendiente (aviso al recargar/cerrar y al usar enlaces Volver/Cancelar/menú) y se desactiva al guardar", /useProtegerCambios\(\(sucio \|\| pendientes\.length > 0 \|\| fotoPendiente !== null\) && !guardado\)/.test(form) && /setGuardado\(true\)/.test(form) && /from "@\/lib\/ui\/proteger-cambios"/.test(form));
  cierto("A04/A05: formulario intacto no avisa (sucio compara con el estado inicial)", /const sucio = form !== formularioBase && JSON\.stringify\(form\) !== JSON\.stringify\(formularioBase\)/.test(form));

  return fallos;
}
