# AUD-NEXIT-FE-DIR-PRO-322-R01 — Auditoría estática independiente (25/10/2026)

> **RECTIFICACIÓN EXPRESA POSTERIOR DEL RESPONSABLE — 25/10/2026:** La auditoría histórica R01-F001 fue **FALSO POSITIVO**: confundió el mínimo normativo SIFEN D221 (0–1) con el requisito más exigente del producto NEXIT. La regla de negocio vinculante es **domicilio fiscal paraguayo TODO COMPLETO o TODO AUSENTE**, cuando su omisión sea legal: calle, número, departamento, **distrito obligatorio** y ciudad, país PRY siempre. La implementación R01 que exigía `cDisRec` para una dirección nacional existente era coherente con el requisito ahora aclarado. **No seguir la orden histórica de hacer distrito opcional.** La observación de idempotencia R01-F002 permanece válida. Fuente prevaleciente: [REQ FE-DIR 4.2](../definicoes/REQ-NEXIT-FE-DIRECCION-RECEPTOR-INFO-ADICIONAL-2026-10-25.md). Los apartados siguientes son el registro histórico original y están superados solo respecto a R01-F001.


**Resultado: NO CONFORME.** Implementación Claude auditada en `8657b6a205cf46b1344fa5ae01ce8eac61a6c4ad` + ajuste final `16a1a85b22bab1a25bf20656a9a2d023b06cc452` (HEAD funcional en la auditoría). Base `685175a2849b09bf779a60e86cff45229a7641d9`. Diff funcional: solo `lib/facturacion/emision.ts` (+29 líneas) y `lib/facturacion/payload-fe.ts` (+45/−4). **0 pruebas creadas/ejecutadas por Claude por orden expresa; sin build, VM, PostgreSQL, gateway, XML ni PDF examinados operacionalmente.**

## 1. Aspectos conformes en revisión estática

- `receptorDe` sigue obteniendo la dirección fiscal del cliente, por `empresa_id` y `cliente_id`, no la entrega comercial.
- `construirPayloadFE` conserva `cPaisRec`, añade únicamente `cDepRec/cDisRec/cCiuRec` cuando la dirección existe y no es B2F; omite descripciones `dDes*` del **JSON NEXIT→gateway**.
- B2F no agrega departamento/distrito/ciudad paraguayos y exige dirección; país verificado contra catálogo y tipo de operación; no se reemplaza `dDirRec` por destino comercial.
- `dNumCasRec` proviene del catálogo como número; desaparece el fallback que convertía cualquier vacío/inválido automáticamente en 0.
- El nuevo control de catálogo utiliza SQL parametrizado de solo lectura; no se detectaron cambios a NCE, `dInfAdic`, CDC, migraciones, KuDE ni stock.

## 2. Hallazgos a corregir

### FE-DIR-R01-F001 — ALTA — distrito requerido sin fundamento normativo ni contrato JSON confirmado

En `lib/facturacion/payload-fe.ts::erroresDomicilioReceptor` se exige siempre `r.distrito` con `CODIGO_DISTRITO` en todo domicilio PRY no B2F; `domicilioFiscalJSON` siempre serializa `cDisRec`. En `lib/facturacion/emision.ts::validarGeografiaReceptor` se exigen los **tres** códigos no nulos con `resolverUbicacionParaguay`, y este último helper compartido no acepta ciudad sin distrito.

El **Manual Técnico SIFEN v150, D221**, señala ocurrencia **0–1**, sin la obligatoriedad condicionada a D213 que sí constan para D219 (departamento) y D223 (ciudad). La REQ y la decisión del responsable ordenan `cDisRec` *cuando corresponda*, no incondicionalmente. Así una dirección válida con departamento y ciudad, pero sin distrito, termina bloqueada con 422. **Código no conforme a la regla aprobada.**

**Corrección focalizada:** respetar opcionalidad D221, omitir `cDisRec` si no procede y validar de manera confiable la pertenencia de `cCiuRec` al `cDepRec` sin obligar a inventar distrito. No debilitar integridad del catálogo; no cambiar el helper genérico de Clientes/Proveedores sin necesidad comprobada. Si el proveedor realmente exige distrito para ese caso, presentar contrato acreditado y registrar restricción antes de endurecer la norma del sistema. Conservar las otras reglas de dirección.

### FE-DIR-R01-F002 — MEDIA — nuevo bloqueo de reintento idempotente por catálogo vigente

`crearFacturaElectronica` crea `documentoExiste` para reutilizar un documento de la misma `claveIdempotencia`, pero siempre llama primero a `prepararFactura`. Esta última llama al nuevo `validarGeografiaReceptor` **antes** de consultar `opciones.documentoExiste()` y de reutilizar el snapshot. Si el país/departamento/distrito/ciudad fue posteriormente desactivado en el catálogo, un doble clic/reintento con una FE ya creada puede terminar en 422 en vez de reutilizar el mismo documento histórico. Es una dependencia nueva no presente en el flujo previo.

**Corrección focalizada:** preservar la verificación del catálogo para un documento NUEVO y reutilizar un documento existente de manera segura e idempotente, usando datos históricos y controlando empresa/identidad/ACL. No volver a generar ni modificar el payload de una FE persistida ni omitir controles de autorización. Revisar el flujo entero para evitar reaplicar la geografía en una reiteración existente. No tocar CDC ni numeración.

## 3. Gate externo de integración — SIN EVIDENCIA, NO DECLARAR HOMOLOGADO

El proveedor JSON→SIFEN no tiene un contrato disponible en el repositorio que confirme: las claves `cDepRec/cDisRec/cCiuRec`, su representación como **number** en JSON, la omisión condicional de `cDisRec`, ni la derivación automática por la API de `dDesPaisRe` (obligatoria en XML), `dDesDepRec`, `dDesDisRec` cuando corresponda y `dDesCiuRec`. **Esto no es una prueba de que el proveedor rechace el payload; es un bloqueo de validación externa.** No justificar el envío a producción por la existencia de un tipo XML numérico o por una primera emisión fiscal real sin evidencia controlada. Solicitar contrato, ejemplo aceptado o comprobación con el proveedor antes de aprobar operativamente; no inventar mocks que pretendan certificar compatibilidad.

## 4. Reglas verificadas e impacto

- Referencias DNIT: Manual Técnico SIFEN v150, páginas impresas 71–73, D203–D224, especialmente D204 (descripción de país obligatoria en XML), D213/D218, D219, D221, D223: https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.
- Catálogos reales del código: `lib/geografia/referencia.ts::resolverPais` y `resolverUbicacionParaguay`, tablas `referencia_geografica_*`.
- El código no prueba que `dNumCasRec` coincida con lo declarado en el RUC; mantener esa verificación como limitación de fuente, sin inventar datos.
- Posible necesidad de verificar el efecto de reglas nuevas en previas y reintentos, sin reescribir documentos antiguos.
- PRO-323 (editor libre `dInfAdic` y vendedor) NO iniciada; PRO-298 continúa como gate externo del KuDE.

## 5. Orden de corrección y estado

**Autorizar únicamente R02/PRO-322** en `emision.ts` y `payload-fe.ts`, con otros archivos solo si imprescindible y debidamente justificado, para cerrar **F001 y F002**. Código, commit/push, SHA y parar. **No crear ni ejecutar tests, lint, typecheck, build, SQL, VM, gateway o CI manual** conforme al gate FE-V1 vigente. Después, ChatGPT hará la auditoría R02 estática con los archivos completos; la falta de tests y de contrato del proveedor sigue como riesgo/gate de homologación. No iniciar PRO-323 ni otros E03+.

**Estado propuesto Linear:** In Review — **NO CONFORME R01**, nunca Done/homologado. No merge/deploy/SQL.
