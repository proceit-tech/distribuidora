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

import ListaPrecioForm from "@/app/(private)/listas-precio/_components/lista-precio-form";

import {
  actualizarListaPrecioDemo,
  buscarListaPrecioDemo,
} from "@/lib/mocks/listas-precio-storage";

import {
  ListaPrecioDemo,
  NuevaListaPrecioDemo,
} from "@/types/lista-precio";

import styles from "./page.module.css";

export default function EditarListaPrecioPage() {
  const params = useParams<{
    id: string;
  }>();

  const router = useRouter();

  const [
    lista,
    setLista,
  ] =
    useState<ListaPrecioDemo | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setLista(
      buscarListaPrecioDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  async function guardar(
    data: NuevaListaPrecioDemo,
  ) {
    const updated =
      actualizarListaPrecioDemo(
        params.id,
        data,
      );

    if (!updated) {
      throw new Error();
    }

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

  if (loading) {
    return (
      <main className={styles.state}>
        Cargando lista de precios...
      </main>
    );
  }

  if (!lista) {
    return (
      <main className={styles.state}>
        <h1>
          Lista de precios no encontrada
        </h1>

        <Link href="/listas-precio">
          Volver a listas
        </Link>
      </main>
    );
  }

  return (
    <ListaPrecioForm
      mode="edit"
      initial={lista}
      onSave={guardar}
    />
  );
}