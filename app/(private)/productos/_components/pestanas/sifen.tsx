"use client";

import type { ProductoCodigo } from "@/types/productos";

import { Area, Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

const TIPOS_CODIGO: Array<[ProductoCodigo["tipo"], string]> = [
  ["GTIN", "GTIN producto"],
  ["GTIN_EMPAQUE", "GTIN empaque"],
  ["EAN", "EAN"],
  ["UPC", "UPC"],
  ["CODIGO_ALTERNO", "Código alterno"],
  ["SKU_PROVEEDOR", "SKU del proveedor"],
  ["OTRO", "Otro"],
];

export function PestanaSifen({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>SIFEN y códigos</h3>
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="Código SIFEN" campo="codigoSifen" errores={errores} valor={form.codigoSifen} alCambiar={(v) => ctx.set("codigoSifen", v)} maxLength={20} />
        <Texto etiqueta="Descripción para factura" campo="descripcionFacturaMirror" errores={errores} valor={form.descripcionFactura} alCambiar={() => undefined} readOnly ayuda="Se edita en Información." />
        <Texto etiqueta="NCM" campo="ncm" errores={errores} valor={form.ncm} alCambiar={(v) => ctx.set("ncm", v)} maxLength={8} modo="numeric" ayuda="6 a 8 dígitos." />
        <Texto etiqueta="Partida arancelaria" campo="partidaArancelaria" errores={errores} valor={form.partidaArancelaria} alCambiar={(v) => ctx.set("partidaArancelaria", v)} maxLength={4} modo="numeric" ayuda="4 dígitos." />
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="DNCP general" campo="dncpGeneral" errores={errores} valor={form.dncpGeneral} alCambiar={(v) => ctx.set("dncpGeneral", v)} maxLength={8} />
        <Texto etiqueta="DNCP específico" campo="dncpEspecifico" errores={errores} valor={form.dncpEspecifico} alCambiar={(v) => ctx.set("dncpEspecifico", v)} maxLength={4} ayuda="3 o 4 caracteres." />
        <Selector
          etiqueta="País de origen"
          campo="paisOrigenCodigo"
          errores={errores}
          valor={form.paisOrigenCodigo}
          alCambiar={(v) => ctx.set("paisOrigenCodigo", v)}
          opciones={[["", "Sin país"], ...catalogos.paises.map((p): [string, string] => [p.codigo, `${p.codigo} · ${p.nombre}`])]}
        />
        <Texto etiqueta="Código de barras principal" campo="codigoBarras" errores={errores} valor={form.codigoBarras} alCambiar={(v) => ctx.set("codigoBarras", v)} maxLength={80} />
      </div>

      <Area etiqueta="Información adicional en factura" campo="informacionFactura" errores={errores} valor={form.informacionFactura} alCambiar={(v) => ctx.set("informacionFactura", v)} maxLength={500} />

      <TituloColeccion titulo="Códigos de barras y GTIN" boton="Agregar código" alAgregar={() => ctx.agregar("codigos")} />

      {form.codigos.length === 0 ? <div className={styles.empty}>Sin códigos adicionales.</div> : null}

      <div className={styles.repeaterList}>
        {form.codigos.map((c, i) => {
          const p = `codigos.${i}`;

          return (
            <TarjetaFila key={c.id} ctx={ctx} coleccion="codigos" id={c.id} titulo={`Código ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector etiqueta="Tipo *" campo={`${p}.tipo`} errores={errores} valor={c.tipo} alCambiar={(v) => ctx.actualizar("codigos", c.id, { tipo: v })} opciones={TIPOS_CODIGO} />
                <Texto etiqueta="Código *" campo={`${p}.codigo`} errores={errores} valor={c.codigo} alCambiar={(v) => ctx.actualizar("codigos", c.id, { codigo: v })} maxLength={80} />
                <Texto etiqueta="Descripción" campo={`${p}.descripcion`} errores={errores} valor={c.descripcion} alCambiar={(v) => ctx.actualizar("codigos", c.id, { descripcion: v })} maxLength={120} />
                <div className={styles.checkGrid}>
                  <Casilla etiqueta="Principal" campo={`${p}.esPrincipal`} valor={c.esPrincipal} alCambiar={(v) => ctx.marcarPrincipal("codigos", c.id, v)} />
                </div>
              </div>
            </TarjetaFila>
          );
        })}
      </div>
    </>
  );
}
