# ORDEN ACTIVA — PRO-339-D01 / Diagnóstico máximo de 21 ítems SOLO CASA MINGO

**Fecha:** 02/11/2026  
**Proyecto:** NEXIT — Distribuidora · **Linear:** [PRO-339](https://linear.app/proceit/issue/PRO-339) · **GitHub:** [#16](https://github.com/proceit-tech/distribuidora/issues/16)  
**Gate previo:** [AUD PRO-334-R02 conforme estáticamente](../testes/AUD-NEXIT-PRO-334-COLORES-FE-NCE-R02-2026-11-02.md).  
**Objetivo:** solo diagnóstico verificable para decidir implementación; **NO CAMBIAR FUNCIONALIDAD NI MIGRAR SQL** sin autorización explícita posterior.

## 1. Lo que pidió el cliente

CASA MINGO solicitó: **«Si es posible que limite hasta 21 líneas solamente»** para la Nueva factura. Hay tres conceptos distintos y obligatorios:

- **4 filas visibles** y scroll vertical de la tabla desde el quinto producto = PRO-331, ya auditada en código; no es límite de factura.
- **21 líneas como posible tope POR EMPRESA** = PRO-339, condicional, requiere comprobar mecanismo técnico y decisión de negocio antes de programar.
- **999 líneas** es el máximo general actualmente definido en `lib/facturacion/payload-fe.ts` y validado en emisión; **PROHIBIDO** sustituirlo globalmente por 21 o afectar otras empresas.

No confundir 21 con 23 ítems fiscales, con límites de impresión o con cantidad visual del KuDE. No adoptar regla fiscal nueva por inferencia.

## 2. Trabajo autorizado AHORA: solo leer, verificar arquitectura y reportar

1. Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, la orden maestra CASA MINGO y PRO-339. Leer **cada archivo COMPLETO, ACTUAL, UNO POR VEZ**, desde la branch `feature/NEXIT-2026-001-banco-demo`. Identificar HEAD y rutas reales; no basarse en resúmenes ni ZIP/commits viejos.
2. Rastrear de manera completa cómo se determina la **empresa autenticada** (sin hardcodear nombre, UUID/RUC o inventar empresa) y si ya existe tabla/columna/configuración por tenant para `max_lineas`/límites comerciales configurables. Distinguir datos reales verificados del esquema versionado frente a migraciones todavía no aplicadas. No consultar BD real.
3. Trazar los **dos caminos de validación**: frontend de Nueva factura (alta rápida/lector/selector avanzado/duplicado SKU, eliminación, re-edición), y backend/API de emisión que valida antes de guardar o consumir numeración fiscal. Verificar que un eventual máximo por empresa no se pueda eludir por API, lotes, reintentos o segunda pestaña. Revisar solo para conocimiento la serialización fiscal, NCE y documentos históricos; no modificarlos.
4. Explicar dónde aplicar 21 **solo a CASA MINGO** si ya existe contrato/configuración por empresa. Si NO existe, diseñar la menor ampliación posible a futuro (schema/migration incremental, defaults, API, ACL y compatibilidad), pero **no crear migraciones ni escribir código aún**. Prohibido inventar identificadores o credenciales de producción.
5. Proponer comportamiento de borde: línea 21 permitida, línea 22 bloqueada con mensaje y sin perder campos; eliminar una y volver a 21 permitido; reingresar SKU existente sólo aumenta cantidad, no cuenta como línea adicional. Las otras empresas mantienen 999 o su política vigente. No cambiar los datos de una FE histórica con >21 líneas.
6. Reportar impactos y riesgos en scanner, IVA, descuentos, stock, idempotencia, KuDE, FE/NCE, SIFEN, límites de payload y Sucursal/empresa. **No editar ninguno** en diagnóstico.

## 3. Entregable obligatorio de Claude y parada

Presentar en la thread **un informe técnico de viabilidad** con:
- listado de rutas COMPLETAS verificadas y sus funciones relevantes;
- mapa de cómo fluye el límite actual 999 desde UI a backend;
- evidencia de si existe o falta mecanismo seguro de configuración por empresa;
- 2 opciones si hace falta infraestructura (mínima incremental vs alternativa de configuración), con ventajas, dependencias y riesgos;
- propuesta de criterios de aceptación 0/1/4/5/20/21/22, SKU duplicado, otras empresas y FE histórica >21;
- pregunta de decisión concreta a PROCEIT (activar 21 para CASA MINGO por política existente, autorizar migration incremental, o posponer), **sin inferir la respuesta**;
- confirmación expresa de **CERO archivos funcionales modificados, CERO tests/SQL/VM/deploy ejecutados**.

**PARAR para auditoría/decisión ChatGPT y responsable** al entregar el diagnóstico. **No hacer commit de implementación**, no crear migration, no cambiar `MAX_LINEAS=999`, no empezar otra issue. Si fuese necesaria nueva orden de desarrollo, la redactaremos después de verificar el diagnóstico.

## 4. Restricciones operacionales heredadas

Prohibido ejecutar tests/runner, lint, typecheck, build, CI manual, SQL, PostgreSQL real, migraciones, Docker/VM, gateway real, navegador del cliente y deploy. La lectura de código y la revisión estática son autorizadas. PRO-334 sigue `In Review` y no está homologada en navegador; PRO-298/336 se gestionan con proveedor y PRO-338 tiene gates NEX-077.
