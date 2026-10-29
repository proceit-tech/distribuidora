# ORD-CLAUDE-NEXIT-PRO-338 — Consulta automática FE y señalización de estados fiscales

**Fecha:** 29/10/2026  
**Prioridad:** P0 · **Ejecución:** Claude Code · **Auditoría/aceptación:** ChatGPT / responsable  
**Linear:** https://linear.app/proceit/issue/PRO-338 · **GitHub:** https://github.com/proceit-tech/distribuidora/issues/12  
**Branch objetivo:** `feature/NEXIT-2026-001-banco-demo` (verificar cabeza antes de cualquier modificación).

## 0. Orden de ejecución y límites

Esta es la **única orden de desarrollo nueva autorizada** después de la auditoría estática R01 de PRO-337 (SHA `137f49f1942550a6676643a2a41774bde1835815`). Leer primero `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, código vigente, PRO-312, PRO-309/P08, PRO-321 y PRO-334. No confundir el status fiscal con el status de envío, el estado de e-mail ni el color de tipo FE/NCE.

**El objetivo es modificar únicamente la consulta automática de FE y la UX de estados/inconsistencias de Documentos electrónicos.** PRO-312 sigue siendo el paquete mayor pendiente; la autorización expresa de PRO-338 es una excepción de alcance limitado, **no** aprobación de todo E03/E08/E09, ni de cambios de stock o reemisión.

No ejecutar pruebas, lint, typecheck, build, CI manual, SQL, migrations, VM, Docker, navegador del entorno de cliente, gateway real, transmisión ni deployment. Escribir **casos dirigidos como código** y entregar sin ejecutarlos. No alterar credenciales ni configuración productiva. Si una parte requiere contrato o migration no verificada, versionar cambio seguro si es posible y detallar el bloqueo de activación; **no simular operatividad**.

## 1. Solicitud de negocio

Después de transmitir una FE al gateway, el sistema debe **consultar automáticamente** el estado fiscal hasta obtener una respuesta válida y definitiva, sin que un operador tenga que abrir el menú. Lo mismo debe seguir funcionando para las NCE. La consulta manual `Consultar estado en SIFEN` continúa habilitada para el operador con permiso, sin reemplazar el proceso automático.

La tabla debe permitir identificar de un vistazo:

| Estado mostrado | Señal visual | Regla de verdad |
| --- | --- | --- |
| `SIFEN: Aprobado` | Badge verde con texto | Respuesta final correlacionada y persistida para el documento/versión |
| `SIFEN: Rechazado` | Badge rojo con texto | Rechazo fiscal final correlacionado y persistido |
| `SIFEN: Pendiente de confirmación` | Badge amarillo con texto | Enviado o envío indeterminado sin resultado fiscal final confiable, aunque todavía no se haya consultado |
| `SIFEN: Sin información` / `Aún sin transmitir` | Badge gris con texto | Documento todavía no transmitido/sin información verificable |

Los estados de envío `Enviado` y de e-mail siguen separados y no heredan los colores fiscales. Las situaciones `Cancelado` e `Inutilizado` se mantienen como estados propios ya previstos; no transformarlas en `Rechazado` por simplicidad.

**Error técnico separado:** ante `CDC_DIVERGENTE`, mostrar `Inconsistencia de consulta: CDC distinto del registrado` en una cápsula/aviso de peligro ROJO distinto del badge fiscal; ese rojo significa **alerta técnica**, no rechazo fiscal. Si la FE está enviada y no hay otra confirmación válida, su estado fiscal permanece amarillo `Pendiente de confirmación`. La leyenda detallada `Sin consultar` puede conservarse en el historial exacto cuando proceda. Nunca mentir sobre si la consulta se hizo o fue válida.

### Captura real: caso de regresión

FE **001-003-0009015**: recepción gateway HTTP 200 a las 05:44:38; consulta a las 12:36:21 con respuesta del proveedor `Rechazado` / `Certificado digital no vigente al momento de firma del DE`, pero intento registrado `CDC_DIVERGENTE`. CDC persistido sin confirmar; fila presenta `SIFEN: Sin consultar`.

**No está probado que el documento sea fiscalmente rechazado.** La comprobación de CDC falló y el error de certificado informado en la respuesta debe permanecer visible/auditable. No tomar el texto `Rechazado` del proveedor como prueba fiscal suficiente ni modificar un final válido sin correlación. No borrar, reescribir ni ocultar la respuesta histórica.

## 2. Diagnóstico estático comprobado el 29/10

1. `lib/facturacion/consulta-automatica.ts`: existe scheduler backend con intervalos y `ejecutarLote`, lease en BD, `fe_consulta_reservar` y `fe_consulta_programar`, consultas por actor autorizado, backoff `[60,120,300,600,1800,3600]`. **`TIPOS_CONSULTA_AUTOMATICA = ["NCE"]`**: FE excluida.
2. `lib/facturacion/refresco-documentos.ts`: refresca la lista por GET y **nunca** dispara consulta al gateway. No utilizar el refresh del navegador como solución automática.
3. `app/(private)/documentos/page.tsx`: `claseSifen` ya aplica `statusActive/statusDanger/statusWarning/statusInfo` para estados persistidos, pero `SIN_CONSULTA` es informativo (gris/azul) aunque la FE ya fue enviada. Se muestran ejes SIFEN/envío/e-mail y `ultimaConsultaResultado`, pero el operador debe abrir el detalle para comprender anomalías.
4. `app/api/documentos/[id]/consultar/route.ts`: POST de consulta manual con `EDITAR`, no debe convertirse en polling masivo del frontend.
5. `lib/facturacion/shared.ts::consultarEstado`: llama al gateway por identidad fiscal y a `decidirConsulta`, persiste el resultado mediante `fe_documento_registrar_consulta` o flujo NCE. Conservar las protecciones NEX-054; HTTP 200 ≠ aprobación fiscal.
6. `lib/facturacion/estados.ts`: ejes independientes `estadoLocal`, `estadoSifen`, `estadoEmail`. `ETIQUETA_RESULTADO_INTENTO.CDC_DIVERGENTE` ya existe.
7. PRO-334 es **color por tipo de documento** FE azul/NCE amarillo; esta orden es **color por estado fiscal**, implementado en badges y alertas, **sin competir con el fondo de la fila**.

## 3. Trabajo de ingeniería autorizado

### A. Motor de consultas FE sin navegador

- Inspeccionar el arranque real de `iniciarPlanificador` (importaciones/entrypoint, ciclo de vida del servicio y despliegue de la app). **No basta** ampliar el array de tipos si el planificador no se ejecuta de forma durable. Confirmar que las FE elegibles aparecen en `fe_consulta_reservar` con permisos, aislamiento de empresa y criterios de elegibilidad correctos. La consulta automática FE debe iniciar después de recepción/envío indeterminado sin requerir usuario conectado.
- Reutilizar el scheduler NCE existente y su lease `FOR UPDATE SKIP LOCKED`, reintentos, cola y recuperación; **no crear un segundo scheduler paralelo** ni un poller por navegador. Asegurar un único intento activo por documento, control de concurrencia entre varias réplicas y cadencia hacia gateway; no duplicar intentos por carrera.
- Elegibilidad: FE/NCE transmitida o transmisión indeterminada con identidad consultable, SIFEN no terminal y configuración válida. No consultar documentos solo creados y no enviados. Respetar el estado definitivo y versión fiscal. En errores HTTP, timeout, red, respuesta inválida, credenciales ausentes y CDC divergente, preservar evidencia; reprogramar con backoff cuando proceda, marcar revisión operativa sin cambiar verdad fiscal.
- Si faltan credenciales o actor con permiso, dejar rastro de limitación en mecanismo existente o señal operativa mínima, **sin simular consultas realizadas** y sin filtrar secretos en logs. No usar identidad inventada ni privilegios globales.
- Si el scheduler depende de un proceso Next.js efímero que no puede garantizar ejecución, presentar la solución mínima duradera compatible con la infraestructura existente; **no desplegarla ni modificar la VM**. Declarar claramente cualquier gate del runtime. Si el SQL base no soporta FE, proponer la menor migration incremental segura **solo versionada** y explicar dependencia de activación; no editar/volver a aplicar migrations históricas.
- Tras confirmar resultado final fiscal, no hacer ajustes de stock en esta tarea. PRO-310/309 tratarán reserva→SALIDA y liberación con su propio gate. Prohibida emisión/reenvío automático.

### B. Badges y alertas sin cambiar semántica fiscal

- Usar el **estado fiscal confirmado que ya existe en BD** como fuente; derivar **solo una presentación** `Pendiente de confirmación` para `SIN_CONSULTA` / `PENDIENTE` / `NO_RECONOCIDO` cuando el documento ya esté en `ENVIADO` o `ENVIO_INDETERMINADO`. **No reescribir `estado_sifen` solamente para cambiar colores.**
- Para `APROBADO` verde y `RECHAZADO` rojo, exigir que la transición provenga de `decidirConsulta` y reglas SQL de correlación/terminalidad, nunca del texto/HTTP crudo de una respuesta incompatible.
- Presentar `CDC_DIVERGENTE` en la misma línea sin expandir detalles, mediante badge técnico rojo `Inconsistencia de consulta`; detalle explica CDC e intento, mensaje gateway, fecha y JSON. Separar `ERROR_HTTP`, `TIMEOUT`, `RESPUESTA_INVALIDA` cuando no exista rechazo fiscal: advertencia técnica, no badge `SIFEN: Rechazado`. Evitar mostrar alerta antigua como actual si después existe consulta válida/confiable; conservar historial.
- Usar clases CSS específicas, componentes pequeños, suficiente contraste, etiqueta accesible y textos en español PY; preferir **cápsula con borde/fondo** a colorear toda la fila. Iconos si agregados son complemento, nunca única información. Seguir funcionando a 360/768/1366px y con zoom sin desbordar ni sustituir KuDE, historial o acciones.
- Preservar `Consultar estado en SIFEN` bajo permisos actuales; la consulta manual refresca la fila y deja su intento auditado. El campo de última consulta conserva distinción entre intento exitoso e intento técnico fallido. `Próxima consulta` sólo si disponible y correctamente registrada, sin fechas supuestas.
- Los indicadores/KPI/filtros de grupos SIFEN siguen basados en estado fiscal real, **no** en color de presentación; no inflar KPI de rechazados con CDC divergentes.

### C. Seguridad e invariantes

- No alterar numeración, CDC, payload de emisión, JSON histórico, fechas de firma/envío, stock/reservas, autorización MASTER, NCE, KuDE (PRO-326), emails, corrección/reemisión E09 (PRO-311), informes, formato monetario ni estilos compartidos fuera de necesidad estrictamente localizada.
- Mantener ACL `empresa/sucursal/usuario`, saneo de JSON de respuestas E01/E02 y transiciones terminales protegidas por NEX-054.
- Considerar respuestas asíncronas y cambios de versión: no aplicar una respuesta de V1 al estado de V2 ni retroceder APROBADO por una respuesta tardía. Investigar contrato de gateway antes de afirmar que un CDC retornado pertenece al documento.

## 4. Casos de aceptación para escribir como código (NO ejecutar)

| Caso | Resultado esperado |
| --- | --- |
| P338-01 FE enviada, SIFEN no final, sin navegador | Worker elegible consulta y programa siguiente |
| P338-02 NCE existente | Conserva automatización actual |
| P338-03 dos workers | Lease evita consulta simultánea duplicada |
| P338-04 FE no transmitida | No se consulta; badge gris |
| P338-05 FE enviada sin respuesta | Badge fiscal amarillo |
| P338-06 respuesta correlacionada APROBADO | Estado fiscal verde |
| P338-07 respuesta correlacionada RECHAZADO | Estado fiscal rojo |
| P338-08 recepción HTTP 200, sin estado SIFEN | No aprobar |
| P338-09 respuesta Rechazado + CDC_DIVERGENTE | Fiscal no confirmado amarillo + alerta técnica roja |
| P338-10 certificado expirado + identidad no confiable | Sin marcar rechazo fiscal; mensaje visible |
| P338-11 timeout/red/error HTTP | Persistencia y backoff; sin reenvío |
| P338-12 estado terminal seguido de respuesta tardía | No regresa |
| P338-13 actor/credencial ausentes | No inventar consulta, registrar limitación |
| P338-14 múltiples empresas/sucursales | Sin cruce de información ni credenciales |
| P338-15 consulta manual autorizada | Conservada y refleja actualización |
| P338-16 reintento de proceso tras reinicio | Recuperación con lease vencido |
| P338-17 filtros e indicadores | No cuentan anomalía técnica como rechazo fiscal |
| P338-18 tipo FE/NCE y estado fiscal | Colores de PRO-334 independientes |
| P338-19 teclado, contraste, zoom y móvil | Badges legibles y accesibles |
| P338-20 KuDE sin CDC/RECHAZADO | Comportamiento previo preservado |

## 5. Archivos a inspeccionar; permiso de cambio restringido

Principales: `lib/facturacion/consulta-automatica.ts`, inicialización real del planificador, `lib/facturacion/shared.ts` (lectura/consulta sólo si necesario), `lib/facturacion/estados.ts`, `app/(private)/documentos/page.tsx` y `page.module.css`, selector del listado/API en caso imprescindible, además del SQL vigente que define `fe_consulta_reservar` y `fe_consulta_programar`.

No cambiar todos esos archivos automáticamente: **leer, localizar causa y editar solo los imprescindibles**. Prohibido tocar estilos generales o rutas de emisión si el defecto puede resolverse sin ello. Si los casos requieren nuevo archivo, ponerlo en directorio de tests fuente del módulo sin incorporarlo al runner global. Si una migration nueva resulta imprescindible, no aplicarla ni modificar la ya publicada E03-A1/NEX-072 sin orden específica.

## 6. Entrega obligatoria y parada

1. Informar causa exacta de por qué FE no se consulta hoy, evidencia del arranque server-side y si la cola SQL existente admite FE.
2. Implementar únicamente PRO-338 y escribir los casos dirigidos como código. **Cero ejecuciones** de tests, lint, typecheck, build, CI manual, SQL, PostgreSQL, Docker, VM, navegador/gateway productivo y deploy.
3. Commit y push a la branch oficial. Informar **SHA completo**, archivos modificados, migraciones versionadas/no aplicadas, escenarios no verificables y restricciones del runtime.
4. **PARAR**: no auto-iniciar PRO-334/333/311/310/312 completa, no dar por homologado, no mover a Done. ChatGPT revisa diff y riesgos antes de autorizar pruebas/implantación.

**Estado esperado tras código:** PRO-338 `In Review` sólo después de auditoría ChatGPT; sin despliegue ni homologación. PRO-312/309 siguen con sus gates respectivos.
