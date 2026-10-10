# NEXIT V1 — Reportes de inventario (alcance aprobado)
**Decisión del propietario:** 2026-10-10. **Estado:** cinco reportes OBLIGATORIOS para la V1, pendientes de implementación y revisión de código. No corresponde a V2.
**Dependencias:** Productos, Movimientos, Stock, perfiles/permisos PostgreSQL. No implementar Compras/Ventas/Finanzas para generar métricas ficticias.

## Navegación/UX
Menú **Reportes** → 1. **Stock general**; 2. **Valorización de inventario**; 3. **Kardex de movimientos**; 4. **Stock crítico y reposición**; 5. **Lotes y vencimientos**. Mantener idioma español, estilo de la aplicación, filas paginadas/filtrables, indicadores, vista detalle cuando proceda. Todas las vistas ofrecen **Descargar Excel (.xlsx)** y **Exportar PDF**, cuyos datos y totales han de coincidir con los filtros activos. Exportaciones seguras, nombre de archivo dinámico, sin DEMO, localStorage ni valores precalculados ficticios.

## 1. Stock general — obligatorio
**Columnas:** código producto, código inventario/GTIN si aplica, descripción, categoría, marca, familia, línea, unidad, depósito, lote, fecha vencimiento (si existe), propiedad, disponible, reservado, cuarentena, tránsito, físico, virtual. Terceros separado de propio. Reporte agregado por producto y detalle por depósito/lote; no sumar doble el agregado y sus desgloses.
**Filtros:** producto/código/texto, depósito, categoría, marca, familia, situación del stock, lote, con/sin stock.
**Regla de cálculo:** usar `stock_saldos`; físico propio = disponible + reservado + cuarentena, virtual = físico + tránsito (según contrato actual `lib/stock/shared.ts`). El estado TRANSITO aún no tiene flujo productor en V1; mostrar aclaración de cobertura para evitar interpretación equivocada.

## 2. Valorización de inventario — obligatorio
**Columnas:** producto, código, categoría/familia, depósito, moneda base, cantidad valorizada, costo promedio real (o —), valor de inventario, subtotales producto/depósito/categoría y total general.
**Fuente:** `inventario_costos` — cantidad valorizada y valor total real. Costo unitario = valor/cantidad cuando cantidad positiva. No confundir `stock_saldos` con cantidad valorizada. No atribuir costo ficticio si no existe registro ni basar la valorización en el precio de venta. Se puede mostrar **valor de venta referencial** por separado desde `v_producto_precio_referencia` solo si existe y moneda concordante; nunca mezclar con total de costo.
**Filtros:** producto, categoría/familia, depósito, existencia, costo registrado/sin costo. Respetar la moneda base de empresa y límites de alcance.
**Limitación V1:** valorización a fecha de hoy, NO valorización histórica arbitraria sin costeo/snapshot reproducible.

## 3. Kardex de movimientos — obligatorio
**Columnas:** fecha/hora, número de movimiento, tipo/origen, estado, documento referencia, producto, lote, depósito origen/destino, entrada, salida, costo unitario, motivo, usuario, movimiento inverso/anulación vinculada y saldo acumulado calculado consistentemente.
**Filtros:** período, producto, depósito, tipo, usuario, documento y estado. Incluir anulación y contraasiento, sin borrar histórico. Transferencias muestran ambos lados sin duplicar valor consolidado. Saldo acumulado debe provenir de secuencia y saldo inicial válido, no de sumar solo movimientos visibles de una página. Para reservas/cuarentena separar el cambio de estado de la cantidad física total.
**Limitación:** si el modelo no soporta saldo histórico costed por depósito/lote, etiquetar saldo histórico no disponible en lugar de inventarlo.

## 4. Stock crítico y reposición — obligatorio
**Columnas:** código/descr., depósito (si aparece: alerta basada en política del producto), stock disponible, mínimo, máximo, punto reposición, clasificación SIN_STOCK/BAJO/NORMAL/SOBRESTOCK, cantidad sugerida a reponer, costo referencia si registrado.
**Criterio inicial:** indicadores calculados desde la política **por producto** (mínimo/máximo/reposición); NO presentar límites como si fueran específicos del depósito. Propuesta conservadora cantidad sugerida = max(0, mínimo - disponible) o, si política aprobada, hasta objetivo configurable. Documentar fórmula aplicada y no crear OC automáticas.
**Filtros:** nivel, depósito, categoría, producto, marca y familia. Valores consistentes con Stock.

## 5. Lotes y vencimientos — obligatorio
**Columnas:** producto, código, depósito, lote, fecha de vencimiento, días restantes, cantidad por estado, propiedad, clasif. VENCIDO / PRÓXIMO A VENCER / VIGENTE / SIN FECHA.
**Filtros:** producto, depósito, lote, intervalo de fechas, clase, horizonte N días (predeterminado configurable, sugerencia 30), solo saldos positivos.
**Reglas:** solo productos/lotes registrados, no inventar caducidad. Usar zona horaria consistente para fecha actual. No adjudicar vencimiento a productos sin control de lote.

## Requisitos transversales y aceptación
- Multiempresa: `empresa_id` de la sesión en **todas** las consultas; rango de depósitos por usuario cuando esté disponible; no exponer resultados de otras empresas ni por ID directo. ADMIN plataforma sin acceso implícito a datos operativos.
- Autorización `REPORTES.VER` en páginas, endpoints y descargas, además de controles adicionales de datos de costo si así lo exige la política de permisos existente (revisar catálogo antes de implementar).
- Consultas parametrizadas, paginación, exportación escalable sin agotar RAM, consistencia de totales y filtros con la vista, formato local de PYG/multimoneda si aplica, precisión `numeric` en cálculos monetarios.
- Fechas, lotes y saldos reales de las migraciones existentes. Nunca usar mocks, saldos/costos/precios artificiales o fingir histórico/estados no instrumentados. Si faltara estructura, documentar necesidad concreta y solicitar aprobación antes de crear migración.
- Pruebas mínimas: datos nulos/sin movimientos, dos empresas, permisos 401/403, filtro depósito/categoría, números de stock/costo conciliados, anulación, múltiples lotes, Excel/PDF con los mismos filtros, sin DATABASE_URL 503 y navegador/build real cuando sea posible.
- Implementar por **un reporte a la vez** con commits pequeños y revisión; se permite crear estructura compartida reutilizable al construir el primero. Después de los cinco, detenerse para validación completa de V1.
