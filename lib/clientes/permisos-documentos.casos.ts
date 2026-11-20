/**
 * Casos de regresión de permisos, autoría de la carga inicial y aislamiento por empresa de los documentos de Clientes
 * (F-CLI-09-01 y F-CLI-09-03). No se ejecutan automáticamente: `verificarCasosPermisosDocumentos()` devuelve los fallos
 * (lista vacía = todos coinciden).
 */
import { readFileSync } from "node:fs";
import { contador } from "@/lib/clientes/contador-casos";
import { join } from "node:path";

import {
  decidirAccesoDocumento,
  type AccionDocumento,
  type ContextoCargaInicial,
  type PermisosClientes,
} from "@/lib/clientes/permisos-documentos";

const P = (ver: boolean, editar: boolean, crear: boolean): PermisosClientes => ({ ver, editar, crear });
const CTX = (esCreador: boolean, cargaInicialAbierta: boolean): ContextoCargaInicial => ({ esCreador, cargaInicialAbierta });
const ACCIONES: AccionDocumento[] = ["DESCARGAR", "CARGAR", "FINALIZAR_CARGA", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION"];
const CONTEXTOS: Array<ContextoCargaInicial | null> = [null, CTX(true, true), CTX(true, false), CTX(false, true), CTX(false, false)];

export function verificarCasosPermisosDocumentos(): string[] {
  const fallos: string[] = [];
  const permitido = (accion: AccionDocumento, permisos: PermisosClientes, contexto: ContextoCargaInicial | null) =>
    decidirAccesoDocumento(accion, permisos, contexto).permitido;
  const esperar = (nombre: string, obtenido: boolean, esperado: boolean) => {
    contador.n += 1;
    if (obtenido !== esperado) fallos.push(`${nombre}: esperado ${esperado}, obtenido ${obtenido}`);
  };

  // Solo CREAR: carga/finalización únicamente para el CREADOR de ese cliente con la carga inicial ABIERTA
  const soloCrear = P(false, false, true);
  for (const accion of ["CARGAR", "FINALIZAR_CARGA"] as const) {
    esperar(`CREAR: ${accion} creador con carga abierta`, permitido(accion, soloCrear, CTX(true, true)), true);
    esperar(`CREAR: ${accion} creador con carga CERRADA`, permitido(accion, soloCrear, CTX(true, false)), false);
    esperar(`CREAR: ${accion} otro usuario (no creador), carga abierta`, permitido(accion, soloCrear, CTX(false, true)), false);
    esperar(`CREAR: ${accion} otro usuario, carga cerrada`, permitido(accion, soloCrear, CTX(false, false)), false);
    esperar(`CREAR: ${accion} cliente inexistente/de otra empresa`, permitido(accion, soloCrear, null), false);
  }
  // La antigüedad del cliente ya no concede nada: no hay plazo (un cliente "recién creado" por otro usuario sigue siendo ajeno)
  esperar("CREAR: recién creado por OTRO usuario no autoriza", permitido("CARGAR", soloCrear, CTX(false, true)), false);
  for (const accion of ["REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION"] as const) {
    for (const contexto of CONTEXTOS) esperar(`CREAR: ${accion} (${JSON.stringify(contexto)})`, permitido(accion, soloCrear, contexto), false);
  }
  esperar("CREAR sin VER: descargar", permitido("DESCARGAR", soloCrear, CTX(true, true)), false);

  // EDITAR: todo, en cualquier contexto (la descarga además exige VER)
  const editor = P(true, true, false);
  for (const accion of ACCIONES) for (const contexto of CONTEXTOS) esperar(`EDITAR+VER: ${accion} (${JSON.stringify(contexto)})`, permitido(accion, editor, contexto), true);
  esperar("EDITAR sin VER: descargar", permitido("DESCARGAR", P(false, true, false), null), false);
  esperar("EDITAR sin VER: eliminar", permitido("ELIMINAR", P(false, true, false), null), true);

  // Solo VER: descarga, nada más (ni siquiera siendo creador con carga abierta)
  const lector = P(true, false, false);
  esperar("VER: descargar", permitido("DESCARGAR", lector, null), true);
  for (const accion of ["CARGAR", "FINALIZAR_CARGA", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR", "RESTAURAR", "VER_HISTORIAL", "RECUPERAR_VERSION"] as const) {
    esperar(`VER: ${accion} aun siendo creador`, permitido(accion, lector, CTX(true, true)), false);
  }

  // Sin permisos
  for (const accion of ACCIONES) for (const contexto of CONTEXTOS) esperar(`sin permisos: ${accion} (${JSON.stringify(contexto)})`, permitido(accion, P(false, false, false), contexto), false);

  // CREAR+VER: descarga y carga inicial propia; nunca reemplazar ni eliminar
  const creadorConVer = P(true, false, true);
  esperar("CREAR+VER: descargar", permitido("DESCARGAR", creadorConVer, null), true);
  esperar("CREAR+VER: cargar (creador, abierta)", permitido("CARGAR", creadorConVer, CTX(true, true)), true);
  esperar("CREAR+VER: eliminar", permitido("ELIMINAR", creadorConVer, CTX(true, true)), false);
  esperar("CREAR+VER: reemplazar", permitido("REEMPLAZAR", creadorConVer, CTX(true, true)), false);

  // Verificaciones estáticas sobre el código versionado
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
  const rutas = [
    "app/api/clientes/[id]/documentos/route.ts",
    "app/api/clientes/[id]/documentos/[docId]/route.ts",
    "app/api/clientes/[id]/documentos/finalizar/route.ts",
    "app/api/clientes/[id]/documentos/[docId]/restaurar/route.ts",
    "app/api/clientes/[id]/documentos/[docId]/versiones/route.ts",
    "app/api/clientes/[id]/documentos/[docId]/versiones/[version]/recuperar/route.ts",
    "lib/clientes/documentos-http.ts",
  ];

  // Aislamiento entre empresas: toda sentencia sobre clientes/cliente_documentos filtra o inserta empresa_id (de la sesión)
  for (const ruta of rutas) {
    const codigo = leer(ruta);

    for (const m of codigo.matchAll(/(["`])((?:(?!\1)[\s\S])*?(?:cliente_documentos|FROM clientes|UPDATE clientes)(?:(?!\1)[\s\S])*?)\1/g)) {
      const sql = m[2] ?? "";

      if (/^(SELECT|UPDATE|DELETE|INSERT)/i.test(sql.trim()) && !sql.includes("empresa_id")) {
        fallos.push(`${ruta}: sentencia sin empresa_id → ${sql.trim().slice(0, 70)}`);
      }
    }

    if (/cuerpo\.empresaId|formulario\.get\(["']empresa/i.test(codigo)) fallos.push(`${ruta}: no debe leer empresa_id del cuerpo`);
    if (/VENTANA|antiguedad/i.test(codigo)) fallos.push(`${ruta}: no debe usar ventanas temporales para autorizar`);
  }

  // Autoría y estado: el alta registra al creador y abre la carga; la edición la cierra; el POST de documentos usa el contexto
  const alta = leer("app/api/clientes/route.ts");
  if (!/creado_por,\s*carga_documentos_inicial_abierta/.test(alta)) fallos.push("POST /api/clientes debe registrar creado_por y abrir carga_documentos_inicial_abierta");
  if (!/carga_documentos_inicial_abierta = false/.test(leer("app/api/clientes/[id]/route.ts"))) fallos.push("PUT /api/clientes/{id} debe cerrar la carga inicial");
  if (!leer("app/api/clientes/[id]/documentos/route.ts").includes('exigir("CARGAR", auth.permisos, estadoCarga)')) fallos.push("POST de documentos debe decidir con el contexto de creación");
  // F-CLI-10-01: la autorización se REVALIDA dentro de la transacción, bajo bloqueo de la fila del cliente
  const postDocs = leer("app/api/clientes/[id]/documentos/route.ts");
  const dentro = postDocs.slice(postDocs.indexOf("await conTransaccion("), postDocs.indexOf("INSERT INTO cliente_documentos\n"));
  if (!/bloquearContextoCargaInicial\(c, id, empresaId, usuarioId\)/.test(dentro)) fallos.push("F-CLI-10-01: el POST debe bloquear y releer el contexto dentro de la transacción");
  if (!/decidirAccesoDocumento\("CARGAR", auth\.permisos, bloqueado\)/.test(dentro)) fallos.push("F-CLI-10-01: el POST debe decidir de nuevo con el contexto bloqueado antes del INSERT");
  if (!/FOR UPDATE/.test(leer("lib/clientes/documentos-http.ts").slice(leer("lib/clientes/documentos-http.ts").indexOf("bloquearContextoCargaInicial")))) fallos.push("F-CLI-10-01: la relectura debe usar FOR UPDATE sobre clientes (empresa + creador + indicador)");
  if (!/empresa_id = \$2 FOR UPDATE/.test(leer("lib/clientes/documentos-http.ts"))) fallos.push("F-CLI-10-01: el bloqueo debe filtrar por empresa_id de la sesión");
  if (!/typeof documentoId !== "string"[\s\S]*?documentoId\.estado/.test(postDocs)) fallos.push("F-CLI-10-01: un rechazo bajo bloqueo debe responder con su estado sin registrar nada");
  // Carrera simulada: la comprobación previa vio la carga ABIERTA, pero al obtener el bloqueo ya estaba CERRADA ⇒ solo CREAR no graba; EDITAR sí
  esperar("F-CLI-10-01: previa abierta, bajo bloqueo cerrada, solo CREAR", permitido("CARGAR", soloCrear, CTX(true, false)), false);
  esperar("F-CLI-10-01: previa abierta, bajo bloqueo abierta, solo CREAR", permitido("CARGAR", soloCrear, CTX(true, true)), true);
  esperar("F-CLI-10-01: bajo bloqueo cerrada, con EDITAR", permitido("CARGAR", P(false, true, false), CTX(false, false)), true);
  esperar("F-CLI-10-01: bajo bloqueo, cliente desaparecido/otra empresa", permitido("CARGAR", soloCrear, null), false);

  // F-CLI-09-04: ningún identificador local repite el parámetro `contexto` de las rutas
  for (const ruta of ["app/api/clientes/[id]/documentos/route.ts", "app/api/clientes/[id]/documentos/[docId]/route.ts", "app/api/clientes/[id]/documentos/finalizar/route.ts"]) {
    if (/\b(let|const|var)\s+contexto\b/.test(leer(ruta))) fallos.push(`${ruta}: declara una variable llamada contexto (duplica el parámetro de la ruta)`);
  }

  // F-CLI-09-05 / F-CLI-09-06: el alta crea el cliente una sola vez, conserva su identidad y los documentos pendientes, reintenta
  // solo lo que falló (sin EDITAR), cierra la carga verificando la respuesta y no redirige a la ficha por una falla de upload
  const pagina = leer("app/(private)/clientes/nuevo/page.tsx");
  if (/documentos\/finalizar`[^)]*\)\.catch\(\(\) => undefined\)/.test(pagina)) fallos.push("el alta no debe ignorar la respuesta de /documentos/finalizar");
  if (/avisoDocumentos/.test(pagina)) fallos.push("una falla de upload no debe redirigir a la ficha (exigiría EDITAR); se reintenta en el propio formulario");
  if (!/if \(!clienteId\) \{\s*const respuesta = await fetch\("\/api\/clientes"/.test(pagina)) fallos.push("POST /api/clientes solo debe ejecutarse mientras no exista cliente creado");
  if (!/setAltaCreada\(\{ id: clienteId \}\)/.test(pagina)) fallos.push("debe conservarse la identidad del cliente creado");
  if (!/subidos\.includes\(documento\.uid\)\) continue;/.test(pagina)) fallos.push("no deben reenviarse los documentos ya cargados");
  if (!/subirPendientes\(clienteId\)\)\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?cerrarCargaInicial\(clienteId\)\)\) return;/.test(pagina)) fallos.push("el cierre solo debe ocurrir tras completar los uploads y verificar su respuesta");
  if (!/respuesta\.ok\) return true;/.test(pagina)) fallos.push("el cierre debe verificar respuesta.ok");
  if (!/async function finalizarSinPendientes\(\)[\s\S]*?window\.confirm[\s\S]*?cerrarCargaInicial\(altaCreada\.id\)/.test(pagina)) fallos.push("debe existir el cierre explícito sin pendientes, con confirmación");
  if (!/!altaCreada \|\| identificador === "documentos"/.test(pagina)) fallos.push("tras crear el cliente solo debe quedar disponible la pestaña de documentos");
  for (const accion of ["EDITAR_DATOS", "ELIMINAR", "DESCARGAR"]) {
    if (!leer("app/api/clientes/[id]/documentos/[docId]/route.ts").includes(`exigir("${accion}"`)) fallos.push(`falta exigir("${accion}") en la ruta de documento`);
  }

  // Decisiones 3 y 4: NINGÚN archivo se destruye por eliminar ni por reemplazar (solo se limpia un archivo nuevo que nunca llegó a registrarse)
  for (const ruta of rutas) {
    const codigo = leer(ruta);

    if (/DELETE\s+FROM\s+cliente_documento/i.test(codigo)) fallos.push(`${ruta}: no debe borrar filas de documentos/versiones/eventos`);
    if (/\b(unlink|rmSync|rm)\(/.test(codigo)) fallos.push(`${ruta}: no debe borrar archivos del volumen`);

    for (const m of codigo.matchAll(/borrarArchivo\(([^)]*)\)/g)) {
      if (!/^(clave|claveNueva)$/.test((m[1] ?? "").trim())) fallos.push(`${ruta}: borrarArchivo(${m[1]}) solo puede limpiar un archivo nuevo no registrado`);
    }
  }
  const eliminar = leer("app/api/clientes/[id]/documentos/[docId]/route.ts");
  if (!/UPDATE cliente_documentos SET eliminado_at = now\(\)/.test(eliminar)) fallos.push("DELETE debe ser una exclusión lógica (eliminado_at)");
  if (!/accion: "ELIMINACION_LOGICA"/.test(eliminar) || !/accion: "REEMPLAZO"/.test(eliminar)) fallos.push("eliminar y reemplazar deben registrar auditoría");
  if (!/INSERT INTO cliente_documento_versiones/.test(eliminar)) fallos.push("reemplazar debe crear una nueva versión");
  const migracion = leer("documentacao/banco/nexit/v1/migraciones/NEX-031-cliente-documentos-versiones-auditoria.sql");
  if (!/REVOKE DELETE ON public\.cliente_documentos FROM nexit_runtime/.test(migracion)) fallos.push("NEX-031 debe revocar DELETE sobre documentos al rol de la aplicación");

  return fallos;
}
