"use client";

import { useState } from "react";

import { fechaLocalAIso, isoAFechaLocal } from "@/lib/listas-precio/calculos";

type Props = {
  id?: string;
  /** Valor en formato ISO (yyyy-mm-dd) o vacío. */
  valor: string;
  alCambiar: (iso: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** Mensaje bajo el campo cuando lo escrito no es una fecha válida (la clase la pone el formulario). */
  claseError?: string;
};

/**
 * Fecha en formato local dd/mm/aaaa (es-PY), independiente del idioma del navegador. Emite ISO (yyyy-mm-dd) solo cuando lo escrito es una
 * fecha real del calendario; mientras se escribe o si es inválida emite vacío.
 */
export function CampoFecha({ id, valor, alCambiar, disabled, claseError, ...aria }: Props) {
  const [estado, setEstado] = useState({ texto: isoAFechaLocal(valor), previo: valor });
  const [tocado, setTocado] = useState(false);

  // Cambio externo del valor (cargar, restablecer): se vuelve a formatear. Los emitidos por este campo no lo reinician.
  if (valor !== estado.previo) setEstado({ texto: isoAFechaLocal(valor), previo: valor });

  const invalida = tocado && estado.texto.trim() !== "" && fechaLocalAIso(estado.texto) === null;

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        disabled={disabled}
        value={estado.texto}
        aria-invalid={invalida || aria["aria-invalid"] ? true : undefined}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => {
          const texto = e.target.value;
          const iso = fechaLocalAIso(texto) ?? "";

          setEstado({ texto, previo: iso });
          alCambiar(iso);
        }}
        onBlur={() => {
          setTocado(true);

          const iso = fechaLocalAIso(estado.texto);

          // Normaliza lo escrito a dd/mm/aaaa cuando es válido.
          if (iso) setEstado({ texto: isoAFechaLocal(iso), previo: iso });
        }}
      />
      {invalida ? <span className={claseError} role="alert">Fecha no válida; use dd/mm/aaaa.</span> : null}
    </>
  );
}
