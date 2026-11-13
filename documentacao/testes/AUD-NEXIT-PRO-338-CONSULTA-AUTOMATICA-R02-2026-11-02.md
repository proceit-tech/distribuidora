# AUDITORÍA INDEPENDIENTE — PRO-338-R02 (02/11/2026)

**Commit funcional auditado:** [19e4ce3cca94f2ed453b6deb61b9ca632ca4096b](https://github.com/proceit-tech/distribuidora/commit/19e4ce3cca94f2ed453b6deb61b9ca632ca4096b)
**Auditor:** ChatGPT, revisión estática de diff TSX/TS/SQL y dependencias versionadas.
**Requisitos origen:** [AUD PRO-338-R01](AUD-NEXIT-PRO-338-CONSULTA-AUTOMATICA-R01-2026-10-29.md) (F001 ALTA, F002 MEDIA, F003 MEDIA).
**Resultado:** **CONFORME ESTÁTICAMENTE R02 — CORRECTIVO F001–F003 CERRADO EN CÓDIGO, NO HOMOLOGADO NI ACTIVO EN BASE REAL**.
**Acción autorizada tras auditoría:** iniciar **sólo PRO-331** como desarrollo de código; sin tests/SQL/VM/browser/deploy.

## 1. Material inspeccionado

Commit R02 cambia **10 archivos** (no siete/ocho), incluyendo dos SQL nuevos:
1. `app/(private)/documentos/page.tsx`
2. `documentacao/banco/nexit/v1/migraciones/NEX-077-facturacion-consulta-automatica-lease.sql` (NUEVA, no aplicada)
3. `documentacao/banco/nexit/v1/scripts/reversion-NEX-077.sql` (NUEVA, no ejecutada)
4. `lib/facturacion/consulta-automatica-fe.casos.ts`
5. `lib/facturacion/consulta-automatica.ts`
6. `lib/facturacion/estados.ts`
7. `lib/facturacion/gateway.ts`
8. `lib/facturacion/nce.casos.ts`
9. `lib/facturacion/presentacion-sifen.ts`
10. `lib/facturacion/shared.ts`

Verificadas también referencias versionadas a `NEX-050-facturacion-envio-control.sql`, `NEX-062-facturacion-nce-v1.sql`, `instrumentation.ts`, `lib/facturacion/reconciliacion.ts`, `lib/facturacion/gateway.ts` y consulta manual, sin cambios funcionales fuera de los tres hallazgos.

## 2. F001 — ALTA — conforme estáticamente, ejecución REAL sujeta a NEX-077

En `consulta-automatica.ts:77–93` cada iteración reserva **UN** documento inmediatamente antes de consultarlo, llamando `fe_consulta_reservar_token(1,...)` en vez de reservar un lote completo. El lease normal se calcula en `:38–40`: `4 * TIMEOUT_GATEWAY_MAX_MS / 1000 + 60 = 300 s` (tope HTTP definido y utilizado en `gateway.ts`). `NEX-077:34–62` crea un UUID nuevo por reserva con `FOR UPDATE SKIP LOCKED`. `NEX-077:66–76` condiciona la programación/liberación al token vigente; `:103–113` bloquea la fila `FOR UPDATE` y rechaza un registro por token obsoleto antes del INSERT; la respuesta tardía no altera estado fiscal, reserva ajena ni historial. `consulta-automatica.ts:119–139` maneja token obsoleto y programación condicional. Sin migration NEX-077, `:80–89` **falla cerrado**: no usa la antigua reserva insegura, no envía consultas automáticas y registra advertencia de activación.

Las funciones de NEX-062 **no se reescriben**. NEX-077 conserva controles de actor empresa/sucursal/CREAR-EDITAR, estados elegibles y CDC. El flujo manual usa la función previa. Las verificaciones de lease (R02-F001-01..10) son **mocks/regex**, sin PostgreSQL real ni stress de concurrencia. No afirmar «dos workers probados» ni «scheduler activo».

**Nota de operación:** desplegar código R02 **sin NEX-077** desactiva la consulta automática tanto de FE como de NCE; éste es un bloqueo deliberado de seguridad, no homologación de compatibilidad runtime. Migración NEX-050/062/077, firmas/grants/actor, backup y orden de despliegue requieren aprobación humana.

## 3. F002 — MEDIA — conforme estáticamente

`estados.ts:100–106` declara `ESTADOS_LOCAL_TRANSMITIDO = [ENVIADO,ENVIO_INDETERMINADO]` y `ESTADOS_SIFEN_SIN_FINAL = [SIN_CONSULTA,PENDIENTE,NO_RECONOCIDO]`. `presentacion-sifen.ts:24–27` usa esas constantes para badge amarillo; `shared.ts:55–63` interpola exactamente los mismos conjuntos para `SQL_GRUPO.PEND_RESPUESTA`. La ayuda del indicador explica que `ENVIO_INDETERMINADO` puede aparecer además en `PEND_ENVIO` porque los ejes no son excluyentes. `RECHAZADO` y `APROBADO` siguen filtrando `estado_sifen` persistido; `CDC_DIVERGENTE` no se cuenta como rechazo. Casos fuente R02-F002-01..06 escritos, no ejecutados.

## 4. F003 — MEDIA — conforme estáticamente

La función incremental `NEX-077:82–149` registra `cdc_informado` de 44 dígitos, incluso cuando no coincide con el documento; la divergencia se anota como `CDC_DIVERGENTE`, sin cambiar estado fiscal ni `mensaje_respuesta` para resultado distinto de OK. `NEX-050:28–29` admite CDC numérico de 44 dígitos (sin exigir coherencia) en columna de evidencia. `shared.ts:232–245,301–313` añade `cdcRespuesta` de la ruta conocida de JSON saneado `response.DE.CDC` sólo cuando no hay columna estructurada; no afirma que la columna histórica esté llena y nunca fabrica CDC. `presentacion-sifen.ts:55–75` separa `última consulta válida` de `último intento`, mientras que `documentos/page.tsx:571–577` etiqueta el mensaje almacenado sin atribuirle falsamente el último resultado SIFEN. Si un resultado válido está fuera de las páginas cargadas, la UI declara que no consta en el historial cargado. La vista de historial distingue la procedencia del CDC; HTTP, fecha y JSON siguen disponibles. R02-F003-01..08 escritos, no ejecutados.

## 5. Invariantes y restricciones no levantados

- Código versionado **no** significa NEX-050/062/077 aplicadas, workflow activado, compatibilidad con PostgreSQL real ni corrección vista por el cliente.
- NEX-077 y su reversión son **solo archivos**; no se aplicaron por la IA. Verificar `schema_migrations`, roles/grants, firmas de funciones, lock y backup antes de la migración autorizada. No ejecutar scripts por cuenta del Claude.
- No se hicieron tests, runner de casos, TS/lint, build, CI manual, SQL, PostgreSQL, VM, Docker, navegador, llamadas reales al gateway ni deploy. Los **24 casos nuevos R02** son fuente; además existen 20 grupos originales P338-01..20, igualmente sin ejecución. Caso fuente ≠ prueba de concurrencia en base.
- Si el proceso del scheduler real no arranca bajo `instrumentation.ts` Node, o `NEXIT_CONSULTA_AUTOMATICA=0`, o falta `DATABASE_URL`, la consulta no operará. Requiere preflight y homologación humana.
- No cambiar KuDE, CDC/estado definitivo, emisión, idempotencia, stock, NCE, email ni PRO-334 durante cualquier futura activación.
- La aprobación de este informe **es una autorización de avanzar a PRO-331 exclusivamente como código**, no una autorización de instalar o ejecutar PRO-338 en CASA MINGO ni de desarrollar PRO-333/334 simultáneamente.

## 6. Decisión de secuencia

- **PRO-338-R02:** conforme estaticamente, conservar Linear `In Review`/no Done hasta pruebas y homologación del runtime, incluyendo NEX-077. No solicitar R03 sin defecto nuevo observado.
- **PRO-331:** pasar a **única orden de código activa**; leer [orden CASA MINGO 02/11](../ordens/ORD-CLAUDE-NEXIT-CASA-MINGO-FACTURA-DOCUMENTOS-2026-11-02.md), obtener versión COMPLETA y MÁS RECIENTE de cada archivo, **uno por vez**, hacer sólo scroll de 4 filas, ordinal 1..n y foco al buscador, escribir casos sin ejecutar, commit/push SHA completo y PARAR para auditoría ChatGPT PRO-331-R01.
- **PRO-333, PRO-334, PRO-339:** quedan en cola, sin autorización de implementación aún. PRO-298/336 son dependencias de proveedor/operador.
