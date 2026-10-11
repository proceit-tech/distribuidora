"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import EstadoPagina from "@/app/(private)/proveedores/_components/estado-pagina";
import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/proveedores/cliente-api";
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

  async function guardar(data: Record<string, unknown>) {
    const respuesta = await fetch("/api/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el proveedor.");
    }

    router.push("/proveedores?ok=creado");
    router.refresh();
  }

  if (error) {
    return <EstadoPagina titulo="No fue posible cargar el formulario" texto={error} volver />;
  }

  if (!catalogos) {
    return <EstadoPagina titulo="Cargando formulario..." />;
  }

  return <ProveedorForm mode="create" catalogos={catalogos} onSave={guardar} />;
}
