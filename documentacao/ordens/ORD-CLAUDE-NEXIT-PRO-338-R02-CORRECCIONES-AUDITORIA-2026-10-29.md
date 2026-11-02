# ORD-CLAUDE-NEXIT-PRO-338-R02 — Corregir únicamente los hallazgos de auditoría R01

**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)  
**Referencia implementada:** `373fe580b5fbd4f8c3b60a059e47f1ae1d6e8dee`  
**Auditoría vinculante:** [AUD-NEXIT-PRO-338-R01](../testes/AUD-NEXIT-PRO-338-CONSULTA-AUTOMATICA-R01-2026-10-29.md)  
**Estado:** correctivo R02 exclusivamente; sin autorización de despliegue.

## Orden

Leer de principio a fin la auditoría R01 y `CLAUDE.md`, la orden original, el código y el SQL real versionado. **No volver a implementar lo que ya está conforme**: FE/NCE en worker, badge fiscal de cinco tonos, alerta CDC_DIVERGENTE separada, manual POST, E01/E02, KuDE, permisos y el bloqueo de respuesta incoherente.

### F001 — ALTA, obligatoria

Corregir la estrategia de lease cuando se reservan hasta 10 documentos simultáneamente y se ejecutan consultas HTTP secuenciales, permitiendo hasta 60 s por llamada (login y consulta). Evitar que un documento de cola arranque tras vencer su lease, que un segundo worker lo adquiera en paralelo o que un worker obsoleto borre el lease de otro. Revisar las funciones NEX-062 `fe_consulta_reservar` / `fe_consulta_programar`, `ejecutarLote` y el contrato de timeout del gateway.

Se requiere **fencing/derecho de propiedad verificable de la reserva cuando sea pertinente**, y duración compatible con el peor caso de llamadas y retrasos; no confiar sólo en `FOR UPDATE SKIP LOCKED` ni en 120 s. Preservar NCE, ritmo hacia gateway, arranque Node e idempotencia. Cambios SQL sólo en migration **incremental nueva/versionada** si imprescindibles; no alterar ni reaplicar NEX-062 existente. Escribir pruebas dirigidas (NO ejecutarlas) que modelen **dos workers con lease caducado y reprogramación obsoleta**, no sólo regex de SQL. Si la solución requiere algo que no se puede garantizar en código sin migración o configuración runtime, reportarlo como gate, nunca dar falso «resuelto en producción».

### F002 — MEDIA

La clasificación visual amarilla `ENVIADO/ENVIO_INDETERMINADO + SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO` no coincide con `SQL_GRUPO.PEND_RESPUESTA` (solo `ENVIADO + SIN_CONSULTA/PENDIENTE`). Ajustar semántica KPI/filtro **con reglas explícitas**: ninguna FE amarilla debe desaparecer de los indicadores operativos sin estar en otra categoría inequívoca. Los totales de APROBADO/RECHAZADO se basan sólo en estado fiscal persistido, no en alertas técnicas. Preservar criterios de PEND_ENVIO y evitar doble contabilización no explicada si un documento corresponde a dos fases. Incluir casos de ambas combinaciones.

### F003 — MEDIA

La SQL NEX-062 `fe_documento_registrar_consulta_flujo_nce` **no inserta `cdc_informado` en `documento_electronico_intentos`**, aunque `listarIntentos` lo muestra. Asegurar información fiable del CDC que devuelve el gateway para diagnosticar `CDC_DIVERGENTE`, conservando JSON de respuesta original y cadena histórica. No modificar payload fiscal ni inventar CDC. Si requiere columna/captura mediante SQL, versionar migration nueva separada, no aplicarla y documentar su dependencia; no reescribir NEX-062. Si se puede reutilizar evidencia ya existente, indicar su fuente y no fingir que la columna está poblada.

Separar en la UI el mensaje de **última respuesta fiscal válida** (persistido en `mensaje_respuesta` sólo cuando resultado OK) del **último intento técnico de consulta**: el título `Último mensaje SIFEN` no puede sugerir que un mensaje antiguo corresponde a un intento CDC_DIVERGENTE reciente. Mostrar contexto de fallo, fecha, resultado y acceso al historial/JSON sin duplicar respuestas o revelar secretos. Escribir caso OK previo seguido de error de CDC/HTTP.

## Condiciones de preservación

- No cambiar los 13 tipos `iTipTra`, emisión FE/NCE, corrección/reenvío, numeración, valores fiscales, estados terminales, stock, reservas, KuDE, cabecera del proveedor, e-mail ni otros tickets PRO-337/334/310/312 global.
- No cerrar P01/P02/P05/P06/P07/P08 por presunción ni aplicar NEX-062/NEX-072 o migrations nuevas al banco. La verificación de schema real sigue exclusivamente a cargo de operador autorizado.
- Sólo los archivos estrictamente necesarios para los 3 hallazgos y casos dirigidos. No retocar CSS ni badges que ya cumplen, salvo necesidad demostrada F003.
- **NO EJECUTAR:** tests (ni casos dirigidos), lint, typecheck, build, CI manual, SQL, PostgreSQL, VM, Docker, gateway real, navegador productivo o deploy. Casos escritos como código, fuera del runner, con limitaciones de simulación explícitas.
- Commit+push a `feature/NEXIT-2026-001-banco-demo`. Informar SHA completo, archivos modificados, contratos/SQL nuevas migraciones sólo versionadas, evidencia de que F001–F003 quedan corregidos en código. **PARAR para auditoría ChatGPT R02**; no declarar homologado ni Done.
