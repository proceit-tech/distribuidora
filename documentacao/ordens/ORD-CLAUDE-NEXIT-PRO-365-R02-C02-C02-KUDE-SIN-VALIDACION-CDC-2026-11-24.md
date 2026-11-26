# PRO-369 / PRO-365-R02-C02-C02 — KuDE sin validación adicional de CDC (24/11/2026)

## Decisión de negocio del responsable
«eu nao quero esta frase, eu não quero esta validacao». Sustituye la obligación de aviso y comprobación adicional de correspondencia del KuDE por CDC de C02-C01, exclusivamente en KuDE. HEAD funcional auditado: 9238c0ab4b304c81a9947872ece01b155e35a966. PR #7 DRAFT, rama feature/NEXIT-2026-001-banco-demo. La API del proveedor entrega el PDF solicitado por identidad fiscal; NEXIT no certifica la titularidad del PDF mediante CDC ni exige esa comprobación para mostrarlo. Riesgo residual explícito: si el proveedor devuelve un PDF válido de otro documento, el CDC ya no lo bloqueará; no afirmar que está verificado ni que el proveedor garantiza su correspondencia.

## Alcance
1. En lib/facturacion/gateway.ts revisar interpretarKude y correspondenciaKude. Retirar del flujo KuDE la decisión de aceptar/rechazar el PDF basada en comparar, analizar o validar el CDC retornado (incluido NO_CORRESPONDE derivado exclusivamente de esa comprobación). No modificar el CDC almacenado, su tratamiento en envío/consulta ni la identidad de la solicitud. Conservar contratos internos/cabeceras si son necesarios por compatibilidad, sin fabricar CDC_REGISTRADO/VERIFICADA y sin usarlos como requisito de visualización, descarga o impresión.
2. En lib/facturacion/shared.ts, obtenerKude: nombre normal del documento mediante nombreArchivoKude, sin sufijo -NO-VERIFICADO.pdf. Mantener lectura del documento dentro de empresa/sucursal, permiso VER, identidad FE/NCE/establecimiento/punto/número/serie y continuidad de conexión con la cuenta del envío. No desactivar bloqueos por cuenta distinta.
3. En lib/facturacion/kude-visor.ts y app/(private)/documentos/kude-modal.tsx: título normal dinámico «KuDE · Factura 001-001-0000003» o «KuDE · Nota de crédito …», sin banner de verificación, sin PDF sin verificación, sin sufijo en descarga. No sustituir por otra advertencia de CDC ni mostrar sellos «verificado». Conservar carga, errores reales de obtención, reintento, impresión, descarga nueva, cierre, foco, abortos, Blob, revocación, aislamiento frente a respuestas tardías. No editar bytes del PDF.
4. Endpoint app/api/documentos/[id]/kude/route.ts: solo si necesario para coherencia de nombre/contrato; mantener autorización, Content-Type, no-store, nosniff y manejo de errores. No cambiar URL, método, parámetros ni API del proveedor.
5. Mantener íntegramente validación técnica de status success, HTTP, Base64, PDF válido, límites de tamaño, autenticación, SSRF, timeout y demás controles no relativos a correspondencia por CDC. No aceptar PDF inválido ni ampliar acceso.
6. Buscar consumidores y casos existentes de los símbolos afectados; solo cambios estrictamente ligados a este requisito. No modificar otros módulos. Si el alcance exige más archivos funcionales que los cinco enumerados, STOP y documentar antes de ampliar.

## Casos escritos
- FE y NCE: título y nombre normales, sin aviso ni sufijo, con número/serie correctos.
- Respuesta success con PDF válido: CDC ausente, igual, diferente, no numérico o con espacios no condiciona el retorno; no se escribe ni cambia CDC.
- No emitir clasificación artificial VERIFICADA/CDC_REGISTRADO. Sin cambios en estado fiscal.
- PDF inválido, respuesta de error, tamaño excesivo, cuenta distinta, usuario sin permiso, documento ajeno o fuera del alcance: comportamiento protector intacto.
- Solicitud conserva identidad exacta del documento, nueva consulta al abrir/descargar, sin reutilización, cierre y descarte de respuestas tardías intactos.
- Actualizar únicamente expectativas que contradigan la nueva decisión de negocio; preservar todos los demás casos y explicar cada cambio.
- F01 APROBADO+1109 y F03 cancelación fuera de esta orden; no resolverlos aquí.

## Ejecución
Leer CLAUDE.md y versiones completas más recientes, un archivo por vez. Un solo lote en PR #7 Draft. No SQL, migrations NEX-001..083, motor fiscal, FE/NCE, stock, permisos, otras APIs, VM, Docker, gateway real, tests/lint/build/typecheck/CI manual, merge ni deploy. Solo observar CI automático tras push. Entregar SHA completo, archivos, diff, inventario de casos, resultados CI y riesgos residuales. STOP obligatorio para auditoría ChatGPT. No iniciar R03 ni otro trabajo.