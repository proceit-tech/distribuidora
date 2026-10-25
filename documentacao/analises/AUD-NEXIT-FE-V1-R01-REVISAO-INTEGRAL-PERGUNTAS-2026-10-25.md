# AUD-NEXIT-FE-V1-R01 — Revisión integral funcional y técnica, preguntas pendientes

**Fecha:** 25/10/2026. **Ámbito:** NEXIT V1, `Facturación → Facturas → Nueva factura electrónica`, `Facturación → Documentos electrónicos`, PostgreSQL, SIFEN, stock y vendedores. **Resultado:** DISEÑO INCOMPLETO — preguntas de negocio abiertas. **No es una orden de implementación ni una homologación.**
**Fuente de requisitos confirmados:** `documentacao/definicoes/REQ-NEXIT-FE-V1-ESTADOS-RESERVA-CORRECCION-2026-10-25.md`; `REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01-2026-10-24.md`; instrucciones del responsable, 25/10/2026.
**Repositorio/branch:** `proceit-tech/distribuidora`, `feature/NEXIT-2026-001-banco-demo`. Lectura remota GitHub, SIN PostgreSQL real, VM, gateway ni pruebas locales. **No alterar datos históricos: existen FE ya APROBADO en SIFEN.**

## 1. Reglas de negocio ya aprobadas (NO preguntar nuevamente)

1. El estado de documentos y los eventos pertenecen a **Documentos electrónicos**, no al formulario de Nueva factura.
2. Conservar **JSON exacto del documento fiscal enviado**, versiones/tentativas y todas las respuestas disponibles de API, firma y procesamiento, cronológicamente, con secretos retirados. Una FE puede tener varias fases/resultados; nunca perder el histórico ni considerar ENVIADO = APROBADO.
3. Una FE RECHAZADO es corregible y se vuelve a someter a validación hasta APROBADO, manteniendo evidencia de todos los rechazos/correcciones.
4. **Stock:** al enviar registrar intención `SALIDA PENDIENTE` y **RESERVAR** productos controlados; solo la aprobación SIFEN hace **SALIDA real**. Entre tanto el stock físico no baja, pero el stock disponible para venta sí disminuye. Garantizar idempotencia, concurrencia y trazabilidad por depósito/lote.
5. `Fecha de emisión` editable en el formulario; valor hoy por defecto, ventana de negocio solicitada de **−30/+5 días** en zona Paraguay. Su validez ante SIFEN/gateway es asunto fiscal a resolver, no permiso para transmitir documentos inválidos.
6. Combo `Vendedor` seleccionado de registros de la empresa, distinto del usuario emisor; enviar `Vendedor: ...` en `dInfAdic` y conservar observaciones/dirección de entrega.
7. Mostrar 13 tipos oficiales `iTipTra` en el combo y validar coherentemente UI/API/JSON.
8. Mostrar `Cancelar documento` para FE APROBADO en ventana de **48 horas desde aprobación SIFEN**. API de cancelación AÚN no disponible: botón no operativo/deshabilitado con mensaje. PRO-199 sigue suspendida para evento/rollback; no inventar endpoint.
9. MASTER, tenant, nueve perfiles comunes predefinidos, administradores empresariales y múltiple perfil se rigen por la arquitectura fechada 24/10; **usuario ≠ vendedor comercial** universalmente.
10. Sin autorización a Claude para implementar; ChatGPT gestiona análisis/Linear y audita; humano controla VM, migraciones y homologación.

## 2. Hallazgos comprobados (Código Git)

| ID | Evidencia | Impacto / trabajo necesario |
|---|---|---|
| A01 — CRÍTICO | `NEX-067-facturacion-stock-baja-fe.sql`: `fe_stock_baja_documento`, `SALIDA/VENTA` al CREAR; `lib/facturacion/stock-fe.ts` asignación de saldo físico | Contradice la RESERVA hasta APROBADO. No aplicar la versión existente sin verificar estado de migrations/VM. Si aplicada, diseñar migración incremental de compatibilidad; si no aplicada, planificar reemplazo versionado o nueva migración, conservando historial auditado. |
| A02 — ALTO | `NEX-048-facturacion-emision-fe.sql`, `fe_documento_crear_fe`: completa `dFeEmiDE` y `fecha_emision` con `now()`; `app/(private)/facturas/nueva/page.tsx` usa fecha informativa | Para editar fecha hacen falta UI, revisión, contrato TS/API y SQL, no solo un input. No modificar historial ni una migration aplicada. |
| A03 — ALTO | `lib/facturacion/info-adicional.ts`: `vendedorDe` consulta usuario emisor; `emision.ts` lo aplica; `NEX-002-seguridad.sql` contiene usuarios/perfiles | Falta catálogo vendedor elegible según decisión pendiente del responsable, snapshot de vendedor seleccionado y control backend/huella/aislamiento. No equiparar usuario con vendedor por defecto. |
| A04 — MEDIO | `lib/facturacion/payload-fe.ts` tiene `CATALOGO_TIPOS_TRANSACCION` 1–13 pero `TIPOS_TRANSACCION` 1–4; `validarEntradaFE` bloquea 5–13; el payload usa `iTipTra` | Mostrar todos los tipos, alineando validador; verificar requisitos fiscales por tipo, `iTImp`/IVA y contrato proveedor. No atribuir IVA10 o SALIDA automática a operaciones de compra/divisa sin análisis. |
| A05 — ALTO | `NEX-047` crea `documentos_electronicos` (3 ejes de estado) y `documento_electronico_intentos.respuesta jsonb`; `NEX-048` crea `documento_electronico_solicitudes.payload`; `NEX-049` registra intentos de envío | Existe buena base. Faltan historial inmutable request JSON **por intento/version** y eventos de firma/procesamiento en forma consultable; retención/volumen de JSON debe considerarse. El JSON de las respuestas puede contener información sensible: sanitizar secretos, no eliminar hechos fiscales. |
| A06 — MEDIO | `lib/facturacion/shared.ts:listarIntentos` devuelve máximo 100 intentos sin `respuesta` ni `solicitudes.payload`; `app/(private)/documentos/page.tsx` presenta historial, no JSON completo | Agregar navegación/paginación historial y consulta de solicitudes/respuestas por intento con ACL por tenant; no exponer contraseña/token. No sustituir un historial completo por últimos 100. |
| A07 — ALTO | `app/(private)/documentos/page.tsx` posee `Reenviar el mismo documento (confirmar)` para FE con ERROR_ENVIO/RECHAZO, pero **reenvía el mismo payload**; la corrección con editor existe para NCE solamente | Diseñar FE `Corregir y reenviar` con snapshot por revisión, mutabilidad limitada y relaciones entre documentos/tentativas; nunca sobrescribir JSONs anteriores. Distinguir rechazo API por validación y RECHAZADO fiscal. |
| A08 — ALTO | `NEX-054-facturacion-consulta-estado-final.sql` preserva `RECHAZADO`/ `APROBADO` como estados terminales; los intentos contradictorios se registran | No permitir un UPDATE artificioso que transforme la misma emisión rechazada en APROBADO. Si corrige identidad/payload, correlacionar nueva emisión/revisión según CDC y reglas SIFEN. |
| A09 — ALTO | `lib/facturacion/consulta-automatica.ts`: `TIPOS_CONSULTA_AUTOMATICA = ["NCE"]`; página Documentos hace GET/poll de listado pero ese GET NO consulta SIFEN | Para conversión de reserva→salida al aprobar, FE debe consultarse por servicio confiable sin exigir navegador, mediante mecanismo idempotente y durable con lease/recuperación y permisos correctos. |
| A10 — CRÍTICO | `NEX-047/048/049` tiene índices/relaciones por empresa y claves fiscales únicas; `NEX-067` deja intenciones de stock ya convertidas en salida inmediata | Registrar FE históricos y su saldo al implantar el nuevo flujo. No crear reservas ni nuevas SALIDAS para documentos históricos que ya consumieron stock. Verificación real en `schema_migrations` y saldos solo por responsable humano. |

## 3. Verificación normativa (DNIT) y riesgos que no se deben ocultar

- FAQ DNIT e-Kuatia: cancelación de FE **48 horas después de aprobación**; otros DTE hasta 168h. El sistema e-Kuatia'i tiene regla **diferente** (FE 120h). Fuente: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes
- FAQ DNIT sobre transmisión normal: envío ≤72h desde firma y diferencia emisión/transmisión de hasta 120h en ambos sentidos; fuera de ese régimen puede ser transmisión **extemporánea**. Fuente: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes/-/categories/2705333 . **No deducir de aquí aceptación automática de -30 días.**
- La referencia DNIT a **hasta 30 días corridos anteriores** encontrada pertenece a guía de emisión **e-Kuatia'i**, NO al régimen e-Kuatia del gateway NEXIT. No extrapolarla como homologación de -30 en este sistema. Fuente (guía PDF de e-Kuatia'i): https://www.dnit.gov.py/documents/20123/884739/Guia%2BPaso%2Ba%2BPaso%2B-%2BEmisi%C3%B3n%2Bdel%2BDocumentos%2BTributarios%2Ba%2Btrav%C3%A9s%2Bdel%2BSistema%2BEkuatia%C2%B4i.pdf/7aef7ee8-28bd-a63b-73ef-5fa92181eee5
- FAQ DNIT de rechazo: se puede corregir y reenviar cuantas veces haga falta; **CDC reutilizable siempre que no se altere la estructura de datos del DE**. Si DE rechazado no consigue aprobación y no se entregó bien ni servicio, corresponde inutilización del número. Fuente: https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes?_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_idba_cur=5&_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_idba_delta=10&_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_idba_redirect=%2Fen%2Fweb%2Fe-kuatia%2Fpreguntas-frecuentes%2F-%2Fcategories%2F2677736&p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_idba&p_p_lifecycle=0&p_p_mode=view&p_p_state=normal&p_r_p_categoryId=2677736
- Manual Técnico v150 D011/D012 identifica los trece `iTipTra`; la descripción y obligatoriedad fiscal dependen del grupo. Fuente: https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907

## 4. PREGUNTAS ABIERTAS PARA EL RESPONSABLE (NO INFERIR RESPUESTAS)

**P01 — Reserva al rechazarse la FE (bloqueante P0).**
Cuando la API o SIFEN rechaza definitivamente una FE y el usuario va a corregir/reemitirla, ¿el stock sigue RESERVADO mientras se corrige, o se libera inmediatamente y se vuelve a reservar en la nueva emisión?
- **Propuesta técnica:** mantener la reserva vinculada al proceso de corrección hasta resolverlo, evitando liberar unidades y luego no poder emitir, con control de bloqueo temporal/abandono. *No aprobado.*

**P02 — Desistimiento o FE sin aprobación (bloqueante P0).**
Si nunca se corrige una FE rechazada, o el cliente desiste de comprar, ¿quién puede cerrar la operación y liberar la reserva? ¿Se exige permiso del administrador de empresa o también del gerente? La inutilización fiscal del número es un proceso diferente que no se puede fingir.
- **Propuesta:** acción auditada `Cerrar operación sin aprobación` solo tras constatar que no hay envío/proceso indeterminado, autorizada por administrador de empresa; liberar reservas y marcar necesidad de inutilización según corresponda. *No aprobado.*

**P03 — Momento y fallo del envío (bloqueante P0).**
Se reserva al pulsar `Enviar factura`, pero ¿qué ocurre si el gateway ni siquiera recibe la solicitud por credenciales no configuradas, HTTP rechazo técnico o fallo de red con resultado indeterminado?
- **Propuesta:** preflight de credenciales antes de reservar; si certeza de NO transmisión, liberar reversiblemente; si hubo petición o incertidumbre, retener hasta consulta/reconciliación (no duplicar envío/stock). *No aprobado.*

**P04 — Alcance de corrección fiscal (bloqueante P0).**
En FE `RECHAZADO`, ¿se pueden corregir cliente, dirección fiscal, ítems, cantidades, precios, IVA, vendedor y fecha, o solo campos que provocaron el rechazo? ¿Quién decide si el mismo CDC/número sigue siendo válido? 
- **Propuesta:** edición de campos de negocio corregibles y revisión completa, pero número/CDC/cadena fiscal determinados por regla DNIT y contrato real del gateway; nuevo documento correlacionado cuando identidad/campo estructural obliga; historial nunca editable. *Regla pendiente de contrato proveedor.*

**P05 — Fuente del combo Vendedor y obligatoriedad (bloqueante P1).**
¿Los vendedores serán **usuarios empresariales activos con perfil fijo `Vendedor`**, o **catálogo comercial independiente** (puede haber vendedor sin acceso a NEXIT)? ¿Se exige elegir vendedor para toda FE o puede quedar sin vendedor?
- **Propuesta:** usuarios activos con perfil `Vendedor` dentro de la misma empresa; combo obligatorio solo si negocio así lo aprueba; no presuponer equivalencia entre **todos** los usuarios y vendedores. *No aprobado.*

**P06 — Fecha anterior a cinco días (bloqueante fiscal P1).**
Se confirma ventana de interfaz de −30/+5. Para fecha anterior a cinco días, ¿debe NEXIT **permitir transmitir como extemporánea con aviso explícito y control fiscal del proveedor** o **bloquear envío hasta disponer de un procedimiento/homologación especial**? ¿Fecha futura se envía de inmediato o se programa?
- **Propuesta:** permitir seleccionar fecha, mostrar aviso fiscal; **no transmitir** fuera de la regla que el gateway/SIFEN realmente soporte, hasta tener evidencia de homologación. *No aprobado.*

**P07 — Tipos especiales 5–13 y stock (bloqueante fiscal P1).**
El responsable confirmó ofrecer los trece `iTipTra`. ¿La V1 debe **emitir operacionalmente todos** (con sus reglas de IVA, impuestos, contraparte y movimientos), o mostrar el catálogo completo y habilitar progresivamente los tipos fiscalmente compatibles con el gateway? Operaciones `Compra de productos`, `Donación`, `Venta de divisas`, `Anticipo`, etc. no deben heredar automáticamente la salida de stock de la `Venta de mercadería`.
- **Propuesta:** combo de 13 visible; habilitar emisión por tipo con validación/gateway probado; operaciones no soportadas informan motivo y no reservan stock o número. *No aprobado como restricción de todos los tipos.*

**P08 — Seguimiento de FE y conversión automática de stock (bloqueante de operación P1).**
¿Confirmamos que el backend debe consultar de forma automática y duradera las FE `ENVIADO/PENDIENTE` y efectuar SALIDA cuando llega APROBADO, aunque nadie esté conectado al navegador?
- **Propuesta:** sí; reutilizar scheduler de NCE con cadencia, leases, tolerancia a caídas y estado de reproceso visible en Documentos. No simular APROBADO cuando falla consulta/stock. *No aprobado aún.*

## 5. Decisiones de implementación que deben ser técnicas, NO nuevas preguntas del usuario

- Conservación y consulta segura de solicitud JSON **por intento** y de respuesta completa disponible por fase; no guardar token/password/secretos en la auditoría, JSON de proveedor/sello con sanitización por campos.
- `documento_electronico_intentos` y `documento_electronico_solicitudes` son estructuras base, sin multiplicar innecesariamente tablas. Diseñar versión de factura y relaciones entre intentos y emisiones fiscales; índice por empresa/sucursal, ACL en servidor.
- Distinguir `ERROR_ENVIO/RECHAZO` (receptor API) de `estado_sifen=RECHAZADO` (fiscal) y de error de firma/RED; no liberar reserva ante resultado ambiguo.
- Aprobación SIFEN recibida mientras hubo fallo transaccional de baja: persistir condición de `STOCK_PENDIENTE_DE_CONTABILIZAR` o equivalente de recuperación y reintentar sin duplicar; nunca cambiar el estado SIFEN verdadero por fallo de inventario.
- Mantener registros de FE aprobadas previamente y de NCE vinculadas: sin backfill arbitrario de reservas ni nuevas salidas sobre documentos históricos.
- Validar riesgos fiscales de fecha (D002), secuencia, CDC, plazo, `iTipTra`, `iTImp`, vendedor, datos de receptor, precio/IVA. No modificar NT13 ya homologada en código sin defecto comprobado.
- Validar permisos por módulo contratado, perfil y empresa/sucursal/depósito, especialmente `Documentos → Rechazado → Corregir`, ventas y gerentes, MASTER y alcance multiempresa.
- Botón cancelar UI sin integración API operativa, sin alteración de estados/stocks hasta posterior autorización/contrato de proveedor.
- Mostrar fases según datos reales que retorne gateway; no inventar «firmado» cuando API solo devolvió `ENVIADO`.
- Criterios de aceptación: concurrencia FE vs venta ordinaria, FE A/B simultáneas, rechazo antes/después de transmisión, dos depósitos/lotes, decimales, triple retry, timeout ambivalente, reenvío tras cambio de vendedor/fecha, aprobada duplicada, compensación segura, 13 tipos, −30/+5, JSONs, 48h y tenant isolation.

## 6. Secuencia de trabajo futura (NO AUTORIZADA TODAVÍA)

1. **ChatGPT (ahora):** auditoría de reglas, levantar preguntas y registrar GitHub/Linear. Mantener P01–P08 como PENDIENTES.
2. **Responsable:** responder P01–P08; ChatGPT versiona decisiones finales y criterios de aceptación sin ambiguidades.
3. **ChatGPT:** auditar migrations realmente aplicadas (evidencia aportada/operada por humano), diseñar plan SQL seguro y preparar 1 orden limitada al Claude; vincular issue y estado, sin mezclar 8 cambios.
4. **Claude (solo tras orden):** una funcionalidad por vez; tests dirigidos, commit/push y PARA para auditoría independiente ChatGPT.
5. **Humano:** preflight/migration/backup/rollback autorizados, homologación en PG, gateway y navegador, sin reemitir FE reales sin autorización. Solo tras aceptación marcar completadas.

## 7. Correspondencia Linear

- `PRO-93` formulario FE; `PRO-294` fecha; `PRO-307`/`PRO-72` vendedor; `PRO-134` iTipTra; `PRO-91` documentos y timeline; `PRO-97/98` consulta FE.
- `PRO-200` paquete histórico CASA MINGO: **no usar para implementar sin rediseño** de NEX-067; issue nueva específica para reserva/aprobación recomendada.
- `PRO-199` API cancelación suspendida, solo botón visible no operativo; `PRO-113` migrations; `PRO-115` homologación.
- `PRO-304/305/306/308/293` multiempresa gate: no iniciar E2 automáticamente. `PRO-94` NCE debe preservar su saldo/funcionamiento.

**Veredicto:** EXISTEN PENDENCIAS DE NEGOCIO Y BLOQUEOS CRÍTICOS. No escribir orden de desarrollo FE ni declarar código apto hasta cerrar preguntas y estrategia de migration/flujo.
