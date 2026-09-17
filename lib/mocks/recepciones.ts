import {
  RecepcionDemo,
} from "@/types/recepciones";

export const RECEPCIONES_DEMO_INICIALES: RecepcionDemo[] = [
  {
    id: "rec-demo-001",
    numero: "REC-000001",
    estado: "RECIBIDA",
    fecha: "2026-09-17",
    hora: "08:40",
    proveedorId: "demo-prv-001",
    proveedorCodigo: "PRV-000001",
    proveedorNombre: "IMPORTADORA CENTRAL S.A.",
    ordenCompraId: "oc-demo-001",
    ordenCompraNumero: "OC-000123",
    depositoId: "dep-central",
    depositoCodigo: "DEP-CEN",
    depositoNombre: "Depósito Central",
    documentoProveedor: "FAC-PROV-001254",
    observacion: "Recepción parcial.",
    items: [
      {
        id: "rec-item-001",
        productoId: "mingo-prod-000001",
        productoCodigo: "PRD-000001",
        productoCodigoInventario: "1001",
        productoDescripcion: "COPA IMPORTADA",
        unidadMedidaNombre: "Unidad",
        cantidadOrdenada: 100,
        cantidadRecibida: 80,
        cantidadPendiente: 20,
        costoUnitario: 22000,
        subtotal: 1760000,
        lote: "",
        fechaVencimiento: "",
      },
    ],
    totalUnidades: 80,
    totalCosto: 1760000,
    usuario: "admin",
    creadoEn: "2026-09-17T08:40:00.000Z",
  },
];
