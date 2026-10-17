"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

import {
  PAIS_LEGADO_SIN_IDENTIFICAR,
  advertenciaTelefono,
  buscarPaisesTelefonia,
  planDe,
  validarTelefono,
  type CampoTelefonico,
  type PlanPais,
  type TelefonoForm,
} from "@/lib/fiscal/telefono";

type Props = {
  campo: CampoTelefonico;
  etiqueta: string;
  /** El número recibe el foco en `${id}`; el país en `${id}-pais` y el área en `${id}-area`. */
  id: string;
  valor: TelefonoForm;
  onChange: (nuevo: TelefonoForm) => void;
  /** Clases de cada pantalla (alta con estilos globales; edición con módulo CSS). */
  clases?: { campo?: string; selector?: string; entrada?: string };
  /** Texto de los mensajes de error ("el celular del contacto 2"); por defecto "el teléfono" / "el celular". */
  etiquetaError?: string;
};

const MAXIMO_RESULTADOS = 80;

/**
 * Teléfono / celular por país (catálogo mundial UIT E.164) en UNA fila compacta: selector de país con búsqueda integrada
 * (nombre, ISO o DDI; Paraguay +595 por defecto), código de área solo donde el plan del país lo usa y número. Una sola línea
 * de ayuda (error, aviso o «Se guardará…»). La regla vive en `lib/fiscal/telefono.ts` (la misma de las API); no antepone ni
 * corrige nada. Se adapta al ancho: en móvil los controles se reparten en dos líneas.
 */
export function TelefonoPais({ campo, etiqueta, id, valor, onChange, clases, etiquetaError }: Props) {
  const listaId = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const plan = planDe(valor.pais);
  const legado = valor.pais === PAIS_LEGADO_SIN_IDENTIFICAR;
  const resultado = valor.numero.trim() === "" && valor.area.trim() === "" ? null : validarTelefono(campo, valor, etiquetaError);
  const advertencia = resultado !== null && resultado.ok ? advertenciaTelefono(valor) : null;
  const ayudaId = `${id}-ayuda`;
  const abierto = texto !== null;
  const coincidencias = abierto ? buscarPaisesTelefonia(texto) : [];
  const visibles = coincidencias.slice(0, MAXIMO_RESULTADOS);
  const etiquetaPais = plan ? `${plan.nombre} (+${plan.ddi})` : legado ? `País sin identificar${valor.ddi ? ` (+${valor.ddi})` : ""}` : "";

  function elegir(p: PlanPais) {
    if (valor.area.trim() !== "" && !p.area) {
      if (!window.confirm("El país elegido no usa código de área separado: se borrará el código de área escrito. ¿Desea continuar?")) {
        setTexto(null);
        return;
      }
    }

    onChange({ pais: p.iso, ddi: p.ddi, area: p.area ? valor.area : "", numero: valor.numero });
    setTexto(null);
  }

  function teclado(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!abierto) setTexto("");
      else setIndice((i) => Math.min(i + 1, Math.max(visibles.length - 1, 0)));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && abierto) {
      evento.preventDefault();
      if (visibles[indice]) elegir(visibles[indice]);
    } else if (evento.key === "Escape" && abierto) {
      evento.preventDefault();
      setTexto(null);
    }
  }

  const mensaje =
    resultado !== null && !resultado.ok
      ? resultado.error
      : resultado !== null && resultado.ok
        ? `Se guardará: +${resultado.valor.ddi}${resultado.valor.area ? ` (${resultado.valor.area})` : ""} ${resultado.valor.numero}${advertencia ? ` — ${advertencia}` : ""}`
        : valor.pais === ""
          ? "Seleccione el país del número."
          : legado
            ? "País sin identificar (registro anterior): seleccione el país real."
            : "";
  const estiloControl = { flex: "1 1 190px", minWidth: 0, position: "relative" as const };

  return (
    <div className={clases?.campo} role="group" aria-labelledby={`${id}-etiqueta`} ref={contenedor}>
      <span id={`${id}-etiqueta`}>{etiqueta}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <div style={estiloControl}>
          <input
            aria-autocomplete="list"
            aria-controls={abierto ? listaId : undefined}
            aria-expanded={abierto}
            aria-label={`País del número — ${etiqueta} (escriba para buscar por nombre, ISO o DDI)`}
            autoComplete="off"
            className={clases?.entrada ?? clases?.selector}
            id={`${id}-pais`}
            onBlur={() => setTexto(null)}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setIndice(0);
            }}
            onFocus={(evento) => {
              setTexto("");
              setIndice(0);
              evento.target.select();
            }}
            onKeyDown={teclado}
            placeholder={etiquetaPais || "País…"}
            role="combobox"
            style={{ width: "100%" }}
            type="text"
            value={abierto ? texto : etiquetaPais}
          />
          {abierto ? (
            <ul
              id={listaId}
              role="listbox"
              style={{
                position: "absolute",
                zIndex: 30,
                left: 0,
                right: 0,
                top: "100%",
                margin: "2px 0 0",
                padding: 4,
                maxHeight: 240,
                overflowY: "auto",
                listStyle: "none",
                background: "var(--surface, #fff)",
                color: "inherit",
                border: "1px solid #cbd5df",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15, 35, 55, 0.18)",
              }}
            >
              {visibles.length === 0 ? (
                <li style={{ padding: "6px 8px", fontSize: 13, color: "#b3263b" }}>Ningún país coincide con «{texto?.trim()}».</li>
              ) : (
                visibles.map((p, i) => (
                  <li
                    aria-selected={p.iso === valor.pais}
                    key={p.iso}
                    onMouseDown={(evento) => {
                      evento.preventDefault();
                      elegir(p);
                    }}
                    role="option"
                    style={{
                      padding: "5px 8px",
                      fontSize: 13,
                      cursor: "pointer",
                      borderRadius: 6,
                      background: i === indice ? "rgba(21, 128, 120, 0.14)" : "transparent",
                      fontWeight: p.iso === valor.pais ? 600 : 400,
                    }}
                  >
                    {p.nombre} · {p.iso} <span style={{ opacity: 0.7 }}>(+{p.ddi})</span>
                  </li>
                ))
              )}
              {coincidencias.length > visibles.length ? (
                <li style={{ padding: "4px 8px", fontSize: 12, opacity: 0.7 }}>Hay más resultados: escriba para acotar la búsqueda.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {plan?.area ? (
          <input
            aria-label={`Código de área (DDD) — ${etiqueta}`}
            className={clases?.entrada}
            id={`${id}-area`}
            inputMode="numeric"
            onChange={(evento) => onChange({ ...valor, area: evento.target.value })}
            placeholder="Área"
            style={{ flex: "0 0 84px", minWidth: 0 }}
            title={`Código de área de ${plan.nombre}`}
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
          placeholder="Número"
          style={{ flex: "2 1 150px", minWidth: 0 }}
          title={plan?.ayuda}
          type="tel"
          value={valor.numero}
        />
      </div>
      {mensaje ? (
        <small
          id={ayudaId}
          style={{
            display: "block",
            marginTop: 2,
            color: resultado !== null && !resultado.ok ? "#b3263b" : advertencia ? "#8a5a00" : "#6f8498",
            fontSize: 12,
            lineHeight: 1.3,
          }}
        >
          {mensaje}
        </small>
      ) : null}
    </div>
  );
}
