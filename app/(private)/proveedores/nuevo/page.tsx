"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import EstadoPagina from "@/app/(private)/proveedores/_components/estado-pagina";
import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/proveedores/cliente-api";
import { formDataDeDocumento, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import type { CatalogoProveedores } from "@/types/proveedores";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProveedores | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarCatalogos()
      .then(setCatalogos)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function guardar(data: Record<string, unknown>, documentos: DocumentoPendiente[]) {
    const respuesta = await fetch("/api/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el proveedor.");
    }

    // El proveedor ya existe: a partir de aquí NUNCA se vuelve a crear. Se cargan los archivos adjuntos y se cierra la carga inicial.
    const id = ((await respuesta.json()) as { proveedor: { id: string } }).proveedor.id;
    let fallidos = 0;

    for (const [indice, documento] of documentos.entries()) {
      try {
        const subida = await fetch(`/api/proveedores/${id}/documentos`, { method: "POST", body: formDataDeDocumento(documento, indice) });

        if (!subida.ok) fallidos += 1;
      } catch {
        fallidos += 1;
      }
    }

    if (fallidos === 0) {
      try {
        await fetch(`/api/proveedores/${id}/documentos/finalizar`, { method: "POST" });
      } catch {
        // la carga inicial se cierra de todos modos en la primera edición
      }

      router.push("/proveedores?ok=creado");
      router.refresh();

      return;
    }

    // Quedan documentos sin cargar: la ficha se abre en la pestaña de documentos (la carga inicial sigue abierta para su creador).
    router.push(`/proveedores/${id}?aviso=documentos`);
  }

  if (error) {
    return <EstadoPagina titulo="No fue posible cargar el formulario" texto={error} volver />;
  }

  if (!catalogos) {
    return <EstadoPagina titulo="Cargando formulario..." />;
  }

  return <ProveedorForm mode="create" catalogos={catalogos} onSave={guardar} />;
}
