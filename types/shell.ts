export type ShellUser = {
  id: string | null;
  username: string | null;
  displayName: string;
  roleCode: string | null;
  roleLabel: string;
};

export type ShellCompany = {
  id: string | null;
  code: string | null;
  name: string;
  branchName: string | null;
};

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

export type ShellNavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: NavigationIcon;
  permission?: string;
  badge?: string;
};

export type ShellNavigationGroup = {
  id: string;
  label: string;
  icon: NavigationIcon;
  permission?: string;
  items: ShellNavigationItem[];
};

export type ShellContext = {
  user: ShellUser;
  company: ShellCompany;
  permissions: string[];
  navigation: ShellNavigationGroup[];
};