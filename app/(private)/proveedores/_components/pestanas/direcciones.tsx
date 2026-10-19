"use client";

import { useCallback, useEffect, useState } from "react";

import { crearCargaCatalogo, leerCatalogo, type EstadoCatalogo } from "@/lib/proveedores/geografia-catalogo";
import type { ProveedorDireccion } from "@/types/proveedores";

import { Bloque, Casilla, Selector, SinRegistros, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

type Opcion = { codigo: number; nombre: string };
type ErroresGeoDireccion = { distritos: string; ciudades: string; reintentarDistritos: () => void; reintentarCiudades: () => void };

/** Catálogo geográfico con identidad por clave: estado de la consulta vigente, error clasificado y reintento. */
function useCatalogoGeo(clave: string, url: string) {
  const [estado, setEstado] = useState<EstadoCatalogo>({ clave: "", lista: [], error: "", cargando: false });
  const [intento, setIntento] = useState(0);
  const [carga] = useState(() => crearCargaCatalogo({ pedir: (u) => leerCatalogo(u), alEstado: setEstado }));

  useEffect(() => {
    if (!clave) return;

    void carga.solicitar(clave, url);

    return () => carga.invalidar();
  }, [clave, url, intento, carga]);

  const vigente = clave !== "" && estado.clave === clave;
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { lista: vigente ? estado.lista : [], error: vigente ? estado.error : "", reintentar };
}

function ErrorGeo({ mensaje, reintentar }: { mensaje: string; reintentar: () => void }) {
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "center", color: "#a1281f", fontSize: 13, margin: "0 0 8px" }}>
      <span>{mensaje}</span>
      <button type="button" className={styles.addButton} onClick={reintentar}>
        Reintentar
      </button>
    </div>
  );
}

/** Paraguay: departamento / distrito / ciudad desde el catálogo oficial; otros países: texto libre. */
function Geografia({
  direccion,
  prefijo,
  departamentos,
  errores,
  onChange,
  alErrorGeo,
}: {
  direccion: ProveedorDireccion;
  prefijo: string;
  departamentos: Opcion[];
  errores: Record<string, string>;
  onChange: (parche: Partial<ProveedorDireccion>) => void;
  /** PRV-R03-02: los errores del catálogo y su «Reintentar» se muestran fuera del bloque deshabilitado de solo lectura; aquí solo se informan (null = sin error / desmontada). */
  alErrorGeo: (id: string, errores: ErroresGeoDireccion | null) => void;
}) {
  const esPy = direccion.paisCodigo === "PRY";
  const dep = direccion.departamentoCodigo;
  const dis = direccion.distritoCodigo;
  const claveDistritos = esPy && dep ? dep : "";
  const claveCiudades = esPy && dep && dis ? `${dep}/${dis}` : "";
  // PRV-D03: cada catálogo distingue vacío legítimo, acceso (401/403), servicio y conexión; solo la consulta vigente aplica resultado o error, y «Reintentar» repite la consulta actual.
  const cargaDistritos = useCatalogoGeo(claveDistritos, `/api/proveedores?catalogo=distritos&departamento=${encodeURIComponent(dep)}`);
  const cargaCiudades = useCatalogoGeo(claveCiudades, `/api/proveedores?catalogo=ciudades&departamento=${encodeURIComponent(dep)}&distrito=${encodeURIComponent(dis)}`);
  const distritos = cargaDistritos.lista;
  const ciudades = cargaCiudades.lista;
  const { error: errorDistritos, reintentar: reintentarDistritos } = cargaDistritos;
  const { error: errorCiudades, reintentar: reintentarCiudades } = cargaCiudades;
  const idDireccion = direccion.id;

  useEffect(() => {
    alErrorGeo(idDireccion, errorDistritos || errorCiudades ? { distritos: errorDistritos, ciudades: errorCiudades, reintentarDistritos, reintentarCiudades } : null);

    return () => alErrorGeo(idDireccion, null);
  }, [idDireccion, errorDistritos, errorCiudades, reintentarDistritos, reintentarCiudades, alErrorGeo]);

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
  const [erroresGeo, setErroresGeo] = useState<Record<string, ErroresGeoDireccion>>({});
  const alErrorGeo = useCallback((id: string, e: ErroresGeoDireccion | null) => {
    setErroresGeo((actual) => {
      if (e === null) {
        if (!(id in actual)) return actual;

        const resto = { ...actual };

        delete resto[id];

        return resto;
      }

      return { ...actual, [id]: e };
    });
  }, []);

  return (
    <>
      {/* PRV-R03-02: los errores del catálogo con «Reintentar» van FUERA del bloque de solo lectura: repetir la consulta GET no edita ni guarda nada. */}
      {form.direcciones.map((d, i) => {
        const e = erroresGeo[d.id];

        return e ? (
          <div key={`geo-${d.id}`}>
            {e.distritos ? <ErrorGeo mensaje={`Dirección ${i + 1} · Distritos: ${e.distritos}`} reintentar={e.reintentarDistritos} /> : null}
            {e.ciudades ? <ErrorGeo mensaje={`Dirección ${i + 1} · Ciudades: ${e.ciudades}`} reintentar={e.reintentarCiudades} /> : null}
          </div>
        ) : null;
      })}

      <Bloque bloqueado={ctx.soloLectura}>
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
                <Geografia direccion={d} prefijo={p} departamentos={catalogos.departamentos} errores={errores} onChange={cambiar} alErrorGeo={alErrorGeo} />
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
      </Bloque>
    </>
  );
}
