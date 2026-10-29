# AUD-NEXIT-PRO-330-R01 — Auditoría independiente del aviso temprano de stock en Nueva factura

**Fecha:** 29/10/2026 · **Auditor:** ChatGPT · **Desarrollador:** Claude.  
**Commit auditado:** [`2b54b468359c00df4726bc55b592bc9d9d5fff18`](https://github.com/proceit-tech/distribuidora/commit/2b54b468359c00df4726bc55b592bc9d9d5fff18) (7 archivos).  
**Issue:** [PRO-330](https://linear.app/proceit/issue/PRO-330) · **requisito:** [REQ-PRO-330](../definicoes/REQ-NEXIT-CM-PRO-330-STOCK-AL-CARGAR-LINEA-2026-10-29.md) · **orden:** [ORD-PRO-330](../ordens/ORD-CLAUDE-NEXIT-CM-PRO-330-STOCK-INMEDIATO-2026-10-29.md).  
**Método:** lectura integral del código incorporado, diff del commit, pruebas escritas, módulo existente de emisión/previsión y contrato SQL `NEX-067`. **No se ejecutaron tests, lint, typecheck, build, SQL, VM, gateway, navegador ni deploy.** Los casos por escrito NO equivalen a pruebas aprobadas.

## 1. Dictamen

**PARCIALMENTE CONFORME ESTÁTICAMENTE. UN HALLAZGO ALTO F-001 ABIERTO. CORRECCIÓN FOCAL REQUERIDA ANTES DE APROBAR TÉCNICAMENTE.**

El aviso temprano utiliza adecuadamente el motor ya existente en modo solo lectura y controla respuestas tardías. El cambio presenta, sin embargo, **una divergencia demostrada por código entre disponibilidad preventiva y la previa/emisión para más de 500 SKU distintos**. La orden de implementación había exigido no tocar `planificarStock` y simultáneamente aceptar hasta 999 líneas, lo que dejó un contrato incompatible preexistente sin resolver. La corrección de esta contradicción funcional corresponde al analista ChatGPT; Claude solo modifica el alcance autorizado en el correctivo F-001.

**No existe autorización para desplegar la PRO-330, aplicar SQL o liberar la PRO-333.**

## 2. Evidencia de entrega y matriz de aceptación estática

| Requisito | Evidencia comprobada | Estado |
|---|---|---|
| RN-01, CA-01 alta/incremento/edición/sucursal | `page.tsx` deriva `borradorStock` de estado vivo, efecto usa firma; aviso por línea; controller tiene debounce 200ms | Conforme estático |
| RN-02/RN-04, CA-02/09 misma fuente de stock | `route.ts` invoca `consultarDisponibilidadEnLotes` y `evaluarDisponibilidadPreventiva`; NEX-067 selecciona `DISPONIBLE/PROPIO`, depósitos de sucursal autorizados | Conforme estático |
| RN-03/RN-10, CA-08 seguridad | `prepararFacturacion("CREAR")`; empresa y usuario salen de sesión; DB valida sucursal, IDs, tipo, venta/actividad; respuesta sin depósito/lote/costo; `no-store` | Conforme estático; roles reales no probados |
| RN-05, CA-07 servicios sin control | `controlaStock` proviene de catálogo (UI) y de tabla (API); `SIN_CONTROL` sin consulta, `disponible/faltante=null` | Conforme estático |
| RN-06, CA-03/04 decimales y UUID duplicado | `cantidadCanonica`, `parseDec/textoDec`, `asignarStock` agrega cantidad por UUID; no `Number` en aritmética | Conforme estático |
| RN-07/RN-09, CA-01/12 aviso y bloqueo | `AvisoStockLinea` diferenciado (error, verificación, insuficiente), `vista.pendiente` en `faltan`, botón `Revisar y confirmar` deshabilitado | Conforme estático |
| RN-08, CA-05/06 carreras | `crearVerificadorStock` usa AbortController, versión monotónica y firma sucursal/cliente/UUID/cantidad; `vistaStock` vuelve a cotejar borrador actual | Conforme estático |
| RN-10, CA-10 límite 500/999, extremo a extremo | Endpoint nuevo divide 501 en 500+1, **pero previa/emisión siguen invocando la función SQL con 501 UUID en una sola llamada** | **NO CONFORME — F-001 ALTA** |
| RN-11, CA-11 no alterar circuito fiscal/stock | `/api/facturas/previa` y SQL NEX-067 no fueron modificados; `repartoHuella` y baja siguen con validación | Conforme en diff; cambio focal de invocación requerido F-001 |
| RN-12, CA-13 aislamiento | 7 archivos focales, sin cambios a PRO-328/NEX-076, PRO-327, KuDE, NCE, migrations, inventario ni certificados | Conforme en diff |
| Pruebas (63 casos) | `stock-preventivo.casos.ts` contiene 63 identificadores `PRO330-01..63`, incorporados al runner `stock-e02.casos.ts`; mezclan mocks puros y aserciones estructurales | Escritos, **0 ejecutados**, ninguno verifica `planificarStock` con 501 UUID |

## 3. Hallazgos

### F-001 · ALTA · Inconsistencia del límite 500 entre consulta preventiva y previa/emisión

**Evidencia reproducible en código (no ejecutada):**
1. `documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql` función `fe_stock_disponibilidad`: ante `cardinality(p_productos) > 500` hace `RETURN` silencioso, sin ninguna fila de saldo.
2. `lib/facturacion/stock-fe.ts::consultarDisponibilidadEnLotes` (nuevo PRO-330) divide correctamente la lista de 501 UUID en 500+1 para la consulta anticipada.
3. **`lib/facturacion/stock-fe.ts::planificarStock` (inalterado)** sigue llamando directamente `consultarDisponibilidad(db, ..., [...new Set(controladas.map(...))])` **sin dividir**. Lo invocan tanto `app/api/facturas/previa/route.ts` como `lib/facturacion/emision.ts::crearFacturaElectronica`.
4. Consecuencia lógica: 501 productos con stock realmente suficiente ⇒ **aviso previo `SUFICIENTE`** gracias a lotes, pero `planificarStock` recibe cero saldos de NEX-067 ⇒ **409 STOCK INSUFICIENTE en revisión** (y mismo riesgo en emisión). No es un riesgo hipotético de concurrencia, sino dos rutas que manejan la misma lista de modo incompatible.

**Impacto:** bloquea FE con 501–999 SKU controlados distintos aunque existan saldos, violando RN-10/CA-10 y la coherencia del aviso solicitado por el cliente. No se demostró emisión errónea o movimiento indebido; la validación final permanece bloqueante.

**Corrección obligatoria EXACTA:**
- En `lib/facturacion/stock-fe.ts::planificarStock` cambiar **solo la obtención de saldos** para usar el `consultarDisponibilidadEnLotes` ya existente, pasando los UUID únicos de productos controlados; conservar el caso `controladas.length === 0`, `asignarStock`, `huellaReparto`, `asignacionesSql`, orden determinista de salidas, el formato y los mensajes actuales, la revalidación de `fe_stock_baja_documento` y todas las validaciones de `repartoHuella`.
- No agregar otra fórmula y NO modificar NEX-067, SQL, migraciones, reserva, numeração, estado fiscal, ni FE/NCE históricas.
- Agregar casos `PRO330-64+` al runner ya incorporado que simulen `planificarStock` con 501 productos únicos y saldos suficientes: comprobar 2 llamadas de 500+1; `plan.suficiente=true`, 501 productos, `salidas` válidas; con 501 y un saldo realmente insuficiente → insuficiente por causa real (no falsedad por lote); servicios no cuentan para el límite y productos repetidos usan un UUID. Mantener comparación de `huellaReparto` antes y después con un caso pequeño para prevenir regresión.
- **Archivos correctivos autorizados SOLO:** `lib/facturacion/stock-fe.ts`, `lib/facturacion/stock-e02.casos.ts` y `lib/facturacion/stock-preventivo.casos.ts` si es necesario. NO tocar UI, endpoint nuevo, PRO-328, NEX-076, CLAUDE.md, Linear, docs gerenciais ni otras issues.
- Casos escritos como código, **no ejecutar** tests/lint/typecheck/build/SQL/VM/Docker/gateway/deploy; commit/push SHA nuevo y **PARAR** para auditoría ChatGPT R02.

## 4. Límites del parecer y próximo gate

**63 casos escritos según reporte y fuente, 0 ejecutados; ninguna migración nueva añadida en el commit; NEX-076 de PRO-328 sigue versionada/no aplicada.** No declarar 10/10, Done, producción ni homologado. No liberar la próxima issue PRO-333/331/332/334/335 mientras F-001 siga abierto. Antes de cualquier operación real hacen falta revisión R02, comprobaciones autorizadas, verificación del único ambiente real y aceptación humana.

**Conclusión de R01: CORRECCIÓN SOLICITADA (F-001 ALTA) — no repetir PRO-330 desde cero, solo corregir el punto demostrado.**
