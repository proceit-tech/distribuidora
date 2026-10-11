"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import { cargarCatalogos, mensajeError } from "@/lib/productos/cliente-api";
import type {
  CatalogoProductos,
  NuevoProducto,
  ProductoDetalle,
} from "@/types/productos";

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogoProductos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const [respuesta, cats] = await Promise.all([
          fetch(`/api/productos/${encodeURIComponent(params.id)}`, {
            cache: "no-store",
          }),
          cargarCatalogos(),
        ]);

        if (!respuesta.ok) {
          if (respuesta.status === 404) {
            if (activo) setProducto(null);
            return;
          }
          throw new Error(
            await mensajeError(respuesta, "No fue posible cargar el producto."),
          );
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

    cargar();
    return () => {
      activo = false;
    };
  }, [params.id]);

  async function guardar(data: NuevoProducto) {
    const respuesta = await fetch(
      `/api/productos/${encodeURIComponent(params.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );

    if (!respuesta.ok) {
      throw new Error(
        await mensajeError(respuesta, "No fue posible actualizar el producto."),
      );
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

  return (
    <ProductoForm
      mode="edit"
      initial={producto}
      catalogos={catalogos}
      onSave={guardar}
    />
  );
}
