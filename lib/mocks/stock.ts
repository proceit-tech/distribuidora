import {
  PRODUCTOS_DEMO_INICIALES,
} from "@/lib/mocks/productos";

import {
  StockDemo,
} from "@/types/stock";

export const STOCK_DEMO_INICIAL: StockDemo[] =
  PRODUCTOS_DEMO_INICIALES
    .filter(
      (producto) =>
        producto.tipoProducto === "MERCADERIA",
    )
    .map((producto) => {
      const disponible =
        producto.inventarioInicial;

      const totalFisico =
        disponible;

      return {
        id: `stock-${producto.id}`,

        productoId: producto.id,
        productoCodigo: producto.codigo,
        productoCodigoInventario:
          producto.codigoInventario,
        productoDescripcion:
          producto.descripcion,
        codigoBarras:
          producto.codigoBarras,

        categoria:
          producto.categoriaNombre,
        marca:
          producto.marcaNombre,
        familia:
          producto.familiaNombre,
        linea:
          producto.lineaNombre,
        procedencia:
          producto.procedencia,

        unidadMedidaId:
          producto.unidadMedidaId,
        unidadMedidaNombre:
          producto.unidadMedidaNombre,

        modoControl:
          producto.modoControlStock,

        stockMinimo:
          producto.stockMinimo,
        stockMaximo:
          producto.stockMaximo,
        puntoReposicion:
          producto.puntoReposicion,

        disponible,
        reservado: 0,
        cuarentena: 0,
        transito: 0,

        totalFisico,
        totalVirtual:
          totalFisico,

        propiedad: "PROPIO",
        propietarioId: "",
        propietarioNombre:
          "CASA MINGO S.A.",

        nivel:
          disponible <= 0
            ? "SIN_STOCK"
            : "NORMAL",

        costoPromedio:
          producto.costoPromedio,
        valorInventario: 0,

        precioVentaReferencia:
          producto.precioVentaReferencia,
        valorVentaReferencia:
          producto.valorVentaReferencia,

        depositos: [
          {
            id: `dep-${producto.id}`,
            depositoId:
              "dep-central",
            depositoCodigo:
              "DEP-CEN",
            depositoNombre:
              "Depósito Central",
            ubicacion: "",
            disponible,
            reservado: 0,
            cuarentena: 0,
            transito: 0,
            totalFisico,
          },
        ],

        lotes: [],

        actualizadoEn:
          "2026-09-17T14:00:00.000Z",
      };
    });