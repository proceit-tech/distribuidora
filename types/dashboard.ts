export type DashboardPeriodo = "7d" | "15d" | "30d" | "90d";

export type DashboardAlerta = {
  clave: string;
  titulo: string;
  detalle: string;
  tono: "warning" | "danger" | "info";
  href: string;
  cantidad: number;
};

export type DashboardMovimiento = {
  id: string;
  numero: string;
  tipo: string;
  fecha: string;
  hora: string;
  producto: string;
  cantidad: number;
  depositos: string;
  usuario: string;
};

export type DashboardRespuesta = {
  empresa: { nombre: string; moneda: string };
  periodo: { clave: DashboardPeriodo; desde: string; hasta: string; agrupacion: "DIA" | "SEMANA" };
  filtros: { depositos: { id: string; nombre: string }[]; depositoId: string };
  // Cada sección es null cuando el usuario no tiene el permiso del módulo de origen.
  kpis: {
    productos: { activos: number; controlanStock: number } | null;
    clientes: { activos: number } | null;
    inventario: { valor: number; productosValorizados: number } | null;
    movimientos: { total: number; entradas: number; salidas: number } | null;
    stockCritico: { bajo: number; sin: number } | null;
  };
  serie: { etiqueta: string; desde: string; entradas: number; salidas: number }[] | null;
  stock: { controlados: number; disponibles: number; bajo: number; sin: number; disponibilidad: number | null } | null;
  alertas: DashboardAlerta[] | null;
  ultimos: DashboardMovimiento[] | null;
};
