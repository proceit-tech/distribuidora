"use client";

import { useState } from "react";

import {
  PAIS_LEGADO_SIN_IDENTIFICAR,
  advertenciaTelefono,
  buscarPaisesTelefonia,
  planDe,
  validarTelefono,
  type CampoTelefonico,
  type TelefonoForm,
} from "@/lib/fiscal/telefono";

type Props = {
  campo: CampoTelefonico;
  etiqueta: string;
  /** El número recibe el foco en `${id}`; la búsqueda en `${id}-buscar`, el país en `${id}-pais` y el área en `${id}-area`. */
  id: string;
  valor: TelefonoForm;
  onChange: (nuevo: TelefonoForm) => void;
  /** Clases de cada pantalla (alta con estilos globales; edición con módulo CSS). */
  clases?: { campo?: string; selector?: string; entrada?: string };
  /** Texto de los mensajes de error ("el celular del contacto 2"); por defecto "el teléfono" / "el celular". */
  etiquetaError?: string;
};

/**
 * Teléfono / celular por país (catálogo mundial UIT E.164, decisión 2026-10-11): búsqueda por nombre, ISO o DDI sobre TODOS
 * los países y territorios con DDI; Paraguay (+595) por defecto y sin DDD; el DDI se asocia solo; código de área únicamente
 * donde el plan del país lo usa; el ISO real se conserva (nunca "otro"). La regla vive en `lib/fiscal/telefono.ts`
 * (misma que las API). No antepone nada ni corrige lo escrito.
 */
export function TelefonoPais({ campo, etiqueta, id, valor, onChange, clases, etiquetaError }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const plan = planDe(valor.pais);
  const legado = valor.pais === PAIS_LEGADO_SIN_IDENTIFICAR;
  const resultado = valor.numero.trim() === "" && valor.area.trim() === "" ? null : validarTelefono(campo, valor, etiquetaError);
  const advertencia = resultado !== null && resultado.ok ? advertenciaTelefono(valor) : null;
  const ayudaId = `${id}-ayuda`;
  const coincidencias = buscarPaisesTelefonia(busqueda);
  const opciones = plan && !coincidencias.some((p) => p.iso === plan.iso) ? [plan, ...coincidencias] : coincidencias;
  const columnas = [plan?.area ? "96px" : null, "1fr"].filter(Boolean).join(" ");

  function cambiarPais(iso: string) {
    const nuevoPlan = planDe(iso);

    if (valor.area.trim() !== "" && !nuevoPlan?.area) {
      if (!window.confirm("El país elegido no usa código de área separado: se borrará el código de área escrito. ¿Desea continuar?")) return;
    }

    onChange({ pais: iso, ddi: nuevoPlan?.ddi ?? "", area: nuevoPlan?.area ? valor.area : "", numero: valor.numero });
  }

  return (
    <div className={clases?.campo} role="group" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`}>{etiqueta}</span>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 28%) 1fr", gap: 8 }}>
        <input
          aria-label={`Buscar país por nombre, ISO o DDI — ${etiqueta}`}
          autoComplete="off"
          className={clases?.entrada}
          id={`${id}-buscar`}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar país / DDI"
          type="search"
          value={busqueda}
        />
        <select
          aria-label={`País del número — ${etiqueta}`}
          className={clases?.selector}
          id={`${id}-pais`}
          onChange={(evento) => cambiarPais(evento.target.value)}
          value={valor.pais}
        >
          <option value="">{legado ? `País sin identificar${valor.ddi ? ` (+${valor.ddi})` : ""} — seleccione…` : "País…"}</option>
          {opciones.map((p) => (
            <option key={p.iso} value={p.iso}>
              {p.nombre} · {p.iso} (+{p.ddi})
            </option>
          ))}
        </select>
      </div>
      {busqueda.trim() !== "" && coincidencias.length === 0 ? (
        <small style={{ color: "#b3263b", fontSize: 12 }}>Ningún país coincide con «{busqueda.trim()}».</small>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: columnas, gap: 8, marginTop: 6 }}>
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
            ? `Se guardará: ${resultado.valor.pais} +${resultado.valor.ddi}${resultado.valor.area ? ` (${resultado.valor.area})` : ""} ${resultado.valor.numero}${advertencia ? ` — ${advertencia}` : ""}`
            : valor.pais === ""
              ? "Seleccione el país del número."
              : plan?.ayuda}
      </small>
    </div>
  );
}
