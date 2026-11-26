"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import { cerrarCargaInicial } from "@/lib/productos/cierre-carga";
import { cargarCatalogos, errorDeRespuesta, mensajeError } from "@/lib/productos/cliente-api";
import type { PestanaId } from "@/lib/productos/pestanas";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogoProductos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [avisoDocumentos, setAvisoDocumentos] = useState(false);
  const [cierrePendiente, setCierrePendiente] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [pestana, setPestana] = useState<PestanaId>("general");

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const [respuesta, cats] = await Promise.all([
          fetch(`/api/productos/${encodeURIComponent(params.id)}`, { cache: "no-store" }),
          cargarCatalogos(),
        ]);

        if (!respuesta.ok) {
          if (respuesta.status === 404) {
            if (activo) setProducto(null);
            return;
          }
          throw new Error(await mensajeError(respuesta, "No fue posible cargar el producto."));
        }

        const json = (await respuesta.json()) as { producto: ProductoDetalle };
        if (activo) {
          setProducto(json.producto);
          setCatalogos(cats);
        }
      } catch (e) {
        if (activo) {
          setError(e instanceof Error ? e.message : "No fue posible cargar el producto.");
        }
      } finally {
        if (activo) setLoading(false);
      }
    }

    void cargar();

    // Tras un alta con archivos pendientes de cargar se abre la pestaña de documentos con un aviso.
    const consulta = new URLSearchParams(window.location.search);

    if (consulta.get("aviso") === "documentos") {
      void Promise.resolve().then(() => {
        setPestana("documentos");
        setAvisoDocumentos(true);
      });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (consulta.get("aviso") === "cierre") {
      // El alta y sus archivos están guardados; solo falló confirmar el cierre de la carga inicial (PRD-AUD-07).
      const estado = consulta.get("estado");

      void Promise.resolve().then(() => {
        setPestana("documentos");
        setCierrePendiente(estado && estado !== "red" ? `código HTTP ${estado}` : "sin conexión");
      });
      window.history.replaceState(null, "", window.location.pathname);
    }

    return () => {
      activo = false;
    };
  }, [params.id, recarga]);

  async function reintentarCierre() {
    setReintentando(true);

    const cierre = await cerrarCargaInicial(params.id);

    setReintentando(false);

    if (cierre.cerrada) {
      setCierrePendiente(null);
      recargar();
    } else {
      setCierrePendiente(`${cierre.estado === null ? "sin conexión" : `código HTTP ${cierre.estado}`}: ${cierre.mensaje}`);
      recargar(); // refleja si la carga ya estaba cerrada
    }
  }

  async function guardar(data: Record<string, unknown>) {
    const respuesta = await fetch(`/api/productos/${encodeURIComponent(params.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible actualizar el producto.");
    }

    router.push("/productos");
    router.refresh();
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Cargando producto...</main>;
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!producto || !catalogos) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Producto no encontrado</h1>
        <Link href="/productos">Volver a productos</Link>
      </main>
    );
  }

  // La clave remonta el formulario cuando cambia la ficha recargada (tras una acción sobre archivos) para no operar con datos viejos.
  return (
    <ProductoForm
      key={`${producto.actualizadoEn}-${producto.documentos.length}-${producto.imagenPrivada?.actualizadaEn ?? ""}-${recarga}`}
      mode="edit"
      initial={producto}
      catalogos={catalogos}
      onSave={guardar}
      onRecargar={recargar}
      aviso={
        cierrePendiente !== null && producto.cargaDocumentosInicialAbierta
          ? `El producto y sus archivos ya están registrados (no se creó otro producto), pero no se pudo confirmar el cierre de la carga inicial (${cierrePendiente}). Reintente el cierre.`
          : avisoDocumentos ? "El producto se registró, pero algunos archivos no pudieron cargarse. Cárguelos desde la pestaña Documentos o la foto desde Información." : undefined
      }
      accionAviso={cierrePendiente !== null && producto.cargaDocumentosInicialAbierta ? { etiqueta: "Reintentar cierre", onClick: () => void reintentarCierre(), ocupado: reintentando } : undefined}
      pestanaInicial={pestana}
      alCambiarPestana={setPestana}
    />
  );
}
