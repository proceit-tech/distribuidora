# REQ-NEXIT-FE-DESKTOP-UX-PREMIUM — Nueva factura: flujo y densidad visual

**Fecha:** 21/10/2026. **Estado:** pedido del responsable; implementación NO iniciada; autorizado por el responsable junto a la corrección NCR en una sola entrega delimitada, con pruebas separadas por dominio.
**Área:** Facturación → Facturas → Nueva factura. Exclusivo desktop; no rediseño móvil.
**Evidencia:** capturas enviadas en ChatGPT el 21/10/2026; las imágenes NO están versionadas en Git.

## Defecto de flujo
Actualmente `<MediosPago>` se presenta dentro de configuración fiscal y **antes** de `Cliente` y `Detalle de la factura`. Muestra «Efectivo · cubre Gs. 0» incluso cuando faltan cliente e ítems. El responsable requiere **elegir la forma de pago después de elegir cliente e ítems y conocer el total**, no antes.

## Comportamiento requerido
1. Mantener parámetros fiscales actuales (sucursal, punto, moneda, cambio, tipo de transacción, presencia, condición). Ubicar la sección visible «Forma de pago» **después** de la tabla de productos, nunca antes del cliente.
2. Sin cliente seleccionado o sin productos válidos/total calculable, no ofrecer medio de pago para edición. Mostrar si conviene una guía discreta en su ubicación final, no «cubre Gs. 0». No exigir factura enteramente emitible solo para poder elegir medio de pago (errores fiscales independientes siguen sus controles existentes).
3. Cuando cliente e ítems válidos determinan el total, habilitar el mismo componente `MediosPago`; conservar modo Contado y Crédito con entrega inicial, múltiples medios, conciliación, límites y confirmaciones al cambiar moneda/condición. No resetear pagos arbitrariamente al cambiar cliente ni inventar reglas nuevas.
4. Compactar cada línea de productos en desktop: altura de tabla significativamente menor sin recortar inputs ni perder código, GTIN, descripción completa accesible, IVA, unidad, cantidad editable, precio, descuento, subtotal, botón Fiscal y Quitar. Preferir 1–2 líneas de nombre con truncamiento visual y título accesible, una línea secundaria pequeña para código/GTIN, alineación vertical uniforme. No eliminar datos fiscales ni funcionalidades.
5. Rediseñar `Resumen de la factura` como revisión desktop premium con jerarquía: encabezado compacto, resumen de emisor/cliente/destino y operación agrupados, tabla de productos más densa con scroll interno si crece, resumen financiero priorizado (total general e IVA), distribución de stock resumida con detalle expandible, y barra de acciones `Volver a editar` / `Enviar factura` visible. Modal con máximo razonable de alto respecto a viewport, sin bloquear datos relevantes.
6. Operador mantiene posibilidad de revisar cada depósito, lote/cantidad de la salida antes del envío mediante detalle explícito. No omitir advertencia si hay errores o falta de stock. Mantener preservación exacta del cuerpo de revisión y huella del reparto: nada cambia silenciosamente después de revisar.
7. Estética coherente con NEXIT existente: visual sobrio, tipografía y alineación consistentes, aire controlado, sin cards gigantes, sin colores decorativos ni introducir framework CSS. Solo desktop.

## Archivos orientativos
`app/(private)/facturas/nueva/page.tsx`, `page.module.css`, `medios-pago.tsx` (si es imprescindible). Preferir solo markup/estilos, funciones de presentación puras y tests focales; sin modificar emisión, cálculos, payload fiscal, IVA, stock, permisos o gateway.

## Criterios de aceptación/testes
- Cliente vacío + cero ítems: el selector de pago no es editable y nunca aparece «cubre Gs. 0».
- Cliente seleccionado, sin ítems: medios todavía no editables.
- Cliente seleccionado + líneas válidas: medios al final del flujo, montos del total correctamente conciliados.
- Contado y Crédito con entrega inicial, varios medios, moneda extranjera y cambios de condición preservados.
- En desktop, descripción larga y GTIN no desbordan y la tabla ocupa menos alto de manera observable.
- Resumen con 3 y con muchos ítems: cabecera/acciones accesibles, contenido desplazable, totales legibles, stock detallable y sin alterar importes.
- Accesibilidad básica de foco, labels, teclado y diálogo.
- Test focal de reglas originales/estado de revisión; revisión visual definitiva en navegador real corresponde al responsable humano, no Claude.

**Restricciones:** Esta sección UX **no cambia NCE/KuDE**: esa corrección es un subalcance independiente autorizado en la misma entrega, definido en `INC-NEXIT-NCE-KUDE-GATEWAY-2026-10-21.md`. No cambiar SIFEN, XML, fiscalidad, identidad de empresa, API, migraciones, inventario ni acciones/estados de gateway. Tests locales puntuales, commit/push y detenerse para auditoría ChatGPT. No homologar por captura estática del código.
