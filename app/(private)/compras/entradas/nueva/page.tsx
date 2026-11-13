"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import { CampoFecha } from "@/components/ui/campo-fecha";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import {
  cargarCatalogosEntrada,
  conCodigo,
  confirmadaDe,
  consultarPendienteEntradaApi,
  ejecutarEntradaApi,
  reconocerEntradaApi,
  reservarEntradaApi,
  type CatalogoEntrada,
} from "@/lib/compras/entradas-cliente";
import { crearControlEntrada, MENSAJE_RECUPERADA_ENTRADA, MENSAJE_SALIDA_ENTRADA, mensajeSinAckEntrada, type EstadoEntrada } from "@/lib/compras/entradas-intento";
import {
  decimalCanonico,
  MAX_LINEAS_ENTRADA,
  MAX_LOTE,
  MAX_OBSERVACION,
  MAX_REFERENCIA,
  normalizarEntrada,
  sinErrores,
  validarEntrada,
  type ErroresEntrada,
  type LineaEntrada,
  type SnapshotEntrada,
} from "@/lib/compras/entradas-reglas";
import { formatearCostoUnitarioExactoTexto, formatearCostoUnitarioTexto, formatearMontoTexto, multiplicarDecimales, redondearDecimal, sumarDecimales } from "@/lib/inventario/decimal";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";
import { formatearCantidadMovimiento } from "@/lib/movimientos/formato-cantidad";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import local from "./page.module.css";

type Linea = LineaEntrada & { key: string };
type Cabecera = Omit<SnapshotEntrada, "lineas">;

const cabeceraInicial = (fecha: string): Cabecera => ({ fecha, proveedorId: "", depositoId: "", referencia: "", observacion: "" });
const nuevaClave = () => crypto.randomUUID();
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Total de la línea a costo con la precisión del motor (round(cantidad × costo, 4)); null si falta un dato. */
function totalLinea(l: LineaEntrada): string | null {
  const c = decimalCanonico(l.cantidad);
  const k = decimalCanonico(l.costo);

  if (c === null || k === null || l.costo.trim() === "") return null;

  const p = multiplicarDecimales(c, k);

  return p === null ? null : redondearDecimal(p, 4);
}

/**
 * E6-A — Compras → Entradas → Nueva entrada. Proveedor obligatorio, depósito destino autorizado, fecha operativa, varios productos con cantidad y costo unitario EXPRESO, lote según el producto.
 * Revisión previa y confirmación. El registro es DURABLE (reserva K1 + snapshot en el servidor, ejecución única y reconocimiento): doble clic, recarga o corte de red no producen dos entradas.
 */
export default function NuevaEntradaPage() {
  const router = useRouter();
  const [hoyInicial] = useState(() => hoyAsuncion());
  const [catalogo, setCatalogo] = useState<CatalogoEntrada | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState("");
  const [intentoCatalogo, setIntentoCatalogo] = useState(0);
  const [cab, setCab] = useState<Cabecera>(() => cabeceraInicial(hoyInicial));
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [buscaProveedor, setBuscaProveedor] = useState("");
  const [buscaProducto, setBuscaProducto] = useState("");
  const [errores, setErrores] = useState<ErroresEntrada>({ porLinea: [] });
  const [errorForm, setErrorForm] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState("");
  const control = useRef(crearControlEntrada({ generarClave: nuevaClave, reservar: reservarEntradaApi, ejecutar: ejecutarEntradaApi, reconocer: reconocerEntradaApi }));
  const [estado, setEstado] = useState<EstadoEntrada>("RECUPERANDO");
  const [intentoRecuperacion, setIntentoRecuperacion] = useState(0);
  const [registrada, setRegistrada] = useState(false);
  const vigente = useRef(true);

  useEffect(() => {
    vigente.current = true;

    return () => {
      vigente.current = false;
    };
  }, []);

  /** Muestra (bloqueada) la operación original guardada en el servidor. */
  function mostrarSnapshot(s: SnapshotEntrada) {
    setCab({ fecha: s.fecha, proveedorId: s.proveedorId, depositoId: s.depositoId, referencia: s.referencia, observacion: s.observacion });
    setLineas(s.lineas.map((l) => ({ ...l, key: nuevaClave() })));
    setRevisando(true);
  }

  // Antes de habilitar una entrada nueva se consulta al servidor la entrada pendiente del operador. Un fallo deja el registro BLOQUEADO (falla cerrado).
  useEffect(() => {
    let activo = true;

    control.current.fijarRecuperacion("RECUPERANDO");
    void consultarPendienteEntradaApi().then((r) => {
      if (!activo) return;
      if (!r.ok) {
        control.current.fijarRecuperacion("RECUPERACION_ERROR");
        setEstado("RECUPERACION_ERROR");
        setAviso(`${r.mensaje} El registro nuevo permanece bloqueado hasta poder comprobarlo.`);

        return;
      }
      if (r.intencion === null) {
        control.current.fijarRecuperacion(null);
        setEstado("LIBRE");
        setAviso("");

        return;
      }

      const confirmada = confirmadaDe(r.intencion);

      control.current.adoptar(r.intencion.clave, r.intencion.snapshot, confirmada);
      mostrarSnapshot(r.intencion.snapshot);
      setEstado(control.current.estado());
      setAviso(
        confirmada
          ? mensajeSinAckEntrada(confirmada.numero)
          : `${MENSAJE_RECUPERADA_ENTRADA}${r.intencion.requiereRevision ? " Esta operación lleva más de 7 días sin resolverse y requiere revisión; no se liberó ni se descartó." : ""}`,
      );
    });

    return () => {
      activo = false;
    };
  }, [intentoRecuperacion]);

  useEffect(() => {
    let activo = true;

    cargarCatalogosEntrada()
      .then((c) => {
        if (activo) {
          setCatalogo(c);
          setErrorCatalogo("");
        }
      })
      .catch((e: unknown) => {
        if (activo) setErrorCatalogo(e instanceof Error ? e.message : "No fue posible cargar los catálogos.");
      });

    return () => {
      activo = false;
    };
  }, [intentoCatalogo]);

  const bloqueado = estado !== "LIBRE";
  const enviando = estado === "ENVIANDO";
  const sucio = !registrada && (lineas.length > 0 || cab.proveedorId !== "" || cab.depositoId !== "" || cab.referencia !== "" || cab.observacion !== "");

  useProtegerCambios(sucio || bloqueado, estado !== "LIBRE" ? MENSAJE_SALIDA_ENTRADA[estado] : undefined);

  const productos = useMemo(() => catalogo?.productos ?? [], [catalogo]);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const proveedor = catalogo?.proveedores.find((p) => p.id === cab.proveedorId);
  const deposito = catalogo?.depositos.find((d) => d.id === cab.depositoId);
  const moneda = catalogo?.monedaBase ?? "";
  const snapshotActual = (): SnapshotEntrada => normalizarEntrada({ ...cab, lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, costo: l.costo, lote: l.lote, vencimiento: l.vencimiento })) });
  const totales = lineas.map(totalLinea);
  const totalGeneral = totales.every((t) => t !== null) && totales.length > 0 ? sumarDecimales(totales) : null;

  const proveedoresFiltrados = useMemo(() => {
    const t = sinTildes(buscaProveedor.trim());
    const lista = catalogo?.proveedores ?? [];

    return (t ? lista.filter((p) => sinTildes(`${p.codigo} ${p.nombre} ${p.fantasia} ${p.documento}`).includes(t)) : lista).slice(0, 200);
  }, [buscaProveedor, catalogo]);

  const productosFiltrados = useMemo(() => {
    const t = sinTildes(buscaProducto.trim());

    return t.length < 2 ? [] : productos.filter((p) => sinTildes(`${p.codigo} ${p.descripcion}`).includes(t)).slice(0, 20);
  }, [buscaProducto, productos]);

  function cambiarCab(parcial: Partial<Cabecera>) {
    if (control.current.bloqueado() || revisando) return;
    setCab((c) => ({ ...c, ...parcial }));
    setErrorForm("");
  }

  function cambiarLinea(key: string, parcial: Partial<LineaEntrada>) {
    if (control.current.bloqueado() || revisando) return;
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...parcial } : l)));
    setErrorForm("");
  }

  function agregarProducto(id: string) {
    if (control.current.bloqueado() || revisando) return;

    const p = porId.get(id);

    if (!p || p.modoControl === "UNIDAD_ETIQUETADA") return;
    if (lineas.length >= MAX_LINEAS_ENTRADA) {
      setErrorForm(`Una entrada admite hasta ${MAX_LINEAS_ENTRADA} productos.`);

      return;
    }
    // Un producto sin lote va una sola vez (se unifica la cantidad); con lote puede repetirse con lotes distintos.
    if (p.modoControl !== "LOTE" && lineas.some((l) => l.productoId === id)) {
      setErrorForm(`El producto ${p.codigo} ya está en la entrada: modifique su cantidad.`);

      return;
    }
    setLineas((ls) => [...ls, { key: nuevaClave(), productoId: id, cantidad: "", costo: "", lote: "", vencimiento: "" }]);
    setBuscaProducto("");
    setErrorForm("");
  }

  function quitarLinea(key: string) {
    if (control.current.bloqueado() || revisando) return;
    setLineas((ls) => ls.filter((l) => l.key !== key));
  }

  /** «Revisar entrada»: valida todo (mismas reglas que la API) y muestra el resumen para confirmar. No envía nada. */
  function revisar() {
    if (control.current.bloqueado()) return;

    const s = snapshotActual();
    const e = validarEntrada(s, hoyAsuncion(), (id) => porId.get(id)?.modoControl);

    setErrores(e);
    if (!sinErrores(e)) {
      setErrorForm(e.lineas ?? "Revise los campos marcados.");

      return;
    }
    setErrorForm("");
    setRevisando(true);
  }

  async function confirmar() {
    const actual = control.current.estado();

    if (actual !== "LIBRE" && actual !== "INDETERMINADO") return;
    setErrorForm("");

    // Con un resultado indeterminado el reintento usa la clave y el snapshot ORIGINALES (lo que haya en pantalla se ignora).
    const pendiente = control.current.registrar(snapshotActual());

    setEstado(control.current.estado());

    const r = await pendiente;

    if (!vigente.current) return;
    setEstado(control.current.estado());

    if (r.tipo === "OK") {
      setAviso(mensajeSinAckEntrada(r.numero));
    } else if (r.tipo === "RECUPERADA") {
      const s = control.current.snapshot();

      if (s) mostrarSnapshot(s);
      setAviso(r.mensaje);
    } else if (r.tipo === "RECHAZADO") {
      // Rechazo definitivo comprobado por el servidor: nada se registró; se vuelve a editar con los mismos datos.
      setRevisando(false);
      setErrorForm(`${r.mensaje} No se registró ninguna entrada.`);
    } else if (r.tipo === "INDETERMINADO") {
      setAviso(r.mensaje);
    } else if (r.tipo === "NO_RESERVADA") {
      setErrorForm(r.mensaje);
      if (control.current.estado() === "RECUPERACION_ERROR") setAviso(r.mensaje);
    }
  }

  /** «Confirmar recepción» (ACK): único camino que libera una entrada confirmada; tras la confirmación del servidor se abre el detalle de la entrada original. */
  async function confirmarRecepcion() {
    const id = control.current.entradaId();
    const a = await control.current.reconocer();

    if (!vigente.current) return;
    setEstado(control.current.estado());
    if (a.ok && id) {
      setRegistrada(true);
      router.push(`/compras/entradas/${id}?registrada=1`);
      router.refresh();
    } else if (!a.ok) {
      setAviso(`${a.mensaje} La entrada sigue registrada; puede repetir «Confirmar recepción».`);
    }
  }

  /** «Consultar resultado» (solo lectura): si el servidor ya resolvió la entrada (otra pestaña/sesión), libera la pantalla. Nunca descarta una entrada incierta. */
  async function consultar() {
    const r = await consultarPendienteEntradaApi();

    if (!vigente.current) return;
    if (!r.ok) {
      setAviso(`${r.mensaje} La entrada PUEDE haberse registrado; los datos siguen bloqueados.`);

      return;
    }
    if (r.intencion === null) {
      control.current.liberarResuelta();
      setEstado(control.current.estado());
      setCab(cabeceraInicial(hoyAsuncion()));
      setLineas([]);
      setRevisando(false);
      setAviso("La operación original ya fue resuelta. Verifique el resultado en el listado de Entradas antes de continuar.");

      return;
    }

    const confirmada = confirmadaDe(r.intencion);

    if (confirmada && control.current.estado() !== "CONFIRMADA") control.current.adoptar(r.intencion.clave, r.intencion.snapshot, confirmada);
    setEstado(control.current.estado());
    setAviso(confirmada ? mensajeSinAckEntrada(confirmada.numero) : MENSAJE_RECUPERADA_ENTRADA);
  }

  const errLinea = (i: number, campo: keyof ErroresEntrada["porLinea"][number]) => errores.porLinea[i]?.[campo];
  const cargando = !catalogo && !errorCatalogo;
  const edicion = !bloqueado && !revisando;
  const claseCampo = (error?: string, extra = "") => [styles.field, error ? styles.conError : "", extra].filter(Boolean).join(" ");
  const nombreProducto = (id: string) => {
    const p = porId.get(id);

    return p ? { titulo: p.descripcion, sub: `${p.codigo}${p.unidadMedidaNombre ? ` · ${p.unidadMedidaNombre}` : ""}`, modo: p.modoControl } : { titulo: "Producto no disponible en el catálogo actual", sub: id, modo: undefined };
  };

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Compras</span>
            <i aria-hidden="true">/</i>
            <Link href="/compras/entradas">Entradas</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Nueva entrada</span>
          </nav>
          <h1>Nueva entrada de mercadería</h1>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/compras/entradas" className={ui.secondaryButton}>
            ← Entradas
          </Link>
        </div>
      </header>

      {errorCatalogo ? (
        <div className={ui.alertError} role="alert">
          {errorCatalogo}{" "}
          <button type="button" className={ui.clearButton} onClick={() => { setErrorCatalogo(""); setIntentoCatalogo((n) => n + 1); }}>
            Reintentar
          </button>
        </div>
      ) : null}

      <section className={ui.contentCard} style={{ padding: 14 }}>
        <form className={styles.form} onSubmit={(e) => e.preventDefault()} noValidate aria-label="Nueva entrada de mercadería" aria-busy={cargando || enviando}>
          <h3>{revisando ? "Revise y confirme la entrada" : "Datos de la entrada"}</h3>

          {aviso ? (
            <div className={local.info} role="status">
              {aviso}{" "}
              {estado === "RECUPERACION_ERROR" ? (
                <button type="button" className={ui.secondaryButton} onClick={() => { setAviso(""); setEstado("RECUPERANDO"); setIntentoRecuperacion((n) => n + 1); }}>
                  Reintentar
                </button>
              ) : null}
            </div>
          ) : null}
          {errorForm ? (
            <div className={styles.alertaForm} role="alert">
              {errorForm}
            </div>
          ) : null}

          {revisando ? (
            <>
              <div className={local.leyenda}>Entrada a inventario valorizada, sin validación fiscal de factura.</div>
              <dl className={local.resumen} aria-label="Resumen de la entrada">
                <div>
                  <dt>Proveedor</dt>
                  <dd>{proveedor ? conCodigo(proveedor.codigo, proveedor.nombre) : cab.proveedorId ? "Proveedor guardado en la operación original" : "—"}</dd>
                </div>
                <div>
                  <dt>Documento</dt>
                  <dd>{proveedor?.documento ?? "—"}</dd>
                </div>
                <div>
                  <dt>Depósito destino</dt>
                  <dd>{deposito ? `${deposito.codigo} · ${deposito.nombre}` : "—"}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{cab.fecha ? cab.fecha.split("-").reverse().join("/") : "—"}</dd>
                </div>
                <div>
                  <dt>Referencia</dt>
                  <dd>{cab.referencia || "—"}</dd>
                </div>
                <div>
                  <dt>Moneda</dt>
                  <dd>{moneda || "—"}</dd>
                </div>
                <div>
                  <dt>Ítems</dt>
                  <dd>{lineas.length}</dd>
                </div>
                <div>
                  <dt>Costo total</dt>
                  <dd>{totalGeneral === null ? "—" : formatearMontoTexto(totalGeneral, moneda)}</dd>
                </div>
              </dl>
              {cab.observacion ? <p className={styles.nota}>Observación: {cab.observacion}</p> : null}
            </>
          ) : (
            <>
              <label className={claseCampo(errores.proveedorId, styles.wide)}>
                <span>
                  Proveedor <b>*</b>
                </span>
                <input value={buscaProveedor} placeholder="Buscar por código, nombre o RUC" disabled={!edicion || cargando} onChange={(e) => setBuscaProveedor(e.target.value)} aria-label="Buscar proveedor" />
                <select value={cab.proveedorId} disabled={!edicion || cargando} aria-invalid={errores.proveedorId ? true : undefined} onChange={(e) => cambiarCab({ proveedorId: e.target.value })} aria-label="Proveedor">
                  <option value="">Seleccione el proveedor</option>
                  {proveedor && !proveedoresFiltrados.some((p) => p.id === proveedor.id) ? (
                    <option value={proveedor.id}>{conCodigo(proveedor.codigo, proveedor.nombre)}</option>
                  ) : null}
                  {proveedoresFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {conCodigo(p.codigo, `${p.nombre} · ${p.documento}`)}
                    </option>
                  ))}
                </select>
                {errores.proveedorId ? <span className={styles.campoError}>{errores.proveedorId}</span> : <span className={styles.ayuda}>Proveedores activos y no bloqueados de su empresa.</span>}
              </label>

              <label className={claseCampo(errores.depositoId)}>
                <span>
                  Depósito destino <b>*</b>
                </span>
                <select value={cab.depositoId} disabled={!edicion || cargando} aria-invalid={errores.depositoId ? true : undefined} onChange={(e) => cambiarCab({ depositoId: e.target.value })}>
                  <option value="">Seleccione el depósito</option>
                  {(catalogo?.depositos ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.codigo} · {d.nombre}
                    </option>
                  ))}
                </select>
                {errores.depositoId ? <span className={styles.campoError}>{errores.depositoId}</span> : <span className={styles.ayuda}>Solo depósitos activos dentro de su alcance.</span>}
              </label>

              <label className={claseCampo(errores.fecha)}>
                <span>
                  Fecha <b>*</b>
                </span>
                <CampoFecha valor={cab.fecha} alCambiar={(iso) => cambiarCab({ fecha: iso })} disabled={!edicion} aria-invalid={errores.fecha ? true : undefined} claseError={styles.campoError} />
                {errores.fecha ? <span className={styles.campoError}>{errores.fecha}</span> : <span className={styles.ayuda}>Fecha operativa; no puede ser futura.</span>}
              </label>

              <label className={claseCampo(undefined)}>
                <span>Moneda</span>
                <input value={moneda} disabled readOnly aria-label="Moneda base de la empresa" />
                <span className={styles.ayuda}>Moneda base de la empresa (sin edición).</span>
              </label>

              <label className={claseCampo(errores.referencia, styles.wide)}>
                <span>Referencia del documento</span>
                <input value={cab.referencia} maxLength={MAX_REFERENCIA} disabled={!edicion} placeholder="Remisión / comprobante del proveedor" onChange={(e) => cambiarCab({ referencia: e.target.value })} />
                {errores.referencia ? <span className={styles.campoError}>{errores.referencia}</span> : <span className={styles.ayuda}>Texto libre y opcional: es solo una referencia, no una factura fiscal.</span>}
              </label>

              <label className={claseCampo(errores.observacion, styles.wide)}>
                <span>Observación</span>
                <input value={cab.observacion} maxLength={MAX_OBSERVACION} disabled={!edicion} onChange={(e) => cambiarCab({ observacion: e.target.value })} />
                {errores.observacion ? <span className={styles.campoError}>{errores.observacion}</span> : null}
              </label>

              <div className={local.seccion}>Productos</div>

              <div className={local.buscador}>
                <label className={styles.field}>
                  <span>Agregar producto</span>
                  <input value={buscaProducto} disabled={!edicion || cargando} placeholder="Buscar por código o descripción (mínimo 2 caracteres)" onChange={(e) => setBuscaProducto(e.target.value)} aria-label="Buscar producto" />
                </label>
                {productosFiltrados.length > 0 ? (
                  <ul className={local.resultados} aria-label="Productos encontrados">
                    {productosFiltrados.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.codigo} · {p.descripcion} <small>{p.unidadMedidaNombre}{p.modoControl === "LOTE" ? " · por lote" : ""}</small>
                        </span>
                        {p.modoControl === "UNIDAD_ETIQUETADA" ? (
                          <small>Unidad identificada: no disponible</small>
                        ) : (
                          <button type="button" className={ui.secondaryButton} onClick={() => agregarProducto(p.id)}>
                            Agregar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : buscaProducto.trim().length >= 2 ? (
                  <span className={styles.ayuda}>Sin coincidencias entre los productos activos con control de stock.</span>
                ) : null}
              </div>
            </>
          )}

          <div className={local.lineas}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className={ui.numericHead}>Cantidad</th>
                  <th className={ui.numericHead}>Costo unitario ({moneda})</th>
                  <th>Lote</th>
                  <th>Vencimiento</th>
                  <th className={ui.numericHead}>Total a costo</th>
                  {edicion ? <th className={ui.actionsHead}>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const p = nombreProducto(l.productoId);
                  const t = totales[i];

                  return (
                    <tr key={l.key} className={ui.row}>
                      <td>
                        <div className={ui.cell}>
                          <strong>{p.titulo}</strong>
                          <span>{p.sub}</span>
                          {errLinea(i, "productoId") ? <span className={local.error}>{errLinea(i, "productoId")}</span> : null}
                        </div>
                      </td>
                      <td className={ui.numeric}>
                        {edicion ? (
                          <>
                            <input inputMode="decimal" value={l.cantidad} aria-label={`Cantidad de ${p.titulo}`} aria-invalid={errLinea(i, "cantidad") ? true : undefined} onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })} />
                            {errLinea(i, "cantidad") ? <span className={local.error}>{errLinea(i, "cantidad")}</span> : null}
                          </>
                        ) : (
                          <span className={ui.mono}>{formatearCantidadMovimiento(Number(decimalCanonico(l.cantidad) ?? NaN))}</span>
                        )}
                      </td>
                      <td className={ui.numeric}>
                        {edicion ? (
                          <>
                            <input inputMode="decimal" value={l.costo} aria-label={`Costo unitario de ${p.titulo}`} aria-invalid={errLinea(i, "costo") ? true : undefined} onChange={(e) => cambiarLinea(l.key, { costo: e.target.value })} />
                            {errLinea(i, "costo") ? <span className={local.error}>{errLinea(i, "costo")}</span> : null}
                          </>
                        ) : (
                          <span className={ui.mono} title={`Costo unitario exacto: ${formatearCostoUnitarioExactoTexto(decimalCanonico(l.costo), moneda)}`}>{formatearCostoUnitarioTexto(decimalCanonico(l.costo), moneda)}</span>
                        )}
                      </td>
                      <td>
                        {edicion && p.modo === "LOTE" ? (
                          <>
                            <input value={l.lote} maxLength={MAX_LOTE} aria-label={`Lote de ${p.titulo}`} aria-invalid={errLinea(i, "lote") ? true : undefined} onChange={(e) => cambiarLinea(l.key, { lote: e.target.value })} />
                            {errLinea(i, "lote") ? <span className={local.error}>{errLinea(i, "lote")}</span> : null}
                          </>
                        ) : (
                          l.lote || "—"
                        )}
                      </td>
                      <td>
                        {edicion && p.modo === "LOTE" ? (
                          <>
                            <CampoFecha valor={l.vencimiento} alCambiar={(iso) => cambiarLinea(l.key, { vencimiento: iso })} aria-invalid={errLinea(i, "vencimiento") ? true : undefined} claseError={local.error} />
                            {errLinea(i, "vencimiento") ? <span className={local.error}>{errLinea(i, "vencimiento")}</span> : null}
                          </>
                        ) : l.vencimiento ? (
                          l.vencimiento.split("-").reverse().join("/")
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={ui.numeric}>
                        <span className={ui.mono}>{t === null ? "—" : formatearMontoTexto(t, moneda)}</span>
                      </td>
                      {edicion ? (
                        <td className={ui.actionsCell}>
                          <button type="button" className={local.quitar} onClick={() => quitarLinea(l.key)} aria-label={`Quitar ${p.titulo}`}>
                            Quitar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {lineas.length === 0 ? (
                  <tr>
                    <td colSpan={edicion ? 7 : 6} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>Sin productos</strong>
                        <span>Busque y agregue los productos que ingresan en esta entrada.</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className={local.totales}>
            <span>
              Ítems: <strong>{lineas.length}</strong>
            </span>
            <span>
              Costo total: <strong>{totalGeneral === null ? "—" : formatearMontoTexto(totalGeneral, moneda)}</strong>
            </span>
          </div>

          <div className={styles.formActions}>
            <Link href="/compras/entradas" className={ui.secondaryButton}>
              Cancelar
            </Link>
            {revisando && estado === "LIBRE" ? (
              <button type="button" className={ui.secondaryButton} onClick={() => setRevisando(false)}>
                Volver a editar
              </button>
            ) : null}
            {estado === "INDETERMINADO" ? (
              <button type="button" className={ui.secondaryButton} onClick={() => void consultar()}>
                Consultar resultado
              </button>
            ) : null}
            {estado === "CONFIRMADA" ? (
              <button type="button" className={ui.primaryButton} onClick={() => void confirmarRecepcion()}>
                Confirmar recepción
              </button>
            ) : revisando ? (
              <button type="button" className={ui.primaryButton} disabled={enviando || estado === "RECUPERANDO" || estado === "RECUPERACION_ERROR"} onClick={() => void confirmar()}>
                {enviando ? "Registrando..." : estado === "INDETERMINADO" ? "Reintentar la misma entrada" : "Confirmar entrada"}
              </button>
            ) : (
              <button type="button" className={ui.primaryButton} disabled={cargando || bloqueado} onClick={revisar}>
                Revisar entrada
              </button>
            )}
          </div>
          <p className={styles.nota}>
            Al confirmar, el stock y el costo promedio se actualizan mediante el procedimiento oficial de inventario en una sola operación con el proveedor. La entrada no se edita ni se borra; solo puede anularse con el movimiento inverso oficial.
          </p>
        </form>
      </section>
    </section>
  );
}
