/**
 * STK-D02 — carga de la pantalla de Stock ligada a LA INSTANCIA que la pidió. La moneda base viaja con los datos de su propia respuesta y solo se aplica si esa instancia sigue vigente: una respuesta tardía de una
 * instancia desmontada (o de otra empresa) no toca nada. Sin moneda confirmada NO se inventa PYG. Funciones puras con la carga inyectada: se prueban sin navegador.
 */
import type { StockRespuesta } from "@/types/stock";

/** Moneda base confirmada por la respuesta; null si falta o no es un texto no vacío (nunca un valor por defecto). */
export function monedaDeRespuesta(r: Pick<StockRespuesta, "monedaBase">): string | null {
  return typeof r.monedaBase === "string" && r.monedaBase.trim() !== "" ? r.monedaBase.trim() : null;
}

type Eventos = {
  /** Respuesta de ESTA instancia, aún vigente. */
  alCompletar: (r: StockRespuesta, monedaBase: string | null) => void;
  alFallar: (mensaje: string) => void;
  alFinalizar: () => void;
};

/** Inicia la carga y devuelve la función que la invalida (desmontaje): después de invalidarla ningún evento se entrega. */
export function iniciarCargaStock(cargar: () => Promise<StockRespuesta>, ev: Eventos): () => void {
  let activo = true;

  cargar()
    .then((r) => {
      if (activo) ev.alCompletar(r, monedaDeRespuesta(r));
    })
    .catch((e: unknown) => {
      if (activo) ev.alFallar(e instanceof Error ? e.message : "No fue posible cargar el stock.");
    })
    .finally(() => {
      if (activo) ev.alFinalizar();
    });

  return () => {
    activo = false;
  };
}
