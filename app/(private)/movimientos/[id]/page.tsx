"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad, formatearFechaIso, formatearMonto } from "@/lib/formato/listas";
import { anularMovimientoApi, cargarMovimiento, type RespuestaMovimiento } from "@/lib/movimientos/cliente-api";
import { ETIQUETA_ORIGEN, TIPOS_INFO } from "@/lib/movimientos/formulario";
import { MOTIVO_MINIMO } from "@/lib/movimientos/reglas";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import local from "./page.module.css";

const ORIGEN_EXTRA: Record<string, string> = { ABERTURA: "Apertura de inventario", ANULACION: "Anulación" };

export default function MovimientoDetallePage() {
  const params = useParams<{ id: string }>();
  const [datos, setDatos] = useState<RespuestaMovimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [aviso, setAviso] = useState("");
  // La misma clave en reintentos de la misma anulación; se renueva si cambia el motivo.
  const clave = useRef("");

  useEffect(() => {
    let activo = true;

    cargarMovimiento(params.id)
      .then((r) => {
        if (activo) setDatos(r);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar el movimiento.");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [params.id]);

  useProtegerCambios(motivo.trim() !== "" && !anulando);

  async function recargar() {
    try {
      setDatos(await cargarMovimiento(params.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible recargar el movimiento.");
    }
  }

  async function anular(event: React.FormEvent) {
    event.preventDefault();
    if (anulando) return;
    setError("");
    setAviso("");

    if (motivo.trim().length < MOTIVO_MINIMO) {
      setErrorMotivo(`Indique el motivo de la anulación (mínimo ${MOTIVO_MINIMO} caracteres).`);
      document.getElementById("anular-motivo")?.focus();

      return;
    }
    setErrorMotivo("");

    if (!window.confirm("La anulación es una acción crítica: genera un movimiento inverso que revierte el stock y el costo, y no se puede deshacer. ¿Desea anular este movimiento?")) return;

    setAnulando(true);
    try {
      if (!clave.current) clave.current = crypto.randomUUID();
      setAviso(await anularMovimientoApi(params.id, motivo.trim(), clave.current));
      setMotivo("");
      clave.current = "";
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible anular el movimiento.");
    } finally {
      setAnulando(false);
    }
  }

  if (loading) {
    return (
      <section className={ui.page}>
        <div className={local.estado} role="status">
          Cargando movimiento...
        </div>
      </section>
    );
  }

  const mov = datos?.movimiento;

  if (!mov) {
    return (
      <section className={ui.page}>
        <div className={local.estado}>
          <h1>{error ? "No fue posible cargar el movimiento" : "Movimiento no encontrado"}</h1>
          {error ? <p>{error}</p> : <p>El movimiento no existe o no corresponde a los depósitos que usted puede ver.</p>}
          <Link href="/movimientos" className={ui.secondaryButton}>
            ← Volver a movimientos
          </Link>
        </div>
      </section>
    );
  }

  const moneda = mov.monedaCosto || "PYG";
  const puedeAnular = datos.permisos.anular && mov.estado === "REGISTRADO" && !mov.anulaA;
  const origen = ETIQUETA_ORIGEN[mov.origen as keyof typeof ETIQUETA_ORIGEN] ?? ORIGEN_EXTRA[mov.origen] ?? mov.origen;
  const dato = (titulo: string, valor: React.ReactNode) => (
    <div>
      <dt>{titulo}</dt>
      <dd>{valor || valor === 0 ? valor : "—"}</dd>
    </div>
  );

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <Link href="/movimientos">Movimientos</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{mov.numero}</span>
          </nav>
          <h1>
            {mov.numero}{" "}
            <span className={mov.estado === "ANULADO" ? ui.statusDanger : ui.statusActive}>{mov.estado === "ANULADO" ? "Anulado" : "Registrado"}</span>
            {mov.origen === "ANULACION" ? (
              <>
                {" "}
                <span className={ui.statusWarning}>Anulación</span>
              </>
            ) : null}
          </h1>
          <p className={local.subtitulo}>
            {mov.productoCodigo} · {mov.productoDescripcion} · {formatearFechaIso(mov.fecha)} {mov.hora}
          </p>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/movimientos" className={ui.secondaryButton}>
            ← Movimientos
          </Link>
          <Link href={`/stock/${mov.productoId}`} className={ui.secondaryButton}>
            Ver stock
          </Link>
        </div>
      </header>

      {aviso ? (
        <div className={ui.alertOk} role="status">
          {aviso}
        </div>
      ) : null}
      {error ? (
        <div className={ui.alertError} role="alert">
          {error}
        </div>
      ) : null}

      <section className={local.bloque} aria-label="Datos del movimiento">
        <dl className={local.datos}>
          {dato("Tipo", TIPOS_INFO[mov.tipo]?.etiqueta ?? mov.tipo)}
          {dato("Origen", origen)}
          {dato("Cantidad", `${formatearCantidad(mov.cantidad)} ${mov.unidadMedidaNombre}`)}
          {dato("Usuario", mov.usuario)}
          {dato("Depósito origen", mov.depositoOrigenNombre)}
          {dato("Depósito destino", mov.depositoDestinoNombre)}
          {dato("Documento de referencia", mov.documentoReferencia)}
          {dato("Motivo", mov.motivo)}
          {dato("Lote", mov.lote)}
          {dato("Vencimiento", mov.fechaVencimiento ? formatearFechaIso(mov.fechaVencimiento) : "")}
          {dato("Propiedad", mov.propiedad === "TERCERO" ? "Tercero" : "Propio")}
          {dato("Costo unitario", mov.costoUnitario === null ? "" : formatearMonto(mov.costoUnitario, moneda))}
          {dato("Costo total", mov.costoTotal === null ? "" : formatearMonto(mov.costoTotal, moneda))}
          {mov.anuladoPor ? dato("Anulado por", mov.anuladoPor) : null}
          {mov.anulaA ? dato("Anula al movimiento", mov.anulaA) : null}
        </dl>
        <div className={local.observacion}>
          <span>Observación</span>
          <p>{mov.observacion || "Sin observación"}</p>
        </div>
      </section>

      {mov.lineas.length > 1 ? (
        <section className={ui.contentCard} aria-label="Líneas del movimiento">
          <div className={ui.tableScroll}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th className={ui.numeric}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {mov.lineas.map((l) => (
                  <tr key={l.lineaId} className={ui.row}>
                    <td>
                      <span className={ui.principal}>{l.productoDescripcion}</span>
                      <br />
                      <small className={ui.muted}>{l.productoCodigo}</small>
                    </td>
                    <td>{l.lote || "—"}</td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>
                        {formatearCantidad(l.cantidad)} {l.unidadMedidaNombre}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {puedeAnular ? (
        <form className={styles.form} onSubmit={anular} noValidate aria-label="Anular movimiento" style={{ marginTop: 12 }}>
          <h3>Anular movimiento</h3>
          <p className={styles.nota}>
            Acción crítica. Genera un movimiento inverso que revierte el stock y el costo; el movimiento original no se edita ni se borra. Una entrada cuyo stock ya fue consumido no se puede anular.
          </p>
          <label className={[styles.field, styles.full, errorMotivo ? styles.conError : ""].filter(Boolean).join(" ")}>
            <span>
              Motivo de la anulación <b>*</b>
            </span>
            <input
              id="anular-motivo"
              value={motivo}
              maxLength={300}
              autoComplete="off"
              aria-invalid={errorMotivo ? true : undefined}
              aria-describedby={errorMotivo ? "anular-motivo-error" : undefined}
              onChange={(e) => {
                clave.current = "";
                setMotivo(e.target.value);
                setErrorMotivo("");
              }}
            />
            {errorMotivo ? (
              <span id="anular-motivo-error" className={styles.campoError} role="alert">
                {errorMotivo}
              </span>
            ) : (
              <span className={styles.ayuda}>Mínimo {MOTIVO_MINIMO} caracteres.</span>
            )}
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={ui.primaryButton} disabled={anulando}>
              {anulando ? "Anulando..." : "Anular movimiento"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
