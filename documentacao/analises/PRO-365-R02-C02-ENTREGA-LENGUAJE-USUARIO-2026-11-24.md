# PRO-365-R02-C02 — Entrega: lenguaje de usuario final en «Documentos electrónicos»

- Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-R02-C02-LENGUAJE-USUARIO-2026-11-24.md`
- Auditoría base: `documentacao/testes/AUD-CHATGPT-PRO-365-C02-PANTALLA-COMPLETA-2026-11-24.md`
- HEAD inicial: `9e18ddad19929e7e9acf61d874d82fe80c1ef650` · Branch `feature/NEXIT-2026-001-banco-demo` · PR #7 (Draft)
- Estado: **entregado para auditoría ChatGPT. No homologado visualmente.** Tests, lint, typecheck, build y CI manual **no ejecutados** (orden). Solo CI automático del push.

## 1. Qué cambió

| Archivo | Cambio |
|---|---|
| `lib/facturacion/documentos-copy-operador.ts` (nuevo) | Módulo PURO de textos de primera capa: tooltips de los 4 iconos, encabezado del detalle fiscal, motivo del rechazo, aviso breve, eventos, ayudas de acciones y mensajes tras enviar/consultar. No clasifica: usa el símbolo que ya decidió `iconosEstado`. |
| `app/(private)/documentos/page.tsx` | Usa esos textos en la primera capa. Encabezado del detalle con estado claro. «Mensaje» incondicional sustituido por «Motivo del rechazo» solo con RECHAZADO persistido. Ayudas de KPI, leyenda para lectores, acciones y avisos en castellano llano. Segunda capa sin cambios de contenido técnico. |
| `app/(private)/documentos/page.module.css` | `.estadoFiscal` (pastilla con borde + texto + glifo; colores AA ≥ 5,9:1 sobre blanco) y `.notaEstadoFiscal`; regla forced-colors. |
| `app/(private)/documentos/kude-modal.tsx` | Solo el texto de carga. PDF, endpoint, verificación, título y aviso NO_VERIFICADO intactos. |
| `lib/facturacion/documentos-c02-lenguaje-pro365.casos.ts` (nuevo) + `scripts/casos-clientes/run.js` | Casos C02 (T01–T10, C02-11..17), registrados en el runner. |
| 8 archivos `*.casos.ts` existentes | Matchers actualizados a los nuevos textos (cada uno marcado «actualizado PRO-365-R02-C02»), sin relajar lo que verifican. |

**Sin cambios:** SQL, migrations, APIs, gateway, estados persistidos, `iconosEstado` (símbolo, color, orden), `presentacion-sifen.ts`, `documentos-tabla.ts`, `estados.ts`, `eventos-fe.ts`, `kude-visor.ts`, CDC, numeración, stock, permisos, reenvío, eventos.

## 2. Matriz de textos antes / después (primera capa)

### 2.1 Tooltips de los cuatro iconos (fila)

| Eje · estado | Antes | Después |
|---|---|---|
| Envío · ENVIADO | Envío: recepción confirmada por el gateway (ACK). No es aprobación SIFEN. | **Enviado** |
| Envío · ENVIANDO | Envío: en curso, todavía sin confirmación del gateway. | Enviando |
| Envío · PENDIENTE_ENVIO | Envío: pendiente, todavía no se transmitió al gateway. | Pendiente de envío |
| Envío · ENVIO_INDETERMINADO | Envío: resultado indeterminado. Verifique en el gateway antes de cualquier reenvío. | No se pudo confirmar el envío |
| Envío · ERROR_ENVIO | Envío: el gateway rechazó… / error al enviar al gateway… | Error al enviar |
| XML/CDC · con CDC | XML/CDC: CDC informado por la API y registrado tal cual. No es aprobación SIFEN. | Código del documento registrado |
| XML/CDC · sin CDC | XML/CDC: la API aún no informó el CDC de este documento. | Código del documento pendiente |
| XML/CDC · con aviso | XML/CDC: la última respuesta del gateway no fue interpretable… | Revisar información del documento |
| SIFEN · APROBADO | SIFEN: aprobado (resultado fiscal informado por la API). | Aprobado (o «Aprobado, luego cancelado» con cancelación acreditada) |
| SIFEN · RECHAZADO | SIFEN: rechazo fiscal informado por la API… Motivo registrado: 1109 · … | Rechazado (el motivo va al detalle fiscal) |
| SIFEN · CANCELADO / INUTILIZADO | SIFEN: Cancelado (estado fiscal registrado). | Cancelado / Inutilizado |
| SIFEN · PENDIENTE / SIN_CONSULTA transmitido | SIFEN: pendiente de resultado… (estado registrado: …) | Pendiente de respuesta |
| SIFEN · NO_RECONOCIDO | idem, «Estado no reconocido» | Sin resultado confirmado |
| SIFEN · no transmitido | SIFEN: sin información fiscal (documento aún no recibido por el gateway). | Sin información |
| Correo · 5 estados | Correo: <estado> (independiente del estado SIFEN). | Correo enviado / Correo pendiente / Error al enviar correo / Sin correo / Sin información de correo |
| Aviso «!» | Aviso técnico: <alerta.texto>. <alerta.detalle> | Revisar: <aviso breve> |

Nombre accesible de cada icono: «<eje>: <texto>» (p. ej. «Envío: Enviado»).

### 2.2 Detalle fiscal (primera capa)

| Elemento | Antes | Después |
|---|---|---|
| Encabezado | «Detalle fiscal · <documento>» sin estado | + pastilla de estado: Aprobado · Rechazado · Pendiente de respuesta · Sin resultado confirmado · Cancelado · Inutilizado · Enviando · Error al enviar · Sin enviar |
| Cuarto campo | «Mensaje: <código · mensaje>» siempre (rojo solo con RECHAZADO) | Solo con RECHAZADO: «Motivo del rechazo: 1109 · Número de documento ha sido inutilizado anteriormente» (o «Motivo no informado»). En los demás estados no hay fila. |
| Mensaje anterior en estado no final | se mostraba como «Mensaje» | nota «Hay respuestas anteriores registradas. Se ven en el historial técnico.» |
| Aviso de consulta | Aviso técnico: <alerta.texto>. Última consulta… | Aviso: <aviso breve>. Última consulta… (texto técnico en segunda capa) |
| Rechazo por validación | El gateway rechazó este documento por validación… | El proveedor de facturación rechazó este documento por errores de datos (no es un rechazo de SIFEN)… |
| Envío indeterminado | Verifique el documento en el gateway antes de cualquier reenvío… | Antes de cualquier reenvío, verifique con el proveedor de facturación si el documento llegó… |
| Botón | Enviar al gateway | Enviar documento |
| Tras enviar | <resultado> · HTTP · lote · mensaje · errores | Enviado. Falta la respuesta de SIFEN. / Este documento ya fue enviado; no se reenvía. / Error al enviar. <errores> / No se pudo confirmar el envío. No lo reenvíe sin verificar antes… |
| Tras consultar | <resultado>: <mensaje> · Continuidad de la conexión no verificable… | Consulta realizada… / El servicio de facturación no encontró el documento… / No se obtuvo una respuesta válida… + «Aviso: no se pudo comprobar que la consulta usara la misma cuenta del envío.» |

### 2.3 Indicadores, leyenda, acciones, eventos, KuDE

| Elemento | Antes | Después |
|---|---|---|
| KPI Pend. envío (ayuda) | Recepción del gateway no confirmada (incluye envío indeterminado) | Envíos pendientes de confirmación (incluye los envíos que no se pudieron confirmar) |
| KPI Pend. respuesta | Enviados o envío indeterminado, sin resultado fiscal final | Documentos pendientes de respuesta de SIFEN (incluye los envíos que no se pudieron confirmar) |
| KPI Aprobados / Rechazados | Estado SIFEN aprobado / rechazado | Documentos aprobados / rechazados |
| KPI correo (títulos) | E-mail enviado · Error de e-mail · Sin e-mail | Correo enviado · Error de correo · Sin correo |
| KPI correo (ayudas) | Según el proveedor · Sin información de envío | Correos enviados · Errores de correo · Sin correo o sin información de correo |
| KPI Total | Documentos visibles | Total de documentos |
| Leyenda (lectores) | Envío es la recepción del gateway; XML/CDC indica si la API informó el CDC… | Envío indica si el documento fue enviado; XML/CDC indica si se registró el código del documento, que no es una aprobación; SIFEN es el resultado fiscal; Correo es el envío por correo al cliente… |
| Acción KuDE | Consultar KuDE (PDF) de X: no confirma por sí que el PDF exista ni que esté verificado | Consultar KuDE (PDF) de X |
| Acción consulta | Consultar estado en SIFEN de X | Consultar estado en SIFEN de X (no reenvía) |
| XML / Correo deshabilitados | motivo técnico largo | Descarga no disponible. / Envío no disponible. |
| Eventos (celda) | Cancelado (estado fiscal informado por la API) | Cancelado / Inutilizado / situación del evento |
| Eventos (control) | motivo técnico largo | Cancelación: no disponible. Inutilización: no disponible. |
| KuDE (carga) | Obteniendo el KuDE del gateway… | Cargando el KuDE… |
| KuDE aviso NO_VERIFICADO y título | — | **sin cambios** (advertencia de seguridad) |

## 3. Tabla por zona (C02-16)

| Zona | Copy anterior | Problema | Corrección | Casos |
|---|---|---|---|---|
| Encabezado de página | sin jerga | — | sin cambios | — |
| Filtros | opciones de ETIQUETA_SIFEN («Sin consultar», «Estado no reconocido») | términos técnicos residuales | **sin cambios** (mismas etiquetas que usa el filtro del servidor; cambiar requiere tocar estados.ts, fuera de alcance) | pendiente para R03 si se autoriza |
| KPI | gateway / proveedor / e-mail | jerga | §2.3 | C02-T05b/c, R02-F002-05 |
| Leyenda | gateway / API | jerga | §2.3 | PRO365-R02-10 |
| Tabla / selección | sin jerga | — | sin cambios | — |
| Tooltips / aria | texto técnico largo | ilegible para operador | §2.1, etiqueta con eje | C02-T01..T06, UXR01-13, PRO365-A01b, P338-19 |
| Acciones | coletillas técnicas | jerga | §2.3 | C02-T05d, VIS-21, R01-11 |
| Eventos | texto técnico | jerga | §2.3 | C02-14d, R01-06b, PRO365-A04a |
| Detalle fiscal | sin estado; «Mensaje» siempre | 1109 visible sin contexto; rechazo viejo en APROBADO | §2.2 | C02-T03b, C02-11..15, UXR01-27/28, R01-08a, R04-F5 |
| Avisos | gateway / técnico | jerga | aviso breve; técnico en segunda capa | C02-16a/b, UXR01-33 |
| Historial técnico | completo | — | **sin cambios** | C02-T07 |
| Modal KuDE | «del gateway» | jerga | solo texto de carga | C02-T09 |
| Vacío / carga / error / paginación | sin jerga detectada | — | sin cambios | — |
| Mobile | mismos textos | — | la pastilla de estado usa flex-wrap y la nota ocupa 100% | C02-15 (estático) |

## 4. Escenarios fiscales cubiertos

APROBADO (con mensaje de aprobación y con rechazo histórico registrado), RECHAZADO 1109, RECHAZADO sin mensaje, PENDIENTE con mensaje anterior, SIN_CONSULTA, NO_RECONOCIDO, envío indeterminado, error de envío (validación y transporte), sin enviar, enviando, CANCELADO, INUTILIZADO, APROBADO con cancelación acreditada por evento, sin CDC, correo NO_INFORMADO / SIN_EMAIL, barrido de 175 combinaciones sin jerga.

## 5. Dependencias y límites (no improvisados)

1. **APROBADO:** no hay contrato que garantice que el código/mensaje guardado sea la respuesta de aprobación y no uno anterior; por eso en APROBADO la primera capa no muestra mensaje y queda en el historial técnico.
2. **APROBADO luego cancelado:** el icono SIFEN sigue verde (colores y clasificación no se tocan por orden); el texto, el encabezado y la columna Eventos sí dicen «cancelado».
3. **Filtros:** etiquetas «Sin consultar» / «Estado no reconocido» quedan como están (vienen de `estados.ts`).
4. **KuDE:** título y aviso de verificación no cambian; son advertencias de seguridad.

## 6. Alcance de la evidencia (C02-18)

- **Conformidad estática:** casos escritos sobre funciones puras y texto fuente. **No ejecutados** manualmente.
- **CI automático:** se dispara con el push; su resultado se informa aparte, sin llamarlo homologación.
- **Homologación visual real:** pendiente del responsable en el navegador.
