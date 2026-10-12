/**
 * Regresión PRD-REV-03/04/05/06 de Productos: documentos como archivos privados (permisos, metadatos, almacenamiento real en un
 * directorio temporal, rutas, legado por enlace, aislamiento por empresa), foto principal privada, NEX-041, pantalla y conversiones.
 * Sin base de datos: las verificaciones de SQL y de rutas son estáticas o con funciones puras.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { borrarArchivo, guardarArchivo, leerArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { contador } from "@/lib/clientes/contador-casos";
import { cerrarCargaInicial } from "@/lib/productos/cierre-carga";
import { documentoPendienteVacio, formDataDeDocumento, metadatosIso, validarPendientes } from "@/lib/productos/documento-pendiente";
import { TIPOS_DOCUMENTO_PRODUCTO, validarMetadatosDocumento } from "@/lib/productos/documentos";
import { ACCEPT_FOTO, errorDeFoto, MIME_FOTO } from "@/lib/productos/imagen";
import { validarFoto } from "@/lib/productos/imagen-servidor";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { decidirAccesoDocumento, type AccionDocumento } from "@/lib/productos/permisos-documentos";
import { EVENTO_TEXTO, TIPO_DOCUMENTO_TEXTO } from "@/lib/productos/textos";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(32, 3)]);

export async function verificarCasosDocumentosProductos(): Promise<string[]> {
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
      return e as { message: string; campo?: string | null; estado?: number };
    }
  };

  // ── Política de permisos (misma que Clientes/Proveedores, con la entidad Producto)
  const creador = { esCreador: true, cargaInicialAbierta: true };
  const decide = (a: AccionDocumento, permisos: { ver: boolean; editar: boolean; crear: boolean }, ctx: typeof creador | null) => decidirAccesoDocumento(a, permisos, ctx);
  const ver = { ver: true, editar: false, crear: false };
  const crear = { ver: true, editar: false, crear: true };
  const editar = { ver: true, editar: true, crear: true };

  igual("descargar la versión vigente exige PRODUCTOS.VER", [decide("DESCARGAR", ver, null).permitido, decide("DESCARGAR", { ver: false, editar: true, crear: true }, null).permitido], [true, false]);
  igual("EDITAR puede todo (cargar, reemplazar, editar datos, eliminar, restaurar, historial, recuperar)", (["CARGAR", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION", "FINALIZAR_CARGA"] as AccionDocumento[]).every((a) => decide(a, editar, null).permitido), true);
  igual("CREAR del creador con la carga inicial abierta puede cargar y finalizar", [decide("CARGAR", crear, creador).permitido, decide("FINALIZAR_CARGA", crear, creador).permitido], [true, true]);
  igual("CREAR de otro usuario no carga (aunque esté abierta)", decide("CARGAR", crear, { esCreador: false, cargaInicialAbierta: true }).permitido, false);
  igual("CREAR del creador con la carga cerrada no carga", decide("CARGAR", crear, { esCreador: true, cargaInicialAbierta: false }).permitido, false);
  igual("CREAR nunca reemplaza, edita, elimina, restaura ni ve historial", (["REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION"] as AccionDocumento[]).every((a) => !decide(a, crear, creador).permitido), true);
  igual("solo VER no carga ni modifica nada", (["CARGAR", "ELIMINAR", "EDITAR_DATOS"] as AccionDocumento[]).every((a) => !decide(a, ver, creador).permitido), true);
  const negado = decide("CARGAR", crear, { esCreador: false, cargaInicialAbierta: true });

  cierto("el mensaje de denegación habla de PRODUCTOS (no de proveedores)", !negado.permitido && /producto/i.test(negado.mensaje) && !/proveedor/i.test(negado.mensaje));
  cierto("sin contexto (producto de otra empresa) CREAR no carga", !decide("CARGAR", crear, null).permitido);

  // ── Metadatos
  igual("tipos de documento de Productos", [...TIPOS_DOCUMENTO_PRODUCTO], ["FICHA_TECNICA", "HOJA_SEGURIDAD", "CERTIFICADO", "IMAGEN", "OTRO"]);
  igual("sin tipo → OTRO", validarMetadatosDocumento({}).tipo, "OTRO");
  igual("tipo de Proveedores no es válido en Productos", lanza(() => validarMetadatosDocumento({ tipo: "CONTRATO" }))?.campo, "tipo");
  igual("fechas ISO válidas", validarMetadatosDocumento({ tipo: "ficha_tecnica", fechaEmision: "2026-03-05", fechaVencimiento: "2026-12-31" }), { tipo: "FICHA_TECNICA", fechaEmision: "2026-03-05", fechaVencimiento: "2026-12-31", observacion: null });
  igual("fecha inexistente rechazada", lanza(() => validarMetadatosDocumento({ fechaEmision: "2026-02-31" }))?.campo, "fechaEmision");
  igual("vencimiento anterior a la emisión rechazado", lanza(() => validarMetadatosDocumento({ fechaEmision: "2026-03-05", fechaVencimiento: "2026-03-04" }))?.campo, "fechaVencimiento");
  igual("observación de 1001 caracteres rechazada (no se trunca)", lanza(() => validarMetadatosDocumento({ observacion: "x".repeat(1001) }))?.campo, "observacion");

  // ── Alta: documentos adjuntos antes de existir el producto (se cargan después de crearlo)
  const vacio = documentoPendienteVacio();

  igual("documento adjunto sin archivo rechazado", lanza(() => validarPendientes([vacio]))?.campo, "documentos.0.archivo");
  igual("archivo con extensión no permitida rechazado", lanza(() => validarPendientes([{ ...vacio, archivo: new File(["x"], "virus.exe") }]))?.campo, "documentos.0.archivo");
  igual("fecha dd/mm/aaaa inexistente rechazada", lanza(() => metadatosIso({ ...vacio, fechaEmision: "31/02/2026" }, 0))?.campo, "documentos.0.fechaEmision");
  igual("fechas dd/mm/aaaa → ISO", metadatosIso({ ...vacio, tipo: "FICHA_TECNICA", fechaEmision: "05/03/2026", fechaVencimiento: "06/03/2026" }, 0).fechaEmision, "2026-03-05");
  const datos = formDataDeDocumento({ ...vacio, tipo: "CERTIFICADO", archivo: new File(["%PDF"], "c.pdf"), fechaEmision: "05/03/2026" }, 0);

  igual("el formulario multipart lleva archivo, tipo y fechas ISO", [datos.get("tipo"), datos.get("fechaEmision"), (datos.get("archivo") as File).name], ["CERTIFICADO", "2026-03-05", "c.pdf"]);
  igual("sin adjuntos el alta no exige nada", lanza(() => validarPendientes([])), null);

  // ── Almacenamiento privado real (directorio temporal) con el ámbito «productos»
  const dir = mkdtempSync(join(tmpdir(), "nexit-archivos-"));
  const anterior = process.env.NEXIT_ARCHIVOS_DIR;

  process.env.NEXIT_ARCHIVOS_DIR = dir;

  try {
    const clave = nuevaClave(EMPRESA, PROD, "productos");

    cierto("clave interna <empresa>/productos/<producto>/<uuid>", new RegExp(`^${EMPRESA}/productos/${PROD}/[0-9a-f-]{36}$`).test(clave));
    const validado = validarArchivo("Ficha técnica.pdf", PDF);

    await guardarArchivo(clave, validado.buffer);
    igual("el archivo se guarda y se lee íntegro (sha256 coincide)", (await leerArchivo(clave)).equals(PDF), true);
    cierto("el nombre del usuario nunca forma parte de la ruta", !clave.includes("Ficha") && readdirSync(join(dir, EMPRESA, "productos", PROD)).length === 1);
    igual("claves de otros ámbitos no se mezclan", lanza(() => nuevaClave("no-uuid", PROD, "productos"))?.message, "Identificador no válido.");
    igual("una clave con traversal es rechazada", await leerArchivo(`${EMPRESA}/productos/${PROD}/../../x`).then(() => "leyo", (e: Error) => e.message), "Clave de archivo no válida.");
    await borrarArchivo(clave);
    igual("solo se borra el archivo no registrado cuando se pide (compensación)", await leerArchivo(clave).then(() => "leyo", (e: { estado?: number }) => e.estado), 404);
  } finally {
    if (anterior === undefined) delete process.env.NEXIT_ARCHIVOS_DIR;
    else process.env.NEXIT_ARCHIVOS_DIR = anterior;
    rmSync(dir, { recursive: true, force: true });
  }

  // ── Foto principal (PRD-REV-04): solo PNG/JPG, mismas reglas de firma y tamaño
  igual("foto PNG válida", validarFoto("foto.png", PNG).mime, "image/png");
  igual("foto JPG válida", validarFoto("foto.JPG", JPG).mime, "image/jpeg");
  igual("foto .jpeg válida", validarFoto("foto.jpeg", JPG).mime, "image/jpeg");
  igual("un PDF no es una foto", lanza(() => validarFoto("foto.pdf", PDF))?.message, "La foto debe ser .png, .jpg, .jpeg.");
  igual("un PNG con contenido falso es rechazado (firma)", /no corresponde/.test(lanza(() => validarFoto("falso.png", JPG))?.message ?? ""), true);
  igual("foto vacía rechazada", lanza(() => validarFoto("x.png", Buffer.alloc(0)))?.message, "El archivo está vacío.");
  igual("foto de más de 10 MB rechazada", lanza(() => validarFoto("x.png", Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)])))?.estado, 413);
  igual("previa en el navegador: extensión y tamaño", [errorDeFoto("a.png", 10, 1000), errorDeFoto("a.docx", 10, 1000), errorDeFoto("a.png", 0, 1000), errorDeFoto("a.png", 2000, 1000)?.startsWith("El archivo supera")], [null, "La foto debe ser .png, .jpg, .jpeg.", "El archivo está vacío.", true]);
  igual("la foto acepta exactamente imágenes", [[...MIME_FOTO], ACCEPT_FOTO], [["image/png", "image/jpeg"], ".png,.jpg,.jpeg"]);

  // ── Textos de auditoría
  cierto("textos para los tipos y eventos de documentos y foto", ["FICHA_TECNICA", "HOJA_SEGURIDAD", "CERTIFICADO", "IMAGEN", "OTRO"].every((t) => TIPO_DOCUMENTO_TEXTO[t]) && ["DOC_CARGA", "DOC_REEMPLAZO", "DOC_EDICION", "DOC_ELIMINACION", "DOC_RESTAURACION", "DOC_RECUPERACION", "FOTO_ACTUALIZADA", "FOTO_ELIMINADA"].every((e) => EVENTO_TEXTO[e]));

  // ── Rutas: autorización, aislamiento por empresa, sin borrado físico, transacción y compensación
  const base = "app/api/productos/[id]/documentos";
  const rutas = [`${base}/route.ts`, `${base}/[docId]/route.ts`, `${base}/[docId]/restaurar/route.ts`, `${base}/[docId]/versiones/route.ts`, `${base}/[docId]/versiones/[version]/recuperar/route.ts`, `${base}/finalizar/route.ts`, "app/api/productos/[id]/imagen/route.ts"];

  for (const r of rutas) {
    const codigo = leer(r);

    cierto(`${r.replace("app/api/productos/[id]/", "")}: exige sesión y permisos de PRODUCTOS antes de operar`, /autorizarProductos\(\)/.test(codigo) && /"respuesta" in auth/.test(codigo));
    cierto(`${r.replace("app/api/productos/[id]/", "")}: la empresa sale de la sesión, nunca del cuerpo`, /auth\.sesion\.user\.empresaId/.test(codigo) && !/formulario\.get\("empresa/.test(codigo));
    cierto(`${r.replace("app/api/productos/[id]/", "")}: sin eliminación física de documentos ni de archivos registrados`, !/DELETE FROM producto_documentos|DELETE FROM producto_documento_versiones/.test(codigo));
  }

  const todas = rutas.map(leer).join("\n");
  const sentencias = [...todas.matchAll(/(?:FROM|UPDATE|INTO)\s+(producto_documentos|producto_documento_versiones|productos|producto_eventos)\b[\s\S]*?(?:`|")/g)].map((m) => m[0]);

  cierto("toda consulta de documentos, versiones, productos y eventos filtra por empresa_id", sentencias.length >= 10 && sentencias.every((s) => /empresa_id/.test(s)));

  const alta = leer(`${base}/route.ts`);

  cierto("carga de documento: archivo + versión 1 + evento en UNA transacción, bajo bloqueo del producto", /conTransaccion/.test(alta) && /bloquearContextoCargaInicial\(/.test(alta) && /INSERT INTO producto_documento_versiones/.test(alta) && /accion: "DOC_CARGA"/.test(alta));
  cierto("carga de documento: permisos revalidados dentro de la transacción", /decidirAccesoDocumento\("CARGAR", auth\.permisos, bloqueado\)/.test(alta));
  cierto("carga de documento: solo se borra el archivo nuevo que nunca se registró", /if \(clave && !registrado\) await borrarArchivo/.test(alta) && /nuevaClave\(empresaId, id, "productos"\)/.test(alta));
  cierto("listado de eliminados solo con permiso de historial", /exigir\("VER_HISTORIAL"/.test(alta));

  const doc = leer(`${base}/[docId]/route.ts`);

  cierto("reemplazo = nueva versión (la anterior queda en el historial) y limpia el enlace anterior", /INSERT INTO producto_documento_versiones/.test(doc) && /url_archivo = NULL/.test(doc) && /accion: "DOC_REEMPLAZO"/.test(doc));
  cierto("documento sin historial (enlace/legado) incorpora su versión actual al historial al reemplazarse", /Documento anterior sin historial/.test(doc));
  cierto("eliminar es lógico (eliminado_at/por) y se audita", /SET eliminado_at = now\(\), eliminado_por/.test(doc) && /accion: "DOC_ELIMINACION"/.test(doc));
  cierto("descargar versiones anteriores o documentos eliminados exige historial", /exigir\("VER_HISTORIAL"/.test(doc) && /Cache-Control": "private, no-store"/.test(doc) && /nosniff/.test(doc));
  cierto("documento con enlace anterior responde 404 claro en la descarga (no inventa archivo)", /enlace anterior \(sin archivo almacenado\)/.test(doc));
  cierto("documentos eliminados no se pueden modificar sin restaurarlos", /El documento está eliminado: restáurelo antes de modificarlo/.test(doc));

  const fin = leer(`${base}/finalizar/route.ts`);

  cierto("finalizar cierra la carga inicial del producto de la empresa", /UPDATE productos SET carga_documentos_inicial_abierta = false WHERE id = \$1 AND empresa_id = \$2/.test(fin));

  const ficha = leer("app/api/productos/[id]/route.ts");
  const post = leer("app/api/productos/route.ts");

  cierto("el alta del producto abre la carga inicial; la primera edición la cierra", /"carga_documentos_inicial_abierta", \.\.\./.test(post) && /true, \.\.\.columnas/.test(post) && /sets\.push\("carga_documentos_inicial_abierta = false"\)/.test(ficha));
  cierto("la ficha lista solo documentos no eliminados y distingue archivo de enlace anterior (legado visible)", /eliminado_at IS NULL/.test(ficha) && /\(almacen_clave IS NOT NULL\) AS "tieneArchivo"/.test(ficha) && /coalesce\(url_archivo,''\) AS "urlArchivo"/.test(ficha));
  cierto("la ficha informa permisos de documentos, creador y foto privada", /permisosDocumentos:/.test(ficha) && /"esCreador"/.test(ficha) && /"imagenPrivada"/.test(ficha));
  cierto("la sincronización de la ficha (PUT) ya no toca producto_documentos: no puede destruir archivos ni versiones", !/producto_documentos/.test(leer("lib/productos/sincronizar.ts")) && !/producto_documentos/.test(ficha.replace(/FROM producto_documentos[\s\S]*?ORDER BY creado_at, id/, "")));
  igual("el normalizador no persiste documentos enviados con la ficha", Object.prototype.hasOwnProperty.call(normalizarProducto({ descripcion: "P", descripcionFactura: "P", unidadMedidaId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", documentos: [{ tipo: "OTRO" }] }), "documentos"), false);

  const imagen = leer("app/api/productos/[id]/imagen/route.ts");

  cierto("foto: GET inline con nosniff y sin caché; POST con permiso, firma y compensación; DELETE conserva el archivo", /"Content-Disposition": "inline"/.test(imagen) && /nosniff/.test(imagen) && /private, no-store/.test(imagen) && /validarFoto\(archivo\.name/.test(imagen) && /archivoConservado: true/.test(imagen));
  cierto("foto: cada cambio queda en la auditoría y el archivo anterior nunca se borra", /accion: "FOTO_ACTUALIZADA"/.test(imagen) && /accion: "FOTO_ELIMINADA"/.test(imagen) && !/borrarArchivo\([^)]*anterior/.test(imagen));
  cierto("foto: el enlace anterior (imagen_url) no se toca", !/imagen_url/.test(sinComentarios(imagen)));

  // ── NEX-041
  const n41 = leer("documentacao/banco/nexit/v1/migraciones/NEX-041-productos-documentos-archivos-imagen.sql");
  const sql41 = sinComentarios(n41);

  cierto("NEX-041: los enlaces anteriores se conservan (url_archivo deja de ser obligatorio; cada documento tiene archivo o enlace)", /ALTER COLUMN url_archivo DROP NOT NULL/.test(sql41) && /url_archivo IS NOT NULL OR almacen_clave IS NOT NULL/.test(sql41));
  cierto("NEX-041: no modifica ni borra filas existentes", !/UPDATE public\.(producto_documentos|productos)\s+SET/.test(sql41) && !/DELETE FROM/.test(sql41) && !/DROP COLUMN|DROP TABLE/.test(sql41));
  cierto("NEX-041: versiones con FK compuesta por empresa y clave única; sin duplicar versiones", /FOREIGN KEY \(empresa_id, documento_id\) REFERENCES public\.producto_documentos \(empresa_id, id\)/.test(sql41) && /FOREIGN KEY \(empresa_id, producto_id\) REFERENCES public\.productos \(empresa_id, id\)/.test(sql41) && /UNIQUE \(documento_id, version\)/.test(sql41) && /UNIQUE \(almacen_clave\)/.test(sql41));
  cierto("NEX-041: los productos existentes quedan con la carga inicial CERRADA y sin foto privada", /carga_documentos_inicial_abierta boolean NOT NULL DEFAULT false/.test(sql41) && /imagen_clave IS NULL AND imagen_nombre IS NULL/.test(sql41));
  cierto("NEX-041: la foto privada no reemplaza imagen_url", !/DROP COLUMN imagen_url|UPDATE[^;]*imagen_url|ALTER COLUMN imagen_url/.test(sql41) && /imagen_mime IN \('image\/png', 'image\/jpeg'\)/.test(sql41));
  cierto("NEX-041: auditoría solo altas (UPDATE/DELETE/TRUNCATE bloqueados)", /producto_eventos es de solo altas: no se modifica/.test(sql41) && /no se elimina/.test(sql41) && /no se vacía/.test(sql41) && /BEFORE TRUNCATE ON public\.producto_eventos/.test(sql41));
  cierto("NEX-041: grants resistentes a la reaplicación (eventos y versiones SELECT+INSERT, sin DELETE en documentos)", /GRANT SELECT, INSERT ON public\.producto_eventos TO nexit_runtime/.test(sql41) && /GRANT SELECT, INSERT ON public\.producto_documento_versiones TO nexit_runtime/.test(sql41) && /REVOKE DELETE ON public\.producto_documentos FROM nexit_runtime/.test(sql41));
  cierto("NEX-041: el envoltorio de grants conserva base + proveedores + fiscal y agrega productos", /nex_aplicar_grants_runtime_base\(\);\s*PERFORM public\.nex_aplicar_grants_proveedores\(\);\s*PERFORM public\.nex_aplicar_grants_fiscal\(\);\s*PERFORM public\.nex_aplicar_grants_productos\(\);/.test(sql41) && /SELECT public\.nex_aplicar_grants_productos\(\);\s*$/.test(sql41.trim()));
  cierto("NEX-041: pre-condiciones (NEX-007/037/039) y no se reaplica por suposición", /requiere NEX-007/.test(n41) && /requiere NEX-037 y NEX-039/.test(n41) && /parece aplicada/.test(n41));
  const r41 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-041.sql");

  cierto("reversión NEX-041: aborta si hay archivos, versiones, fotos o auditoría y restaura el envoltorio de NEX-039", /almacen_clave IS NOT NULL OR eliminado_at IS NOT NULL OR url_archivo IS NULL\) THEN\s+RAISE EXCEPTION/.test(r41) && /producto_documento_versiones\) THEN\s+RAISE EXCEPTION/.test(r41) && /imagen_clave IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(r41) && /producto_eventos\) THEN\s+RAISE EXCEPTION/.test(r41) && /nex_aplicar_grants_fiscal\(\);\s*END \$\$;\s*DROP FUNCTION IF EXISTS public\.nex_aplicar_grants_productos/.test(r41));
  cierto("la migración y la reversión no editan migraciones previas y siguen en orden (…040 → 041 → 042)", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-04/.test(f)).sort().join(",") === "NEX-040-productos-clasificacion-iva.sql,NEX-041-productos-documentos-archivos-imagen.sql,NEX-042-productos-imagen-versiones.sql,NEX-043-unidades-medida-sifen-nt023.sql");

  // ── Pantalla: mismo patrón que Clientes/Proveedores, sin pantalla nueva, con «Agregar», legado visible
  const ui = leer("app/(private)/productos/_components/pestanas/documentos.tsx");

  cierto("Documentos: usa las rutas de archivos privados de Productos, versiones, historial, restauración y eliminados", /\/api\/productos\/\$\{productoId\}\/documentos/.test(ui) && /versiones\/\$\{version\}\/recuperar/.test(ui) && /restaurar/.test(ui) && /eliminados=1/.test(ui));
  cierto("Documentos: conserva el botón «+ Agregar documento» y la ficha existente (misma pestaña)", /\+ Agregar documento/.test(ui) && !/urlArchivo[^\n]*onChange/.test(ui.replace(/href=[^\n]*urlArchivo[^\n]*/g, "")));
  cierto("Documentos: el documento anterior por enlace se sigue viendo y puede pasar a archivo", /enlace anterior/.test(ui) && /edite el documento para cargar el archivo/.test(ui));
  cierto("Documentos: las acciones dependen de los permisos informados por el servidor", /permisos\.cargar/.test(ui) && /permisos\.gestionar/.test(ui) && /permisos\.historial/.test(ui));
  const form = leer("app/(private)/productos/_components/producto-form.tsx");

  cierto("las siete pestañas se conservan", ["Información", "SIFEN y códigos", "Inventario", "Compras", "Logística", "Alternativos y kits", "Documentos"].every((t) => form.includes(`etiqueta: "${t}"`)));
  for (const [archivo, boton] of [["sifen", "Agregar código"], ["inventario", "Agregar depósito"], ["compras", "Agregar presentación"], ["compras", "Agregar proveedor"], ["kit", "Agregar alternativo"], ["kit", "Agregar componente"]]) {
    cierto(`el botón «${boton}» se conserva`, leer(`app/(private)/productos/_components/pestanas/${archivo}.tsx`).includes(`boton="${boton}"`));
  }
  const info = leer("app/(private)/productos/_components/pestanas/informacion.tsx");

  cierto("datos informativos como texto (Dato), no como input de solo lectura", /<Dato etiqueta="Valor venta referencia"/.test(info) && !/readOnly/.test(info) && !leer("app/(private)/productos/_components/pestanas/sifen.tsx").includes("readOnly") && !leer("app/(private)/productos/_components/pestanas/inventario.tsx").includes("readOnly"));
  cierto("Información agrupa por subtítulos y presenta la foto sin eliminar el enlace anterior", ["Identificación", "Clasificación", "Foto del producto", "Disponibilidad"].every((t) => info.includes(`<SubTitulo>${t}</SubTitulo>`)) && /Enlace de imagen anterior/.test(info));
  cierto("Inventario separa parámetros, apertura e indicadores de solo lectura", ["Parámetros de stock", "Indicadores operacionales (solo lectura)"].every((t) => leer("app/(private)/productos/_components/pestanas/inventario.tsx").includes(t)));
  cierto("Logística separa características físicas de merma y quiebra", ["Características físicas", "Merma y quiebra"].every((t) => leer("app/(private)/productos/_components/pestanas/logistica.tsx").includes(t)));
  const css = leer("app/(private)/productos/_components/producto-form.module.css");

  cierto("el pie fijo no tapa el último campo (el contenido deja espacio inferior)", /\.footer\s*\{[^}]*position: sticky/.test(css) && (/\.content\s*\{[^}]*padding[^}]*\}/.test(css) || /\.card\s*\{/.test(css)));

  // ── PRD-REV-06: unidades comerciales, presentaciones y factores (sin conversiones inventadas)
  const compras = leer("app/(private)/productos/_components/pestanas/compras.tsx");
  const pres = (nombre: string, factor: string) => ({ descripcion: "P", descripcionFactura: "P", unidadMedidaId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", unidades: [{ unidadMedidaId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", nombrePresentacion: nombre, factorConversion: factor }] });

  igual("«Caja» o «Docena» sin factor se rechazan: nada se deduce del nombre", [lanza(() => normalizarProducto(pres("Caja", "")))?.campo, lanza(() => normalizarProducto(pres("Docena", "")))?.campo], ["unidades.0.factorConversion", "unidades.0.factorConversion"]);
  igual("el factor informado se conserva tal cual (Docena con factor 1 sigue siendo 1)", normalizarProducto(pres("Docena", "1")).unidades[0].factorConversion, "1.000000");
  igual("factor 12 informado explícitamente se conserva exacto", normalizarProducto(pres("Caja x12", "12")).unidades[0].factorConversion, "12.000000");
  cierto("la pantalla no calcula ni asigna factores a partir de la unidad o del nombre", !/factorConversion:\s*(?!"1")[^,}]*(sifen|unidad|nombre)/i.test(compras) && /no lo deduce del nombre ni de la unidad/.test(compras));
  cierto("aviso (no bloqueante) si una presentación «unidad base» no usa la unidad base con factor 1", /Revise: una presentación marcada como unidad base/.test(compras) && /role="status"/.test(compras));
  const rec = leer("documentacao/banco/nexit/v1/scripts/reconciliar-unidades-sifen-NEX-039.sql");

  cierto("vincular Caja/Docena a la Tabla 5 no toca presentaciones ni factores", !/producto_unidades|factor_conversion/i.test(sinComentarios(rec)) && /Vincular NO crea conversiones/.test(rec));


  // ── PRD-AUD-07: el cierre de la carga inicial verifica la respuesta HTTP
  const respuesta = (estado: number, cuerpo: string) => async () => new Response(cuerpo, { status: estado });
  const cerrado = await cerrarCargaInicial(PROD, respuesta(200, '{"ok":true}'));
  const prohibido = await cerrarCargaInicial(PROD, respuesta(403, '{"error":"Sin permiso."}'));
  const ausente = await cerrarCargaInicial(PROD, respuesta(404, '{"error":"Producto no encontrado."}'));
  const caido = await cerrarCargaInicial(PROD, respuesta(500, "<html>boom</html>"));
  const sinRed = await cerrarCargaInicial(PROD, async () => {
    throw new TypeError("fetch failed");
  });
  let urlLlamada = "";
  let metodoLlamado = "";

  await cerrarCargaInicial(PROD, async (u, i) => {
    urlLlamada = u;
    metodoLlamado = String(i?.method);

    return new Response("{}", { status: 200 });
  });
  igual("cierre 200 → cerrada", cerrado, { cerrada: true });
  igual("cierre 403 → no cerrada, con estado y mensaje del servidor", prohibido, { cerrada: false, estado: 403, mensaje: "Sin permiso." });
  igual("cierre 404 → no cerrada", [ausente.cerrada, (ausente as { estado: number | null }).estado], [false, 404]);
  igual("cierre 500 con cuerpo no JSON → no cerrada con mensaje genérico", caido, { cerrada: false, estado: 500, mensaje: "No fue posible cerrar la carga inicial de archivos." });
  igual("cierre con error de red → no cerrada, sin estado", [sinRed.cerrada, (sinRed as { estado: number | null }).estado], [false, null]);
  igual("el cierre llama solo a …/documentos/finalizar por POST con el id del producto", [urlLlamada, metodoLlamado], [`/api/productos/${PROD}/documentos/finalizar`, "POST"]);

  const nuevaPagina = leer("app/(private)/productos/nuevo/page.tsx");
  const fichaPagina = leer("app/(private)/productos/[id]/page.tsx");
  const finalizarRuta = leer("app/api/productos/[id]/documentos/finalizar/route.ts");

  cierto("alta: ya no se ignora la respuesta del cierre; usa cerrarCargaInicial y, si falla, abre la ficha del producto creado", /await cerrarCargaInicial\(id\)/.test(nuevaPagina) && /cierre\.cerrada/.test(nuevaPagina) && /aviso=cierre/.test(nuevaPagina) && !/documentos\/finalizar/.test(nuevaPagina));
  cierto("alta: el producto se crea una sola vez (un único POST /api/productos) y el id se conserva", (nuevaPagina.match(/fetch\("\/api\/productos"/g) ?? []).length === 1);
  cierto("ficha: ofrece «Reintentar cierre» solo mientras la carga siga abierta y no vuelve a crear el producto", /reintentarCierre/.test(fichaPagina) && /producto\.cargaDocumentosInicialAbierta/.test(fichaPagina) && !/fetch\("\/api\/productos"/.test(fichaPagina));
  cierto("el servidor mantiene la política: FINALIZAR_CARGA (creador con CREAR solo con la carga abierta) y nunca reabre la ventana", /FINALIZAR_CARGA/.test(finalizarRuta) && !/carga_documentos_inicial_abierta = true/.test(finalizarRuta));

  // ── PRD-AUD-08: historial privado de fotos (NEX-042)
  const n42 = leer("documentacao/banco/nexit/v1/migraciones/NEX-042-productos-imagen-versiones.sql");
  const sql42 = sinComentarios(n42);
  const r42 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-042.sql");
  const imagenRuta = leer("app/api/productos/[id]/imagen/route.ts");
  const dirVersiones = "app/api/productos/[id]/imagen/versiones";
  const histRuta = leer(`${dirVersiones}/route.ts`);
  const verRuta = leer(`${dirVersiones}/[version]/route.ts`);
  const recRuta = leer(`${dirVersiones}/[version]/recuperar/route.ts`);
  const rutasFoto = imagenRuta + histRuta + verRuta + recRuta;

  cierto("NEX-042: exige NEX-041, no se reaplica y no altera tablas existentes", /imagen_clave/.test(sql42) && /nex_aplicar_grants_productos/.test(sql42) && /NEX-042 parece aplicada/.test(n42) && !/ALTER TABLE/.test(sql42));
  cierto("NEX-042: tabla por empresa y producto (FK compuestas), clave única, versión única, solo PNG/JPG", /FOREIGN KEY \(empresa_id, producto_id\) REFERENCES public\.productos \(empresa_id, id\)/.test(sql42) && /UNIQUE \(almacen_clave\)/.test(sql42) && /UNIQUE \(empresa_id, producto_id, version\)/.test(sql42) && /tipo_mime IN \('image\/png', 'image\/jpeg'\)/.test(sql42));
  cierto("NEX-042: solo altas (triggers) y el rol de la aplicación solo recibe SELECT/INSERT", /BEFORE UPDATE OR DELETE ON public\.producto_imagen_versiones/.test(sql42) && /BEFORE TRUNCATE ON public\.producto_imagen_versiones/.test(sql42) && /GRANT SELECT, INSERT ON public\.producto_imagen_versiones TO nexit_runtime/.test(sql42) && !/GRANT[^;]*(UPDATE|DELETE)[^;]*producto_imagen_versiones/.test(sql42));
  cierto("NEX-042: las fotos vigentes de NEX-041 pasan a versión 1 sin mover archivos; imagen_url no se toca", /INSERT INTO public\.producto_imagen_versiones[\s\S]*FROM public\.productos p\s+WHERE p\.imagen_clave IS NOT NULL/.test(sql42) && !/imagen_url/.test(sql42));
  cierto("NEX-042: conserva el envoltorio de grants (solo amplía nex_aplicar_grants_productos) y no borra datos", !/nex_aplicar_grants_runtime\(\)/.test(sql42) && !/\bDROP (TABLE|COLUMN)|DELETE FROM|TRUNCATE TABLE|UPDATE public/.test(sql42));
  cierto("reversión NEX-042: aborta si hay versiones y restaura los grants de NEX-041 sin la tabla nueva", /producto_imagen_versiones\) THEN\s+RAISE EXCEPTION/.test(r42) && /REVOKE ALL ON public\.producto_eventos, public\.producto_documento_versiones FROM nexit_runtime/.test(r42) && !/GRANT[^;]*producto_imagen_versiones/.test(r42));
  cierto("las migraciones nuevas siguen en orden (…040 → 041 → 042)", readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-04/.test(f)).sort().join(",") === "NEX-040-productos-clasificacion-iva.sql,NEX-041-productos-documentos-archivos-imagen.sql,NEX-042-productos-imagen-versiones.sql,NEX-043-unidades-medida-sifen-nt023.sql");
  cierto("foto: cada carga registra su versión (clave, empresa y producto) en la MISMA transacción que el cambio de la foto vigente", /INSERT INTO producto_imagen_versiones/.test(imagenRuta) && /conTransaccion/.test(imagenRuta) && /entidadId: nueva\.rows\[0\]\.id/.test(imagenRuta));
  cierto("foto: A→B→quitar conserva A y B: nunca se borra un archivo registrado ni se modifica el historial", !/borrarArchivo\([^)]*(anterior|imagen_clave)/.test(imagenRuta) && /accion: "FOTO_ELIMINADA"/.test(imagenRuta) && !/DELETE FROM producto_imagen_versiones|UPDATE producto_imagen_versiones/.test(rutasFoto));
  cierto("historial/descarga/recuperación: permisos de historial y de recuperación, siempre por empresa de la sesión y sin caché", /exigir\("VER_HISTORIAL"/.test(histRuta) && /exigir\("VER_HISTORIAL"/.test(verRuta) && /exigir\("RECUPERAR_VERSION"/.test(recRuta) && [histRuta, verRuta, recRuta].every((t) => /empresa_id = \$2|empresaId/.test(t)) && /private, no-store/.test(verRuta) && /nosniff/.test(verRuta));
  cierto("la clave de almacenamiento nunca se devuelve en el historial ni se guarda en los eventos", !/almacenClave|almacen_clave:/.test(histRuta) && !/(anterior|nuevo): \{[^}]*(clave|almacen)/i.test(imagenRuta + recRuta));
  cierto("recuperar deja UNA sola vigente (productos.imagen_*), audita FOTO_RECUPERADA y no toca imagen_url", /UPDATE productos SET imagen_clave/.test(recRuta) && /accion: "FOTO_RECUPERADA"/.test(recRuta) && !/imagen_url/.test(sinComentarios(rutasFoto)));
  cierto("la auditoría tiene texto para la foto recuperada", typeof EVENTO_TEXTO["FOTO_RECUPERADA"] === "string");

  return fallos;
}
