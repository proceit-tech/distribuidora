"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { direccionCompleta, nombreEntrega } from "@/lib/facturacion/entrega";
import type { crearControlEntrega } from "@/lib/facturacion/entrega-control";

import estilos from "./page.module.css";

type Control = ReturnType<typeof crearControlEntrega>;

/**
 * Dirección de entrega del cliente elegido (E04). Solo muestra datos del cliente ACTUAL (si el estado pertenece a otro cliente, no se muestra nada de él). Sin destinos registrados es un aviso
 * informativo que no bloquea; con destinos hay que tener uno elegido (el predeterminado viene preseleccionado). No modifica el domicilio fiscal ni el establecimiento emisor.
 */
export function EntregaCliente({ control, clienteId }: { control: Control; clienteId: string }) {
  const e = useSyncExternalStore(control.suscribir, control.estado, control.estado);

  if (e.clienteId !== clienteId || e.fase === "CARGANDO" || e.fase === "SIN_CLIENTE") return <p className={estilos.hint} role="status">Cargando las direcciones de entrega del cliente…</p>;

  if (e.fase === "ERROR") {
    return (
      <div className={estilos.fieldError} role="alert">
        {e.mensaje} <button type="button" className={estilos.linkButton} onClick={() => void control.reintentar()}>Reintentar</button>
      </div>
    );
  }
  if (e.opciones.length === 0) {
    return (
      <p className={estilos.hint} role="status">
        Este cliente no tiene direcciones de entrega registradas: la factura se emite igual, solo con su domicilio fiscal. Puede registrarlas en <Link href="/clientes">Clientes → Direcciones</Link>.
      </p>
    );
  }

  const elegida = e.opciones.find((o) => o.id === e.elegida) ?? null;

  return (
    <div className={estilos.entregaCliente}>
      <label className={estilos.field}>
        <span>Dirección de entrega *</span>
        <select aria-label="Dirección de entrega" value={e.elegida} onChange={(ev) => control.elegir(ev.target.value)}>
          {e.elegida === "" ? <option value="">Seleccione una dirección…</option> : null}
          {e.opciones.map((o) => <option key={o.id} value={o.id}>{nombreEntrega(o)}{o.esDefault ? " (principal)" : ""} — {direccionCompleta(o)}</option>)}
        </select>
      </label>
      {elegida ? <small className={estilos.hint}>{direccionCompleta(elegida)}{elegida.horario.trim() ? ` · Recepción: ${elegida.horario.trim()}` : ""}</small> : <small className={estilos.fieldError} role="alert">Seleccione la dirección de entrega.</small>}
      <small className={estilos.hint}>Es solo el destino de la mercadería: no cambia el domicilio fiscal del receptor ni el establecimiento emisor.</small>
    </div>
  );
}
