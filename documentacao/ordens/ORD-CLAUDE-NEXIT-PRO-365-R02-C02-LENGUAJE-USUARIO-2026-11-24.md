# ORDEN CLAUDE — PRO-365-R02-C02 — LENGUAJE DE USUARIO FINAL (24/11/2026)

**AUTORIZACIÓN DEL RESPONSABLE: corregir el lenguaje visible de Documentos electrónicos para una persona NO técnica.** No repetir R01/R02/C01, ni iniciar R03. Autoría exclusiva de copy/presentación local y casos escritos; un commit/PR #7 DRAFT, STOP ChatGPT. No desplegar ni ejecutar manualmente pruebas, builds, SQL, gateway, Docker o VM.

## 1. Origen y evidencia obligatoria

- Repo `proceit-tech/distribuidora`, rama `feature/NEXIT-2026-001-banco-demo`, PR #7 DRAFT, HEAD base `fba5be7eed21b4fa324fc6615d7f4e4490302f1b`.
- PRO-365 In Review; R02 y C01 tienen **CI automático verde**, pero **no están homologadas visualmente**.
- Capturas de la competencia ya versionadas en `documentacao/referencias-visuais/PRO-365/`; usar la competencia como referencia de UX. Capturas de NEXIT aportadas por el responsable el 24/11/2026 muestran tooltips técnicos y un detalle largo.
- Queja literal del responsable: un tooltip dice **`Envío: recepción confirmada por el gateway (ACK). No es aprobación SIFEN.`** y debería decir sencillamente **`Enviado`**. Toda la primera capa de información debe resultar comprensible a vendedores, cajeros, administrativos y personal no técnico.
- **Causa demostrada**: `lib/facturacion/presentacion-sifen.ts:183–184` ya devuelve `corto: "Enviado"`, pero `app/(private)/documentos/page.tsx:210–211` devuelve `i.texto` como `textoFase()`; `:1043` lo pasa como texto principal de `IconoFase`; `:153–161` ese texto termina tanto en `aria-label` como en tooltip mouse/focus/touch. El mismo `i.texto` es utilizado deliberadamente por `page.tsx:1167–1172` en el **Historial técnico**, que debe conservar su precisión.

## 2. Regla central — dos capas reales

**PRIMERA CAPA (operador):** icono, título/tooltip y estados en castellano claro, breve y inequívoco. **SEGUNDA CAPA (Historial técnico/JSON):** gateway, ACK, CDC literal, lotes, trazas, versiones, respuesta HTTP y motivos técnicos completos. Ningún concepto técnico debe contaminar la primera capa. No borrar la segunda ni fingir que los conceptos técnicos desaparecieron del sistema.

**No cambiar** estados persistidos, sus símbolos/colores, orden de cuatro ejes, interpretación fiscal ni `iconosEstado(d)` como máquina de clasificación. Si una etiqueta simplificada altera el sentido, escoger otra sin ambigüedad: `Enviado` significa envío confirmado, **NO** `Aprobado`; un envío indeterminado NUNCA puede llamarse `Enviado`; `CDC informado` NO prueba XML descargable o aprobación. La diferencia se mantiene por eje en leyenda/posición y por datos de estado; la aclaración técnica queda en el historial.

## 3. Matriz obligatoria de textos de los CUATRO iconos

| Eje y condición REAL | Tooltip visible de operador | Datos avanzados |
|---|---|---|
| Envío `ENVIADO` | **Enviado** (EXACTAMENTE este texto) | ACK, gateway, lote, fecha y trazas |
| Envío `ENVIANDO` | Enviando | Detalle del intento |
| Envío `PENDIENTE_ENVIO` | Pendiente de envío | Datos del envío |
| Envío `ENVIO_INDETERMINADO` | No se pudo confirmar el envío | Precaución de reenvío e idempotencia |
| Envío `ERROR_ENVIO` | Error al enviar | Motivo técnico / rechazo del proveedor |
| XML/CDC con CDC informado | Código del documento registrado | CDC literal y procedencia API (no afirmar XML descargado) |
| XML/CDC sin CDC informado | Código del documento pendiente | Estado de la API, si disponible |
| XML/CDC con aviso técnico | Revisar información del documento | Alerta concreta, resultado histórico y CDC, si existe |
| SIFEN `APROBADO` | Aprobado | Decisión fiscal, datos oficiales |
| SIFEN `RECHAZADO` | Rechazado | Código y mensaje, p. ej. rechazo 1109; visible también en Detalle fiscal ya existente |
| SIFEN `PENDIENTE` o sin resultado fiscal final (enviado o indeterminado) | Pendiente de respuesta | Explicación de seguimiento automático sin reenvío |
| SIFEN `CANCELADO` | Cancelado | Fuente oficial y eventos |
| SIFEN `INUTILIZADO` | Inutilizado | Fuente oficial y eventos |
| SIFEN sin transmisión/estado acreditado | Sin información | Estado real y seguimiento |
| Correo `ENVIADO` | Correo enviado | Datos de proveedor, si existen |
| Correo `PENDIENTE` | Correo pendiente | Estado e intentos |
| Correo `ERROR` | Error al enviar correo | Error/causa de proveedor |
| Correo `SIN_EMAIL` | Sin correo | No deducir ausencia de dirección sin evidencia |
| Correo `NO_INFORMADO` | Sin información de correo | No deducir que fue enviado/no enviado |

Estas son etiquetas de **presentación**; no modificar los identificadores de enum ni reescribir los datos históricos. Si algún valor `NO_RECONOCIDO` requiere distinción adicional del `PENDIENTE`, preservar esa incertidumbre sin declararlo aprobado/rechazado ni afirmarlo falsamente como respuesta pendiente.

## 4. Áreas de interfaz que también necesitan lenguaje llano

1. Iconos de la fila: `title` (si existe), tooltip de `IconoFase`, `aria-label` y texto visible del usuario: breve y comprensible. La accesibilidad podrá anteponer el eje para desambiguar (ej. `Envío: Enviado` leído por screenreader), **pero el tooltip visual debe decir solamente `Enviado`**. No sustituir información precisa de historial por copy de operador.
2. KPIs `INDICADORES.ayuda` usados como `title`: reemplazar expresiones `gateway`, `API`, `proveedor`, `ACK`, `resultado fiscal final`, `SIN_CONSULTA`, `CDC_DIVERGENTE` por textos naturales. Ejemplos: `Envíos pendientes de confirmación`, `Documentos pendientes de respuesta`, `Documentos aprobados`, `Documentos rechazados`, `Correos enviados`, `Errores de correo`, `Sin información de correo`. No alterar contador, filtro, empresa, alcance ni orden.
3. Iconos de `Acciones` en la fila: mantener las operaciones honestamente deshabilitadas, pero usar ayuda sencilla (ej. `XML: descarga no disponible`, `Correo: envío no disponible`) y no justificar al operador que `no existe una operación comprobada del gateway`. El motivo técnico sigue disponible en documentación o detalle avanzado si ya está allí. No activar XML, correo ni botones sin backend.
4. Aviso técnico (quinto icono), `Eventos`, mensajes de error/ayuda del **primer nivel**: inventariar y corregir solo expresiones innecesariamente técnicas. Mantener cualquier advertencia de seguridad importante sin simplificarla hasta el punto de inducir reenvíos peligrosos. Mantener código/mensaje de rechazo **en el Detalle fiscal**, ya que es información de negocio útil para resolver la incidencia; no ocultarlos.
5. La leyenda visible puede seguir los cuatro ejes `Envío · XML/CDC · SIFEN · Correo` porque los iconos se distinguen por ubicación; el texto explicativo extenso para lector de pantalla debe ser accesible, comprensible y exacto. El historial avanzado sí conserva terminología técnica.
6. Mantener UI española con ortografía natural. No inventar mensajes de acción completada ni cambiar estados solo por parecer más amigables.

## 5. Implementación mínima y aislamiento

Revisar `CLAUDE.md`, esta orden, el código COMPLETO y ACTUAL de `page.tsx`, `presentacion-sifen.ts`, `documentos-tabla.ts`, `estados.ts` y sus pruebas. **Un archivo por vez**.

Preferir una función PURA de presentación de *copy de operador* para el nivel de fila, reutilizando `i.corto`/el eje y los enums ya derivados, en `page.tsx` o módulo puramente visual indispensable. **No cambiar `i.texto` utilizado por `Historial técnico` si eso altera su precisión**. Si hay un motivo empresarial necesario en primer nivel, ponerlo como mensaje breve/estado separado, NO concatenar párrafos de API con el tooltip.

Alcance autorizado: `app/(private)/documentos/page.tsx` y helpers de PRESENTACIÓN estrictamente necesarios, `lib/facturacion/documentos-tabla.ts` solo si resulta imprescindible cambiar el motivo presentado sin modificar guardas, `presentacion-sifen.ts` solo si no se puede hacer la separación de capas en página, casos existentes directamente relacionados + nuevos casos escritos y documento de entrega. No editar lógica de clasificación, backend/API, SQL, migraciones, gateway, CDC, KuDE, stock, ACL ni otras pantallas.

## 6. Pruebas documentadas y criterios de aceptación

- **T01**: en una FE con `estadoLocal=ENVIADO`, el primer tooltip de Envío dice **EXACTAMENTE `Enviado`** y NUNCA `gateway`, `ACK` ni `No es aprobación SIFEN`.
- **T02**: los otros estados de envío tienen nombres distintos; indeterminado y error nunca aparecen como `Enviado`.
- **T03**: los cuatro iconos permanecen en su lugar y estados reales por eje: XML/CDC ≠ SIFEN; rechazo 1109 del ejemplo sigue como `Rechazado` en SIFEN, con código y mensaje preservados en detalle.
- **T04**: los cinco estados de correo tienen traducción clara, sin afirmar envío inexistente.
- **T05**: iconos de acción y KPIs tienen títulos breves, sin lenguaje de infraestructura innecesario.
- **T06**: accesibilidad real de mouse/foco/teclado/touch preservada; label sin jerga y desambiguado por eje para lectores.
- **T07**: historial técnico conserva `gateway/ACK/API/HTTP/CDC` cuando son datos relevantes, incluyendo JSON, códigos y respuestas; la simplificación se limita a primera capa.
- **T08**: ninguna modificación de estados, conteos, permisos, emisión, consulta, reenvío, stock, números fiscales o endpoints.
- **T09**: cobertura explícita para `ENVIO_INDETERMINADO`, `NO_RECONOCIDO`, ausencia de CDC y correo sin información; no falsificar.
- **T10**: ningún estado `APROBADO` se infiere de `Enviado` o `CDC registrado`; eventos cancelados con SIFEN histórico aprobado continúan distinguibles.

**Casos escritos, NO ejecutados manualmente** por Claude. El CI automático por push puede observarse. No afirmar homologación visual sin captura NEXIT renderizada + aceptación responsable.

## 7. Publicación y STOP

- Un lote focal `PRO-365-R02-C02` en la rama existente, PR #7 sigue DRAFT y sin merge.
- Entregar diff, SHA completo, archivos modificados, matriz antes/después de TODOS los textos de primera capa y casos escritos; registrar otras frases técnicas que no se puedan cambiar sin otro alcance.
- **NO ejecutar** tests, lint, typecheck, build, SQL/psql, GitHub Actions manual, VM, Docker, gateway, deploy ni merge.
- STOP para auditoría ChatGPT. **NO iniciar R03 ni otras rondas**, no modificar el servidor.
