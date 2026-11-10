# ORDEN CLAUDE — PRO-338-D03 / Incidente real: CDC divergente, SIFEN rechazada y consulta automática

**Fecha:** 10/11/2026  
**Repositorio/branch:** `proceit-tech/distribuidora` · `feature/NEXIT-2026-001-banco-demo`  
**Linear:** [PRO-338](https://linear.app/proceit/issue/PRO-338) · **GitHub:** [#12](https://github.com/proceit-tech/distribuidora/issues/12)  
**Auditoría y evidencia:** [AUD-NEXIT-PRO-338-INCIDENTE-CDC-SIFEN-2026-11-10](../testes/AUD-NEXIT-PRO-338-INCIDENTE-CDC-SIFEN-2026-11-10.md). Leer el documento completo antes de continuar.  
**Estado:** ÚNICA orden activa = **DIAGNÓSTICO D03**. No autoriza modificar producción, hacer UPDATE, ejecutar migrations, tests, scheduler, llamadas reales al gateway ni cambiar estados fiscales.

## A. Hechos verificables que debe explicar el diagnóstico

En la pantalla NEXIT, FE `001-003-0009021`, `0009020`, `0009019`, `0009018` están en `SIFEN: Pendiente de confirmación` y alerta `Inconsistencia de consulta: CDC distinto del registrado`. El detalle de `0009020` indica `CDC: Aún no informado`, `Estado fiscal registrado: Sin consultar`, último intento `10/11/2026 14:06:41 · CDC distinto del registrado · HTTP 200 · Rechazado · 1101 · Número de timbrado inválido`.

La exportación aportada del portal externo dice que las cuatro facturas son `Rechazado` y especifica el motivo `Número de timbrado inválido`. Se comprobó que los cuatro CDCs de 44 dígitos **cuadran estructuralmente** con tipo 01, establecimiento 001, punto 003 y número. **NO se ha demostrado todavía que esos CDCs sean iguales a los que `/api/consulta_de` devolvió en cada intento real de NEXIT.**

La función SQL versionada clasifica CDC_DIVERGENTE si (1) CDC recibido difiere del CDC ya registrado, SI lo hay, o (2) no coincide con la identidad fiscal. Con `d.cdc IS NULL` y CDC devuelto coherente con identidad, la fuente SQL actual no produciría divergencia. Investigar **la diferencia de origen**, no quitar la validación por comodidad.

## B. Lectura de fuentes, sin ejecución

Leer primero `CLAUDE.md` y la auditoría. Usar SIEMPRE versiones **COMPLETAS y MÁS RECIENTES** de los archivos, **UNO A LA VEZ**, en branch vigente. Inspeccionar al menos:
- `lib/facturacion/gateway.ts`: `consultarDocumentoGateway`, `interpretarConsulta`, `cdcCoherente` y forma de solicitud `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}`.
- `lib/facturacion/reconciliacion.ts`: `decidirConsulta`, validación de rechazo final, CDC y transiciones.
- `lib/facturacion/shared.ts`: `leerDocumento`, `consultarEstado`, `listarIntentos` e historial `cdc_informado` vs JSON.
- `documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql`, `NEX-050-facturacion-envio-control.sql`, `NEX-054-facturacion-consulta-estado-final.sql`, `NEX-062-facturacion-nce-v1.sql`, `NEX-077-facturacion-consulta-automatica-lease.sql`.
- `lib/facturacion/consulta-automatica.ts`, `instrumentation.ts`, `next.config.ts`, `lib/facturacion/refresco-documentos.ts` y `app/(private)/documentos/page.tsx` / `presentacion-sifen.ts`.
- Casos fuente existentes PRO-338, gateway y estados; comprobar si hay supuesto incorrecto en simulación/identidad de CDC o estructura de respuesta del gateway.

Verificar que `estadoSifenDesdeGateway("Rechazado") = RECHAZADO` (código hace eso) y que el **resultado persistido** pasa por una validación de identidad ANTES de actualizar `estado_sifen`. No reinterpretar HTTP 200 como aprobado/rechazado por sí mismo.

## C. Pruebas de evidencia real que faltan y lectura propuesta (NO ejecutar)

**Claude NO TIENE autorización ni acceso a VM/PostgreSQL del cliente; no intentar descubrir contraseñas ni conectarse.** Preparar procedimiento *de solo lectura* para responsable operador y detenerse si los datos faltan:
1. Confirmar empresa real mediante UUID/ámbito autorizado, y cuatro números `001-003-0009018..0009021`. Inspeccionar en `documentos_electronicos`: tipo, EEE, PPP, número, `cdc`, `estado_local`, `estado_sifen`, `ultima_consulta_at`, `ultima_consulta_resultado`; NO seleccionar datos de otras empresas.
2. Para esos documentos, últimos `documento_electronico_intentos` de `tipo='CONSULTA'` ordenados por fecha: `resultado`, `http_status`, `estado_gateway`, `estado_sifen`, `cod_respuesta`, `mensaje`, `cdc_informado`, `respuesta #>> '{response,DE,CDC}'`, `respuesta #>> '{response,DE,Retorno,CodRespuesta}'`, `respuesta #>> '{response,DE,Retorno,Mensaje}'`, fecha, `actor_id`, `request_id`. NO extraer tokens, credenciales, certificados ni respuesta JSON completo sin saneamiento.
3. Comparar byte a byte el CDC de ese intento con el CDC correspondiente de la planilla **dentro del entorno autorizado**. Comprobar `public.fe_cdc_coherente(tipo,establecimiento,punto_expedicion,numero,cdc_consulta)`; identificar si la divergencia fue `CDC almacenado distinto`, `CDC no corresponde a identidad`, función SQL de versión diferente, respuesta de otro documento o error del gateway. Reportar qué posición difiere, sin necesidad de pegar CDC completo en GitHub.
4. Comprobar `schema_migrations`, `to_regprocedure` y `pg_get_functiondef` o firma/huella de las funciones de `NEX-054/062/077` en la base REAL, sólo mediante lectura autorizada, comparando con las fuentes, porque los encabezados «NO aplicada» de archivos Git **no demuestran el estado de producción**.
5. Verificar el **scheduler real**: `instrumentation.ts` registra en Node; `iniciarPlanificador` tick cada **60 s**, 10 reservas por ciclo, backoff **1/2/5/10/30/60 minutos**. Averiguar si se inició sin `NEXIT_CONSULTA_AUTOMATICA=0`, sin `DEMO_MODE=true` y con `DATABASE_URL`; comprobar logs sin secretos. Inspeccionar si hay `fe_consulta_reservar_token` (NEX-077), permisos de actor real, `consultas_auto`, `proxima_consulta_at`, `consulta_lease_hasta`, `consulta_lease_token`, fecha y origen (manual o auto) de los intentos. Si NEX-077 falta, worker **falla cerrado** con mensaje `Consulta automática desactivada: falta la migración NEX-077`. Un intento a las 14:06 **NO prueba** scheduler activo.
6. Diferenciar `refresco-documentos.ts` que hace **GET al listado cada 30/60/120 s con pestaña visible** de la consulta al gateway hecha por el proceso Node independiente del navegador.
7. Evitar **CUALQUIER actualización por UPDATE directo** de estado, CDC, intento o fecha. Si se detecta origen y se necesita reconciliar, proponer procedimiento versionado verificable/seguro por funciones existentes con autorización distinta.

**No ejecutar los SQL.** Si se redactan consultas SELECT de lectura con placeholders por empresa, mantenerlas en el informe y no usarlas contra ninguna base.

## D. Criterios para la corrección posterior, NO adelantada por suposición

**SIFEN:** si el CDC de respuesta realmente identifica el documento y SIFEN informó `Rechazado/1101/Número de timbrado inválido`, debe persistirse a través de flujo fiscal seguro y ser visible en la lista, con código, mensaje y fecha. No falsear la identidad, ni mostrar aprobado por HTTP 200. Si el CDC es de otro documento, preservar estado no final, alerta técnica y evidencia de gateway. En la UI, si `d.cdc` es NULL, no afirmar «distinto del registrado»; expresar el tipo REAL de inconsistencia (versus identidad fiscal), con CDC informado, fecha y motivo de SIFEN en el historial sin inventar estado final.

**Worker:** comprobar actividad real, NEX-077 y transición de reservas; no sustituirlo por un cron o monitor nuevo, no crear doble planificador. Si necesita activación/migration, entregar plan operacional y gate de aprobación, sin ejecutar.

**Seguridad:** conservar idempotencia, inmutabilidad, stock, NCE, envío, KuDE, certificados, CDC y numeración; no tocar `NEX-078` ni emitir/reemitir/cancelar FE. Separar estado local de envío y estado fiscal final.

## E. Entrega y STOP

**Entregar informe técnico D03** en thread con: matriz de las cuatro FE, CDC externo estructuralmente válido vs CDC realmente recibido (si hay evidencia), estado local/fiscal, último intento, función SQL que clasificó, causa demostrada o hipótesis ordenadas, estado observado/NO observado del scheduler, resultado de inspección de fuente, cambios mínimos recomendados, casos que SE DEBERÍAN ESCRIBIR (sin ejecutarlos), y lista de evidencias operativas que sigue faltando.

Si solo hay datos de screenshots/Excel/Git y no del PostgreSQL/JSON del intento, indicarlo claramente y **PARAR**. NO modificar código funcional, tabla, migrations, tests, SQL, VM, gateway ni deploy todavía. Solicitar auditoría y autorización de la siguiente orden de corrección con evidencia. **No activar PRO-340** u otra tarea.

**Gate adicional:** NEX-078 (limite FE por empresa) sigue sin verificación de aplicación; activar código dependiente sin esa columna provoca 422 en todas las FE nuevas. No intervenir en esta orden.
