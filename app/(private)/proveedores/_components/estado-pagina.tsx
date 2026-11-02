import Link from "next/link";

import styles from "./proveedor-form.module.css";

/** Estado de página (cargando, error, no encontrado) con el mismo padrón visual que Clientes. */
export default function EstadoPagina({
  titulo,
  texto,
  volver = false,
}: {
  titulo: string;
  texto?: string;
  volver?: boolean;
}) {
  return (
    <main className={styles.estado}>
      <div className={styles.estadoCaja} role={volver ? undefined : "status"}>
        <strong>{titulo}</strong>
        {texto ? <span>{texto}</span> : null}
        {volver ? <Link href="/proveedores">← Volver a proveedores</Link> : null}
      </div>
    </main>
  );
}
