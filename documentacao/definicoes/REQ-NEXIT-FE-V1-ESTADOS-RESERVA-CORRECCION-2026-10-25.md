# NEXIT — Factura Electrónica V1: fechas, vendedor, estados, respuestas y reserva de stock

**Fecha de decisión:** 25/10/2026. **Origen:** instrucciones expresas del responsable del producto en la revisión de la V1. **Estado:** reglas funcionales confirmadas; análisis técnico/SQL, implementación y homologación pendientes. **No autoriza a Claude a implementar ni a nadie a ejecutar migrations/VM.**
**Proyecto:** NEXIT multiempresa, no una regla particular exclusiva de CASA MINGO. **UI:** español (Paraguay).
**Menus:** `Facturación → Facturas → Nueva factura electrónica` (captura y emisión) y `Facturación → Documentos electrónicos` (consulta, historial, corrección, cancelación). No crear un segundo panel de estados en Nueva factura.

## Decisiones CONFIRMADAS (FE-V1-01 a 08)

**FE-V1-01 — Fecha de emisión editable.** Campo `Fecha de emisión` con fecha de Paraguay actual por defecto. Ventana solicitada: hasta 30 días anteriores y 5 días futuros respecto del día local de Paraguay. Validar en UI y backend, impedir cambios posteriores a una emisión existente y conservar fecha exacta en revisión, snapshot y reintentos. La ventana de la interfaz no garantiza aceptación por SIFEN: distinguir transmisión normal/extemporánea, plazos de firma, reglas de fecha/hora y eventuales rechazos. Antes de habilitarla, verificar contrato JSON→XML del gateway y régimen operativo conforme al Manual Técnico SIFEN.

**FE-V1-02 — Vendedor comercial seleccionado.** Mostrar combo de vendedores registrados, activos y pertenecientes a la empresa de la sesión; respetar alcance aplicable. El operador/facturador autenticado es distinto del vendedor comercial elegido. El JSON de emisión debe contener la representación verificable del vendedor en `dInfAdic` (por ejemplo `Vendedor: Nombre Apellido`), sin reemplazar observaciones manuales ni dirección de entrega, sin duplicar bloques, con control de 5000 caracteres, huella de revisión y snapshot inmutable. No asumir automáticamente que el operador es vendedor; conservar identidad del emisor para auditoría. No introducir nombre desde un input arbitrario.

**FE-V1-03 — Tipos de transacción 1–13.** Exponer los trece códigos oficiales D011/`iTipTra` del catálogo que ya existe en `payload-fe.ts`. No basta con cambiar el `select`: actualmente `TIPOS_TRANSACCION` solo admite 1–4 y `validarEntradaFE` rechaza 5–13. Alinear UI, backend, descripción fiscal D012 y JSON del proveedor. No reinterpretar operaciones especiales como una venta común ni deshabilitar controles fiscales. Solo añadir campos o validaciones particulares cuando la operación lo exija; documentar cualquier código que el gateway no admita sin fingir homologación de los trece.

**FE-V1-04 — Historial fiscal en Documentos electrónicos.** Un único documento FE tiene estados diferenciados de transmisión local, procesamiento del gateway/firma y estado SIFEN. Puede recibir múltiples respuestas (transmisión, firma, proceso, consulta, rechazo, aprobación, error) a lo largo del tiempo; no sobreescribir ni perder eventos previos. Mostrar secuencia cronológica en `Documentos electrónicos → Detalle` con fecha/hora, fase, emisor de la respuesta, resultado, HTTP/código, mensajes, IDs de correlación, número/lote y CDC cuando disponibles. `ENVIADO` no equivale a `APROBADO`. Una respuesta tardía o contradictoria nunca degrada una aprobación, pero se conserva como evidencia. La lista muestra el estado fiscal vigente.

**FE-V1-05 — JSON por intento y respuesta.** Conservar el JSON de solicitud realmente transmitido y cada respuesta recibida, vinculados a documento, revisión/versión de payload, tentativa, fase, fecha/hora y correlación. Mantener el payload fiscal/snapshot original inmutable. Aprovechar `documentos_electronicos` y `documento_electronico_intentos` ya existentes, evaluando incremento SQL para eventos de firma y request por intento (actualmente `respuesta` registra solo parte de la evidencia). No guardar contraseña, bearer, certificados, headers de autorización ni secretos en logs o JSONs. Datos protegidos por tenant/permisos; no exponer información de otra empresa.

**FE-V1-06 — Stock: RESERVAR al enviar, SALIDA real solo al aprobar.** Al enviar FE con mercaderías controladas, registrar intención/movimiento de salida `PENDIENTE`, vinculado con FE + ítems/lotes/depósitos y reservar las cantidades de stock `DISPONIBLE/PROPIO`. Esta reserva impide venta concurrente sin disminuir stock físico: físico = 10, reservado = 6, disponible para vender = 4. Al confirmar `APROBADO` desde SIFEN, materializar una sola vez la salida real por depósito mediante motor de Inventario y consumir/cerrar la reserva, en operación transaccional, idempotente y recuperable. Cambios de estado intermedios no provocan salida real. No duplicar reservas, salidas, lotes ni gastos de costo al repetir consulta/reintento. Los servicios sin control de stock no reservan ni descuentan. La salida pendiente debe ser visible/rastreable como tal, aunque por integridad técnica se represente en estructura de intenciones y la SALIDA definitiva se cree solo después de aprobación.

**FE-V1-07 — FE rechazada: corregir y reenviar.** En `Documentos electrónicos`, el estado `RECHAZADO` debe permitir `Corregir y reenviar` con edición controlada de datos corregibles y nueva revisión/validación antes de transmitir. Registrar una nueva revisión/tentativa sin sobrescribir JSON, respuesta, fecha, CDC, ni identidad histórica de las tentativas anteriores. Repetir hasta obtener `APROBADO` u otra decisión permitida. Nunca modificar una FE aprobada. No asumir la política de mismo número/CDC frente a nuevo documento: comprobar con contrato de proveedor y SIFEN y conservar vínculo con el original. Si la corrección cambia ítems/cantidades/depósitos, reconciliar la reserva de modo atómico, sin liberarla indebidamente mientras subsista procesamiento/resultado indeterminado. El cierre/abandono con liberación definitiva de reserva y su autorización precisa deben concretarse durante análisis técnico antes de implementar.

**FE-V1-08 — Botón cancelar FE aprobada.** En `Documentos electrónicos`, mostrar acción `Cancelar documento` para FE `APROBADO`, dentro de 48 horas contadas desde fecha/hora de aprobación por SIFEN (régimen e-Kuatia del proyecto, no e-Kuatia'i). Registrar quién ejecutaría la acción y permitir visualizar la ventana temporal. El proveedor aún NO ofrece contrato/API de cancelación: crear el control visible con estado NO DISPONIBLE/deshabilitado y explicación precisa, pero **NO** simular cancelación, cambiar estado a `CANCELADO`, emitir evento sin contrato ni revertir stock. La cancelación operativa con API real y reversión de stock confirmada seguirá bloqueada en PRO-199 hasta disponer del contrato y nueva autorización. Verificar eventos/documentos vinculados y otras restricciones fiscales antes de una cancelación real.

## Diagnóstico técnico comprobado en Git (base del análisis)

- `app/(private)/facturas/nueva/page.tsx` conserva fecha solo como `hoy` informativo; tiene combo de tipo de transacción, pero catálogo operativo limitado.
- `lib/facturacion/payload-fe.ts` define `CATALOGO_TIPOS_TRANSACCION` con 1–13 y `TIPOS_TRANSACCION` con 1–4; `validarEntradaFE` aplica la lista corta.
- `lib/facturacion/info-adicional.ts` y `emision.ts` componen actualmente `Vendedor:` desde usuario autenticado; debe reflejar vendedor elegido, preservando operador en auditoría.
- `documentos_electronicos` ya distingue `estado_local`, `estado_sifen`, `estado_email`; `documento_electronico_intentos` registra respuestas JSON saneadas e intentos. Investigar cobertura de cada request y etapas de firma.
- `lib/facturacion/consulta-automatica.ts` por defecto procesa únicamente `NCE`; garantizar seguimiento efectivo de FE pendientes/indeterminadas en `Documentos electrónicos` sin desarrollar dashboard duplicado.
- **Conflicto alto:** `NEX-067-facturacion-stock-baja-fe.sql` y `stock-fe.ts` implementan SALIDA real al CREAR la FE, no reserva + salida al APROBAR. Auditoría y rediseño incremental obligatorios; verificar `schema_migrations` REAL antes de tocar cualquier SQL. No editar migración ya aplicada, no aplicar NEX-067 suponiendo que no está aplicada.
- Las FE aprobadas que ya existen son evidencia operativa; no reclamar primera emisión real como si aún no hubiera ocurrido. El análisis debe preservar todas las FE históricas.

## Criterios mínimos de aceptación

1. Fecha: hoy, -30 y +5 límites; fuera de ventana bloqueado; mismo snapshot en revisión, firma y transmisión; tratamiento explícito de extemporaneidad y zona PY.
2. Vendedor de empresa activo seleccionable; operador emisor distinto; `dInfAdic` contiene seleccionado y observaciones existentes sin duplicación; aislamiento A/B.
3. Lista de los 13 tipos oficiales, codes/labels exactos y validación backend/gateway por tipo; la UI no declara homologados los tipos especiales si no lo están.
4. Un documento con JSON enviado y respuestas de varias fases/consultas: historial íntegro, cronológico, no mutable, sin secretos; incluso respuestas tardías contradictorias.
5. Dos facturas simultáneas sobre stock compartido no venden más que el disponible; reserva no reduce físico, sí disponible; aprobación única registra una sola salida por depósito; pérdida de respuesta/consulta duplicada no duplica movimientos.
6. Rechazo -> corrección/revisión -> nuevo envío -> eventual aprobación, con versiones/JSONs previos intactos, reserva coherente y política segura de idempotencia/numeración.
7. FE aprobada muestra botón de cancelación sujeto al plazo; sin endpoint habilitado se ve claramente indisponible y no altera datos, SIFEN o stock.
8. Pruebas dirigidas de backend, SQL descartable, concurrencia, FE aprobada/rechazada, UI desktop y homologación humana en la VM tras backup y autorización.

## Fuentes oficiales

- Manual Técnico SIFEN v150, grupo D/D1: `dFeEmiDE` (D002), `iTipTra` (D011) y `dDesTipTra` (D012).
- DNIT, Preguntas frecuentes e-Kuatia: cancelación de FE hasta 48 h desde aprobación; las fechas/firmas y procesamiento extemporáneo siguen controles propios.
- Linear: PRO-93, PRO-294, PRO-91, PRO-134, PRO-199, PRO-115 y PRO-307.

## Gate y responsabilidades

**ChatGPT**: requisitos, comparación con código, auditoría y gestión Linear/Git. **Claude**: desarrolla solo una tarea autorizada, pruebas puntuales, commit/push y PARA. **Responsable humano**: valida PostgreSQL/VM, migrations, gateway real y homologación. Esta decisión no autoriza alterar código/SQL operativo/deploy ni marcar Done.
