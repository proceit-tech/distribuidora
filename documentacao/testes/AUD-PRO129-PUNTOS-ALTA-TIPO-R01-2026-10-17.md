# AUD-PRO129-UX-R01 — Alta fiscal exige tipo documental en el mismo formulario

**Fecha:** 2026-10-17. **Clasificación:** ALTA — fallo funcional de UX verificado con captura del responsable y lectura de las rutas reales. **Estado:** CORRECCIÓN SOLICITADA; no homologar Puntos de expedición.
**Branch:** `feature/NEXIT-2026-001-banco-demo`. La incidencia reproduce el flujo mostrado en el navegador tras la implementación NEX-063 (el estado de aplicación efectiva de la migration en la VM no se infiere de la captura).
**Captura de referencia:** `image(20261017-140402).png` aportada en la conversación; **imagen no adjunta al GitHub**. Se ve: «Nuevo punto de expedición», establecimiento `001`, código `001`, nombre «nota crédito», **sin selector de tipo**, error «Ya existe un punto con ese código en la sucursal.»
**Fuente canónica ACTUALIZADA:** `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md`, RN-PUN-03 y CA-04/CA-05B (corrección visual del 17/10/2026).
**No sustituye ni reabre técnicamente AUD-NEX063-R03:** esa auditoría revisó el aislamiento T29 y validó solamente la corrección estática; **no** homologó la experiencia visual.

## Hallazgo UX-R01-01 — ALTA — alta de punto separada del alta de tipo y duplicado falso para NCE

**Evidencia en código:**
- `app/(private)/facturacion/puntos/page.tsx`, tipo `DialogoPunto` (línea 53) **no contiene tipo**, `guardarPunto` (aprox. 166–188) llama primero a `POST /api/facturacion/puntos` con solo `sucursalId,codigo,nombre`; después cierra el primer modal y abre `Configurar tipo` en uno segundo.
- En `page.tsx`, modal «Nuevo punto» (aprox. líneas 371–402) carece de campo «Tipo de documento», describe explícitamente «se crea inactivo y sin tipos … Después se configura cada tipo».
- `app/api/facturacion/puntos/route.ts` POST registra solo punto físico; `lib/facturacion/puntos.ts` `registrarPunto` invoca `fe_punto_registrar`, que correctamente impide duplicar el punto físico, pero nunca comprueba si el usuario quería crear **otro tipo** del mismo punto.
- La API `/api/facturacion/puntos/[id]/tipos` existe, pero exigir al operador usar un flujo distinto para NCE es una especificación/UX equivocada, no un error del usuario.

**Impacto:** el operador no puede dar de alta `001-001-NCE` usando «Nuevo punto» cuando `001-001-FE` existe; recibe un error falso por confundir **identidad administrativa del punto** con **identidad de la configuración documental**. El sistema no cumple el uso fiscal definido (empresa + establecimiento + punto + tipo).

## Corrección exigida

1. **Formulario único de alta fiscal** con Sucursal/Establecimiento, Código de punto, **Tipo de documento obligatorio**, Nombre cuando el punto sea nuevo, Serie (Sin serie/AA…ZZ), Último número emitido, Próximo referencial, confirmación única y disponibilidad/estado del tipo. No crear/mostrar un punto «Sin tipo» al finalizar ni exigir otro modal de configuración.
2. Al seleccionar sucursal+ código de punto **ya existente**, reutilizar de forma segura su ID, exhibir su nombre administrativo y permitir añadir el nuevo tipo FE/NCE/NRE/etc. No modificar el nombre del punto existente en esta operación. Si el tipo ya existe, informar duplicidad **del tipo**, con acceso a «Configurar», sin reset de la serie o contador.
3. Para punto inexistente, alta de punto y secuencia fiscal inicial **en una transacción indivisible** en el servidor/PostgreSQL; si cualquier validación/escritura falla, no crear punto vacío. No fingir atomicidad con dos POST HTTP separados. Revisar SQL/procedimientos existentes; si se requiere migration nueva, preparar incremental, **sin aplicar** ni modificar NEX-063 ya versionada.
4. **Estado:** evitar dos niveles de activación confusos para el usuario; mostrar siempre disponibilidad efectiva del tipo para emitir (punto y tipo). Preservar validaciones server-side, permisos PUNTOS, alcance sucursal, aislamiento por empresa, prohibición de renumerar y concurrencia.
5. Tabla: cada combinación de tipo en fila independiente; no columna NCE, no duplicados de punto físico; conservar catálogo de tipos futuros como solo configuración (sin habilitar su emisión).

**Criterios de prueba focal:**
- P1: `empresa A, 001-001-FE` existente, alta de `001-001-NCE` en «Nuevo punto» ⇒ FE y NCE coexisten con séries y últimos números independientes y nombre administrativo existente preservado.
- P2: nuevo `001-002-NRE` ⇒ alta transaccional punto+NRE, sin fila huérfana; el estado permite configurar pero **no** emitir NRE.
- P3: repetir `001-001-FE` cuando FE ya configurada ⇒ error de tipo duplicado, sin escribir ni alterar FE/NCE, orientación hacia «Configurar».
- P4: misma combinación en empresa/establecimiento distinto ⇒ independencia; misma identidad física en otra sucursal del mismo establecimiento ⇒ no registrar punto conflictivo; confirmar política/alcance.
- P5: abortar entre alta física y alta de secuencia ⇒ rollback del punto; concurrencia de altas del mismo código y tipos distintos ⇒ un solo punto físico con dos configuraciones, sin corrupción.
- P6: modal único real, etiqueta del tipo, estado/errores, foco, navegación por teclado, responsive y capturas ANTES/DEPOIS para aceptación humana.

## Restricciones y estado

- **Claude implementa solo tras autorización del responsable**, pruebas focales, commit/push y detenerse para nueva auditoría. ChatGPT no modifica código funcional por iniciativa propia. Responsable aplica/valida en la única VM operacional.
- No reabrir MT-01/UI-01/R04-01 ni alterar reglas comerciales FE/NCE, series SIFEN o contrato gateway.
- La NEX-063, T27/T28/T29, `dSerieNum` y homologación visual siguen con los estados pendientes del historial. El resultado visual observado no prueba estado real de migration.
