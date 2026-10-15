"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";

import estilos from "./page.module.css";

type Punto = { id: string; codigo: string; nombre: string; ultimoNumero: number; activo: boolean; proximo: string };
type Sucursal = { id: string; nombre: string; establecimiento: string | null; puntos: Punto[] };

const NUMERO_OK = /^\d{1,7}$/;

async function pedir<T>(url: string, init: RequestInit | undefined, porDefecto: string): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? porDefecto);

  return j;
}

/**
 * Puntos de expedición (PRO-129): administración fiscal. Un punto NUEVO nace inactivo con el último número realmente emitido informado y confirmado (también el emitido por otros sistemas);
 * se activa en un segundo paso, confirmando otra vez ese número. La numeración nunca retrocede. El servidor y la función SQL vuelven a validar todo.
 */
export default function PuntosExpedicionPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const [sucursalId, setSucursalId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [ultimo, setUltimo] = useState("");
  const [confirmaAlta, setConfirmaAlta] = useState(false);

  const [activando, setActivando] = useState<{ id: string; numero: string; confirma: boolean } | null>(null);

  const [version, setVersion] = useState(0);

  // Recarga tras cada operación: se vuelve a leer del servidor (la numeración mostrada es siempre la de la base).
  const cargar = async () => {
    setCargando(true);
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    let activo = true;

    pedir<{ sucursales: Sucursal[] }>("/api/facturacion/puntos", { cache: "no-store" }, "No fue posible cargar los puntos de expedición.")
      .then((j) => {
        if (activo) setSucursales(j.sucursales);
      })
      .catch((e) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar los puntos de expedición.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [version]);

  const sucursal = sucursales.find((s) => s.id === sucursalId);
  const codigoOk = /^\d{3}$/.test(codigo) && codigo !== "000";
  const altaLista = sucursal !== undefined && sucursal.establecimiento !== null && codigoOk && nombre.trim().length >= 1 && NUMERO_OK.test(ultimo) && Number(ultimo) <= 9999998 && confirmaAlta;

  async function ejecutar(accion: () => Promise<void>, ok: string) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      await accion();
      setAviso(ok);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible completar la operación.");
    } finally {
      setOcupado(false);
    }
  }

  const crear = () =>
    ejecutar(async () => {
      await pedir("/api/facturacion/puntos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sucursalId, codigo, nombre, ultimoNumero: ultimo, confirmado: confirmaAlta }) }, "No fue posible crear el punto.");
      setCodigo("");
      setNombre("");
      setUltimo("");
      setConfirmaAlta(false);
    }, "Punto creado INACTIVO. Actívelo confirmando otra vez el último número emitido.");

  const activar = () =>
    ejecutar(async () => {
      if (!activando) return;

      await pedir(`/api/facturacion/puntos/${activando.id}/activar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ultimoNumero: activando.numero, confirmado: activando.confirma }) }, "No fue posible activar el punto.");
      setActivando(null);
    }, "Punto activado: la próxima factura continúa desde el número confirmado.");

  const desactivar = (id: string) => ejecutar(async () => { await pedir(`/api/facturacion/puntos/${id}/desactivar`, { method: "POST" }, "No fue posible desactivar el punto."); }, "Punto desactivado. La numeración se conserva.");

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Facturación</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Puntos de expedición</span>
          </nav>

          <h1>Puntos de expedición</h1>
        </div>
      </header>

      <p className={estilos.intro}>
        Cada factura se numera con el establecimiento de la sucursal y un punto de expedición. Antes de activar un punto, informe y confirme el <strong>último número realmente emitido</strong> con ese
        establecimiento y punto (incluso por otros sistemas): la numeración continúa desde ahí y nunca retrocede. El timbrado y las credenciales los gestiona el gateway, no esta pantalla.
      </p>

      {error ? <p className={estilos.error} role="alert">{error}</p> : null}
      {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}

      <div className={estilos.card}>
        <h2>Nuevo punto de expedición</h2>
        <div className={estilos.grid}>
          <label className={estilos.field}>
            <span>Sucursal *</span>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Seleccione…</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.establecimiento ? ` (${s.establecimiento})` : " — sin establecimiento SIFEN"}</option>)}
            </select>
            {sucursal && sucursal.establecimiento === null ? <small className={estilos.errorCampo}>Esta sucursal no tiene establecimiento SIFEN: configúrelo antes de crear puntos.</small> : null}
          </label>

          <label className={estilos.field}>
            <span>Código (3 dígitos) *</span>
            <input inputMode="numeric" maxLength={3} placeholder="001" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
            {codigo !== "" && !codigoOk ? <small className={estilos.errorCampo}>Use 3 dígitos, de 001 a 999.</small> : null}
          </label>

          <label className={estilos.field}>
            <span>Nombre *</span>
            <input maxLength={60} placeholder="Caja principal" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>

          <label className={estilos.field}>
            <span>Último número emitido *</span>
            <input inputMode="numeric" maxLength={7} placeholder="Ej.: 120 (0 si nunca se emitió)" value={ultimo} onChange={(e) => setUltimo(e.target.value.replace(/\D/g, ""))} />
            {NUMERO_OK.test(ultimo) ? <small className={estilos.hint}>La próxima factura será la N.º {String(Number(ultimo) + 1).padStart(7, "0")}.</small> : <small className={estilos.hint}>Obligatorio; no se asume cero.</small>}
          </label>
        </div>

        <label className={estilos.check}>
          <input type="checkbox" checked={confirmaAlta} onChange={(e) => setConfirmaAlta(e.target.checked)} /> Confirmo que {ultimo !== "" ? `el ${ultimo}` : "este"} es el último número realmente emitido con este establecimiento y punto.
        </label>

        <div className={estilos.acciones}>
          <button type="button" className={ui.primaryButton} disabled={!altaLista || ocupado} onClick={crear}>Crear punto (inactivo)</button>
        </div>
      </div>

      {cargando ? <p className={estilos.hint} role="status">Cargando…</p> : null}

      {!cargando && sucursales.length === 0 && !error ? <p className={estilos.hint}>No hay sucursales activas dentro de su alcance.</p> : null}

      {sucursales.map((s) => (
        <div key={s.id} className={estilos.card}>
          <h2>{s.nombre} <small>{s.establecimiento ? `Establecimiento ${s.establecimiento}` : "Sin establecimiento SIFEN"}</small></h2>

          {s.puntos.length === 0 ? <p className={estilos.hint}>Sin puntos de expedición: no se puede facturar desde esta sucursal.</p> : (
            <div className={estilos.tabla}>
              <table>
                <thead><tr><th>Punto</th><th>Nombre</th><th className={estilos.num}>Último emitido</th><th>Próximo</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {s.puntos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.codigo}</td>
                      <td>{p.nombre}</td>
                      <td className={estilos.num}>{p.ultimoNumero}</td>
                      <td>{p.proximo}</td>
                      <td><span className={p.activo ? estilos.activo : estilos.inactivo}>{p.activo ? "Activo" : "Inactivo"}</span></td>
                      <td>
                        {p.activo ? (
                          <button type="button" className={ui.secondaryButton} disabled={ocupado} onClick={() => desactivar(p.id)}>Desactivar</button>
                        ) : activando?.id === p.id ? (
                          <div className={estilos.activacion}>
                            <label className={estilos.field}>
                              <span>Último número emitido</span>
                              <input inputMode="numeric" maxLength={7} value={activando.numero} onChange={(e) => setActivando({ ...activando, numero: e.target.value.replace(/\D/g, "") })} />
                              <small className={estilos.hint}>Registrado: {p.ultimoNumero}. Si se emitió más afuera, informe el mayor; no puede ser menor.</small>
                            </label>
                            <label className={estilos.check}>
                              <input type="checkbox" checked={activando.confirma} onChange={(e) => setActivando({ ...activando, confirma: e.target.checked })} /> Confirmo que es el último número realmente emitido.
                            </label>
                            <span className={estilos.acciones}>
                              <button type="button" className={ui.primaryButton} disabled={ocupado || !activando.confirma || !NUMERO_OK.test(activando.numero) || Number(activando.numero) < p.ultimoNumero} onClick={activar}>Activar</button>
                              <button type="button" className={ui.secondaryButton} onClick={() => setActivando(null)}>Cancelar</button>
                            </span>
                          </div>
                        ) : (
                          <button type="button" className={ui.secondaryButton} disabled={ocupado} onClick={() => setActivando({ id: p.id, numero: String(p.ultimoNumero), confirma: false })}>Activar…</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <p className={estilos.hint}><Link href="/facturas/nueva">Volver a Nueva factura electrónica</Link></p>
    </section>
  );
}
