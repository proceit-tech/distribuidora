# ORDEN CORRECTIVA CLAUDE — PRO-339-R02 / Alta atómica, claves y feedback

**Fecha:** 02/11/2026 · **Issue:** [PRO-339](https://linear.app/proceit/issue/PRO-339) · [GitHub #16](https://github.com/proceit-tech/distribuidora/issues/16)
**SHA R01:** `1ab9d1d02bf09a78935eb7232c82b7b38a2bd87c`
**Auditoría vinculante:** [AUD PRO-339-R01](../testes/AUD-NEXIT-PRO-339-LIMITE-FE-POR-EMPRESA-R01-2026-11-02.md).
**Estado:** **R01 NO CONFORME por un defecto localizado en el editor; R02 única orden activa**. PRO-340 sigue sin autorización.

## ÚNICO HALLAZGO AUTORIZADO — R01-F001 (MEDIA)

La función `agregar` en `app/(private)/facturas/nueva/page.tsx` comprueba `lineas.length` y `siguienteClave` del render actual, pero encola `setLineas((ls) => agregarSiCabe(...))`. El actualizador puede rechazar una segunda alta al alcanzar el máximo sin que `agregar` lo sepa: el llamador aún devuelve clave de éxito, avanza `siguienteClave`, cambia foco y, en el selector avanzado, anuncia `«producto» añadido`. Dos altas de SKU distintos, si caben y suceden antes del próximo render, pueden capturar el MISMO `siguienteClave` y producir claves duplicadas. La prueba fuente PRO339-20 ejercita sólo el helper secuencial, no la integración con el editor/feedback.

## Instrucción de corrección MÍNIMA

1. Leer `CLAUDE.md`, protocolo IA, este documento y auditoría R01. Abrir **versión COMPLETA y ACTUAL de CADA archivo, UNO POR VEZ** antes de editar. Revisar el verdadero contrato de `SelectorProducto`, `BuscadorRapido`, `seleccion-cantidad`, `destinoFocoTrasAlta` y la renderización del editor fiscal/foco para una solución compatible con React.
2. Asegurar decisión **atómica y coherente** de alta bajo acciones consecutivas, usando el estado más reciente para ambos hechos: SKU ya presente vs nuevo y cupo disponible; asignar claves visuales únicas a filas realmente añadidas. La respuesta al selector/lector debe coincidir con la aceptación/rechazo EFECTIVO. No emitir `ALTA_BLOQUEADA` después de añadir ni clave de éxito cuando se rechaza. El feedback, el foco, el panel fiscal, el contador, el registro del último añadido y la selección de cantidad deben reflejar sólo filas existentes. **No introducir side effects dentro del updater React** que puedan ejecutarse/repetirse bajo Strict Mode.
3. Casos de regresión a escribir SIN ejecutar: con máximo M, **dos SKU diferentes** ingresados antes del rerender y **1 hueco** (uno añadido, segundo rechazado con mensaje); con 2 huecos ambos añadidos y claves distintas; **mismo SKU dos veces** antes del rerender no duplica fila y suma cantidad correctamente; en límite exacto sumar SKU existente continúa permitido; alternar lector código/GTIN/Enter y selector avanzado; quitar una línea y añadir; alta rechazada no abre editor fiscal ni enfoca cantidad; cambio de política y 422 servidor conserva borrador; texto de aviso siempre usa máximo de empresa. Incluir inspección de intercalado/Strict Mode sin afirmar prueba real si no se ejecutó.
4. **PRESERVAR** toda la arquitectura PRO-339-R01 ya conforme: `empresas.fe_max_lineas` con NULL=999; NEX-078 NO APLICADA; `prepararFactura` valida en backend y protege empresa/sucursal, FE nuevas únicamente, NCE no afecta, reintentos idempotentes, `MAX_LINEAS=999` fiscal, 4 filas y scroll PRO-331, orden PRO-333, fondos PRO-334, KuDE, SIFEN PRO-338, stock, precios, IVA y descuentos.
5. No modificar `emision.ts`, `shared.ts`, migration/scripts NEX-078, SQL ni otras APIs por este defecto; si fuese inevitable, demostrar y justificar antes de ampliar alcance. Preferir `page.tsx`, el helper `limite-lineas.ts` y casos focales.
6. No implementar pantalla administrativa PRO-340, no cambiar ningún máximo de empresa en base real ni crear nuevas políticas/valores hardcoded (21/63/99 siguen solo ejemplos sintéticos).

## Restricciones y entrega

**NO EJECUTAR:** tests/runner, lint, typecheck, build/CI, SQL, migrations, PostgreSQL, Docker/VM, gateway, navegador productivo ni deploy.

Entregar código y casos fuente (sin ejecutar), commit+push SHA COMPLETO, lista de archivos, descripción exacta del cierre F001 y riesgos restantes, e inmediatamente **PARAR para auditoría independiente ChatGPT PRO-339-R02**. No desarrollar PRO-340 después de publicar.

**Gate de despliegue NO LEVANTADO:** NEX-078 necesita aprobación, preflight y aplicación ANTES de habilitar código PRO-339; sin NEX-078, el backend rechaza toda FE nueva con 422. Esto es diseño de seguridad deliberado, NO autorización para ejecutar migration. PRO-339 permanece In Review y no homologada.
