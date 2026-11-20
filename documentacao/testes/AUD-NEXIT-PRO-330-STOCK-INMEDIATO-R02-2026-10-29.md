# AUD-NEXIT-PRO-330-R02 — Auditoría independiente del correctivo R01-F001 (stock inmediato)

**Fecha:** 29/10/2026 · **Auditor:** ChatGPT · **Desarrollador:** Claude.  
**Commit correctivo:** [`da4a02ed098cc40993b3af5a6a35f0228214637e`](https://github.com/proceit-tech/distribuidora/commit/da4a02ed098cc40993b3af5a6a35f0228214637e).  
**Commit funcional anterior:** [`2b54b468359c00df4726bc55b592bc9d9d5fff18`](https://github.com/proceit-tech/distribuidora/commit/2b54b468359c00df4726bc55b592bc9d9d5fff18).  
**Issue:** [PRO-330](https://linear.app/proceit/issue/PRO-330) · **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Origen:** [AUD-R01, F-001 ALTA](AUD-NEXIT-PRO-330-STOCK-INMEDIATO-R01-2026-10-29.md). **Orden correctiva ejecutada por Claude:** [ORD R01-F001](../ordens/ORD-CLAUDE-NEXIT-PRO-330-R01-F001-LOTE-500-PREVIA-2026-10-29.md).

## 1. Dictamen

**F-001 CORREGIDO POR INSPECCIÓN ESTÁTICA. PRO-330 CONFORME ESTÁTICAMENTE, NO PROBADA NI HOMOLOGADA. No se requiere otro correctivo sin defecto nuevo comprobado.**

Se verificaron directamente el diff completo de la entrega correctiva, `stock-fe.ts`, los 71 casos escritos en `stock-preventivo.casos.ts`, la API anterior y los contratos SQL de `NEX-067`. **Ninguno de los casos fue ejecutado.** Este parecer no certifica que pasen tests, typecheck, build o consultas a PostgreSQL; únicamente verifica la coherencia del código revisado.

## 2. Alcance y revisión del commit

**Solo dos archivos cambiaron:**
1. `lib/facturacion/stock-fe.ts`: en `planificarStock` la lectura de disponibilidad cambia de `consultarDisponibilidad(..., [...new Set(...)])` por `consultarDisponibilidadEnLotes(..., controladas.map(...))`. La función de lotes, añadida en la entrega R01, aplica `new Set` ANTES de dividir en tandas de tamaño máximo 500; ejecuta la misma función SQL `fe_stock_disponibilidad` secuencialmente. `planificarStock` conserva el retorno vacío para servicios, `asignarStock(lineas, saldos)`, su firma y su contrato.
2. `lib/facturacion/stock-preventivo.casos.ts`: actualiza la aserción estructural PRO330-55 para la nueva lectura y añade ocho casos lógicos PRO330-64..71. El runner `stock-e02.casos.ts` ya incluía `verificarCasosStockPreventivo()` desde la entrega original; no fue alterado aquí.

**Ningún otro archivo de aplicación, API, FE, NCE, KuDE, SQL, migration, configuración, Git o código fiscal se modificó en el correctivo**; no hay modificación de `NEX-067` o de `NEX-076`.

## 3. Matriz de verificación R02

| Requisito | Evidencia revisada | Dictamen |
|---|---|---|
| F-001 / 501 UUID distintos | `planificarStock` llama ahora `consultarDisponibilidadEnLotes`; este helper deduplica UUID y reparte 500+1. Contrato NEX-067 retorna vacío solo si **una llamada individual** incluye >500 UUID. | **CORREGIDO ESTÁTICAMENTE** |
| 501 suficientes | Caso PRO330-64,65: simula dos llamadas 500 y 1, 501 líneas en plan, 501 salidas, `suficiente=true`, huella hex SHA-256. | Escrito, no ejecutado |
| 501 con 1 falta real | Caso PRO330-66: el último UUID requiere 3, dispone 2, falta 1; `suficiente=false`; 500 salidas válidas y 1 déficit. | Escrito, no ejecutado |
| Mismo UUID duplicado y servicio | PRO330-67 agrupa 1+2 y excluye servicio de la consulta; PRO330-68 valida 500 controlados + 3 sin control en una llamada; PRO330-69 prueba solo servicios sin consulta. | Escrito, no ejecutado |
| Algoritmo, secuencia, huella | PRO330-70,71 compara plan normal pequeño con `asignarStock` y `huellaReparto`; mantiene orden depósito A→B, reparto 3+3. | Sin cambio funcional en cálculo |
| Prevención visible | Commit original conserva estado asíncrono por versión/firma, visualización en línea, bloqueo de revisión durante falta/error; R02 no cambió UI ni API. | Conforme estático R01, sin nueva modificación |
| Revisión y emisión | `/api/facturas/previa` y `crearFacturaElectronica` mantienen llamadas al mismo `planificarStock`; el cambio de lectura beneficia ambas sin alterar `repartoHuella`, `asignacionesSql` ni función SQL de baja. | Conforme estático |
| Permisos y depósitos | `fe_stock_disponibilidad` sigue filtrando permiso CREAR, alcance, depósitos activos, stock DISPONIBLE/PROPIO; función SQL no alterada. | Conforme diseño; no probado en DB |
| Alcance del commit | Dos archivos permitidos por la orden correctiva; sin código de otras issues ni migrations. | Conforme |

**Total verificado de casos PRO330 numerados en fuente:** 71 identificadores únicos `01–71` sin saltos, ocho nuevos respecto de R01. Conteo **no equivale a ejecución** ni a cobertura dinámica.

## 4. Riesgos, limitaciones y próximos pasos

- **0 tests, 0 lint, 0 typecheck, 0 build, 0 migraciones, 0 SQL real, 0 conexión VM, 0 gateway, 0 navegador, 0 FE real y 0 despliegues en estas entregas.** Persisten riesgos no verificados de tipado, dependencia de funciones/roles instalados, prestaciones y concurrencia hasta pruebas autorizadas.
- La lectura de saldos en lotes es referencial: entre llamadas o entre previa y emisión puede variar el stock por actividad concurrente. La base sigue revalidando el reparto bajo bloqueo y rechaza diferencias; **no se promete disponibilidad garantizada** ni movimiento exitoso por el aviso verde.
- Antes de llamar esta funcionalidad operativa: ejecutar de forma autorizada los casos focales y typecheck/build, comprobar `fe_stock_disponibilidad` y el registro de stock en el único banco real, ensayar casos 2/3, 501 con suficiencia e insuficiencia, servicios, cambio sucursal y sesiones/depósitos restringidos, verificar `repartoHuella` y reversión segura.
- **PRO-328 permanece `In Review` con `NEX-076` solamente versionada y NO aplicada.** El aviso temprano no elimina el bloqueo 422 que protege el uso de dirección seleccionada en FE nuevas cuando falta NEX-076.
- **No volver a ejecutar SQL de 561 productos de PRO-327**; esa corrección histórica tiene COMMIT y poscheck real. La UI/API de alta de códigos alfanuméricos sigue pendiente/pausada.
- Claude **terminó R01-F001** y debe quedar **SIN orden activa** hasta nueva orden expresa del ChatGPT; no iniciar automáticamente PRO-333/331/332/334/335, despliegue ni migration.

**Decisión de gestión:** mantener [PRO-330](https://linear.app/proceit/issue/PRO-330) en **In Review**, con F-001 cerrada en auditoría estática; **NO marcar Done**. Liberación de siguiente orden de código y puesta en producción requieren decisiones separadas. El único dictamen actual es **CONFORME ESTÁTICAMENTE / PENDIENTE DE VALIDACIÓN EJECUTADA**.
