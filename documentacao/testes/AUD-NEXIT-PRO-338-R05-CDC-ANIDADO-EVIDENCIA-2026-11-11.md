# AUDITORÍA INDEPENDIENTE — PRO-338-R05 / CDC anidado y coherencia de evidencia fiscal

**Fecha:** 11/11/2026
**SHA funcional auditado:** [75ea4523d9685e7a1b1cf9eebc1a018f7192be03](https://github.com/proceit-tech/distribuidora/commit/75ea4523d9685e7a1b1cf9eebc1a018f7192be03)
**Repositorio/branch:** `proceit-tech/distribuidora` · `feature/NEXIT-2026-001-banco-demo`
**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)
**Método:** lectura ESTÁTICA del commit, archivos completos `gateway.ts`, `cdc-inmutable-r03.casos.ts`, contratos y `interpretarRecepcion`. **No ejecutar casos, tests, lint, build, SQL, PostgreSQL, gateway real, VM, Docker, navegador ni despliegue.**
**VEREDICTO:** **R05 NO CONFORME INTEGRALMENTE; hallazgo R05-F001: el mismo CDC recibido por la API puede quedar íntegro en columnas operacionales y alterado con `[omitido]` en la evidencia fiscal persistida.** R04-F001 queda corregido estáticamente. PRO-340 no autorizada.

## 1. Cambios y casos fuente

El commit funcional R05 modifica **2 archivos**:
1. `lib/facturacion/gateway.ts`
2. `lib/facturacion/cdc-inmutable-r03.casos.ts`.

Se escribieron **19 verificaciones R05-00..R05-18** (identificadores consecutivos), sin ejecutar. Preservan casos R03/R04 con cambios de expectativas compatibles con el contrato por ruta. Son funciones reales con `fetch`/DB simulados, NO integración del gateway fiscal real o PostgreSQL real.

## 2. R04-F001 — CORREGIDO ESTÁTICAMENTE

`gateway.ts:97–175` ahora define `CONTRATO_FISCAL_CONSULTA` y `CONTRATO_FISCAL_ENVIO` con rutas normalizadas de origen, y `esIdentificadorFiscal(ruta,valor,contrato)` exime solo rutas incluidas con formato válido. `sanearValor` transporta ruta completa, inclusive `[]` en listas, y para claves documentales de `Aceptados/Rechazados` solo exime las listas de la ruta `respuesta.response.aceptados.[]` y `respuesta.response.rechazados.[]`. `sinSecretos` sin contrato no exceptúa ninguna ruta.

`Nota.CDC`, `Nota.lote`, falsos `Aceptados` en Nota y mensajes de 44 dígitos que contienen credenciales sintéticas ahora pasan saneamiento. `resultadoFiscalSinSecretos` conserva `cdc` / `cdcInformado` operacionales en consulta y envío; en `respuesta.response.DE.CDC` de consulta se preserva el CDC auténtico. No cambios en SQL, worker ni estados fiscales.

**No se identificó un bypass por nombre de campo sin ruta en el diff R05**. La confirmación de seguridad en ejecución sigue pendiente.

## 3. R05-F001 — BLOQUEO: el parser admite CDC anidado que el saneador modifica en la evidencia

**Fuentes directas:**
- `gateway.ts:499–518`: `buscar(v, CLAVES_CDC)` recorre **recursivamente cualquier objeto hasta 5 niveles**, no solo la raíz o una ruta contractual.
- `gateway.ts:608–610`: `interpretarRecepcion` extrae `cdcTexto = buscar(raiz, CLAVES_CDC)` y acepta el valor numérico de 44 dígitos como `cdcInformado`, **sin guardar también el camino de origen**.
- `gateway.ts:656–675`: en una respuesta `status: success` con `nro_lote`, si el CDC es coherente con el documento, `cdcInformado` se convierte en `cdc` del resultado operacional.
- `gateway.ts:120–134`: `CONTRATO_FISCAL_ENVIO` conserva `cdc`, `cdcinformado`, `respuesta.cdc` (CDC en raíz del cuerpo), pero **NO** `respuesta.response.cdc` (CDC anidado dentro del cuerpo).
- `gateway.ts:147–160`: la ruta ausente del contrato pasa por `omitirEn`, que sustituye coincidencias con contraseña por `[omitido]`.
- `gateway.ts:623–630` produce `respuesta` para persistir; `:729–733` ejecuta `resultadoFiscalSinSecretos` con el contrato de envío.
- **Caso R05-13 (líneas ~392–398 de la suite):** simula envío `status: success, nro_lote: "L-906", response: { CDC: CDC_FE }` con contraseña sintética igual al RUC contenido en CDC. Afirma simultáneamente `r.cdc === CDC_FE`, `r.cdcInformado === CDC_FE` y `r.respuesta.response.CDC === sinRuc(CDC_FE)`. La propia prueba **documenta que una copia del CDC de API reconocido queda alterada**.

**Contradicción material con invariante expresa del responsable:** NEXIT nunca genera, corrige, reconstituye ni cambia el CDC que reconoce como fiscal, incluso por saneamiento. El resultado operacional permanece íntegro, pero la evidencia del mismo CDC queda alterada por `[omitido]`. Es incorrecto llamar a la copia modificada «evidencia fiscal fiel». Esto no prueba que en PRODUCCIÓN el gateway use `response.CDC`; **esa ubicación no está documentada como fuente fiscal oficial**. Lo que demuestra es que el PARSER REAL acepta esa ruta sin aval contractual y el saneador no la reconoce; por eso sus dos decisiones son contradictorias.

**Riesgo adicional de origen no certificado:** la búsqueda recursiva `buscar` también puede encontrar `Nota.CDC` (o cualquier otro objeto con propiedad CDC) y elevarlo a `cdcInformado` si tiene 44 dígitos, aunque el saneador correctamente trata `Nota.CDC` como texto libre. No se acusa que esto haya ocurrido en las cuatro FE del incidente; requiere validación de la estructura real del gateway y es una implicación del mismo desacuerdo parser/saneador.

**NO hacer este arreglo simplista:** incluir `respuesta.response.cdc` o `Nota.CDC` en la allowlist de exenciones sin prueba de que sea ruta fiscal oficial. Reintroduciría riesgo de fuga de secretos y promovería un campo arbitrario a fuente autorizada de CDC.

## 4. Contrato requerido para R06 focal — sin inventar rutas

1. **Alinear parser y saneador con el mismo contrato de procedencia fiscal del gateway.** Verificar el contrato/API existente y las rutas reales de recepción: ruta raíz `CDC` confirmada en código/simulaciones, ruta `response.CDC` solo si el contrato/proveedor la acredita. No inferir que un campo es fiscal por tener 44 dígitos o llamarse `CDC`.
2. Si se acredita una variante de origen anidado, validar identidad del CDC contra el documento, **registrar y preservar el mismo CDC de 44 dígitos intacto tanto en el campo operacional como en el campo fiscal legítimo de evidencia**, mediante ruta validada. No filtrar credenciales de campos libres a través de esa autorización; mensajes, Nota y errores siguen saneados.
3. Si NO se acredita el origen de `response.CDC` o `Nota.CDC` como fiscal, **NO promoverlo silenciosamente a CDC operacional**. Informar recepción indeterminada/valor no validado según la política vigente y preservar diagnóstico (sin inventar CDC, alterar el contenido fiscal ni afirmar rechazo/aprobación). Puede redactarse u omitirse una copia de campo libre por seguridad **sin representar esa copia como el CDC fiscal auténtico**; no reescribir históricos ni ocultar que el material de auditoría fue saneado.
4. Para reconciliar otros campos fiscales buscados recursivamente (eco de documento, número de lote), valorar si hay también discrepancia parser/contrato, pero **no ampliar funcionalidad sin autorización**. Documentar riesgos detectados, no hacer cambios fiscales ajenos al CDC en R06.
5. Reescribir el caso `R05-13`: no puede seguir validando como correcto un CDC API reconocido que aparece modificado. Añadir casos de ruta oficial vs Nota falsa, CDC anidado documentado vs no documentado, y mensajes que contienen claves numéricas/alfanuméricas, consulta y envío, originales inmutados, evidencia coherente, estados `ENVIO_INDETERMINADO` cuando corresponda. Usar funciones reales con fetch/DB simulados. Sin ejecutar.
6. Mantener R05 ya conforme de aislamiento por ruta (Nota, falsos Aceptados, errores), consulta con `respuesta.response.DE.CDC`, integridad de CDC original en envío y protección de secretos. No introducir sustitución en JSON completo.

**Si el contrato real del gateway no permite resolver qué rutas son oficiales, Claude debe detenerse y solicitar evidencia/decisión del responsable antes de introducir una nueva interpretación de respuestas fiscales**. La política conservadora prohíbe aceptar CDC de una fuente que no se puede verificar, pero tampoco autoriza a reemitir/rechazar o cambiar estados previos.

## 5. Estado y gates operativos

PRO-338 sigue `In Review`, con hallazgo R05-F001 y sin homologación. Las cuatro FE `001-003-0009018..0009021` necesitan todavía inspección autorizada de intentos reales para atribuir la causa original `CDC_DIVERGENTE`; no se corrigió ningún registro de producción.

**NEX-077** (scheduler automático) y **NEX-078** (límite de líneas por empresa) no tienen aplicación real confirmada. Activar versión dependiente de NEX-078 sin columna provocaría 422 para toda nueva FE. **No ejecutar tests/SQL/migrations/gateway/VM/deploy, no activar worker ni PRO-340.**

**Veredicto:** R05-F001 debe corregirse o acotarse mediante evidencia de contrato real, **sin promover la R05 a producción**.
