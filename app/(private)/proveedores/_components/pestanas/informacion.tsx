"use client";

import { tiposDocumentoDe } from "@/lib/proveedores/identificacion";

import { Area, Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

export function PestanaInformacion({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;
  const tipos = tiposDocumentoDe(form.paisCodigo);
  const opcionesTipo: Array<[string, string]> = tipos.map((t) => [t.valor, t.etiqueta]);

  if (!opcionesTipo.some(([v]) => v === form.tipoDocumento)) opcionesTipo.push([form.tipoDocumento, form.tipoDocumento]);

  const esRuc = form.tipoDocumento === "RUC";

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Identificación y contacto</h3>
      </div>

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Tipo de persona *"
          campo="tipoPersona"
          errores={errores}
          valor={form.tipoPersona}
          alCambiar={(v) => ctx.set("tipoPersona", v as "JURIDICA" | "FISICA")}
          opciones={[
            ["JURIDICA", "Persona jurídica"],
            ["FISICA", "Persona física"],
          ]}
        />
        <Selector
          etiqueta="País *"
          campo="paisCodigo"
          errores={errores}
          valor={form.paisCodigo}
          alCambiar={(v) => ctx.cambiarIdentificacion({ paisCodigo: v })}
          opciones={catalogos.paises.map((p): [string, string] => [p.codigo, p.nombre])}
        />
        <Selector
          etiqueta="Tipo de documento *"
          campo="tipoDocumento"
          errores={errores}
          valor={form.tipoDocumento}
          alCambiar={(v) => ctx.cambiarIdentificacion({ tipoDocumento: v })}
          opciones={opcionesTipo}
        />
        <Texto
          etiqueta={esRuc ? "RUC (sin DV) *" : "Número de documento *"}
          campo="numeroDocumento"
          errores={errores}
          valor={form.numeroDocumento}
          alCambiar={(v) => ctx.cambiarIdentificacion({ numeroDocumento: v.replace(/\s/g, "") })}
          maxLength={50}
          modo={esRuc ? "numeric" : "text"}
          ayuda={esRuc ? "De 3 a 8 dígitos; el DV se calcula automáticamente." : undefined}
        />
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="DV" campo="dv" errores={errores} valor={form.dv} alCambiar={() => undefined} readOnly disabled={!esRuc} maxLength={1} />
        <Texto etiqueta="Nombre o razón social *" campo="razonSocial" errores={errores} valor={form.razonSocial} alCambiar={(v) => ctx.set("razonSocial", v)} maxLength={255} />
        <Texto etiqueta="Nombre de fantasía" campo="nombreFantasia" errores={errores} valor={form.nombreFantasia} alCambiar={(v) => ctx.set("nombreFantasia", v)} maxLength={255} />
        <Selector
          etiqueta="Grupo de proveedor"
          campo="grupoProveedorId"
          errores={errores}
          valor={form.grupoProveedorId}
          alCambiar={(v) => ctx.set("grupoProveedorId", v)}
          opciones={[["", "Sin grupo"], ...catalogos.grupos.map((g): [string, string] => [g.id, g.nombre])]}
        />
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="Teléfono" campo="telefono" errores={errores} valor={form.telefono} alCambiar={(v) => ctx.set("telefono", v)} maxLength={50} />
        <Texto etiqueta="Correo electrónico" campo="email" errores={errores} valor={form.email} alCambiar={(v) => ctx.set("email", v)} maxLength={150} tipo="email" />
        <Texto etiqueta="Sitio web" campo="sitioWeb" errores={errores} valor={form.sitioWeb} alCambiar={(v) => ctx.set("sitioWeb", v)} maxLength={300} placeholder="https://" />
      </div>

      <div className={styles.checkGrid}>
        <Casilla etiqueta="Proveedor activo" campo="activo" valor={form.activo} alCambiar={(v) => ctx.set("activo", v)} />
      </div>

      <Area etiqueta="Observación general" campo="observacion" errores={errores} valor={form.observacion} alCambiar={(v) => ctx.set("observacion", v)} maxLength={2000} />
    </>
  );
}
