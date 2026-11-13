# AUD-PRO129-UX-R04 — Estado de activación fiscal incorrectamente compartido entre FE y NCE

**Fecha:** 2026-10-17. **Origen:** rechazo de homologación visual por el responsable, captura `image(20261017-160313).png` en conversación (no se ha subido binario al GitHub).
**Estado:** **DEFECTO FUNCIONAL BLOQUEANTE EN EL CONTROL DE EMISIÓN — CORRECCIÓN SOLICITADA**.
**Base de código inspeccionada:** branch `feature/NEXIT-2026-001-banco-demo` después de AUD-PRO129-UX-R03 (código funcional de referencia `496dee01dc4d065bee3f7c8157ea01c0b0aeaa9a`). Esta auditoría NO modifica código ni acredita NEX-063/064 como aplicadas o ejecutadas en PostgreSQL.
**Especificación actualizada:** `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md` — RN-PUN-06, CA-11…CA-16. Prevalece sobre declaraciones previas de aceptación estática de R03, que no representaban homologación de la pantalla.

## R04-01 — BLOQUEANTE — Estado compartido del punto administrativo bloquea todos sus tipos fiscales

**Evidencia visible:** la captura muestra est.001/punto001 con FE `sin serie/0000001` y NCE `sin serie/0009000` ambas «Punto inactivo». Cada fila tiene «Desactivar tipo» pero también «Activar punto». Al pulsar «Activar punto»/«Desactivar punto», el estado de todo el punto administrativo afecta FE y NCE simultáneamente; usuario confirma que esta conducta es incorrecta.

**Evidencia técnica concreta:**
- `app/(private)/facturacion/puntos/page.tsx`: función `alternarPunto` llama `POST /api/facturacion/puntos/[id]/estado`; hay botones «Activar punto»/«Desactivar punto» **en cada fila de tipo**. `operativo = f.punto.activo && (t?.activo ?? false)` y condición «Punto inactivo» aplicada a todos los tipos.
- `app/api/facturacion/puntos/[id]/estado/route.ts` y `lib/facturacion/puntos.ts`: endpoint/svc cambia el estado compartido del punto físico.
- `documentacao/banco/nexit/v1/migraciones/NEX-063-facturacion-puntos-tipos-series.sql`: `fe_documento_crear_fe` y `fe_documento_crear_nce` seleccionan `fe_puntos_expedicion ... AND activo FOR SHARE` y bloquean emisión si el punto administrativo está inactivo; `fe_secuencia_reservar` además revisa `fe_punto_secuencias.activo`. Existen dos compuertas de emisión, una compartida y otra por tipo.
- `NEX-064-facturacion-punto-alta-con-tipo.sql`, `fe_punto_alta_tipo` activa el punto entero mediante `fe_punto_estado` cuando `p_activar=true`, pudiendo reactivar a la vez otros tipos con `secuencia.activo=true`.

**Regla exacta del responsable:** un documento emitido se identifica por `empresa/cliente emisor + establecimiento + punto + serie (opcional) + tipo de documento + número`. El control de contador y su estado de emisión se realiza por `empresa/cliente emisor + establecimiento + punto + tipo`, manteniendo `serie_actual` y `ultimo_numero` dentro de cada contador. El punto administrativo puede compartir código y nombre, **pero jamás un interruptor que afecte todas las especies documentales**. Desactivar FE no bloquea NCE; desactivar NCE no bloquea FE. La serie no genera múltiples interruptores paralelos por año/série; sigue la transición sin serie → AA…ZZ.

**Impacto:** acción ejecutada en una fila altera la disponibilidad de otras filas. Incluso si se retira el botón, las consultas SQL de emisión siguen bloqueadas por el estado físico; no basta cambiar React.

**Corrección técnica esperada:**
1. **Eliminar las acciones de activación/desactivación del punto físico de la UI de administración fiscal** y deshabilitar o retirar de forma segura el endpoint público que produce el cambio global. Mantener una sola acción de activar/desactivar por **tipo** (FE/NCE), dirigida al SQL `fe_secuencia_estado` o sustituto.
2. Crear migration **nueva incremental** (sugerida NEX-065 solo tras validar numeración actual) que preserve el modelo administrativo compartido pero haga **que ni FE ni NCE dependan del `activo` global** para autorizar emisión. Auditar y sustituir las gates en funciones FE/NCE, filtros/consultas, alta NEX-064, estado/reconfiguración e idempotencia; preservar controles de sucursal activa, permisos y alcance/aislamiento.
3. **Migrar estados sin habilitaciones sorpresivas**: copiar la disponibilidad efectiva anterior `punto.activo AND secuencia.activo` para cada FE/NCE de forma individual; la FE e NCE de la captura, ambas `punto inactivo`, deben continuar inactivas después de migrar. Nunca activar todos como efecto secundario de activar uno. Considerar valor administrativo del punto y procesos dependientes, con preflight read-only y validación posterior.
4. No cambiar contadores/series, documentos fiscales, CDC, estado SIFEN, claves idempotentes ni reservas; no modificar migrations anteriores. Confirmar unicidad real por `empresa+establecimiento+punto+serie+tipo+numero` incluyendo serie **NULL** (un índice UNIQUE ordinario no distingue NULL), sin suponer que falte un índice si no ha sido inspeccionado.
5. Preflight y rollback seguros: impedir aplicaciones ambiguas y no reactivar tipos al revertir. Auditoría de permisos y concurrencia FE vs NCE.
6. En NRE/NDE/AFE, conservar alta anticipada de contador pero ningún permiso para emitir; sus filas nunca deben dar a entender que la emisión está habilitada.
7. Probar en código y mocks solamente, salvo autorización del responsable de ejecutar en PostgreSQL real. Versionar tests SQL dirigidos preparados pero sin marcarlos ejecutados. Capturas visuales de las dos filas alternando FE/NCE, foco/labels y confirmación humana posterior. No iniciar rediseño NCE Etapa 2.

## Pruebas/criterios focales de aceptación

- **T01**: 001/001 FE y NCE ambas inactivas => tras migrar continúan inactivas; activar solo NCE => FE desactivada, NCE emite; desactivar NCE => FE no cambia.
- **T02**: FE activa y NCE inactiva; desactivar FE no modifica último número/serie/estado NCE; activar NCE no altera FE; reactivar FE es independiente.
- **T03**: mismo código de punto en tipos diferentes con números iguales y series distintas es válido; impedir documento duplicado con identidad fiscal completa, incluso con `serie IS NULL`.
- **T04**: llamadas antiguas directas a la API de estado físico no provocan cambios masivos y devuelven rechazo explícito o 404; no basta ocultar el botón.
- **T05**: bajo concurrencia, transición de estado FE no bloquea ni habilita NCE; reservar y emitir FE/NCE exige su propio estado y autorización.
- **T06**: nuevo punto+NCE, punto existente+NCE, tipo repetido, permisos por empresa y sucursal, tipo futuro sin emisión, rollback seguro.
- **T07**: screenshot UI ANTES/DEPOIS con botones «Activar FE», «Desactivar NCE» (o equivalente), estados independentemente visibles en dos filas sin «Activar punto».

## Decisión

**HOMOLOGACIÓN VISUAL RECHAZADA**. AUD-PRO129-UX-R03 cerró solo dos hallazgos textuales (R02-01/02); no comprobó este flujo y **no aprueba el comportamiento**. Sin autorización para SQL/VM/deploy por IAs. Claude implementa solamente después de orden del responsable y detiene al publicar SHA para reauditoría.
