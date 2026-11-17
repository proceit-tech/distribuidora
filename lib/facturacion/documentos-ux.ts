/**
 * PRO-342-UX-R01 — Ayudas PURAS de presentación de la pantalla «Documentos electrónicos» (sin React, sin DOM, sin red, sin datos fiscales).
 *
 *  · posicionTooltip: ubica el tooltip de los iconos de estado en coordenadas de la VENTANA (position: fixed), fuera del contenedor con scroll horizontal de la tabla,
 *    para que no lo recorte ni la última fila ni el borde de la tabla (AUD UX03). Prefiere abajo; si no cabe, arriba; si no cabe en ninguno, el lado con más espacio,
 *    siempre dentro de la ventana con un margen.
 *  · claveContexto: identifica el contexto del listado (filtros + página) sin el contador de recarga: una relectura del MISMO contexto conserva las filas; un contexto
 *    nuevo invalida las filas y los detalles anteriores (AUD UX04).
 *  · esResultadoVigente: decide si la respuesta de una acción o carga sigue perteneciendo a la generación vigente del detalle (respuestas tardías).
 *
 * No cambia estados, CDC, lotes ni reglas fiscales: solo decide dónde y cuándo se muestra algo.
 */

export type Caja = { x: number; y: number; ancho: number; alto: number };
export type Tamano = { ancho: number; alto: number };
export type PosicionTooltip = { x: number; y: number; lado: "abajo" | "arriba" };

const acotar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export function posicionTooltip(ancla: Caja, tip: Tamano, vista: Tamano, margen = 8, separacion = 6): PosicionTooltip {
  const x = acotar(ancla.x + ancla.ancho / 2 - tip.ancho / 2, margen, vista.ancho - margen - tip.ancho);
  const abajo = ancla.y + ancla.alto + separacion;
  const arriba = ancla.y - separacion - tip.alto;
  const espacioAbajo = vista.alto - margen - abajo;
  const espacioArriba = ancla.y - separacion - margen;

  if (tip.alto <= espacioAbajo) return { x, y: abajo, lado: "abajo" };
  if (tip.alto <= espacioArriba) return { x, y: arriba, lado: "arriba" };

  return espacioArriba > espacioAbajo
    ? { x, y: Math.max(margen, arriba), lado: "arriba" }
    : { x, y: acotar(abajo, margen, vista.alto - margen - tip.alto), lado: "abajo" };
}

/** Contexto del listado: filtros aplicados + página. El contador de recarga NO forma parte (refrescar no cambia el contexto). */
export function claveContexto(claveFiltros: string, pagina: number): string {
  return JSON.stringify([claveFiltros, pagina]);
}

/**
 * Una respuesta tardía solo se aplica si: (1) el detalle del documento sigue abierto y (2) la generación con la que se lanzó la petición sigue siendo la vigente
 * (cerrar, reabrir o cambiar de contexto la invalida). Nunca recrea un detalle cerrado.
 */
export function esResultadoVigente(abierto: boolean, generacionPeticion: number, generacionVigente: number): boolean {
  return abierto && generacionPeticion === generacionVigente;
}

/*
 * PRO-342-UX-R02 (AUD UX-F001) — respuestas tardías del GET inicial, de consultas y de envíos.
 *
 *  · esListadoMasReciente: cada lectura del listado (carga, relectura tras una acción, refresco automático) recibe al LANZARSE un número de secuencia creciente;
 *    solo se aplica si es posterior a la que ya se muestra. Una respuesta lenta lanzada antes nunca sustituye datos más nuevos.
 *  · accionDisponible: consultar/enviar/corregir se habilitan solo con el detalle cargado (el GET inicial ya resolvió), sin acción en curso para ese documento y,
 *    tras una acción, solo cuando ya se muestra un listado LANZADO DESPUÉS de que la acción terminó (estado vigente, no el anterior a la acción).
 *  · unirIntentos: fusión NO regresiva del historial (sin duplicados, gana la versión nueva, orden por cursor DESC): una respuesta anterior no borra intentos nuevos.
 */

/** true si la lectura del listado `nueva` (secuencia asignada al lanzarla) es posterior a la mostrada. */
export function esListadoMasReciente(secuenciaMostrada: number | null, secuenciaNueva: number): boolean {
  return secuenciaMostrada === null || secuenciaNueva > secuenciaMostrada;
}

export type EstadoAccion = {
  /** GET inicial del detalle aún sin resolver. */
  cargandoDetalle: boolean;
  /** Consulta o envío en curso para el documento. */
  enCurso: boolean;
  /** Secuencia de la última lectura del listado lanzada ANTES de terminar la última acción del documento (undefined: sin acción previa). */
  esperaListado: number | undefined;
  /** Secuencia de la lectura del listado que se muestra. */
  secuenciaListado: number;
};

export function accionDisponible(e: EstadoAccion): boolean {
  return !e.cargandoDetalle && !e.enCurso && (e.esperaListado === undefined || e.secuenciaListado > e.esperaListado);
}

/** Une dos páginas del historial sin duplicados; si un intento llega en ambas, se conserva el de `nuevos`. Orden cursor DESC (creado_at DESC, id DESC). */
export function unirIntentos<T extends { id: string; cursor?: string }>(nuevos: T[], previos: T[]): T[] {
  const vistos = new Set<string>();

  return [...nuevos, ...previos]
    .filter((i) => (vistos.has(i.id) ? false : (vistos.add(i.id), true)))
    .sort((x, y) => ((y.cursor ?? "") < (x.cursor ?? "") ? -1 : (y.cursor ?? "") > (x.cursor ?? "") ? 1 : 0));
}
