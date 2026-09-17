"use client";

import { useRouter } from "next/navigation";

import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { crearProveedorDemo } from "@/lib/mocks/proveedores-storage";
import type { NuevoProveedorDemo } from "@/types/proveedores";

export default function NuevoProveedorPage() {
  const router = useRouter();

  async function guardar(
    data: NuevoProveedorDemo,
  ) {
    crearProveedorDemo(data);

    await new Promise((resolve) =>
      window.setTimeout(resolve, 400),
    );

    router.push("/proveedores");
    router.refresh();
  }

  return (
    <ProveedorForm
      mode="create"
      onSave={guardar}
    />
  );
}
