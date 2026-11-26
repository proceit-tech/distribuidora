# ORDEN CLAUDE — PRO-365-R02-C02-C01 — Aviso neutro APROBADO y KuDE NO VERIFICADO — 24/11/2026

**AUTORIZADA POR EL RESPONSABLE: CORRECCIÓN FOCAL DE EXACTAMENTE DOS HALLAZGOS UX. NO repetir C02, R01 o R02 y NO iniciar R03.**

## 0. Identidad, fuentes y puerta de seguridad

- Repositorio `proceit-tech/distribuidora`. Rama `feature/NEXIT-2026-001-banco-demo`. Pull Request **#7 DRAFT**, no fusionado.
- HEAD de autoría de referencia **`7f3f06089b1d8c9b47734daa77cebbc54052c3ec`**. Verificar el HEAD real al iniciar; si otros cambios no documentados han adelantado la rama, STOP y pedir reconciliación sin reescribirlos.
- Linear: [PRO-369](https://linear.app/proceit/issue/PRO-369), subtarea de [PRO-365](https://linear.app/proceit/issue/PRO-365). PRO-365 sigue In Review; este correctivo puede pasar a revisión sin cerrar la homologación visual.
- Leer `CLAUDE.md`, **esta orden completa**, `documentacao/testes/AUD-CHATGPT-NEXIT-PRO-365-R02-C02-2026-11-24.md` y los archivos actuales y completos concernidos **uno por vez**. C02 funcional `5d64e41efc623a7ced020347776ed11631d28943`; fix de casos `715ce6051b1795afc9ce05d6d4900f2aa8fb2da0`; auditoría documental `7f3f06089b1d8c9b47734daa77cebbc54052c3ec`. **Ambos commits ya ejecutados: no repetirlos.**
- Comparar cambios con la referencia de lenguaje legible del usuario; las imágenes de competencia ya están en Git `documentacao/referencias-visuais/PRO-365/` y **no hace falta pedirlas**.
- Se autoriza **SOLO autoría Git de cambios de presentación y casos escritos**. No ejecución manual de tests, lint, typecheck, build, GitHub Actions, SQL, psql, VM, Docker, gateway, deploy ni merge. Observar CI automático de los pushes. STOP para auditoría ChatGPT tras un lote.

## 1. F01 — APROBADO con respuesta anterior posiblemente divergente

**Causa auditada:** `lib/facturacion/documentos-copy-operador.ts:125–130`, `respuestaFiscal(d, fiscal)`, hace `motivo:null, notaHistorial:null` para **todo** `estadoSifen=APROBADO`, incluso si el registro guarda una respuesta `1109 · Número de documento ha sido inutilizado anteriormente`. `lib/facturacion/documentos-c02-lenguaje-pro365.casos.ts:179–184` prueba y acepta este silencio (`C02-11a`), en contradicción con la exigencia de no esconder una posible incongruencia operativa.

**Objetivo exclusivo:** conservar **Aprobado** como estado vigente acreditado y **nunca** presentar `1109` como rechazo actual, pero permitir al operador advertir **neutralmente** que existe información de respuesta anterior o pendiente de verificación, si hay evidencia sólida disponible en el contrato de lectura actual. La respuesta literal, lote, fecha y trazas se consultan en el **Historial técnico**; no borrar, sustituir ni alterar ningún valor.

**Protocolo de decisión antes de tocar código:**

1. Inspeccionar la forma y procedencia reales de `d.estadoSifen`, `d.codRespuesta`, `d.mensajeRespuesta`, `d.ultimaConsultaResultado`, `fiscal.mensaje`, `detalleFiscalPrimario` y la fuente del historial (campos/fechas/identificadores existentes). Explicar qué puede demostrarse y qué **no** puede demostrarse respecto a vigencia/correlación del mensaje.
2. **No clasificar** APROBADO/RECHAZADO/CANCELADO desde texto libre, regex de mensajes, ni simplemente del código `1109` o `0260` sin contrato canónico demostrado. No cambiar `estadoSifen`, iconos, indicadores, numeração, emisor, eventos ni el motor de recepción SIFEN. No inventar campos, timestamps, códigos oficiales, endpoints o estados.
3. Cuando los datos actuales permitan identificar de manera fiable una **respuesta histórica distinta del resultado aprobado vigente**, mostrar en primera capa una nota breve, neutra, sin declarar error: **«Hay una respuesta anterior para revisar en el historial.»** (o copy equivalente sin alarma). Mantener visible `Aprobado` y ocultar el error histórico de la columna `Motivo del rechazo`; el historial completo sigue accesible.
4. **APROBADO normal con respuesta de aprobación `0260 · Aprobado` o sin mensaje no debe recibir una falsa advertencia de rechazo/inconsistencia.** Si la fuente disponible no distingue con fiabilidad respuesta vigente y antigua, **DETENER F01 SIN HEURÍSTICAS**; documentar claramente el bloqueo, datos faltantes y posible presentación informativa alternativa (sin implementarla como si probara inconsistencia). Se puede continuar solamente F02, con informe de F01 pendiente. No abrir backend ni ampliar alcance.
5. Mantener los otros casos C02 inalterados: RECHAZADO y su `Motivo del rechazo` literal, PENDIENTE y nota de historial, `NO_RECONOCIDO`, CANCELADO/INUTILIZADO, y APROBADO histórico con cancelación correlacionada.

**Casos escritos obligatorios:** APROBADO + 0260 válido (sin alarma); APROBADO sin respuesta (sin nota); APROBADO + 1109 histórico con evidencia acreditada (nota neutra, APROBADO preservado, sin motivo actual); si no hay evidencia de correlación, test/caso **pendiente y justificación**, sin forzar PASS; RECHAZADO 1109 conserva motivo; PENDIENTE con mensaje anterior conserva comportamiento; APROBADO + CANCELADO acreditado mantiene semántica sin cambiar icono verde ni estado.

## 2. F02 — Aviso obligatorio del PDF KuDE NO_VERIFICADO en castellano simple

**Causa auditada:** `lib/facturacion/kude-visor.ts:17–20` tiene título y advertencia en primera capa con términos `gateway`, `API`, `CDC`, `pertenencia NO verificada`, demasiados para el usuario administrativo. `kude-modal.tsx` los muestra sobre el PDF. C02 solo modificó el texto de carga `Cargando el KuDE…`.

**Objetivo exclusivo:** sustituir **SOLO el copy** del título/advertencia para PDF `NO_VERIFICADA`. Lenguaje sugerido y criterio obligatorio:

- Título claro: **«PDF sin verificación — [número de factura/nota]»** o equivalente que deje inequívoco que **no está comprobado que sea el KuDE correcto**. No titular un PDF no verificado simplemente `KuDE de esta factura`.
- Aviso **visible, legible, con `role="alert"`**, ejemplo: **«No se pudo confirmar que este PDF corresponda a esta factura. Revise la empresa emisora, el número, la fecha y los importes antes de utilizarlo. Si los datos no coinciden, no lo entregue como KuDE.»**
- Expresar **falta de verificación, no una discrepancia comprobada**. No decir `PDF falso`, `PDF incorrecto`, `rechazado` ni garantizar identidad inexistente. Mantener alerta también en caso de ausencia de cabecera/proveniencia que el sistema trata `NO_VERIFICADA`.
- El `KuDE` **VERIFICADO** debe conservar su título correcto y no mostrar esta advertencia.
- **No alterar** función `pertenenciaDe`, condición de `tituloKude`, constante semántica de `AVISO_KUDE_NO_VERIFICADO`, regla `nombreSegun` que añade `-NO-VERIFICADO.pdf`, `Blob`, `iframe`, lógica de abortar/revocar URL, aislamiento de respuesta tardía, validación de empresa/CDC, endpoint, descarga, impresión, permiso o PDF interno. Específicamente, no retirar aviso para que parezca validado.
- Si los nombres de las funciones existentes siguen siendo técnicos dentro del código, no renombrar sus APIs. Cambiar solo **textos entregados al operador**. Conservar diagnóstico técnico donde ya exista sin contaminar el primer nivel.

**Casos escritos obligatorios:** título y aviso NO_VERIFICADA; título/verificado sin advertencia; Blob sin pertenencia `NO_VERIFICADA` por defecto; download `-NO-VERIFICADO.pdf`; cierre invalida URL/respuestas tardías; comprobación estructural que la modal sigue condicionando alerta a `noVerificado` y muestra el mismo PDF intacto; el aviso no dice `gateway/API/CDC` en la primera capa.

## 3. Alcance estricto de archivos

**Permitidos si necesarios:**
- `lib/facturacion/documentos-copy-operador.ts` — función pura de presentación de F01.
- `app/(private)/documentos/page.tsx` — exclusivamente conectar el aviso neutro si F01 resulta demostrable; no rediseñar la pantalla.
- `lib/facturacion/kude-visor.ts` — **solo dos literales de título/aviso** de F02, sin editar lógica.
- `lib/facturacion/documentos-c02-lenguaje-pro365.casos.ts` y casos KuDE existentes afectados directamente (localizarlos antes de editar) — actualizar afirmaciones históricas con protecciones al menos equivalentes, no borrar pruebas ni silenciar un fracaso.
- Documento de entrega C01, con matriz antes/después y escenarios, fuentes, bloqueos, CI y próximos pasos.

**No modificar nada más** sin una nueva autorización. Si la modificación puntual de un matcher impone un cambio en archivo adicional, documentar la dependencia, no extender arbitrariamente.

## 4. Prohibiciones y entregables

- **Prohibido:** SQL/migrations NEX-001…083, DB/datos, gateway/SIFEN, FE/NCE, CDC, timbrado/numeración, PDF KuDE binario o validación, API/endpoints, permisos/ACL, filtros/KPI/contador, eventos, estado fiscal persistido, stock, reenvíos, empresas, otras pantallas, otros sistemas. F03 (icono verde APROBADO + cancelación) queda **EXPRESAMENTE FUERA DE C01** y pendiente de homologación visual, sin cambio de color ni clasificación.
- No manual tests/lint/typecheck/build/CI, SQL/psql, VM/Docker, gateway, deploy, merge. Solo **CI automático** tras push, que se puede leer y reportar.
- Conservar PR #7 **Draft** y PRO-365 **In Review**. PRO-369 es la tarea focal. Documentar alcance realmente completado vs. parte F01 bloqueada por falta de datos, si ocurre.
- Publicar **un único lote C02-C01** en la rama autorizada con **SHA completo**, archivos cambiados, diffs, matriz F01/F02, casos escritos NO ejecutados manualmente y resultado observado del CI automático. No reejecutar C02/R02, no iniciar R03 u otra ronda.
- **STOP OBLIGATORIO para auditoría ChatGPT.** El CI verde no equivale a homologación visual en la VM, ni autoriza despliegue.
