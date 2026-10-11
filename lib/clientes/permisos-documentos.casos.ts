/**
 * Casos de regresión de permisos y aislamiento por empresa de las rutas de documentos de Clientes (F-CLI-09-01).
 * No se ejecutan automáticamente: `verificarCasosPermisosDocumentos()` devuelve los fallos (lista vacía = todos coinciden).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VENTANA_CARGA_INICIAL_MS,
  decidirAccesoDocumento,
  type AccionDocumento,
  type PermisosClientes,
} from "@/lib/clientes/permisos-documentos";

const P = (ver: boolean, editar: boolean, crear: boolean): PermisosClientes => ({ ver, editar, crear });
const ACCIONES: AccionDocumento[] = ["DESCARGAR", "CARGAR", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"];

export function verificarCasosPermisosDocumentos(): string[] {
  const fallos: string[] = [];
  const permitido = (accion: AccionDocumento, permisos: PermisosClientes, antiguedad: number | null) =>
    decidirAccesoDocumento(accion, permisos, antiguedad).permitido;
  const esperar = (nombre: string, obtenido: boolean, esperado: boolean) => {
    if (obtenido !== esperado) fallos.push(`${nombre}: esperado ${esperado}, obtenido ${obtenido}`);
  };

  // Solo CREAR (sin EDITAR): únicamente la carga inicial dentro de la ventana del alta
  const soloCrear = P(false, false, true);
  esperar("CREAR: carga inicial recién creado", permitido("CARGAR", soloCrear, 5_000), true);
  esperar("CREAR: carga en el límite de la ventana", permitido("CARGAR", soloCrear, VENTANA_CARGA_INICIAL_MS), true);
  esperar("CREAR: carga fuera de la ventana", permitido("CARGAR", soloCrear, VENTANA_CARGA_INICIAL_MS + 1), false);
  esperar("CREAR: carga a un cliente antiguo (1 día)", permitido("CARGAR", soloCrear, 24 * 60 * 60 * 1000), false);
  esperar("CREAR: antigüedad desconocida", permitido("CARGAR", soloCrear, null), false);
  esperar("CREAR: antigüedad negativa (reloj inconsistente)", permitido("CARGAR", soloCrear, -1), false);
  for (const accion of ["REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"] as const) {
    esperar(`CREAR: ${accion} recién creado`, permitido(accion, soloCrear, 1_000), false);
    esperar(`CREAR: ${accion} cliente antiguo`, permitido(accion, soloCrear, 7 * 24 * 60 * 60 * 1000), false);
  }
  esperar("CREAR: descargar sin VER", permitido("DESCARGAR", soloCrear, 1_000), false);

  // EDITAR: todo menos descargar si no tiene VER (la descarga exige VER)
  const editor = P(true, true, false);
  for (const accion of ACCIONES) esperar(`EDITAR+VER: ${accion}`, permitido(accion, editor, 10 * 24 * 60 * 60 * 1000), true);
  esperar("EDITAR sin VER: descargar", permitido("DESCARGAR", P(false, true, false), null), false);
  esperar("EDITAR sin VER: eliminar", permitido("ELIMINAR", P(false, true, false), null), true);

  // Solo VER: descarga, nada más
  const lector = P(true, false, false);
  esperar("VER: descargar", permitido("DESCARGAR", lector, null), true);
  for (const accion of ["CARGAR", "REEMPLAZAR", "EDITAR_DATOS", "ELIMINAR"] as const) esperar(`VER: ${accion}`, permitido(accion, lector, 1_000), false);

  // Sin permisos
  for (const accion of ACCIONES) esperar(`sin permisos: ${accion}`, permitido(accion, P(false, false, false), 1_000), false);

  // CREAR+VER (alta con descarga): sigue sin poder reemplazar/eliminar
  const creadorConVer = P(true, false, true);
  esperar("CREAR+VER: descargar", permitido("DESCARGAR", creadorConVer, null), true);
  esperar("CREAR+VER: eliminar", permitido("ELIMINAR", creadorConVer, 1_000), false);
  esperar("CREAR+VER: reemplazar", permitido("REEMPLAZAR", creadorConVer, 1_000), false);

  // Aislamiento entre empresas (verificación estática): toda sentencia sobre `clientes` / `cliente_documentos` de las rutas
  // y de sus utilidades filtra o inserta `empresa_id`, que sale de la sesión.
  const archivos = [
    "app/api/clientes/[id]/documentos/route.ts",
    "app/api/clientes/[id]/documentos/[docId]/route.ts",
    "lib/clientes/documentos-http.ts",
  ];
  for (const ruta of archivos) {
    const codigo = readFileSync(join(process.cwd(), ruta), "utf8");

    for (const m of codigo.matchAll(/(["`])((?:(?!\1)[\s\S])*?(?:cliente_documentos|FROM clientes)(?:(?!\1)[\s\S])*?)\1/g)) {
      const sql = m[2] ?? "";

      if (/^(SELECT|UPDATE|DELETE|INSERT)/i.test(sql.trim()) && !sql.includes("empresa_id")) {
        fallos.push(`${ruta}: sentencia sin empresa_id → ${sql.trim().slice(0, 70)}`);
      }
    }

    if (/cuerpo\.empresaId|formulario\.get\(["']empresa/i.test(codigo)) fallos.push(`${ruta}: no debe leer empresa_id del cuerpo`);
  }

  return fallos;
}
