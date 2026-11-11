# AUDITORÍA INDEPENDIENTE PRO-342-R04 — CORRECCIÓN FISCAL Y PANTALLA DE ESTADOS CON ÍCONOS

**Fecha:** 11/11/2026
**Commit funcional auditado:** `e2110ff301b8b2fa3d98f512d02b66a4ebd45918` (**HEAD exacto de la rama** `feature/NEXIT-2026-001-banco-demo`, verificado contra la rama sin commits funcionales posteriores).
**Documentos de referencia:** [orden R04](../ordens/ORD-CLAUDE-NEXIT-PRO-342-R04-CORRECCION-INTEGRADA-CDC-UX-ICONOS-2026-11-11.md), [reauditoría previa](AUD-CHATGPT-PRO-342-REAUDITORIA-INTEGRAL-FISCAL-UX-ICONOS-2026-11-11.md), [mockup SVG](../referencias/PRO-342-MOCKUP-DOCUMENTOS-ESTADOS-ICONOS-2026-11-11.svg), [regla de negocio vigente](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Archivos del commit (13):** `app/(private)/documentos/page.tsx`, `page.module.css`, `lib/facturacion/reconciliacion.ts`, `gateway.ts`, `presentacion-sifen.ts`, `NEX-079-facturacion-intentos-conexion-cdc-consulta.sql`, `flujo-fiscal-pro342.casos.ts`, `consulta-automatica-fe.casos.ts`, `facturacion.casos.ts`, `kude.casos.ts`, `nce.casos.ts`, `colores-tipo-documentos.casos.ts`, `visual-v1.casos.ts`.
**Método:** inspección estática directa de diff y código actual, rutas de producción relacionadas, lógica fiscal, SQL, componentes de presentación, CSS y casos escritos; cotejo de semántica con la especificación y el mockup. **No se ejecutaron tests, lint, typecheck, build, SQL, migrations, gateway, VM ni deploy.** No hay comprobación de renderizado en navegador, screenshots NEXIT, PostgreSQL, provider real ni certificación de producción.

## VEREDICTO

**PRO-342-R04 CONFORME EN AUDITORÍA ESTÁTICA DE LOS CAMBIOS ORDENADOS.** No hay defecto confirmado nuevo EN LAS CORRECCIONES R04 que justifique otra ronda de código. Se revocará esta conclusión si las pruebas ejecutadas descubren una falla real. **PRO-342 P0 SIGUE ABIERTA: NO HOMOLOGADA, NO AUTORIZADA A PRODUCCIÓN.** No confundir «casos escritos» con «casos pasados».

## A. MATRIZ DE CONFORMIDAD DEL CÓDIGO

### 1. R04-F01: firma con CDC en la RESPUESTA ACTUAL — conforme
- `reconciliacion.ts:23–44`: `decidirConsulta` exige `r.cdc` actual no nulo para `XML firmado` incluso si `doc.cdc` ya existe; ausencia→`RESPUESTA_INVALIDA`, mantiene documento previo y seguimiento.
- `XML firmado` válido con CDC no es final: `estados.ts::estadoSifenDesdeGateway` entrega `PENDIENTE` y NEX-077 sigue reservando hasta estado final.
- `Aprobado/Rechazado` del mismo documento puede omitir REPETIR el CDC si está previamente persistido, pero nunca consolidarse con `doc.cdc=NULL` y `r.cdc=NULL`. No se crean valores fiscales.

### 2. R04-F02: CDC LITERAL — conforme
- `gateway.ts:319–323::cdcLiteral` diferencia ausencia de campo informado malformado y valida **solo string de 44 dígitos exactos**; sin `.trim()`.
- `interpretarConsulta:356–378` usa exclusivamente `response.DE.CDC`, rechaza finales y `XML firmado` con CDC presente malformado como `RESPUESTA_INVALIDA`. `decidirConsulta` rechaza el campo ausente/NULL aunque el documento tenga CDC.
- `interpretarRecepcion:718–722` usa mismo parser para CDC raíz cuando exista, sin cortar o completar su valor. Un ACK recibido continúa siendo ACK de transporte, no aprobación SIFEN.

### 3. R04-F03: SQL NEX-079 — conforme dentro del contrato R04
- `NEX-079:119–133` mantiene guarda de estados finales sin CDC y añade una protección explícita **`p_estado_sifen='PENDIENTE'` + `p_estado_gateway='XML firmado'` + `p_cdc` ausente/malformado**→`RESPUESTA_INVALIDA`, aunque exista `d.cdc`.
- La protección precede `INSERT` de intento y `UPDATE` de documento; en resultado distinto de OK solo se actualiza el marcador de última consulta, sin reemplazar CDC, mensaje/fecha de último resultado válido ni estado final.
- **Detalle de contrato/operación:** la función SQL compara `lower(btrim(...))='xml firmado'`, mientras el parser TS reconoce variaciones de mayúsculas/acentos por `esFaseXmlFirmado`. Para el literal real mostrado `XML firmado` ambas coinciden. Ante variantes no documentadas no afirmar que la SQL impone una regla idéntica a TS para CUALQUIER cadena arbitraria; la protección principal corre en la app. No abrir corrección por un proveedor hipotético: verificar contrato real con proveedor durante homologación.
- NEX-079 solo está **versionada**. NEX-054/062/077 históricas no fueron alteradas por R04.

### 4. R04-UX01: lista con iconos — conforme estáticamente
- `presentacion-sifen.ts:141–225` declara y deriva CUATRO ejes independientes: `envio`, `xml`, `sifen`, `correo`, cada uno con símbolo, tono y texto accesible.
- `page.tsx:105–114, 615–638`: símbolos SVG, `aria-label`, foco/tooltip y grupo; sólo un quinto símbolo cuando hay alerta técnica. FE/NCE, controles existentes, columnas, resumen/filtros, ordenación, paginación y acciones se conservan.
- Estados simultáneos soportados: Enviado/ACK, XML firmado con CDC, SIFEN Rechazado; e-mail independiente. Los estados históricos finales sin CDC se representan con advertencia, sin cambiar la BD. No se infiere aprobación fiscal del ACK ni de `XML firmado`.
- `page.module.css`: 40px de objetivo, foco, tooltip, responsive y modo alto contraste; **señales implementadas estáticamente, pero aún NO validadas con navegador, teclado, pantalla pequeña ni lector de pantalla**.

### 5. R04-UX02: detalle compacto + segunda capa — conforme estáticamente
- `page.tsx:643–669` tiene cuatro campos principales: Nro lote original, CDC, Fecha firma y Mensaje/código; botón Copiar para lote y CDC usa `navigator.clipboard.writeText(valor)` sin normalizar la cadena, con feedback/alerta.
- `page.tsx:712–806`: `tecnico=false` por defecto; JSON de solicitud/respuesta, seguimiento, estados, conexión e historial paginado quedan en sección técnica secundaria; no se eliminan registros ni las acciones. Abrir la fila es GET local, no POST al gateway.
- `presentacion-sifen.ts:237–240` obtiene mensaje/código de los campos persistidos y colorea rojo SOLO ante `RECHAZADO` fiscal con CDC válido. Se evita inferir rechazo de un texto rojo.

### 6. R04-UX03: KuDE — conforme al alcance, riesgo externo pendiente
- La acción se rotula `Consultar KuDE` y no equivale a disponibilidad garantizada ni aprobación SIFEN.
- `NO_VERIFICADO` conserva alerta y nombre diferenciado; `NO_CORRESPONDE` se descarta. La orden NO autorizó cambiar la descarga/impresión de PDF no verificado; R04 no altera esa regla.
- **NO se ha acreditado la titularidad del BINARIO PDF cuando el proveedor no informa metadatos que lo vinculen inequívocamente al emisor/documento/serie.** El caso histórico CASA MINGO vs DISTRIBUIDORA se mantiene como dependencia de proveedor; NO dar por resuelto sin prueba externa.

## B. REVISIÓN DE CASOS Y COBERTURA — SOLO ESCRITOS

- `flujo-fiscal-pro342.casos.ts:860–1030` integra funciones reales de consulta/worker + DB/fetch SIMULADOS con escenarios B3 actual, CDC malformado con espacios y valor no-string, y estado final sin repetir CDC histórico.
- Se contemplan `PRO342-R04-F1..F10`, `R04-B3a-d`, `R04-B5a-f`, `R04-F03a-c`, iconos por eje, semántica del rechazo gateway versus SIFEN, datos del primer nivel, accesibilidad y sección técnica.
- Los casos UX de página y CSS son predominantemente inspecciones del TEXTO FUENTE y las funciones puras de estado. **NO sustituyen un render real**: se exige verificación visual/dinámica antes de aceptar «mejor que el proveedor».
- Los siete archivos de casos afectados fueron adaptados a la nueva nomenclatura `Consultar KuDE` y a los elementos de lista; hasta ejecutarlos no se puede afirmar ausencia de fallas de import, JSX, CSS, mocks o regresión.

## C. BLOQUEOS DE HOMOLOGACIÓN (NO SON DEFECTOS PROBADOS DE LA R04)

1. **Ejecución de calidad:** autorizar tests dirigidos, lint/typecheck/build en entorno de desarrollo; revisar salidas y errores reales. Se requiere autorización explícita del responsable antes de cualquier ejecución.
2. **PostgreSQL y migrations:** verificar SHA instalado, NEX-077/078/079 reales, funciones NEX-054/062/077 y rollback NEX-079; validar SQL en una base DESCARTABLE antes de aplicar migration a VM/producción. NEX-079 actualmente no aplicada.
3. **Worker/integração:** worker NEX-077 habilitado efectivamente, lease/backoff, reconsultas múltiples del MISMO documento hasta APROBADO/RECHAZADO; prueba con proveedor **sin reenviar FE real ni tocar historial antiguo**.
4. **Vista real:** screenshot/pantalla NEXIT desktop y móvil; estados concurrentes Enviado+XML firmado+Rechazado (código/mensaje p. ej. `Número de timbrado inválido` si informado REALMENTE), cuatro iconos legibles, primera expansión solo cuatro datos, historial cerrado, copiar lote/CDC. Verificar navegación por teclado y tooltip.
5. **KuDE:** respuesta auténtica del proveedor para ambiente/credenciales y emisor/serie/correspondencia del PDF; `NO_VERIFICADO` sigue sin garantía de titularidad aunque pueda verse/descargarse con aviso.
6. **Credenciales históricas ENTORNO:** `SIN_REFERENCIA` avisa que no se probó la continuidad de la cuenta; se permite consulta bajo incertidumbre, riesgo operacional existente, no corregido por R04. Requiere investigación/decisión específica, sin cambiarlas automáticamente.
7. **Seguridad fiscal:** no cambiar CDC/lote históricos, no reemitir JSON, ni inventar estado fiscal/CDC por una prueba, ni habilitar PRO-340. Probar logs sin datos sensibles.

## D. DECISIÓN

**R04: APROBADA EN REVISIÓN ESTÁTICA DEL CÓDIGO VERSIONADO, NO HOMOLOGADA.**
No pedir R05 ni refazer fluxo por hipóteses. Próximo hito: el responsable autoriza si desea ejecución controlada de pruebas locales y verificación de migrations (como fase separada). Claude se detiene; no tiene nueva orden de código activa. La PRO-342 permanece P0 `In Review`; la PRO-340 bloqueada.
