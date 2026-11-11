# ORDEN ÚNICA DE DESARROLLO — PRO-342-R04 / Auditoría integral + pantalla compacta con iconos

**Fecha:** 11/11/2026 · **Repo:** `proceit-tech/distribuidora` · **Rama:** `feature/NEXIT-2026-001-banco-demo`
**Tarea:** [PRO-342](https://linear.app/proceit/issue/PRO-342) · [Issue GitHub #19](https://github.com/proceit-tech/distribuidora/issues/19)
**Analista responsable:** ChatGPT / PROCEIT. **Desarrollador ejecutor:** Claude.
**AUTORIZADO AHORA:** implementar correcciones focales de CÓDIGO/UX de esta orden y escribir casos de prueba, publicar commit/push y DETENERSE para auditoría ChatGPT.
**NO AUTORIZADO:** ejecutar tests/lint/typecheck/build/CI/SQL/migrations, acceder o cambiar VM/Docker/gateway/credenciales, emitir/reemitir facturas, editar datos fiscales históricos, publicar/deploy o iniciar PRO-340.
**Contrato principal y evidencia:** [Reauditoría integral PRO-342](../testes/AUD-CHATGPT-PRO-342-REAUDITORIA-INTEGRAL-FISCAL-UX-ICONOS-2026-11-11.md), [especificación de negocio vigente](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md), [mockup visual SVG para Claude](../referencias/PRO-342-MOCKUP-DOCUMENTOS-ESTADOS-ICONOS-2026-11-11.svg). El SVG y las capturas del proveedor son **referencia de presentación, no datos reales ni fuente de reglas fiscales**. El informe de reauditoría enumera TODOS los hallazgos, riesgos y casos (secciones 1–5). Lea el informe completo, no solo esta orden.
**Base auditada:** código funcional `baa419492933650ed079230d9b01303e4aee4bd0` más commits documentales posteriores; antes de editar, leer versión COMPLETA MÁS RECIENTE de cada archivo **UNO POR VEZ**, sin recuperar copias antiguas ni sobrescribir trabajo nuevo.

## OBJETIVO Y CRITERIO DE NO REGRESIÓN

Corregir en UNA SOLA PASADA los tres defectos de integridad/CDC identificados y hacer que la pantalla de `Documentos electrónicos` sea **MÁS clara que el proveedor**: pocos iconos con significado inequívoco y detalles fiscales útiles en primer nivel, sin el exceso de etiquetas y párrafos. Preservar todos los flujos correctos. **No ampliar alcance a módulos, controles ni herramientas fuera de PRO-342.**

## R04-F01 — La RESPUESTA ACTUAL `XML firmado` debe traer CDC, aunque el documento tenga CDC anterior

**Defecto confirmado:** `lib/facturacion/reconciliacion.ts::decidirConsulta` actualmente bloquea `XML firmado` sin CDC sólo cuando TAMBIÉN `doc.cdc=null`. Con CDC anterior, acepta una nueva respuesta XML firmado sin CDC. El caso existente `PRO342-R03-F09` espera esa conducta incorrecta.

**Implementación requerida:**
- Si la respuesta ACTUAL informa realmente `XML firmado`, debe incluir CDC auténtico de ese mismo documento en `response.DE.CDC`. Si no hay CDC en la respuesta actual, registrar intento como `RESPUESTA_INVALIDA` (mensaje claro `CDC ausente en XML firmado`); **NO considerar la respuesta actual firma validada**; mantener el CDC PREVIO intacto y la reconsulta futura activa. Esto vale aunque el documento ya tenga CDC.
- Si llega `XML firmado` + CDC correcto: persistir ese CDC EXACTO si aún no existía, guardar `PENDIENTE` como INTERMEDIO y reconsultar. Si ya existía otro CDC, guardar `CDC_DIVERGENTE` y no reemplazarlo.
- Sólo `Aprobado`/`Rechazado` DEFINITIVOS INFORMADOS por la API pueden cerrar el seguimiento y **siempre** con CDC del documento ya registrado o informado ahora. Una respuesta FINAL posterior NO necesita repetir CDC si ya está vinculado al mismo documento. FINAL sin CDC disponible en documento/respuesta → inconsistente y pendiente. HTTP200, `XML firmado`, `KuDE habilitado` y ACK de lote NO equivalen a APROBADO.
- No generar, reconstruir, recortar, completar ni reescribir CDC ni enviar CDC en `consulta_de`. No reenviar el JSON original para reconsultar.

## R04-F02 — CDC literal: sin `.trim()` ni normalización

- `lib/facturacion/gateway.ts::interpretarConsulta`: leer el string original `response.DE.CDC` (único campo reconocido en contrato) y validar **literalmente** `^\d{44}$`. El helper general `texto()` puede recortar mensajes normales, NO el CDC.
- `lib/facturacion/gateway.ts::interpretarRecepcion`: mismo criterio con el CDC que venga en la raíz del ACK: validar literal y preservar. No asumir CDC en ACK de recepción.
- CDC con espacios en extremos, control characters, letras, 43/45 dígitos o ubicación fuera del contrato NO se convierte en CDC válido ni se «arregla». `XML firmado` o final con CDC presente MALFORMADO → respuesta técnica inválida (no considerar «ausente» aceptable ni crear documento firmado).
- Preservar evidencia JSON bajo saneamiento seguro, sin exponer credenciales ni sacrificar integridad de lote/CDC operacional.

## R04-F03 — Defensa complementaria en NEX-079 AÚN SIN APLICAR

- Mantener guarda existente que exige CDC válido para `APROBADO`, `RECHAZADO`, `CANCELADO` e `INUTILIZADO`.
- Añadir en la NEX-079 **ya versionada, no aplicada** protección para `XML firmado` con `p_estado_sifen=PENDIENTE` sin CDC en LA RESPUESTA ACTUAL, aunque `d.cdc` ya exista. Preservar intento y respuesta como inconsistencia (no sobrescribir estado, CDC ni última respuesta válida), respetando permisos, lease, fencing e historial. No depender sólo de `coalesce(p_cdc,d.cdc)` en este estado específico.
- No modificar NEX-047..NEX-078 históricos ni ejecutar/crear otra migration. No introducir funciones/privilegios nuevos fuera de las firmas ya previstas por NEX-079.

## R04-UX01 — LISTA CON ÍCONOS, SIN ETIQUETAS LARGAS

**Referencia exacta:** `documentacao/referencias/PRO-342-MOCKUP-DOCUMENTOS-ESTADOS-ICONOS-2026-11-11.svg`.

- Mantener columnas Documento (FE/NCE + serie), fecha, RUC/CI y cliente, importe, **Estados**, acciones.
- En columna `Estados` sustituir las cápsulas largas de texto por **CUATRO iconos independientes, en una sola línea**:
  1. **ENVÍO:** confirmado, pendiente, indeterminado, error. Sólo ACK/lote → envío confirmado; no implicar SIFEN.
  2. **XML/CDC:** `file-check`/azul sólo CDC recibido/registrado válidamente de la API; `file-clock` gris sin CDC; `file-warning` ámbar cuando la última respuesta es inconsistente. No confundir con aprobación.
  3. **SIFEN:** `check-circle` verde sólo APROBADO persistido **y CDC válido**; `x-circle` rojo sólo RECHAZADO persistido **y CDC válido**; `clock` ámbar pendiente; símbolo neutro para CANCELADO/INUTILIZADO; si existe estado final viejo con CDC NULL, mostrar alerta de integridad sin cambiar DB.
  4. **CORREO:** independiente, enviado/pendiente/error/no aplicable; no transformar e-mail en estado SIFEN.
- Máximo 4 iconos regulares, alerta técnica sólo si hay anomalía. Iconos con `aria-label`, título/tooltip en mouse/foco, keyboard, alto contraste, explicación legible en móvil. El color nunca es la única señal. Leyenda breve visible una vez por listado (Envío · XML/CDC · SIFEN · Correo).
- FE azul tenue/NCE amarillo tenue ya existentes NO deben perderse; tampoco filtros, indicadores, paginação, ordenación, búsqueda, permisos, refresco GET, botones y rutas actuales. No instalar librerías nuevas; usar SVG inline/helper puro compatible con React y estilos CSS locales.
- La acción KuDE debe llamarse **`Consultar KuDE`** y NO insinuar que el PDF está confirmado por el hecho de ser FE/NCE. KuDE NO es una quinta fase fiscal.

## R04-UX02 — PRIMERA EXPANSIÓN IGUAL DE SIMPLE QUE EL PROVEEDOR, MEJOR EN TRAZABILIDAD

Al desplegar una fila, mostrar **PRIMERO SOLO CUATRO DATOS FISCALES, compacto**:
1. `Nro lote`: valor literal original o `No informado`; acción `Copiar` sin truncamiento.
2. `CDC`: 44 dígitos informados por API o `No informado`; botón `Copiar` y sin enmascarar.
3. `Fecha firma`: fecha/hora devuelta por API, nunca inventada.
4. `Mensaje`: `código + mensaje` de la última respuesta fiscal válida; por ejemplo `Número de timbrado inválido` sólo si llega realmente del gateway, NUNCA deducir `Rechazado` del texto. Un error técnico del último intento es un aviso separado.

Una línea discreta puede resumir `Enviado` / `XML firmado` / `SIFEN pendiente o final`, sin párrafos explicativos ni duplicación de campos.

**SEGUNDA CAPA CERRADA POR DEFECTO:** botón `Historial técnico (N)`: conservar la tabla/timeline COMPLETA de todos los intentos, conexión NEX-079 o compatibilidad, fecha, HTTP, estado crudo, código, mensaje, JSON de solicitud y respuesta, paginación/cursor, errores y acciones `Consultar estado` existentes. No eliminar datos ni permisos; sólo reordenar jerarquía visual. Abrir la fila NO dispara consulta de gateway (sólo GET del sistema).

## R04-UX03 — KuDE sin cambio unilateral de política fiscal

- Mantener `NO_VERIFICADO` cuando la API no aporta metadatos suficientes para probar que el PDF pertenece al mismo documento y emisor; CDC del JSON idéntico al del documento no comprueba por sí el BINARIO. `NO_CORRESPONDE` sigue descartado.
- **NO modificar automáticamente** el permiso de imprimir/descargar PDFs NO VERIFICADOS: sería cambio de regla PRO-326 y exige decisión adicional del responsable. Tampoco inventar metadata del proveedor, OCR, RUC/DV/checkdigit, firma de PDF o cuenta de test. Mantener advertencia existente.
- Registrar como dependencia de homologación el dato del proveedor que permita vínculo cuenta/emisor/serie al PDF.

## MATRIZ OBLIGATORIA DE REGRESIÓN — ESCRIBIR SIN EJECUTAR

**Códigos R04-A/B/C/D/E/F**: los 36+ escenarios de `AUD-CHATGPT-PRO-342-REAUDITORIA-INTEGRAL-FISCAL-UX-ICONOS-2026-11-11.md` sección 4 son vinculantes, incluyendo:
- CDC de XML firmado ausente CON doc CDC previo (pasa a `RESPUESTA_INVALIDA`), sin CDC previo, válido, divergente, con espacios y malformado, final que no repite CDC, final sin CDC de ninguna fuente.
- Envío único, lote propio íntegro, no-reenvío, aceptación/rechazo propios, NCE, estados finales inmutables.
- Worker NEX-077 usa misma reserva/lease, registra intentos, sigue reconsultando y se detiene en final; errores/backoff sin nueva transmisión.
- UI cuatro estados independientes: **ENVÍO✓ XML✓ SIFEN× CORREO neutro** para caso `XML firmado` + CDC → `Rechazado` final, tanto lista como tooltip y detalle. Aprobado, pendiente, envío indeterminado, error técnico sin rechazo fiscal, estado final histórico CDC NULL.
- KuDE consultable antes del final, NO_VERIFICADO claramente rotulado, sin nueva validación inventada.
- Accesibilidad, botones copiar exacto, detalle fiscal de 4 campos, historial oculto por defecto, acciones/vistas JSON preservadas, paginación/filtros sin regresión.
- Tests deben ejercitar FUNCIONES REALES y componentes/helpers reales con dependencias mockeadas; NO crear sólo test regex del texto JSX/SQL simulando que se ha probado lógica. Actualizar casos existentes que esperen `PRO342-R03-F09` viejo. **Escribir, NO ejecutar, NO afirmar PASS.**

## ARCHIVOS PREVISTOS Y ALCANCE ESTRICTO

- Fiscal: `lib/facturacion/reconciliacion.ts`, `gateway.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql` (solo cambios imprescindibles).
- Presentación: `lib/facturacion/presentacion-sifen.ts` (helpers puros si precisos), `app/(private)/documentos/page.tsx`, `app/(private)/documentos/page.module.css` (NO editar CSS global si no hace falta).
- Tests focales de las áreas afectadas: `flujo-fiscal-pro342.casos.ts`, `cdc-inmutable-r03.casos.ts`, `consulta-automatica-fe.casos.ts`, `fat-e2.casos.ts`, tests de listado/estados existentes y nuevo caso de UX sólo si imprescindible.
- Conservar intacto contrato de rutas /api, validaciones de sucursal/empresa, PDF/KuDE viewer salvo título de acción, stock, NCE business, cálculos, séries, secuencias, PRO-340 y toda área no citada. Si aparece una dependencia fuera del listado, informar con justificación ANTES de ampliarla.

## ENTREGA OBLIGATORIA Y STOP

1. Leer `CLAUDE.md`, esta orden, informe integral y SVG. Inspectar archivos completos ACTUALES **UNO POR VEZ**.
2. Publicar un conjunto COHERENTE de commits de la **MISMA R04**, SHA(s) completos, lista de archivos, qué defecto cerró y qué riesgo externo queda abierto. Mantener PR Draft.
3. Todos los casos escritos y conectados al runner real, **0 ejecutados**, sin falsa evidencia de QA.
4. **PARAR para AUDITORÍA INDEPENDIENTE CHATGPT PRO-342-R04.** No trabajar otra issue, no hacer migración/SQL/CI/build/VM/gateway/deploy.
5. Estado **NO HOMOLOGADO** hasta autorización expresa para ejecutar pruebas, comprobar SQL/VM, evidencia del proveedor y revisión visual real de NEXIT; PRO-340 continúa BLOQUEADA.
