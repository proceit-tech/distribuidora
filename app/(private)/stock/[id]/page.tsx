"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad, formatearFechaIso } from "@/lib/formato/listas";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";
import { normalizarPermisosMovimientos, puedeAbrirNuevoMovimiento, puedeVerMovimientos } from "@/lib/inventario/acceso";
import { formatearCostoUnitarioTexto, formatearMontoTexto } from "@/lib/inventario/decimal";
import { enlaceNuevoMovimiento } from "@/lib/movimientos/formulario";
import { cargarStockItem } from "@/lib/stock/cliente-api";
import { ETIQUETA_NIVEL } from "@/lib/stock/vista";
import type { StockItem } from "@/types/stock";

import styles from "./page.module.css";

type Permisos = { movimientosCrear: boolean; movimientosVer: boolean };

const cant = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatearCantidad(n));
const NIVEL: Record<StockItem["nivel"], { texto: string; clase: string }> = {
  NORMAL: { texto: "Normal", clase: ui.statusActive },
  BAJO: { texto: ETIQUETA_NIVEL.BAJO, clase: ui.statusWarning },
  SIN_STOCK: { texto: "Sin stock", clase: ui.statusDanger },
  SOBRESTOCK: { texto: "Sobrestock", clase: ui.statusInfo },
};
const MODO: Record<StockItem["modoControl"], string> = { CANTIDAD: "Por cantidad", LOTE: "Por lote", UNIDAD_ETIQUETADA: "Unidad identificada (serie/etiqueta)" };

/** Días hasta el vencimiento (negativo = vencido); null si no hay fecha. Solo presentación. */
function diasAVencer(vencimiento: string, hoy: string): number | null {
  if (!vencimiento) return null;

  const a = Date.parse(`${vencimiento}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);

  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((a - b) / 86400000);
}

export default function StockDetallePage() {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<StockItem | null>(null);
  const [moneda, setMoneda] = useState("PYG");
  const [permisos, setPermisos] = useState<Permisos>({ movimientosCrear: false, movimientosVer: false });
  const [alcanceParcial, setAlcanceParcial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const hoy = hoyAsuncion();

  useEffect(() => {
    let activo = true;

    cargarStockItem(params.id)
      .then((r) => {
        if (!r || !activo) return;

        setMoneda(r.monedaBase);
        setItem(r.item);
        setAlcanceParcial(r.alcanceParcial === true);
        setPermisos(normalizarPermisosMovimientos(r.permisos));
      })
      .catch((e: unknown) => {
        if (activo) setErrorCarga(e instanceof Error ? e.message : "No fue posible cargar el stock.");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <section className={ui.page}>
        <div className={styles.estadoCarga} role="status">
          Cargando stock...
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section className={ui.page}>
        <div className={styles.estadoCarga}>
          <h1>Stock no encontrado</h1>
          {errorCarga ? <p>{errorCarga}</p> : <p>El producto no existe, no controla stock o no tiene saldos en los depósitos que usted puede ver.</p>}
          <Link href="/stock" className={ui.secondaryButton}>
            ← Volver a stock
          </Link>
        </div>
      </section>
    );
  }

  const nivel = NIVEL[item.nivel];
  // Las unidades identificadas (serie/etiqueta) aún no se pueden mover desde Movimientos: no se ofrece una acción que la API rechazaría.
  // INV-02: el atajo exige VER y CREAR (las guardas de /movimientos y /movimientos/nuevo).
  const puedeMover = puedeAbrirNuevoMovimiento(permisos) && item.modoControl !== "UNIDAD_ETIQUETADA";
  const columnasDeposito = puedeMover ? 9 : 8;

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <Link href="/stock">Stock</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{item.productoCodigo}</span>
          </nav>
          <h1>{item.productoDescripcion}</h1>
          <p className={styles.subtitulo}>
            {[item.productoCodigo, item.categoria, item.marca, item.unidadMedidaNombre].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/stock" className={ui.secondaryButton}>
            ← Stock
          </Link>
          <Link href="/reposicion" className={ui.secondaryButton}>
            Reposición
          </Link>
          {puedeVerMovimientos(permisos) ? (
            <Link href={`/movimientos?buscar=${encodeURIComponent(item.productoCodigo)}`} className={ui.secondaryButton}>
              Movimientos del producto
            </Link>
          ) : null}
          {puedeMover ? (
            <Link href={enlaceNuevoMovimiento({ productoId: item.productoId })} className={ui.primaryButton}>
              Nuevo movimiento
            </Link>
          ) : null}
        </div>
      </header>

      {alcanceParcial ? (
        <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
          Se muestran solo los depósitos que usted tiene autorizados; los totales no incluyen los demás.
        </p>
      ) : null}

      <section className={ui.summaryGrid} aria-label="Saldos del producto">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Disponible</span>
          <strong>{cant(item.disponible)}</strong>
          <small>{item.unidadMedidaNombre || "Unidad base"}</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Reservado</span>
          <strong>{cant(item.reservado)}</strong>
          <small>Apartado, no disponible</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Cuarentena</span>
          <strong>{cant(item.cuarentena)}</strong>
          <small>No vendible</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Tránsito</span>
          <strong>{cant(item.transito)}</strong>
          <small>Aún no confirmado en depósito</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryRed].join(" ")}>
          <span>Valor físico</span>
          <strong>{item.valorInventario > 0 || item.costoPromedioTexto !== null ? formatearMontoTexto(item.valorInventarioTexto, moneda) : "—"}</strong>
          <small>Total físico a costo promedio</small>
        </article>
      </section>

      <div className={styles.bloques}>
        <section className={styles.bloque} aria-label="Política del producto">
          <div className={styles.bloqueCabecera}>
            <h2>Producto y política</h2>
            <span className={nivel.clase}>{nivel.texto}</span>
          </div>
          <dl className={styles.datos}>
            <div>
              <dt>Control de stock</dt>
              <dd>{MODO[item.modoControl]}</dd>
            </div>
            <div>
              <dt>Stock mínimo</dt>
              <dd>{cant(item.stockMinimo)}</dd>
            </div>
            <div>
              <dt>Punto de reposición</dt>
              <dd>{cant(item.puntoReposicion)}</dd>
            </div>
            <div>
              <dt>Stock máximo</dt>
              <dd>{item.stockMaximo ? cant(item.stockMaximo) : "—"}</dd>
            </div>
          </dl>
          <p className={styles.nota}>Parámetros generales del producto; cada depósito puede tener los suyos (columna «Mín. / Punto / Máx.»).</p>
        </section>

        <section className={styles.bloque} aria-label="Valorización y propiedad">
          <div className={styles.bloqueCabecera}>
            <h2>Valorización y propiedad</h2>
          </div>
          <dl className={styles.datos}>
            <div>
              <dt>Total físico</dt>
              <dd>{cant(item.totalFisico)}</dd>
            </div>
            <div>
              <dt>Total virtual</dt>
              <dd>{cant(item.totalVirtual)}</dd>
            </div>
            <div>
              <dt>Costo promedio</dt>
              <dd>{item.costoPromedioTexto === null ? "Sin costo registrado" : formatearCostoUnitarioTexto(item.costoPromedioTexto, moneda)}</dd>
            </div>
            <div>
              <dt>Precio de venta de referencia</dt>
              <dd>{item.precioVentaReferenciaTexto === null ? "Sin precio de referencia" : formatearMontoTexto(item.precioVentaReferenciaTexto, item.monedaPrecio || moneda)}</dd>
            </div>
            <div>
              <dt>Valor de venta del disponible</dt>
              <dd>{item.valorVentaReferenciaTexto === null ? "—" : formatearMontoTexto(item.valorVentaReferenciaTexto, item.monedaPrecio || moneda)}</dd>
            </div>
            <div>
              <dt>Propiedad</dt>
              <dd>{item.propiedad === "PROPIO" ? "Propio" : "Tercero"}</dd>
            </div>
            <div>
              <dt>Propietario</dt>
              <dd>{item.propietarioNombre || "—"}</dd>
            </div>
            <div>
              <dt>Stock de terceros</dt>
              <dd>{cant(item.terceros)}</dd>
            </div>
          </dl>
          <p className={styles.nota}>Las cantidades y el valor corresponden al stock propio; el de terceros no se suma.</p>
        </section>
      </div>

      <section className={ui.contentCard} aria-label="Stock por depósito">
        <div className={styles.tituloTabla}>
          <h2>Stock por depósito</h2>
          <p>Distribución del stock propio. No existe un modelo de ubicaciones físicas: no se muestra ninguna ubicación inventada.</p>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table} style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Depósito</th>
                <th>Ubicación</th>
                <th className={ui.numeric}>Disponible</th>
                <th className={ui.numeric}>Reservado</th>
                <th className={ui.numeric}>Cuarentena</th>
                <th className={ui.numeric}>Tránsito</th>
                <th className={ui.numeric}>Total físico</th>
                <th className={ui.numeric}>Mín. / Punto / Máx.</th>
                {puedeMover ? <th className={ui.actionsHead}>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {item.depositos.length === 0 ? (
                <tr>
                  <td colSpan={columnasDeposito} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Sin saldos en los depósitos que usted puede ver</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                item.depositos.map((d) => (
                  <tr key={d.id} className={ui.row}>
                    <td>
                      <span className={ui.principal}>{d.depositoNombre}</span>
                      <br />
                      <small className={ui.muted}>
                        {d.depositoCodigo}
                        {d.terceros > 0 ? ` · Terceros: ${cant(d.terceros)}` : ""}
                        {d.costoCantidad > 0 ? ` · Costo: ${formatearMontoTexto(d.costoValorTexto, moneda)}` : ""}
                      </small>
                    </td>
                    <td>
                      <small className={ui.muted} title="No existe un modelo de ubicaciones físicas en el banco">
                        {d.ubicacion || "Sin ubicación registrada"}
                      </small>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{cant(d.disponible)}</span>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{cant(d.reservado)}</span>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{cant(d.cuarentena)}</span>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{cant(d.transito)}</span>
                    </td>
                    <td className={ui.numeric}>
                      <strong className={ui.mono}>{cant(d.totalFisico)}</strong>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>
                        {cant(d.stockMinimo)} / {cant(d.puntoReposicion)} / {cant(d.stockMaximo)}
                      </span>
                    </td>
                    {puedeMover ? (
                      <td className={ui.actionsCell}>
                        <div className={ui.actionsGroup}>
                          <Link href={enlaceNuevoMovimiento({ productoId: item.productoId, tipo: "ENTRADA", depositoDestinoId: d.depositoId })} className={ui.rowButton}>
                            Entrada
                          </Link>
                          {d.disponible > 0 ? (
                            <Link href={enlaceNuevoMovimiento({ productoId: item.productoId, tipo: "TRANSFERENCIA", depositoOrigenId: d.depositoId })} className={ui.rowButton}>
                              Transferir
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {item.modoControl === "LOTE" ? (
        <section className={ui.contentCard} style={{ marginTop: 12 }} aria-label="Lotes y vencimientos">
          <div className={styles.tituloTabla}>
            <h2>Lotes y vencimientos</h2>
            <p>Trazabilidad por lote; los lotes sin saldo no se listan.</p>
          </div>

          <div className={ui.tableScroll}>
            <table className={ui.table} style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Vencimiento</th>
                  <th className={ui.numeric}>Cantidad</th>
                  <th>Estado</th>
                  <th>Depósito</th>
                  <th>Propietario</th>
                </tr>
              </thead>
              <tbody>
                {item.lotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>Sin lotes con saldo</strong>
                      </div>
                    </td>
                  </tr>
                ) : (
                  item.lotes.map((l) => {
                    const dias = diasAVencer(l.fechaVencimiento, hoy);

                    return (
                      <tr key={l.id} className={ui.row}>
                        <td>
                          <span className={[ui.code, ui.mono].join(" ")}>{l.lote}</span>
                        </td>
                        <td>
                          {l.fechaVencimiento ? formatearFechaIso(l.fechaVencimiento) : <small className={ui.muted}>Sin vencimiento</small>}
                          {dias !== null && dias < 0 ? <span className={ui.statusDanger} style={{ marginLeft: 6 }}>Vencido</span> : null}
                          {dias !== null && dias >= 0 && dias <= 30 ? <span className={ui.statusWarning} style={{ marginLeft: 6 }}>Vence en {dias} d</span> : null}
                        </td>
                        <td className={ui.numeric}>
                          <span className={ui.mono}>{cant(l.cantidad)}</span>
                        </td>
                        <td>{l.estado.charAt(0) + l.estado.slice(1).toLowerCase()}</td>
                        <td>{l.ubicacion}</td>
                        <td>{l.propietario}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
