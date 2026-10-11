# Proveedores V1 — Diccionario, trazabilidad y contratos (2026-10-11)

Fuente de requisitos: `MATRIZ-NORMATIVA-CAMPO-A-CAMPO-PROVEEDORES-V1` (94 ítems + DEC-PRV-01…10), `ADENDA-14-CORRECCIONES-PROVEEDORES` (PRV-A01…A14) y la revisión visual de las ocho pestañas. **Estado: implementado en Git, NO homologado.** Las migraciones NEX-033…036 están versionadas, **no aplicadas ni validadas en PostgreSQL**. Ningún texto de este documento afirma que el banco real las ejecutó.

## 1. Migraciones (orden, dependencias y qué verificar tras aplicarlas)

| Migración | Contenido | Requiere | Reversión (aborta si perdería datos) |
|---|---|---|---|
| NEX-033 | `razon_social`/`nombre_fantasia` hasta 255 (PRV-A02); código PRV inmutable (trigger) | NEX-006 | `reversion-NEX-033.sql` (aborta si hay nombres > 200) |
| NEX-034 | `proveedor_eventos` (auditoría append-only), permisos `PROVEEDORES.HOMOLOGAR / EVALUAR_RIESGO / BLOQUEAR / APROBAR_BANCO`, `bloqueado_por/at`, motivo de bloqueo obligatorio (NOT VALID), `proveedor_elegible_para_compra()` | NEX-006, NEX-033 | `reversion-NEX-034.sql` (aborta con auditoría, bloqueos con autor o permisos asignados) |
| NEX-035 | Aprobación de cuentas (`estado_aprobacion`), `proveedor_cuenta_revisiones`, principal por moneda (solo aprobadas), `proveedor_cuenta_pagable()` | NEX-034 | `reversion-NEX-035.sql` (aborta con aprobaciones/revisiones) |
| NEX-036 | Documentos como archivos privados (versiones, exclusión lógica), `carga_documentos_inicial_abierta`, retenciones `activa` + `documento_certificado_id` + trigger de activación | NEX-034 | `reversion-NEX-036.sql` (aborta con archivos, versiones, eliminados o retenciones vinculadas) |

Aplicar **en este orden**, después de NEX-001…032 (el responsable informó NEX-001…032 registradas; confirmar con `aplicar-migraciones.sh --solo-listar`). Con backup previo (pg_dump) y autorización expresa. El volumen privado (`NEXIT_ARCHIVOS_DIR`) es prerrequisito de los documentos (`documentacao/infra/VOLUMEN-ARCHIVOS-PRIVADOS.md`).

Verificaciones sugeridas tras aplicar (solo lectura, por el responsable): existencia de las tablas/columnas/índices/triggers/funciones listados; que `nexit_runtime` no tenga `DELETE` sobre `proveedor_documentos` ni `UPDATE/DELETE` sobre `proveedor_eventos`; que `\d proveedor_cuentas_bancarias` muestre el índice `proveedor_cuentas_bancarias_principal_moneda_uq` y no el de una principal global; que los permisos nuevos aparezcan en `permisos`.

Efectos sobre datos existentes (decisiones conservadoras, ver §5): las **cuentas bancarias** existentes quedan `PENDIENTE` (nadie las aprobó con este control); las **retenciones** que exigen certificado quedan inactivas hasta vincular un certificado válido; los **documentos** con enlace se conservan como «enlace anterior»; los proveedores existentes quedan con la carga inicial de documentos cerrada.

## 2. Trazabilidad de los 94 ítems (UI → API → SQL)

Archivos: normalización pura `lib/proveedores/normalizar.ts`; persistencia `lib/proveedores/shared.ts` + `sincronizar.ts`; rutas `app/api/proveedores/**`; formulario `app/(private)/proveedores/_components/**`. Los límites se validan en la UI y en el servidor con la misma función (`normalizarProveedor`).

| Ítems | Implementación |
|---|---|
| PRV-01-01 Código | Trigger NEX-006 (único por empresa) + inmutable NEX-033; solo lectura en la ficha |
| 01-02 Tipo de persona, 01-03 Grupo | Selectores; grupo validado contra la empresa de la sesión (`validarReferencias`) |
| 01-04/05/06 Documento, número, DV | `identificacion.ts`: PRY exige RUC 3–8 dígitos ASCII con DV módulo 11 DNIT (`lib/fiscal/calcular-dv-ruc.ts`), DV calculado en la UI y **revalidado en POST y PUT**; exterior: documento fiscal del país (1–50, sin espacios, mayúsculas, sin DV), un RUC paraguayo en el exterior sigue validándose; unicidad por empresa+tipo+número con mensaje sobre el campo |
| 01-07/08 Razón social, fantasía | Hasta 255 (servidor y UI); la base admite 255 con NEX-033 (antes, 200 con mensaje explícito); nunca se trunca |
| 01-09 País | Catálogo activo; PRY por defecto solo al crear |
| 01-10/11/12 Teléfono, correo, web | Longitudes 50/150/300; correo con formato; web solo http(s). El teléfono no infiere DDI (estructura DDI = «propuesta», no aprobada) |
| 01-13 Activo | Casilla; no cambia la homologación |
| 01-14/15 Bloqueado, motivo | **Solo** por la acción `BLOQUEAR/DESBLOQUEAR` (permiso `PROVEEDORES.BLOQUEAR`, motivo obligatorio, autor y fecha, auditoría) |
| 01-16 Observación general | Un único campo, solo en Información |
| 02-01…12 Compras y pagos | Condición/moneda/medio validados; día 1–31; plazo ≥ 0; **descuento y mínimo como cadena decimal exacta** (`decimal.ts`; GET devuelve `::text`); fechas dd/mm/aaaa en pantalla, ISO en la API; fin ≥ inicio |
| 03-01…05 Homologación, fechas, riesgo, nota | **Solo** por acciones auditadas (`/gobernanza`) con permisos `HOMOLOGAR` / `EVALUAR_RIESGO`; el PUT rechaza cualquier cambio con 403 |
| 03-06…10 Incoterm, entrega, transporte, días, parcial | Edición cadastral normal (catálogos validados; transporte restringido; condición ≤ 500) |
| 04-01…15 Contactos | Nombre obligatorio, límites 100/50/150, un solo principal, siete preferencias de comunicación |
| 05-01…13 Direcciones | Tipo, descripción*, dirección*, nro. casa, país, geografía oficial (PRY) o texto, código postal, principal por tipo |
| 06-01…11 Cuentas | Banco*, titular*, número*, moneda*, SWIFT (8/11) e IBAN (módulo 97) opcionales, principal **por moneda**; número duplicado rechazado |
| 06-12 Aprobación bancaria | NEX-035 + `/cuentas/{id}/resolucion` (permiso `APROBAR_BANCO`); una cuenta aprobada no se sobrescribe |
| 07-01…07 Retenciones | Tipo, impuesto (catálogo), porcentaje exacto 0–100, vigencia, certificado obligatorio, observación; **activa** solo con certificado válido vinculado |
| 08-01…09 Documentos | Archivo privado (PDF/JPG/PNG/DOCX/XLSX ≤ 10 MB, firma verificada), metadatos, versiones recuperables, exclusión lógica y restauración, auditoría; enlaces anteriores conservados |

Adenda: A01 ✔ · A02 ✔ (NEX-033) · A03 ✔ · A04 ✔ · A05 ✔ · A06 ✔ · A07 ✔ · A08 ✔ · A09 ✔ (sin DELETE+INSERT) · A10 ✔ · A11 ✔ · A12 ✔ (observación única, fechas PY, errores con campo y pestaña) · A13 ✔ · A14 ✔ (confrontación campo a campo por `columnasProveedor` y la sincronización; ver pruebas).

## 3. Decisiones DEC-PRV-01…10

| Decisión | Implementación | Pendiente fuera de este paquete |
|---|---|---|
| 01 elegibilidad | `estadoOperativo()` y `proveedor_elegible_para_compra()` (activo, no bloqueado, HOMOLOGADO, vigente) | Que **Compras** la consulte en el servidor al confirmar una OC |
| 02 permiso específico | `PROVEEDORES.HOMOLOGAR`; acciones EN_EVALUACION / HOMOLOGAR / RECHAZAR / SUSPENDER / RENOVAR con justificación | — |
| 03 vencida | El vencimiento vale hasta el final del día (hora de Asunción); el estado almacenado no cambia solo; renovar exige permiso y nuevo vencimiento | Sin cron (no autorizado) |
| 04 cuentas nuevas/alteradas | Estado de aprobación + revisión pendiente; cuenta aprobada intacta hasta aprobar | Que **Pagos** exija `proveedor_cuenta_pagable()` |
| 05 exterior | Documento del país de origen sin RUC obligatorio; SWIFT/IBAN opcionales | Catálogo de tipos por país (no se inventaron validaciones universales) |
| 06 bloqueo | Motivo obligatorio, autor/fecha, auditoría; no toca homologación ni `activo`; no bloquea obligaciones previas | — |
| 07 principal por moneda | Índice único parcial sobre cuentas aprobadas | — |
| 08 retenciones con certificado | Trigger + validación del servidor + vínculo a un documento válido; el cadastro no calcula | Rutina tributaria posterior |
| 09 padrones comerciales | Se guardan como padrones y restricciones | Aplicación y excepciones con permiso: módulos Compras/Pagos (no modificados) |
| 10 riesgo manual | `EVALUAR_RIESGO` con nivel, nota exacta, justificación y auditoría | — |

## 4. Contrato para Compras y Pagos (NO implementado aquí)

- **Nueva OC / confirmación de OC:** el servidor debe llamar a `proveedor_elegible_para_compra(empresa, proveedor)`; si es falso, rechazar con los motivos (usar `estadoOperativo()` para el texto). No cancelar pedidos ni obligaciones anteriores.
- **Pago a una cuenta:** exigir `proveedor_cuenta_pagable(empresa, cuenta)`; usar la cuenta principal **aprobada** de la moneda del pago (`es_principal AND estado_aprobacion='APROBADA'`).
- **Padrones DEC-PRV-09:** condición de pago, moneda, descuento, mínimo, anticipos y «requiere OC» son valores por defecto y restricciones a validar en el servidor de Compras; los desvíos requieren un permiso específico de excepción (por definir con Compras).
- **Retenciones:** consumir solo las `activa = true` y vigentes; el cálculo pertenece a la rutina tributaria.

## 5. Decisiones tomadas que la especificación no cubría (para validación del responsable)

1. Permisos nuevos con clase **OPERACIONAL** (asignables a perfiles; el administrador de la empresa los tiene): `HOMOLOGAR`, `EVALUAR_RIESGO`, `BLOQUEAR`, `APROBAR_BANCO`. No se creó un permiso de «excepción» (DEC-09) porque no hay consumidor todavía.
2. Transiciones de homologación: pasar a evaluación (desde pendiente/rechazado/suspendido/vencido), homologar (pendiente/en evaluación/suspendido), rechazar (pendiente/en evaluación), suspender (homologado), renovar (homologado o vencido, con nuevo vencimiento obligatorio). La fecha de homologación la fija el servidor (hoy).
3. Cuentas bancarias existentes: **pendientes** de aprobación (no se presume una aprobación que nadie dio). Retenciones existentes que exigen certificado: **inactivas** hasta vincular uno válido.
4. No se exige que quien aprueba una cuenta sea distinto de quien la cargó (segregación de funciones): decisión comercial pendiente.
5. Las bajas de contactos, direcciones, cuentas y retenciones son **explícitas**, físicas y quedan en la auditoría con la fila completa; los documentos nunca se borran (exclusión lógica).
6. `PROVEEDORES_BANCARIO.VER` (dato sensible, ya sembrado) **no** se aplicó para ocultar datos bancarios en la ficha: hoy los ve quien tiene `PROVEEDORES.VER`, como antes. Decisión pendiente.
7. Un certificado vinculado a una retención activa que lo exige no puede eliminarse mientras esté en uso.

## 6. Limitaciones y pendientes operativos

- Nada se probó contra PostgreSQL ni en navegador. Las pruebas de este paquete son locales (lógica pura, sincronización con una conexión simulada y verificaciones estáticas del SQL/rutas). La concurrencia real (bloqueos `FOR UPDATE`, índices únicos parciales, triggers) debe validarse en el banco por el responsable.
- La edición común detecta la modificación concurrente con una marca de versión (`actualizado_at` a microsegundos); las filas relacionadas se actualizan por identificador.
- Validación visual y responsiva en navegador pendiente de aceite humano.

## 7. Correcciones PRV-AUD-01 y PRV-AUD-02 (NEX-037)

- **Migración NEX-037** (aplicar después de NEX-036; reversión `reversion-NEX-037.sql`, aborta con cuentas desactivadas).
- **Bajas de cuentas bancarias:** una cuenta alguna vez aprobada **no se elimina nunca** (la aplicación la **desactiva**: `activa = false`, autor, fecha y motivo; su identificador, datos, historial y auditoría se conservan; su revisión pendiente se cancela; deja de ser principal). Un trigger de base de datos lo impide también para SQL directo. Una cuenta nunca aprobada (pendiente o rechazada) puede eliminarse físicamente, con la fila completa en la auditoría; si estuviera referenciada por otra tabla (por ejemplo una operación futura con FK), se desactiva en lugar de eliminarse. Una cuenta desactivada no es pagable (`proveedor_cuenta_pagable`), no se modifica, no se aprueba ni se rechaza y no ocupa la principal de la moneda. La reactivación no existe en esta versión (decisión pendiente).
- **Auditoría `proveedor_eventos`:** inmutable por estructura (triggers que rechazan UPDATE, DELETE y TRUNCATE para cualquier rol; el DELETE solo se admite si el proveedor ya no existe, que ocurre únicamente en el reinicio de empresas DEMO). Privilegio efectivo del rol de la aplicación: SELECT e INSERT.
- **Reaplicación de grants:** `nex_aplicar_grants_runtime()` (NEX-013…) hace REVOKE ALL y concede solo lo que enumera; tras reaplicarla las tablas nuevas perdían INSERT y `proveedor_documentos` recuperaba DELETE. NEX-037 conserva esa función como `nex_aplicar_grants_runtime_base()` y define un envoltorio que luego llama a `nex_aplicar_grants_proveedores()`. **Convención:** toda migración futura que redefina `nex_aplicar_grants_runtime()` debe seguir llamando a `nex_aplicar_grants_proveedores()`.
- **Observación fuera de alcance:** las tablas de auditoría/versiones de Clientes (NEX-031) tienen la misma fragilidad ante la reaplicación de grants; no se modificaron.

## 8. Decisión aprobada — reactivación administrativa de cuenta bancaria (2026-10-11)

**APROBADO POR EL RESPONSABLE:** se permite reactivar una cuenta bancaria desactivada **únicamente por un administrador de la empresa**, con **justificación obligatoria y auditoría**. Esta decisión sustituye la indicación anterior de «reactivación no existe / pendiente» en la sección 7. Su aprobación documental NO significa que la función esté implementada.

**Contrato funcional obligatorio para el desarrollo:**
- Acción separada «Reactivar»; nunca mediante edición común del proveedor, alteración de `activa` por PUT, ni aprobación bancaria general. Verificar identidad, empresa y autoridad administrativa en el servidor. El identificador, datos anteriores y eventos de la cuenta se conservan.
- Rechazar una justificación vacía; registrar actor, fecha/hora, motivo, estado anterior y nuevo en `proveedor_eventos`. Preservar el evento original de desactivación y cualquier revisión histórica.
- La reactivación **no puede aprobar automáticamente cambios bancarios** ni convertir una cuenta a principal: debe respetar el estado de aprobación previamente almacenado y la regla de una principal aprobada por moneda. Una cuenta pendiente/rechazada reactivada sigue sin ser pagable. Si la cuenta previamente aprobada se reactiva sin cambiar datos aprobados, su elegibilidad de pago puede recuperarse al reactivarse, siempre que el resto de las reglas la permita; no reactivar como principal de forma implícita.
- Rechazar reactivación de cuenta activa; impedir que una revisión pendiente cancelada vuelva a estar pendiente automáticamente. Usar transacción, bloqueo de fila y defensa multiempresa. No reescribir historial.
- La concesión del rol administrador debe confrontarse con el mecanismo real de RBAC de Nexit; **no asumir que `PROVEEDORES.APROBAR_BANCO` por sí solo autoriza reactivación**. Registrar en código y tests la verificación efectiva del rol administrativo.
- Si se necesita migration adicional para consolidar controles del servidor/BD, **prepararla incrementalmente posterior a NEX-037**, sin editar migrations históricas, sin aplicar SQL ni entrar en VM.

**Estado:** regla aprobada, implementación pendiente de Claude Code, homologación PostgreSQL/navegador pendiente. Las decisiones de separación de solicitante/aprobador y visibilidad de datos bancarios siguen pendientes y no se resuelven con esta aprobación.

### 8.1 Implementación (2026-10-11) — NO validada en PostgreSQL ni navegador

- **Ruta:** `POST /api/proveedores/[id]/cuentas/[cuentaId]/reactivar` (cuerpo `{ motivo }`). Autoridad: **administrador de la empresa** = perfil activo con `es_administrador` (`getAccessContext().isCompanyAdmin`, excluido el administrador de plataforma). `APROBAR_BANCO`, `EDITAR` u otros permisos NO bastan. La UI solo muestra «Reactivar cuenta» con `permisos.reactivarCuenta`, pero la decisión es del servidor.
- **Lógica:** `lib/proveedores/reactivacion.ts` — transacción, `SELECT … FOR UPDATE` filtrado por id, proveedor y empresa (cuenta ajena o inexistente = 404 indistinguible), 409 si la cuenta ya está activa, justificación obligatoria (1–1000) validada en el servidor.
- **Efecto:** `activa = true` y se limpian `desactivada_at/por` y `motivo_desactivacion` (el CHECK de NEX-037 lo exige); NO toca estado de aprobación, `aprobado_*`, `es_principal` (queda en false: no vuelve a ser principal), banco, número, titular, moneda, ni `proveedor_cuenta_revisiones` (la revisión cancelada no se reabre, nada se aprueba).
- **Auditoría:** evento `CUENTA_REACTIVADA` en `proveedor_eventos` (misma transacción) con empresa, proveedor, cuenta, administrador, fecha (`creado_at`), justificación, estado anterior (incluida la desactivación original: fecha, autor, motivo) y nuevo. El evento original `CUENTA_DESACTIVADA` y todo el historial se conservan.
- **Pagabilidad:** sin cambios en SQL: `proveedor_cuenta_pagable` exige APROBADA y activa. Una cuenta aprobada reactivada vuelve a ser pagable; pendiente/rechazada reactivada sigue sin serlo.
- **PUT cadastral:** no puede reactivar (cuenta desactivada = solo lectura, 409; `activa` no figura entre las columnas escribibles).
- **Migración:** no fue necesaria (NEX-037 ya contiene las columnas, el CHECK y los triggers; no se bloquea el UPDATE de reactivación). Pendiente de la validación del responsable: ejecutar la reactivación contra PostgreSQL real y revisar la pantalla.
