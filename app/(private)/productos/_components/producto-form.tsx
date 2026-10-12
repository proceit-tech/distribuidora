"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ErrorValidacion } from "@/lib/productos/errores";
import { formularioAPayload, formularioDesdeDetalle, formularioInicial, type FormularioProducto } from "@/lib/productos/formulario";
import { UUID, normalizarProducto, type Coleccion } from "@/lib/productos/normalizar";
import { idCampo, pestanaDeCampo, type PestanaId } from "@/lib/productos/pestanas";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

import type { Errores } from "./campos";
import type { ContextoFormulario } from "./contexto";
import { PestanaCompras } from "./pestanas/compras";
import { PestanaDocumentos } from "./pestanas/documentos";
import { PestanaInformacion } from "./pestanas/informacion";
import { PestanaInventario } from "./pestanas/inventario";
import { PestanaKit } from "./pestanas/kit";
import { PestanaLogistica } from "./pestanas/logistica";
import { PestanaSifen } from "./pestanas/sifen";
import styles from "./producto-form.module.css";

type Props = {
  mode: "create" | "edit";
  initial?: ProductoDetalle;
  catalogos: CatalogoProductos;
  /** Recibe el contrato de la API; debe lanzar ErrorValidacion (con campo) si el servidor lo rechaza. */
  onSave: (datos: Record<string, unknown>) => Promise<void> | void;
};

const PESTANAS: Array<{ id: PestanaId; etiqueta: string }> = [
  { id: "general", etiqueta: "Información" },
  { id: "sifen", etiqueta: "SIFEN y códigos" },
  { id: "stock", etiqueta: "Inventario" },
  { id: "compras", etiqueta: "Compras" },
  { id: "logistica", etiqueta: "Logística" },
  { id: "kit", etiqueta: "Alternativos y kits" },
  { id: "documentos", etiqueta: "Documentos" },
];

function temporal(prefijo: string) {
  return `nuevo-${prefijo}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const NUEVAS: Record<Coleccion, (form: FormularioProducto, catalogos: CatalogoProductos) => Record<string, unknown>> = {
  codigos: (form) => ({ id: temporal("codigo"), tipo: "GTIN", codigo: "", descripcion: "", esPrincipal: form.codigos.length === 0 }),
  unidades: () => ({ id: temporal("presentacion"), unidadMedidaId: "", nombrePresentacion: "", factorConversion: "1", esUnidadBase: false, esUnidadCompra: false, esUnidadVenta: true, codigoBarras: "", pesoBrutoKg: "", volumenM3: "" }),
  proveedores: (form, catalogos) => ({
    id: temporal("proveedor"),
    proveedorId: "",
    proveedorNombre: "",
    codigoProveedor: "",
    descripcionProveedor: "",
    unidadMedidaId: "",
    factorConversion: "1",
    costoReferencia: "",
    monedaCodigo: catalogos.monedaReferencia || "",
    cantidadMinimaCompra: "",
    plazoEntregaDias: "",
    esPrincipal: form.proveedores.length === 0,
  }),
  depositos: () => ({ id: temporal("deposito"), depositoId: "", depositoNombre: "", ubicacionPreferidaId: "", stockMinimo: "", stockMaximo: "", puntoReposicion: "", cantidadReposicion: "" }),
  alternativos: () => ({ id: temporal("alternativo"), productoAlternativoId: "", productoAlternativoNombre: "", tipo: "SUSTITUTO", prioridad: "1" }),
  componentes: (form) => ({ id: temporal("componente"), productoComponenteId: "", productoComponenteNombre: "", cantidad: "1", esOpcional: false, orden: String(form.componentes.length + 1) }),
  documentos: () => ({ id: temporal("documento"), tipo: "FICHA_TECNICA", nombreArchivo: "", urlArchivo: "", fechaEmision: "", fechaVencimiento: "", observacion: "" }),
};

export default function ProductoForm({ mode, initial, catalogos, onSave }: Props) {
  const [formularioBase] = useState<FormularioProducto>(() => (initial ? formularioDesdeDetalle(initial) : formularioInicial(catalogos)));
  const [form, setForm] = useState<FormularioProducto>(formularioBase);
  const [tab, setTab] = useState<PestanaId>("general");
  const [errores, setErrores] = useState<Errores>({});
  const [pestanaConError, setPestanaConError] = useState<PestanaId | "">("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enfocar = useRef<string | null>(null);

  // Tras mostrar la pestaña del error se enfoca el campo exacto.
  useEffect(() => {
    if (!enfocar.current) return;

    const id = enfocar.current;

    enfocar.current = null;
    document.getElementById(id)?.focus();
  }, [tab, errores]);

  const titulo = mode === "create" ? "Nuevo producto" : "Editar producto";

  function set<K extends keyof FormularioProducto>(clave: K, valor: FormularioProducto[K]) {
    setForm((actual) => ({ ...actual, [clave]: valor }));
  }

  function agregar(coleccion: Coleccion) {
    setForm((actual) => ({ ...actual, [coleccion]: [...(actual[coleccion] as unknown[]), NUEVAS[coleccion](actual, catalogos)] }));
  }

  function actualizar(coleccion: Coleccion, id: string, parche: Record<string, unknown>) {
    setForm((actual) => ({ ...actual, [coleccion]: (actual[coleccion] as Array<{ id: string }>).map((fila) => (fila.id === id ? { ...fila, ...parche } : fila)) }));
  }

  function quitar(coleccion: Coleccion, id: string) {
    setForm((actual) => ({
      ...actual,
      [coleccion]: (actual[coleccion] as Array<{ id: string }>).filter((fila) => fila.id !== id),
      // Una fila ya guardada se elimina solo porque el usuario lo pidió: queda registrada para la baja explícita.
      eliminaciones: UUID.test(id) ? { ...actual.eliminaciones, [coleccion]: [...actual.eliminaciones[coleccion], id] } : actual.eliminaciones,
    }));
  }

  function marcarPrincipal(coleccion: "codigos" | "proveedores", id: string, valor: boolean) {
    setForm((actual) => ({
      ...actual,
      [coleccion]: (actual[coleccion] as Array<{ id: string; esPrincipal: boolean }>).map((f) => (f.id === id ? { ...f, esPrincipal: valor } : valor ? { ...f, esPrincipal: false } : f)),
    }));
  }

  function mostrarError(e: ErrorValidacion) {
    setError(e.message);
    setErrores(e.campo ? { [e.campo]: e.message } : {});

    if (e.campo) {
      const pestana = pestanaDeCampo(e.campo);

      if (pestana) {
        setTab(pestana);
        setPestanaConError(pestana);
      }
      enfocar.current = idCampo(e.campo);
    } else {
      setPestanaConError("");
    }
  }

  async function submit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    setErrores({});
    setPestanaConError("");

    let payload: Record<string, unknown>;

    try {
      payload = formularioAPayload(form, mode === "create" ? "crear" : "editar");
      normalizarProducto(payload, {
        modo: mode === "create" ? "crear" : "editar",
        productoId: initial?.id,
        tasaImpuesto: form.impuestoId ? (catalogos.impuestos.find((i) => i.id === form.impuestoId)?.porcentaje ?? null) : null,
      }); // la misma validación que ejecuta el servidor
    } catch (e) {
      mostrarError(e instanceof ErrorValidacion ? e : new ErrorValidacion(e instanceof Error ? e.message : "Los datos no son válidos."));
      return;
    }

    setGuardando(true);

    try {
      await onSave(payload);
    } catch (e) {
      mostrarError(
        e instanceof ErrorValidacion
          ? e
          : new ErrorValidacion(e instanceof Error && e.message ? e.message : mode === "create" ? "No fue posible registrar el producto." : "No fue posible actualizar el producto."),
      );
    } finally {
      setGuardando(false);
    }
  }

  const ctx: ContextoFormulario = { modo: mode === "create" ? "crear" : "editar", form, detalle: initial, catalogos, errores, set, agregar, actualizar, quitar, marcarPrincipal };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <nav className={styles.miga} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <Link href="/productos">Productos</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{titulo}</span>
          </nav>

          <div className={styles.titulo}>
            <h1>{mode === "edit" && initial ? initial.descripcion : titulo}</h1>

            {mode === "edit" && initial ? (
              <>
                <span className={styles.codigo}>{initial.codigo}</span>
                <span className={form.activo ? styles.statusActive : styles.statusInactive}>{form.activo ? "Activo" : "Inactivo"}</span>
                <span className={styles.statusNeutral}>{form.tipoProducto.replaceAll("_", " ")}</span>
              </>
            ) : null}
          </div>
        </div>

        <Link href="/productos" className={styles.secondaryButton}>
          ← Volver a productos
        </Link>
      </header>

      <form className={styles.card} onSubmit={submit} noValidate>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs} aria-label="Secciones del producto">
          {PESTANAS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "true" : undefined}
              className={[tab === item.id ? styles.tabActive : "", pestanaConError === item.id ? styles.tabError : ""].filter(Boolean).join(" ")}
              onClick={() => setTab(item.id)}
            >
              {item.etiqueta}
              {pestanaConError === item.id ? <span className={styles.sr}>(contiene un error)</span> : null}
            </button>
          ))}
        </nav>

        {tab === "general" ? <p className={styles.nota}>Los campos con * son obligatorios.{mode === "create" ? " El código interno se genera al guardar." : ""}</p> : null}

        <div className={styles.content}>
          {tab === "general" ? <PestanaInformacion ctx={ctx} /> : null}
          {tab === "sifen" ? <PestanaSifen ctx={ctx} /> : null}
          {tab === "stock" ? <PestanaInventario ctx={ctx} /> : null}
          {tab === "compras" ? <PestanaCompras ctx={ctx} /> : null}
          {tab === "logistica" ? <PestanaLogistica ctx={ctx} /> : null}
          {tab === "kit" ? <PestanaKit ctx={ctx} /> : null}
          {tab === "documentos" ? <PestanaDocumentos ctx={ctx} /> : null}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerActions}>
            <Link href="/productos" className={styles.cancelButton}>
              Cancelar
            </Link>

            <button type="submit" disabled={guardando} className={styles.saveButton}>
              {guardando ? (mode === "create" ? "Guardando..." : "Actualizando...") : mode === "create" ? "Guardar producto" : "Actualizar producto"}
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}

