/**
 * Controlador de la dirección de entrega de la pantalla «Nueva factura» (E04). Lógica pura, sin React ni red (probada con secuencias de eventos):
 *  · Al cambiar de cliente se LIMPIA de inmediato el destino anterior y se cargan solo los del nuevo cliente.
 *  · Cada carga tiene un número de secuencia y una señal de aborto: una respuesta tardía de un cliente anterior (o de una carga reemplazada) JAMÁS restaura su lista ni su destino.
 *  · Con la lista cargada se preselecciona el destino predeterminado (si existe); sin predeterminado hay que elegir; sin destinos no hay nada que elegir (aviso informativo, no bloquea).
 *  · Mientras carga o si la carga falla no se puede emitir (no se sabe si el cliente tiene destinos): se informa y se puede reintentar.
 */
import type { OpcionEntrega } from "@/lib/facturacion/entrega";

export type EstadoEntrega = { clienteId: string | null; fase: "SIN_CLIENTE" | "CARGANDO" | "LISTO" | "ERROR"; opciones: OpcionEntrega[]; elegida: string; mensaje: string };

const VACIO: EstadoEntrega = { clienteId: null, fase: "SIN_CLIENTE", opciones: [], elegida: "", mensaje: "" };

export function crearControlEntrega(dep: { cargar: (clienteId: string, signal: AbortSignal) => Promise<OpcionEntrega[]> }) {
  let estado: EstadoEntrega = VACIO;
  let secuencia = 0;
  let aborto: AbortController | null = null;
  const oyentes = new Set<() => void>();
  const poner = (e: EstadoEntrega) => {
    estado = e;
    oyentes.forEach((f) => f());
  };

  async function cargar(clienteId: string) {
    aborto?.abort();
    secuencia += 1;
    const mia = secuencia;
    const control = new AbortController();

    aborto = control;
    poner({ clienteId, fase: "CARGANDO", opciones: [], elegida: "", mensaje: "" });
    try {
      const opciones = await dep.cargar(clienteId, control.signal);

      if (mia !== secuencia || control.signal.aborted) return; // respuesta tardía: se descarta

      poner({ clienteId, fase: "LISTO", opciones, elegida: opciones.find((o) => o.esDefault)?.id ?? "", mensaje: "" });
    } catch (e) {
      if (mia !== secuencia || control.signal.aborted) return;
      poner({ clienteId, fase: "ERROR", opciones: [], elegida: "", mensaje: e instanceof Error && e.message ? e.message : "No fue posible cargar las direcciones de entrega del cliente." });
    }
  }

  return {
    estado: () => estado,
    suscribir(f: () => void) {
      oyentes.add(f);

      return () => {
        oyentes.delete(f);
      };
    },
    /** Cliente elegido (o null al quitarlo). El mismo cliente ya cargado no recarga ni pierde la elección del operador. */
    seleccionarCliente(clienteId: string | null): Promise<void> {
      if (clienteId === estado.clienteId && estado.fase !== "ERROR") return Promise.resolve();
      if (clienteId === null) {
        aborto?.abort();
        secuencia += 1;
        poner(VACIO);

        return Promise.resolve();
      }

      return cargar(clienteId);
    },
    /** El operador elige un destino de la lista del cliente actual; un id ajeno se ignora. */
    elegir(direccionId: string) {
      if (estado.fase !== "LISTO" || !estado.opciones.some((o) => o.id === direccionId)) return;
      poner({ ...estado, elegida: direccionId });
    },
    reintentar(): Promise<void> {
      return estado.fase === "ERROR" && estado.clienteId ? cargar(estado.clienteId) : Promise.resolve();
    },
  };
}

/** ¿Falta resolver el destino para poder revisar/emitir? (mensaje para el panel de pendientes; "" = listo). */
export function pendienteEntrega(e: EstadoEntrega): string {
  if (e.fase === "SIN_CLIENTE") return "";
  if (e.fase === "CARGANDO") return "esperar las direcciones de entrega del cliente";
  if (e.fase === "ERROR") return "cargar las direcciones de entrega del cliente";

  return e.opciones.length > 0 && e.elegida === "" ? "seleccionar la dirección de entrega" : "";
}
