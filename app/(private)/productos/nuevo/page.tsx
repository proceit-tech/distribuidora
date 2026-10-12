"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/productos/cliente-api";
import { cerrarCargaInicial } from "@/lib/productos/cierre-carga";
import { formDataDeDocumento, type DocumentoPendiente } from "@/lib/productos/documento-pendiente";
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

  async function guardar(data: Record<string, unknown>, documentos: DocumentoPendiente[], foto: File | null) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el producto.");
    }

    // El producto ya existe: a partir de aquí NUNCA se vuelve a crear. Se cargan la foto y los documentos y se cierra la carga inicial.
    const id = ((await respuesta.json()) as { producto: { id: string } }).producto.id;
    let fallidos = 0;

    if (foto) {
      try {
        const datos = new FormData();

        datos.set("archivo", foto);

        const subida = await fetch(`/api/productos/${id}/imagen`, { method: "POST", body: datos });

        if (!subida.ok) fallidos += 1;
      } catch {
        fallidos += 1;
      }
    }

    for (const [indice, documento] of documentos.entries()) {
      try {
        const subida = await fetch(`/api/productos/${id}/documentos`, { method: "POST", body: formDataDeDocumento(documento, indice) });

        if (!subida.ok) fallidos += 1;
      } catch {
        fallidos += 1;
      }
    }

    if (fallidos === 0) {
      // Se verifica la respuesta HTTP: si el cierre falla NO se presenta el alta como terminada ni se crea otro producto; la ficha ofrece reintentar.
      const cierre = await cerrarCargaInicial(id);

      if (cierre.cerrada) {
        router.push("/productos");
        router.refresh();

        return;
      }

      router.push(`/productos/${id}?aviso=cierre&estado=${cierre.estado ?? "red"}`);

      return;
    }

    // Quedan archivos sin cargar: la ficha se abre en la pestaña de documentos (la carga inicial sigue abierta para su creador).
    router.push(`/productos/${id}?aviso=documentos`);
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!catalogos) {
    return <main style={{ padding: 24 }}>Cargando catálogos...</main>;
  }

  return <ProductoForm mode="create" catalogos={catalogos} onSave={guardar} />;
}
