"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../page.module.css";

// Edición de contactos, direcciones y documentos del cliente (mismas tablas y campos que el alta).
// Cada fila existente conserva su `id`; una fila solo se elimina cuando el usuario la quita explícitamente.

export type ContactoForm = {
  k: string; id?: string;
  nombre: string; apellido: string; cargo: string; departamento: string; telefono: string; celular: string; email: string;
  esPrincipal: boolean; recibePedidos: boolean; recibeFacturacion: boolean; recibeCobranzas: boolean;
  recibeDocumentosElectronicos: boolean; recibeNotificaciones: boolean;
};
export type DireccionForm = {
  k: string; id?: string;
  tipo: string; etiqueta: string; direccion: string; numeroCasa: string; complemento: string; paisCodigo: string; paisNombre: string;
  departamentoCodigo: string; departamento: string; distritoCodigo: string; distrito: string; ciudadCodigo: string; ciudad: string;
  codigoPostal: string; contactoNombre: string; contactoTelefono: string; horarioRecepcion: string; observacion: string;
  esFiscal: boolean; esEntregaDefault: boolean; latitud: string; longitud: string;
};
export type DocumentoForm = {
  k: string; id?: string;
  tipo: string; nombreArchivo: string; urlArchivo: string; fechaEmision: string; fechaVencimiento: string; observacion: string;
};
export type HijosForm = {
  contactos: ContactoForm[]; direcciones: DireccionForm[]; documentos: DocumentoForm[];
  contactosEliminar: string[]; direccionesEliminar: string[]; documentosEliminar: string[];
};
export type OpcionGeo = { codigo?: string | number; nombre: string };
type Pais = { codigo: string; nombre: string };

let seq = 0;
const nuevaClave = () => `n${++seq}`;

export const hijosVacios: HijosForm = { contactos: [], direcciones: [], documentos: [], contactosEliminar: [], direccionesEliminar: [], documentosEliminar: [] };

export function hijosDesdeApi(d: { contactos?: Omit<ContactoForm, "k">[]; direcciones?: Omit<DireccionForm, "k">[]; documentos?: Omit<DocumentoForm, "k">[] }): HijosForm {
  return {
    ...hijosVacios,
    contactos: (d.contactos ?? []).map((x) => ({ ...x, k: x.id ?? nuevaClave() })),
    direcciones: (d.direcciones ?? []).map((x) => ({ ...x, k: x.id ?? nuevaClave() })),
    documentos: (d.documentos ?? []).map((x) => ({ ...x, k: x.id ?? nuevaClave() })),
  };
}

/** Cuerpo para el PUT: filas con id (las existentes) y sin id (nuevas) + ids eliminados explícitamente. */
export function hijosParaApi(h: HijosForm) {
  const limpio = <T extends { k: string }>(x: T) => {
    const { k, ...resto } = x;
    void k;
    return resto;
  };
  return {
    contactos: h.contactos.map(limpio),
    direcciones: h.direcciones.map(limpio),
    documentos: h.documentos.map(limpio),
    contactosEliminar: h.contactosEliminar,
    direccionesEliminar: h.direccionesEliminar,
    documentosEliminar: h.documentosEliminar,
  };
}

/** Validación previa en el cliente (el servidor vuelve a validar todo). Devuelve mensaje o "". */
export function validarHijos(h: HijosForm): string {
  for (const c of h.contactos) if (!c.nombre.trim()) return "Cada contacto debe tener nombre.";
  for (const d of h.direcciones) {
    if (!d.direccion.trim()) return "Informe la dirección de cada ubicación registrada.";
    if (!d.paisCodigo) return "Informe el país de cada dirección.";
  }
  for (const d of h.documentos) if (!d.nombreArchivo.trim() || !d.urlArchivo.trim()) return "Cada documento requiere nombre de archivo y URL segura.";
  return "";
}

const crearContacto = (): ContactoForm => ({ k: nuevaClave(), nombre: "", apellido: "", cargo: "", departamento: "", telefono: "", celular: "", email: "", esPrincipal: false, recibePedidos: false, recibeFacturacion: false, recibeCobranzas: false, recibeDocumentosElectronicos: false, recibeNotificaciones: true });
const crearDireccion = (): DireccionForm => ({ k: nuevaClave(), tipo: "COMERCIAL", etiqueta: "", direccion: "", numeroCasa: "", complemento: "", paisCodigo: "PRY", paisNombre: "Paraguay", departamentoCodigo: "", departamento: "", distritoCodigo: "", distrito: "", ciudadCodigo: "", ciudad: "", codigoPostal: "", contactoNombre: "", contactoTelefono: "", horarioRecepcion: "", observacion: "", esFiscal: false, esEntregaDefault: false, latitud: "", longitud: "" });
const crearDocumento = (): DocumentoForm => ({ k: nuevaClave(), tipo: "OTRO", nombreArchivo: "", urlArchivo: "", fechaEmision: "", fechaVencimiento: "", observacion: "" });

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={[styles.field, className ?? ""].join(" ")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Texto({ value, onChange, ...p }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...p} className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />;
}
function Lista({ value, onChange, children, ...p }: { value: string; onChange: (v: string) => void; children: React.ReactNode } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return <select {...p} className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}
function Marca({ etiqueta, marcado, cambiar }: { etiqueta: string; marcado: boolean; cambiar: (v: boolean) => void }) {
  return (
    <label className={styles.checkItem}>
      <input type="checkbox" checked={marcado} onChange={(e) => cambiar(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}
function Cabecera({ titulo, descripcion, agregar, onAgregar }: { titulo: string; descripcion: string; agregar: string; onAgregar: () => void }) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h3>{titulo}</h3>
        <p>{descripcion}</p>
      </div>
      <button type="button" className={styles.addButton} onClick={onAgregar}>+ {agregar}</button>
    </div>
  );
}
function Fila({ titulo, existente, onQuitar, children }: { titulo: string; existente: boolean; onQuitar: () => void; children: React.ReactNode }) {
  return (
    <article className={styles.repeated}>
      <div className={styles.repeatedHead}>
        <strong>{titulo}{existente ? "" : " (nuevo)"}</strong>
        <button type="button" className={styles.removeButton} onClick={onQuitar}>Eliminar</button>
      </div>
      {children}
    </article>
  );
}

const optGeo = (lista: OpcionGeo[], vacio: string) => (
  <>
    <option value="">{vacio}</option>
    {lista.map((o) => <option key={String(o.codigo)} value={String(o.codigo ?? "")}>{o.nombre}</option>)}
  </>
);

type Tab = "contactos" | "direcciones" | "documentos";

export function HijosEditor({ tab, valor, onChange, paises, departamentos, onError }: {
  tab: Tab; valor: HijosForm; onChange: (v: HijosForm) => void; paises: Pais[]; departamentos: OpcionGeo[]; onError: (m: string) => void;
}) {
  const [distritos, setDistritos] = useState<Record<string, OpcionGeo[]>>({});
  const [ciudades, setCiudades] = useState<Record<string, OpcionGeo[]>>({});
  const cargados = useRef(new Set<string>());

  async function pedir(url: string): Promise<OpcionGeo[]> {
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json()) as { datos?: OpcionGeo[]; error?: string };
    if (!r.ok) throw new Error(j.error ?? "No fue posible cargar la ubicación.");
    return j.datos ?? [];
  }

  // Direcciones ya guardadas: precarga distritos y ciudades para mostrar la selección actual.
  useEffect(() => {
    for (const d of valor.direcciones) {
      if (d.paisCodigo !== "PRY" || !d.departamentoCodigo || cargados.current.has(d.k)) continue;
      cargados.current.add(d.k);
      void (async () => {
        try {
          const dis = await pedir(`/api/clientes?catalogo=distritos&departamento=${encodeURIComponent(d.departamentoCodigo)}`);
          setDistritos((a) => ({ ...a, [d.k]: dis }));
          if (d.distritoCodigo) {
            const ciu = await pedir(`/api/clientes?catalogo=ciudades&departamento=${encodeURIComponent(d.departamentoCodigo)}&distrito=${encodeURIComponent(d.distritoCodigo)}`);
            setCiudades((a) => ({ ...a, [d.k]: ciu }));
          }
        } catch (e) {
          onError(e instanceof Error ? e.message : "No fue posible cargar la ubicación.");
        }
      })();
    }
  }, [valor.direcciones]); // eslint-disable-line react-hooks/exhaustive-deps

  const setC = (k: string, p: Partial<ContactoForm>) => onChange({ ...valor, contactos: valor.contactos.map((x) => (x.k === k ? { ...x, ...p } : x)) });
  const setD = (k: string, p: Partial<DireccionForm>) => onChange({ ...valor, direcciones: valor.direcciones.map((x) => (x.k === k ? { ...x, ...p } : x)) });
  const setO = (k: string, p: Partial<DocumentoForm>) => onChange({ ...valor, documentos: valor.documentos.map((x) => (x.k === k ? { ...x, ...p } : x)) });

  const unico = <T extends { k: string }>(lista: T[], k: string, campo: keyof T, marcado: boolean): T[] =>
    lista.map((x) => (x.k === k ? { ...x, [campo]: marcado } : marcado ? { ...x, [campo]: false } : x));

  async function elegirDepartamento(d: DireccionForm, codigo: string) {
    const dep = departamentos.find((o) => String(o.codigo) === codigo);
    setD(d.k, { departamentoCodigo: codigo, departamento: dep?.nombre ?? "", distritoCodigo: "", distrito: "", ciudadCodigo: "", ciudad: "" });
    setCiudades((a) => ({ ...a, [d.k]: [] }));
    if (!codigo) return setDistritos((a) => ({ ...a, [d.k]: [] }));
    try { setDistritos((a) => ({ ...a, [d.k]: [] })); const r = await pedir(`/api/clientes?catalogo=distritos&departamento=${encodeURIComponent(codigo)}`); setDistritos((a) => ({ ...a, [d.k]: r })); }
    catch (e) { onError(e instanceof Error ? e.message : "No fue posible cargar los distritos."); }
  }
  async function elegirDistrito(d: DireccionForm, codigo: string) {
    const dis = (distritos[d.k] ?? []).find((o) => String(o.codigo) === codigo);
    setD(d.k, { distritoCodigo: codigo, distrito: dis?.nombre ?? "", ciudadCodigo: "", ciudad: "" });
    if (!codigo) return setCiudades((a) => ({ ...a, [d.k]: [] }));
    try { const r = await pedir(`/api/clientes?catalogo=ciudades&departamento=${encodeURIComponent(d.departamentoCodigo)}&distrito=${encodeURIComponent(codigo)}`); setCiudades((a) => ({ ...a, [d.k]: r })); }
    catch (e) { onError(e instanceof Error ? e.message : "No fue posible cargar las ciudades."); }
  }

  if (tab === "contactos") {
    return (
      <section>
        <Cabecera titulo="Contactos" descripcion="Responsables de pedidos, facturación, cobranzas y comunicaciones." agregar="Agregar contacto" onAgregar={() => onChange({ ...valor, contactos: [...valor.contactos, crearContacto()] })} />
        {valor.contactos.length === 0 ? <p className={styles.emptyHint}>Este cliente no tiene contactos registrados.</p> : null}
        {valor.contactos.map((c, i) => (
          <Fila key={c.k} titulo={`Contacto ${i + 1}`} existente={!!c.id}
            onQuitar={() => onChange({ ...valor, contactos: valor.contactos.filter((x) => x.k !== c.k), contactosEliminar: c.id ? [...valor.contactosEliminar, c.id] : valor.contactosEliminar })}>
            <div className={styles.gridFour}>
              <Campo label="Nombre *"><Texto maxLength={100} value={c.nombre} onChange={(v) => setC(c.k, { nombre: v })} /></Campo>
              <Campo label="Apellido"><Texto maxLength={100} value={c.apellido} onChange={(v) => setC(c.k, { apellido: v })} /></Campo>
              <Campo label="Cargo"><Texto maxLength={100} value={c.cargo} onChange={(v) => setC(c.k, { cargo: v })} /></Campo>
              <Campo label="Departamento"><Texto maxLength={100} value={c.departamento} onChange={(v) => setC(c.k, { departamento: v })} /></Campo>
              <Campo label="Teléfono"><Texto maxLength={30} value={c.telefono} onChange={(v) => setC(c.k, { telefono: v })} /></Campo>
              <Campo label="Celular"><Texto maxLength={30} value={c.celular} onChange={(v) => setC(c.k, { celular: v })} /></Campo>
              <Campo label="E-mail" className={styles.spanTwo}><Texto type="email" maxLength={150} value={c.email} onChange={(v) => setC(c.k, { email: v })} /></Campo>
            </div>
            <div className={styles.checkRow}>
              <Marca etiqueta="Contacto principal" marcado={c.esPrincipal} cambiar={(m) => onChange({ ...valor, contactos: unico(valor.contactos, c.k, "esPrincipal", m) })} />
              <Marca etiqueta="Recibe pedidos" marcado={c.recibePedidos} cambiar={(m) => setC(c.k, { recibePedidos: m })} />
              <Marca etiqueta="Recibe facturación" marcado={c.recibeFacturacion} cambiar={(m) => setC(c.k, { recibeFacturacion: m })} />
              <Marca etiqueta="Recibe cobranzas" marcado={c.recibeCobranzas} cambiar={(m) => setC(c.k, { recibeCobranzas: m })} />
              <Marca etiqueta="Recibe documentos electrónicos" marcado={c.recibeDocumentosElectronicos} cambiar={(m) => setC(c.k, { recibeDocumentosElectronicos: m })} />
              <Marca etiqueta="Recibe notificaciones" marcado={c.recibeNotificaciones} cambiar={(m) => setC(c.k, { recibeNotificaciones: m })} />
            </div>
          </Fila>
        ))}
      </section>
    );
  }

  if (tab === "direcciones") {
    return (
      <section>
        <Cabecera titulo="Direcciones" descripcion="Ubicaciones fiscal, comercial, de entrega, sucursal u otra." agregar="Agregar dirección" onAgregar={() => onChange({ ...valor, direcciones: [...valor.direcciones, crearDireccion()] })} />
        {valor.direcciones.length === 0 ? <p className={styles.emptyHint}>Este cliente no tiene direcciones registradas.</p> : null}
        {valor.direcciones.map((d, i) => (
          <Fila key={d.k} titulo={`Dirección ${i + 1}`} existente={!!d.id}
            onQuitar={() => onChange({ ...valor, direcciones: valor.direcciones.filter((x) => x.k !== d.k), direccionesEliminar: d.id ? [...valor.direccionesEliminar, d.id] : valor.direccionesEliminar })}>
            <div className={styles.gridFour}>
              <Campo label="Tipo *">
                <Lista value={d.tipo} onChange={(v) => onChange({ ...valor, direcciones: valor.direcciones.map((x) => (x.k === d.k ? { ...x, tipo: v, esFiscal: v === "FISCAL" ? true : x.esFiscal } : v === "FISCAL" ? { ...x, esFiscal: false } : x)) })}>
                  <option value="FISCAL">Fiscal</option><option value="COMERCIAL">Comercial</option><option value="ENTREGA">Entrega</option><option value="SUCURSAL">Sucursal</option><option value="OTRA">Otra</option>
                </Lista>
              </Campo>
              <Campo label="Etiqueta"><Texto maxLength={100} value={d.etiqueta} onChange={(v) => setD(d.k, { etiqueta: v })} /></Campo>
              <Campo label="Dirección *"><Texto maxLength={300} value={d.direccion} onChange={(v) => setD(d.k, { direccion: v })} /></Campo>
              <Campo label="Nro. de casa"><Texto maxLength={20} value={d.numeroCasa} onChange={(v) => setD(d.k, { numeroCasa: v })} /></Campo>
              <Campo label="País *">
                <Lista value={d.paisCodigo} onChange={(v) => {
                  setD(d.k, { paisCodigo: v, paisNombre: paises.find((p) => p.codigo === v)?.nombre ?? "", departamentoCodigo: "", departamento: "", distritoCodigo: "", distrito: "", ciudadCodigo: "", ciudad: "" });
                  setDistritos((a) => ({ ...a, [d.k]: [] })); setCiudades((a) => ({ ...a, [d.k]: [] }));
                }}>
                  {!paises.some((p) => p.codigo === d.paisCodigo) ? <option value={d.paisCodigo}>{d.paisNombre || d.paisCodigo}</option> : null}
                  {paises.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                </Lista>
              </Campo>
              <Campo label="Complemento"><Texto maxLength={200} value={d.complemento} onChange={(v) => setD(d.k, { complemento: v })} /></Campo>
              <Campo label="Código postal"><Texto maxLength={15} value={d.codigoPostal} onChange={(v) => setD(d.k, { codigoPostal: v })} /></Campo>
            </div>
            {d.paisCodigo === "PRY" ? (
              <div className={styles.gridThree}>
                <Campo label="Departamento"><Lista value={d.departamentoCodigo} onChange={(v) => void elegirDepartamento(d, v)}>{optGeo(departamentos, "Seleccione un departamento")}</Lista></Campo>
                <Campo label="Distrito"><Lista disabled={!d.departamentoCodigo} value={d.distritoCodigo} onChange={(v) => void elegirDistrito(d, v)}>{optGeo(distritos[d.k] ?? [], "Seleccione un distrito")}</Lista></Campo>
                <Campo label="Ciudad"><Lista disabled={!d.distritoCodigo} value={d.ciudadCodigo} onChange={(v) => setD(d.k, { ciudadCodigo: v, ciudad: (ciudades[d.k] ?? []).find((o) => String(o.codigo) === v)?.nombre ?? "" })}>{optGeo(ciudades[d.k] ?? [], "Seleccione una ciudad")}</Lista></Campo>
              </div>
            ) : null}
            <div className={styles.gridThree}>
              <Campo label="Contacto de recepción"><Texto maxLength={200} value={d.contactoNombre} onChange={(v) => setD(d.k, { contactoNombre: v })} /></Campo>
              <Campo label="Teléfono de recepción"><Texto maxLength={30} value={d.contactoTelefono} onChange={(v) => setD(d.k, { contactoTelefono: v })} /></Campo>
              <Campo label="Horario de recepción"><Texto maxLength={200} value={d.horarioRecepcion} onChange={(v) => setD(d.k, { horarioRecepcion: v })} /></Campo>
              <Campo label="Latitud"><Texto inputMode="decimal" value={d.latitud} onChange={(v) => setD(d.k, { latitud: v })} /></Campo>
              <Campo label="Longitud"><Texto inputMode="decimal" value={d.longitud} onChange={(v) => setD(d.k, { longitud: v })} /></Campo>
            </div>
            <div className={styles.checkRow}>
              <Marca etiqueta="Dirección fiscal" marcado={d.esFiscal} cambiar={(m) => onChange({ ...valor, direcciones: unico(valor.direcciones, d.k, "esFiscal", m) })} />
              <Marca etiqueta="Dirección de entrega predeterminada" marcado={d.esEntregaDefault} cambiar={(m) => onChange({ ...valor, direcciones: unico(valor.direcciones, d.k, "esEntregaDefault", m) })} />
            </div>
            <Campo label="Observación de la dirección"><textarea className={styles.textarea} maxLength={500} value={d.observacion} onChange={(e) => setD(d.k, { observacion: e.target.value })} /></Campo>
          </Fila>
        ))}
      </section>
    );
  }

  return (
    <section>
      <Cabecera titulo="Documentos comerciales" descripcion="Enlace seguro a documentos comerciales vigentes." agregar="Agregar documento" onAgregar={() => onChange({ ...valor, documentos: [...valor.documentos, crearDocumento()] })} />
      {valor.documentos.length === 0 ? <p className={styles.emptyHint}>Este cliente no tiene documentos registrados.</p> : null}
      {valor.documentos.map((o, i) => (
        <Fila key={o.k} titulo={`Documento ${i + 1}`} existente={!!o.id}
          onQuitar={() => onChange({ ...valor, documentos: valor.documentos.filter((x) => x.k !== o.k), documentosEliminar: o.id ? [...valor.documentosEliminar, o.id] : valor.documentosEliminar })}>
          <div className={styles.gridFour}>
            <Campo label="Tipo">
              <Lista value={o.tipo} onChange={(v) => setO(o.k, { tipo: v })}>
                <option value="RUC">Constancia de RUC</option><option value="CONTRATO">Contrato</option><option value="CREDITO">Documento de crédito</option><option value="EXONERACION">Exoneración</option><option value="OTRO">Otro</option>
              </Lista>
            </Campo>
            <Campo label="Nombre del archivo *"><Texto maxLength={255} value={o.nombreArchivo} onChange={(v) => setO(o.k, { nombreArchivo: v })} /></Campo>
            <Campo label="URL segura *"><Texto value={o.urlArchivo} onChange={(v) => setO(o.k, { urlArchivo: v })} /></Campo>
            <Campo label="Fecha de emisión"><Texto placeholder="dd/mm/yyyy" value={o.fechaEmision} onChange={(v) => setO(o.k, { fechaEmision: v })} /></Campo>
            <Campo label="Fecha de vencimiento"><Texto placeholder="dd/mm/yyyy" value={o.fechaVencimiento} onChange={(v) => setO(o.k, { fechaVencimiento: v })} /></Campo>
            <Campo label="Observación" className={styles.spanTwo}><Texto maxLength={500} value={o.observacion} onChange={(v) => setO(o.k, { observacion: v })} /></Campo>
          </div>
        </Fila>
      ))}
    </section>
  );
}
