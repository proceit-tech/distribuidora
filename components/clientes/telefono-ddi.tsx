"use client";

import { useState } from "react";

import { DDI_FRECUENTES, LIMITES_TELEFONO, validarTelefonoFiscal, type CampoTelefonico } from "@/lib/fiscal/telefono";

type Props = {
  campo: CampoTelefonico;
  etiqueta: string;
  /** Prefijo de los ids: `${id}-ddi`, `${id}-ddi-otro`, `${id}-numero`. El número recibe el foco por `${id}`. */
  id: string;
  ddi: string;
  numero: string;
  onChange: (cambio: { ddi?: string; numero?: string }) => void;
  /** Clases del contenedor de cada pantalla (alta usa estilos globales; edición, módulo CSS). */
  clases?: { campo?: string; selector?: string; entrada?: string };
};

const OTRO = "__otro__";

/**
 * Teléfono / celular fiscal (D214 / D215): DDI en un selector propio y número nacional en otra entrada.
 * Reutilizado por "Nuevo cliente" y por la edición. La normalización y los límites viven en `lib/fiscal/telefono.ts`
 * (misma regla que las API); aquí solo se muestran. No se antepone el DDI ni se corrige lo escrito.
 */
export function TelefonoDdi({ campo, etiqueta, id, ddi, numero, onChange, clases }: Props) {
  const enLista = DDI_FRECUENTES.some((d) => d.ddi === ddi);
  const [modoOtro, setModoOtro] = useState(ddi !== "" && !enLista);
  const L = LIMITES_TELEFONO[campo];
  const resultado = numero.trim() === "" ? null : validarTelefonoFiscal(campo, ddi, numero);
  const ayudaId = `${id}-ayuda`;

  return (
    <div className={clases?.campo} role="group" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`}>{etiqueta}</span>
      <div style={{ display: "grid", gridTemplateColumns: modoOtro ? "minmax(120px, 30%) 84px 1fr" : "minmax(130px, 38%) 1fr", gap: 8 }}>
        <select
          aria-label={`DDI (código de país) — ${etiqueta}`}
          className={clases?.selector}
          id={`${id}-ddi`}
          onChange={(evento) => {
            const valor = evento.target.value;

            if (valor === OTRO) {
              setModoOtro(true);
              onChange({ ddi: "" });
            } else {
              setModoOtro(false);
              onChange({ ddi: valor });
            }
          }}
          value={modoOtro ? OTRO : enLista ? ddi : ""}
        >
          <option value="">DDI…</option>
          {DDI_FRECUENTES.map((d) => (
            <option key={d.ddi} value={d.ddi}>
              +{d.ddi} · {d.pais}
            </option>
          ))}
          <option value={OTRO}>Otro DDI…</option>
        </select>

        {modoOtro ? (
          <input
            aria-label={`Otro DDI — ${etiqueta}`}
            className={clases?.entrada}
            id={`${id}-ddi-otro`}
            inputMode="numeric"
            onChange={(evento) => onChange({ ddi: evento.target.value.replace(/\D/g, "").slice(0, 3) })}
            placeholder="DDI"
            value={ddi}
          />
        ) : null}

        <input
          aria-describedby={ayudaId}
          aria-invalid={resultado !== null && !resultado.ok ? true : undefined}
          aria-label={`Número — ${etiqueta}`}
          autoComplete="tel-national"
          className={clases?.entrada}
          id={id}
          inputMode="tel"
          onChange={(evento) => onChange({ numero: evento.target.value })}
          type="tel"
          value={numero}
        />
      </div>
      <small id={ayudaId} style={{ color: resultado !== null && !resultado.ok ? "#b3263b" : "#6f8498", fontSize: 12 }}>
        {resultado !== null && !resultado.ok
          ? resultado.error
          : resultado !== null && resultado.ok
            ? `Se guardará: +${resultado.ddi} ${resultado.numero}`
            : `${L.min} a ${L.max} dígitos, sin el DDI${campo === "telefono" ? "; incluya el prefijo de la ciudad si es de Paraguay" : ""}.`}
      </small>
    </div>
  );
}
