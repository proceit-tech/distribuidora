"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import {
  actualizarProveedorDemo,
  buscarProveedorDemo,
} from "@/lib/mocks/proveedores-storage";
import type {
  NuevoProveedorDemo,
  ProveedorDemo,
} from "@/types/proveedores";

export default function EditarProveedorPage() {
  const params = useParams<{
    id: string;
  }>();

  const router = useRouter();

  const [
    proveedor,
    setProveedor,
  ] = useState<ProveedorDemo | null>(
    null,
  );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setProveedor(
      buscarProveedorDemo(params.id),
    );

    setLoading(false);
  }, [params.id]);

  async function guardar(
    data: NuevoProveedorDemo,
  ) {
    const updated =
      actualizarProveedorDemo(
        params.id,
        data,
      );

    if (!updated) {
      throw new Error();
    }

    await new Promise((resolve) =>
      window.setTimeout(resolve, 400),
    );

    router.push("/proveedores");
    router.refresh();
  }

  if (loading) {
    return (
      <main
        style={{
          padding: 24,
        }}
      >
        Cargando proveedor...
      </main>
    );
  }

  if (!proveedor) {
    return (
      <main
        style={{
          padding: 24,
        }}
      >
        <h1>
          Proveedor no encontrado
        </h1>

        <Link href="/proveedores">
          Volver a proveedores
        </Link>
      </main>
    );
  }

  return (
    <ProveedorForm
      mode="edit"
      initial={proveedor}
      onSave={guardar}
    />
  );
}
