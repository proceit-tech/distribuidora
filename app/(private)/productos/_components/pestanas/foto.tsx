"use client";

import { useState } from "react";

import { TAMANO_MAXIMO_BYTES, tamanoLegible } from "@/lib/almacenamiento/archivos-reglas";
import { ErrorValidacion } from "@/lib/productos/errores";
import { ACCEPT_FOTO, EXTENSIONES_FOTO, errorDeFoto } from "@/lib/productos/imagen";
import { idCampo } from "@/lib/productos/pestanas";

import { Campo } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";

/**
 * Foto principal del producto (archivo privado, NEX-041). En el alta la foto elegida se carga al guardar el producto; en la edición cada
 * acción se aplica de inmediato en el servidor. El enlace de imagen anterior (`imagenUrl`) se conserva y sigue siendo editable mientras exista.
 */
export function FotoProducto({ ctx }: { ctx: ContextoFormulario }) {
  const d = ctx.detalle;
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorValidacion | null>(null);
  const errores = error?.campo ? { [error.campo]: error.message } : ctx.errores;
  const ayudaFormatos = `${EXTENSIONES_FOTO.join(", ")} · máx. ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB`;

  async function llamar(metodo: "POST" | "DELETE", cuerpo?: FormData) {
    if (!d) return;
    if (ctx.sucio && !window.confirm("Hay cambios sin guardar en el formulario: la acción recarga la ficha y se perderían. ¿Desea continuar?")) return;

    setOcupado(true);
    setError(null);

    try {
      const r = await fetch(`/api/productos/${d.id}/imagen`, { method: metodo, body: cuerpo });
      const j = (await r.json().catch(() => ({}))) as { error?: string };

      if (!r.ok) {
        setError(new ErrorValidacion(j.error ?? "No fue posible completar la acción con la foto."));

        return;
      }

      ctx.recargar();
    } catch {
      setError(new ErrorValidacion("Error de conexión."));
    } finally {
      setOcupado(false);
    }
  }

  function elegir(archivo: File | null) {
    setError(null);

    if (!archivo) {
      ctx.setFotoPendiente(null);

      return;
    }

    const e = errorDeFoto(archivo.name, archivo.size, TAMANO_MAXIMO_BYTES);

    if (e) {
      setError(new ErrorValidacion(e, "imagenPrivada"));

      return;
    }

    if (ctx.modo === "crear") {
      ctx.setFotoPendiente(archivo);

      return;
    }

    const datos = new FormData();

    datos.set("archivo", archivo);
    void llamar("POST", datos);
  }

  const privada = d?.imagenPrivada ?? null;
  const puedeCargar = ctx.modo === "crear" || d?.permisosDocumentos.cargar === true;
  const puedeQuitar = d?.permisosDocumentos.gestionar === true;

  return (
    <>
      <div className={styles.fotoBloque}>
        <div className={styles.fotoVista}>
          {privada && d ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/productos/${d.id}/imagen?v=${encodeURIComponent(privada.actualizadaEn)}`} alt={`Foto de ${d.descripcion}`} />
          ) : (
            <span>{ctx.fotoPendiente ? ctx.fotoPendiente.name : "Sin foto"}</span>
          )}
        </div>

        <div className={styles.fotoControles}>
          {error ? (
            <div className={styles.error} role="alert">
              {error.message}
            </div>
          ) : null}

          {puedeCargar ? (
            <Campo etiqueta={privada || ctx.fotoPendiente ? "Reemplazar foto" : "Foto del producto"} campo="imagenPrivada" errores={errores} ayuda={ctx.fotoPendiente ? `${ctx.fotoPendiente.name} · ${tamanoLegible(ctx.fotoPendiente.size)} (se carga al guardar)` : ayudaFormatos}>
              <input id={idCampo("imagenPrivada")} type="file" accept={ACCEPT_FOTO} disabled={ocupado} onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
            </Campo>
          ) : (
            <p className={styles.textoSecundario}>Para cargar la foto se necesita el permiso de edición de productos.</p>
          )}

          {privada ? (
            <p className={styles.textoSecundario}>
              {privada.nombre} · {tamanoLegible(privada.tamanoBytes)} · {privada.actualizadaEn}
            </p>
          ) : null}

          {ctx.modo === "crear" && ctx.fotoPendiente ? (
            <button type="button" className={styles.cancelButton} onClick={() => ctx.setFotoPendiente(null)}>
              Quitar foto elegida
            </button>
          ) : null}

          {privada && puedeQuitar ? (
            <button
              type="button"
              className={styles.cancelButton}
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("¿Quitar la foto del producto? El archivo se conserva en el almacenamiento y queda registrado en la auditoría.")) void llamar("DELETE");
              }}
            >
              Quitar foto
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
