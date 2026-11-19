"use client";

import {
  type ReactNode,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import Sidebar from "@/components/layout/sidebar/sidebar";
import type { ShellContext } from "@/types/shell";

import styles from "./app-shell.module.css";

const STORAGE_KEY = "distribunex.shell.sidebar-collapsed";

// PRE-VM-R02-C: la preferencia «menú colapsado» vive en localStorage (sistema externo) y se lee
// con useSyncExternalStore. En el servidor y durante la hidratación se usa la instantánea del
// servidor (false = expandido), igual que el HTML inicial; después React vuelve a renderizar con
// la preferencia guardada sin desajuste de hidratación. Sustituye al efecto con setState + «hydrated».
const oyentesPreferencia = new Set<() => void>();

function suscribirPreferencia(oyente: () => void) {
  oyentesPreferencia.add(oyente);

  return () => {
    oyentesPreferencia.delete(oyente);
  };
}

function leerPreferencia() {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function leerPreferenciaServidor() {
  return false;
}

type AppShellProps = {
  context: ShellContext;
  children: ReactNode;
};

export default function AppShell({
  context,
  children,
}: AppShellProps) {
  const collapsed = useSyncExternalStore(
    suscribirPreferencia,
    leerPreferencia,
    leerPreferenciaServidor,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleCollapsedChange = useCallback((value: boolean) => {
    window.localStorage.setItem(
      STORAGE_KEY,
      String(value),
    );

    oyentesPreferencia.forEach((oyente) => oyente());
  }, []);

  return (
    <div
      className={[
        styles.shell,
        collapsed
          ? styles.shellCollapsed
          : "",
      ].join(" ")}
    >
      <Sidebar
        user={context.user}
        company={context.company}
        navigation={context.navigation}
        inicioHref={context.inicioHref}
        puedeDashboard={context.puedeDashboard}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapsedChange={handleCollapsedChange}
        onMobileOpenChange={setMobileOpen}
      />

      <main className={styles.workspace}>
        {children}
      </main>
    </div>
  );
}
