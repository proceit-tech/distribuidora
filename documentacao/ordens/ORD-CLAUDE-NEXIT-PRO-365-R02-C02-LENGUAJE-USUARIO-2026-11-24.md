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


## 8. AMPLIACIÓN VINCULANTE DEL RESPONSABLE — AUDITAR Y CORREGIR EL 100% DE LAS SECCIONES VISIBLES

El responsable amplió expresamente el encargo el **24/11/2026**: **«¿Y si es aprobado, cómo queda? ¿Quién pidió poner ese mensaje en el KuDE? Revisar 100% la pantalla»**. La presente ampliación sustituye cualquier interpretación que limite C02 exclusivamente a las palabras de los cuatro iconos. Sigue siendo una **corrección de UX/solo presentación de Documentos electrónicos**, no una autorización de nueva lógica fiscal/backend.

**Leer y aplicar íntegramente el dictamen complementario**:

`documentacao/testes/AUD-CHATGPT-PRO-365-C02-PANTALLA-COMPLETA-2026-11-24.md`

### A. Aclaración demostrada que se debe conservar

El texto `1109 · Número de documento ha sido inutilizado anteriormente` de la captura **NO está insertado en el PDF KuDE**. Es el campo `Mensaje` del panel `Detalle fiscal` (`page.tsx:1102–1103`), cuya fuente es `detalleFiscalPrimario(): codRespuesta + mensajeRespuesta`. `kude-modal.tsx` presenta el Blob PDF recibido en un iframe sin insertar esa cadena. No trasladar el mensaje de SIFEN al KuDE ni alterar el PDF. El error 1109 puede explicar un RECHAZO, **no transforma automáticamente el documento en INUTILIZADO**. El KuDE original y su control de correspondencia VERIFICADA/NO_VERIFICADA deben permanecer intactos.

### B. Problema adicional P0 de UX que C02 DEBE solucionar

**Actualmente la cabecera `Detalle fiscal` NO declara claramente `Aprobado`, `Rechazado`, `Pendiente`, `Cancelado` o `Inutilizado` y la fila `Mensaje` se muestra SIEMPRE, incluso con estado APROBADO o sin mensaje.** Cambiar solo los tooltips de iconos **NO** satisface la petición.

Implementar **presentación condicional segura**, basada en el estado/resultado real existente:

- **APROBADO:** encabezado claro `Aprobado`, con icono verde. En la primera capa no mostrar `Mensaje: Sin información` ni presentar un mensaje viejo de rechazo como si fuese el resultado aprobado. Cuando exista respuesta SIFEN comprobable y pertinente, identificarla como tal sin agregar un párrafo técnico. Las respuestas crudas permanecen en historial.
- **RECHAZADO:** encabezado rojo `Rechazado`; en lugar de `Mensaje` genérico, poner `Motivo del rechazo` con **código y mensaje reales**. En el caso mostrado, `1109 · Número de documento ha sido inutilizado anteriormente`. No ocultar el dato ni convertirlo en estado de inutilización.
- **PENDIENTE/SIN_CONSULTA/NO_RECONOCIDO:** encabezado no-final distinguible (`Pendiente de respuesta` o `Sin resultado confirmado` según información real); ningún mensaje antiguo de rechazo debe parecer vigente.
- **CANCELADO/INUTILIZADO:** encabezado con su condición registrada (o evento cancelado oficialmente acreditado si el contrato actual así lo determina); no deducir esos estados a partir del cuerpo de un mensaje fiscal.
- **APROBADO histórico + CANCELADO por evento:** evitar que la pantalla sugiera vigencia activa con un icono verde aislado; si requiere contrato de negocio distinto, marcar bloqueo, sin cambiar API ni persistencia.
- **Contradicción entre estado persistido y código/mensaje:** no ocultar/falsificar para conseguir `Aprobado`; mostrar aviso neutro de revisión y conservar evidencia, aclarando qué campos existentes permiten comprobar correlación/fecha. Si no existe contrato seguro para separar respuesta vigente de histórica, detener solo esa parte y solicitar orden específica para backend.

No alterar `detalleFiscalPrimario` como fuente fiscal ni recortar CDC, lote, fecha de firma, rechazo o número. Preferir **una nueva capa PURA de copy/selección de campos visuales**, usando el estado ya acreditado y preservando campos crudos en el historial.

### C. Auditoría COMPLETA de todas las zonas de UI (no solo iconos)

Revisar y entregar una tabla **zona × copia actual × problema × corrección × casos escritos**, sin excluir:

1. Cabecera y navegación.
2. Filtros por fechas, sucursal, cliente, tipo, estado y limpieza; comportamiento real sin botones falsos.
3. Tarjetas KPI, sus `title`, ayudas accesibles, cifra/filtro, caso `SIN_EMAIL` vs `NO_INFORMADO`.
4. Leyenda de cuatro fases y significado de iconos.
5. Tabla de diez columnas, orden, fechas/horas, monedas DECIMAL exactas, FE/NCE/serie.
6. Checkboxes, selección y barra sin acciones masivas; no inventar funciones.
7. **Todos** los tooltips, `aria-label` y títulos de Acciones (KuDE, XML, Consulta, Correo), Estados (cuatro + aviso), Eventos.
8. Detalle fiscal de primera capa con estado visible y motivos condicionales; copia de lote/CDC sin pérdidas.
9. Alertas críticas de envío incierto, error y rechazo, con lenguaje claro pero **sin reducir advertencias de seguridad** ni reenvío automático.
10. Detalle/historial técnico (segunda capa), estados de seguimiento, eventos, solicitudes, respuestas JSON, HTTP, actor, fecha y trazas; conservar su precisión y evitar duplicación innecesaria.
11. Modal de KuDE: carga, aviso de PDF NO_VERIFICADO, descargar/imprimir/reintentar; nunca cambiar contenido PDF, endpoint ni verificación.
12. Estados vacío/cargando/error, paginación, selección obsoleta, cambios de filtros, hover/teclado/toque/scroll/zoom, mobile/desktop.

### D. Criterios adicionales de aceptación

**C02-11** Primera capa APROBADO muestra `Aprobado` explícito, sin `Mensaje` incondicional.

**C02-12** Primera capa RECHAZADO muestra `Rechazado` + `Motivo del rechazo` real; caso 1109 se conserva en detalle, no en PDF KuDE.

**C02-13** PENDIENTE, CANCELADO e INUTILIZADO distinguidos sin inferir de texto sucio; escenarios contradicción/documentos con historial comprobados o declarados bloqueados.

**C02-14** Los cuatro estados siguen independientes; `Enviado` no significa aprobado y `Código registrado` no significa PDF/XML disponible.

**C02-15** Modal KuDE conserva PDF de respuesta, validación de pertenencia y avisos críticos; ningún mensaje fiscal añadido al PDF. El botón por tipo FE/NCE no se interpretará como prueba de disponibilidad de PDF ni de aprobación.

**C02-16** Inventario del 100% de zonas arriba enumeradas y de cada texto técnico de la primera capa, con tabla antes/después; no tocar negocios externos.

**C02-17** Casos escritos para APROBADO con y sin mensaje, RECHAZADO/1109, SIN_CONSULTA, PENDIENTE, CANCELADO, INUTILIZADO, envío indeterminado, ausencia de CDC, correo sin estado, PDF NO_VERIFICADO y conflicto respuesta/estado. **No inventar fixtures SIFEN ni declaraciones de éxito en navegador.**

**C02-18** Diferenciar conformidad estática, CI automático y homologación visual real por el responsable. No declarar `100% homologado` solo por leer todo el código.

### E. Scope y STOP

Se autoriza exclusivamente presentación/UX de `/documentos`, `kude-modal.tsx` si **solo** cambia copy manteniendo las protecciones, helpers puros estrictamente necesarios, casos escritos y documentación de entrega. **NO** cambiar PDFs de KuDE, su identidad/verificación/endpoint, lógica de estado fiscal, enums persistidos, APIs, SQL, migrations, gateway, stock, permisos, reenvíos, exportaciones o eventos. La falta de contrato seguro deja dependencia anotada, no permite improvisar. Publicar **UN ÚNICO lote C02** y STOP ChatGPT, PR #7 DRAFT, no tests/lint/build/CI manual/SQL/VM/Docker/deploy/merge ni R03.

**La R02 y C01 ya estaban ejecutadas y auditadas. C02 NO está implementada; esta es la orden completa actualizada que las sustituye.**
