"use client";

import type { ProveedorCuentaBancaria } from "@/types/proveedores";

import { Casilla, Selector, SinRegistros, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";
import { ResolucionCuenta } from "./resolucion-cuenta";

export function PestanaBancos({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Cuentas bancarias</h3>
        <button type="button" className={styles.addButton} onClick={() => ctx.agregar("cuentasBancarias")}>
          + Agregar cuenta
        </button>
      </div>

      {form.cuentasBancarias.length === 0 ? <SinRegistros texto="Aún no hay cuentas bancarias cargadas." /> : <p className={styles.nota} style={{ margin: "0 0 10px" }}>* Obligatorio en cada cuenta agregada.</p>}

      <div className={styles.repeaterList}>
        {form.cuentasBancarias.map((c, i) => {
          const p = `cuentasBancarias.${i}`;
          const guardada = ctx.detalle?.cuentasBancarias.find((x) => x.id === c.id);

          // Cuenta desactivada: se conserva con su historial, solo lectura (no es pagable).
          if (guardada?.activa === false) {
            return (
              <article key={c.id} className={styles.repeaterCard}>
                <header>
                  <strong>
                    Cuenta {i + 1} · {c.banco} · {c.numeroCuenta} ({c.monedaCodigo})
                  </strong>
                  <span className={[styles.etiquetaEstado, styles.etiquetaPeligro].join(" ")}>Desactivada{guardada.desactivadaEn ? ` el ${guardada.desactivadaEn}` : ""}</span>
                </header>
                <p className={styles.textoSecundario}>Titular: {c.titular}. La cuenta se conserva con su historial y auditoría, pero no puede usarse en pagos.</p>
              </article>
            );
          }

          const cambiar = (parche: Partial<ProveedorCuentaBancaria>) => ctx.actualizar("cuentasBancarias", c.id, parche);

          return (
            <article key={c.id} className={styles.repeaterCard}>
              <header>
                <strong>Cuenta {i + 1}</strong>
                <button
                  type="button"
                  onClick={() => {
                    if (guardada?.estadoAprobacion === "APROBADA" && !window.confirm("Esta cuenta está aprobada: no se elimina, se DESACTIVA (se conserva con su historial y deja de poder usarse en pagos). ¿Desea continuar?")) return;

                    ctx.quitar("cuentasBancarias", c.id);
                  }}
                >
                  {guardada?.estadoAprobacion === "APROBADA" ? "Desactivar" : "Eliminar"}
                </button>
              </header>

              <div className={styles.gridFour}>
                <Texto etiqueta="Banco *" campo={`${p}.banco`} errores={errores} valor={c.banco} alCambiar={(v) => cambiar({ banco: v })} maxLength={150} />
                <Texto etiqueta="Sucursal" campo={`${p}.sucursalBanco`} errores={errores} valor={c.sucursalBanco} alCambiar={(v) => cambiar({ sucursalBanco: v })} maxLength={150} />
                <Texto etiqueta="Titular *" campo={`${p}.titular`} errores={errores} valor={c.titular} alCambiar={(v) => cambiar({ titular: v })} maxLength={200} />
                <Texto etiqueta="Documento del titular" campo={`${p}.documentoTitular`} errores={errores} valor={c.documentoTitular} alCambiar={(v) => cambiar({ documentoTitular: v })} maxLength={100} />
              </div>

              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Tipo de cuenta *"
                  campo={`${p}.tipoCuenta`}
                  errores={errores}
                  valor={c.tipoCuenta}
                  alCambiar={(v) => cambiar({ tipoCuenta: v as ProveedorCuentaBancaria["tipoCuenta"] })}
                  opciones={[
                    ["CORRIENTE", "Cuenta corriente"],
                    ["AHORRO", "Cuenta de ahorro"],
                    ["CAJA_AHORRO", "Caja de ahorro"],
                    ["OTRA", "Otra"],
                  ]}
                />
                <Texto etiqueta="Número de cuenta *" campo={`${p}.numeroCuenta`} errores={errores} valor={c.numeroCuenta} alCambiar={(v) => cambiar({ numeroCuenta: v })} maxLength={100} />
                <Selector
                  etiqueta="Moneda *"
                  campo={`${p}.monedaCodigo`}
                  errores={errores}
                  valor={c.monedaCodigo}
                  alCambiar={(v) => cambiar({ monedaCodigo: v })}
                  opciones={catalogos.monedas.map((m): [string, string] => [m.codigo, `${m.codigo} · ${m.nombre}`])}
                />
                <Texto etiqueta="Alias de la cuenta" campo={`${p}.aliasCuenta`} errores={errores} valor={c.aliasCuenta} alCambiar={(v) => cambiar({ aliasCuenta: v })} maxLength={100} />
              </div>

              <div className={styles.gridFour}>
                <Texto etiqueta="SWIFT / BIC" campo={`${p}.codigoSwift`} errores={errores} valor={c.codigoSwift} alCambiar={(v) => cambiar({ codigoSwift: v.toUpperCase() })} maxLength={30} ayuda="Opcional: 8 u 11 caracteres." />
                <Texto etiqueta="IBAN" campo={`${p}.iban`} errores={errores} valor={c.iban} alCambiar={(v) => cambiar({ iban: v.toUpperCase() })} maxLength={50} ayuda="Opcional; se verifica el dígito de control." />
              </div>

              <div className={styles.checkGrid}>
                <Casilla etiqueta="Cuenta principal de esta moneda" campo={`${p}.esPrincipal`} valor={c.esPrincipal} alCambiar={(v) => ctx.marcarPrincipal("cuentasBancarias", c.id, v)} />
              </div>

              <ResolucionCuenta ctx={ctx} cuenta={c} />
            </article>
          );
        })}
      </div>
    </>
  );
}
