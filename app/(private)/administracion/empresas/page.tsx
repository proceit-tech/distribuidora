import { db } from "@/lib/db";

import styles from "./page.module.css";

type EmpresaRow = {
  codigo: string;
  razon_social: string;
  ruc: string | null;
  dv: string | null;
  estado: string;
  usuarios: string;
  creado_at: Date;
};

export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  // El layout de /administracion ya exigió administrador global; las empresas DEMO no se listan.
  const result = await db.query<EmpresaRow>(
    `SELECT e.codigo, e.razon_social, e.ruc, e.dv, e.estado, e.creado_at,
            (SELECT count(*) FROM usuarios u WHERE u.empresa_id = e.id) AS usuarios
       FROM empresas e
      WHERE NOT e.es_demo
      ORDER BY e.creado_at`,
  );

  return (
    <div className={styles.page}>
      <h1>Empresas de la plataforma</h1>
      <p>Administración global: empresas registradas en Nexit.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Código</th>
            <th>Razón social</th>
            <th>RUC</th>
            <th>Estado</th>
            <th>Usuarios</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((e) => (
            <tr key={e.codigo}>
              <td>{e.codigo}</td>
              <td>{e.razon_social}</td>
              <td>{e.ruc ? `${e.ruc}${e.dv ? "-" + e.dv : ""}` : "—"}</td>
              <td>{e.estado}</td>
              <td>{e.usuarios}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
