# AUDITORÍA INDEPENDIENTE CHATGPT — PRO-342-R03-01 / CDC OBLIGATORIO DEL XML FIRMADO

**Fecha:** 11/11/2026
**Commit funcional auditado:** `baa419492933650ed079230d9b01303e4aee4bd0`
**Repo/rama:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`
**Analista:** ChatGPT (sistemas/negocio). **Desarrollador:** Claude.
**Fuente de negocio vinculante:** [PRO-342 — especificación rectificada](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Contexto:** el responsable corrigió el análisis anterior: **un XML efectivamente firmado por este gateway tiene CDC**. No es válido consolidar `Aprobado`/`Rechazado` con CDC del documento NULL. `XML firmado` sigue siendo fase intermedia, NO decisión SIFEN.
**Método:** lectura estática del commit (7 archivos), trazas de producción `gateway.ts`, `estados.ts`, `reconciliacion.ts`, `shared.ts`, worker `consulta-automatica.ts`, SQL NEX-079, y casos `flujo-fiscal-pro342`, `fat-e2`, `consulta-automatica-fe`, `cdc-inmutable-r03`. **Ningún caso fue ejecutado. 0 tests, 0 lint/build/typecheck, 0 SQL/migration, 0 VM/gateway, 0 emisión/reenvío, 0 deploy.**

## DICTAMEN

**PRO-342-R03-01 CONFORME EN AUDITORÍA ESTÁTICA DEL ALCANCE SOLICITADO.**

La implementación vuelve a exigir un CDC **informado por la API y perteneciente al documento consultado** para consolidar estados finales; `XML firmado` sin CDC disponible no se confirma. El flujo de reconsulta y los ajustes R03-02/R03-03 se preservan. **La aprobación estática NO prueba ejecución real, compatibilidad operacional ni disponibilidad del KuDE del proveedor. No autoriza deploy.**

## 1. Código examinado y comprobaciones

### A. `lib/facturacion/reconciliacion.ts` — BLOQUEO ANTES DE LA PERSISTENCIA FISCAL

- `decidirConsulta` devuelve intactos los errores previos y protege estado fiscal final ya registrado frente a retrocesos y contradicciones.
- Calcula `sinCdc = r.cdc === null && doc.cdc === null`. Si la API informa estado final `APROBADO/RECHAZADO` (y las evoluciones históricas `CANCELADO/INUTILIZADO`) sin CDC disponible, transforma esa respuesta a `RESPUESTA_INVALIDA`, `estadoSifen=null`, registra el mensaje de inconsistencia, sin inventar CDC.
- Si la API informa `XML firmado` y no existe CDC en la respuesta ni previamente registrado para ese documento, transforma la consulta en `RESPUESTA_INVALIDA`, sin consolidar `PENDIENTE` como firma comprobada.
- `XML firmado` con CDC real se acepta como estado `PENDIENTE` **intermedio**, y se mantiene el seguimiento. Un resultado final posterior puede omitir el CDC en esa respuesta, siempre que el MISMO documento ya tenga su CDC original. La firma no necesita producir un CDC nuevo en cada consulta.
- Si la respuesta trae CDC de documento ajeno, sigue su camino a la guarda SQL existente `CDC_DIVERGENTE`; el dato fiscal del documento no se sobrescribe. Un CDC malformado en respuesta final continúa siendo `RESPUESTA_INVALIDA` desde el parser.
- `esFaseXmlFirmado` es la misma función normalizadora exacta que identifica `XML firmado` en `estados.ts`, evitando divergencia de criterios por mayúsculas/minúsculas o acentos.

### B. `lib/facturacion/shared.ts` y `consulta-automatica.ts` — MISMA REGLA PARA MANUAL/NCE/AUTO

- `consultarEstado` invoca `decidirConsulta(..., bruto)` ANTES de seleccionar y ejecutar `fe_documento_registrar_consulta`, `fe_documento_registrar_consulta_flujo_nce` o `fe_documento_registrar_consulta_auto`. Así, las tres vías usan la misma validación de CDC, incluso con firma legacy NEX-054.
- **Precisión:** «bloquear antes del SQL» significa **no enviar un estado fiscal final aceptado al SQL**; sí se llama SQL para registrar la tentativa como `RESPUESTA_INVALIDA` y conservar la evidencia. No debe interpretarse como «no ejecutar ninguna sentencia SQL», pues eso perdería historial.
- Las consultas manuales y automáticas conservan el CDC exacto de la API cuando ésta lo informa. No hay nueva transmisión `recepcion_de` durante la reconsulta.
- La consulta automática reserva sólo documentos sin resultado definitivo y reprograma tras respuestas intermedias/inválidas usando NEX-077 y lease/token existentes; un `XML firmado` sin CDC disponible deja al documento elegible para nuevas consultas, sin declararlo `APROBADO`/`RECHAZADO`.

### C. NEX-079 versionada (NO aplicada)

- `fe_documento_registrar_consulta_nucleo` revierte la guarda R03 anterior: un estado definitivo sólo se acepta si `coalesce(p_cdc,d.cdc)` **NO ES NULL** y `fe_cdc_coherente` lo acepta; si es NULL o incoherente, el intento queda `RESPUESTA_INVALIDA`, sin modificar estado fiscal del documento.
- Sigue protegiendo `CDC_DIVERGENTE`, el CDC previamente registrado (inmutable), respuesta bruta, código/mensaje, permisos/alcance y lease de NEX-077.
- La protección `XML firmado sin CDC disponible` está en TypeScript para las tres vías, pero NO es una nueva guarda SQL independiente en NEX-079; eso coincide con la orden aprobada de corrección focal. No afirmar integridad DB contra invocaciones directas fuera de la app para esa condición.
- NEX-054 legacy carece de guarda propia contra final sin CDC; **la protección de la aplicación impide pasar tal respuesta como OK**, mientras NEX-062/NEX-077 legacy ya exigen CDC. Sin NEX-079, el histórico manual sigue sin `cdc_informado` estructurado y sin snapshot de conexión.
- **La migration no se ha aplicado**, y la presencia real de NEX-077/NEX-078/NEX-079 en VM sigue sin verificarse.

## 2. Casos de regresión — ESCRITOS, NO EJECUTADOS

| Grupo | Criterio comprobado estaticamente en código de casos |
|---|---|
| `PRO342-R03-F01/F02` | XML firmado sin CDC disponible = intento `RESPUESTA_INVALIDA`, seguimiento posterior; luego XML firmado con CDC exacto = PENDIENTE y CDC persistido. |
| `PRO342-R03-F03/F04` | XML firmado + CDC → reconsulta → Aprobado/Rechazado final SIN repetir CDC, pero CDC original sigue registrado; worker deja de reservar después del final. |
| `PRO342-R03-F05` | Final con CDC ausente en respuesta Y registro = `RESPUESTA_INVALIDA` tanto en modo NEX-079 como en compatibilidad NEX-054; se registra intento, no estado final. |
| `PRO342-R03-F06/F07/F08` | CDC ajeno, divergente o malformado; HTTP200 sin estado; contradicción de estado final previo: no consolidar resultado inválido. |
| `PRO342-R03-F09/F10/F11` | Función pura, condición versionada NEX-079 y fuente de reconciliación sin cálculo/creación de CDC. |
| Regressiones antiguas | `PRO342-06c`, `P338-10`, `T-E2-10/12` y `R03-14` vuelven a exigir `RESPUESTA_INVALIDA` cuando final no tiene CDC disponible. |

**Advertencia de cobertura:** los casos usan mocks y comprobaciones estáticas de texto/SQL; no demuestran que la migration compiló/aplicó en PostgreSQL, que los tests pasan realmente ni que el gateway del proveedor entregó una respuesta concreta. Es la siguiente etapa de homologación, bajo autorización expresa.

## 3. Lo que NO debe reabrirse ni alterarse

- **R03-02**: continuidad de conexión versionada: `ENTORNO` se trata `SIN_REFERENCIA`, no certeza `MISMA`; cambios de host/ref/version dan 409.
- **R03-03**: lote operacional sólo con ACK `ENVIADO` correlacionado; en respuestas indeterminadas no se atribuye lote, ni se reenvía automáticamente.
- `XML firmado` no es aprobación; las consultas repetidas del MISMO documento y su historial permanecen.
- KuDE habilitado no significa resultado final; el PDF sin prueba de titularidad se presenta `NO-VERIFICADO`, riesgo histórico del contrato proveedor no resuelto por este ajuste. No inventar OCR ni validación fiscal adicional.
- NEX-079 sigue sólo versionada; no editar migrations históricas ni modificar datos fiscales previos.

## 4. Riesgos operacionales ANTERIORES Y GATE DE PRODUCCIÓN

1. **Implementación DB/VM:** SHA realmente instalado, NEX-077 y NEX-078 y presencia/ausencia NEX-079 en DB aún no comprobados; homologación integral depende de la migration versionada correspondiente y validación de schema antes de deploy.
2. **KuDE sin titularidad probada:** `NO-VERIFICADO` es advertencia, no prueba del emisor. Relación PDF/cuenta/serie y ambiente debe confirmarse con proveedor si el uso es fiscal real.
3. **`ENTORNO` sin prueba de continuidad:** `SIN_REFERENCIA` informa incertidumbre y no bloquea todas las consultas; verificar configuración/credenciales con procedimiento autorizado antes de producir.
4. **Pruebas necesarias, no autorizadas:** unit/integración con mocks reales, PostgreSQL descartable, migración + reversión, comportamiento concurrente de worker, respuestas del proveedor, UAT de la UI. Ninguna ejecución fue autorizada ni realizada.
5. **No reenviar ni modificar** JSON, CDC, lote, factura o historia de CASA MINGO. La investigación operacional del incidente sigue siendo separada de la conformidad estática.

## 5. Decisión del analista

**APROBAR la corrección focal PRO-342-R03-01 EN CÓDIGO VERSIONADO (ESTÁTICO)**. Los 7 archivos fueron inspeccionados con la especificación vigente; no surge defecto nuevo confirmado que justifique otra ronda de cambios de código. La fase siguiente es obtener aprobación de pruebas/verificación de schema y resultado con proveedor, no iniciar R04 ni desbloquear PRO-340.

**PRO-342 permanece P0 en `In Review`; aún NO está homologada ni autorizada a producción.** Claude debe PARAR sin nuevas modificaciones ni ejecuciones hasta indicación expresa.
