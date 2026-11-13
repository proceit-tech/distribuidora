"use client";

import { useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";

import estilos from "./page.module.css";

type Estado = "OK" | "CREDENCIALES_INVALIDAS" | "NO_DISPONIBLE" | "TIMEOUT";
type Configuracion = {
  configurado: boolean;
  empresa: string;
  baseUrl: string;
  apiUsuario: string | null;
  tienePassword: boolean;
  activo: boolean;
  ultimaPruebaAt: string | null;
  ultimaPruebaEstado: Estado | null;
};
type Prueba = { estado: Estado; mensaje: string; credenciales: "GUARDADAS" | "INFORMADAS" | "ANTERIORES" };

const TEXTO_PRUEBA: Record<Estado, string> = {
  OK: "Conexión correcta",
  CREDENCIALES_INVALIDAS: "Credenciales rechazadas",
  NO_DISPONIBLE: "Gateway no disponible",
  TIMEOUT: "Tiempo de espera agotado",
};

async function pedir<T>(url: string, init: RequestInit | undefined, porDefecto: string): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? porDefecto);

  return j;
}

const fechaPy = (iso: string) => new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Asuncion" }).format(new Date(iso));

/**
 * Configuración → Facturación electrónica (PRO-133, G01): URL base, usuario (RUC) y contraseña de la API del gateway de la EMPRESA DE LA SESIÓN. No pide endpoints, referencias ni tokens. La contraseña nunca vuelve
 * del servidor: al editar solo se indica que existe una configurada y se puede reemplazar sin ver la anterior. «Probar conexión» solo autentica (POST /api/login): no crea facturas ni reserva numeración.
 */
export default function ConfiguracionFacturacionPage() {
  const [conf, setConf] = useState<Configuracion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState<"" | "guardar" | "probar">("");
  const [usuario, setUsuario] = useState("");
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let activo = true;

    pedir<Configuracion>("/api/facturacion/configuracion", { cache: "no-store" }, "No fue posible cargar la configuración.")
      .then((j) => {
        if (!activo) return;
        setConf(j);
        setUsuario(j.apiUsuario ?? "");
        setUrl(j.baseUrl);
      })
      .catch((e) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar la configuración.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [version]);

  const sinClave = conf !== null && !conf.tienePassword;
  const cambioUrl = conf !== null && url.trim() !== conf.baseUrl;
  const hayCambios = conf !== null && (cambioUrl || usuario !== (conf.apiUsuario ?? "") || password.length > 0);
  const puedeGuardar = ocupado === "" && url.trim().length >= 12 && usuario.trim().length >= 1 && (password.length > 0 || !sinClave);
  const puedeProbar = ocupado === "" && url.trim().length >= 12 && (usuario.trim().length >= 1 || (conf?.apiUsuario ?? "") !== "") && (password.length > 0 || conf?.tienePassword === true);

  // Cancelar: vuelve a lo guardado SIN escribir nada en el servidor (la contraseña escrita se descarta).
  function cancelar() {
    if (!conf || ocupado !== "") return;
    setUrl(conf.baseUrl);
    setUsuario(conf.apiUsuario ?? "");
    setPassword("");
    setVer(false);
    setError("");
    setAviso("");
    setPrueba(null);
  }

  // Un resultado de prueba ya mostrado corresponde a la URL/credenciales de ese momento: al editar cualquier campo deja de ser válido.
  const editar = (poner: (v: string) => void) => (e: { target: { value: string } }) => {
    poner(e.target.value);
    setPrueba(null);
    setAviso("");
  };

  async function guardar() {
    setOcupado("guardar");
    setError("");
    setAviso("");
    setPrueba(null);
    try {
      const j = await pedir<Configuracion>("/api/facturacion/configuracion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: url, apiUsuario: usuario, password }) }, "No fue posible guardar la configuración.");

      setConf(j);
      setUsuario(j.apiUsuario ?? "");
      setUrl(j.baseUrl);
      setPassword("");
      setVer(false);
      setAviso("Configuración guardada. Use «Probar conexión» para verificar la URL y las credenciales.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible guardar la configuración.");
    } finally {
      setOcupado("");
    }
  }

  async function probar() {
    setOcupado("probar");
    setError("");
    setAviso("");
    setPrueba(null);
    try {
      const j = await pedir<Prueba>("/api/facturacion/configuracion/probar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: url, apiUsuario: usuario, password }) }, "No fue posible probar la conexión.");

      setPrueba(j);
      if (j.credenciales !== "INFORMADAS") setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible probar la conexión.");
    } finally {
      setOcupado("");
    }
  }

  const clasePrueba = (e: Estado | null) => (e === "OK" ? estilos.ok : e === null ? estilos.pend : estilos.mal);

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Configuración</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Facturación electrónica</span>
          </nav>

          <h1>Facturación electrónica</h1>
        </div>
      </header>

      <p className={estilos.intro}>
        Conecte su empresa con el gateway de facturación electrónica. Indique la <strong>URL del gateway</strong>, el <strong>usuario (RUC)</strong> y la <strong>contraseña</strong> de la API.
        La configuración se guarda para <strong>esta empresa</strong> únicamente y la contraseña no se vuelve a mostrar. Si cambia la URL, la última conexión probada deja de valer y debe probar de nuevo.
      </p>

      {error ? <p className={estilos.error} role="alert">{error}</p> : null}
      {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}

      {cargando ? <p className={estilos.hint}>Cargando…</p> : null}

      {conf ? (
        <>
          <div className={estilos.card}>
            <h2>Estado</h2>
            {hayCambios ? <p className={estilos.hint}>Hay cambios sin guardar: el estado mostrado corresponde a la configuración guardada.</p> : null}
            <div className={estilos.estado}>
              <span>
                Configuración:{" "}
                <span className={`${estilos.badge} ${conf.configurado && conf.activo ? estilos.ok : estilos.pend}`}>{conf.configurado && conf.activo ? "Configurada" : "Sin configurar"}</span>
              </span>
              <span>
                Última conexión probada:{" "}
                {conf.ultimaPruebaEstado ? (
                  <>
                    <span className={`${estilos.badge} ${clasePrueba(conf.ultimaPruebaEstado)}`}>{TEXTO_PRUEBA[conf.ultimaPruebaEstado]}</span>
                    {conf.ultimaPruebaAt ? <small className={estilos.hint}> · {fechaPy(conf.ultimaPruebaAt)}</small> : null}
                  </>
                ) : (
                  <span className={`${estilos.badge} ${estilos.pend}`}>Sin probar</span>
                )}
              </span>
            </div>
          </div>

          <form
            className={estilos.card}
            onSubmit={(e) => {
              e.preventDefault();
              if (puedeGuardar) void guardar();
            }}
          >
            <h2>Credenciales de la API</h2>
            <div className={estilos.grid}>
              <label className={estilos.field}>
                <span>Empresa</span>
                <input value={conf.empresa} readOnly aria-readonly="true" />
              </label>
              <label className={estilos.field}>
                <span>URL del gateway *</span>
                <input value={url} onChange={editar(setUrl)} maxLength={200} autoComplete="off" spellCheck={false} inputMode="url" disabled={ocupado !== ""} aria-describedby="ayuda-url" />
                <small id="ayuda-url" className={estilos.hint}>
                  Solo https://dominio (sin ruta, sin IP ni direcciones internas). {cambioUrl ? "URL modificada: aún no guardada." : ""}
                </small>
              </label>
              <label className={estilos.field}>
                <span>Usuario API (RUC) *</span>
                <input value={usuario} onChange={editar(setUsuario)} maxLength={60} autoComplete="off" spellCheck={false} disabled={ocupado !== ""} />
              </label>
              <label className={estilos.field}>
                <span>Contraseña API {sinClave ? "*" : ""}</span>
                <span className={estilos.pwd}>
                  <input
                    type={ver ? "text" : "password"}
                    value={password}
                    onChange={editar(setPassword)}
                    disabled={ocupado !== ""}
                    maxLength={200}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={conf.tienePassword ? "•••••••• (configurada)" : ""}
                    aria-describedby="ayuda-clave"
                  />
                  <button type="button" className={ui.secondaryButton} onClick={() => setVer((v) => !v)} aria-pressed={ver} aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"}>
                    {ver ? "Ocultar" : "Mostrar"}
                  </button>
                </span>
                <small id="ayuda-clave" className={estilos.hint}>
                  {conf.tienePassword ? "Hay una contraseña configurada. Déjela en blanco para conservarla o escriba una nueva para reemplazarla." : "Escriba la contraseña de la API."}
                </small>
              </label>
            </div>

            <div className={estilos.acciones}>
              <button type="button" className={ui.secondaryButton} disabled={ocupado !== "" || !hayCambios} onClick={cancelar}>
                Cancelar
              </button>
              <button type="button" className={ui.secondaryButton} disabled={!puedeProbar} onClick={() => void probar()}>
                {ocupado === "probar" ? "Probando…" : "Probar conexión"}
              </button>
              <button type="submit" className={ui.primaryButton} disabled={!puedeGuardar}>
                {ocupado === "guardar" ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>

          {prueba ? (
            <p className={prueba.estado === "OK" ? estilos.aviso : estilos.error} role={prueba.estado === "OK" ? "status" : "alert"}>
              <strong>{TEXTO_PRUEBA[prueba.estado]}.</strong> {prueba.mensaje}
              {prueba.credenciales === "INFORMADAS" ? " Prueba TEMPORAL con la URL y las credenciales escritas en pantalla: aún no están guardadas y no cambian el estado de la configuración." : ""}
              {prueba.credenciales === "ANTERIORES" ? " Las credenciales guardadas cambiaron mientras se probaba: este resultado corresponde a las anteriores y NO se aplicó a la configuración actual. Pruebe de nuevo." : ""}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
