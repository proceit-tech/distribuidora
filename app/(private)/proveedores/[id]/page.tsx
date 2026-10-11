"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import EstadoPagina from "@/app/(private)/proveedores/_components/estado-pagina";
import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, errorDeRespuesta, mensajeError } from "@/lib/proveedores/cliente-api";
import type {
  CatalogoProveedores,
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

  async function guardar(data: Record<string, unknown>) {
    const respuesta = await fetch(
      `/api/proveedores/${encodeURIComponent(params.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible actualizar el proveedor.");
    }

    router.push("/proveedores?ok=actualizado");
    router.refresh();
  }

  if (loading) {
    return <EstadoPagina titulo="Cargando proveedor..." />;
  }

  if (error) {
    return <EstadoPagina titulo="No fue posible cargar el proveedor" texto={error} volver />;
  }

  if (!proveedor || !catalogos) {
    return <EstadoPagina titulo="Proveedor no encontrado" texto="El registro no existe o no pertenece a su empresa." volver />;
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
