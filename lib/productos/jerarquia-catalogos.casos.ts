/**
 * Jerarquía de catálogos de Productos (decisión CAT-012, NEX-044): Categoría → Familia → Línea, Marca independiente. Cubre la validación
 * por campo del formulario, los cambios sin guardar, la coherencia en el servidor (también para peticiones directas), la migración
 * incremental sin clasificar datos históricos y el informe de solo lectura. Sin base de datos: conexión simulada y análisis del código.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  campoDeErrorServidor,
  formularioSucio,
  primerCampoConError,
  validarFormularioCatalogo,
  type FormularioCatalogo,
} from "@/lib/productos/catalogos-formulario";
import { ErrorValidacion } from "@/lib/productos/errores";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { validarReferencias } from "@/lib/productos/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const U1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const CAT_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const CAT_B = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const FAM_A = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const FAM_LEGADA = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const LIN_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const vacio: FormularioCatalogo = { id: null, codigo: "", nombre: "", descripcion: "", familiaId: "", categoriaId: "" };

export async function verificarCasosJerarquiaCatalogos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Validación por campo del formulario
  igual("categoría nueva sin nombre: error en nombre", validarFormularioCatalogo("categorias", vacio), { nombre: "El nombre es obligatorio." });
  igual("marca nueva sin nombre: error en nombre", Object.keys(validarFormularioCatalogo("marcas", vacio)), ["nombre"]);
  igual("familia NUEVA exige categoría y nombre", Object.keys(validarFormularioCatalogo("familias", vacio)), ["categoriaId", "nombre"]);
  igual("familia nueva completa: sin errores", validarFormularioCatalogo("familias", { ...vacio, categoriaId: CAT_A, nombre: "Lácteos" }), {});
  igual("línea exige familia y nombre", Object.keys(validarFormularioCatalogo("lineas", vacio)), ["familiaId", "nombre"]);
  igual("familia histórica sin categoría puede editarse/inactivarse (no se bloquea)", validarFormularioCatalogo("familias", { ...vacio, id: FAM_LEGADA, nombre: "Antigua" }, true), {});
  igual("familia histórica NO pendiente (ya tenía categoría) sí la exige", Object.keys(validarFormularioCatalogo("familias", { ...vacio, id: FAM_A, nombre: "X" }, false)), ["categoriaId"]);
  igual("nombre solo con espacios es inválido", Object.keys(validarFormularioCatalogo("marcas", { ...vacio, nombre: "   " })), ["nombre"]);
  igual("el primer campo con error es el primero en pantalla (categoría antes que nombre)", primerCampoConError(validarFormularioCatalogo("familias", vacio)), "categoriaId");
  igual("sin errores no hay campo para enfocar", primerCampoConError({}), null);

  // ── Errores del servidor asignados al campo
  igual("duplicado de nombre → nombre", campoDeErrorServidor("marcas", "Ya existe una marca con ese nombre."), "nombre");
  igual("duplicado de código → código", campoDeErrorServidor("marcas", "Ya existe una marca con ese código."), "codigo");
  igual("categoría inválida de la familia → categoría", campoDeErrorServidor("familias", "La categoría indicada no existe en su empresa."), "categoriaId");
  igual("familia inactiva de la línea → familia", campoDeErrorServidor("lineas", "La familia está inactiva; actívela antes de usarla en una línea."), "familiaId");
  igual("conflicto con productos NO se atribuye a un campo (queda como error general visible)", campoDeErrorServidor("familias", "La familia tiene 3 producto(s) con otra categoría; reclasifíquelos antes de cambiar la categoría de la familia."), null);
  igual("error genérico → sin campo", campoDeErrorServidor("lineas", "No fue posible actualizar la línea."), null);

  // ── Cambios sin guardar
  const abierto: FormularioCatalogo = { ...vacio, id: FAM_A, codigo: "L1", nombre: "Lácteos", categoriaId: CAT_A };

  igual("formulario recién abierto: no hay cambios", formularioSucio(abierto, abierto), false);
  igual("espacios sobrantes en los extremos no cuentan como cambio", formularioSucio({ ...abierto, nombre: " Lácteos " }, abierto), false);
  igual("cambiar el nombre es un cambio", formularioSucio({ ...abierto, nombre: "Lácteos y derivados" }, abierto), true);
  igual("cambiar la categoría es un cambio", formularioSucio({ ...abierto, categoriaId: CAT_B }, abierto), true);
  igual("sin formulario abierto no hay nada que descartar", formularioSucio(null, null), false);

  // ── Coherencia en el servidor (validarReferencias), incluidas peticiones directas con ids arbitrarios
  function conexion(categoriasDeFamilia: Record<string, string | null>) {
    const reg: Array<{ sql: string; parametros: unknown[] }> = [];
    const c = {
      async query(sql: string, parametros: unknown[] = []) {
        reg.push({ sql, parametros });

        if (/SELECT categoria_id FROM familias_producto/.test(sql)) {
          const id = parametros[0] as string;

          return id in categoriasDeFamilia ? { rows: [{ categoria_id: categoriasDeFamilia[id] }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }

        if (/FROM lineas_producto/.test(sql)) return { rows: [{ familia_id: FAM_A, activo: true }], rowCount: 1 };

        return { rows: [{ activo: true, familia_id: null }], rowCount: 1 };
      },
    } as never;

    return { c, reg };
  }
  const base = { descripcion: "P", descripcionFactura: "P", unidadMedidaId: U1 };
  const validar = async (cuerpo: Record<string, unknown>, familias: Record<string, string | null>, previo: Record<string, string | null> = {}) => {
    const x = conexion(familias);
    const e = await validarReferencias(x.c, EMPRESA, normalizarProducto({ ...base, ...cuerpo }, { modo: "editar" }), previo).then(
      () => null,
      (err) => err as ErrorValidacion,
    );

    return { campo: e ? e.campo : "ok", mensaje: e ? e.message : "", reg: x.reg };
  };

  igual("familia de la categoría elegida: válido", (await validar({ categoriaId: CAT_A, familiaId: FAM_A }, { [FAM_A]: CAT_A })).campo, "ok");
  const incoherente = await validar({ categoriaId: CAT_B, familiaId: FAM_A }, { [FAM_A]: CAT_A });

  igual("familia de otra categoría: rechazada en el campo familiaId (petición directa)", [incoherente.campo, incoherente.mensaje], ["familiaId", "La familia seleccionada no pertenece a la categoría elegida."]);
  igual("familia histórica SIN categoría no bloquea (no se presume la categoría)", (await validar({ categoriaId: CAT_B, familiaId: FAM_LEGADA }, { [FAM_LEGADA]: null })).campo, "ok");
  igual("solo familia (sin categoría) o solo categoría: válido; la obligatoriedad integral sigue pendiente", [(await validar({ familiaId: FAM_A }, { [FAM_A]: CAT_A })).campo, (await validar({ categoriaId: CAT_A }, {})).campo], ["ok", "ok"]);
  igual("producto histórico incoherente que NO cambia categoría ni familia sigue editable", (await validar({ categoriaId: CAT_B, familiaId: FAM_A }, { [FAM_A]: CAT_A }, { categoria_id: CAT_B, familia_id: FAM_A })).campo, "ok");
  igual("cambiar la familia de un producto histórico sí exige coherencia", (await validar({ categoriaId: CAT_B, familiaId: FAM_A }, { [FAM_A]: CAT_A }, { categoria_id: CAT_B, familia_id: FAM_LEGADA })).campo, "familiaId");
  igual("línea de otra familia: rechazada (regla previa conservada)", (await validar({ categoriaId: CAT_A, familiaId: FAM_LEGADA, lineaId: LIN_A }, { [FAM_LEGADA]: CAT_A })).campo, "lineaId");
  const consulta = (await validar({ categoriaId: CAT_A, familiaId: FAM_A }, { [FAM_A]: CAT_A })).reg.find((q) => /SELECT categoria_id FROM familias_producto/.test(q.sql));

  cierto("la categoría de la familia se consulta por la empresa de la sesión", !!consulta && /empresa_id = \$2/.test(consulta.sql) && consulta.parametros[1] === EMPRESA);

  // ── Servidor de catálogos: categoría obligatoria en familias nuevas, sin reclasificar en silencio
  const admin = leer("lib/productos/catalogos-admin.ts");

  cierto("familia nueva: categoría obligatoria, de la empresa de la sesión y activa", /categoriaDeLaEmpresa\(c, empresaId, cuerpo\.categoriaId, true\)/.test(admin) && /Seleccione la categoría de la familia\./.test(admin) && /WHERE id = \$1 AND empresa_id = \$2`, \[id, empresaId\]/.test(admin));
  cierto("la empresa nunca sale del cuerpo en el alta de catálogos", /const empresaId = b\.session\.user\.empresaId; \/\/ nunca del cuerpo/.test(admin));
  cierto("edición: familia histórica sin categoría sigue editable; categoría ya asignada no puede quedar vacía", /pedida === actualCat/.test(admin) && /La familia ya tiene categoría; no puede quedar sin ella\./.test(admin));
  cierto("cambiar la categoría con productos en otra categoría se rechaza (409) sin reclasificar descendientes", /categoria_id IS NOT NULL AND categoria_id <> \$3/.test(admin) && /reclasifíquelos antes de cambiar la categoría de la familia/.test(admin) && !/UPDATE productos/.test(admin));
  cierto("la lista expone categoriaId/categoría en familias y la categoría de la familia en líneas", /AS "categoriaId"/.test(admin) && /AS categoria/.test(admin));
  cierto("el contador de productos conserva su SQL (total asociado, sin filtrar por activo)", /count\(\*\)::int FROM productos p WHERE p\.empresa_id = \$\{t\}\.empresa_id AND p\.\$\{c\.columnaProducto\} = \$\{t\}\.id\) AS productos/.test(admin));
  cierto("Marca no recibe categoría ni familia (independiente)", !/marcas.*categoria_id/.test(admin.replace(/categorias: \{[^}]*\}/, "")) && /marcas: \{ tabla: "marcas_producto"/.test(admin));

  // ── Migración incremental NEX-044
  const m = leer("documentacao/banco/nexit/v1/migraciones/NEX-044-familias-categoria-jerarquia.sql");
  const sql = sinComentarios(m);
  const r = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-044.sql");

  cierto("NEX-044: columna nullable (sin NOT NULL ni DEFAULT) y FK compuesta multiempresa", /ADD COLUMN categoria_id uuid,/.test(sql) && !/categoria_id uuid NOT NULL/.test(sql) && !/SET NOT NULL/.test(sql) && /FOREIGN KEY \(empresa_id, categoria_id\) REFERENCES public\.categorias_producto \(empresa_id, id\)/.test(sql));
  cierto("NEX-044: no clasifica, no actualiza ni borra datos existentes", !/\b(UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\b/.test(sql.replace(/CREATE TRIGGER[\s\S]*?;/g, "")) && !/ILIKE|LIKE '%/.test(sql));
  cierto("NEX-044: exige NEX-004/017, no se reaplica y no edita migraciones previas", /requiere NEX-004 y NEX-017/.test(m) && /NEX-044 parece aplicada/.test(m) && !/ALTER TABLE public\.(productos|lineas_producto|categorias_producto)/.test(sql));
  cierto("NEX-044: triggers de coherencia solo evalúan cuando cambia el dato (no bloquean productos históricos)", /NEW\.familia_id IS NOT DISTINCT FROM OLD\.familia_id AND NEW\.categoria_id IS NOT DISTINCT FROM OLD\.categoria_id/.test(sql) && /IF NEW\.categoria_id IS NOT DISTINCT FROM OLD\.categoria_id/.test(sql) && /v_categoria IS NOT NULL AND v_categoria <> NEW\.categoria_id/.test(sql));
  cierto("NEX-044: las consultas de los triggers filtran por empresa", /WHERE empresa_id = NEW\.empresa_id AND id = NEW\.familia_id/.test(sql) && /WHERE empresa_id = NEW\.empresa_id AND familia_id = NEW\.id/.test(sql));
  cierto("reversión NEX-044: aborta si hay familias clasificadas y retira solo lo agregado", /categoria_id IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(r) && /DROP COLUMN IF EXISTS categoria_id/.test(r) && !/DELETE FROM|UPDATE /.test(r.replace(/--.*$/gm, "")));
  cierto("migraciones en orden (…043 → 044) sin tocar las anteriores", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-04[34]/.test(f)).sort().join(",") === "NEX-043-unidades-medida-sifen-nt023.sql,NEX-044-familias-categoria-jerarquia.sql");

  // ── Informe de solo lectura
  const inf = leer("documentacao/banco/nexit/v1/scripts/informe-jerarquia-catalogos-NEX-044.sql");
  const infSql = sinComentarios(inf);

  cierto("informe: solo lectura (BEGIN READ ONLY … ROLLBACK), sin escritura", /BEGIN READ ONLY;/.test(infSql) && /ROLLBACK;/.test(infSql) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/.test(infSql));
  cierto("informe: lista familias sin categoría, productos incoherentes y dependientes, sin proponer categorías por nombre", /categoria_id IS NULL/.test(infSql) && /p\.categoria_id <> f\.categoria_id/.test(infSql) && /lineas_producto/.test(infSql) && !/CASE\s+WHEN[^;]*nombre/i.test(infSql));

  // ── Pantallas
  const pagina = leer("app/(private)/productos/catalogos/page.tsx");
  const info = leer("app/(private)/productos/_components/pestanas/informacion.tsx");

  cierto("catálogos: cambiar de pestaña, abrir otro registro, nueva y cancelar piden confirmar solo si hay cambios", (pagina.match(/confirmarDescarte\(\)/g) ?? []).length >= 4 && /return !sucio \|\| window\.confirm/.test(pagina) && /useProtegerCambios\(sucio\)/.test(pagina) && /beforeunload/.test(leer("lib/ui/proteger-cambios.ts")));
  cierto("catálogos: errores por campo con foco, aria-invalid y descripción accesible; el error del servidor no desaparece", /aria-invalid/.test(pagina) && /aria-describedby/.test(pagina) && /enfocar\(/.test(pagina) && /setErrorForm\(mensaje\)/.test(pagina) && /noValidate/.test(pagina));
  cierto("catálogos: inactivar con productos asociados (o una familia) pide confirmación y no promete efecto en cascada", /window\.confirm\(confirmar\)/.test(pagina) && /textoConfirmarInactivacion\(tipo, fila\)/.test(pagina) && /no se inactivan automáticamente/.test(leer("lib/productos/catalogos-carga.ts")));
  cierto("catálogos: contador rotulado como total asociado; las cuatro pestañas se conservan", /Productos \(total\)/.test(pagina) && ["Categorías", "Marcas", "Familias", "Líneas"].every((t) => pagina.includes(`label: "${t}"`)));
  cierto("catálogos: filtro por categoría con «sin categoría» para detectar lo pendiente y asignación manual desde la familia", /SIN_CATEGORIA/.test(pagina) && /pendiente de clasificar/.test(pagina) && /Esta familia histórica todavía no tiene categoría/.test(pagina));
  cierto("producto: selectores en cascada, familias de la categoría (más las históricas sin clasificar) y limpieza de descendientes con confirmación", /familiasVisibles/.test(info) && /f\.categoriaId === form\.categoriaId \|\| f\.categoriaId === null/.test(info) && /cambiarCategoria/.test(info) && /ctx\.set\("familiaId", ""\)/.test(info) && /ctx\.set\("lineaId", ""\)/.test(info));
  cierto("producto: el catálogo entrega categoriaId de cada familia (sin deducirla)", /categoria_id AS "categoriaId" FROM familias_producto/.test(leer("app/api/productos/route.ts")));

  return fallos;
}
