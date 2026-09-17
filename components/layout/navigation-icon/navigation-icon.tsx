import type { ReactNode } from "react";

import type { NavigationIcon as NavigationIconName } from "@/types/navigation";

export type SystemIconName =
  | NavigationIconName
  | "bell"
  | "search"
  | "menu"
  | "chevron"
  | "collapse"
  | "expand"
  | "logout";

type NavigationIconProps = {
  name: SystemIconName;
  size?: number;
};

export default function NavigationIcon({
  name,
  size = 16,
}: NavigationIconProps) {
  const icons: Record<SystemIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    masters: (
      <>
        <path d="M4 5h16" />
        <path d="M4 12h16" />
        <path d="M4 19h16" />
        <circle cx="8" cy="5" r="1.5" />
        <circle cx="16" cy="12" r="1.5" />
        <circle cx="10" cy="19" r="1.5" />
      </>
    ),

    clients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M4 20c.7-4 2.5-6 5-6s4.3 2 5 6" />
        <path d="M16 8h4" />
        <path d="M18 6v4" />
      </>
    ),

    suppliers: (
      <>
        <path d="M3 20h18" />
        <path d="M5 20V8l7-4 7 4v12" />
        <path d="M9 20v-5h6v5" />
      </>
    ),

    products: (
      <>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 7 8 4 8-4" />
        <path d="M4 7v9l8 4 8-4V7" />
      </>
    ),

    prices: (
      <>
        <path d="M20 13 11 22 2 13l9-9h7l2 2v7Z" />
        <circle cx="15.5" cy="8.5" r="1.5" />
      </>
    ),

    salespeople: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
        <path d="M14 15c2.8-.7 5.3.8 6 4" />
      </>
    ),

    routes: (
      <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M7 18h4a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" />
      </>
    ),

    purchases: (
      <>
        <path d="M4 6h2l2 10h9l2-7H7" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
      </>
    ),

    requests: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),

    orders: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="m10 16 1.5 1.5L15 14" />
      </>
    ),

    receipts: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),

    returns: (
      <>
        <path d="M9 7H5V3" />
        <path d="M5 7a8 8 0 1 1-1 8" />
      </>
    ),

    inventory: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8" />
        <path d="M8 13h8" />
      </>
    ),

    stock: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M7 7V4h10v3" />
        <path d="M8 12h8" />
      </>
    ),

    movements: (
      <>
        <path d="M4 8h13" />
        <path d="m14 5 3 3-3 3" />
        <path d="M20 16H7" />
        <path d="m10 13-3 3 3 3" />
      </>
    ),

    warehouses: (
      <>
        <path d="M3 10 12 4l9 6v10H3V10Z" />
        <path d="M7 20v-6h10v6" />
      </>
    ),

    replenishment: (
      <>
        <path d="M4 4v6h6" />
        <path d="M20 20v-6h-6" />
        <path d="M5 10a8 8 0 0 1 13-4" />
        <path d="M19 14a8 8 0 0 1-13 4" />
      </>
    ),

    sales: (
      <>
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19V3" />
      </>
    ),

    deliveries: (
      <>
        <path d="M3 6h11v10H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),

    finance: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9" />
        <path d="M12 6v12" />
      </>
    ),

    receivable: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
        <path d="m16 15 2 2 3-4" />
      </>
    ),

    collections: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v10" />
        <path d="M15 9h-4a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H9" />
      </>
    ),

    payable: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
        <path d="m16 15 2 2 3-3" />
      </>
    ),

    payments: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),

    cash: (
      <>
        <path d="M4 6h16v12H4z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),

    billing: (
      <>
        <path d="M6 3h10l3 3v15H6z" />
        <path d="M16 3v4h4" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </>
    ),

    invoice: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),

    creditNote: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 9h6" />
        <path d="M12 6v6" />
      </>
    ),

    remission: (
      <>
        <path d="M3 6h11v10H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <path d="M6 10h5" />
      </>
    ),

    documents: (
      <>
        <path d="M7 3h10l3 3v15H7z" />
        <path d="M17 3v4h4" />
        <path d="M4 7v14h10" />
      </>
    ),

    sifen: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </>
    ),

    reports: (
      <>
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19V3" />
      </>
    ),

    admin: (
      <>
        <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),

    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M4 20c.7-4 2.5-6 5-6s4.3 2 5 6" />
        <circle cx="17" cy="9" r="2" />
        <path d="M15 15c3-.6 5.3 1 6 4" />
      </>
    ),

    roles: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M4 20c.7-4 2.5-6 5-6s4.3 2 5 6" />
        <path d="m16 14 2 2 3-4" />
      </>
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 2-.7Z" />
      </>
    ),

    audit: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h4" />
        <path d="m14 17 2 2 4-5" />
      </>
    ),

    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),

    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),

    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),

    chevron: (
      <path d="m9 18 6-6-6-6" />
    ),

    collapse: (
      <>
        <path d="m15 18-6-6 6-6" />
        <path d="M20 5v14" />
      </>
    ),

    expand: (
      <>
        <path d="m9 18 6-6-6-6" />
        <path d="M4 5v14" />
      </>
    ),

    logout: (
      <>
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}