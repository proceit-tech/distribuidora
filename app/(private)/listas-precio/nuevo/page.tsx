"use client";

import { useRouter } from "next/navigation";

import ListaPrecioForm from "@/app/(private)/listas-precio/_components/lista-precio-form";

import {
  crearListaPrecioDemo,
} from "@/lib/mocks/listas-precio-storage";

import {
  NuevaListaPrecioDemo,
} from "@/types/lista-precio";

export default function NuevaListaPrecioPage() {
  const router = useRouter();

  async function guardar(
    data: NuevaListaPrecioDemo,
  ) {
    crearListaPrecioDemo(data);

    await new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          350,
        ),
    );

    router.push("/listas-precio");
    router.refresh();
  }

  return (
    <ListaPrecioForm
      mode="create"
      onSave={guardar}
    />
  );
}
