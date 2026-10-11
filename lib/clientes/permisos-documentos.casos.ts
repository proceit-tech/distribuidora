/**
 * Casos de regresión de permisos, autoría de la carga inicial y aislamiento por empresa de los documentos de Clientes
 * (F-CLI-09-01 y F-CLI-09-03). No se ejecutan automáticamente: `verificarCasosPermisosDocumentos()` devuelve los fallos
 * (lista vacía = todos coinciden).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  decidirAccesoDocumento,
  type AccionDocumento,
  type ContextoCargaInicial,
  type PermisosClientes,
} from "@/lib/clientes/permisos-documentos";

const P = (ver: boolean, editar: boolean, crear: boolean): PermisosClientes => ({ ver, editar, crear });
const CTX = (esCreador: boolean, cargaInicialAbierta: boolean): ContextoCargaInicial => ({ esCreador, cargaInicialAbierta });
const ACCIONES: AccionDocumento[] = ["DESCARGAR", "CARGAR", "FINALIZAR_CARGA", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"];
const CONTEXTOS: Array<ContextoCargaInicial | null> = [null, CTX(true, true), CTX(true, false), CTX(false, true), CTX(false, false)];

export function verificarCasosPermisosDocumentos(): string[] {
  const fallos: string[] = [];
  const permitido = (accion: AccionDocumento, permisos: PermisosClientes, contexto: ContextoCargaInicial | null) =>
    decidirAccesoDocumento(accion, permisos, contexto).permitido;
  const esperar = (nombre: string, obtenido: boolean, esperado: boolean) => {
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
  for (const accion of ["REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"] as const) {
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
  for (const accion of ["CARGAR", "FINALIZAR_CARGA", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"] as const) {
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

  // F-CLI-09-04: ningún identificador local repite el parámetro `contexto` de las rutas
  for (const ruta of ["app/api/clientes/[id]/documentos/route.ts", "app/api/clientes/[id]/documentos/[docId]/route.ts", "app/api/clientes/[id]/documentos/finalizar/route.ts"]) {
    if (/\b(let|const|var)\s+contexto\b/.test(leer(ruta))) fallos.push(`${ruta}: declara una variable llamada contexto (duplica el parámetro de la ruta)`);
  }

  // F-CLI-09-05: el alta verifica la respuesta del cierre y conserva el cliente creado para reintentar solo el cierre
  const pagina = leer("app/(private)/clientes/nuevo/page.tsx");
  if (/documentos\/finalizar`[^)]*\)\.catch\(\(\) => undefined\)/.test(pagina)) fallos.push("el alta no debe ignorar la respuesta de /documentos/finalizar");
  if (!/cerrarCargaInicial\(clienteId\)\)\) return;/.test(pagina)) fallos.push("el alta debe detenerse si el cierre de la carga inicial falla");
  if (!/respuesta\.ok\)\s*\{\s*setPendienteCierre\(null\)/.test(pagina)) fallos.push("el cierre debe verificar respuesta.ok");
  if (!/if \(pendienteCierre\)\s*\{[\s\S]*?cerrarCargaInicial\(pendienteCierre\.id\)/.test(pagina)) fallos.push("debe existir reintento seguro del cierre sin repetir el alta");
  for (const accion of ["EDITAR_DATOS", "ELIMINAR", "DESCARGAR"]) {
    if (!leer("app/api/clientes/[id]/documentos/[docId]/route.ts").includes(`exigir("${accion}"`)) fallos.push(`falta exigir("${accion}") en la ruta de documento`);
  }

  return fallos;
}
