"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./login-form.module.css";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState("");
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          empresa: empresa.trim().toLowerCase(),
          usuario,
          contrasena,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "No fue posible iniciar sesión.");
        return;
      }

      router.replace("/dashboard");
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
        <span>Código de empresa</span>
        <div className={styles.inputWrap}>
          <input value={empresa} onChange={(event) => setEmpresa(event.target.value)} autoComplete="organization" placeholder="proceit o casa_mingo" maxLength={30} required />
        </div>
      </label>

      <label className={styles.field}>
        <span>Usuario</span>

        <div className={styles.inputWrap}>
          <UserIcon />

          <input
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            autoComplete="username"
            placeholder="Ingrese su usuario"
            maxLength={80}
            required
          />
        </div>
      </label>

      <label className={styles.field}>
        <span>Contraseña</span>

        <div className={styles.inputWrap}>
          <LockIcon />

          <input
            type={mostrarContrasena ? "text" : "password"}
            value={contrasena}
            onChange={(event) => setContrasena(event.target.value)}
            autoComplete="current-password"
            placeholder="Ingrese su contraseña"
            maxLength={200}
            required
          />

          <button
            className={styles.showPassword}
            type="button"
            onClick={() => setMostrarContrasena((value) => !value)}
          >
            {mostrarContrasena ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className={styles.submit}
        type="submit"
        disabled={loading}
      >
        {loading ? "Ingresando…" : "Ingresar al sistema"}
        {!loading ? <span aria-hidden="true">→</span> : null}
      </button>
    </form>
  );
}
