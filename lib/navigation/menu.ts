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
        id: "suppliers",
        label: "Proveedores",
        href: "/proveedores",
        icon: "suppliers",
        permission: "PROVEEDORES.VER",
      },
      {
        id: "products",
        label: "Productos",
        href: "/productos",
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
        permission: "INVENTARIO.VER",
      },
      {
        id: "stock-movements",
        label: "Movimientos",
        href: "/movimientos",
        icon: "movements",
        permission: "INVENTARIO.VER",
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
        permission: "INVENTARIO.VER",
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
        id: "invoices",
        label: "Facturas",
        href: "/facturas",
        icon: "invoice",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
      {
        id: "credit-notes",
        label: "Notas de crédito",
        href: "/notas-credito",
        icon: "creditNote",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
      {
        id: "remission-notes",
        label: "Notas de remisión",
        href: "/notas-remision",
        icon: "remission",
        permission: "FACTURACION_ELECTRONICA.VER",
      },
      {
        id: "electronic-documents",
        label: "Todos los documentos",
        href: "/documentos",
        icon: "documents",
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
        id: "audit",
        label: "Auditoría",
        href: "/administracion/auditoria",
        icon: "audit",
        permission: "AUDITORIA.VER",
      },
    ],
  },
];

function canShowItem(
  item: ShellNavigationItem,
  permissions: Set<string>,
  enforcePermissions: boolean,
) {
  if (!enforcePermissions || !item.permission) {
    return true;
  }

  return permissions.has(
    item.permission.trim().toUpperCase(),
  );
}

export function resolveNavigation(
  permissionCodes: string[] = [],
): ShellNavigationGroup[] {
  const permissions = new Set(
    permissionCodes
      .map((permission) =>
        permission.trim().toUpperCase(),
      )
      .filter(Boolean),
  );

  /*
   * Para el mockup:
   * si no recibimos permisos, mostramos todo el menú.
   *
   * Más adelante, cuando la sesión real entregue permisos,
   * el mismo método filtrará automáticamente los módulos.
   */
  const enforcePermissions =
    permissions.size > 0;

  return NAVIGATION_GROUPS.map(
    (group) => ({
      ...group,
      items: group.items.filter((item) =>
        canShowItem(
          item,
          permissions,
          enforcePermissions,
        ),
      ),
    }),
  ).filter(
    (group) => group.items.length > 0,
  );
}