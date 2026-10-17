"use client";

import { useEffect, useMemo, useState } from "react";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";

export type EmpresaFila = {
  codigo: string;
  razonSocial: string;
  ruc: string;
  estado: string;
  usuarios: number;
};

const PAGE_SIZE = 20;

type CampoOrden = "codigo" | "razon" | "ruc" | "estado" | "usuarios";

export function EmpresasLista({ empresas }: { empresas: EmpresaFila[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("TODOS");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [pagina, setPagina] = useState(1);

  const estados = useMemo(() => Array.from(new Set(empresas.map((e) => e.estado))).sort(), [empresas]);

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLocaleLowerCase("es");

    return empresas.filter((e) => {
      if (estado !== "TODOS" && e.estado !== estado) {
        return false;
      }

      return !term || [e.codigo, e.razonSocial, e.ruc].join(" ").toLocaleLowerCase("es").includes(term);
    });
  }, [empresas, busqueda, estado]);

  // Ordenación sobre el conjunto filtrado COMPLETO (todas las empresas están cargadas), antes de paginar.
  const ordenadas = useMemo(
    () =>
      ordenarLista(filtradas, orden, (campo, a, b) => {
        switch (campo) {
          case "codigo":
            return compararTexto(a.codigo, b.codigo);
          case "razon":
            return compararTexto(a.razonSocial, b.razonSocial);
          case "ruc":
            return compararTexto(a.ruc, b.ruc);
          case "estado":
            return compararTexto(a.estado, b.estado);
          case "usuarios":
            return a.usuarios - b.usuarios;
        }
      }),
    [filtradas, orden],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));

  useEffect(() => {
    setPagina(1);
  }, [busqueda, estado, orden]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const paginaActual = useMemo(
    () => ordenadas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [ordenadas, pagina],
  );

  const cambiarOrden = (campo: CampoOrden) => setOrden((actual) => siguienteOrden(actual, campo));

  return (
    <section className={ui.contentCard}>
      <div className={ui.toolbar}>
        <label className={ui.search}>
          <span aria-hidden="true">⌕</span>
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por código, razón social o RUC"
            aria-label="Buscar empresas"
          />
        </label>

        <label className={ui.filterField}>
          <span>Estado</span>
          <select value={estado} onChange={(event) => setEstado(event.target.value)}>
            <option value="TODOS">Todos</option>
            {estados.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={ui.clearButton}
          onClick={() => {
            setBusqueda("");
            setEstado("TODOS");
          }}
        >
          Limpiar filtros
        </button>

        <span className={ui.resultCount} aria-live="polite">
          {filtradas.length} de {empresas.length}
        </span>
      </div>

      <div className={ui.tableScroll}>
        <table className={ui.table} style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <ThOrdenable titulo="Código" campo="codigo" orden={orden} onOrden={cambiarOrden} />
              <ThOrdenable titulo="Razón social" campo="razon" orden={orden} onOrden={cambiarOrden} />
              <ThOrdenable titulo="RUC" campo="ruc" orden={orden} onOrden={cambiarOrden} />
              <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} />
              <ThOrdenable titulo="Usuarios" campo="usuarios" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
            </tr>
          </thead>

          <tbody>
            {paginaActual.map((e) => (
              <tr key={e.codigo} className={ui.row}>
                <td>
                  <span className={ui.mono}>{e.codigo}</span>
                </td>
                <td>
                  <strong>{e.razonSocial}</strong>
                </td>
                <td>
                  <span className={ui.mono}>{e.ruc || "—"}</span>
                </td>
                <td>
                  <span className={e.estado === "ACTIVA" ? ui.statusActive : ui.statusWarning}>{e.estado}</span>
                </td>
                <td className={ui.numeric}>
                  <span className={ui.mono}>{e.usuarios}</span>
                </td>
              </tr>
            ))}

            {paginaActual.length === 0 ? (
              <tr>
                <td colSpan={5} className={ui.emptyCell}>
                  <div className={ui.empty}>
                    <strong>{empresas.length === 0 ? "Aún no hay empresas registradas" : "No se encontraron empresas"}</strong>
                    {empresas.length > 0 ? <span>Modifique los filtros aplicados.</span> : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <footer className={ui.pagination}>
        <span>
          Mostrando {filtradas.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–
          {Math.min(pagina * PAGE_SIZE, filtradas.length)} de {filtradas.length}
        </span>

        <div>
          <button
            type="button"
            aria-label="Página anterior"
            disabled={pagina === 1}
            onClick={() => setPagina((actual) => actual - 1)}
          >
            ‹
          </button>

          <strong>
            {pagina} / {totalPaginas}
          </strong>

          <button
            type="button"
            aria-label="Página siguiente"
            disabled={pagina === totalPaginas}
            onClick={() => setPagina((actual) => actual + 1)}
          >
            ›
          </button>
        </div>
      </footer>
    </section>
  );
}
