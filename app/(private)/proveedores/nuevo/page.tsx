"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, mensajeError } from "@/lib/proveedores/cliente-api";
import type {
  CatalogoProveedores,
  NuevoProveedor,
} from "@/types/proveedores";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProveedores | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    cargarCatalogos()
      .then(setCatalogos)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function guardar(data: NuevoProveedor) {
    const respuesta = await fetch("/api/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw new Error(
        await mensajeError(respuesta, "No fue posible registrar el proveedor."),
      );
    }

    router.push("/proveedores?ok=creado");
    router.refresh();
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!catalogos) {
    return <main style={{ padding: 24 }}>Cargando catálogos...</main>;
  }

  return (
    <ProveedorForm mode="create" catalogos={catalogos} onSave={guardar} />
  );
}
