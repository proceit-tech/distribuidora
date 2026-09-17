"use client";

import { useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import {
  crearProductoDemo,
} from "@/lib/mocks/productos-storage";
import {
  NuevoProductoDemo,
} from "@/types/productos";

export default function NuevoProductoPage() {
  const router = useRouter();

  async function guardar(
    data: NuevoProductoDemo,
  ) {
    crearProductoDemo(data);

    await new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          400,
        ),
    );

    router.push("/productos");
    router.refresh();
  }

  return (
    <ProductoForm
      mode="create"
      onSave={guardar}
    />
  );
}