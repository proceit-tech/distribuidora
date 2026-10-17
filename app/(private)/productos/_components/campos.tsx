"use client";

import { idCampo } from "@/lib/productos/pestanas";

import styles from "./producto-form.module.css";

export type Errores = Record<string, string>;

/** Etiqueta con asterisco rojo en los obligatorios («Texto *») y mensaje de error del campo debajo. */
export function Campo({
  etiqueta,
  campo,
  errores,
  ayuda,
  children,
}: {
  etiqueta: string;
  campo?: string;
  errores?: Errores;
  ayuda?: string;
  children: React.ReactNode;
}) {
  const obligatorio = etiqueta.trimEnd().endsWith("*");
  const base = obligatorio ? etiqueta.trimEnd().slice(0, -1).trimEnd() : etiqueta;
  const error = campo ? errores?.[campo] : undefined;

  return (
    <label className={[styles.field, error ? styles.conError : ""].filter(Boolean).join(" ")}>
      <span>
        {base}
        {obligatorio ? <b aria-hidden="true"> *</b> : null}
      </span>
      {children}
      {ayuda && !error ? <small className={styles.ayuda}>{ayuda}</small> : null}
      {error ? (
        <small className={styles.campoError} role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}

export function Texto({
  etiqueta,
  campo,
  errores,
  valor,
  alCambiar,
  maxLength,
  disabled,
  readOnly,
  tipo = "text",
  placeholder,
  ayuda,
  modo,
}: {
  etiqueta: string;
  campo: string;
  errores: Errores;
  valor: string;
  alCambiar: (valor: string) => void;
  maxLength?: number;
  disabled?: boolean;
  readOnly?: boolean;
  tipo?: "text" | "email" | "url";
  placeholder?: string;
  ayuda?: string;
  modo?: "decimal" | "numeric" | "text";
}) {
  return (
    <Campo etiqueta={etiqueta} campo={campo} errores={errores} ayuda={ayuda}>
      <input
        id={idCampo(campo)}
        type={tipo}
        inputMode={modo}
        value={valor}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-invalid={errores[campo] ? true : undefined}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </Campo>
  );
}

export function Area({
  etiqueta,
  campo,
  errores,
  valor,
  alCambiar,
  maxLength,
}: {
  etiqueta: string;
  campo: string;
  errores: Errores;
  valor: string;
  alCambiar: (valor: string) => void;
  maxLength?: number;
}) {
  return (
    <Campo etiqueta={etiqueta} campo={campo} errores={errores}>
      <textarea id={idCampo(campo)} value={valor} maxLength={maxLength} aria-invalid={errores[campo] ? true : undefined} onChange={(e) => alCambiar(e.target.value)} />
    </Campo>
  );
}

export function Selector({
  etiqueta,
  campo,
  errores,
  valor,
  alCambiar,
  opciones,
  disabled,
}: {
  etiqueta: string;
  campo: string;
  errores: Errores;
  valor: string;
  alCambiar: (valor: string) => void;
  opciones: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <Campo etiqueta={etiqueta} campo={campo} errores={errores}>
      <select id={idCampo(campo)} value={valor} disabled={disabled} aria-invalid={errores[campo] ? true : undefined} onChange={(e) => alCambiar(e.target.value)}>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/** Fecha dd/mm/aaaa (formato de Paraguay); la API recibe ISO tras la conversión del formulario. */
export function Fecha({ etiqueta, campo, errores, valor, alCambiar }: { etiqueta: string; campo: string; errores: Errores; valor: string; alCambiar: (valor: string) => void }) {
  return (
    <Texto etiqueta={etiqueta} campo={campo} errores={errores} valor={valor} alCambiar={alCambiar} placeholder="dd/mm/aaaa" maxLength={10} modo="numeric" />
  );
}

export function Casilla({ etiqueta, campo, valor, alCambiar, disabled }: { etiqueta: string; campo?: string; valor: boolean; alCambiar: (valor: boolean) => void; disabled?: boolean }) {
  return (
    <label>
      <input id={campo ? idCampo(campo) : undefined} type="checkbox" checked={valor} disabled={disabled} onChange={(e) => alCambiar(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

export function SinRegistros({ texto }: { texto: string }) {
  return <div className={styles.empty}>{texto}</div>;
}

/** Dato informativo (solo lectura): se presenta como texto, no como un campo editable ni deshabilitado. */
export function Dato({ etiqueta, valor, ayuda, vacio = "—" }: { etiqueta: string; valor: string; ayuda?: string; vacio?: string }) {
  return (
    <div className={styles.field}>
      <span>{etiqueta}</span>
      <div className={styles.soloLectura}>{valor || vacio}</div>
      {ayuda ? <small className={styles.ayuda}>{ayuda}</small> : null}
    </div>
  );
}

/** Subtítulo de un grupo de campos dentro de una pestaña. */
export function SubTitulo({ children }: { children: React.ReactNode }) {
  return <h4 className={styles.subTitulo}>{children}</h4>;
}
