"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import Sidebar from "@/components/layout/sidebar/sidebar";
import type { ShellContext } from "@/types/shell";

import styles from "./app-shell.module.css";

const STORAGE_KEY = "distribunex.shell.sidebar-collapsed";

type AppShellProps = {
  context: ShellContext;
  children: ReactNode;
};

export default function AppShell({
  context,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    setCollapsed(saved === "true");
    setHydrated(true);
  }, []);

  const handleCollapsedChange = useCallback((value: boolean) => {
    setCollapsed(value);

    window.localStorage.setItem(
      STORAGE_KEY,
      String(value),
    );
  }, []);

  return (
    <div
      className={[
        styles.shell,
        collapsed && hydrated
          ? styles.shellCollapsed
          : "",
      ].join(" ")}
    >
      <Sidebar
        user={context.user}
        company={context.company}
        navigation={context.navigation}
        collapsed={collapsed && hydrated}
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
