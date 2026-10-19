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
  /** F-DASH-03: estado real del movimiento (REGISTRADO, ANULADO o INVERSO = contrapartida de una anulación). */
  situacion: "REGISTRADO" | "ANULADO" | "INVERSO";
  /** Número del movimiento que anula (solo INVERSO). */
  anulaNumero: string | null;
};

export type DashboardRespuesta = {
  empresa: { nombre: string; moneda: string };
  periodo: { clave: DashboardPeriodo; desde: string; hasta: string; agrupacion: "DIA" | "SEMANA" };
  filtros: { depositos: { id: string; nombre: string }[]; depositoId: string };
  /** F-DASH-05: permisos VER de los módulos de destino (la API ya devuelve null en las secciones sin permiso). */
  acceso: { productos: boolean; clientes: boolean; stock: boolean; movimientos: boolean };
  // Cada sección es null cuando el usuario no tiene el permiso del módulo de origen.
  kpis: {
    productos: { activos: number; controlanStock: number } | null;
    clientes: { activos: number } | null;
    // F-DASH-07: importe decimal exacto como texto (numeric de PostgreSQL), nunca number.
    inventario: { valor: string; productosValorizados: number } | null;
    movimientos: { total: number; entradas: number; salidas: number } | null;
    stockCritico: { bajo: number; sin: number } | null;
  };
  serie: { etiqueta: string; desde: string; entradas: number; salidas: number }[] | null;
  stock: { controlados: number; disponibles: number; bajo: number; sin: number; disponibilidad: number | null } | null;
  alertas: DashboardAlerta[] | null;
  ultimos: DashboardMovimiento[] | null;
};
