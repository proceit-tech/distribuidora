"use client";

import { useEffect, useState } from "react";

import type { ProveedorDireccion } from "@/types/proveedores";

import { Casilla, Selector, SinRegistros, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

type Opcion = { codigo: number; nombre: string };

/** Paraguay: departamento / distrito / ciudad desde el catálogo oficial; otros países: texto libre. */
function Geografia({
  direccion,
  prefijo,
  departamentos,
  errores,
  onChange,
}: {
  direccion: ProveedorDireccion;
  prefijo: string;
  departamentos: Opcion[];
  errores: Record<string, string>;
  onChange: (parche: Partial<ProveedorDireccion>) => void;
}) {
  // Cada lista guarda la clave (departamento / distrito) para la que se cargó; con otra clave se considera vacía.
  const [cargaDistritos, setCargaDistritos] = useState<{ clave: string; lista: Opcion[] }>({ clave: "", lista: [] });
  const [cargaCiudades, setCargaCiudades] = useState<{ clave: string; lista: Opcion[] }>({ clave: "", lista: [] });
  const esPy = direccion.paisCodigo === "PRY";
  const dep = direccion.departamentoCodigo;
  const dis = direccion.distritoCodigo;
  const claveDistritos = esPy && dep ? dep : "";
  const claveCiudades = esPy && dep && dis ? `${dep}/${dis}` : "";
  const distritos = cargaDistritos.clave === claveDistritos ? cargaDistritos.lista : [];
  const ciudades = cargaCiudades.clave === claveCiudades ? cargaCiudades.lista : [];

  useEffect(() => {
    if (!claveDistritos) return;
    let activo = true;
    fetch(`/api/proveedores?catalogo=distritos&departamento=${encodeURIComponent(claveDistritos)}`)
      .then((r) => (r.ok ? r.json() : { datos: [] }))
      .then((j) => activo && setCargaDistritos({ clave: claveDistritos, lista: j.datos ?? [] }))
      .catch(() => activo && setCargaDistritos({ clave: claveDistritos, lista: [] }));
    return () => {
      activo = false;
    };
  }, [claveDistritos]);

  useEffect(() => {
    if (!claveCiudades) return;
    let activo = true;
    fetch(`/api/proveedores?catalogo=ciudades&departamento=${encodeURIComponent(dep)}&distrito=${encodeURIComponent(dis)}`)
      .then((r) => (r.ok ? r.json() : { datos: [] }))
      .then((j) => activo && setCargaCiudades({ clave: claveCiudades, lista: j.datos ?? [] }))
      .catch(() => activo && setCargaCiudades({ clave: claveCiudades, lista: [] }));
    return () => {
      activo = false;
    };
  }, [claveCiudades, dep, dis]);

  if (!esPy) {
    return (
      <>
        <Texto etiqueta="Departamento o estado" campo={`${prefijo}.departamento`} errores={errores} valor={direccion.departamento} alCambiar={(v) => onChange({ departamento: v })} maxLength={150} />
        <Texto etiqueta="Distrito o región" campo={`${prefijo}.distrito`} errores={errores} valor={direccion.distrito} alCambiar={(v) => onChange({ distrito: v })} maxLength={150} />
        <Texto etiqueta="Ciudad" campo={`${prefijo}.ciudad`} errores={errores} valor={direccion.ciudad} alCambiar={(v) => onChange({ ciudad: v })} maxLength={150} />
      </>
    );
  }

  const opciones = (lista: Opcion[]): Array<[string, string]> => [["", "Seleccione"], ...lista.map((o): [string, string] => [String(o.codigo), o.nombre])];

  return (
    <>
      <Selector etiqueta="Departamento *" campo={`${prefijo}.departamentoCodigo`} errores={errores} valor={dep} alCambiar={(v) => onChange({ departamentoCodigo: v, distritoCodigo: "", ciudadCodigo: "" })} opciones={opciones(departamentos)} />
      <Selector etiqueta="Distrito *" campo={`${prefijo}.distritoCodigo`} errores={errores} valor={dis} disabled={!dep} alCambiar={(v) => onChange({ distritoCodigo: v, ciudadCodigo: "" })} opciones={opciones(distritos)} />
      <Selector etiqueta="Ciudad *" campo={`${prefijo}.ciudadCodigo`} errores={errores} valor={direccion.ciudadCodigo} disabled={!dis} alCambiar={(v) => onChange({ ciudadCodigo: v })} opciones={opciones(ciudades)} />
    </>
  );
}

export function PestanaDirecciones({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Direcciones</h3>
        <button type="button" className={styles.addButton} onClick={() => ctx.agregar("direcciones")}>
          + Agregar dirección
        </button>
      </div>

      {form.direcciones.length === 0 ? <SinRegistros texto="Aún no hay direcciones cargadas." /> : <p className={styles.nota} style={{ margin: "0 0 10px" }}>* Obligatorio en cada dirección agregada.</p>}

      <div className={styles.repeaterList}>
        {form.direcciones.map((d, i) => {
          const p = `direcciones.${i}`;
          const cambiar = (parche: Partial<ProveedorDireccion>) => ctx.actualizar("direcciones", d.id, parche);

          return (
            <article key={d.id} className={styles.repeaterCard}>
              <header>
                <strong>Dirección {i + 1}</strong>
                <button type="button" onClick={() => ctx.quitar("direcciones", d.id)}>
                  Eliminar
                </button>
              </header>

              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Tipo *"
                  campo={`${p}.tipo`}
                  errores={errores}
                  valor={d.tipo}
                  alCambiar={(v) => cambiar({ tipo: v as ProveedorDireccion["tipo"] })}
                  opciones={[
                    ["FISCAL", "Fiscal"],
                    ["COMERCIAL", "Comercial"],
                    ["RETIRO", "Retiro"],
                    ["PAGOS", "Pagos"],
                    ["OTRA", "Otra"],
                  ]}
                />
                <Texto etiqueta="Descripción *" campo={`${p}.descripcion`} errores={errores} valor={d.descripcion} alCambiar={(v) => cambiar({ descripcion: v })} maxLength={150} />
                <Texto etiqueta="Dirección *" campo={`${p}.direccion`} errores={errores} valor={d.direccion} alCambiar={(v) => cambiar({ direccion: v })} maxLength={300} />
                <Texto etiqueta="Nro. de casa" campo={`${p}.numeroCasa`} errores={errores} valor={d.numeroCasa} alCambiar={(v) => cambiar({ numeroCasa: v })} maxLength={20} />
              </div>

              <div className={styles.gridFour}>
                <Selector
                  etiqueta="País *"
                  campo={`${p}.paisCodigo`}
                  errores={errores}
                  valor={d.paisCodigo}
                  alCambiar={(v) =>
                    cambiar({
                      paisCodigo: v,
                      paisNombre: catalogos.paises.find((x) => x.codigo === v)?.nombre ?? "",
                      departamentoCodigo: "",
                      distritoCodigo: "",
                      ciudadCodigo: "",
                      departamento: "",
                      distrito: "",
                      ciudad: "",
                    })
                  }
                  opciones={catalogos.paises.map((x): [string, string] => [x.codigo, x.nombre])}
                />
                <Geografia direccion={d} prefijo={p} departamentos={catalogos.departamentos} errores={errores} onChange={cambiar} />
              </div>

              <div className={styles.gridFour}>
                <Texto etiqueta="Código postal" campo={`${p}.codigoPostal`} errores={errores} valor={d.codigoPostal} alCambiar={(v) => cambiar({ codigoPostal: v })} maxLength={30} />
              </div>

              <div className={styles.checkGrid}>
                <Casilla etiqueta="Dirección principal de este tipo" campo={`${p}.esPrincipal`} valor={d.esPrincipal} alCambiar={(v) => ctx.marcarPrincipal("direcciones", d.id, v)} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
