# ORDEN CORRECTIVA FOCAL — PRO-342-R02 / Correlación de KuDE, conexión y lote íntegro

**Fecha:** 11/11/2026
**Repo/rama:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.
**Commit R01 auditado:** `abed113625d508f31653a4981287685ab66c9453` (14 archivos).
**Auditoría independiente OBLIGATORIA:** [AUD PRO-342-R01](../testes/AUD-CHATGPT-PRO-342-R01-FLUXO-FISCAL-INTEGRAL-2026-11-11.md).
**Definición vigente:** [PRO-342 simplificada](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Estado:** R01 **NO CONFORME INTEGRALMENTE**; su núcleo `XML firmado` INTERMEDIO → reconsultar hasta `Aprobado`/`Rechazado` es **CONFORME ESTÁTICAMENTE** y NO DEBE REHACERSE.

## OBJETIVO Y PRINCIPIOS

Esta R02 **NO es una nueva arquitectura ni un nuevo parche CDC**. Corregir exclusivamente los hallazgos R01-F001/F002/F003/F004 preservando la solución integral ya escrita.

- Enviar JSON UNA vez, guardar lote literal y toda respuesta; NO reemitir.
- `XML firmado` es PRIMER ESTADO INTERMEDIO. La consulta automática existente debe repetir el MISMO documento hasta `Aprobado` o `Rechazado`, con historial append-only. KuDE puede estar habilitado durante XML firmado, sin equivaler a APROBADO.
- CDC SOLO de la API por campo de contrato, exactamente recibido, nunca calculado ni modificado. Sin nuevos algoritmos para RUC/DV/fecha/checkdigit/serie, sin nuevas cuentas de test por suposición, sin OCR del PDF.
- No cambiar contratos KuDE FE (5 campos) y NCE (6, ncr+tipOpe 4), serialización SIFEN ni validaciones de documentos de otras áreas.

## R02-01 (F002) — Una única configuración efectiva de ENVÍO y origen verificable para consultas/KuDE

1. `emitirFactura` actualmente lee `configuracionGateway` como preflight y `enviarDocumento` vuelve a leerla. Ajustar para que el envío de la misma operación use **la misma configuración válida capturada una vez**; mantener ruta independiente `enviarDocumento` compatible y segura. No dejar que una modificación concurrente de URL/ref entre preflight y POST cambie silenciosamente la identidad de la emisión.
2. NEX-079 guarda `host/credencialRef/credencialesVersion` por intento, pero CONSULTA/KUDE hoy usan indiscriminadamente la configuración ACTUAL. Si existe referencia de conexión confiable del envío, comprobar compatibilidad antes de consultar/mostrar KuDE; cuando la cuenta/host cambió y no hay cómo usar la original, **informar incidencia de conexión de documento histórico en vez de afirmar identidad falsa**. No cambiar URLs ni credenciales; no consultar cuenta antigua por tanteo. No suponer que la ausencia de NEX-079 prueba conexión equivocada: documentos históricos necesitan tratamiento de compatibilidad honesto.
3. No introducir dependencia circular ni forzar nuevas llamadas HTTP para `Probar conexión`; la validación de login sigue siendo solo login. La fuente de credenciales mantiene tenant/permiso actual.
4. Casos: cambio de configuración entre preflight y transmisión; cambio después del envío antes de consultar/abrir KuDE; sin snapshot NEX-079; tenant ajeno; persistencia de host/version efectivos sin contraseña/token.

## R02-02 (F001) — KuDE sin atribución falsa de documento

1. El CÓDIGO R01 permite `IDENTIDAD` cuando `cdcRegistrado=NULL` y la respuesta trae CDC de otro RUC pero MISMO tipo/EEE/PPP/número (`correspondenciaKude` solo compara esos campos); y permite `NO_VERIFICABLE` como `ok:true,pdf` sin advertencia en la modal. Esto reproduce el RIESGO original de CASA MINGO.
2. **NO introducir RUC/DV/fecha/checkdigit calculados como nueva validación fiscal**; el responsable no lo autorizó. Primero comprobar si el contrato actual del gateway y el vínculo con la cuenta original/CDC recibido del XML firmado ya suministran evidencia suficiente **para ese documento**, inclusive su serie. Proteger correlación de respuesta a la solicitud antes de titular/descargar como KuDE del contribuyente.
3. Mantener la posibilidad de solicitar KuDE durante `XML firmado`, sin exigir APROBADO ni un CDC local. Si la API no permite demostrar titularidad/serie, NO etiquetar `NO_VERIFICABLE` como correspondencia confirmada ni usar título «KuDE factura CASA MINGO» sin distinguirlo. Si resulta necesario restringir la visualización para evitar documento ajeno, exponer claramente el bloqueo por falta de evidencia, **sin fabricar PDF ni CDC**, y justificar la compatibilidad con PRO-326. Respuesta con CDC claramente discordante debe permanecer `NO_CORRESPONDE`.
4. **Límite del contrato:** si probar pertenencia del PDF requiere datos del proveedor no presentes en Git/documentos, **DETENER ESTA PARTE CON DIAGNÓSTICO CONCRETO** en vez de diseñar nuevas reglas RUC, OCR o suposiciones fiscales. NO afirmar corrección completa del problema hasta que exista el vínculo. Otros arreglos R02 que sean plenamente determinados pueden publicarse por separado bajo el MISMO alcance.
5. Casos imprescindibles: documento con CDC local NULL, gateway retorna CDC de EMISOR DISTINTO con exactamente mismo EEE/PPP/número/serie; KuDE con CDC ausente; mismo número en dos cuentas; CDC local existente coincidente/divergente; FE/NCE legítima durante XML firmado. La ausencia de validación de un campo fiscal PROHIBIDO no debe ocultarse como «caso conforme».

## R02-03 (F003) — Lote literal

`gateway.ts::interpretarRecepcion` hace `String(loteBruto).trim()` antes de registrar. Nunca normalizar silenciosamente un identificador externo que deba ser EXACTO. Preservarlo tal cual si el contrato lo admite; si tiene caracteres invalidantes, regresar resultado indeterminado con diagnóstico en lugar de registrar un lote distinto. Casos con lote limpio, rodeado por espacios, con caracteres de control y contraseña sintética coincidente con parte del RUC. Mantener sanitización de textos libres, no tocar `cdc`.

## R02-04 (F004) — Modo compatibilidad NEX-079 sin enmascarar errores reales

`shared.ts::registrarConConexion` usa cualquier error `42883` para retroceder a función vieja. Confirmar que el error sea **específicamente por ausencia de la sobrecarga NEX-079**, no por función interna ausente tras migración defectuosa. Sin NEX-079 todavía se conserva intento, pero NO conexión ni CDC estructurado en consulta manual: describir como **modo degradado, NO homologación**. No omitir ni sobreescribir historial. Caso mock para sobrecarga ausente vs dependencia interna ausente. Si requiere nueva migration para resolver un defecto focal, debe ser aditiva VERSIONADA y NO aplicada; consultar antes de ampliar esquema fuera de NEX-079.

## ARCHIVOS / CAMBIOS
Leer versión COMPLETA MÁS RECIENTE de cada archivo, UNO POR VEZ. Cambios focales previstos en `lib/facturacion/envio.ts`, `shared.ts`, `gateway.ts`, KuDE visor/API si estrictamente necesario, tests `flujo-fiscal-pro342.casos.ts` y `kude.casos.ts`. No editar SQL anterior de producción, stocks, NCE, NEX-077/078, limite FE, PRO-340 ni estados SIFEN del R01 conformes. La NEX-079 versionada existente se reevalúa estáticamente, pero **no se ejecuta**.

## ENTREGA / GATES
- Publicar commit(s) del MISMO alcance PRO-342-R02, SHA(s) completos, archivos y casos focales ESCRITOS (0 EJECUTADOS), síntesis de riesgos cerrados versus dependencia del proveedor que sigue sin resolver. Parar para auditoría ChatGPT PRO-342-R02.
- **NO EJECUTAR** tests, lint, typecheck, build, CI, SQL/migrations, consulta a gateway real, VM/Docker, navegador o deploy. No tocar documentos históricos ni reconstruir CDC/lotes.
- Si la correlación segura de KuDE depende de contrato del proveedor ausente, STOP diagnóstico de esa parte; reportar falta de evidencia, no inventar solución o declarar producción conforme.
- Mantener PRO-342 P0 In Progress; PRO-338-R06 absorbida/espera; PRO-340 BLOQUEADA.
