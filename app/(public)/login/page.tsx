import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession } from "@/lib/auth/session";
import styles from "./login.module.css";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className={styles.screen}>
      <aside className={styles.brandPanel} aria-label="Nexit">
        <div className={styles.brandMark} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className={styles.brandName}>
          <strong>
            Nex<span>it</span>
          </strong>
          <small>UNA SOLUCIÓN PROCEIT</small>
        </div>
        <div className={styles.brandMessage}>
          <span>GESTIÓN INTEGRAL</span>
          <h1>Todo el control de su distribuidora, en un solo lugar.</h1>
          <p>
            Clientes, proveedores, productos, listas de precios, inventario, movimientos y reportes de stock
            en un único sistema.
          </p>
        </div>
        <footer>© {new Date().getFullYear()} PROCEIT · Nexit</footer>
      </aside>
      <section className={styles.loginArea}>
        <div className={styles.loginCard}>
          <div className={styles.mobileBrand}>
            <div className={styles.mobileMark} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <strong>
              Nex<span>it</span>
            </strong>
          </div>
          <span className={styles.eyebrow}>ACCESO SEGURO</span>
          <h1>Bienvenido de nuevo</h1>
          <p className={styles.intro}>Ingrese sus datos para acceder al sistema.</p>
          <LoginForm />
          <p className={styles.helpText}>¿Necesita ayuda? Contacte al administrador de su empresa.</p>
        </div>
      </section>
    </main>
  );
}
