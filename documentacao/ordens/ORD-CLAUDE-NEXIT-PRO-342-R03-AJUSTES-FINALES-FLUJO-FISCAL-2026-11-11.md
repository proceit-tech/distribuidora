# ORDEN ÚNICA CORRECTIVA — PRO-342-R03 / Tres ajustes y STOP

**Fecha:** 11/11/2026 · **Rama:** `feature/NEXIT-2026-001-banco-demo`
**Código auditado:** `b34b1c3ad1256dba2ee105f88ed63f326babc037`
**Auditoría que obliga:** [AUD-CHATGPT-PRO-342-R02](../testes/AUD-CHATGPT-PRO-342-R02-CORRECCION-FOCAL-2026-11-11.md)
**Regla de negocio vinculante, actualizada:** [PRO-342](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md), **apartado «ACLARACIÓN DEL ANALISTA — RESULTADO FINAL SIN CDC»**.
**Rol:** Claude DESARROLLA el código, ChatGPT analiza y audita.
**Permiso:** editar SOLO el código necesario y escribir casos; NEX-079 existente está sólo versionada y puede corregirse estáticamente si imprescindible. **PROHIBIDO EJECUTAR** tests, lint, typecheck, build, CI, SQL/migration, VM/Docker, gateway, emisión/reenvío, corrección de históricos o deploy.

## PRIMERO: LO YA CONFORME DE R02 NO SE TOCA
- Un envío de JSON, lote literal, `XML firmado` como estado inicial/intermedio; reconsultar mismo documento hasta `Aprobado`/`Rechazado`; guardar toda la historia y detenerse al final.
- Preflight y envío con UNA sola configuración; si cambia host/ref/versión DB conocida, 409; no alterar credenciales ni configuración.
- KuDE en `XML firmado` sin CDC exigido, pero sin atribuir pertenencia: NO_VERIFICADO = aviso/título/archivo diferente, NO_CORRESPONDE = descartado. **La demostración de titularidad del PDF sigue siendo una dependencia del PROVEEDOR**, no intentar resolver con OCR, RUC/DV/checkdigit/fecha calculados ni nueva cuenta.
- NEX-079 sigue versionada sin ejecutar; fallback anterior es compatibilidad degradada, claramente mostrada. No crear scheduler/monitor nuevo.

## R03-01 — Resultado SIFEN DEFINITIVO sin CDC en la respuesta

**Bug demostrado:** `lib/facturacion/reconciliacion.ts:27–33` convierte `Rechazado`/`Aprobado` sin CDC en `RESPUESTA_INVALIDA`. `NEX-079:116–121` y `NEX-077:120–124` hacen lo mismo en SQL. El caso `PRO342-06c` exige una conducta opuesta al negocio.

**Regla definitiva:** `Aprobado`/`Rechazado` es FINAL sólo cuando la API de consulta lo informa expresamente **para el documento solicitado**, aun si la API todavía no devuelve CDC. Guardar estado, código, mensaje, fecha, intento; CDC queda NULL, **nunca inventarlo**. No usar HTTP 200 ni `XML firmado` como final. Si CDC viene pero es divergente o de otro documento, conservar bloqueo de asociación; no reescribir un CDC existente.

**Acción:** alinear `reconciliacion.ts`, lógica SQL NEX-079 versionada y estados UI sin tocar migraciones históricas NEX-047..078; determinar e informar claramente el límite de la **firma SQL anterior** sin NEX-079 (NEX-077 aún bloquea finales sin CDC). No afirmar que el flujo completo está homologado en modo de compatibilidad. Si necesita migration incremental nueva para compatibilidad, NO crearla por cuenta propia: reportar al auditor. Una sola NEX-079 versionada puede contener los cambios aún no desplegados.

**Casos obligatorios, NO ejecutar:** XML firmado sin CDC → reconsulta → `Rechazado 1101` sin CDC final + código/mensaje/fecha/historial y SIN_CONSULTA se termina; Aprobado sin CDC explícito; `Rechazado` con CDC ajeno NO se registra como final; error/HTTP200 sin estado final sigue pendiente; no reenviar JSON; estado final previo no regresa.

## R03-02 — Referencias `ENTORNO`: no afirmar conexión idéntica sin prueba

**Bug demostrado:** `gateway.ts::continuidadConexion` declara `MISMA` cuando host/ref/versión DB coinciden, incluso `null/null`. Para `credencialRef !== NEXIT_DB`, `credencialesDe/leerCredenciales` toma usuario/password de ENV: pueden cambiar SIN subir `credenciales_version` del DB.

**Acción focal:** si una referencia `ENTORNO` mantiene host/ref pero no hay dato confiable que pruebe igualdad de credenciales **efectivamente usadas en las dos llamadas**, devolver `SIN_REFERENCIA`, NUNCA `MISMA`, independientemente de igualdad de versión DB o null/null. Si host/ref/origen cambian, mantener `DISTINTA`→409. Para `NEXIT_DB` con versión efectiva consistente mantener comparación actual; versión ausente no se presenta como prueba. NO almacenar password, token, hash de RUC, ni crear rastreo de credenciales nuevas. La UI debe informar la continuidad no verificable. No degradar `DISTINTA` a consulta silenciosa.

**Casos:** dos ENV con mismo host/ref/versión config pero passwords diferentes → NO MISMA; null/null ENTORNO → NO MISMA; NEXIT_DB versionada igual→MISMA; NEXIT_DB alterada→DISTINTA; host cambiado→409. Sólo mocks sintéticos.

## R03-03 — Lote de respuesta indeterminada NO se atribuye al documento

**Bug demostrado:** `gateway.ts::interpretarRecepcion` conserva `loteValido` en `indeterminado()`, incluso cuando `dEst/dPunExp/dNumDoc` o `Aceptados` identifica otra FE; `envio.ts::cerrarEnvio` lo pasa a SQL y NEX-079:214 / NEX-050:115 lo fija en `documentos_electronicos.lote`.

**Acción focal:** el lote principal del documento sólo se fija ante ACK que realmente identifica su recepción y estado local ENVIADO. Si el resultado es `ENVIO_INDETERMINADO` o de otro documento, **NO atribuir lote como confirmado**. Conservar identificador bruto tal como vino, si procede, en la evidencia saneada del intento y/o campo de intento de modo seguro, pero no en `documentos_electronicos.lote`; no perder mensaje/HTTP, no inventar lote nuevo. Resolver también fallback de firma antigua sin editar SQL histórico aplicado. No reenvío automático.

**Casos:** success+nro_lote válido+eco fiscal AJENO; success+nro_lote válido + `Aceptados` de OTRO; status:error que trae lote; timeout sin ACK; success propio correcto: en los primeros no se fija documento.lote, en último sí, íntegro.

## ENTREGA / GATE

1. Inspeccionar cada archivo COMPLETO/MÁS RECIENTE, **UNO POR VEZ**, antes de editar: `reconciliacion.ts`, `gateway.ts`, `envio.ts`, `shared.ts`, `flujo-fiscal-pro342.casos.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-079-...` y sólo lo imprescindible.
2. Cambios MÍNIMOS, sin reescritura de R01/R02 ni ampliación de scope.
3. Casos de test sobre funciones REALES con dependencias simuladas, **ESCRITOS, NÃO EXECUTADOS**. Informar riscos residuais e compatibilidade sem NEX-079.
4. Commit/push SHA completo e listar arquivos alterados; **PARAR para auditoria independente ChatGPT PRO-342-R03**. PRO-340 continua bloqueada, PRO-338-R06 não retorna isoladamente. Nunca afirmar pronto para produção sem teste real e autorização de deploy.
