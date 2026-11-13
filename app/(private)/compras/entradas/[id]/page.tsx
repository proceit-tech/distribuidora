"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import local from "@/app/(private)/movimientos/[id]/page.module.css";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { cargarEntrada, conCodigo, type EntradaDetalle } from "@/lib/compras/entradas-cliente";
import { formatearFechaIso } from "@/lib/formato/listas";
import { formatearCostoUnitarioExactoTexto, formatearCostoUnitarioTexto, formatearMontoTexto } from "@/lib/inventario/decimal";
import { formatearCantidadMovimiento } from "@/lib/movimientos/formato-cantidad";

/** E6-A — detalle de una entrada de Compras: cabecera con el proveedor registrado, líneas del movimiento oficial y totales a costo. Solo lectura; la anulación es la oficial de Movimientos. */
function DetalleEntrada() {
  const params = useParams<{ id: string }>();
  const registrada = useSearchParams().get("registrada") === "1";
  const [entrada, setEntrada] = useState<EntradaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;

    cargarEntrada(params.id)
      .then((r) => {
        if (activo) {
          setEntrada(r);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar la entrada.");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [params.id, intento]);

  if (loading) {
    return (
      <section className={ui.page}>
        <div className={local.estado} role="status">
          Cargando entrada...
        </div>
      </section>
    );
  }

  if (!entrada) {
    return (
      <section className={ui.page}>
        <div className={local.estado}>
          <h1>{error ? "No fue posible cargar la entrada" : "Entrada no encontrada"}</h1>
          {error ? <p>{error}</p> : <p>La entrada no existe o no corresponde a los depósitos que usted puede ver.</p>}
          {error ? (
            <button type="button" className={ui.secondaryButton} onClick={() => { setLoading(true); setIntento((n) => n + 1); }}>
              Reintentar
            </button>
          ) : null}
          <Link href="/compras/entradas" className={ui.secondaryButton}>
            ← Volver a entradas
          </Link>
        </div>
      </section>
    );
  }

  const moneda = entrada.moneda;
  const anulada = entrada.estado === "ANULADO";
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
            <span>Compras</span>
            <i aria-hidden="true">/</i>
            <Link href="/compras/entradas">Entradas</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{entrada.numero}</span>
          </nav>
          <h1>
            {entrada.numero} <span className={anulada ? ui.statusDanger : ui.statusActive}>{anulada ? "Anulada" : "Registrada"}</span>
          </h1>
          <p className={local.subtitulo}>
            {conCodigo(entrada.proveedorCodigo, entrada.proveedorNombre)} · {formatearFechaIso(entrada.fecha)}
          </p>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/compras/entradas" className={ui.secondaryButton}>
            ← Entradas
          </Link>
          <Link href={`/movimientos/${entrada.movimientoId}`} className={ui.secondaryButton}>
            Ver movimiento
          </Link>
        </div>
      </header>

      {registrada ? (
        <div className={ui.alertOk} role="status">
          La entrada {entrada.numero} fue registrada: el stock y el costo promedio ya están actualizados.
        </div>
      ) : null}
      {anulada ? (
        <div className={ui.alertError} role="status">
          Esta entrada fue anulada{entrada.anuladoPor ? ` por el movimiento ${entrada.anuladoPor}` : ""}: su efecto en el stock fue revertido.
        </div>
      ) : null}

      <section className={local.bloque} aria-label="Datos de la entrada">
        <dl className={local.datos}>
          {dato("Proveedor", conCodigo(entrada.proveedorCodigo, entrada.proveedorNombre))}
          {dato("Documento del proveedor", entrada.proveedorDocumento)}
          {dato("Depósito destino", entrada.depositoCodigo ? `${entrada.depositoCodigo} · ${entrada.depositoNombre}` : entrada.depositoNombre)}
          {dato("Fecha", formatearFechaIso(entrada.fecha))}
          {dato("Referencia del documento", entrada.referencia)}
          {dato("Usuario", entrada.usuario)}
          {dato("Ítems", entrada.lineas)}
          {dato("Costo total", formatearMontoTexto(entrada.costoTotal, moneda))}
        </dl>
        <div className={local.observacion}>
          <span>Observación</span>
          <p>{entrada.observacion || "Sin observación"}</p>
        </div>
        <p className={ui.muted} style={{ margin: "10px 0 0", fontSize: 12.5 }}>
          Entrada a inventario valorizada, sin validación fiscal de factura. Los datos del proveedor son los registrados al momento de la entrada.
        </p>
      </section>

      <section className={ui.contentCard}>
        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Producto</th>
                <th className={ui.numericHead}>Cantidad</th>
                <th className={ui.numericHead}>Costo unitario</th>
                <th>Lote</th>
                <th>Vencimiento</th>
                <th className={ui.numericHead}>Total a costo</th>
              </tr>
            </thead>
            <tbody>
              {entrada.lineasDetalle.map((l) => (
                <tr key={l.id} className={ui.row}>
                  <td>
                    <div className={ui.cell}>
                      <strong>{l.productoDescripcion}</strong>
                      <span>{l.productoCodigo}</span>
                    </div>
                  </td>
                  <td className={ui.numeric}>
                    <span className={ui.mono}>
                      {formatearCantidadMovimiento(Number(l.cantidad))} {l.unidadMedidaNombre}
                    </span>
                  </td>
                  <td className={ui.numeric}>
                    <span className={ui.mono} title={`Costo unitario exacto: ${formatearCostoUnitarioExactoTexto(l.costoUnitario, l.moneda || moneda)}`}>{formatearCostoUnitarioTexto(l.costoUnitario, l.moneda || moneda)}</span>
                  </td>
                  <td>{l.lote || "—"}</td>
                  <td>{l.fechaVencimiento ? formatearFechaIso(l.fechaVencimiento) : "—"}</td>
                  <td className={ui.numeric}>
                    <span className={ui.mono}>{formatearMontoTexto(l.costoTotal, l.moneda || moneda)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

/** useSearchParams requiere un límite de Suspense (mismo patrón que Notas de crédito). */
export default function EntradaDetallePage() {
  return (
    <Suspense fallback={null}>
      <DetalleEntrada />
    </Suspense>
  );
}
