"use client";

import Link from "next/link";
import { useState } from "react";

import { cerrarRetomada, subirDocumentosPendientes, subirFoto, urlRetomada, type EstadoRetomada } from "@/lib/productos/alta";
import { cerrarCargaInicial } from "@/lib/productos/cierre-carga";
import { documentoPendienteVacio, validarPendientes, type DocumentoPendiente } from "@/lib/productos/documento-pendiente";
import { ErrorValidacion } from "@/lib/productos/errores";
import { ACCEPT_FOTO, errorDeFoto } from "@/lib/productos/imagen";
import { TAMANO_MAXIMO_BYTES } from "@/lib/almacenamiento/archivos-reglas";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import type { Errores } from "./campos";
import { CamposDocumento } from "./pestanas/documentos";
import styles from "./producto-form.module.css";

type Props = {
  id: string;
  codigo: string;
  /** Foto de esta sesión que no se pudo cargar (conserva su archivo). Tras recargar la página llega vacía: hay que volver a elegirla. */
  fotoInicial: File | null;
  /** Documentos de esta sesión que no se pudieron cargar (conservan su archivo). Tras recargar llega vacío. */
  pendientesIniciales: DocumentoPendiente[];
  mensajeInicial?: string;
  /** PRD-R03-01: "archivos" = hubo archivos sin confirmar; "cierre" = solo falta cerrar la carga (indicador de la URL; no concede permisos). */
  estadoInicial?: EstadoRetomada;
  /** true = los pendientes recibidos son exactos (misma sesión); false = tras recargar no se sabe cuáles faltan. */
  pendientesExactas?: boolean;
  alTerminar: () => void;
  /** PRD-D01: sin PRODUCTOS.VER no se ofrece el enlace a la lista. */
  puedeVerLista?: boolean;
};

/**
 * Pantalla de retomada del alta (PRD-D02): el producto YA existe. Desde aquí solo se cargan la foto y los documentos que faltan y se cierra la carga inicial; no hay forma de volver a crearlo
 * ni se abre la ficha (exige PRODUCTOS.VER). Usa únicamente las rutas y permisos del alta (creador con PRODUCTOS.CREAR mientras la carga siga abierta).
 */
export default function RetomarAlta({ id, codigo, fotoInicial, pendientesIniciales, mensajeInicial = "", estadoInicial = "archivos", pendientesExactas = false, alTerminar, puedeVerLista = true }: Props) {
  const [foto, setFoto] = useState<File | null>(fotoInicial);
  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>(pendientesIniciales);
  const [errores, setErrores] = useState<Errores>({});
  const [mensaje, setMensaje] = useState(mensajeInicial);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<EstadoRetomada>(estadoInicial);

  function marcarEstado(nuevo: EstadoRetomada) {
    setEstado(nuevo);
    window.history.replaceState(null, "", urlRetomada(id, codigo, nuevo));
  }

  // Archivos elegidos sin enviar: se avisa antes de perderlos.
  useProtegerCambios((foto !== null || pendientes.some((p) => p.archivo !== null)) && !ocupado);

  async function subir() {
    setMensaje("");
    setErrores({});

    try {
      if (foto) {
        const e = errorDeFoto(foto.name, foto.size, TAMANO_MAXIMO_BYTES);

        if (e) throw new ErrorValidacion(e, "imagenPrivada");
      }
      validarPendientes(pendientes);
    } catch (e) {
      const err = e instanceof ErrorValidacion ? e : new ErrorValidacion("Los archivos no son válidos.");

      setErrores(err.campo ? { [err.campo]: err.message } : {});
      setMensaje(err.message);

      return;
    }

    setOcupado(true);

    const fallas: string[] = [];
    let subidas = 0;

    if (foto) {
      const r = await subirFoto(id, foto);

      if (r.ok) {
        subidas += 1;
        setFoto(null); // confirmada por el servidor: no se vuelve a enviar
      } else fallas.push(`foto: ${r.mensaje}${r.estado ? ` (código ${r.estado})` : ""}`);
    }

    const r = await subirDocumentosPendientes(id, pendientes);

    subidas += r.subidos.length;
    setPendientes(pendientes.filter((p) => !r.subidos.includes(p.uid))); // los subidos salen de la lista: reintentar nunca los vuelve a enviar
    fallas.push(...r.fallidos.map((f) => `${f.mensaje}${f.estado ? ` (código ${f.estado})` : ""}`));
    setOcupado(false);

    // Solo con pendientes exactos (misma sesión) se sabe que ya no falta nada; tras recargar se sigue exigiendo la decisión explícita al cerrar.
    if (fallas.length === 0 && pendientesExactas) marcarEstado("cierre");
    else if (fallas.length > 0 && estado !== "archivos") marcarEstado("archivos");

    setMensaje(fallas.length > 0 ? `${subidas} archivo(s) cargado(s); no se pudieron cargar: ${[...new Set(fallas)].join(" · ")}` : `${subidas} archivo(s) cargado(s). Ya puede cerrar la carga inicial.`);
  }

  async function cerrar() {
    setMensaje("");
    setOcupado(true);

    // Si pueden faltar archivos se exige una decisión explícita; solo el cierre confirmado por el servidor concluye el alta.
    const r = await cerrarRetomada(estado === "archivos", (m) => window.confirm(m), () => cerrarCargaInicial(id));

    setOcupado(false);

    if (r.cerrada) {
      alTerminar();

      return;
    }

    if (!r.cancelada) setMensaje(r.mensaje);
  }

  const faltan = foto !== null || pendientes.length > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.titulo}>
            <h1>Producto registrado{codigo ? ` · ${codigo}` : ""}</h1>
          </div>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.aviso} role="status">
          {estado === "cierre"
            ? "El producto ya existe y NO se vuelve a crear. Todos los archivos ya se cargaron; solo falta cerrar la carga inicial."
            : "El producto ya existe y NO se vuelve a crear. Puede haber archivos sin cargar: los archivos seleccionados antes de recargar la página no se conservan, así que seleccione nuevamente solo los que falten (los ya cargados no necesitan repetirse). Si decide cerrar sin ellos, deberá confirmarlo."}
        </div>

        {mensaje ? (
          <div className={styles.error} role="alert">
            {mensaje}
          </div>
        ) : null}

        <div className={styles.content}>
          <div className={styles.sectionTitle}>
            <h3>Foto pendiente</h3>
          </div>
          <div className={styles.gridTwo}>
            <label>
              <span>Foto del producto (opcional)</span>
              <input id="foto-retomada" type="file" accept={ACCEPT_FOTO} disabled={ocupado} onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </label>
            {foto ? (
              <p className={styles.textoSecundario}>
                {foto.name}{" "}
                <button type="button" className={styles.cancelButton} disabled={ocupado} onClick={() => setFoto(null)}>
                  Quitar foto
                </button>
              </p>
            ) : null}
          </div>

          <div className={styles.sectionTitle}>
            <h3>Documentos pendientes</h3>
            <button type="button" className={styles.addButton} disabled={ocupado} onClick={() => setPendientes([...pendientes, documentoPendienteVacio()])}>
              + Agregar documento
            </button>
          </div>

          <div className={styles.repeaterList}>
            {pendientes.map((p, i) => (
              <article key={p.uid} className={styles.repeaterCard}>
                <header>
                  <strong>Documento {i + 1}</strong>
                  <button type="button" disabled={ocupado} onClick={() => setPendientes(pendientes.filter((x) => x.uid !== p.uid))}>
                    Quitar
                  </button>
                </header>
                <CamposDocumento prefijo={`documentos.${i}`} valor={p} errores={errores} archivoObligatorio alCambiar={(b) => setPendientes(pendientes.map((x) => (x.uid === p.uid ? { ...x, ...b } : x)))} />
              </article>
            ))}
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerActions}>
            {puedeVerLista ? (
              <Link href="/productos" className={styles.cancelButton}>
                Salir sin cerrar la carga
              </Link>
            ) : null}
            <button type="button" className={styles.secondaryButton} disabled={ocupado || !faltan} onClick={subir}>
              {ocupado ? "Procesando..." : "Cargar archivos"}
            </button>
            <button type="button" className={styles.saveButton} disabled={ocupado || faltan} onClick={cerrar} title={faltan ? "Cargue o quite los archivos pendientes" : undefined}>
              Cerrar carga inicial
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
