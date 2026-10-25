"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./login-form.module.css";

/** Cambio de la contraseña provisional por el propio usuario: contraseña actual + nueva (10 a 200 caracteres) + confirmación. No se muestra ni se guarda nada; el servidor valida todo. */
export function CambiarContrasenaForm() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (nueva.length < 10) return setError("La contraseña nueva debe tener al menos 10 caracteres.");
    if (nueva !== confirmar) return setError("La confirmación no coincide con la contraseña nueva.");

    setLoading(true);
    try {
      const response = await fetch("/api/auth/cambiar-contrasena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual, nueva }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "No fue posible cambiar la contraseña.");

        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("No fue posible conectarse al servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>Contraseña actual (provisional)</span>
        <div className={styles.inputWrap}>
          <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" maxLength={200} required />
        </div>
      </label>
      <label className={styles.field}>
        <span>Contraseña nueva (mínimo 10 caracteres)</span>
        <div className={styles.inputWrap}>
          <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" maxLength={200} required />
        </div>
      </label>
      <label className={styles.field}>
        <span>Repita la contraseña nueva</span>
        <div className={styles.inputWrap}>
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" maxLength={200} required />
        </div>
      </label>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <button className={styles.submit} type="submit" disabled={loading}>{loading ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
