import ui from "@/components/ui/lista-padrao/lista.module.css";

import { EmpresasLista, type EmpresaFila } from "./_components/empresas-lista";

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
  const { db } = await import("@/lib/db");
  const result = await db.query<EmpresaRow>(
    `SELECT e.codigo, e.razon_social, e.ruc, e.dv, e.estado, e.creado_at,
            (SELECT count(*) FROM usuarios u WHERE u.empresa_id = e.id) AS usuarios
       FROM empresas e
      WHERE NOT e.es_demo
      ORDER BY e.creado_at`,
  );

  const empresas: EmpresaFila[] = result.rows.map((e) => ({
    codigo: e.codigo,
    razonSocial: e.razon_social,
    ruc: e.ruc ? `${e.ruc}${e.dv !== null ? "-" + e.dv : ""}` : "",
    estado: e.estado,
    usuarios: Number(e.usuarios),
  }));

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Plataforma</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Empresas</span>
          </nav>

          <h1>Empresas de la plataforma</h1>
        </div>
      </header>

      <EmpresasLista empresas={empresas} />
    </section>
  );
}
