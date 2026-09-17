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

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import {
  actualizarProductoDemo,
  buscarProductoDemo,
} from "@/lib/mocks/productos-storage";
import {
  NuevoProductoDemo,
  ProductoDemo,
} from "@/types/productos";

export default function EditarProductoPage() {
  const params = useParams<{
    id: string;
  }>();

  const router = useRouter();

  const [
    producto,
    setProducto,
  ] = useState<ProductoDemo | null>(
    null,
  );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setProducto(
      buscarProductoDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  async function guardar(
    data: NuevoProductoDemo,
  ) {
    const updated =
      actualizarProductoDemo(
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
          400,
        ),
    );

    router.push("/productos");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        Cargando producto...
      </main>
    );
  }

  if (!producto) {
    return (
      <main style={{ padding: 24 }}>
        <h1>
          Producto no encontrado
        </h1>

        <Link href="/productos">
          Volver a productos
        </Link>
      </main>
    );
  }

  return (
    <ProductoForm
      mode="edit"
      initial={producto}
      onSave={guardar}
    />
  );
}