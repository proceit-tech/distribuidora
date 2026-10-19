"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ListaPrecioForm from "@/app/(private)/listas-precio/_components/lista-precio-form";
import { guardarLista } from "@/lib/listas-precio/cliente-api";
import type { NuevaListaPrecio } from "@/types/lista-precio";

export default function NuevaListaPrecioPage() {
  const router = useRouter();
  const [creada, setCreada] = useState(false);

  // LPR-D01: con VER se vuelve a la lista; sin VER (solo CREAR) se muestra una conclusión propia, sin enlaces a destinos prohibidos.
  async function guardar(data: NuevaListaPrecio, ctx: { puedeVer: boolean }) {
    await guardarLista(data);

    if (ctx.puedeVer) {
      router.push("/listas-precio?ok=creado");
      router.refresh();

      return;
    }

    setCreada(true);
  }

  if (creada) {
    return (
      <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Lista de precios registrada</h1>
        <p role="status" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
          La lista se registró correctamente. Su perfil puede registrar listas de precios, pero no consultar el listado ni las fichas.
        </p>
        <button type="button" onClick={() => window.location.assign("/listas-precio/nuevo")} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: 0, background: "#0c919b", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Registrar otra lista
        </button>
      </main>
    );
  }

  return <ListaPrecioForm mode="create" onSave={guardar} />;
}
