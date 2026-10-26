import type {
  ShellNavigationGroup,
  ShellNavigationItem,
} from "@/types/shell";

export const NAVIGATION_GROUPS: ShellNavigationGroup[] = [
  {
    id: "masters",
    label: "Maestros",
    icon: "masters",
    items: [
      {
        id: "clients",
        label: "Clientes",
        href: "/clientes",
        icon: "clients",
        permission: "CLIENTES.VER",
      },
      {
        // CLI-D01: destino real del perfil que solo puede CREAR clientes (alta guiada sin acceso a la lista ni a las fichas). Se oculta si el usuario también puede VER.
        id: "clients-new",
        label: "Nuevo cliente",
        href: "/clientes/nuevo",
        icon: "clients",
        permission: "CLIENTES.CREAR",
      },
      {
        id: "suppliers",
        label: "Proveedores",
        href: "/proveedores",
        icon: "suppliers",
        permission: "PROVEEDORES.VER",
      },
      {
        // PRV-D01: destino real del perfil que solo puede CREAR proveedores (alta sin acceso a la lista ni a las fichas). Se oculta si el usuario también puede VER.
        id: "suppliers-new",
        label: "Nuevo proveedor",
        href: "/proveedores/nuevo",
        icon: "suppliers",
        permission: "PROVEEDORES.CREAR",
      },
      {
        id: "products",
        label: "Productos",
        href: "/productos",
        icon: "products",
        permission: "PRODUCTOS.VER",
      },
      {
        // PRD-D01: destino real del perfil que solo puede CREAR productos (alta sin acceso a la lista ni a las fichas). Se oculta si el usuario también puede VER.
        id: "products-new",
        label: "Nuevo producto",
        href: "/productos/nuevo",
        icon: "products",
        permission: "PRODUCTOS.CREAR",
      },
      {
        id: "product-catalogs",
        label: "Catálogos de productos",
        href: "/productos/catalogos",
        icon: "products",
        permission: "PRODUCTOS.VER",
      },
      {
        id: "price-lists",
        label: "Listas de precios",
        href: "/listas-precio",
        icon: "prices",
        permission: "LISTAS_PRECIO.VER",
      },
      {
        // LPR-D01: destino real del perfil que solo puede CREAR listas (alta sin acceso al listado ni a las fichas). Se oculta si el usuario también puede VER.
        id: "price-lists-new",
        label: "Nueva lista de precios",
        href: "/listas-precio/nuevo",
        icon: "prices",
        permission: "LISTAS_PRECIO.CREAR",
      },
      {
        id: "commercial-catalogs",
        label: "Catálogos comerciales",
        href: "/catalogos-comerciales",
        icon: "prices",
        permission: "LISTAS_PRECIO.VER",
      },
      {
        // CC-D01: destino real del perfil que solo puede CREAR catálogos comerciales (alta sin listado ni historial). Se oculta si el usuario también puede VER.
        id: "commercial-catalogs-new",
        label: "Nuevo catálogo comercial",
        href: "/catalogos-comerciales/nuevo",
        icon: "prices",
        permission: "LISTAS_PRECIO.CREAR",
      },
      {
        id: "salespeople",
        label: "Vendedores",
        href: "/vendedores",
        icon: "salespeople",
        permission: "VENDEDORES.VER",
      },
      {
        id: "zones-routes",
        label: "Zonas y rutas",
        href: "/zonas-rutas",
        icon: "routes",
        permission: "RUTAS.VER",
      },
    ],
  },
  {
    id: "purchases",
    label: "Compras",
    icon: "purchases",
    items: [
      {
        id: "purchase-requests",
        label: "Solicitudes",
        href: "/solicitudes",
        icon: "requests",
        permission: "COMPRAS.VER",
      },
      {
        id: "purchase-orders",
        label: "Órdenes de compra",
        href: "/ordenes",
        icon: "orders",
        permission: "COMPRAS.VER",
      },
      {
        id: "purchase-receipts",
        label: "Recepciones",
        href: "/recepciones",
        icon: "receipts",
        permission: "COMPRAS.VER",
      },
      {
        id: "purchase-returns",
        label: "Devoluciones",
        href: "/devoluciones",
        icon: "returns",
        permission: "COMPRAS.VER",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventario",
    icon: "inventory",
    items: [
      {
        id: "stock",
        label: "Stock",
        href: "/stock",
        icon: "stock",
        permission: "STOCK.VER",
      },
      {
        id: "stock-movements",
        label: "Movimientos",
        href: "/movimientos",
        icon: "movements",
        permission: "MOVIMIENTOS.VER",
      },
      {
        id: "warehouses",
        label: "Depósitos",
        href: "/depositos",
        icon: "warehouses",
        permission: "INVENTARIO.VER",
      },
      {
        id: "replenishment",
        label: "Reposición",
        href: "/reposicion",
        icon: "replenishment",
        permission: "STOCK.VER",
      },
    ],
  },
  {
    id: "sales",
    label: "Ventas",
    icon: "sales",
    items: [
      {
        id: "orders",
        label: "Pedidos",
        href: "/pedidos",
        icon: "orders",
        permission: "PEDIDOS.VER",
      },
      {
        id: "sales",
        label: "Ventas",
        href: "/ventas",
        icon: "sales",
        permission: "VENTAS.VER",
      },
      {
        id: "deliveries",
        label: "Entregas",
        href: "/entregas",
        icon: "deliveries",
        permission: "ENTREGAS.VER",
      },
    ],
  },
  {
    id: "finance",
    label: "Finanzas",
    icon: "finance",
    items: [
      {
        id: "accounts-receivable",
        label: "Cuentas por cobrar",
        href: "/finanzas/cuentas-por-cobrar",
        icon: "receivable",
        permission: "FINANZAS.VER",
      },
      {
        id: "collections",
        label: "Cobros",
        href: "/finanzas/cobros",
        icon: "collections",
        permission: "FINANZAS.VER",
      },
      {
        id: "accounts-payable",
        label: "Cuentas por pagar",
        href: "/finanzas/cuentas-por-pagar",
        icon: "payable",
        permission: "FINANZAS.VER",
      },
      {
        id: "payments",
        label: "Pagos",
        href: "/finanzas/pagos",
        icon: "payments",
        permission: "FINANZAS.VER",
      },
      {
        id: "cash",
        label: "Caja",
        href: "/finanzas/caja",
        icon: "cash",
        permission: "FINANZAS.VER",
      },
    ],
  },
  {
    id: "billing",
    label: "Facturación",
    icon: "billing",
    items: [
      {
        id: "electronic-documents",
        label: "Documentos electrónicos",
        href: "/documentos",
        icon: "documents",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
      {
        id: "invoices",
        label: "Facturas",
        href: "/facturas",
        icon: "invoice",
        permission: "FACTURACION_ELECTRONICA.CREAR",
      },
      {
        id: "dispatch-points",
        label: "Puntos de expedición",
        href: "/facturacion/puntos",
        icon: "settings",
        permission: "FACTURACION_ELECTRONICA.PUNTOS",
      },
      {
        id: "credit-notes",
        label: "Notas de crédito",
        href: "/notas-credito",
        icon: "creditNote",
        permission: "FACTURACION_ELECTRONICA.CREAR",
      },
      {
        id: "remission-notes",
        label: "Notas de remisión",
        href: "/notas-remision",
        icon: "remission",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
      {
        id: "sifen-monitor",
        label: "Monitor SIFEN",
        href: "/sifen",
        icon: "sifen",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
    ],
  },
  {
    id: "reports",
    label: "Reportes",
    icon: "reports",
    items: [
      {
        id: "reports",
        label: "Reportes operativos",
        href: "/reportes",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-stock-general",
        label: "Stock general",
        href: "/reportes/stock-general",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-valorizacion",
        label: "Valorización de inventario",
        href: "/reportes/valorizacion",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-kardex",
        label: "Kardex de movimientos",
        href: "/reportes/kardex",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-stock-critico",
        label: "Stock crítico y reposición",
        href: "/reportes/stock-critico",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-lotes",
        label: "Lotes y vencimientos",
        href: "/reportes/lotes",
        icon: "reports",
        permission: "REPORTES.VER",
      },
      {
        id: "report-ventas",
        label: "Informe de Ventas",
        href: "/reportes/ventas",
        icon: "reports",
        permission: "REPORTES.VER",
      },
    ],
  },
  {
    id: "administration",
    label: "Administración",
    icon: "admin",
    items: [
      {
        id: "users",
        label: "Usuarios",
        href: "/administracion/usuarios",
        icon: "users",
        permission: "USUARIOS.VER",
      },
      {
        id: "roles",
        label: "Roles y permisos",
        href: "/administracion/roles",
        icon: "roles",
        permission: "PERFILES.VER",
      },
      {
        id: "settings",
        label: "Configuración",
        href: "/administracion/configuracion",
        icon: "settings",
        permission: "CONFIGURACION.VER",
      },
      {
        id: "settings-electronic-billing",
        label: "Facturación electrónica",
        href: "/configuracion/facturacion-electronica",
        icon: "settings",
        permission: "FACTURACION_ELECTRONICA.CONFIGURAR",
      },
      {
        id: "audit",
        label: "Auditoría",
        href: "/administracion/auditoria",
        icon: "audit",
        permission: "AUDITORIA.VER",
      },
    ],
  },
];

/**
 * Rutas con página y API reales dentro del alcance de la V1. El resto del menú
 * (compras, ventas, finanzas, facturación, etc.) queda oculto hasta existir.
 * Las páginas todavía con datos de prueba se retiran de aquí al conectarse a PostgreSQL
 * solo cuando el módulo esté listo; ver PROGRESSO-NEXIT-V1.md.
 */
const V1_HREFS = new Set([
  "/clientes",
  "/clientes/nuevo",
  "/proveedores",
  "/proveedores/nuevo",
  "/productos",
  "/productos/nuevo",
  "/productos/catalogos",
  "/listas-precio",
  "/listas-precio/nuevo",
  "/catalogos-comerciales",
  "/catalogos-comerciales/nuevo",
  "/stock",
  "/reposicion",
  "/depositos",
  "/documentos",
  "/vendedores",
  "/administracion/usuarios",
  "/facturas",
  "/notas-credito",
  "/facturacion/puntos",
  "/configuracion/facturacion-electronica",
  "/movimientos",
  "/reportes",
  "/reportes/stock-general",
  "/reportes/valorizacion",
  "/reportes/kardex",
  "/reportes/stock-critico",
  "/reportes/lotes",
  "/reportes/ventas",
]);

export const PLATFORM_GROUP: ShellNavigationGroup = {
  id: "platform",
  label: "Plataforma",
  icon: "admin",
  items: [
    {
      id: "platform-companies",
      label: "Empresas",
      href: "/administracion/empresas",
      icon: "admin",
    },
  ],
};

export type NavigationAccess = {
  permissions: string[];
  isCompanyAdmin: boolean;
  isPlatformAdmin: boolean;
};

function canShowItem(item: ShellNavigationItem, access: NavigationAccess) {
  if (!V1_HREFS.has(item.href)) return false;
  // CLI-D01: «Nuevo cliente» solo para quien crea sin poder consultar (el administrador y quien tiene VER usan «Clientes»).
  if (item.id === "clients-new") return !access.isCompanyAdmin && access.permissions.includes("CLIENTES.CREAR") && !access.permissions.includes("CLIENTES.VER");
  if (item.id === "products-new") return !access.isCompanyAdmin && access.permissions.includes("PRODUCTOS.CREAR") && !access.permissions.includes("PRODUCTOS.VER");
  if (item.id === "commercial-catalogs-new") return !access.isCompanyAdmin && access.permissions.includes("LISTAS_PRECIO.CREAR") && !access.permissions.includes("LISTAS_PRECIO.VER");
  if (item.id === "price-lists-new") return !access.isCompanyAdmin && access.permissions.includes("LISTAS_PRECIO.CREAR") && !access.permissions.includes("LISTAS_PRECIO.VER");
  if (item.id === "suppliers-new") return !access.isCompanyAdmin && access.permissions.includes("PROVEEDORES.CREAR") && !access.permissions.includes("PROVEEDORES.VER");
  if (access.isCompanyAdmin) return true;
  if (!item.permission) return false;
  return access.permissions.includes(item.permission.trim().toUpperCase());
}

/** Destino explícito (sin redirecciones) para quien no tiene ninguna página operativa autorizada. */
export const RUTA_SIN_ACCESO = "/sin-acceso";

/** F-DASH-04: el Panel general solo para quien tiene DASHBOARD.VER (o administra la empresa); la plataforma nunca opera una empresa. */
export function puedeVerDashboard(access: NavigationAccess) {
  if (access.isPlatformAdmin) return false;
  return access.isCompanyAdmin || access.permissions.includes("DASHBOARD.VER");
}

/**
 * F-DASH-04: página de inicio real del usuario. Plataforma → Empresas; con DASHBOARD.VER → Panel general; si no, la primera página operativa autorizada de su menú;
 * sin ninguna → página explícita de «sin acceso» (que no redirige: no hay bucle). No concede permisos: solo elige entre destinos ya autorizados.
 */
export function resolverInicio(access: NavigationAccess): string {
  if (access.isPlatformAdmin) return PLATFORM_GROUP.items[0].href;
  if (puedeVerDashboard(access)) return "/dashboard";

  return resolveNavigation(access)[0]?.items[0]?.href ?? RUTA_SIN_ACCESO;
}

/**
 * Menú por perfil. Administrador global de plataforma (PROCEIT): solo el menú de plataforma.
 * Usuarios de empresa: únicamente los módulos que sus perfiles permiten. Sin permisos => sin módulos.
 * El menú es solo comodidad visual: el control real está en el servidor (guardApi/guardPage).
 */
export function resolveNavigation(access: NavigationAccess): ShellNavigationGroup[] {
  if (access.isPlatformAdmin) return [PLATFORM_GROUP];

  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canShowItem(item, access)),
  })).filter((group) => group.items.length > 0);
}
