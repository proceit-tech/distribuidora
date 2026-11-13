# AUD-NEXIT-PRO-338-R01 — Consulta automática FE y estados fiscales

**Fecha:** 29/10/2026  
**Commit auditado:** [373fe580b5fbd4f8c3b60a059e47f1ae1d6e8dee](https://github.com/proceit-tech/distribuidora/commit/373fe580b5fbd4f8c3b60a059e47f1ae1d6e8dee)  
**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)  
**Veredicto:** **NO CONFORME R01 (1 bloqueante de concurrencia + 2 ajustes de coherencia/observabilidad)**. La solución principal está presente estáticamente, sin evidencia de ejecución y sin homologación.

## 1. Alcance exacto revisado

El commit modifica **8 archivos** (la comunicación del implementador informó 7):

1. `app/(private)/documentos/page.module.css`
2. `app/(private)/documentos/page.tsx`
3. `lib/facturacion/consulta-automatica-fe.casos.ts` (nuevo, 20 grupos P338-01..20)
4. `lib/facturacion/consulta-automatica.ts`
5. `lib/facturacion/facturacion.casos.ts`
6. `lib/facturacion/nce.casos.ts`
7. `lib/facturacion/presentacion-sifen.ts` (nuevo)
8. `lib/facturacion/shared.ts`

También se inspeccionaron (sin alterar) `instrumentation.ts`, `lib/facturacion/reconciliacion.ts`, `lib/facturacion/gateway.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql`, `app/api/documentos/[id]/consultar/route.ts`, `app.compose.yml` y `Dockerfile`.

**Cero pruebas ejecutadas** (también cero lint, typecheck, build, SQL, PostgreSQL, VM, Docker, gateway real, navegador y deploy). Los casos nuevos no están en el runner; P338-03/P338-16 verifican patrones SQL como texto, no demuestran concurrencia real ni recuperación de procesos.

## 2. Conformidades estáticas

- `consulta-automatica.ts:26` amplía `TIPOS_CONSULTA_AUTOMATICA` a `["NCE","FE"]`; `:68` usa `consultarEstado(..., { flujoNce:true })` para ambos tipos. La función SQL NEX-062 `fe_documento_registrar_consulta_flujo_nce` admite FE/NCE pendientes y protege estado final y CDC. El nombre `flujo_nce` es histórico, no prueba por sí solo falta de FE.
- `instrumentation.ts:3–9` llama al planificador en Node, sin navegador. `Dockerfile` construye Next standalone bajo Node. **Eso no prueba que el proceso real esté levantado ni que la migration exista.**
- `reconciliacion.ts:19–35` y NEX-062 `:544–576` evitan asignar RECHAZADO al documento por respuesta de CDC incoherente; se guarda `CDC_DIVERGENTE` y no se modifica `estado_sifen`.
- `presentacion-sifen.ts:20–34`: estado fiscal persistido APROBADO verde, RECHAZADO rojo; enviado/indeterminado sin final amarillo; sin transmisión gris; cancelado/inutilizado independientes. `:37–55` muestra anomalía técnica de última consulta separada. La página usa cápsulas accesibles; no colorea la fila ni altera visual FE/NCE de PRO-334.
- Consulta manual `POST /api/documentos/[id]/consultar`, KuDE, email, historial E01/E02 y estados independientes continúan en sus lugares. `lib/facturacion/shared.ts` solo amplía `requiereRevision` a FE; no altera el fiscal persistido ni el stock.

## 3. Hallazgos

### R01-F001 — ALTA / BLOQUEANTE: lease de lote puede vencer antes de consumirlo

**Código:** `consulta-automatica.ts:48–89` reserva hasta 10 documentos de una vez (`limite ?? 10`) con lease 120 s (`leaseSegundos ?? 120`) y procesa secuencialmente TODOS. `gateway.ts:35–44,186–188,315–333` permite `timeoutMs` hasta **60 s por petición**; consulta puede requerir login y luego llamada `/api/consulta_de`. Un documento posterior del lote puede empezar cuando su lease ya haya expirado, permitiendo a otro worker adquirirlo. `NEX-062:415–445` fija lease solo al reservar; `:448–453` programa/libera el lease **sin comprobar la propiedad de reserva / generación**. Un worker tardío puede liberar el lease de otro.

Esto **ya es una limitación heredada de NCE**, no un bug introducido ex nihilo por el SHA, pero la expansión automática a FE aumenta el alcance y **contradice explícitamente P338-03**. `FOR UPDATE SKIP LOCKED` protege la reserva simultánea inicial, **no** un lease expirado antes del procesamiento. Los casos fuente P338-03/P338-16 sólo buscan regex; no reproducen dos workers o timeouts.

**Exigir R02:** estrategia de reserva/renovación/fencing que cubra el tiempo máximo de consulta por documento y evite que un worker tardío programe/libere un lease ajeno. Considerar la forma mínima compatible con el esquema vigente (p.ej. reservar justo antes de consultar, limitar lote efectivo, lease suficiente y/o token de pertenencia/versión) tras revisar SQL; no fijar solución por intuición. Pruebas dirigidas **escritas, NO ejecutadas**: 2 workers, primer intento lento, token/login expiran, reserva vencida, respuesta tardía, reprogramación obsoleta, terminal concurrente. No efectuar retransmisión fiscal ni SQL operativo.

### R01-F002 — MEDIA: KPI «Pendientes de respuesta» no coincide con el badge amarillo

**Código:** `presentacion-sifen.ts:17–29` muestra amarillo para `ENVIADO` o `ENVIO_INDETERMINADO` cuando estado fiscal `SIN_CONSULTA`, `PENDIENTE` o `NO_RECONOCIDO`. Sin embargo, `shared.ts:55–62` define `SQL_GRUPO.PEND_RESPUESTA` solamente `estado_local='ENVIADO' AND estado_sifen IN ('SIN_CONSULTA','PENDIENTE')`. Por tanto FE con `ENVIO_INDETERMINADO` y/o `NO_RECONOCIDO` aparece amarilla, pero **no figura en el indicador/filtro Pendientes de respuesta**.

**Exigir R02:** alinear el indicador, agrupación y etiqueta con el conjunto operativo de documentos amarillos, o separar explícitamente `Envío indeterminado` en categoría coherente sin invisibilizarlo. Mantener independientes los contadores de estados fiscales finales y no contar `CDC_DIVERGENTE` como rechazado. Documentar expresamente clasificación y casos P338-17 para ambas combinaciones.

### R01-F003 — MEDIA: CDC informado de la consulta no queda en columna estructurada; título de mensaje induce a error

**Código:** `shared.ts:233–239` selecciona `i.cdc_informado AS "cdcInformado"` para historial. Pero NEX-062 `fe_documento_registrar_consulta_flujo_nce` `:557–559` **no inserta `cdc_informado`**, aunque la llamada recibe `p_cdc`. Por eso en el flujo automático, incluso con `CDC_DIVERGENTE`, la columna `CDC informado` de cada intento podría seguir vacía. El JSON saneado de respuesta sí se almacena y puede contener el CDC; se conserva esa evidencia, pero no está indexada en esa columna. Los casos P338-09/P338-10 usan base simulada y expresiones de texto, no lo prueban en PostgreSQL.

Adicionalmente `page.tsx` muestra **«Último mensaje SIFEN»** desde `d.mensajeRespuesta`, pero la SQL NEX-062 `:561–575` actualiza `mensaje_respuesta` sólo al resultado `OK`; cuando el intento más reciente es `CDC_DIVERGENTE`/error, el título puede mostrar un mensaje antiguo de éxito mientras el historial reciente registra el problema (exactamente la confusión de la captura).

**Exigir R02:** distinguir texto de **última respuesta fiscal válida** de **última consulta técnica** (texto, fecha, código y CDC) sin sustituir ni fingir historia. Si para mostrar `cdc_informado` hace falta modificar SQL ya aplicado, **no reescribir NEX-062**: crear migration incremental versionada, no aplicada, y declarar dependencia antes de mostrar el campo como confiable. Como alternativa, usar datos reales ya disponibles y saneados, manteniendo la fuente indicada. Agregar caso de error tardío después de OK.

## 4. Condiciones obligatorias de activación / no homologación

- **NEX-062 en base real NO VERIFICADA.** Debe existir `fe_consulta_reservar`, `fe_consulta_programar`, `fe_documento_registrar_consulta_flujo_nce` y las columnas `proxima_consulta_at`, `consulta_lease_hasta`, `consultas_auto`; verificar `schema_migrations`, firmas, grants y versión efectiva con respaldo/operador autorizado antes de activación. **No aplicar nada por esta auditoría.**
- Verificar en runtime real que `instrumentation.register()` se carga una vez por proceso, `NEXIT_CONSULTA_AUTOMATICA` no es `0`, `DATABASE_URL` disponible, `DEMO_MODE` desactivado y proceso Node estable. El código solo no demuestra que ejecutó una consulta.
- Confirmar comportamiento por empresa, actor autorizado, timeout/rate-limit y estados fiscales sin retransmitir. E03-A1/NEX-072 no está homologada; no expandir el trabajo a stock/reembolso/reemisión. Las bajas de stock al aprobar SIFEN siguen sujetas a PRO-310/309.
- La prueba visual real (sidebar, mobile, zoom, estados) requiere autorización/entorno; no confundir CSS versionado con capturas posteriores.
- No declarar `Done`, `APROBADO en producción`, ni automatización operativa por el SHA de código. PRO-338 queda en revisión con R02 pendiente.

## 5. Próxima orden recomendada

Corregir **sólo F001–F003**, conservando lógica fiscal, separación de estados, badges ya conformes, consulta manual, NCE, KuDE y versiones; **sin ejecutar** pruebas, lint, typecheck, build, SQL, VM, Docker, gateway ni despliegue. Commit+push SHA completo y PARAR para auditoría independiente R02. La dependencia de NEX-062 y validación de runtime seguirá como gate humano posterior.
