"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import { CampoFecha } from "@/components/ui/campo-fecha";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { GRUPOS, ORDEN_GRUPOS, grupoDeTipo, tipoInicialDelGrupo, type GrupoMovimiento } from "@/lib/movimientos/grupos";
import { motivoObligatorio } from "@/lib/movimientos/reglas";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";
import { cargarCatalogosMovimientos, registrarMovimientoResultado } from "@/lib/movimientos/cliente-api";
import { crearControlRegistro, MENSAJE_SALIDA, type EstadoIntento } from "@/lib/movimientos/intento";
import {
  advertenciaSaldo,
  aplicarTipo,
  ETIQUETA_ORIGEN,
  formularioInicial,
  movimientoSucio,
  precargarDesdeConsulta,
  saldoVisible,
  TIPOS_INFO,
  validarMovimiento,
  type CampoMovimiento,
  type ErroresMovimiento,
} from "@/lib/movimientos/formulario";
import type { CatalogoMovimientos, MovimientoStockOrigen, MovimientoStockTipo, NuevoMovimientoStock } from "@/types/movimientos-stock";

import local from "./page.module.css";

const idCampo = (campo: CampoMovimiento) => `mov-${campo}`;

export default function NuevoMovimientoPage() {
  const router = useRouter();
  const hoy = hoyAsuncion();

  const [catalogo, setCatalogo] = useState<CatalogoMovimientos | null>(null);
  const [form, setForm] = useState<NuevoMovimientoStock>(() => formularioInicial(hoy));
  const [base, setBase] = useState<NuevoMovimientoStock>(() => formularioInicial(hoy));
  const [cantidadTxt, setCantidadTxt] = useState("");
  const [costoTxt, setCostoTxt] = useState("");
  const [errores, setErrores] = useState<ErroresMovimiento>({});
  const [errorForm, setErrorForm] = useState("");
  const [avisoCarga, setAvisoCarga] = useState("");
  const [precargado, setPrecargado] = useState(false);
  // MOV-D01: la intención de registro (clave de idempotencia + snapshot del payload) vive en el control, NO se renueva por editar el formulario; mientras exista, el formulario está bloqueado.
  const control = useRef(crearControlRegistro({ generarClave: () => crypto.randomUUID(), enviar: (d) => registrarMovimientoResultado(d) }));
  const [estadoRegistro, setEstadoRegistro] = useState<EstadoIntento>("LIBRE");
  const saving = estadoRegistro === "ENVIANDO";
  const bloqueado = estadoRegistro !== "LIBRE";
  const [registrado, setRegistrado] = useState(false);

  useEffect(() => {
    let activo = true;

    cargarCatalogosMovimientos()
      .then((c) => {
        if (!activo) return;

        const inicial = formularioInicial(hoy);
        const p = precargarDesdeConsulta(new URLSearchParams(window.location.search), c, inicial);

        setCatalogo(c);
        setForm(p.formulario);
        setBase(p.formulario);
        setCantidadTxt(p.formulario.cantidad > 0 ? String(p.formulario.cantidad) : "");
        setPrecargado(p.precargado);
        if (p.descartados.length) setAvisoCarga(`Se ignoró ${p.descartados.join(", ")} de la dirección: no corresponde a los datos que usted puede operar.`);
      })
      .catch((e: unknown) => {
        if (activo) setErrorForm(e instanceof Error ? e.message : "No fue posible cargar los catálogos.");
      });

    return () => {
      activo = false;
    };
  }, [hoy]);

  const sucio = !registrado && movimientoSucio(form, base);

  // Con un registro en curso o indeterminado se advierte al salir sin afirmar que se canceló o revirtió nada.
  useProtegerCambios(sucio || bloqueado, bloqueado ? MENSAJE_SALIDA[estadoRegistro as "ENVIANDO" | "INDETERMINADO"] : undefined);

  const productos = catalogo?.productos ?? [];
  const depositos = (catalogo?.depositos ?? []).filter((d) => d.permitido);
  const info = TIPOS_INFO[form.tipo];
  const grupo = grupoDeTipo(form.tipo);
  const infoGrupo = GRUPOS[grupo];
  const motivoRequerido = motivoObligatorio(form.tipo, form.origen);
  const producto = productos.find((p) => p.id === form.productoId);
  const depositoRef = form.depositoOrigenId || form.depositoDestinoId;
  const saldos = saldoVisible(producto, depositoRef);
  const lotesSugeridos = (producto?.lotes ?? []).filter((x) => !depositoRef || x.depositoId === depositoRef);
  const aviso = advertenciaSaldo(form, producto);
  const nombreDeposito = (id: string) => depositos.find((d) => d.id === id)?.nombre ?? "";

  function cambiar(parcial: Partial<NuevoMovimientoStock>, campo?: CampoMovimiento) {
    if (control.current.bloqueado()) return;
    setForm((f) => ({ ...f, ...parcial }));
    if (campo) setErrores((e) => ({ ...e, [campo]: undefined }));
    setErrorForm("");
  }

  // Cuatro operaciones visuales sobre los nueve tipos técnicos: al elegir la operación queda seleccionado su primer subtipo.
  function cambiarGrupo(grupo: GrupoMovimiento) {
    cambiarTipo(tipoInicialDelGrupo(grupo));
  }

  function cambiarTipo(tipo: MovimientoStockTipo) {
    if (control.current.bloqueado()) return;
    setForm((f) => aplicarTipo(f, tipo));
    if (!TIPOS_INFO[tipo].costo) setCostoTxt("");
    setErrores({});
    setErrorForm("");
  }

  function enfocar(campo: CampoMovimiento | undefined) {
    if (campo) window.setTimeout(() => document.getElementById(idCampo(campo))?.focus(), 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Un submit consecutivo antes de que React actualice la pantalla no inicia otra intención: el control la reserva de forma síncrona.
    if (control.current.estado() === "ENVIANDO") return;
    setErrorForm("");

    // Con un resultado indeterminado el reintento reenvía el snapshot original (no se revalida ni se recalcula con lo que haya en pantalla).
    const reintento = control.current.estado() === "INDETERMINADO";
    const datos: NuevoMovimientoStock = { ...form, costoUnitario: info.costo && costoTxt !== "" ? Number(costoTxt) : null };

    if (!reintento) {
      const errs = validarMovimiento(datos, catalogo, hoy);

      setErrores(errs);

      const primero = (Object.keys(errs) as CampoMovimiento[])[0];

      if (primero) {
        setErrorForm("Revise los campos marcados.");
        enfocar(primero);

        return;
      }
    }

    const pendiente = control.current.registrar(datos);

    setEstadoRegistro(control.current.estado());

    const r = await pendiente;

    setEstadoRegistro(control.current.estado());

    if (r.tipo === "OK") {
      setRegistrado(true);
      router.push(`/movimientos?ok=${encodeURIComponent(r.numero)}`);
      router.refresh();
    } else if (r.tipo === "RECHAZADO" || r.tipo === "INDETERMINADO") {
      setErrorForm(r.mensaje);
    }
  }

  /** Decisión explícita: dejar la tentativa de resultado desconocido y empezar otra operación (con otra clave). */
  function descartarTentativa() {
    if (!window.confirm("El registro anterior puede haberse efectuado. Si continúa con una operación nueva y esa ya estaba registrada, el movimiento podría duplicarse. Verifique antes en Movimientos. ¿Desea empezar una operación nueva?")) return;
    if (control.current.descartarIndeterminado()) {
      setEstadoRegistro("LIBRE");
      setErrorForm("");
    }
  }

  const claseCampo = (campo: CampoMovimiento, extra = "") => [styles.field, errores[campo] ? styles.conError : "", extra].filter(Boolean).join(" ");
  const ariaCampo = (campo: CampoMovimiento) => ({ id: idCampo(campo), "aria-invalid": errores[campo] ? true : undefined, "aria-describedby": errores[campo] ? `${idCampo(campo)}-error` : undefined });
  const mensaje = (campo: CampoMovimiento) =>
    errores[campo] ? (
      <span id={`${idCampo(campo)}-error`} className={styles.campoError} role="alert">
        {errores[campo]}
      </span>
    ) : null;

  const cargando = !catalogo && !errorForm;
  const puedeSeleccionarDeposito = (id: string, otro: string) => id !== otro || form.tipo !== "TRANSFERENCIA";

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <Link href="/movimientos">
              Movimientos
            </Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Nuevo movimiento</span>
          </nav>
          <h1>Nuevo movimiento de stock</h1>
        </div>

        <div className={ui.actionsGroup}>
          <span className={local.estado} title="El movimiento solo existe después de registrarlo; el número MOV-XXXXXX lo asigna el servidor.">
            Sin registrar
          </span>
          <Link href="/movimientos" className={ui.secondaryButton}>
            ← Movimientos
          </Link>
        </div>
      </header>

      {errorForm && !catalogo ? (
        <div className={ui.alertError} role="alert">
          {errorForm}
        </div>
      ) : null}
      {avisoCarga ? (
        <div className={ui.alertError} role="status">
          {avisoCarga}
        </div>
      ) : null}

      <section className={ui.contentCard} style={{ padding: 14 }}>
        <form className={styles.form} onSubmit={submit} noValidate aria-label="Nuevo movimiento de stock" aria-busy={cargando || saving}>
          <h3>Datos del movimiento</h3>
          {estadoRegistro === "INDETERMINADO" ? (
            <div className={local.info} role="status">
              Los datos están bloqueados porque el resultado del último intento es desconocido. Use «Reintentar el mismo registro» (misma operación, no se duplica) o, si prefiere empezar otra operación, «Descartar este intento».
            </div>
          ) : null}
          <fieldset disabled={bloqueado} style={{ display: "contents", border: 0, padding: 0, margin: 0 }}>
          {errorForm && catalogo ? (
            <div className={styles.alertaForm} role="alert">
              {errorForm}
            </div>
          ) : null}
          {precargado ? (
            <div className={local.info} role="status">
              Datos precargados desde la pantalla anterior. Revíselos: el sistema volverá a validar el producto, los depósitos, los permisos y el saldo al registrar.
            </div>
          ) : null}

          <label className={claseCampo("tipo")}>
            <span>
              Operación <b>*</b>
            </span>
            <select aria-label="Operación" value={grupo} disabled={cargando} onChange={(e) => cambiarGrupo(e.target.value as GrupoMovimiento)}>
              {ORDEN_GRUPOS.map((g) => (
                <option key={g} value={g}>
                  {GRUPOS[g].etiqueta}
                </option>
              ))}
            </select>
            <span className={styles.ayuda}>{infoGrupo.ayuda}</span>
          </label>

          {infoGrupo.tipos.length > 1 ? (
            <label className={claseCampo("tipo")}>
              <span>
                Tipo de {infoGrupo.etiqueta.toLowerCase()} <b>*</b>
              </span>
              <select {...ariaCampo("tipo")} value={form.tipo} disabled={cargando} onChange={(e) => cambiarTipo(e.target.value as MovimientoStockTipo)}>
                {infoGrupo.tipos.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              {mensaje("tipo")}
            </label>
          ) : null}

          <label className={claseCampo("origen")}>
            <span>
              Origen <b>*</b>
            </span>
            <select {...ariaCampo("origen")} value={form.origen} disabled={cargando || info.origenes.length === 1} onChange={(e) => cambiar({ origen: e.target.value as MovimientoStockOrigen }, "origen")}>
              {info.origenes.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORIGEN[o]}
                </option>
              ))}
            </select>
            <span className={styles.ayuda}>Clasificación operativa; no vincula ninguna factura ni documento.</span>
          </label>

          <p className={local.descripcionTipo}>{info.descripcion}</p>

          <label className={claseCampo("fecha")}>
            <span>
              Fecha <b>*</b>
            </span>
            <CampoFecha id={idCampo("fecha")} valor={form.fecha} alCambiar={(iso) => cambiar({ fecha: iso }, "fecha")} disabled={cargando} aria-invalid={errores.fecha ? true : undefined} aria-describedby={errores.fecha ? "mov-fecha-error" : undefined} />
            {errores.fecha ? mensaje("fecha") : <span className={styles.ayuda}>No puede ser futura. La hora la registra el servidor.</span>}
          </label>

          <div className={local.seccion}>Producto y cantidad</div>

          <label className={claseCampo("productoId", styles.wide)}>
            <span>
              Producto <b>*</b>
            </span>
            <select
              {...ariaCampo("productoId")}
              value={form.productoId}
              disabled={cargando}
              onChange={(e) => {
                cambiar({ productoId: e.target.value, lote: "", fechaVencimiento: "" }, "productoId");
                setErrores((x) => ({ ...x, lote: undefined, fechaVencimiento: undefined }));
              }}
            >
              <option value="">Seleccione un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id} disabled={p.modoControl === "UNIDAD_ETIQUETADA"}>
                  {p.codigo} · {p.descripcion}
                  {p.modoControl === "UNIDAD_ETIQUETADA" ? " (unidad identificada: no disponible)" : ""}
                </option>
              ))}
            </select>
            {mensaje("productoId")}
          </label>

          <label className={claseCampo("cantidad")}>
            <span>
              Cantidad <b>*</b>
              {producto ? ` (${producto.unidadMedidaNombre || "unidad base"})` : ""}
            </span>
            <input
              {...ariaCampo("cantidad")}
              type="number"
              inputMode="decimal"
              min="0.0001"
              step="0.0001"
              value={cantidadTxt}
              disabled={cargando}
              onChange={(e) => {
                if (control.current.bloqueado()) return;
                setCantidadTxt(e.target.value);
                cambiar({ cantidad: e.target.value === "" ? 0 : Number(e.target.value) }, "cantidad");
              }}
            />
            {errores.cantidad ? mensaje("cantidad") : <span className={styles.ayuda}>Unidad base del producto, hasta 4 decimales.</span>}
          </label>

          {info.costo ? (
            <label className={claseCampo("costoUnitario")}>
              <span>
                Costo unitario ({catalogo?.monedaBase ?? ""}) <b>*</b>
              </span>
              <input
                {...ariaCampo("costoUnitario")}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0001"
                value={costoTxt}
                disabled={cargando}
                onChange={(e) => {
                  if (control.current.bloqueado()) return;
                  setCostoTxt(e.target.value);
                  setForm((f) => ({ ...f, costoUnitario: e.target.value === "" ? null : Number(e.target.value) }));
                  setErrores((x) => ({ ...x, costoUnitario: undefined }));
                }}
              />
              {errores.costoUnitario ? mensaje("costoUnitario") : <span className={styles.ayuda}>El costo no se inventa: ingréselo explícitamente.</span>}
            </label>
          ) : null}

          {producto ? (
            <>
              <div className={local.saldos} aria-label="Saldo visible del producto">
                <div>
                  <span>Disponible</span>
                  <strong>{saldos.disponible}</strong>
                </div>
                <div>
                  <span>Reservado</span>
                  <strong>{saldos.reservado}</strong>
                </div>
                <div>
                  <span>Cuarentena</span>
                  <strong>{saldos.cuarentena}</strong>
                </div>
                <div>
                  <span>Tránsito</span>
                  <strong>{saldos.transito}</strong>
                </div>
              </div>
              <p className={local.saldosNota}>{depositoRef ? `Saldo propio en ${nombreDeposito(depositoRef)}.` : "Saldo propio total de los depósitos que usted puede operar."}</p>
            </>
          ) : null}
          {aviso ? (
            <div className={local.aviso} role="status">
              {aviso}
            </div>
          ) : null}

          {info.origen || info.destino ? <div className={local.seccion}>Depósitos</div> : null}

          {info.origen ? (
            <label className={claseCampo("depositoOrigenId", styles.wide)}>
              <span>
                Depósito origen <b>*</b>
              </span>
              <select {...ariaCampo("depositoOrigenId")} value={form.depositoOrigenId} disabled={cargando} onChange={(e) => cambiar({ depositoOrigenId: e.target.value }, "depositoOrigenId")}>
                <option value="">Seleccione el depósito origen</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id} disabled={!puedeSeleccionarDeposito(d.id, form.depositoDestinoId)}>
                    {d.codigo} · {d.nombre}
                  </option>
                ))}
              </select>
              {mensaje("depositoOrigenId")}
            </label>
          ) : null}

          {info.destino ? (
            <label className={claseCampo("depositoDestinoId", styles.wide)}>
              <span>
                Depósito destino <b>*</b>
              </span>
              <select {...ariaCampo("depositoDestinoId")} value={form.depositoDestinoId} disabled={cargando} onChange={(e) => cambiar({ depositoDestinoId: e.target.value }, "depositoDestinoId")}>
                <option value="">Seleccione el depósito destino</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id} disabled={!puedeSeleccionarDeposito(d.id, form.depositoOrigenId)}>
                    {d.codigo} · {d.nombre}
                  </option>
                ))}
              </select>
              {mensaje("depositoDestinoId")}
            </label>
          ) : null}

          {producto?.modoControl === "LOTE" ? (
            <>
              <div className={local.seccion}>Lote y vencimiento</div>

              <label className={claseCampo("lote", styles.wide)}>
                <span>
                  Lote <b>*</b>
                </span>
                <input {...ariaCampo("lote")} value={form.lote} list="lotes-sugeridos" maxLength={80} autoComplete="off" onChange={(e) => cambiar({ lote: e.target.value }, "lote")} />
                <datalist id="lotes-sugeridos">
                  {lotesSugeridos.map((x, i) => (
                    <option key={`${x.codigo}-${x.estado}-${i}`} value={x.codigo}>
                      {x.estado} · {x.cantidad}
                    </option>
                  ))}
                </datalist>
                {errores.lote ? mensaje("lote") : <span className={styles.ayuda}>{form.tipo === "ENTRADA" || form.tipo === "AJUSTE_POSITIVO" ? "Puede crear un lote nuevo." : "Debe ser un lote existente con saldo."}</span>}
              </label>

              {info.destino && form.tipo !== "TRANSFERENCIA" ? (
                <label className={claseCampo("fechaVencimiento")}>
                  <span>Fecha de vencimiento</span>
                  <CampoFecha id={idCampo("fechaVencimiento")} valor={form.fechaVencimiento} alCambiar={(iso) => cambiar({ fechaVencimiento: iso }, "fechaVencimiento")} aria-invalid={errores.fechaVencimiento ? true : undefined} aria-describedby={errores.fechaVencimiento ? "mov-fechaVencimiento-error" : undefined} />
                  {mensaje("fechaVencimiento")}
                </label>
              ) : null}
            </>
          ) : null}

          <div className={local.seccion}>Referencia</div>

          <label className={claseCampo("documentoReferencia", styles.wide)}>
            <span>Documento de referencia</span>
            <input {...ariaCampo("documentoReferencia")} value={form.documentoReferencia} maxLength={120} placeholder="OC-000123 / ENT-000845" onChange={(e) => cambiar({ documentoReferencia: e.target.value }, "documentoReferencia")} />
            {errores.documentoReferencia ? mensaje("documentoReferencia") : <span className={styles.ayuda}>Texto libre: no se vincula ni se valida contra facturas, remisiones ni notas de crédito.</span>}
          </label>

          <label className={claseCampo("motivo", styles.wide)}>
            <span>
              Motivo {motivoRequerido ? <b>*</b> : null}
            </span>
            <input {...ariaCampo("motivo")} value={form.motivo} maxLength={300} onChange={(e) => cambiar({ motivo: e.target.value }, "motivo")} />
            {errores.motivo ? mensaje("motivo") : <span className={styles.ayuda}>{motivoRequerido ? "Obligatorio para este tipo y origen (mínimo 5 caracteres)." : "Opcional para este tipo y origen."}</span>}
          </label>

          <label className={claseCampo("observacion", styles.full)}>
            <span>Observación</span>
            <textarea {...ariaCampo("observacion")} rows={3} value={form.observacion} maxLength={1000} onChange={(e) => cambiar({ observacion: e.target.value }, "observacion")} />
            {mensaje("observacion")}
          </label>

          </fieldset>

          <div className={styles.formActions}>
            <Link href="/movimientos" className={ui.secondaryButton}>
              Cancelar
            </Link>
            {estadoRegistro === "INDETERMINADO" ? (
              <button type="button" className={ui.secondaryButton} onClick={descartarTentativa}>
                Descartar este intento
              </button>
            ) : null}
            <button type="submit" className={ui.primaryButton} disabled={saving || cargando}>
              {saving ? "Registrando..." : estadoRegistro === "INDETERMINADO" ? "Reintentar el mismo registro" : "Registrar movimiento"}
            </button>
          </div>
          <p className={styles.nota}>Al registrar, los saldos y el costo se actualizan en la base de datos mediante el procedimiento oficial de inventario; el movimiento no se puede editar ni borrar, solo anular con un movimiento inverso.</p>
        </form>
      </section>
    </section>
  );
}
