"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import EstadoPagina from "@/app/(private)/proveedores/_components/estado-pagina";
import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/proveedores/cliente-api";
import { cerrarCargaInicialProveedor } from "@/lib/proveedores/cierre-carga";
import { formDataDeDocumento, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import type { CatalogoProveedores } from "@/types/proveedores";

import styles from "../_components/proveedor-form.module.css";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProveedores | null>(null);
  const [error, setError] = useState("");
  // Proveedor YA creado cuyo cierre de carga documental falló: se conserva su id y NUNCA se vuelve a crear (el formulario ya no se muestra).
  const [pendienteCierre, setPendienteCierre] = useState<{ id: string; mensaje: string; estado: number | null } | null>(null);
  const [reintentando, setReintentando] = useState(false);

  useEffect(() => {
    cargarCatalogos()
      .then(setCatalogos)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function guardar(data: Record<string, unknown>, documentos: DocumentoPendiente[]) {
    const respuesta = await fetch("/api/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el proveedor.");
    }

    // El proveedor ya existe: a partir de aquí NUNCA se vuelve a crear. Se cargan los archivos adjuntos y se cierra la carga inicial.
    const id = ((await respuesta.json()) as { proveedor: { id: string } }).proveedor.id;
    let fallidos = 0;

    for (const [indice, documento] of documentos.entries()) {
      try {
        const subida = await fetch(`/api/proveedores/${id}/documentos`, { method: "POST", body: formDataDeDocumento(documento, indice) });

        if (!subida.ok) fallidos += 1;
      } catch {
        fallidos += 1;
      }
    }

    if (fallidos === 0) {
      // Se verifica la respuesta HTTP y la red: sin cierre confirmado NO se muestra el alta como terminada ni se permite crear otro proveedor.
      const cierre = await cerrarCargaInicialProveedor(id);

      if (cierre.cerrada) {
        router.push("/proveedores?ok=creado");
        router.refresh();

        return;
      }

      setPendienteCierre({ id, mensaje: cierre.mensaje, estado: cierre.estado });

      return;
    }

    // Quedan documentos sin cargar: la ficha se abre en la pestaña de documentos (la carga inicial sigue abierta para su creador).
    router.push(`/proveedores/${id}?aviso=documentos`);
  }

  // Reintento idempotente del cierre (misma autoridad que el alta: el creador con solo PROVEEDORES.CREAR puede finalizar mientras la carga siga abierta; no requiere abrir la ficha).
  async function reintentarCierre() {
    if (!pendienteCierre) return;

    setReintentando(true);

    const cierre = await cerrarCargaInicialProveedor(pendienteCierre.id);

    setReintentando(false);

    if (cierre.cerrada) {
      router.push("/proveedores?ok=creado");
      router.refresh();

      return;
    }

    setPendienteCierre({ ...pendienteCierre, mensaje: cierre.mensaje, estado: cierre.estado });
  }

  if (pendienteCierre) {
    return (
      <main className={styles.estado}>
        <div className={styles.estadoCaja} role="alert">
          <strong>El proveedor se registró, pero no se pudo cerrar la carga inicial de documentos</strong>
          <span>
            {pendienteCierre.mensaje}
            {pendienteCierre.estado ? ` (código ${pendienteCierre.estado})` : ""} El proveedor ya existe y NO se vuelve a crear; sus documentos ya se enviaron. Reintente el cierre; si persiste, la carga inicial se cierra sola en la primera edición del proveedor.
          </span>
          <button type="button" className={styles.saveButton} disabled={reintentando} onClick={reintentarCierre}>
            {reintentando ? "Reintentando..." : "Reintentar cierre"}
          </button>
          <Link href="/proveedores">Salir sin cerrar la carga</Link>
        </div>
      </main>
    );
  }

  if (error) {
    return <EstadoPagina titulo="No fue posible cargar el formulario" texto={error} volver />;
  }

  if (!catalogos) {
    return <EstadoPagina titulo="Cargando formulario..." />;
  }

  return <ProveedorForm mode="create" catalogos={catalogos} onSave={guardar} />;
}
