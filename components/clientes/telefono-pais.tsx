"use client";

import {
  PAIS_OTRO,
  PLANES_TELEFONIA,
  planDe,
  validarTelefono,
  type CampoTelefonico,
  type TelefonoForm,
} from "@/lib/fiscal/telefono";

type Props = {
  campo: CampoTelefonico;
  etiqueta: string;
  /** El número recibe el foco en `${id}`; el país en `${id}-pais`, el área en `${id}-area` y el DDI de "Otro país" en `${id}-ddi`. */
  id: string;
  valor: TelefonoForm;
  onChange: (nuevo: TelefonoForm) => void;
  /** Clases de cada pantalla (alta con estilos globales; edición con módulo CSS). */
  clases?: { campo?: string; selector?: string; entrada?: string };
  /** Texto de los mensajes de error ("el celular del contacto 2"); por defecto "el teléfono" / "el celular". */
  etiquetaError?: string;
};

/**
 * Teléfono / celular por país (retificación 2026-10-11): selector de PAÍS DEL NÚMERO (Paraguay por defecto), DDI asociado
 * solo (nunca se pide para países listados), código de área/DDD solo cuando el plan del país lo usa (Paraguay no lo muestra)
 * y número. La regla vive en `lib/fiscal/telefono.ts` (misma que las API). No antepone nada ni corrige lo escrito.
 */
export function TelefonoPais({ campo, etiqueta, id, valor, onChange, clases, etiquetaError }: Props) {
  const plan = planDe(valor.pais);
  const esOtro = valor.pais === PAIS_OTRO;
  const resultado = valor.numero.trim() === "" && valor.area.trim() === "" ? null : validarTelefono(campo, valor, etiquetaError);
  const ayudaId = `${id}-ayuda`;
  const columnas = [esOtro ? "minmax(150px, 34%) 84px" : "minmax(150px, 34%)", plan?.area ? "96px" : null, "1fr"].filter(Boolean).join(" ");

  function cambiarPais(iso: string) {
    const nuevoPlan = planDe(iso);

    if (valor.area.trim() !== "" && !nuevoPlan?.area) {
      if (!window.confirm("El país elegido no usa código de área separado: se borrará el código de área escrito. ¿Desea continuar?")) return;
    }

    onChange({
      pais: iso,
      ddi: iso === PAIS_OTRO ? "" : nuevoPlan?.ddi ?? "",
      area: nuevoPlan?.area ? valor.area : "",
      numero: valor.numero,
    });
  }

  return (
    <div className={clases?.campo} role="group" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`}>{etiqueta}</span>
      <div style={{ display: "grid", gridTemplateColumns: columnas, gap: 8 }}>
        <select
          aria-label={`País del número — ${etiqueta}`}
          className={clases?.selector}
          id={`${id}-pais`}
          onChange={(evento) => cambiarPais(evento.target.value)}
          value={valor.pais}
        >
          <option value="">País…</option>
          {PLANES_TELEFONIA.map((p) => (
            <option key={p.iso} value={p.iso}>
              {p.nombre} (+{p.ddi})
            </option>
          ))}
          <option value={PAIS_OTRO}>Otro país…</option>
        </select>

        {esOtro ? (
          <input
            aria-label={`DDI del país — ${etiqueta}`}
            className={clases?.entrada}
            id={`${id}-ddi`}
            inputMode="numeric"
            onChange={(evento) => onChange({ ...valor, ddi: evento.target.value.replace(/\D/g, "").slice(0, 3) })}
            placeholder="DDI"
            value={valor.ddi}
          />
        ) : null}

        {plan?.area ? (
          <input
            aria-label={`Código de área (DDD) — ${etiqueta}`}
            className={clases?.entrada}
            id={`${id}-area`}
            inputMode="numeric"
            onChange={(evento) => onChange({ ...valor, area: evento.target.value })}
            placeholder="Área"
            value={valor.area}
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
          onChange={(evento) => onChange({ ...valor, numero: evento.target.value })}
          type="tel"
          value={valor.numero}
        />
      </div>
      <small id={ayudaId} style={{ color: resultado !== null && !resultado.ok ? "#b3263b" : "#6f8498", fontSize: 12 }}>
        {resultado !== null && !resultado.ok
          ? resultado.error
          : resultado !== null && resultado.ok
            ? `Se guardará: +${resultado.valor.ddi}${resultado.valor.area ? ` (${resultado.valor.area})` : ""} ${resultado.valor.numero}`
            : valor.pais === ""
              ? "Seleccione el país del número."
              : esOtro
                ? "País sin plan de numeración configurado: DDI de 1 a 3 dígitos; DDI + número hasta 15 dígitos (UIT E.164)."
                : plan?.ayuda}
      </small>
    </div>
  );
}
