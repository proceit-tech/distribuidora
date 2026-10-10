"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, mensajeError } from "@/lib/proveedores/cliente-api";
import type {
  CatalogoProveedores,
  NuevoProveedor,
  ProveedorDetalle,
} from "@/types/proveedores";

export default function EditarProveedorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [proveedor, setProveedor] = useState<ProveedorDetalle | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogoProveedores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const [respuesta, cats] = await Promise.all([
          fetch(`/api/proveedores/${encodeURIComponent(params.id)}`, {
            cache: "no-store",
          }),
          cargarCatalogos(),
        ]);

        if (!respuesta.ok) {
          if (respuesta.status === 404) {
            if (activo) setProveedor(null);
            return;
          }
          throw new Error(
            await mensajeError(respuesta, "No fue posible cargar el proveedor."),
          );
        }

        const json = (await respuesta.json()) as { proveedor: ProveedorDetalle };
        if (activo) {
          setProveedor(json.proveedor);
          setCatalogos(cats);
        }
      } catch (e) {
        if (activo) {
          setError(e instanceof Error ? e.message : "No fue posible cargar el proveedor.");
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

  async function guardar(data: NuevoProveedor) {
    const respuesta = await fetch(
      `/api/proveedores/${encodeURIComponent(params.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );

    if (!respuesta.ok) {
      throw new Error(
        await mensajeError(respuesta, "No fue posible actualizar el proveedor."),
      );
    }

    router.push("/proveedores?ok=actualizado");
    router.refresh();
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Cargando proveedor...</main>;
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!proveedor || !catalogos) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Proveedor no encontrado</h1>
        <Link href="/proveedores">Volver a proveedores</Link>
      </main>
    );
  }

  return (
    <ProveedorForm
      mode="edit"
      initial={proveedor}
      catalogos={catalogos}
      onSave={guardar}
    />
  );
}
