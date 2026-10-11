"use client";

import { useRouter } from "next/navigation";

import ListaPrecioForm from "@/app/(private)/listas-precio/_components/lista-precio-form";
import { guardarLista } from "@/lib/listas-precio/cliente-api";
import type { NuevaListaPrecio } from "@/types/lista-precio";

export default function NuevaListaPrecioPage() {
  const router = useRouter();

  async function guardar(data: NuevaListaPrecio) {
    await guardarLista(data);
    router.push("/listas-precio?ok=creado");
    router.refresh();
  }

  return <ListaPrecioForm mode="create" onSave={guardar} />;
}
