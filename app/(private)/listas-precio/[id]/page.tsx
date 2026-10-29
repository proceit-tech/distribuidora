"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ListaPrecioForm from "@/app/(private)/listas-precio/_components/lista-precio-form";
import { cargarListaConPermisos, guardarLista } from "@/lib/listas-precio/cliente-api";
import type { ListaPrecioDetalle, NuevaListaPrecio } from "@/types/lista-precio";

import styles from "./page.module.css";

export default function EditarListaPrecioPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [lista, setLista] = useState<ListaPrecioDetalle | null>(null);
  // LPR-D02: permiso EDITAR de la sesión del servidor; sin él la ficha es de consulta.
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    cargarListaConPermisos(params.id)
      .then((r) => {
        if (!activo) return;
        setLista(r?.lista ?? null);
        setPuedeEditar(r?.puedeEditar === true);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar la lista de precios.");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [params.id]);

  async function guardar(data: NuevaListaPrecio) {
    await guardarLista(data, params.id);
    router.push("/listas-precio?ok=actualizado");
    router.refresh();
  }

  if (loading) return <main className={styles.state}>Cargando lista de precios...</main>;

  if (error || !lista) {
    return (
      <main className={styles.state}>
        <h1>{error ? "No fue posible cargar la lista de precios" : "Lista de precios no encontrada"}</h1>
        {error ? <p>{error}</p> : null}
        <Link href="/listas-precio">Volver a listas</Link>
      </main>
    );
  }

  return <ListaPrecioForm mode="edit" initial={lista} onSave={guardar} soloLectura={!puedeEditar} />;
}
