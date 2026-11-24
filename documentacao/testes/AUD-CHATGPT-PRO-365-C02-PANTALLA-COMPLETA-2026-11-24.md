# AUD-CHATGPT — PRO-365 / Documentos electrónicos — UX integral del operador — 24/11/2026

**DICTAMEN: LA UI ACTUAL NO ESTÁ HOMOLOGADA PARA USUARIO FINAL.** Auditoría **estática del 100% de las SECCIONES de la pantalla** a partir del código versionado y las capturas que facilitó el responsable; **NO equivale a 100% de pruebas funcionales, navegador ni homologación fiscal**. Solo dictamen/orden, ninguna corrección funcional ejecutada.

**Repositorio:** `proceit-tech/distribuidora`, PR #7 DRAFT, rama `feature/NEXIT-2026-001-banco-demo`, base funcional de la UI R02+C01 `fba5be7eed21b4fa324fc6615d7f4e4490302f1b`. Referencias de competencia: `documentacao/referencias-visuais/PRO-365/01_Concorrencia_Filtros_Resumo_Tabela.png` y `02_Concorrencia_Filtros_Leyenda_Estados.png`.

## A. Aclaración crítica: mensaje SIFEN ≠ KuDE

La captura real aportada por el responsable muestra **`Detalle fiscal`** de FE `001-001-0000003` con **`Mensaje: 1109 · Número de documento ha sido inutilizado anteriormente`**, y `SIFEN Rechazado` en el historial. **Ese texto no está incrustado en el KuDE**: en `app/(private)/documentos/page.tsx:1073–1105` se renderiza en una fila del detalle `<dt>Mensaje</dt>` con `fiscal.mensaje`; `lib/facturacion/presentacion-sifen.ts:253–256` lo construye a partir de `codRespuesta + mensajeRespuesta` y usa color rojo solo si `estadoSifen=RECHAZADO`. En contraste, `app/(private)/documentos/kude-modal.tsx:94` renderiza **exclusivamente el Blob PDF obtenido de la ruta correspondiente en un iframe**, sin inyectar el texto de `Mensaje`. El número `1109` es un mensaje de rechazo informado y **no convierte automáticamente el documento local en INUTILIZADO ni CANCELADO**.

**Problema de UX observado:** `page.tsx` presenta `Mensaje` **siempre**, independientemente de `estadoSifen`, mostrando cualquier código/respuesta registrada o `Sin información`. La cabecera del detalle no muestra un resumen fiscal claro (Aprobado/Rechazado/Pendiente/Cancelado/Inutilizado); obliga a interpretar cuatro iconos y un `Mensaje` crudo. Aun si el backend conserva correctamente la última respuesta válida, la UI no garantiza semántica consistente cuando hay mensaje antiguo y estado más reciente; **no ocultar ni interpretar una contradicción sin verificar correlación/fecha**.

**KuDE:** `lib/facturacion/kude-visor.ts:172` ofrece el botón de acceso en FE/NCE **sin filtrar por aprobación**; la descarga/validación real depende del endpoint y del PDF. No afirmar que está disponible ni que está homologado para un RECHAZADO; no activar/desactivar por intuición. `kude-modal.tsx` y `kude-visor.ts` conservan la advertencia crítica de PDF cuya correspondencia **NO_VERIFICADA**: nunca omitirla ni presentar un PDF no comprobado como KuDE verdadero. `page.tsx:1008` añade un título de acción excesivamente técnico (`no confirma por sí...`); `kude-modal.tsx:87` dice `Obteniendo el KuDE del gateway…`.

## B. Matriz de comportamiento fiscal obligatoria (para aprobar el diseño, SIN inventar resultados)

| Estado acreditado | Primera capa: cabecera del detalle | Tratamiento del campo respuesta | Ejes de los iconos | KuDE |
|---|---|---|---|---|
| `APROBADO` | **Aprobado** (verde, claro) | No mostrar una fila genérica `Mensaje: Sin información` ni un error histórico como si fuera la aprobación. Si hay respuesta válida relevante, indicar `Respuesta de SIFEN` sin duplicar; incongruencias deben alertar y conservar evidencia técnica | Envío es fase separada; SIFEN verde `Aprobado`; correo independiente | Solo PDF real obtenido; validación de pertenencia intacta |
| `RECHAZADO` | **Rechazado** (rojo) | **`Motivo del rechazo: [código] · [mensaje]`**, tal como quedó registrado. Si no existe causa, decir `Motivo no informado`, no inventarla | SIFEN rojo; Enviado puede continuar marcado, sin contradicción | No representar rechazo como PDF aprobado. No alterar contrato/servicio por este audit |
| `PENDIENTE`, `SIN_CONSULTA` o `NO_RECONOCIDO` | **Pendiente de respuesta** o **Sin resultado confirmado** según estado real | No exhibir un `Mensaje` de rechazo histórico como resultado actual; mostrar advertencia si hay inconsistencia sin borrar registros | Reloj o neutral apropiado; envío puede estar enviado o incierto | No confundir PDF recuperable con aprobación |
| `CANCELADO` | **Cancelado** | Evento/estado real con fuente y fecha si acreditados; no confundir con aprobación anterior | Diferenciar estado vigente y aprobación histórica; sin alterar persistencia | Mantener las guardas actuales |
| `INUTILIZADO` | **Inutilizado** solo si registrado como tal | No inferirlo del texto de rechazo `1109` | Estado propio, nunca sustituto de `RECHAZADO` | Mantener las guardas actuales |
| `APROBADO` persistido + evento `CANCELADO` correlacionado | **Revisar claridad visual**: debe resultar obvio que ya no está vigente | Aprobación original queda en historia; evento acreditado separado y legible | Evitar icono verde aislado que parezca vigencia actual; preservar base y fuente de evento | No cambiar disponibilidad automáticamente sin contrato |

**Regla de seguridad:** `Enviado` no significa aprobado, `Código del documento registrado` no significa XML descargable ni aprobación. El mensaje `1109` no cambia `estadoSifen` ni habilita anulación automática.

## C. Inventario integral de la pantalla (fuente auditada; sin ejecución)

| Zona | Fuente actual | Hallazgo / decisión UX |
|---|---|---|
| Cabecera / breadcrumb | `page.tsx:785–795` | Conserva jerarquía; título claro |
| Filtros | `page.tsx:797–864` | Preservar búsqueda, emisión, sucursal, tipo, estado y reset. No añadir controles sin API. Revisar densidad/ayudas. |
| KPIs | `page.tsx:100–109, 866–888` | Los títulos/ayudas contienen `gateway`, `resultado fiscal final`, `según el proveedor`; distinguir `Sin e-mail` de `Sin información de e-mail` según grupo real, sin reinterpretar el contador. |
| Leyenda | `page.tsx:919–937` | Cuatro ejes fijos correctos, texto sr-only técnico y leyenda de símbolos redundante; simplificar sin perder semántica accesible. |
| Lista / selección / orden / paginación | `page.tsx:939–1068, 1313–1327` | Preservar diez columnas, datos exactos, filtro/selección por contexto y orden; checkbox selecciona pero no hay operaciones masivas: no inventar acciones. Revisar íconos pequeños/tooltip. |
| Cuatro iconos de estado | `presentacion-sifen.ts:179–240`, `page.tsx:210–211, 1041–1048` | Error P0: `i.corto="Enviado"` existe, pero tooltip usa `i.texto="Envío: recepción confirmada por el gateway (ACK). No es aprobación SIFEN."`; otros iconos igualmente técnicos. Primera capa con textos breves. |
| Acciones por fila | `page.tsx:1005–1014`, `documentos-tabla.ts:88–105` | Tooltip KuDE/Consulta muy técnico, XML/Correo inactivos por falta de operación. Conservar ACL y bloquear botones no operativos. |
| Eventos | `page.tsx:1052–1066`, `documentos-tabla.ts:61–85` | Texto principal breve, pero el tooltip del control concatena justificativas largas de cancelación/inutilización, sin operación efectiva. No fingir `Cancelado`; mantener advertencias de seguridad. |
| Detalle fiscal — PRIMERA CAPA | `page.tsx:1070–1158`, `detalleFiscalPrimario` | Error P0: falta estado explícito en cabecera y `Mensaje` genérico constante. Mantener lote/CDC literal, fecha de firma, motivo rechazado, copiar. Mover referencias técnicas a segunda capa, sin ocultar alertas críticas. |
| Seguimiento y Estados técnicos | `page.tsx:1160–1216`, `seguimientoFiscal` | Segunda capa cerrada por defecto, correcta para APIs/lotes/HTTP; exceso de repetición de cuatro estados y descripciones largas. No dejar estos textos en tooltip principal. |
| JSON / historial de intentos | `page.tsx:1217–1291` | Conservar para soporte; no quitar errores/CDC literal/IDs/JSON/actor/fecha. |
| KuDE visor modal | `kude-modal.tsx:61–95`, `kude-visor.ts:14–22, 172` | PDF real aislado del texto `Mensaje`, con guardas de pertenencia y rechazo por no verificado. Humanizar texto de carga/acciones, conservar warning crítico, no alterar el PDF ni descarga. |
| Mensajes tras consultar/enviar | `page.tsx:716–769` | Feedback crudo concatena HTTP, lote, resultado y mensaje. Debe emitir estado de negocio breve primero; datos completos siguen en historia. Precaución de reenvío indeterminado, no retirar confirmaciones. |
| Responsividad/lectores | `page.module.css`, `page.tsx:145–194` | No se probó navegador. Evitar overflow, pérdida de tooltip, problemas teclado/touch. Requerir capturas post-cambio a 1366/1920 y 320–720. |

## D. Prioridad, límites y solución a encargar

- **P0-01** UX: reemplazar textos técnicos de **TODOS** los tooltips de primera capa de Estado, KPIs, Acciones y alertas por frases operativas claras. `Envío ENVIADO → tooltip exactamente “Enviado”`. No modificar `i.texto` técnico del historial.
- **P0-02** UX: cabecera de **Detalle fiscal** muestra el estado actual válido **Aprobado/Rechazado/Pendiente/Cancelado/Inutilizado**; dejar de imprimir `Mensaje` genérico incondicional. Mostrar **Motivo del rechazo** con código y mensaje en RECHAZADO; para APROBADO, solo datos pertinentes y una respuesta válida si existe. Conservar mensajes crudos en historial. Si hay incompatibilidad real entre estado y mensaje, **NO ocultar inconsistencia para simular aprobado**; advertir y documentar dependencia del backend.
- **P0-03** Semántica: un código de rechazo que dice `inutilizado anteriormente` no convierte el estado registrado de la FE en inutilizado. Un envío confirmado y un rechazo SIFEN pueden coexistir.
- **P1-01** KuDE: no alterar PDF ni el endpoint; humanizar tooltip/modal y mantener advertencia crítica de correspondencia no verificada, distinta de rechazo fiscal. Revisar accesibilidad de error/descarga/impresión. Comprobar que no se muestre KuDE asociado erróneamente a otro documento.
- **P1-02** Informes de estados y eventos: sin jerga, sin textos repetidos y con respuesta comprensible según caso; no volver a ocultar cuatro ejes en historial.
- **P1-03** Listado completo, filtros, KPIs, selección, paginación y mobile: revisión visual exhaustiva y casos escritos; no introducir API/filtros/acciones reales nuevos.
- **P1-04** Confirmar interpretación de `APROBADO` histórico con `CANCELADO` por evento; si solución segura exige cambiar contrato de negocio/API, dejar ese punto **bloqueado para orden independiente**, no inventar.
- **P2** Actualizar títulos de pruebas históricos obsoletos solo si están directamente implicados y no ampliar fuera de este módulo.

**No autorizado:** SQL/migrations, SIFEN/gateway, reenvíos, cancelación, inutilización, KuDE PDF contenido, validación de CDC, numeración, stock, ACL, backend/API, tests/lint/build/manual CI, VM/Docker/deploy, merge o R03. Las pruebas deben ser documentadas y el CI del push puede ser observado. La implementación requiere un lote C02 en PR #7 DRAFT y STOP para auditoría ChatGPT.

**Estado:** auditoría estática completada; las correcciones aún **NO están implementadas ni homologadas**.
