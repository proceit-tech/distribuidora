"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProductoForm from "@/app/(private)/productos/_components/producto-form";
import RetomarAlta from "@/app/(private)/productos/_components/retomar-alta";
import { leerEstadoRetomada, leerRetomada, subirDocumentosPendientes, subirFoto, urlRetomada } from "@/lib/productos/alta";
import { cargarCatalogosConPermisos, errorDeRespuesta } from "@/lib/productos/cliente-api";
import { cerrarCargaInicial } from "@/lib/productos/cierre-carga";
import type { EstadoRetomada } from "@/lib/productos/alta";
import type { DocumentoPendiente } from "@/lib/productos/documento-pendiente";
import type { CatalogoProductos } from "@/types/productos";

type Retomada = { id: string; codigo: string; foto: File | null; pendientes: DocumentoPendiente[]; mensaje: string; estado: EstadoRetomada; /** true = los pendientes de esta sesión son exactos; false = tras recargar no se sabe qué falta */ exacta: boolean };

export default function NuevoProductoPage() {
  const router = useRouter();
  const [catalogos, setCatalogos] = useState<CatalogoProductos | null>(null);
  const [error, setError] = useState("");
  // Producto YA creado cuya carga de archivos quedó incompleta: se conserva su id (también en la URL, para sobrevivir a una recarga) y NUNCA se vuelve a crear.
  const [retomada, setRetomada] = useState<Retomada | null>(null);
  const [verificado, setVerificado] = useState(false);
  // PRD-D01: permiso VER informado por la API desde la sesión del servidor. Sin VER no hay lista ni fichas: la alta termina en una pantalla propia y no ofrece enlaces a ellas.
  const [puedeVer, setPuedeVer] = useState(false);
  const [altaFinalizada, setAltaFinalizada] = useState(false);

  useEffect(() => {
    // Tras una recarga, la URL conserva el producto ya creado: se retoma en lugar de mostrar el formulario de alta.
    void Promise.resolve().then(() => {
      const r = leerRetomada(window.location.search);

      if (r) setRetomada({ id: r.id, codigo: r.codigo, foto: null, pendientes: [], mensaje: "", estado: leerEstadoRetomada(window.location.search), exacta: false });
      setVerificado(true);
    });

    cargarCatalogosConPermisos()
      .then((r) => {
        setCatalogos(r.catalogos);
        setPuedeVer(r.puedeVer);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // El servidor ya confirmó el cierre de la carga inicial. Con VER se vuelve a la lista; sin VER (solo CREAR) se muestra una conclusión propia que permite iniciar otra alta.
  function terminar() {
    if (!puedeVer) {
      setAltaFinalizada(true);

      return;
    }

    router.push("/productos");
    router.refresh();
  }

  async function guardar(data: Record<string, unknown>, documentos: DocumentoPendiente[], foto: File | null) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!respuesta.ok) {
      throw await errorDeRespuesta(respuesta, "No fue posible registrar el producto.");
    }

    // El producto ya existe: a partir de aquí NUNCA se vuelve a crear. La foto y cada documento se rastrean por separado; solo lo no confirmado por el servidor queda pendiente.
    const creado = ((await respuesta.json()) as { producto: { id: string; codigo?: string } }).producto;
    const id = creado.id;
    const codigo = creado.codigo ?? "";
    const fallas: string[] = [];
    let fotoPendiente: File | null = null;

    if (foto) {
      const r = await subirFoto(id, foto);

      if (!r.ok) {
        fotoPendiente = foto;
        fallas.push(`foto: ${r.mensaje}${r.estado ? ` (código ${r.estado})` : ""}`);
      }
    }

    const subida = await subirDocumentosPendientes(id, documentos);
    const fallidos = documentos.filter((d) => !subida.subidos.includes(d.uid));

    fallas.push(...subida.fallidos.map((f) => f.mensaje));

    if (fotoPendiente === null && fallidos.length === 0) {
      // Se verifica la respuesta HTTP y la red: sin cierre confirmado NO se muestra el alta como terminada ni se permite crear otro producto.
      const cierre = await cerrarCargaInicial(id);

      if (cierre.cerrada) {
        terminar();

        return;
      }

      window.history.replaceState(null, "", urlRetomada(id, codigo, "cierre"));
      setRetomada({ id, codigo, foto: null, pendientes: [], mensaje: `${cierre.mensaje}${cierre.estado ? ` (código ${cierre.estado})` : ""}`, estado: "cierre", exacta: true });

      return;
    }

    // Quedan archivos sin cargar: se retoma en esta misma pantalla (la ficha exige PRODUCTOS.VER, que el creador con solo CREAR no tiene). Lo ya cargado no se repite.
    window.history.replaceState(null, "", urlRetomada(id, codigo, "archivos"));
    setRetomada({ id, codigo, foto: fotoPendiente, pendientes: fallidos, mensaje: `Algunos archivos no se pudieron cargar: ${[...new Set(fallas)].join(" · ")}`, estado: "archivos", exacta: true });
  }

  if (altaFinalizada) {
    return (
      <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Producto registrado</h1>
        <p role="status" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
          El producto se registró correctamente y su carga inicial de archivos quedó cerrada. Su perfil puede registrar productos, pero no consultar la lista ni las fichas.
        </p>
        <button type="button" onClick={() => window.location.assign("/productos/nuevo")} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: 0, background: "#0c919b", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Registrar otro producto
        </button>
      </main>
    );
  }

  if (retomada) {
    return (
      <RetomarAlta
        key={retomada.id}
        id={retomada.id}
        codigo={retomada.codigo}
        fotoInicial={retomada.foto}
        pendientesIniciales={retomada.pendientes}
        mensajeInicial={retomada.mensaje}
        estadoInicial={retomada.estado}
        pendientesExactas={retomada.exacta}
        alTerminar={terminar}
        puedeVerLista={puedeVer}
      />
    );
  }

  if (error) {
    return <main style={{ padding: 24 }}>{error}</main>;
  }

  if (!catalogos || !verificado) {
    return <main style={{ padding: 24 }}>Cargando catálogos...</main>;
  }

  return <ProductoForm mode="create" catalogos={catalogos} onSave={guardar} puedeVerLista={puedeVer} />;
}
