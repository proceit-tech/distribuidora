"use client";

import { AFECTACIONES_IVA, coherenciaIva, proporcionEfectiva } from "@/lib/productos/fiscal";
import type { ProductoCodigo } from "@/types/productos";

import { Area, Casilla, Dato, Selector, SubTitulo, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

const TIPOS_CODIGO: Array<[ProductoCodigo["tipo"], string]> = [
  ["GTIN", "GTIN del producto (E706)"],
  ["GTIN_EMPAQUE", "GTIN del empaque (E707)"],
  ["EAN", "EAN (GTIN)"],
  ["UPC", "UPC (GTIN)"],
  ["CODIGO_ALTERNO", "Código alterno"],
  ["SKU_PROVEEDOR", "SKU del proveedor"],
  ["OTRO", "Otro identificador (ERP externo)"],
];

const ES_GTIN = ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC"];

export function PestanaSifen({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;
  const impuesto = catalogos.impuestos.find((i) => i.id === form.impuestoId);
  const afectacion = form.afectacionIva ? Number(form.afectacionIva) : null;
  const proporcion = proporcionEfectiva(afectacion, form.proporcionGravadaIva.trim() || null);
  const incoherencia = afectacion !== null ? coherenciaIva(afectacion, impuesto?.porcentaje ?? null, form.proporcionGravadaIva.trim() || null) : null;
  const unidad = catalogos.unidades.find((u) => u.id === form.unidadMedidaId);

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>SIFEN y códigos</h3>
      </div>

      <SubTitulo>Identificación fiscal del producto</SubTitulo>

      <div className={styles.gridFour}>
        <Texto etiqueta="Código SIFEN del producto" campo="codigoSifen" errores={errores} valor={form.codigoSifen} alCambiar={(v) => ctx.set("codigoSifen", v)} maxLength={20} ayuda="Distinto del código interno Nexit." />
        <Dato etiqueta="Descripción para factura" valor={form.descripcionFactura} ayuda="Se edita en Información." />
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

      <SubTitulo>Clasificación y afectación IVA</SubTitulo>

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Impuesto (tasa)"
          campo="impuestoId"
          errores={errores}
          valor={form.impuestoId}
          alCambiar={(v) => ctx.set("impuestoId", v)}
          opciones={[["", "Sin impuesto"], ...catalogos.impuestos.map((i): [string, string] => [i.id, `${i.nombre} (${Number(i.porcentaje)} %)`])]}
        />
        <Selector
          etiqueta="Afectación IVA"
          campo="afectacionIva"
          errores={errores}
          valor={form.afectacionIva}
          alCambiar={(v) => {
            ctx.set("afectacionIva", v);
            // La proporción informada solo existe con «Gravado parcial»; en los demás casos es fija y se deriva.
            if (v !== "4") ctx.set("proporcionGravadaIva", "");
          }}
          opciones={[["", ctx.modo === "editar" ? "Sin clasificar" : "Seleccione la afectación"], ...AFECTACIONES_IVA.map((a): [string, string] => [String(a.codigo), `${a.codigo} · ${a.texto}`])]}
        />
        {afectacion === 4 ? (
          <Texto etiqueta="Proporción gravada (%) *" campo="proporcionGravadaIva" errores={errores} valor={form.proporcionGravadaIva} alCambiar={(v) => ctx.set("proporcionGravadaIva", v)} modo="decimal" maxLength={8} ayuda="Mayor que 0 y menor que 100." />
        ) : (
          <Dato etiqueta="Proporción gravada (%)" valor={proporcion ?? ""} ayuda={afectacion === null ? "Sin clasificar." : "Fija según la afectación."} />
        )}
        <Dato etiqueta="Tasa del IVA (%)" valor={impuesto ? String(Number(impuesto.porcentaje)) : ""} ayuda="Derivada del impuesto." />
      </div>

      {afectacion === null ? (
        <p className={styles.nota} role="status">
          Sin clasificación fiscal estándar: no se asume Exento ni Exonerado. Las bases y la liquidación (E735–E737) se calculan en la operación, no en el producto.
        </p>
      ) : null}
      {incoherencia && !errores[incoherencia.campo] ? (
        <p className={styles.nota} role="status">
          {incoherencia.mensaje}
        </p>
      ) : null}

      <SubTitulo>Unidad de medida SIFEN</SubTitulo>

      <div className={styles.gridFour}>
        <Dato etiqueta="Unidad base (comercial)" valor={unidad ? `${unidad.codigo} · ${unidad.nombre}` : ""} ayuda="Se edita en Información." />
        <Dato etiqueta="Código SIFEN (E709)" valor={unidad?.sifenCodigo ? String(unidad.sifenCodigo) : ""} />
        <Dato etiqueta="Representación (E710)" valor={unidad?.sifenRepresentacion ?? ""} />
      </div>

      {unidad && !unidad.sifenCodigo ? (
        <p className={styles.nota} role="status">
          {ctx.modo === "editar"
            ? "Sin equivalencia SIFEN configurada para esta unidad: el producto no podrá facturarse hasta que se vincule. Al editar no se bloquea el guardado."
            : "Sin equivalencia SIFEN configurada para esta unidad: no se puede crear un producto vendible con ella. Elija una unidad con código SIFEN."}
        </p>
      ) : null}

      <SubTitulo>NCM, partida arancelaria y DNCP</SubTitulo>

      <div className={styles.gridFour}>
        <Texto etiqueta="NCM" campo="ncm" errores={errores} valor={form.ncm} alCambiar={(v) => ctx.set("ncm", v)} maxLength={8} modo="numeric" ayuda="6 a 8 dígitos." />
        <Texto etiqueta="Partida arancelaria" campo="partidaArancelaria" errores={errores} valor={form.partidaArancelaria} alCambiar={(v) => ctx.set("partidaArancelaria", v)} maxLength={4} modo="numeric" ayuda="4 dígitos." />
        <Texto etiqueta="DNCP general" campo="dncpGeneral" errores={errores} valor={form.dncpGeneral} alCambiar={(v) => ctx.set("dncpGeneral", v)} maxLength={8} />
        <Texto etiqueta="DNCP específico" campo="dncpEspecifico" errores={errores} valor={form.dncpEspecifico} alCambiar={(v) => ctx.set("dncpEspecifico", v)} maxLength={4} ayuda="3 o 4 caracteres." />
      </div>

      <TituloColeccion titulo="GTIN y códigos adicionales" boton="Agregar código" alAgregar={() => ctx.agregar("codigos")} />

      {form.codigos.length === 0 ? <div className={styles.empty}>Sin códigos adicionales.</div> : null}

      <div className={styles.repeaterList}>
        {form.codigos.map((c, i) => {
          const p = `codigos.${i}`;

          return (
            <TarjetaFila key={c.id} ctx={ctx} coleccion="codigos" id={c.id} titulo={`Código ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector etiqueta="Tipo *" campo={`${p}.tipo`} errores={errores} valor={c.tipo} alCambiar={(v) => ctx.actualizar("codigos", c.id, { tipo: v })} opciones={TIPOS_CODIGO} />
                <Texto etiqueta="Código *" campo={`${p}.codigo`} errores={errores} valor={c.codigo} alCambiar={(v) => ctx.actualizar("codigos", c.id, { codigo: v })} maxLength={80} ayuda={ES_GTIN.includes(c.tipo) ? "GTIN: 8, 12, 13 o 14 dígitos." : undefined} />
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
