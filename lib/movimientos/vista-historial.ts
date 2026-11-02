/**
 * MOV-D02 — el historial de Movimientos solo presenta datos CONFIRMADOS para la consulta vigente. Funciones puras (se prueban sin navegador).
 *  · `derivarVista`: el resultado guardado solo vale si su clave es la de la consulta vigente; mientras no coincida (nueva consulta pendiente) no hay datos, ni resumen, ni totales, ni permisos: la pantalla muestra
 *    estado de carga neutro (nunca ceros inventados ni «sin resultados»).
 *  · `lanzarConsulta`: inicia una consulta con su clave y entrega su resultado (datos o error) solo si sigue vigente; la función devuelta la invalida, de modo que una respuesta tardía (éxito o error) de una consulta
 *    anterior no sustituye ni limpia lo de la actual.
 */
import type { RespuestaHistorial } from "@/lib/movimientos/cliente-api";

export type ResultadoHistorial = { clave: string; datos: RespuestaHistorial | null; error: string };

export type VistaHistorial = { cargando: boolean; datos: RespuestaHistorial | null; error: string };

export function derivarVista(resultado: ResultadoHistorial | null, claveConsulta: string, listo: boolean): VistaHistorial {
  const vigente = listo && resultado !== null && resultado.clave === claveConsulta ? resultado : null;

  return { cargando: vigente === null, datos: vigente?.datos ?? null, error: vigente?.error ?? "" };
}

export function lanzarConsulta(cargar: () => Promise<RespuestaHistorial>, clave: string, alResultado: (r: ResultadoHistorial) => void): () => void {
  let activo = true;

  cargar()
    .then((datos) => {
      if (activo) alResultado({ clave, datos, error: "" });
    })
    .catch((e: unknown) => {
      if (activo) alResultado({ clave, datos: null, error: e instanceof Error ? e.message : "No fue posible cargar los movimientos." });
    });

  return () => {
    activo = false;
  };
}
