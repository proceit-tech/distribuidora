"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import { cargarCatalogos, mensajeError } from "@/lib/productos/cliente-api";
import type {
  CatalogoProductos,
  NuevoProducto,
} from "@/types/productos";

export default function NuevoProductoPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProductos | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarCatalogos()
      .then(setCatalogos)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function guardar(data: NuevoProducto) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw new Error(
        await mensajeError(respuesta, "No fue posible registrar el producto."),
      );
    }

    router.push("/productos");
    router.refresh();
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!catalogos) {
    return <main style={{ padding: 24 }}>Cargando catálogos...</main>;
  }

  return (
    <ProductoForm mode="create" catalogos={catalogos} onSave={guardar} />
  );
}
