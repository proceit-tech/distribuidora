/**
 * MOV-D03 — inicialización del formulario de «Nuevo movimiento». Funciones puras (se prueban sin navegador).
 *  · La carga de catálogos ocurre UNA vez por intento (no depende de la fecha): el paso de un día a otro con la pantalla abierta no vuelve a consultar ni a inicializar nada.
 *  · `resolverInicializacion` decide si una respuesta de catálogos puede inicializar el formulario: nunca si ya se inicializó o si el operador ya modificó algo (una respuesta tardía o duplicada no restaura el formulario inicial).
 *  · La fecha INICIAL sugerida (`hoyInicial`) solo siembra el formulario nuevo; la validación usa la fecha vigente de America/Asuncion en el momento de registrar (la pantalla la calcula al enviar).
 */
import { formularioInicial, precargarDesdeConsulta } from "@/lib/movimientos/formulario";
import type { CatalogoMovimientos, NuevoMovimientoStock } from "@/types/movimientos-stock";

export type Inicializacion =
  | { aplicar: false }
  | { aplicar: true; formulario: NuevoMovimientoStock; cantidadTxt: string; precargado: boolean; descartados: string[] };

export function resolverInicializacion(a: { inicializado: boolean; tocado: boolean; catalogos: CatalogoMovimientos; consulta: URLSearchParams; hoyInicial: string }): Inicializacion {
  if (a.inicializado || a.tocado) return { aplicar: false };

  const p = precargarDesdeConsulta(a.consulta, a.catalogos, formularioInicial(a.hoyInicial));

  return { aplicar: true, formulario: p.formulario, cantidadTxt: p.formulario.cantidad > 0 ? String(p.formulario.cantidad) : "", precargado: p.precargado, descartados: p.descartados };
}

/** Lanza la carga de catálogos y entrega su resultado solo mientras la instancia siga vigente; devuelve la función que la invalida (desmontaje). */
export function iniciarCargaCatalogos(cargar: () => Promise<CatalogoMovimientos>, ev: { alCargar: (c: CatalogoMovimientos) => void; alFallar: (mensaje: string) => void }): () => void {
  let activo = true;

  cargar()
    .then((c) => {
      if (activo) ev.alCargar(c);
    })
    .catch((e: unknown) => {
      if (activo) ev.alFallar(e instanceof Error ? e.message : "No fue posible cargar los catálogos.");
    });

  return () => {
    activo = false;
  };
}
