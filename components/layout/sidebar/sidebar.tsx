"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import NavigationIcon from "@/components/layout/navigation-icon/navigation-icon";
import type {
  ShellCompany,
  ShellNavigationGroup,
  ShellUser,
} from "@/types/shell";

import styles from "./sidebar.module.css";

type SidebarProps = {
  user: ShellUser;
  company: ShellCompany;
  navigation: ShellNavigationGroup[];
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapsedChange: (value: boolean) => void;
  onMobileOpenChange: (value: boolean) => void;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function Sidebar({
  user,
  company,
  navigation,
  collapsed,
  mobileOpen,
  onCollapsedChange,
  onMobileOpenChange,
}: SidebarProps) {
  const pathname = usePathname();

  const activeGroupId = useMemo(() => {
    return navigation.find((group) =>
      group.items.some((item) =>
        isActivePath(pathname, item.href),
      ),
    )?.id;
  }, [navigation, pathname]);

  const [openGroupId, setOpenGroupId] = useState<string | null>(
    activeGroupId ?? null,
  );

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroupId(activeGroupId);
    }
  }, [activeGroupId]);

  useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname, onMobileOpenChange]);

  function toggleGroup(groupId: string) {
    if (collapsed) {
      onCollapsedChange(false);
      setOpenGroupId(groupId);
      return;
    }

    setOpenGroupId((current) =>
      current === groupId
        ? null
        : groupId,
    );
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className={styles.mobileOverlay}
          aria-label="Cerrar menú"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={[
          styles.sidebar,
          collapsed ? styles.collapsed : "",
          mobileOpen ? styles.mobileOpen : "",
        ].join(" ")}
      >
        <header className={styles.brandArea}>
          <Link
            href="/dashboard"
            className={styles.brand}
            aria-label="DistribuNex"
          >
            <span className={styles.brandMark}>
              <span />
              <span />
              <span />
            </span>

            {!collapsed ? (
              <span className={styles.brandCopy}>
                <strong>
                  Distribu
                  <em>Nex</em>
                </strong>
                <small>Una solución PROCEIT</small>
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            className={styles.collapseButton}
            aria-label={
              collapsed
                ? "Expandir menú"
                : "Reducir menú"
            }
            title={
              collapsed
                ? "Expandir menú"
                : "Reducir menú"
            }
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <NavigationIcon
              name={collapsed ? "expand" : "collapse"}
              size={15}
            />
          </button>
        </header>

        <nav className={styles.navigation}>
          <Link
            href="/dashboard"
            className={[
              styles.dashboardLink,
              isActivePath(pathname, "/dashboard")
                ? styles.dashboardLinkActive
                : "",
            ].join(" ")}
            title={collapsed ? "Panel general" : undefined}
          >
            <span className={styles.primaryIcon}>
              <NavigationIcon name="dashboard" size={16} />
            </span>

            {!collapsed ? (
              <>
                <span className={styles.primaryText}>
                  <strong>Panel general</strong>
                  <small>Resumen ejecutivo</small>
                </span>

                <span className={styles.activeIndicator} />
              </>
            ) : null}
          </Link>

          {!collapsed ? (
            <p className={styles.menuCaption}>
              MÓDULOS
            </p>
          ) : (
            <div className={styles.compactDivider} />
          )}

          <div className={styles.groups}>
            {navigation.map((group) => {
              const open = openGroupId === group.id;
              const active = activeGroupId === group.id;

              return (
                <section
                  key={group.id}
                  className={styles.group}
                >
                  <button
                    type="button"
                    className={[
                      styles.groupButton,
                      active ? styles.groupButtonActive : "",
                      open ? styles.groupButtonOpen : "",
                    ].join(" ")}
                    title={collapsed ? group.label : undefined}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className={styles.groupIcon}>
                      <NavigationIcon
                        name={group.icon}
                        size={15}
                      />
                    </span>

                    {!collapsed ? (
                      <>
                        <span className={styles.groupLabel}>
                          {group.label}
                        </span>

                        <span
                          className={[
                            styles.groupChevron,
                            open ? styles.groupChevronOpen : "",
                          ].join(" ")}
                        >
                          <NavigationIcon
                            name="chevron"
                            size={12}
                          />
                        </span>
                      </>
                    ) : null}
                  </button>

                  {!collapsed && open ? (
                    <div className={styles.groupItems}>
                      {group.items.map((item) => {
                        const itemActive = isActivePath(
                          pathname,
                          item.href,
                        );

                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            className={[
                              styles.itemLink,
                              itemActive
                                ? styles.itemLinkActive
                                : "",
                            ].join(" ")}
                          >
                            <span className={styles.itemIcon}>
                              <NavigationIcon
                                name={item.icon}
                                size={13}
                              />
                            </span>

                            <span className={styles.itemLabel}>
                              {item.label}
                            </span>

                            {item.badge ? (
                              <span className={styles.badge}>
                                {item.badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </nav>

        <footer className={styles.footer}>
          {!collapsed ? (
            <section className={styles.companyCard}>
              <span className={styles.companyAvatar}>
                {initials(company.name)}
              </span>

              <span className={styles.companyText}>
                <small>EMPRESA ACTIVA</small>
                <strong>{company.name}</strong>
                <span>
                  {company.branchName ??
                    company.code ??
                    "Casa Central"}
                </span>
              </span>
            </section>
          ) : null}

          <section className={styles.userCard}>
            <span className={styles.userAvatar}>
              {initials(user.displayName)}
            </span>

            {!collapsed ? (
              <>
                <span className={styles.userText}>
                  <strong>{user.displayName}</strong>
                  <small>{user.roleLabel}</small>
                </span>

                <button
                  type="button"
                  className={styles.logoutButton}
                  onClick={logout}
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <NavigationIcon
                    name="logout"
                    size={14}
                  />
                </button>
              </>
            ) : null}
          </section>
        </footer>
      </aside>
    </>
  );
}
