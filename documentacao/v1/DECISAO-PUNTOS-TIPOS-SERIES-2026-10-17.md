# NEXIT V1 — Decisión vinculante: puntos de expedición, tipo documental, series y rediseño visual

**Fecha:** 2026-10-17. **Estado:** DEFINIDO para especificación; IMPLEMENTACIÓN Y HOMOLOGACIÓN PENDIENTES.
**Origen:** decisiones expresas del responsable, capturas de las pantallas de Puntos de expedición y Nota de crédito del 17/10/2026, Manual Técnico SIFEN v150 y preguntas frecuentes oficiales DNIT.
**Alcance:** multiempresa, catálogo fiscal de puntos, numeración FE/NCE y tipos futuros, filtros de emisión, experiencia visual. **No autoriza aplicar SQL, deploy ni emitir documentos.**
**Precedencia:** esta decisión sustituye la interpretación «una fila/punto solo FE y columna NCE» y el inicio automático en AA. Complementa RN-16 de `REQUISITOS-NCE-V1-EMISION-2026-10-16.md`, y las decisiones de numeración de PRO-129/PRO-94; no altera MT-01/UI-01.

## 1. Identidad de la numeración — RN-PUN-01

Cada **cliente/empresa emisora** mantiene secuencias independientes por la combinación:

`empresa_id + establecimiento_sifen (3 dígitos) + punto_expedicion (3 dígitos) + tipo_documento (iTiDE)`

- Dentro de la misma empresa y establecimiento, el **mismo código de punto** puede tener **FE, NCE, NRE, NDE o AFE** con contadores independientes. También puede existir el mismo tipo en puntos distintos y en establecimientos distintos. Otra empresa puede usar esos mismos códigos sin compartir numeración.
- Ejemplo vinculante del responsable (inicio en rango sin serie; todos independientes):

| Establecimiento | Punto | Tipo | Serie | Número |
|---|---|---|---|---|
| 001 | 001 | FE | Sin serie | 0000001 |
| 001 | 001 | NCE | Sin serie | 0000001 |
| 001 | 001 | NRE | Sin serie | 0000001 |
| 001 | 002 | NRE | Sin serie | 0000001 |
| 002 | 001 | FE | Sin serie | 0000001 |
| 002 | 001 | NCE | Sin serie | 0000001 |
| 002 | 001 | NRE | Sin serie | 0000001 |

- Modelo conceptual: un punto físico/administrativo `empresa + establecimiento + código` puede ser compartido; **cada fila de la administración fiscal corresponde a una configuración de tipo documental**, sin una columna adicional exclusiva de NCE. No duplicar artificialmente el punto físico para crear sus secuencias. Si la implementación actual conserva `fe_puntos_expedicion` + `fe_punto_secuencias`, respetar las claves/locks y garantizar que la UI gestione cada combinación por separado. Validación de unicidad efectiva por identidad fiscal, también entre sucursales con el mismo establecimiento.
- **Timbrado/ambiente:** son contexto de autorización y conciliación de la emisión, **no** deben reiniciar automáticamente la secuencia ni agregarse por suposición como nueva dimensión de contador. Verificar restricciones reales del gateway y la autorización por empresa/ambiente.

## 2. Serie SIFEN — RN-PUN-02

**Regla normativa confirmada:** la primera numeración **NO lleva serie**: `dSerieNum` (C010) es opcional (`0-1`, longitud 2); `dNumDoc` (C007) tiene siete dígitos. Para una identidad nueva sin historial, el primer número es `0000001` con **serie ausente**. Agotado `9999999` sin serie, avanza `AA-0000001`; agotada AA, `AB-0000001`; después AC…AZ, BA…BZ, …, ZA…ZZ. Agotada `ZZ-9999999`, detener y escalar: jamás reiniciar o reutilizar.
- En BD, representar **sin serie = NULL** (nunca «AA» automático ni cadena vacía que llegue como XML). En interfaz, mostrar **«Sin serie»**. En XML SIFEN sin serie, **omitir el nodo `dSerieNum`**; en JSON al gateway comprobar contrato real (ausencia frente a `null`), sin inventar compatibilidad.
- El último número y la **serie actual** deben persistir y reservarse atómicamente por identidad de secuencia; cero solo se acepta cuando un operador lo informa y confirma expresamente como ausencia de documentos previos, con historial conciliado. `9999999` es valor final **válido** para indicar el paso a la siguiente serie, no truncarlo a 9999998.
- DNIT no admite dos series corrientes en paralelo para una misma identidad; el Manual v150 también describe condiciones de validación temporal para DE firmados en la serie anterior/actual/siguiente. No simplificar esas excepciones a una prohibición de consultar o conciliar documentos históricos. Confirmar implicaciones de firma/fecha y lote con gateway antes de habilitar rollover automático.
- No reutilizar números reservados, aceptados, rechazados o indeterminados por simple reintento. Idempotencia por documento, reserva transaccional, aislamiento por empresa y trazabilidad. Evitar colisiones con otro ERP que emite sobre la misma identidad mediante autoridad compartida de numeración o coordinación operacional; una confirmación manual única no garantiza coordinación futura.

**Fuentes oficiales:** Manual Técnico SIFEN v150, sección «Manejo del timbrado y Numeración», grupo C (C007/C010): https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf ; DNIT FAQ: https://ekuatia.set.gov.py/web/e-kuatia/preguntas-frecuentes/-/categories/2704943?p_r_p_categoryId=2704943 . Antes de implementar, confrontar notas técnicas/XSD vigentes archivados en `documentacao/referencias/sifen/`; no declarar todos los tipos homologados por el solo hecho de poder configurar sus contadores.

## 3. Registro y activación — RN-PUN-03

- **Alta del punto:** formulario compacto: sucursal/establecimiento, código (001–999), nombre. Nuevo punto físico nace inactivo. La configuración fiscal por tipo es explícita y puede agregarse dentro del flujo de alta o después, pero siempre **seleccionando tipo documental** FE/NCE/NRE/NDE/AFE; no inventar FE por defecto.
- **Configuración de una secuencia por tipo:** serie actual (por defecto visual «Sin serie» para identidad realmente nueva; no inventar valor para identidad histórica), último número realmente emitido/reservado/conciliado, próximo referencial, estado y confirmación expresa. Último=0 solo si declarado; si existe historial importado o externa, exigir conciliación y mostrar su valor real.
- **Confirmar una sola vez en la configuración inicial.** No pedir el mismo último número al crear punto y volver a preguntarlo en la activación inicial. En reactivación, exigir conciliación adicional solo si existieron emisiones externas o desajuste demostrado.
- Estados separados: estado del punto administrativo y disponibilidad por tipo. Activar FE nunca activa NCE ni NRE; desactivar tipo no destruye último número ni serie.
- La configuración administrativa de NRE/NDE/AFE **no habilita** su emisión si no existe flujo completo, contrato gateway y validaciones homologadas. FE y NCE son los únicos flujos actualmente implementados, pero tampoco se consideran homologados por este documento.
- Los combos y reservas de Nueva factura filtran estrictamente FE, y los de Nota de crédito estrictamente NCE. El backend valida empresa, alcance, tipo, estado y secuencia; no depender del dropdown. Evitar ofrecer como disponible un tipo que no pueda emitirse.

## 4. UX/UI obligatoria — RN-PUN-04

**Puntos de expedición:** diseño profesional, compacto, consistente con Clientes/Productos/Catálogos. Pantalla centrada en la lista con filtros por sucursal/establecimiento, tipo y estado y acción «Nuevo punto». Alta/configuración en panel o formulario compacto, no formulario gigante fijo ni campos duplicados.
- Tabla de **filas por tipo**: «Establecimiento», «Punto», «Nombre», «Tipo de documento», «Serie actual», «Último número», «Próximo (referencial)», «Estado» y «Acciones». Puede agruparse por establecimiento, manteniendo claramente el tipo por fila. Sin columna «Nota de crédito (NCE)» y sin controles/botones mezclados en celdas con textos recortados.
- Configuración/confirmación y activación en diálogo/panel con etiquetas claras y validaciones por campo; mensajes de error junto al campo y resumen del problema; no presentar error de numeración huérfano. «Próximo» nunca se promete como número definitivo antes de la reserva atómica.
- Responsive y accesible (375 px, 768 px, desktop; foco, teclado, rótulos, estados vacíos/errores, contraste, sin overflow destructivo). Español Paraguay. Capturas ANTES/DEPOIS y aceptación explícita del responsable.

**Nota de crédito:** mantener el flujo aprobado de cliente → factura → detalle/motivo/punto NCE → revisión final → emitir; rediseñar header, espacios, búsqueda, filas, formulario y resumen conforme mismo patrón compacto. Quitar texto introductorio extenso y cabeceras redundantes; conservar los avisos realmente necesarios, filtros, accesibilidad y paginación. No introducir cambios en MT-01 (Innominado no seleccionable SOLO en búsqueda normal) ni UI-01 (emitir el cuerpo exacto de la revisión); conservar reversión de R04-01 y corrección «Corregir y emitir nueva» previa sin nuevo veto.

**Evidencia visual remitida por el responsable (NO versionada aún como imagen en GitHub):**
1. `image(20261017-122840).png`: Nota de crédito, cabecera muy alta y búsqueda/fila dispersas.
2. `image(20261017-123022).png`: Puntos, formulario fijo y «Último número» forzado FE; confirmaciones repetidas.
3. `image(20261017-123112).png`: tabla de puntos, columna NCE improcedente, «Sin configurar» y botones alineados incorrectamente.
Registrar capturas originales en la carpeta de homologación visual cuando exista un mecanismo seguro para adjuntarlas a Git; por ahora estas referencias son **solo textuales**.

## 5. Seguridad de datos y migración — RN-PUN-05

Auditar NEX-047/048/057/058/059/060/061/062 **según aplicación real**; consultar también rutas, FE/NCE, reservas y documentos históricos. Escribir migration **nueva e incremental**, nunca editar scripts aplicados ni inventar que NEX-062 está aplicada. Inventariar secuencias FE/NCE actuales, documentos históricos y reservas antes de convertir; mantener CDC, numeración, payload inmutable, solicitudes, intentos, idempotencia y auditoría.
- Toda actualización de tabla/constraint/function compatible con datos existentes; estrategia de transición para puntos que solo contienen FE y para puntos con FE+NCE. Detectar y bloquear ambigüedades en lugar de asignar `AA`, `NULL` o `0` de manera destructiva.
- Migración y rollback seguros, scripts separados para preflight read-only, aplicación por humano y validación post-ejecución. El responsable es el único que ejecuta en la VM/PG real; ni Claude ni ChatGPT acceden.
- Identidad por empresa/establecimiento/punto/tipo con bloqueo transaccional; pruebas de concurrencia y límites de serie sin alterar datos productivos.

## 6. Criterios de aceptación y pruebas dirigidas — CA-PUN

- **CA-01:** empresa A, est.001/punto001 admite FE/NCE/NRE por separado, cada uno inicial `sin serie-0000001` cuando corresponda; est.001/punto002 NRE y est.002/punto001 FE/NCE/NRE independientes; empresa B totalmente aislada.
- **CA-02:** avance sin serie `9999998 → 9999999 → AA-0000001`; AA `9999999 → AB-0000001`; AZ→BA; ZY→ZZ; ZZ `9999999` → bloqueado. No se permite reserva duplicada bajo simultaneidad.
- **CA-03:** XML sin serie omite `dSerieNum`; con serie declara AA/AB/etc. El contrato JSON real del gateway determina null/ausencia. Fecha/serie obedecen reglas SIFEN.
- **CA-04:** crear punto sin elegir tipo como FE implícito; inicializar/confirmar valor solo una vez; reactivación controlada; no perder secuencia al desactivar.
- **CA-05:** listado agrupa o representa una fila por tipo sin columna NCE; admin puede filtrar y configurar; UI profesional validada con capturas desktop/tablet/móvil por responsable.
- **CA-06:** FE nunca consume NCE/NRE, NCE nunca consume FE; UI y API respetan tipo, permiso PUNTOS/CREAR, empresa, sucursal autorizada y estado.
- **CA-07:** números/séries existentes, documentos/CDC, FE y NCE previas conservados; migración reversible o procedimiento de recuperación justificado; error temprano sin reservar ante estado inconsistente.
- **CA-08:** NRE/NDE/AFE registrables según el catálogo decidido, pero su emisión está bloqueada hasta implementación/autorización específica.
- **CA-09:** formulario NCE rediseñado sin cambios de negocio ni regresión MT-01, UI-01, idempotencia, corrección de rechazadas o alcance multiempresa.
- **CA-10:** test dirigidos en código/mocks + SQL de prueba versionado **no ejecutado** en PostgreSQL real, sin suite global ni build global por defecto; evidencias de lo ejecutado/no ejecutado, SHA y parada para auditoría.

## 7. Orden de implementación para Claude

**Etapa 1 (primera entrega; única autorizada inicialmente):** actualizar el modelo/queries de puntos y secuencias, APIs, selección FE/NCE y reservas serie+num, migration incremental segura y rediseño de Puntos de expedición. Testes dirigidos, commit/push y detenerse para auditoría de ChatGPT **antes de cualquier aplicación SQL en VM**.
**Etapa 2 (posterior a revisión y nueva autorización):** rediseñar Nota de crédito con su flujo actual, sin añadir nuevas reglas Innominado y sin alterar las reglas fiscales NCE; capturas ANTES/DEPOIS y auditoría independiente.
**Bloqueo de puesta en operación:** ninguna modificación de banco o deploy a cargo de IA; aprobación técnica no equivale a homologación visual ni operacional.

## 8. Registro de contradicciones previas resueltas

- RN-16 anterior decía «Puntos compartidos, NO por tipo»; **interpretación correcta:** un punto administrativo es compartible, pero **cada tipo tiene configuración fiscal visible e independiente**, representada por fila. No hay columna NCE dentro de la fila FE.
- La interfaz actual exige «Último número» dos veces; se sustituye por confirmación única inicial.
- La serie **no comienza en AA**: debe comenzar ausente y migrar a AA solo tras agotar el rango sin serie.
- La regla MT-01 y reversión de R04-01 no son objeto de esta reforma.
