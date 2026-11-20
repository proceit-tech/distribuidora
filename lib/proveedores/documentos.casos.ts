/**
 * Casos de regresión de Proveedores — Marco E: documentos privados (permisos, versiones, exclusión lógica, sin borrado físico),
 * certificados de retención (DEC-PRV-08) y migración NEX-036. Lógica pura + verificaciones estáticas del código versionado.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { nuevaClave } from "@/lib/almacenamiento/archivos-privados";
import { contador } from "@/lib/clientes/contador-casos";
import { certificadoValido, validarMetadatosDocumento } from "@/lib/proveedores/documentos";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import { decidirAccesoDocumento, type AccionDocumento, type ContextoCargaInicial, type PermisosDocumentos } from "@/lib/proveedores/permisos-documentos";
import { documentoPendienteVacio, metadatosIso, validarPendientes } from "@/lib/proveedores/documento-pendiente";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROV = "22222222-2222-4222-8222-222222222222";
const CERT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const P = (ver: boolean, editar: boolean, crear: boolean): PermisosDocumentos => ({ ver, editar, crear });
const CTX = (esCreador: boolean, cargaInicialAbierta: boolean): ContextoCargaInicial => ({ esCreador, cargaInicialAbierta });

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);

    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

export function verificarCasosDocumentosProveedores(): string[] {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const permitido = (a: AccionDocumento, p: PermisosDocumentos, c: ContextoCargaInicial | null) => decidirAccesoDocumento(a, p, c).permitido;
  const error = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (e) {
      return e instanceof ErrorValidacion ? e : null;
    }
  };

  // ── Permisos (misma política aprobada que Clientes, con PROVEEDORES.*)
  const soloCrear = P(false, false, true);

  for (const a of ["CARGAR", "FINALIZAR_CARGA"] as const) {
    cierto(`CREAR: ${a} creador con carga abierta`, permitido(a, soloCrear, CTX(true, true)));
    // El cierre (FINALIZAR_CARGA) es idempotente para el creador (PRV-R01-03); cargar documentos tras el cierre sigue prohibido.
    cierto(`CREAR: ${a} creador con carga CERRADA`, a === "FINALIZAR_CARGA" ? permitido(a, soloCrear, CTX(true, false)) : !permitido(a, soloCrear, CTX(true, false)));
    cierto(`CREAR: ${a} otro usuario`, !permitido(a, soloCrear, CTX(false, true)));
    cierto(`CREAR: ${a} proveedor inexistente/otra empresa`, !permitido(a, soloCrear, null));
    cierto(`EDITAR: ${a} siempre`, permitido(a, P(true, true, false), CTX(false, false)));
  }
  for (const a of ["REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION"] as const) {
    cierto(`CREAR nunca basta para ${a}`, !permitido(a, soloCrear, CTX(true, true)));
    cierto(`VER no basta para ${a}`, !permitido(a, P(true, false, false), CTX(true, true)));
    cierto(`EDITAR permite ${a}`, permitido(a, P(true, true, false), null));
  }
  cierto("descargar con VER", permitido("DESCARGAR", P(true, false, false), null));
  cierto("descargar sin VER", !permitido("DESCARGAR", P(false, true, true), null));
  cierto("sin permisos nada", !["CARGAR", "ELIMINAR", "FINALIZAR_CARGA"].some((a) => permitido(a as AccionDocumento, P(false, false, false), CTX(true, true))));

  // ── Metadatos (fechas ISO en la API)
  const m = validarMetadatosDocumento({ tipo: "contrato", fechaEmision: "2026-01-10", fechaVencimiento: "2027-01-10", observacion: "  vigente " });

  igual("metadatos: normalización", [m.tipo, m.fechaEmision, m.fechaVencimiento, m.observacion], ["CONTRATO", "2026-01-10", "2027-01-10", "vigente"]);
  igual("metadatos: tipo por defecto", validarMetadatosDocumento({}).tipo, "OTRO");
  igual("metadatos: tipo inválido", error(() => validarMetadatosDocumento({ tipo: "FACTURA" }))?.campo, "tipo");
  igual("metadatos: fecha irreal", error(() => validarMetadatosDocumento({ fechaEmision: "2026-02-30" }))?.campo, "fechaEmision");
  igual("metadatos: vencimiento antes de emisión", error(() => validarMetadatosDocumento({ fechaEmision: "2026-05-02", fechaVencimiento: "2026-05-01" }))?.campo, "fechaVencimiento");
  igual("metadatos: observación > 1000", error(() => validarMetadatosDocumento({ observacion: "x".repeat(1001) }))?.campo, "observacion");
  igual("metadatos: observación de 1000", validarMetadatosDocumento({ observacion: "x".repeat(1000) }).observacion?.length, 1000);

  // ── Documentos adjuntos del alta (se cargan tras crear al proveedor)
  const pend = { ...documentoPendienteVacio(), fechaEmision: "11/10/2026", fechaVencimiento: "11/10/2027" };

  igual("pendiente: fechas dd/mm/aaaa → ISO", [metadatosIso(pend, 0).fechaEmision, metadatosIso(pend, 0).fechaVencimiento], ["2026-10-11", "2027-10-11"]);
  igual("pendiente: fecha inválida con ruta del campo", error(() => metadatosIso({ ...pend, fechaEmision: "31/02/2026" }, 2))?.campo, "documentos.2.fechaEmision");
  igual("pendiente sin archivo", error(() => validarPendientes([pend]))?.campo, "documentos.0.archivo");
  cierto("sin pendientes es válido", error(() => validarPendientes([])) === null);

  // ── Certificados de retención (DEC-PRV-08)
  const HOY = "2026-10-11";
  const cert = { tipo: "CERTIFICADO_RETENCION", tieneArchivo: true, eliminado: false, fechaVencimiento: "2027-01-01" };

  cierto("certificado válido", certificadoValido(cert, HOY));
  cierto("certificado sin vencimiento", certificadoValido({ ...cert, fechaVencimiento: "" }, HOY));
  cierto("certificado que vence hoy sigue válido", certificadoValido({ ...cert, fechaVencimiento: HOY }, HOY));
  cierto("certificado vencido ayer", !certificadoValido({ ...cert, fechaVencimiento: "2026-10-10" }, HOY));
  cierto("certificado eliminado", !certificadoValido({ ...cert, eliminado: true }, HOY));
  cierto("enlace anterior (sin archivo) no sirve", !certificadoValido({ ...cert, tieneArchivo: false }, HOY));
  cierto("otro tipo de documento no sirve", !certificadoValido({ ...cert, tipo: "CONTRATO" }, HOY));

  const base = { tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "X" };

  igual("retención que exige certificado y activa sin certificado", error(() => normalizarProveedor({ ...base, retenciones: [{ tipo: "IVA", porcentaje: "30", certificadoObligatorio: true, activa: true }] }))?.campo, "retenciones.0.documentoCertificadoId");
  cierto("retención que exige certificado pero inactiva", error(() => normalizarProveedor({ ...base, retenciones: [{ tipo: "IVA", porcentaje: "30", certificadoObligatorio: true, activa: false }] })) === null);
  cierto("retención que exige certificado con certificado vinculado", error(() => normalizarProveedor({ ...base, retenciones: [{ tipo: "IVA", porcentaje: "30", certificadoObligatorio: true, activa: true, documentoCertificadoId: CERT }] })) === null);
  cierto("retención sin certificado obligatorio, activa", error(() => normalizarProveedor({ ...base, retenciones: [{ tipo: "RENTA", porcentaje: "2.5" }] })) === null);
  igual("retención: activa por defecto", normalizarProveedor({ ...base, retenciones: [{ tipo: "RENTA", porcentaje: "2.5" }] }).retenciones[0].activa, true);

  // ── Clave de almacenamiento: separada por módulo y por empresa/proveedor
  const clave = nuevaClave(EMPRESA, PROV, "proveedores");

  cierto("clave de proveedores", clave.startsWith(`${EMPRESA}/proveedores/${PROV}/`));
  cierto("clave de clientes por defecto", nuevaClave(EMPRESA, PROV).startsWith(`${EMPRESA}/clientes/${PROV}/`));
  igual("la clave no contiene el nombre del archivo", /^[0-9a-f-]{36}\/proveedores\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(clave), true);

  // ── Verificaciones estáticas: nada se destruye, todo se audita
  const raiz = process.cwd();
  const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
  const rutas = archivos(join(raiz, "app/api/proveedores")).filter((f) => f.endsWith(".ts"));
  const docs = rutas.filter((f) => /documentos/.test(f));

  cierto("hay rutas de documentos", docs.length >= 6);

  for (const ruta of rutas) {
    const codigo = readFileSync(ruta, "utf8");
    const corto = ruta.split(/[\\/]/).slice(-3).join("/");

    cierto(`${corto}: sin DELETE de documentos/versiones`, !/DELETE\s+FROM\s+proveedor_documento/i.test(codigo));
    cierto(`${corto}: sin unlink/rm`, !/\b(unlink|rmSync|rm)\(/.test(codigo));

    for (const mm of codigo.matchAll(/borrarArchivo\(([^)]*)\)/g)) {
      cierto(`${corto}: borrarArchivo(${mm[1]}) solo limpia un archivo nuevo no registrado`, /^(clave|claveNueva)$/.test((mm[1] ?? "").trim()));
    }
  }

  const post = leer("app/api/proveedores/[id]/documentos/route.ts");

  cierto("POST: revalida bajo bloqueo de la fila del proveedor", /bloquearContextoCargaInicial\(c, id, empresaId, usuarioId\)/.test(post) && /decidirAccesoDocumento\("CARGAR", auth\.permisos, bloqueado\)/.test(post));
  cierto("POST: versión 1 y auditoría en la misma transacción", /INSERT INTO proveedor_documento_versiones/.test(post) && /accion: "DOC_CARGA"/.test(post));
  cierto("POST: clave del ámbito proveedores", /nuevaClave\(empresaId, id, "proveedores"\)/.test(post));
  cierto("bloqueo FOR UPDATE por empresa", /empresa_id = \$2";?\s*$/m.test("") || /FOR UPDATE/.test(leer("lib/proveedores/documentos-http.ts")));

  const unico = leer("app/api/proveedores/[id]/documentos/[docId]/route.ts");

  cierto("DELETE es exclusión lógica", /UPDATE proveedor_documentos SET eliminado_at = now\(\)/.test(unico) && /accion: "DOC_ELIMINACION"/.test(unico));
  cierto("reemplazar crea una versión nueva", /INSERT INTO proveedor_documento_versiones/.test(unico) && /accion: "DOC_REEMPLAZO"/.test(unico));
  cierto("edición de datos auditada", /accion: "DOC_EDICION"/.test(unico));
  cierto("descarga de versión anterior o eliminado exige historial (EDITAR)", /exigir\("VER_HISTORIAL"/.test(unico));
  cierto("un certificado en uso no se elimina", /certificado de una retención activa/.test(unico));
  cierto("consultas siempre con empresa_id", (unico.match(/empresa_id = \$3/g) ?? []).length >= 4);
  cierto("restaurar audita", /accion: "DOC_RESTAURACION"/.test(leer("app/api/proveedores/[id]/documentos/[docId]/restaurar/route.ts")));
  cierto("recuperar versión audita", /accion: "DOC_RECUPERACION"/.test(leer("app/api/proveedores/[id]/documentos/[docId]/versiones/[version]/recuperar/route.ts")));
  cierto("el PUT del proveedor no toca documentos", !/proveedor_documentos/.test(leer("lib/proveedores/sincronizar.ts")));
  cierto("el PUT cierra la carga inicial", /carga_documentos_inicial_abierta = false/.test(leer("app/api/proveedores/[id]/route.ts")));
  cierto("el POST abre la carga inicial", /"carga_documentos_inicial_abierta"/.test(leer("app/api/proveedores/route.ts")));
  cierto("el POST rechaza certificados (aún no hay documentos)", /validarCertificados\(conexion, empresaId, null, datos\)/.test(leer("app/api/proveedores/route.ts")));

  // ── Migración NEX-036
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-036-proveedores-documentos-archivos-retenciones.sql");

  cierto("NEX-036: url_archivo deja de ser obligatorio (se conservan los enlaces)", /ALTER COLUMN url_archivo DROP NOT NULL/.test(mig) && !/DELETE FROM|DROP TABLE proveedor_documentos/.test(mig));
  cierto("NEX-036: archivo o enlace", /url_archivo IS NOT NULL OR almacen_clave IS NOT NULL/.test(mig));
  cierto("NEX-036: 10 MB como máximo", /tamano_bytes <= 10485760/.test(mig));
  cierto("NEX-036: el rol de la aplicación pierde DELETE", /REVOKE DELETE ON public\.proveedor_documentos FROM nexit_runtime/.test(mig));
  cierto("NEX-036: versiones solo se insertan", /GRANT SELECT, INSERT ON public\.proveedor_documento_versiones/.test(mig));
  cierto("NEX-036: trigger de activación de retenciones", /proveedor_retenciones_activacion_trg/.test(mig) && /CERTIFICADO_RETENCION/.test(mig));
  cierto("NEX-036: retenciones que exigen certificado quedan inactivas", /SET activa = false WHERE certificado_obligatorio/.test(mig));
  cierto("NEX-036: los proveedores existentes quedan con la carga inicial cerrada", /carga_documentos_inicial_abierta boolean NOT NULL DEFAULT false/.test(mig));
  cierto("NEX-036: certificado vinculado del mismo proveedor", /d\.proveedor_id = NEW\.proveedor_id/.test(mig));
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-036.sql");

  cierto("reversión NEX-036 aborta si perdería archivos", /RAISE EXCEPTION[\s\S]*?no se revierte NEX-036/.test(rev));

  return fallos;
}
