"use client";

import Link from "next/link";
import { useState } from "react";

import { subirDocumentosPendientes } from "@/lib/proveedores/alta";
import { cerrarCargaInicialProveedor } from "@/lib/proveedores/cierre-carga";
import { documentoPendienteVacio, validarPendientes, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import type { Errores } from "./campos";
import { CamposDocumento } from "./pestanas/documentos";
import styles from "./proveedor-form.module.css";

type Props = {
  id: string;
  codigo: string;
  /** Documentos de esta sesión que no se pudieron cargar (conservan su archivo). Tras recargar la página llega vacío: hay que volver a elegir los archivos. */
  pendientesIniciales: DocumentoPendiente[];
  /** Mensaje del último intento de cierre fallido, si lo hubo. */
  mensajeInicial?: string;
  alTerminar: () => void;
  /** PRV-D01: sin PROVEEDORES.VER no se ofrece el enlace a la lista. */
  puedeVerLista?: boolean;
};

/**
 * Pantalla de retomada del alta (PRV-R01-01/02/03): el proveedor YA existe. Desde aquí solo se cargan los documentos que faltan y se cierra la carga inicial;
 * no hay forma de volver a crear el proveedor. No requiere PROVEEDORES.VER (la ficha sí): usa únicamente las rutas y permisos del alta.
 */
export default function RetomarAlta({ id, codigo, pendientesIniciales, mensajeInicial = "", alTerminar, puedeVerLista = true }: Props) {
  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>(pendientesIniciales);
  const [errores, setErrores] = useState<Errores>({});
  const [mensaje, setMensaje] = useState(mensajeInicial);
  const [ocupado, setOcupado] = useState(false);

  // Archivos elegidos sin enviar: se avisa antes de perderlos.
  useProtegerCambios(pendientes.some((p) => p.archivo !== null) && !ocupado);

  async function subir() {
    setMensaje("");
    setErrores({});

    try {
      validarPendientes(pendientes);
    } catch (e) {
      const err = e instanceof ErrorValidacion ? e : new ErrorValidacion("Los documentos no son válidos.");

      setErrores(err.campo ? { [err.campo]: err.message } : {});
      setMensaje(err.message);

      return;
    }

    setOcupado(true);

    const r = await subirDocumentosPendientes(id, pendientes);

    // Los subidos salen de la lista: reintentar nunca los vuelve a enviar.
    const restantes = pendientes.filter((p) => !r.subidos.includes(p.uid));

    setPendientes(restantes);
    setOcupado(false);

    if (r.fallidos.length > 0) {
      const falla = r.fallidos.map((f) => `${f.mensaje}${f.estado ? ` (código ${f.estado})` : ""}`);

      setMensaje(`${r.subidos.length} documento(s) cargado(s); ${r.fallidos.length} no se pudieron cargar: ${[...new Set(falla)].join(" · ")}`);
    } else {
      setMensaje(`${r.subidos.length} documento(s) cargado(s). Ya puede cerrar la carga inicial.`);
    }
  }

  async function cerrar() {
    setMensaje("");
    setOcupado(true);

    const cierre = await cerrarCargaInicialProveedor(id);

    setOcupado(false);

    if (cierre.cerrada) {
      alTerminar();

      return;
    }

    setMensaje(`${cierre.mensaje}${cierre.estado ? ` (código ${cierre.estado})` : ""}`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.titulo}>
            <h1>Proveedor registrado{codigo ? ` · ${codigo}` : ""}</h1>
          </div>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.aviso} role="status">
          El proveedor ya existe y NO se vuelve a crear. Falta cargar los documentos pendientes y cerrar la carga inicial. Si recargó la página, los archivos de la sesión anterior no se conservan:
          seleccione nuevamente solo los que falten (los ya cargados no necesitan repetirse).
        </div>

        {mensaje ? (
          <div className={styles.error} role="alert">
            {mensaje}
          </div>
        ) : null}

        <div className={styles.content}>
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
              <Link href="/proveedores" className={styles.cancelButton}>
                Salir sin cerrar la carga
              </Link>
            ) : null}
            <button type="button" className={styles.secondaryButton} disabled={ocupado || pendientes.length === 0} onClick={subir}>
              {ocupado ? "Procesando..." : "Cargar documentos"}
            </button>
            <button type="button" className={styles.saveButton} disabled={ocupado || pendientes.length > 0} onClick={cerrar} title={pendientes.length > 0 ? "Cargue o quite los documentos pendientes" : undefined}>
              Cerrar carga inicial
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
