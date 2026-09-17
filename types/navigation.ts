export type NavigationIcon =
  | "dashboard"
  | "masters"
  | "clients"
  | "suppliers"
  | "products"
  | "prices"
  | "salespeople"
  | "routes"
  | "purchases"
  | "requests"
  | "orders"
  | "receipts"
  | "returns"
  | "inventory"
  | "stock"
  | "movements"
  | "warehouses"
  | "replenishment"
  | "sales"
  | "deliveries"
  | "finance"
  | "receivable"
  | "collections"
  | "payable"
  | "payments"
  | "cash"
  | "billing"
  | "invoice"
  | "creditNote"
  | "remission"
  | "documents"
  | "sifen"
  | "reports"
  | "admin"
  | "users"
  | "roles"
  | "settings"
  | "audit";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: NavigationIcon;
  permission?: string;
  badge?: string;
};

export type NavigationGroup = {
  id: string;
  label: string;
  icon: NavigationIcon;
  permission?: string;
  items: NavigationItem[];
};
