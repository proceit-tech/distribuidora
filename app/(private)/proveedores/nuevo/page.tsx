"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import EstadoPagina from "@/app/(private)/proveedores/_components/estado-pagina";
import ProveedorForm from "@/app/(private)/proveedores/_components/proveedor-form";
import RetomarAlta from "@/app/(private)/proveedores/_components/retomar-alta";
import { leerRetomada, subirDocumentosPendientes, urlRetomada } from "@/lib/proveedores/alta";
import { cargarCatalogos, errorDeRespuesta } from "@/lib/proveedores/cliente-api";
import { cerrarCargaInicialProveedor } from "@/lib/proveedores/cierre-carga";
import type { DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import type { CatalogoProveedores } from "@/types/proveedores";

type Retomada = { id: string; codigo: string; pendientes: DocumentoPendiente[]; mensaje: string };

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProveedores | null>(null);
  const [error, setError] = useState("");
  // Proveedor YA creado cuya carga documental quedó incompleta: se conserva su id (también en la URL, para sobrevivir a una recarga) y NUNCA se vuelve a crear.
  const [retomada, setRetomada] = useState<Retomada | null>(null);
  const [verificado, setVerificado] = useState(false);

  useEffect(() => {
    // Tras una recarga, la URL conserva el proveedor ya creado: se retoma en lugar de mostrar el formulario de alta.
    void Promise.resolve().then(() => {
      const r = leerRetomada(window.location.search);

      if (r) setRetomada({ id: r.id, codigo: r.codigo, pendientes: [], mensaje: "" });
      setVerificado(true);
    });

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
    const creado = ((await respuesta.json()) as { proveedor: { id: string; codigo?: string } }).proveedor;
    const id = creado.id;
    const codigo = creado.codigo ?? "";
    const subida = await subirDocumentosPendientes(id, documentos);
    const fallidos = documentos.filter((d) => !subida.subidos.includes(d.uid));

    if (fallidos.length === 0) {
      // Se verifica la respuesta HTTP y la red: sin cierre confirmado NO se muestra el alta como terminada ni se permite crear otro proveedor.
      const cierre = await cerrarCargaInicialProveedor(id);

      if (cierre.cerrada) {
        router.push("/proveedores?ok=creado");
        router.refresh();

        return;
      }

      window.history.replaceState(null, "", urlRetomada(id, codigo));
      setRetomada({ id, codigo, pendientes: [], mensaje: `${cierre.mensaje}${cierre.estado ? ` (código ${cierre.estado})` : ""}` });

      return;
    }

    // Quedan documentos sin cargar: se retoma en esta misma pantalla (la ficha exige PROVEEDORES.VER, que el creador con solo CREAR no tiene). Los ya cargados no se repiten.
    window.history.replaceState(null, "", urlRetomada(id, codigo));
    setRetomada({ id, codigo, pendientes: fallidos, mensaje: `Algunos documentos no se pudieron cargar: ${[...new Set(subida.fallidos.map((f) => f.mensaje))].join(" · ")}` });
  }

  if (retomada) {
    return (
      <RetomarAlta
        key={retomada.id}
        id={retomada.id}
        codigo={retomada.codigo}
        pendientesIniciales={retomada.pendientes}
        mensajeInicial={retomada.mensaje}
        alTerminar={() => {
          router.push("/proveedores?ok=creado");
          router.refresh();
        }}
      />
    );
  }

  if (error) {
    return <EstadoPagina titulo="No fue posible cargar el formulario" texto={error} volver />;
  }

  if (!catalogos || !verificado) {
    return <EstadoPagina titulo="Cargando formulario..." />;
  }

  return <ProveedorForm mode="create" catalogos={catalogos} onSave={guardar} />;
}
