# PRO-342 — REAUDITORÍA INTEGRAL DE FACTURACIÓN Y EXPERIENCIA VISUAL DE ESTADOS

**Fecha:** 11/11/2026
**Responsable del análisis y criterios:** ChatGPT / PROCEIT (negocio, integración, seguridad y UX); **Claude:** desarrollador cuando sea autorizado.
**Código funcional de referencia:** \`baa419492933650ed079230d9b01303e4aee4bd0\`; archivos leídos de la rama \`feature/NEXIT-2026-001-banco-demo\` tras los commits documentales.
**Evidencia visual del usuario:** 2 capturas del proveedor E-FacturaHub, lista de documentos y detalle expandido del documento \`001-003-0009021\`. En ellas aparece una fila con acciones compactas, varios íconos de estado independientes, y expansión de **Nro lote, CDC, Fecha firma y Mensaje «Número de timbrado inválido»**. El significado exacto de cada icono propietario sin leyenda no se presume ni se copia ciegamente.
**Documentación base:** [Especificación PRO-342](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md), [auditoría R03-01](AUD-CHATGPT-PRO-342-R03-01-CORRECCION-CDC-OBLIGATORIO-2026-11-11.md), [NEX-079](../banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql).
**Alcance auditado en código:** \`gateway.ts\`, \`gateway-credenciales.ts\`, \`configuracion-gateway.ts\`, \`envio.ts\`, \`emision.ts\`, \`nce-emision.ts\`, \`reconciliacion.ts\`, \`shared.ts\`, \`consulta-automatica.ts\`, \`estados.ts\`, \`presentacion-sifen.ts\`, \`kude-visor.ts\`, \`refresco-documentos.ts\`, \`documentos/page.tsx\`, \`documentos/page.module.css\`, \`documentos/kude-modal.tsx\`, \`components/ui/lista-padrao/lista.module.css\`, API rutas listado/detalle/envío/consulta/KuDE, SQL NEX-054/062/077/079 y casos PRO342/FAT-E2/PRO338; se revisaron líneas/funciones relacionadas, NO se ejecutaron los tests.
**Limitaciones:** Sin acceso a VM, PostgreSQL real, ambiente proveedor ni respuestas JSON originales de CASA MINGO. No se montó la app ni se verificó en navegador la pantalla NEXIT; la comparación visual proviene de las capturas del proveedor y la estructura JSX/CSS. **0 tests, 0 lint, 0 build, 0 SQL, 0 migration, 0 gateway, 0 despliegue y 0 cambios fiscales**.

## 1. DICTAMEN REAL: NO LIBERAR A PRODUCCIÓN NI DECLARAR «SIN FALLAS»

La ronda R03-01 corrigió estáticamente la aceptación de un final SIFEN con CDC NULL. Pero hay brechas concretas de código y de interfaz que la aprobación focal anterior no detectó, además de riesgos operacionales sin evidencia suficiente. **El objetivo del responsable es una sola corrección consolidada después de esta reauditoría, NO una secuencia infinita R04/R05 por cada síntoma.** Antes del desarrollo se debe definir alcance y luego demostrar casos ejecutados.

### A — HALLAZGOS CONFIRMADOS POR CÓDIGO

**AUD-01 / P0 — «XML firmado» sin CDC en la RESPUESTA ACTUAL se acepta si el documento ya tenía CDC previo.**
- \`lib/facturacion/reconciliacion.ts:31–39\`: \`sinCdc = r.cdc === null && doc.cdc === null\`. Si el documento ya tenía CDC, una respuesta \`XML firmado\` que omite CDC queda \`OK/PENDIENTE\`.
- \`lib/facturacion/flujo-fiscal-pro342.casos.ts:728–732\` (PRO342-R03-F09) **confirma esa expectativa**: \`d(conCdc, rc("XML firmado",null)) -> OK/PENDIENTE\`.
- Contradice la regla literal que el responsable reiteró: **el proveedor informa CDC con «XML firmado»; si no vino en ese retorno, NO tratarlo como firma recién acreditada**. Un final posterior \`Aprobado/Rechazado\` sí puede no repetir CDC SI ya estaba registrado para ese documento, como el responsable autorizó.
- **Corrección mínima:** si estado crudo = \`XML firmado\` y el campo CDC de ese retorno no tiene 44 dígitos originales válidos, registrar el intento como anomalía \`RESPUESTA_INVALIDA\`, preservar CDC previo y continuar consultas; NO reescribir CDC ni estado final. No modificar estados finales, ni generar CDC.

**AUD-02 / P1 ALTO — CDC se normaliza con \`.trim()\` en vez de conservar/validar los bytes recibidos.**
- \`gateway.ts:310–314\`: helper \`texto()\` recorta strings. \`gateway.ts:345–362\`: el CDC de \`response.DE.CDC\` se lee con ese helper. \`gateway.ts:708–710\`: un CDC procedente de \`recepcion_de\` también usa \`.trim()\`.
- Un valor remoto \`" 44DIGITOS "\` podría transformarse silenciosamente en CDC válido, en vez de invalidarse, aunque el contrato pide recibirlo EXACTAMENTE. **No se afirma que el proveedor haga eso hoy**; es un defecto lógico probado por código.
- **Corrección mínima:** para CDC exclusivamente, leer string crudo y validar \`^\d{44}$\` sin \`trim()\`, sin cambios, sin calcular ni completar; conservar la evidencia cruda saneada como corresponde; si malformado no convertir en «CDC ausente» cuando la respuesta afirma \`XML firmado\`/final.

**AUD-03 / P1 — NEX-079 no impone por sí sola CDC para \`XML firmado\` (solo para estados finales).**
- \`NEX-079:118–124\` obliga CDC en final \`APROBADO/RECHAZADO/CANCELADO/INUTILIZADO\`; no comprueba \`p_estado_gateway='XML firmado'\` y \`p_estado_sifen='PENDIENTE'\` cuando \`coalesce(p_cdc,d.cdc)\` es nulo.
- El camino NEXIT actual aplica la guarda TS antes de registro, lo cual protege el uso normal; una invocación a la función \`SECURITY DEFINER\` directa o un consumidor adicional podría grabar \`PENDIENTE\` como firma validada sin CDC. **Es defensa en profundidad pendiente en la NEX-079 aún no aplicada**, sin tocar las migrations históricas.

**AUD-04 / UX P0 DEL PEDIDO — la lista actual NO entrega el diseño compacto con íconos de estado.**
- \`documentos/page.tsx:509–562\`: la celda «Estados» muestra hasta cinco bloques de texto: \`SIFEN:...\`, alerta técnica, \`Envío:...\`, correo y \`Requiere revisión\`. No hay un pictograma por eje del proceso fiscal.
- \`documentos/page.tsx:578–705\`: al expandir la fila se cargan **dos grandes \`dl\`**, descripciones largas, explicaciones repetidas, mensajes, JSON y historial completo sin una jerarquía visual compacta. No sigue el patrón operativo simple que el usuario ya solicitó.
- \`presentacion-sifen.ts:17–35\`: el color del estado fiscal se deriva del estado SIFEN persistido (bien), pero **no inspecciona CDC para advertir estado final incoherente legado**. Un registro viejo con \`estado_sifen=APROBADO\` y \`cdc=NULL\` recibiría etiqueta verde sin advertencia. No cambiar el estado fiscal en la UI: **mostrar icono de alerta de integridad**, sin inventar otro estado.
- \`documentos/page.tsx:559–560\`: se imprime estado envío y correo con texto extenso en la misma celda. **La interfaz es funcional, pero es más densa y menos directa que la referencia del proveedor.**

**AUD-05 / UX P1 — «Ver KuDE» promete disponibilidad aunque solo está disponible la acción de consultar.**
- \`kude-visor.ts:171–172\`: \`kudeDisponible\` retorna TRUE para cualquier FE/NCE; sólo expresa que está permitida la solicitud, no que el gateway tenga PDF. \`page.tsx:566–569\` titula la acción «Ver KuDE (PDF)» sin indicar que debe consultar la API.
- **Corrección mínima de presentación:** icono de acción «Consultar KuDE»; icono de estado \`KuDE disponible\` sólo si hay evidencia real del proveedor, nunca derivarlo únicamente del tipo de documento o de \`XML firmado\`. No hacer un POST adicional solo para pintar la lista; si no existe metadata de disponibilidad, mostrar icono de acción neutro.

### B — RIESGOS CONOCIDOS NO RESUELTOS POR CÓDIGO NI POR LAS CAPTURAS

**RISK-01 / P0 GATE — el PDF KuDE todavía no está ligado inequívocamente al EMISOR real.**
- \`gateway.ts:937–977\`: \`CDC_REGISTRADO\` verifica sólo igualdad de CDC **en el JSON de respuesta** con CDC persistido en NEXIT; no demuestra que el contenido BINARIO del PDF pertenezca al mismo emisor.
- Con CDC local ausente o respuesta PDF sin CDC, \`NO_VERIFICADO\` permite visualizar. \`kude-modal.tsx:75–85\` permite **DESCARGAR E IMPRIMIR incluso siendo NO VERIFICADO**, aunque hay advertencia y nombre \`NO-VERIFICADO.pdf\`.
- El caso histórico CASA MINGO recibió PDF visible de otro emisor. La documentación antigua de pruebas permite que un emisor de test muestre marca de la Distribuidora; no se ha demostrado con logs qué cuenta realmente atendió la solicitud. No afirmar fuga real entre tenants sin datos.
- **Decisión operativa pendiente:** cuando no se puede acreditar titularidad, no titular el PDF como factura fiscal propia. Para impedir un uso indebido, se recomienda restringir imprimir/descargar el \`NO-VERIFICADO\` hasta verificación, **PERO requiere aprobación explícita por posible tensión con PRO-326** (KuDE debe poder consultarse antes de Aprobado). Proponer al proveedor prueba de pertenencia (cuenta autenticada / identificador del documento, emisor y serie vinculados al PDF). **No inventar OCR, cálculo CDC/RUC/DV ni cambiar cuenta fiscal.**

**RISK-02 / P0 GATE — \`ENTORNO\`/históricos sin snapshot no demuestran continuidad de la cuenta.**
- \`gateway.ts:94–112::continuidadConexion\`: retorna \`SIN_REFERENCIA\` con credenciales ENV y sin versión verificable, correctamente no afirma «MISMA». Pero \`shared.ts::conexionParaDocumento\` permite llamada externa en \`SIN_REFERENCIA\`. Así se podría consultar contra una cuenta alterada sin detectar el cambio.
- La pantalla avisa, pero **no equivale a identidad probada del proveedor**. Verificar credenciales/ambiente real de CASA MINGO mediante operación autorizada, sin revelar contraseña. No modificar credenciales automáticamente.

**RISK-03 / GATE — NEX-079 no aplicada, NEX-077/078 y versión VM no verificadas.**
- Sin NEX-079, la consulta manual/flujo registra intentos en modo COMPATIBILIDAD SIN snapshot de conexión y sin \`cdc_informado\` estructurado. SQL NEX-077 no confirmada ejecutándose en VM, aunque worker se encuentra en el repo.
- Una etiqueta nueva de estados NO debe insinuar que se consulta automáticamente si el worker no se ha verificado realmente. Mostrar «Pendiente de resultado» distinto de «Consulta automática activa» si no hay telemetría real autorizada. NO montar otro monitor.

**RISK-04 / GATE — falta confirmar contrato de respuesta REAL para rechazo \`Número de timbrado inválido\`.**
- El proveedor muestra en la captura CDC, fecha de firma y mensaje rojo \`Número de timbrado inválido\`, pero no aportó un JSON de \`consulta_de\` que permita asegurar ruta del código/mensaje o si ese registro figura \`Rechazado\` definitivo.
- \`gateway.ts:338–366\` espera \`response.Estado\`, \`response.DE.CDC\`, \`response.DE.Retorno.CodRespuesta\`, \`response.DE.Retorno.Mensaje\`, \`response.DE.FechaFirma\`. Antes de homologar comparar con UNA respuesta real de proveedor, sin exponer credenciales. No inventar resultado final a partir del texto rojo.

## 2. LO QUE YA ESTÁ CORRECTO — PRESERVAR

1. JSON emitido sin CDC, reservado/idempotente, no reenvío ciego tras ACK incierto.
2. Lote operacional se guarda íntegro sólo tras \`ENVIADO\` confirmado por ACK, no con estado indeterminado; no modificar historial viejo.
3. \`XML firmado\` = estado técnico/intermedio, no aprobación SIFEN; consulta automática por worker existente NEX-077 con token/lease/backoff, hasta final \`Aprobado/Rechazado\` (siempre condicionado a deployment real).
4. CDC inicial sólo de la API; una vez guardado, no se sobrescribe; final puede omitir repetir el CDC si éste ya existe en el documento.
5. NEX-079 versionada exige CDC para consolidar final, permisos/aislamiento y histórico append-only.
6. Distinción entre envío, último estado técnico, resultado fiscal definitivo y correo. No mezclar esos ejes en una sola bandera.
7. KuDE FE usa cinco campos y NCE seis; consulta no envía CDC y KuDE habilitado no finaliza proceso fiscal.
8. Las rutas API verifican permiso y alcance de empresa/sucursal. La interfaz usa operaciones autorizadas por sesión.
9. Estados NCE, stock, numeración, impuestos, cálculo, JSON histórico y PRO-340 quedan FUERA de cualquier cambio visual, sin regresiones.

## 3. ESPECIFICACIÓN UX CERRADA — LISTA MÁS COMPACTA Y CLARA QUE LA DEL PROVEEDOR

### 3.1 Tabla principal, una línea por factura
**Columnas (sin duplicar metadatos):**
\`\`\`text
[▸] Documento [FE/NCE]  | Emisión | RUC/CI | Cliente | Importe |
    Estados: [ENVÍO] [XML/CDC] [SIFEN] [CORREO] | Acciones: [Consultar KuDE] [Expandir]
\`\`\`
- Una sola línea visual por documento en desktop cuando haya espacio; responsive: conservar tabla scroll y agrupaciones correctas en móvil.
- **NUNCA más de 4 iconos de ESTADO compacto** en la celda; un quinto indicador de alerta técnica aparece únicamente si existe anomalía. Acciones tienen su propia columna.
- Tipo FE/NCE puede permanecer identificado por color tenue y texto breve, sin confundir el color del tipo con el estado SIFEN.
- Mostrar tooltip/foco con nombre exacto (no confiar solo en color), \`aria-label\` y accesibilidad teclado/táctil. Incluir leyenda discreta fija: «Envío · XML/CDC · SIFEN · Correo». No imitar iconos del proveedor sin comprobar qué significan.

### 3.2 Matriz de iconos por FASE INDEPENDIENTE
| Fase | Confirmado | Pendiente / Intermedio | Error / No confirmado |
|---|---|---|---|
| **ENVÍO** | \`check-circle\` verde si \`estado_local=ENVIADO\` | \`clock\` ámbar o \`send\` gris | \`alert-circle\` ámbar para indeterminado; \`x-circle\` rojo solo error de envío |
| **XML/CDC** | \`file-check-2\` azul solo si CDC persistido exacto y válido; significa «CDC recibido / XML firmado», NO aprobado | \`file-clock\` gris si aún no hay CDC | \`file-warning\` ámbar si respuesta \`XML firmado\` sin CDC / CDC divergente |
| **SIFEN** | \`check-circle-2\` verde solo \`APROBADO\` persistido + coherencia CDC | \`clock\` ámbar (sin decisión) | \`x-circle\` rojo solo \`RECHAZADO\` persistido; \`ban\` neutro para \`CANCELADO/INUTILIZADO\` |
| **CORREO** | \`mail-check\` verde si entregado/enviado según estado existente | \`mail\` neutro o \`clock\` | \`mail-x\` rojo en error de correo, sin transformar el estado SIFEN |

**Importante:** una factura puede tener simultáneamente **Enviado ✔, XML firmado ✔ y SIFEN Rechazado ✕**. Eso NO es contradicción: la firma/CDC no garantiza aprobación. Esta es precisamente la lectura útil de la referencia del proveedor con mensaje «Número de timbrado inválido». El estado \`Aprobado/Rechazado\` se obtiene del dato fiscal confirmado, NO se deduce por icono de firma.

**KuDE** no es estado fiscal. Es una ACCIÓN neutra \`file-text\` («Consultar KuDE»); si al abrir devuelve \`NO-VERIFICADO\`, advertir dentro del visor. No pintar como «disponible y validado» solamente por tipo FE/NCE.

### 3.3 Expansión inmediata: 4 datos fiscales esenciales, como proveedor pero mejor
Primera capa con SOLO:
\`\`\`text
Nro lote:      [valor original completo o «No informado»]    [Copiar]
CDC:           [44 dígitos exactos o «No informado»]           [Copiar]
Fecha firma:   [fecha real gateway o «No informada»]
Mensaje:       [código SIFEN + mensaje EXACTO, p.ej. «1101 · Número de timbrado inválido»]
\`\`\`
- Mensaje de rechazo en rojo por estado fiscal confirmado, pero NO usar rojo para una simple incidencia HTTP y llamarla «Rechazado». Si es error de consulta, señalar \`Aviso técnico\`, con hora de último intento, sin reemplazar mensaje de último resultado válido.
- Alineación vertical legible; CDC/lote monoespaciados con \`overflow-wrap:anywhere\`. Botón Copiar accesible con feedback breve \`Copiado\`.
- Una línea adicional compacta puede mostrar «Última consulta», «XML firmado» y «Pendiente SIFEN» o «Resultado final», sin frases repetidas.
- NO inventar CDC, lote, fecha, código ni razón social; copiar exactamente datos ya autorizados por API/BD.

### 3.4 Segunda capa separada para operadores
Botón/expansión secundaria \`Historial técnico (n)\` (cerrada por defecto):
- timeline o tabla compacta por intento: hora, tipo ENVIO/CONSULTA, estado crudo, código, mensaje, resultado, HTTP;
- botón \`Ver respuesta JSON\` individual y \`Ver JSON original\`, paginación y conexión histórica; preservar todas las capacidades actuales;
- mostrar \`NEX-079 no aplicada / Modo compatibilidad\` y \`Conexión no verificable\` sólo cuando proceden; avisos no son estados SIFEN.
- Botón \`Consultar estado\` cuando permisos existentes lo permitan; NO consultar SIFEN al abrir la fila: expansión solo GET/lectura.

### 3.5 Evitar regresiones de estilo/accesibilidad
- Trabajar en \`app/(private)/documentos/page.tsx\`, \`page.module.css\` y, si procede, helper PURO dentro de \`presentacion-sifen.ts\`; reusar iconos y estilos existentes, no crear biblioteca de iconos, monitor, endpoint ni store nuevos.
- Preservar filtros, indicadores (se pueden hacer más compactos), paginación, búsqueda, orden, colores discretos FE/NCE, acciones NCE y rutas actuales.
- \`aria-label\`, \`title\`/popover al pasar/foco, símbolos distinguibles además del color, foco visible, botón táctil ~34–40px, responsive.
- **Nunca** usar un ícono verde de fiscal para \`XML firmado\`; \`XML firmado\` es azul y SIFEN pendiente es ámbar. Un registro legado con estado final y CDC ausente muestra **advertencia de integridad** sin mutar el estado BD.

## 4. MATRIZ DE VALIDACIÓN OBLIGATORIA, NO EJECUTADA

**ENVÍO (A):** A1 JSON una vez + lote literal; A2 token/HTTP timeout/indeterminado sin reenvío; A3 success+lote con otro documento no se atribuye; A4 NCE rechazado por gateway no se confunde con Rechazado SIFEN; A5 ninguna contraseña en logs y ningún [omitido] en lote/CDC operativo.

**CDC/FIRMA (B):** B1 XML firmado + CDC → documento con CDC, PENDIENTE; B2 XML firmado sin CDC con doc CDC NULL → RESPUESTA_INVALIDA, reconsulta; **B3 XML firmado sin CDC aunque doc ya tenga CDC → RESPUESTA_INVALIDA como respuesta actual, no confirmar nueva firma ni reemplazar CDC**; B4 XML firmado con CDC malformado y CDC local existente → RESPUESTA_INVALIDA; B5 CDC con espacios externos → no normalizar, invalidar sin editar; B6 CDC ajeno/mutado → no sobrescribir.

**RESULTADO SIFEN (C):** C1 XML firmado + CDC → consulta posterior Aprobado sin repetir CDC → final correcto; C2 idem Rechazado/1101/«Número de timbrado inválido» → rojo, mensaje exacto, no nuevo CDC; C3 final sin CDC en respuesta y sin CDC histórico → no consolidar; C4 final contradictorio sobre final ya guardado → no retroceder; C5 HTTP200 sin Estado nunca aprueba; C6 Cancelado/Inutilizado conserva reglas propias; C7 usuario/empresa/sucursal aislados.

**WORKER/BD (D):** D1 NEX-077 realmente aplicada (schema + firma + lease) y scheduler iniciado; D2 dos instancias sin doble procesamiento; D3 503/timeouts/CDC inconsistente → backoff y siguiente consulta; D4 estado final sale de reserva; D5 NEX-079 SQL incremental en base descartable con rollback; D6 compatibilidad NEX-054/NEX-062/NEX-077 y dependencia NEX-078; D7 intentos append-only y visualización sin duplicar; D8 no toca históricos.

**KUDE (E):** E1 se puede solicitar en XML firmado sin final; E2 PDF de otro emisor con mismo EEE/PPP/NNNNNNN/serie no se presenta como confirmado; E3 CDC de respuesta distinto del CDC del documento se descarta; E4 respuesta sin CDC => NO-VERIFICADO con aviso, sin atribución; E5 descarga/impresión de archivo no verificado respeta decisión del responsable; E6 misma cuenta/ambiente/serie con prueba del proveedor (NO simulación inventada).

**UX (F):** F1 tres/four íconos independientes claros con leyenda y tooltip; F2 Enviado+Firmado+Rechazado simultáneos; F3 rechazo muestra código/mensaje precisos y no solo cruz; F4 botón KuDE no promete disponibilidad; F5 fila expandida primero lote/CDC/fecha/mensaje en cuatro líneas; F6 historial JSON oculto en segunda capa; F7 copia íntegra de CDC/lote; F8 accesibilidad teclado, responsive, alto contraste y móvil; F9 screenshot antes/después de NEXIT para validación VISUAL real; F10 alerta de coherencia en registro legado final CDC NULL sin alterar DB.

## 5. PLAN DE CORRECCIÓN ÚNICO Y GATES

**Fase de análisis COMPLETADA en esta reauditoría.** Al autorizar trabajo de Claude, UNA sola orden de desarrollo debe abordar:
1. **CDC exacto y la regla \`XML firmado\` en la respuesta ACTUAL**, incluyendo guardia NEX-079 versionada si procede; no alterar JSON/CDC históricos.
2. **UX compacta con iconos de estados**, primera expansión cuatro campos, historial técnico secundario, mensaje claro y copia. No tocar endpoints ni flujo fiscal salvo defectos demostrados.
3. **KuDE**: clarificar propiedad del proveedor antes de declarar PDF oficialmente verificable. Decidir expresamente si permitir o no descarga/impresión de \`NO-VERIFICADO\` (PRO-326).
4. Casos de prueba completos sobre funciones reales, plan de integración PostgreSQL, pruebas visuales y criterio de homologación.

**No comenzar nueva implementación sin instrucción expresa.** La reauditoría NO autoriza ejecutar tests/SQL/CI, aplicar NEX-079, cambiar URL/credenciales, enviar/reemitir facturas, cambiar producción ni desbloquear PRO-340. Si una respuesta real del gateway contradice la hipótesis de parser, revisarla antes de corregir. **No asegurar calidad 100% sin pruebas ejecutadas y evidencias de proveedor/VM**.

**Dictamen:** PRO-342 permanece P0 / In Review, **CON HALLAZGOS DE CÓDIGO Y UI DEMOSTRADOS**, y riesgos operacionales P0 pendientes. Los resultados de auditoría focal anteriores no son certificación final. Mantener PRO-340 bloqueada.
