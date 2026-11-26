"use client";

import { useEffect, useRef } from "react";

import estilos from "./page.module.css";

/**
 * Campo «Cantidad» del último producto añadido, DENTRO del selector avanzado (que es un diálogo aria-modal: el foco nunca sale de él). Recibe foco y selección en cada alta
 * (`solicitud` cambia también al repetir el mismo producto). Enter devuelve el foco al filtro para seguir añadiendo; la edición actúa sobre la línea real de la factura.
 */
export function CantidadAnadido({ descripcion, valor, valida, solicitud, alCambiar, alTerminar }: { descripcion: string; valor: string; valida: boolean; solicitud: number; alCambiar: (valor: string) => void; alTerminar: () => void }) {
  const campo = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, [solicitud]);

  return (
    <div className={estilos.cantidadAnadido} role="group" aria-label="Cantidad del último producto añadido">
      <label htmlFor="cantidad-anadido">Cantidad de «{descripcion}»</label>
      <input
        id="cantidad-anadido"
        ref={campo}
        className={`${estilos.qty} ${valida ? "" : estilos.invalid}`}
        inputMode="decimal"
        value={valor}
        aria-invalid={valida ? undefined : true}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            alTerminar();
          }
        }}
      />
      {!valida ? <small className={estilos.fieldError}>Mayor que 0, hasta 4 decimales (coma o punto)</small> : null}
    </div>
  );
}
