// F-DASH-04: destino explícito para un usuario de empresa sin ninguna página operativa autorizada. No redirige (sin bucles) ni concede permisos.
export default function SinAccesoPage() {
  return (
    <section style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Sin módulos autorizados</h1>
      <p style={{ margin: 0, color: "#4f6a82", lineHeight: 1.5 }}>
        Su usuario no tiene permiso para abrir ninguna página del sistema. Solicite al administrador de su empresa que le asigne un perfil con acceso.
      </p>
    </section>
  );
}
