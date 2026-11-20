# AUD-NEXIT-FE-DIR-PRO-322-R03 — auditoría estática independiente (25/10/2026)

**DICTAMEN: NO CONFORME. NO DEPLOY / NO ENVÍO REAL DE FE.**

Implementación auditada: `0ffda09111cd7905c136bc3c638e829cf5cc7768` (parent `7e8f74e200d804676bfd1c694368616e5d1011fb`). HEAD de branch coincidía con este SHA antes de esta auditoría. Diff R03 SOLO modifica `lib/facturacion/emision.ts` (52 cambios) y `lib/facturacion/payload-fe.ts` (30 cambios). Inspección de archivos reales, `lib/facturacion/info-adicional.ts`, `lib/clientes/aptitud-cliente.ts`, `lib/fiscal/aptitud-sifen.ts`, `lib/fiscal/campos-receptor.ts`, y SQL versionado `NEX-048`, `NEX-060`, `NEX-063`, `NEX-067`, `NEX-068`. **Ninguna prueba ejecutada, según orden; sin VM, DB, gateway ni CI verificados.**

## Conforme estáticamente

1. La decisión de **domicilio fiscal nacional totalmente vacío o totalmente completo** aparece en `erroresDomicilioReceptor`: país obligatorio, calle/número y departamento/distrito/ciudad requeridos cuando hay cualquier campo del domicilio. Domicilio parcial con geografía pero sin calle ya no se descarta silenciosamente. `domicilioFiscalJSON` incluye los TRES códigos geográficos en un domicilio PRY presente; B2F no lleva geografía paraguaya.
2. `validarGeografiaReceptor` contrasta existencia y jerarquía departamento→distrito→ciudad contra catálogos activos con SQL parametrizado; el validador compartido de Clientes/Proveedores quedó intacto.
3. La comparación del payload comercial recalculado con el histórico se realiza antes de sustituir el payload original, y la identidad `clienteId`/`sucursalId` ahora se compara. Es una mejora **parcial** respecto a la R02.
4. Se conservan estructura SQL, NCE, KuDE, CDC, stock, migrations y documentos históricos sin cambios en este commit.

## Hallazgos BLOQUEANTES de R03

### F005-R03 — CRÍTICA — expresión regular del número de casa inválida

En `lib/facturacion/payload-fe.ts::erroresDomicilioReceptor`, tanto en el branch B2F como en el nacional, se escribió `/^d{1,6}$/` en vez de `/^\\d{1,6}$/` (JS regex: `\\d` = dígito). Esta expresión solo acepta secuencias literales de `d`, y rechaza `123`, `45` o `1000`. Una cadena `dddd` sería aceptada y `Number('dddd')` produciría `NaN`, que `JSON.stringify` transforma en `null`: riesgo de JSON inválido. **Toda FE nueva con domicilio real queda bloqueada** en la validación fiscal (y B2F también).

**Corrección R04 obligatoria:** restaurar regex numérica exacta `/^\\d{1,6}$/` en ambos caminos, sin alterar campos de FE o permitir fallback ficticio a 0.

### F002-R03-A — ALTA — `puntoId` y dirección de entrega NO comparados en equivalencia

`Historico` contiene solo `payload`, `clienteId` y `sucursalId`; `equivalente` compara cliente/sucursal + payload comercial. No verifica `cuerpo.puntoId` contra punto de expedición histórico de `documentos_electronicos` ni `cuerpo.direccionEntregaId` contra `documento_electronico_entregas.direccion_id`. **La dirección de entrega no pertenece al payload SIFEN**, y `prepararFactura` deliberadamente omite revalidarla para FE existente. La función SQL NEX-063 `fe_documento_crear_fe` en rama de FE existente verifica permiso/alcance y `entrada_hash`, pero NO compara `p_punto`. NEX-068 omite validar/guardar la entrega si `v_reutilizado` es true.

**Escenario:** mismo cliente/sucursal/ítems/precios/pago y clave, pero punto activo diferente en la misma sucursal. R03 puede aceptar `equivalente=true`, sustituir payload antiguo y devolver FE del punto anterior. Otro escenario: nueva dirección de entrega distinta, que el reintento no contrasta por ID.

**Corrección:** incluir identidad de punto original y referencia de entrega original, leídas del snapshot/tablas existentes; contrastarlas con datos recibidos, manteniendo ACL, empresa y sucursal. No inferir identidad desde textos comerciales o clientes actuales. Cuando faltan pruebas, conflicto 409. No SQL/migrations.

### F002-R03-B — ALTA — `dInfAdic` histórico sustituido antes de comprobar observación nueva

`prepararFactura` invoca `infoAdicionalPersistida` para una clave existente y sustituye por completo el texto calculado a partir de `cuerpo.infoAdicional` con `dInfAdic` antiguo (`lib/facturacion/emision.ts`, aprox. líneas 503–510). `equivalente` sí compara el campo `dInfAdic` del payload, pero es el **mismo histórico en ambos lados**. La observación escrita en el nuevo cuerpo es ignorada para determinar identidad. Cambiar la nota de la factura, conservando los demás datos y la clave, puede retornar la FE original como `reutilizado` sin 409. Un cambio de `direccionEntregaId` también se oculta.

**Corrección:** preservar `dInfAdic` fiscal inmutable en verdaderos reintentos, pero exigir prueba de equivalencia de texto libre/selecciones actuales, usando la información original confiable disponible; el hash del texto histórico por sí solo no prueba qué escribió originalmente el usuario. Si no existe fuente inequívoca para una modalidad histórica, fallar cerrado explícito; no inventar parsing de etiquetas ni migración no autorizada. No reducir integridad de E1/NCE.

### F003-R03 — ALTA — puerta de aptitud ACTUAL sigue activa antes del reuso histórico

`prepararFactura` sigue invocando `evaluarAptitudCliente` para todos los casos y ejecuta incondicionalmente `if (aptitud && !aptitud.apto) throw detalles(422, ...)` antes de la exención de `validarGeografiaReceptor`. `evaluarAptitudCliente` consulta `referencia_geografica_paises WHERE activo = true`, y `evaluarAptitudSifen` valida además los campos vigentes de la dirección fiscal. **Si un país o dato fiscal del receptor queda inactivo/incompleto después de crear la FE, un reintento legítimo sigue recibiendo 422**, pese al payload original verificado. La declaración de Claude de que F003 está corregida contradice el código.

**Corrección:** separar validaciones fiscales de *nueva FE* y reintento de documento existente **después** de comprobar identidad/equivalencia de operación, sin dispensar autorización, alcance, pertenencia y controles antifraude. No confundir suspensión real/bloqueo deliberado del cliente con simple cambio del catálogo histórico; esas políticas deben preservarse según el contrato. No usar bypass indiscriminado.

## Riesgos y escenarios mínimos de revisión R04

- Dirección PRY completa con número `123` → aceptación estática (si demás datos correctos). `dddd` → rechazado; B2F `45` no debe ser rechazado por regex.
- Dirección nacional parcial, con códigos sin calle o sin distrito → 422 antes de reservar. Domicilio totalmente ausente (solo cuando permitido) → país enviado.
- Reintento misma clave/cliente/sucursal pero **otro punto** → 409; **otra dirección de entrega** → 409; **otra observación comercial** → 409; mismo contenido comercial y solo cambio posterior del catálogo país → reutilizar snapshot sin reescribir.
- Reintento con producto/quantidade/preço diferente → 409 (a R03 já compara payload recalculado); empresa distinta nunca revela documentos de otras empresas.
- La construcción histórica debe mantener igualdad con `entrada_hash` según NEX-063, que sigue verificando sólo el payload recibido. Para IDs de entrega, existe `documento_electronico_entregas` de NEX-068. Para punto, documento guarda `punto_expedicion` y `sucursal_id`, el catálogo de puntos guarda sus códigos; comprobar invariantes concretas en vez de asumir ID recuperable.
- Modificaciones de maestros comerciales pueden cambiar payload recalculado: documentar límites reales de verificación para reintento genuino, sin convertir registros actuales en supuesta evidencia de intención histórica.

## Gate

**PRÓXIMA ORDEN: solo PRO-322-R04, F005-R03/F002-R03-A/F002-R03-B/F003-R03.** Trabajo estrictamente acotado: reparar regex, cerrar identidad comercial (punto/destino/observaciones) y puerta de aptitud del reintento, sin inventar persistencia ni SQL. Si la equivalencia de un caso histórico no se puede demostrar, devolver conflicto 409 sin éxito falso. Commit/push y PARAR para AUD-R04.

No crear/ejecutar pruebas, lint, typecheck, build, CI manual, migraciones, DB/VM/gateway conforme orden FE-V1 vigente. No iniciar PRO-323 ni otras etapas. **Contrato gateway de códigos geográficos y resolución de descripciones XML todavía NO verificado; PRO-322 In Review, no Done/homologado.**
