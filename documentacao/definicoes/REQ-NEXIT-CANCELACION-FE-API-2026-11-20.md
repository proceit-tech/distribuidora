# Cancelación fiscal de Factura Electrónica — contrato parcial y requisitos — 20/11/2026
## Evidencia y alcance
El responsable entregó captura Postman del POST `{{e_facturahub_mdware}}/api/cancelacion_dte` con autorización configurada y cuerpo JSON. Primera captura: acredita ruta y ejemplo de solicitud. La evidencia adicional al final acredita URL, ACK HTTP 200 y consulta del evento por la misma consulta DE, con primera muestra de evento rechazado; la actualización vinculante final acredita además JSON completo y evento aprobado. Usar base URL y autenticación de la empresa/instalación ya acreditada, nunca la de otro emisor. No copiar números reales del ejemplo ni probar contra producción. Registro de requisito, no orden de ejecución ni autorización de un evento real.
```json
{
  "dEst": "001",
  "dPunExp": "001",
  "dNumDoc": "NNNNNNN",
  "dSerieNum": null,
  "mOtEve": "Error en informacion de emision",
  "tipoDoc": "FE"
}
```
Ejemplo ilustrativo: dNumDoc sustituido deliberadamente por marcador no operativo. dSerieNum debe ser la serie literal persistida (p.ej. AA si corresponde; null sólo para documento sin serie y contrato confirmado). Identidad fiscal autorizada, CDC, cuenta, empresa y ambiente acreditados en servidor; no aceptar identidad del navegador como autoridad. Confirmar mOtEve y sus límites con documentación efectiva. No hardcodear motivo ni credenciales.
## Regla vinculante de elegibilidad
Sólo FE aprobada por SIFEN: hasta 48 horas exactas posteriores a FECHA Y HORA OFICIAL DE APROBACIÓN por SIFEN (48h = 172800 segundos; límite inclusivo sujeto a aceptación del proveedor, nunca después). Referencia DNIT e-Kuatia: https://www.dnit.gov.py/web/e-kuatia/preguntas-frecuentes/-/categories/400231 ; RG 23/19 art. 22: https://www.dnit.gov.py/web/portal-institucional/w/resolucion-general-n-23-19 . No aplicar plazo de e-Kuatia'i ni extender a NCE/otros DTE. Fecha de firma, emisión, transmisión, consulta o detección local de aprobación NO equivalen a aprobación oficial. Falta fuente contractual verificable de timestamp de aprobación: guardar exclusivamente dato real acreditado, zona horaria explícita y normalización inequívoca; no backfill inventado. Si falta, es inválido, futuro o ambiguo, bloquear. Revalidar en backend el plazo, vigencia, identidad, permisos, contexto y documentos/eventos asociados antes de consumir autorización y transmitir. RG 23/19 contempla requisitos vinculados a documentos y eventos asociados; verificar restricciones, no cancelar asociados automáticamente. Después de 48h mostrar Plazo vencido; NCE es proceso separado (no implementar en esta orden).
## Interfaz y ciclo fiscal
Facturas/Documentos Electrónicos -> columna Eventos -> Cancelar documento. Habilitar sólo si elegible, contrato completo e integración homologada, sin evento pendiente ni cancelación confirmada. Mostrar fecha de aprobación y vencimiento; título corto, modal con documento, CDC, monto, motivo obligatorio no vacío (validación servidor según contrato), confirmación explícita y opción Volver sin efectos. Respetar permisos, escape y protección de solicitudes. Revalidar todo al confirmar, bloquear doble clic y concurrencia con operación idempotente persistida antes de HTTP; no repetir POST a ciegas. Solicitud, resultado fiscal del evento y estado de factura son cosas distintas: solicitud registrada/pendiente, aceptada oficialmente, rechazada, indeterminada. Etiquetas conceptuales (no nombres de campos ni valores contractuales inventados). Sólo confirmación oficial correlacionada del evento de cancelación cambia la FE a Cancelado; HTTP 200, recepción o status success no bastan por sí solos. Rechazo mantiene aprobación de FE; resultado incierto impide duplicar solicitud. Conservar estado original, identidad/CDC, payload, historial de solicitudes y respuestas saneadas, motivo, usuario, fechas, código y mensaje acreditados; preservar documento cancelado íntegro, único y definitivo. Consulta posterior manual y seguimiento controlado de estado aprobado/rechazado del EVENTO (no confundir con aprobación original FE). Permitir consultar pendientes incluso tras vencimiento, nunca iniciar nueva cancelación vencida. Seguimiento acreditado mediante POST /api/consulta_de con identidad fiscal y tipoDoc FE; sección Evento[] según evidencia adicional. Correlación inequívoca y resultados finales pendientes de completar; no inventar endpoint. No exponer Bearer, contraseña, JSON ajeno o datos cross-tenant.
## Gate de implementación y aceptación
Pendientes: formatos alternativos de respuesta POST (ACK 200 ya acreditado), identificación inequívoca del tipo de evento y correlación del evento/CDC/emisor (JSON completo y ejemplos aprobados/rechazados ya acreditados), timestamp oficial de aprobación con zona, límites de motivo, restricciones de asociados, reintentos/duplicidad, contexto y permisos. Hasta resolverlos: no habilitar botón operativo, ni afirmar contrato completo, ni simular cancelado. Preparar especificación/matriz de casos, revisión de esquema y cambios separados sujetos a autorización. Casos NO EJECUTADOS: aprobada dentro de 48h; límite exacto; >48h; aprobación sin fecha; fecha firma distinta; fecha futura/ambigua; no aprobada; ya cancelada; vinculados; permisos; motivo vacío; doble clic/carrera; POST sin confirmación; rechazo; timeout; consulta tras vencimiento; confirmación oficial; documento íntegro/historial; cuenta distinta; conservación de efectos comerciales hasta decisión aplicable. Ningún PHP/TS/SQL/migration/API/test/VM/deploy/merge en este registro.

## NEXIT — límites propios
Base 18d071fe524ca8883d8c2a41bcef0ac0ea149106, PR #7, rama feature/NEXIT-2026-001-banco-demo. Vincular PRO-313 (UI y timestamp de aprobación) y PRO-199 (evento fiscal y regla de reversión de stock previamente aprobada, pero suspendida). No duplicar tareas. Captura levanta sólo desconocimiento de ruta y formato de petición FE; falta contrato operativo completo. Mantener bloqueo A11 de PRO-313: FechaRegistro/FechaFirma/FechaEnvio no son aprobación sin semántica comprobada. Aislamiento multiempresa, sucursal, credenciales de empresa, identidad y evento. Preservar decisiones PRO-199: compensación de stock sólo tras confirmación oficial, cantidades y depósitos de origen, idempotencia, reversión pendiente recuperable; no implementar ni autorizar reversión ahora. NCE, otros DTE, inutilización y ajustes posteriores fuera de este requisito FE. No cambiar lógica de inventario ni ejecutar SQL. No abrir fase E10 sin orden; documentación solamente. PRO-342 y PRO-195 mantienen sus revisiones actuales.

## Evidencia adicional Postman — 20/11/2026 — recepción y seguimiento de cancelación FE
El operador mostró dos llamadas reales ya efectuadas por él; ninguna llamada realizada por ChatGPT. URL observada: https://gateway.e-factura-hub.com/api/cancelacion_dte, POST con los seis campos ya documentados, serie literal AA y motivo del operador. HTTP 200 (759 ms), cuerpo literal:
```json
{"status":"success","message":"Evento recibido correctamente"}
```
Esto acredita exclusivamente recepción del evento por el gateway, NO aprobación del evento por SIFEN. Estado local conceptual: cancelación solicitada / pendiente. No alterar aprobación original, no reponer stock, no repetir POST por este ACK.
Seguimiento confirmado: POST https://gateway.e-factura-hub.com/api/consulta_de con dEst, dPunExp, dNumDoc, dSerieNum y tipoDoc:"FE", mismos valores persistidos del documento. No crear endpoint de consulta del evento en proveedor. HTTP 200 (866 ms). Captura parcial del cuerpo en sección DE; fragmento observado (no es respuesta completa, no reconstruir encabezados no visibles):
```json
{
  "FechaEnvio": "2026-11-20 12:13:05",
  "Retorno": {
    "FechaRetorno": "20-11-2026 12:13:10",
    "CodRespuesta": "0260",
    "Mensaje": "Aprobado"
  },
  "Evento": [
    {"estado":"Rechazado","motivo":"TESTE MAGNO","detalle":"Error Inesperado","fecha_creacion":"Fecha inválida"}
  ]
}
```
Ruta response.DE.Evento (singular, array), confirmada por el JSON completo de la actualización vinculante final. No confundir Retorno.Mensaje Aprobado (FE original) con Evento[].estado Rechazado (cancelación). En caso observado la cancelación fue rechazada; FE sigue aprobada según retorno visible. No emitir nuevo evento automáticamente. Fecha inválida literal no es una fecha ni debe convertirse en fecha actual. Conservar evidencia saneada; no inventar identificador, tipo, fecha ni resultado. La estructura parcial no incluye ID/tipo del evento: no correlacionar múltiples eventos sólo por motivo ni por posición del array; confirmar identidad completa de documento/cuenta/CDC y correlación inequívoca con solicitud propia, gestionar ambiguos/no vinculables sin alterar estado fiscal. Recibir arrays vacíos/ausentes/múltiples, preservar historia y evitar regresiones. Solicitud ACK, estado del evento y estado fiscal de FE separados. Al consultar el mismo documento actualizar evidencia de FE Y eventos asociados, visualización en columna Eventos y detalle histórico (estado, motivo, detalle, fecha si válida); no disparar otro POST de cancelación ni afectar emisión/KuDE. Confirmación oficial de cancelación sólo tras acreditar evento aprobado correlacionado; la actualización vinculante final aporta muestra de evento aprobado; permanece pendiente mecanismo general de identificación/correlación. No inferir CANCELADO de Retorno.CodRespuesta 0260.
FechaRetorno observada es candidata a fecha oficial de aprobación al acompañar Retorno.CodRespuesta 0260 y Mensaje Aprobado, formato DD-MM-YYYY HH:mm:ss. Confirmar con proveedor significado exacto, zona horaria y que corresponde a aprobación inicial, no a consulta posterior/otro evento; conservar fecha de aprobación original acreditada, inmutable. No tomar FechaEnvio, FechaFirma, fecha_creacion ni reloj local. Mantener gate 48h hasta confirmar semántica. Nuevos casos escritos NO EJECUTADOS: ACK 200 success no cancela; consulta FE aprobada con evento rechazado y fecha inválida; arrays sin evento, múltiples, motivo duplicado, evento no correlacionado, timestamps inválidos, estado final contradictorio, consulta posterior al plazo, resultado aprobado sólo con evidencia contractual. Sin implementación, SQL ni evento real autorizado por este registro.

## Actualización vinculante — 20/11/2026 — JSON completo y evento aprobado
El responsable suministró el JSON completo de /api/consulta_de y confirmó expresamente que el tercer evento es una cancelación registrada correctamente en SIFEN. Se resuelven los gates de estructura completa y muestra de evento aprobado. No es una nueva llamada de ChatGPT. Se conserva el ejemplo a continuación con el CDC real sustituido por marcador documental (no usarlo en pruebas como CDC válido):
```json
{
  "status": "success",
  "response": {
    "Estado": "Aprobado",
    "FechaRegistro": "20-11-2026 12:13:00",
    "DE": {
      "CDC": "<CDC_DEL_DOCUMENTO>",
      "FechaFirma": "20-11-2026 12:12:30",
      "FechaEnvio": "2026-11-20 12:13:05",
      "Retorno": {
        "FechaRetorno": "20-11-2026 12:13:10",
        "CodRespuesta": "0260",
        "Mensaje": "Aprobado"
      },
      "Evento": [
        {"estado":"Rechazado","motivo":"TESTE MAGNO","detalle":"Error Inesperado","fecha_creacion":"Fecha inválida"},
        {"estado":"Rechazado","motivo":"teste magno","detalle":"Error Inesperado","fecha_creacion":"Fecha inválida"},
        {"estado":"Aprobado","motivo":"prueba Magno","detalle":"Evento registrado correctamente","fecha_creacion":"Fecha inválida"}
      ]
    }
  }
}
```
Ruta exacta response.DE.Evento (singular, array). Respuesta literal observada de evento aprobado: estado Aprobado, detalle Evento registrado correctamente. El Estado Aprobado y Retorno.CodRespuesta 0260/Mensaje Aprobado permanecen como aprobación de FE original incluso con cancelación aprobada. No exigir que response.Estado sea Cancelado para reconocer el evento. Conservar las tres ocurrencias (dos rechazadas, una aprobada); no sobrescribir histórico por el último elemento, no asumir orden temporal del array, no unificar motivos por mayúsculas ni inventar timestamps. Fecha inválida => fecha no disponible; conservar literal como evidencia. En este caso el responsable acredita el tipo de evento como cancelación. Proyección de negocio requerida: documento Cancelado si evento de cancelación Aprobado acreditado y correlacionado con la identidad/CDC/cuenta del documento; impedir otra cancelación y preservar aprobación original como histórico. No revertir a Aprobado por una consulta posterior que repita estado original, ni por eventos rechazados/ausentes. No clasificar cualquier Evento Aprobado como cancelación sin contexto de tipo y correlación acreditados: la respuesta no incluye id ni tipo de evento y el ACK no devuelve id. Para eventos ambiguos, mostrar estado literal e historial, sin mutación definitiva ni estorno. Confirmar mecanismo general de identificación de cancelación con proveedor; no exigir un ID inexistente inventado ni correlacionar por motivo/posición solamente. No bloquear lectura del evento observado ni desarrollar una segunda consulta. 
Formatos comprobados individualmente: response.FechaRegistro DD-MM-YYYY HH:mm:ss; response.DE.FechaFirma DD-MM-YYYY HH:mm:ss; response.DE.FechaEnvio YYYY-MM-DD HH:mm:ss; response.DE.Retorno.FechaRetorno DD-MM-YYYY HH:mm:ss. Aceptar formatos acreditados con validación calendárica estricta, separación de campos, sin timezone inventada ni conversión al reloj local. F014 ya tiene evidencia suficiente del formato de FechaFirma; implementar soporte sin alterar semántica. No hay campo lote en este JSON; F013 sigue pendiente de fuente contractual real. FechaRetorno es candidata a aprobación oficial inicial (0260), no FechaRegistro/Firma/Envio; aún confirmar semántica y zona con proveedor/responsable antes de habilitar plazo operativo de 48h. Guardar evidencia real y preparar cálculo estricto en servidor; no inferir fecha oficial por cercanía temporal. Caso de aceptación obligatorio: con estructura exacta, identidad acreditada y contexto de cancelación confirmado, tres eventos visibles, uno aprobado, proyección Cancelado, no nuevo POST ni regresión aunque Estado de FE siga Aprobado; si tipo/correlación aún no acreditados, lectura Aprobado del evento y bloqueo de nueva solicitud hasta resolver, sin marcar cancelación definitiva. Sin cambios de stock/cobranza ni operación real. Todos los casos NO EJECUTADOS.
