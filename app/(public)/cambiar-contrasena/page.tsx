import { redirect } from "next/navigation";

import { CambiarContrasenaForm } from "@/components/auth/cambiar-contrasena-form";
import { getAccessContext } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

import styles from "../login/login.module.css";

// Cambio obligatorio de la contraseña provisional. Requiere sesión; si la cuenta no tiene una contraseña provisional pendiente no hay nada que hacer aquí.
export default async function CambiarContrasenaPage() {
  const session = await getCurrentSession();

  if (!session) redirect("/login");
  if (session.demo !== true && !(await getAccessContext(session.user)).mustChangePassword) redirect("/");

  return (
    <main className={styles.screen}>
      <section className={styles.loginArea}>
        <div className={styles.loginCard}>
          <span className={styles.eyebrow}>ACCESO SEGURO</span>
          <h1>Cambie su contraseña</h1>
          <p className={styles.intro}>Su contraseña actual es provisional: la definió un administrador. Elija una nueva para continuar; hasta entonces no puede usar el sistema.</p>
          <CambiarContrasenaForm />
        </div>
      </section>
    </main>
  );
}
