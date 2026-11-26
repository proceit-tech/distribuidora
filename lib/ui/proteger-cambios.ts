"use client";

import { useEffect } from "react";

export const MENSAJE_CAMBIOS_SIN_GUARDAR = "Hay cambios sin registrar en el formulario. Si sale, se perderán. ¿Desea salir?";

type Ancla = { href: string; target?: string | null; download?: boolean; modificador?: boolean; boton?: number };

/**
 * ¿Un clic en un enlace abandona la pantalla actual dentro de la aplicación? Pura (probada sin navegador).
 * Se ignoran: otros botones del ratón, teclas modificadoras (nueva pestaña), target distinto de _self, descargas, enlaces a otro origen
 * (los cubre beforeunload) y enlaces a la misma ruta y consulta (anclas internas).
 */
export function navegacionInternaAbandona(a: Ancla, actual: { origen: string; ruta: string; consulta: string }): boolean {
  if (a.modificador || (a.boton ?? 0) !== 0 || a.download) return false;
  if (a.target && a.target !== "_self") return false;

  let url: URL;

  try {
    url = new URL(a.href, actual.origen + actual.ruta + actual.consulta);
  } catch {
    return false;
  }

  if (url.origin !== actual.origen) return false;
  if (!/^https?:$/.test(url.protocol)) return false;

  return url.pathname !== actual.ruta || url.search !== actual.consulta;
}

/**
 * Protege un formulario con cambios sin guardar:
 *  · cerrar/recargar/salir a otro sitio → aviso nativo del navegador (beforeunload);
 *  · cualquier enlace interno (menú lateral, migas, botones «Volver», tarjetas) → confirmación antes de navegar. El clic se intercepta en la fase de
 *    captura del documento, antes de que lo procese el enrutador, de modo que no hace falta modificar cada enlace.
 * Límite conocido: el botón «Atrás» del navegador dentro de la aplicación no se puede interceptar de forma fiable con el App Router de Next.js (no hay
 * API oficial); queda cubierto solo si la navegación sale del sitio o recarga.
 */
export function useProtegerCambios(sucio: boolean, mensaje: string = MENSAJE_CAMBIOS_SIN_GUARDAR) {
  useEffect(() => {
    if (!sucio) return;

    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const alHacerClic = (e: MouseEvent) => {
      if (e.defaultPrevented) return;

      const ancla = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;

      if (!ancla) return;

      const abandona = navegacionInternaAbandona(
        { href: ancla.href, target: ancla.target, download: ancla.hasAttribute("download"), modificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, boton: e.button },
        { origen: window.location.origin, ruta: window.location.pathname, consulta: window.location.search },
      );

      if (abandona && !window.confirm(mensaje)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", alSalir);
    document.addEventListener("click", alHacerClic, true);

    return () => {
      window.removeEventListener("beforeunload", alSalir);
      document.removeEventListener("click", alHacerClic, true);
    };
  }, [sucio, mensaje]);
}
