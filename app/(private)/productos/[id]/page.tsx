"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
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
    if (new URLSearchParams(window.location.search).get("aviso") === "documentos") {
      void Promise.resolve().then(() => {
        setPestana("documentos");
        setAvisoDocumentos(true);
      });
      window.history.replaceState(null, "", window.location.pathname);
    }

    return () => {
      activo = false;
    };
  }, [params.id, recarga]);

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
      aviso={avisoDocumentos ? "El producto se registró, pero algunos archivos no pudieron cargarse. Cárguelos desde la pestaña Documentos o la foto desde Información." : undefined}
      pestanaInicial={pestana}
      alCambiarPestana={setPestana}
    />
  );
}
