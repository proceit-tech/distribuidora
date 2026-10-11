"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/productos/cliente-api";
import type { CatalogoProductos } from "@/types/productos";

export default function NuevoProductoPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProductos | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarCatalogos()
      .then(setCatalogos)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function guardar(data: Record<string, unknown>) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el producto.");
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
