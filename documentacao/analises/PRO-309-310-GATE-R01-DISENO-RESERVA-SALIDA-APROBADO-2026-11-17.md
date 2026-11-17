# PRO-309/310-GATE-R01 — Diseño técnico: reserva de stock al enviar la FE y SALIDA física solo con APROBADO SIFEN

**Fecha:** 17/11/2026 · **Autor:** Claude (desarrollador) · **Tipo:** documento de diseño para auditoría. **No es implementación, no es homologación.**
**Orden vinculante:** `documentacao/planos/PLAN-NEXIT-AJUSTES-FUNCIONALES-AUTORIZADOS-2026-11-17.md` (SHA 188ad6476c96d10b3b3595bfc044db047a4ebe16), orden única activa PRO-309/310-GATE-R01.
**Requisitos de base:** `documentacao/definicoes/REQ-NEXIT-FE-V1-ESTADOS-RESERVA-CORRECCION-2026-10-25.md` (FE-V1-06/07/08) · `documentacao/analises/AUD-NEXIT-FE-V1-R01-REVISAO-INTEGRAL-PERGUNTAS-2026-10-25.md` (A01, A08, A09, A10; P01–P08).
**Alcance de esta entrega:** solo este documento. No se modificó código funcional, SQL, migraciones, configuración, PRO-342, PRO-354, KuDE, CDC, NCE ni la UI de Documentos. No se ejecutó nada (tests, lint, typecheck, build, SQL, VM, Docker, gateway, deploy, merge). No se deduce qué migraciones están aplicadas en la VM.

---

## 1. Resumen ejecutivo

1. **Hoy** la FE baja el stock físico **al crearse**: `fe_documento_crear_fe_receptor` (NEX-076) → `fe_documento_crear_fe_vendedor` (NEX-074) → `fe_documento_crear_fe_con_stock_entrega` (NEX-068) → `fe_documento_crear_fe_con_stock` (NEX-067) → `fe_stock_baja_documento`, que inserta la SALIDA/VENTA por depósito y llama a `inventario_agregar_linea`. NEX-081 (PRO-354, versionada, no aplicada) **redefine** `fe_stock_baja_documento` para aceptar un faltante pendiente, pero mantiene la salida en la creación.
2. **Propuesta:** una migración incremental nueva (**NEX-082**, número libre en el repositorio a la fecha; reconfirmar antes de crearla) que, aplicada **después** de NEX-080 y NEX-081, **redefine otra vez el mismo eslabón** `fe_stock_baja_documento` para que **reserve** en lugar de dar de baja. Así toda la cadena de emisión (receptor, vendedor, entrega, faltante de NEX-081) hereda el cambio sin tocar ninguna otra función de emisión ni ninguna migración histórica.
3. **Disponible para vender = físico − reservado.** Un trigger de guarda sobre `stock_saldos` impide que **cualquier** camino (movimiento manual, transferencia, ajuste, anulación, confirmación de faltante) deje el físico por debajo de lo reservado. El físico nunca baja de cero (CHECK existente intacto).
4. **APROBADO es el único disparador de la SALIDA.** Un trigger `AFTER UPDATE OF estado_sifen` en `documentos_electronicos` anota, en la misma transacción que registra el APROBADO (cualquier camino: manual, flujo NCE, automática, funciones legadas), una **orden de consumo durable** (tabla «bandeja»). El consumo real (SALIDA por depósito con el mismo motor de líneas que NEX-067, clave idempotente `FE-STOCK:<doc>:<dep>`) corre en **otra transacción**: inmediatamente después del registro y, si falla, la reintenta el planificador existente. **El estado fiscal nunca se revierte ni depende del stock.**
5. **Mientras el resultado es indeterminado o en consulta** (ENVIANDO, ENVIO_INDETERMINADO, ENVIADO + SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO, «XML firmado», HTTP 200, ACK) la reserva se **mantiene**.
6. **Política por empresa (PRO-354) preservada:** TRUE bloquea la emisión si no hay disponible (ahora disponible = físico − reservado). FALSE reserva lo disponible y registra el faltante en `documento_electronico_stock_pendientes` (NEX-081); el faltante **no** toca el físico y solo se puede confirmar cuando la FE está APROBADA (cambio respecto de NEX-081, que lo admite desde ENVIADO).
7. **Históricos intactos:** las FE con salida ya registrada (NEX-067/081) no reciben reserva ni nueva salida; no se hace backfill.
8. **Decisiones que NO tomo (sección 9):** P01 (liberar o retener tras RECHAZADO definitivo) y P02 (desistimiento, autoridad, liberación e inutilización). El incremento propuesto **no libera** ninguna reserva automáticamente: es compatible con cualquiera de las alternativas, pero deja stock retenido hasta que el responsable decida; por eso P01/P02 son **bloqueantes del GO a producción**.

---

## 2. Revisión de dependencias (estado del código en el repositorio)

| Área | Archivo / función | Qué hace hoy | Impacto del diseño |
|---|---|---|---|
| Emisión SQL | NEX-067 `fe_stock_baja_documento(empresa, usuario, documento, asignaciones)` | Bloqueo `fe.stock:<emp>:<doc>`; repetición = 0 si ya hay salidas; valida payload persistido (Detalles), reparto (cantidad > 0, 4 decimales, depósito activo/propio/de la sucursal/en alcance) y conciliación facturado = repartido por producto controlado; por depósito crea movimiento SALIDA/VENTA (`nex_siguiente_numero_movimiento`), bloquea costo y saldo, verifica saldo, `inventario_agregar_linea`, registra `documento_electronico_stock_salidas`. | **Se redefine** (NEX-082): mismas validaciones y conciliación; en vez de movimiento crea filas de **reserva** por (producto, depósito, lote). La parte «movimiento + línea» se traslada intacta a la nueva función de consumo. |
| Emisión SQL | NEX-081 `fe_stock_baja_documento` (redefinición), `fe_stock_pendientes_preparacion` | Lee la preparación de su transacción; concilia salidas + pendientes = facturado; una FE con pendientes cuenta como baja ya registrada. | La redefinición NEX-082 **parte del cuerpo de NEX-081** (no del de NEX-067) y conserva la preparación: reservas + pendientes = facturado. |
| Emisión SQL | NEX-081 `fe_documento_crear_fe_stock_pendiente` | Política FALSE bajo `FOR SHARE` de la empresa; registra pendientes; comprueba bajo el candado `movimientos.numero:` que el disponible quedó en **cero** tras la salida. | **Se redefine** solo esa comprobación: disponible **para vender** (físico − reservado) en cero tras la reserva. El resto igual. |
| Emisión SQL | NEX-073/074/068/076 (fecha, vendedor, entrega, receptor) | Envuelven la creación con stock. | **Sin cambios** (heredan el eslabón redefinido). |
| Emisión TS | `lib/facturacion/emision.ts::crearFacturaElectronica`, `prepararFactura` | Preflight de stock (`planificarStockConPolitica`), huella, elección de función SQL. | Sin cambio de contrato; solo textos («se reserva» en lugar de «se descuenta») y la detección de NEX-082 para mostrarlo. |
| Emisión TS | `lib/facturacion/envio.ts::emitirFactura` / `enviarDocumento` | Preflight de credenciales (`configuracionGateway`) **antes** de crear; crea (idempotente); `fe_documento_iniciar_envio` → POST único → `fe_documento_registrar_envio_r05`. | Sin cambios. La reserva nace en la transacción de creación, que solo ocurre dentro de «Enviar factura» y después del preflight (P03). |
| Disponibilidad | NEX-067 `fe_stock_disponibilidad`; `lib/facturacion/stock-fe.ts` (`consultarDisponibilidadEnLotes`, `asignarStock`), `politica-stock.ts`, `stock-preventivo.ts`, `app/api/facturas/previa`, `app/api/facturas/stock/disponibilidad` | Devuelve el saldo físico propio DISPONIBLE por depósito/lote (máx. 500 UUID). | **Se redefine** para devolver físico − reservado (y, aditivamente, el reservado) con la misma firma de salida o una firma nueva paralela. El TS no cambia de cálculo. |
| Consulta fiscal SQL | NEX-080 `fe_documento_registrar_consulta_nucleo_r05` (modos MANUAL/FLUJO/AUTO) y `fe_documento_registrar_envio_r05`; legadas NEX-054/062/077/079 aún con EXECUTE | Registran estado SIFEN; guarda de estado final (no retrocede; APROBADO → CANCELADO). | **No se modifican.** El disparo se hace con un **trigger** sobre `documentos_electronicos.estado_sifen`, que cubre cualquier función (también las legadas). |
| Consulta fiscal TS | `lib/facturacion/shared.ts::consultarEstado` (único punto que llama a las `*_r05`), `consulta-automatica.ts::ejecutarLote` (FE y NCE, lease/token NEX-077) | Consulta y registra. | Tras registrar, llamar a `fe_stock_consumir_aprobado` (transacción propia, error no propagado al resultado fiscal). El planificador agrega un barrido de la bandeja de consumos. |
| Motor de inventario | NEX-014 `inventario_registrar_movimiento`, `inventario_agregar_linea`, `inventario_anular_movimiento`; NEX-011 numeración; NEX-046 depósito FOR SHARE; NEX-052 producto FOR SHARE | Orden efectivo: clave → `movimientos.numero:` → depósito → producto → costo FOR UPDATE → saldo FOR UPDATE; «saldo disponible insuficiente»; CHECK cantidad ≥ 0. | **No se modifica.** La reserva se protege con un trigger sobre `stock_saldos` (sección 5). Los mensajes del trigger se traducen en el TS de movimientos. |
| Costos | `inventario_costos` (promedio vigente), NEX-067 inserta la fila de costo y la bloquea antes del saldo | El costo de la salida es el promedio **en el momento** de la línea. | Sin cambio de método. Consecuencia: la salida de una FE se valoriza con el promedio **del día de la aprobación**, no del día de emisión (sección 7). No se tocan D1–D3/D6. |
| Faltante | NEX-081 `fe_stock_pendiente_confirmar`, `fe_stock_pendientes_listar/_filtros`, guardas de producto/depósito; `lib/stock/bajas-pendientes.ts`, `app/(private)/stock/bajas-pendientes/page.tsx` | Confirmación manual con saldo suficiente si la FE está ENVIADO y SIN_CONSULTA/PENDIENTE/APROBADO. | **Se redefine** la confirmación: para FE del modelo de reserva exige `APROBADO` y el consumo de la reserva HECHO; para FE históricas conserva la regla de NEX-081. Listado: nuevo estado visible «En espera de aprobación». Guardas: también con reservas abiertas. |
| Vistas de stock | `lib/stock/shared.ts`, `lib/reportes/stock-general.ts`, `stock-critico`, `valorizacion.ts`, `kardex.ts`, `lotes.ts`, `lib/dashboard/shared.ts`, `lib/reposicion/datos.ts`, `app/api/productos/*`, `lib/depositos/shared.ts` | Muestran saldo físico. | Físico y valorización **no cambian** (la mercadería sigue siendo propia hasta la aprobación). Se propone mostrar «Reservado» y «Disponible» en Stock, ficha de producto y reposición (fase 2, sección 8). Kardex sin cambios: la salida aparece cuando ocurre. |
| NCE | NEX-062/070/080 | La NCE exige FE APROBADA; no mueve stock. | Sin cambios (cuando existe una NCE, la FE ya está aprobada y su salida ya se pidió). |
| Documentos electrónicos (UI) | `app/(private)/documentos/page.tsx` | Congelada (PRO-342 UX-R02). | **No se toca.** La situación de stock de una FE se ve en una pantalla de stock (sección 8). |

---

## 3. Modelo de datos propuesto (NEX-082, solo propuesta; no creada)

### 3.1 `documento_electronico_stock_reservas`
Una fila por (FE, producto, depósito, lote) reservada.

| Columna | Regla |
|---|---|
| `id` uuid PK; `empresa_id`; `documento_id` (FK compuesta a `documentos_electronicos`); `producto_id`, `deposito_id`, `lote_id` NULL (FK compuestas) | Pertenencia por empresa, igual que NEX-081. |
| `sucursal_id`, `unidad_medida_id` | Congeladas al reservar (mismo criterio R01/F001 de NEX-081). |
| `cantidad` numeric(18,4) > 0 | Exacta, 4 decimales, sin redondeo. |
| `estado` ABIERTA / CONSUMIDA / LIBERADA | Transiciones únicas: ABIERTA → CONSUMIDA (con `movimiento_id`, `consumido_at`) o ABIERTA → LIBERADA (con actor, fecha, motivo; **solo existe la columna, ninguna función la usa hasta P01/P02**). |
| `creado_por`, `creado_at`, `consumido_at`, `movimiento_id`, `liberado_por`, `liberado_at`, `motivo_liberacion` | Inmutable salvo esas transiciones (trigger como `fe_stock_pendientes_inmutable`). |
| UNIQUE (empresa, documento, producto, deposito, lote) con `lote` NULLS NOT DISTINCT | Una reserva por clave por FE. |
| Índice parcial (empresa, producto, deposito, lote) WHERE estado = 'ABIERTA' | Suma de reservado por clave de saldo (guarda y disponibilidad). |

Sin acceso directo de `nexit_runtime` (solo funciones SECURITY DEFINER), como `documento_electronico_stock_salidas` y `documento_electronico_stock_pendientes`.

### 3.2 `fe_stock_consumos` (bandeja durable de salidas por aprobación)
PK (empresa_id, documento_id). `estado` PENDIENTE / HECHO / ERROR_REINTENTABLE / ERROR_BLOQUEANTE; `solicitado_at` (= momento en que se registró el APROBADO), `intentos`, `ultimo_error` (texto saneado), `proxima_at` (backoff), `lease_hasta`, `lease_token`, `completado_at`. Inmutable salvo transiciones por las funciones del consumo. La escribe **solo** el trigger de estado y las funciones de consumo.

### 3.3 Sin cambios de tablas existentes
No se agregan columnas a `documentos_electronicos`, `stock_saldos`, `inventario_costos`, `movimientos_inventario`, `documento_electronico_stock_salidas` ni `documento_electronico_stock_pendientes`. El significado de `documento_electronico_stock_pendientes.cantidad_descontada` para una FE del modelo de reserva pasa a ser «cubierto por reserva» (se documenta en la migración; el CHECK `descontada + pendiente = facturada` sigue valiendo). **Punto para auditoría:** si se prefiere no reinterpretar el nombre, alternativa: columna nueva `cantidad_reservada` y `cantidad_descontada = 0` para las FE nuevas; implica tocar el CHECK de NEX-081 (más invasivo). Recomiendo la reinterpretación documentada.

---

## 4. Funciones propuestas (NEX-082)

| # | Función | Tipo | Resumen |
|---|---|---|---|
| F1 | `fe_stock_baja_documento` (misma firma; CREATE OR REPLACE desde el cuerpo NEX-081) | interna | Mismas validaciones, preparación de NEX-081 y conciliación (reservas + pendientes = facturado). **Repetición:** devuelve 0 si la FE ya tiene salidas (histórica), reservas o pendientes. Por clave en orden determinista (producto, depósito, lote NULLS FIRST): bloquea la fila de saldo `FOR UPDATE`, calcula `físico − Σ reservas ABIERTAS` y, si alcanza, inserta la reserva; si no, `NEX:STOCK_INSUFICIENTE` (política TRUE) — mismo mensaje y DETAIL que hoy. **No** crea movimiento, **no** bloquea costo, **no** toca saldo. |
| F2 | `fe_documento_crear_fe_stock_pendiente` (misma firma) | expuesta | Cuerpo NEX-081 con un solo cambio: la comprobación de «faltante real» usa disponible para vender (físico − reservado) en cero después de la reserva, bajo el mismo candado `movimientos.numero:`. |
| F3 | `fe_stock_disponibilidad` (misma firma y columnas) | expuesta | Devuelve `físico − reservado` (> 0) por depósito/lote. Opcional: `fe_stock_disponibilidad_detalle` nueva con físico, reservado y disponible, para mostrar «disponible 4 (6 reservados)». |
| F4 | `fe_stock_saldos_reserva_guarda()` + trigger `BEFORE UPDATE OR DELETE ON stock_saldos` | trigger | Si la fila es DISPONIBLE/PROPIO/sin propietario y `NEW.cantidad < Σ reservas ABIERTAS` de su clave → `NEX:STOCK_RESERVADO` («el stock está reservado por facturas electrónicas pendientes de aprobación»). Cubre motor, transferencias, ajustes, anulaciones y confirmación de faltantes. |
| F5 | `fe_stock_aprobacion_trg()` + trigger `AFTER UPDATE OF estado_sifen ON documentos_electronicos` | trigger | Si `tipo = 'FE'`, `OLD.estado_sifen IS DISTINCT FROM 'APROBADO'`, `NEW.estado_sifen = 'APROBADO'` y la FE tiene reservas ABIERTAS o pendientes del modelo de reserva → `INSERT … fe_stock_consumos (PENDIENTE, solicitado_at = now()) ON CONFLICT DO NOTHING`. No hace nada más (no puede fallar por stock). |
| F6 | `fe_stock_consumir_aprobado(empresa, actor, documento, token NULL)` | expuesta | Idempotente. Orden de bloqueos: candado `fe.stock:<emp>:<doc>` → fila de bandeja `FOR UPDATE` → reservas de la FE `FOR UPDATE` (orden determinista) → por depósito: `nex_siguiente_numero_movimiento` → depósito/producto FOR SHARE (vía motor de líneas) → costo → saldo. Verifica FE `APROBADO` o `CANCELADO` posterior (nunca otro estado). Si ya HECHO → devuelve repetido. Por depósito: marca las reservas CONSUMIDA y crea el movimiento SALIDA/VENTA con clave `FE-STOCK:<doc>:<dep>` (la misma de NEX-067, por lo que una FE no puede tener dos salidas por depósito), líneas con `inventario_agregar_linea`, `documento_electronico_stock_salidas`. Todo o nada por FE. Al terminar: bandeja HECHO. Ante error: deshace la subtransacción, bandeja `ERROR_*` con mensaje saneado, `intentos + 1`, `proxima_at` con backoff; **nunca** toca `documentos_electronicos`. |
| F7 | `fe_stock_consumos_reservar_token(limite, lease)` / `fe_stock_consumos_programar_token(...)` | expuestas al proceso | Mismo patrón que NEX-077 (SKIP LOCKED, token por fila, actor elegido igual que `fe_consulta_reservar_token`). |
| F8 | `fe_stock_pendiente_confirmar` (misma firma) | expuesta | Si la FE pertenece al modelo de reserva: exige `estado_sifen = 'APROBADO'` y bandeja HECHO (`NEX:PENDIENTE_FE_NO_APROBADA`). FE históricas: regla de NEX-081 intacta. El saldo suficiente lo garantiza el motor **más** la guarda F4 (no se confirma consumiendo stock reservado por otra FE). |
| F9 | `fe_stock_pendientes_listar` (misma firma) | expuesta | Estado mostrado: «En espera de aprobación» / «Exigible desde <fecha de aprobación>» / «Confirmada»; proyectado = físico − reservado − pendientes abiertos. |
| F10 | Guardas de producto y depósito de NEX-081 (CREATE OR REPLACE) | trigger | También bloquean cambio de unidad base, `controla_stock = false`, inactivar, cambiar de sucursal o pasar a terceros mientras haya **reservas ABIERTAS**. |
| F11 | `fe_stock_reservas_listar` / `fe_stock_reserva_documento` | lectura | Pantalla de stock: reservas abiertas por depósito/FE, estado de la bandeja y error. STOCK.VER + `deposito_en_alcance`. |
| F12 | `nex_aplicar_grants_facturacion_stock_reservas()` | grants | Descubierto por el envoltorio de NEX-037/052. Tablas sin acceso directo. |
| — | `fe_stock_reserva_liberar` | **NO se crea** en este incremento | Depende de P01/P02. |

Scripts asociados (versionados, nunca ejecutados por IA): `preflight-NEX-082.sql` (exige NEX-080 y NEX-081 aplicadas y que `fe_stock_baja_documento` sea la versión NEX-081; verifica bandeja/reservas inexistentes), `verificar-NEX-082.sql`, `reversion-NEX-082.sql` (aborta si hay reservas o consumos registrados; si no, restaura los cuerpos NEX-081), `docs/PROCEDIMIENTO-NEX-082.md`.

---

## 5. Invariantes

Clave de saldo `k` = (empresa, producto, depósito, lote, DISPONIBLE, PROPIO, sin propietario).

- **I1** `físico(k) = stock_saldos.cantidad ≥ 0` (CHECK existente, sin cambios). **Nunca saldo negativo.**
- **I2** `reservado(k) = Σ reservas ABIERTAS de k` y siempre `físico(k) ≥ reservado(k)` (F1 al crear la reserva bajo `FOR UPDATE` del saldo; F4 en todo decremento).
- **I3** `disponible_venta(k) = físico(k) − reservado(k) ≥ 0`; es lo que ven la previa, la emisión y la disponibilidad de la línea (PRO-330).
- **I4** Por FE y producto controlado: `Σ reservas (ABIERTA + CONSUMIDA) + Σ pendientes = cantidad facturada` (conciliación contra el payload persistido, como hoy).
- **I5** Para una FE del modelo de reserva existe SALIDA física **si y solo si** se registró APROBADO y la bandeja está HECHO. Antes de APROBADO no hay movimiento.
- **I6** A lo sumo una salida por (FE, depósito): clave `FE-STOCK:<doc>:<dep>` + PK de `documento_electronico_stock_salidas`. Una FE histórica con salida no recibe reserva ni otra salida.
- **I7** El estado fiscal no depende del stock: un error de consumo deja la FE APROBADA y la bandeja en error visible y reintentable. Nunca se reenvía el JSON ni se reemite.
- **I8** El faltante pendiente (política FALSE) no toca el físico ni el reservado; para FE nuevas solo es confirmable con la FE APROBADA y disponible para vender suficiente.

**Concurrencia (todas en READ COMMITTED):**
- *Dos FE por el mismo saldo:* ambas bloquean la fila de saldo `FOR UPDATE` en orden determinista; la segunda espera, relee físico y recalcula el reservado con una consulta nueva (las sentencias de plpgsql toman instantánea nueva) y ve la reserva confirmada de la primera.
- *FE contra movimiento manual de salida:* el motor bloquea costo y luego saldo; la reserva bloquea solo el saldo (no hay ciclo). Si el movimiento llega después, la guarda F4 lo rechaza si invadiría lo reservado; si llega antes, la reserva ve el físico ya disminuido.
- *Entradas:* solo aumentan el físico (F4 no actúa al aumentar). El faltante de NEX-081 sigue usando el candado `movimientos.numero:` para ver entradas concurrentes.
- *Aprobación contra confirmación de faltante:* el consumo bloquea reservas y la confirmación bloquea la fila del pendiente y luego la FE `FOR SHARE`; el consumo no bloquea pendientes ni la FE con `FOR UPDATE` → sin ciclo. La confirmación exige bandeja HECHO, así que en la práctica va después.
- *Registro del APROBADO:* el trigger F5 solo inserta en la bandeja (PK), sin tocar stock: no agrega bloqueos de inventario a la transacción fiscal.
- *Consumo concurrente (respuesta inmediata + planificador):* candado `fe.stock:<emp>:<doc>` + fila de bandeja `FOR UPDATE`; el segundo ve HECHO y devuelve repetido.
- *Consumo parcial:* no existe aprobación parcial de una FE; el consumo es todo o nada por FE (todos sus depósitos en una transacción). Si un depósito falla, no se consume ninguno y la bandeja queda en error. Entregas parciales quedan fuera de alcance.

**Permisos:**
- Reserva: igual que hoy, `FACTURACION_ELECTRONICA.CREAR` + sucursal en alcance + `usuario_puede_deposito` (la reserva no exige `MOVIMIENTOS.CREAR`, como NEX-067).
- Consumo: autorizado por la reserva ya validada; actor = el usuario que registró el APROBADO (manual) o el actor elegido por el planificador (FE.CREAR o EDITAR y sucursal en alcance). Se verifica la empresa y se audita el actor; no se exige alcance de depósito al actor del consumo (la autorización de depósito fue de la emisión).
- Confirmar faltante: `MOVIMIENTOS.CREAR` + alcance (NEX-081, sin cambios).
- Consultar reservas: `STOCK.VER` + `deposito_en_alcance`.
- Liberar reserva: **pendiente P02.**

---

## 6. Flujo por estado

| Situación (FE nueva, modelo de reserva) | Físico | Reservado | Faltante (FALSE) | Acción del sistema |
|---|---|---|---|---|
| Edición / previa | igual | igual | — | Lectura de disponible para vender (F3). Nada se escribe. |
| Preflight de credenciales falla (P03) | igual | igual | — | No se crea la FE, no se numera, no se reserva (comportamiento actual de `emitirFactura`). |
| «Enviar factura»: creación con stock suficiente | igual | **+cantidad** | — | En la misma transacción: FE, numeración, solicitud, reservas. |
| Creación con stock insuficiente y política TRUE | igual | igual | — | Rechazo `NEX:STOCK_INSUFICIENTE`; no se crea la FE (igual que hoy). |
| Creación con stock insuficiente y política FALSE | igual | +disponible | +faltante (PENDIENTE, «en espera de aprobación») | Revalidación de política y del faltante real bajo bloqueo (F2). |
| Repetición de la misma clave (doble clic, respuesta perdida) | igual | igual | igual | No se escribe nada (reutilizado). |
| PENDIENTE_ENVIO / ENVIANDO / ENVIO_INDETERMINADO | igual | se mantiene | se mantiene | Ninguna. |
| ERROR_ENVIO (AUTENTICACION / TRANSITORIO / RECHAZO del gateway) | igual | **se mantiene** | se mantiene | El documento sigue reenviable; ver P03 (sección 9). |
| ENVIADO + SIN_CONSULTA / PENDIENTE / NO_RECONOCIDO; «XML firmado»; HTTP 200; ACK | igual | se mantiene | se mantiene | El planificador sigue consultando (NEX-077). |
| **APROBADO** registrado (cualquier camino) | igual en esa transacción | igual | pasa a «exigible» | Trigger F5 → bandeja PENDIENTE. |
| Consumo exitoso (inmediato o por el planificador) | **−reservado** | **→ 0** (CONSUMIDA) | sigue pendiente | SALIDA/VENTA por depósito, fecha = día del consumo, costo promedio vigente. Bandeja HECHO. |
| Consumo fallido (p. ej. guarda, bug, base caída) | igual | se mantiene | igual | Bandeja ERROR con mensaje; reintento con backoff; visible en Stock. FE sigue APROBADA. |
| Faltante confirmado (manual, con stock) | −faltante | — | CONFIRMADA | NEX-081 con la nueva condición APROBADO. |
| **RECHAZADO** definitivo (SIFEN) | igual | **se mantiene** (incremento 1) | se mantiene, no exigible | Decisión P01. |
| Desistimiento / sin corrección | igual | se mantiene (incremento 1) | se mantiene | Decisión P02. |
| INUTILIZADO (si la API lo informa) | igual | se mantiene (incremento 1) | se mantiene | Incluido en P02 (recomendación: liberar automáticamente, sección 9). |
| APROBADO → CANCELADO (PRO-199, suspendida) | sin cambio por este diseño | — | — | Fuera de alcance: no se revierte la salida; la cancelación de stock se define con PRO-199. Si se cancela antes de consumir, el consumo igual corre (la venta fue aprobada); punto para PRO-199. |
| **FE histórica** (con salidas de NEX-067/081) | ya salió | 0 | reglas NEX-081 | Sin reserva, sin bandeja, sin segunda salida. |
| Servicio (`controla_stock = false`) | — | — | — | Nunca reserva ni sale (igual que hoy). |
| NCE | — | — | — | Sin cambios. |

---

## 7. Costos y fechas

- El método de costo no cambia. La salida usa `inventario_agregar_linea`, que toma el **promedio vigente al momento del consumo**. Hoy ese momento es la emisión; con este diseño es la aprobación (normalmente minutos u horas después). Entre ambos puede entrar mercadería con otro costo y mover el promedio: es la regla ordinaria del motor aplicada en otro instante, no una nueva política. Se deja **explícito para auditoría**; no se toca D1–D3/D6.
- `fecha_movimiento` = fecha de Paraguay del consumo (no se retrofecha el kardex a la fecha de emisión). La referencia `FE EEE-PPP-NNNNNNN (serie)` y la observación indican la fecha de emisión y la de aprobación. **Alternativa** (no recomendada): fechar con la emisión; altera el orden del kardex y del costo promedio.
- La valorización del inventario no cambia por reservar: lo reservado sigue siendo propio hasta la salida. Los informes de ventas (E5) se basan en la FE fiscal, no en movimientos: sin impacto.

---

## 8. Transición y propuesta incremental

### 8.1 Orden de aplicación (gate operacional del responsable)
1. NEX-080 (PRO-342) y NEX-081 (PRO-354) como ya están versionadas.
2. NEX-082 (este diseño), con preflight que exige la versión NEX-081 de `fe_stock_baja_documento`.
3. Despliegue del código que detecta NEX-082. **No se reaplica NEX-067** y no se edita ninguna migración histórica.

Si se decidiera aplicar NEX-082 sin NEX-081, habría que rediseñar la redefinición desde el cuerpo de NEX-067; **no lo recomiendo** (doble mantenimiento) y queda como pregunta de gate.

### 8.2 Compatibilidad del código
- La creación no cambia de firma: con o sin NEX-082 el TS llama a las mismas funciones. Sin NEX-082 el comportamiento es el actual (salida al crear).
- El consumo, el barrido de la bandeja y las vistas de reservas se activan solo si `to_regprocedure('public.fe_stock_consumir_aprobado(...)')` existe (falla cerrada en las pantallas nuevas, sin afectar emisión ni consulta).
- FE emitidas antes de NEX-082 y todavía pendientes de aprobación: ya tienen su salida; nada cambia para ellas.

### 8.3 Incrementos de implementación propuestos (cada uno con orden, casos escritos y auditoría)
- **Incremento 1 (SQL núcleo + consumo):** NEX-082 (F1–F10, F12), scripts de preflight/verificación/reversión; TS: llamada a F6 en `consultarEstado` después del registro, barrido de la bandeja en `consulta-automatica.ts`, traducción de `NEX:STOCK_RESERVADO` y `NEX:PENDIENTE_FE_NO_APROBADA`, textos «reservado» en emisión/previa/política. Sin liberación.
- **Incremento 2 (visibilidad):** F11 y pantalla «Stock → Reservas de facturas» (o sección en «Bajas pendientes de stock»), columnas Reservado/Disponible en Stock y ficha de producto. Documentos electrónicos no se toca.
- **Incremento 3 (decisiones P01/P02):** `fe_stock_reserva_liberar` y su acción auditada, según lo que decida el responsable. **Bloquea el GO a producción** (sin él, cada FE rechazada retiene stock indefinidamente).

### 8.4 Archivos afectados (previstos)
SQL: `migraciones/NEX-082-facturacion-stock-reserva-aprobacion.sql` (nuevo), `scripts/preflight-NEX-082.sql`, `scripts/verificar-NEX-082.sql`, `scripts/reversion-NEX-082.sql`, `docs/PROCEDIMIENTO-NEX-082.md` (nuevos).
TS (incremento 1): `lib/facturacion/shared.ts` (`consultarEstado`), `lib/facturacion/consulta-automatica.ts` (`ejecutarLote` + barrido), nuevo `lib/facturacion/stock-consumo.ts`, `lib/facturacion/politica-stock.ts` y `emision.ts` (solo textos/detección), `lib/inventario/*` y `app/api/movimientos/route.ts` (mapeo de error), `lib/stock/bajas-pendientes.ts` + `app/(private)/stock/bajas-pendientes/page.tsx` (estado «En espera de aprobación»), casos escritos nuevos `lib/facturacion/stock-reserva-pro310.casos.ts` y ajustes de casos existentes que hoy esperan la salida al crear (`stock-e02.casos.ts`, `politica-stock-pro354.casos.ts`, `stock-preventivo.casos.ts`, `facturacion.casos.ts`).
TS (incremento 2): `lib/stock/shared.ts`, `app/api/productos/*`, `lib/reposicion/datos.ts`, `lib/dashboard/shared.ts`, página nueva de reservas.
Sin cambios: `envio.ts`, `gateway.ts`, `reconciliacion.ts`, KuDE, NCE, `app/(private)/documentos/*`, valorización y kardex.

---

## 9. Decisiones pendientes (no se implementan; se presentan alternativas)

### P01 — Reserva cuando SIFEN rechaza definitivamente la FE
- **A. Retener** la reserva hasta corrección (PRO-311) o cierre explícito. Garantiza que la mercadería prometida al cliente siga disponible; riesgo: stock inmovilizado si nadie corrige.
- **B. Liberar inmediatamente** al registrar RECHAZADO y volver a reservar al reenviar la corrección. Libera stock; riesgo: al corregir puede no haber stock y la venta ya acordada no se puede facturar.
- **C. Retener con vencimiento** (p. ej. N días configurables por empresa) y liberar automáticamente al vencer, con aviso.
- **Recomendación técnica:** A + acción explícita de liberación (P02), con listado de «reservas retenidas por FE rechazada» y antigüedad. C es aceptable si el negocio prefiere automatismo; requiere decidir N y quién lo configura. **Decide el responsable.** El incremento 1 se comporta como A sin salida (por eso P02 es bloqueante).

### P02 — Desistimiento, autoridad, liberación e inutilización
- **Quién:** (a) solo `Administrador de empresa`; (b) también `Gerente`; (c) cualquier usuario con permiso nuevo «Liberar reservas de stock» asignable a perfiles fijos (la matriz de permisos aún no está aprobada).
- **Cuándo se permite:** solo si la FE está en ERROR_ENVIO, RECHAZADO o INUTILIZADO, o PENDIENTE_ENVIO sin transmisión; **nunca** con ENVIANDO, ENVIO_INDETERMINADO o ENVIADO pendiente de resultado (podría estar aprobada en SIFEN).
- **Qué hace:** reservas ABIERTAS → LIBERADA con actor, motivo y fecha; faltante pendiente → estado nuevo «ANULADA» (requiere tocar el CHECK de NEX-081: decisión explícita); marca «requiere inutilización del número» (la inutilización fiscal es un proceso del proveedor/DNIT que NEXIT no simula).
- **INUTILIZADO informado por la API:** recomendación técnica: liberar automáticamente (es un hecho fiscal: el número no ampara ninguna operación). Requiere confirmación del responsable.
- **Recomendación técnica:** (a) por defecto, con evento auditado; sin liberación en estados indeterminados.

### P03 — Fallos del envío (diseño técnico, se puede objetar)
Preflight de credenciales antes de crear/reservar (ya existe). ENVIO_INDETERMINADO, ENVIANDO y cualquier respuesta ambigua **retienen** la reserva hasta consulta fiable. ERROR_ENVIO con certeza de no transmisión (AUTENTICACION/TRANSITORIO): el documento sigue reenviable, por lo que la reserva **se mantiene** en el incremento 1; la liberación por desistimiento cae en P02. Alternativa de la auditoría FE-V1 (liberar reversiblemente ante certeza de no transmisión): agrega estados y re-reserva al reenviar; no la recomiendo para V1.

### P08 — Seguimiento y conversión automática (diseño técnico)
Se reutiliza el planificador existente (NEX-077: lease, token, SKIP LOCKED, backoff) para consultar FE pendientes y se le agrega el barrido de la bandeja de consumos con su propio lease. La salida no depende del navegador. Si el planificador está desactivado (`NEXIT_CONSULTA_AUTOMATICA=0`, DEMO, sin base) o NEX-077 no está aplicada, la consulta manual también dispara el consumo; la bandeja garantiza que ninguna aprobación quede sin su salida (reintento al reactivarse).

### Abiertas y fuera de este diseño
P04 (alcance de corrección), P05 (vendedor), P06 (fecha), P07 (tipos 5–13 y stock: hoy solo se emiten 1–4; si se habilitan otros, definir si reservan) **no se consideran cerradas**. PRO-199 (cancelación) y PRO-311 (corrección: traspaso de la reserva a la versión corregida) dependen de P01/P02.

---

## 10. Criterios de aceptación (escenarios escritos, a convertir en casos; ninguno ejecutado)

1. Físico 10, FE de 6 enviada (pendiente): físico 10, reservado 6, disponible 4; ningún movimiento.
2. Con el caso 1, una segunda FE de 5 con política TRUE se rechaza `NEX:STOCK_INSUFICIENTE`; una de 4 se acepta.
3. Con el caso 1 y política FALSE, una FE de 5 reserva 4 y registra faltante 1 «en espera de aprobación»; físico sigue 10.
4. Dos FE simultáneas de 6 sobre físico 10: exactamente una reserva; la otra falla (TRUE) o deja faltante (FALSE).
5. Movimiento manual de salida de 5 con reservado 6 y físico 10 → rechazo `NEX:STOCK_RESERVADO`; de 4 → aceptado.
6. Anulación de una entrada que dejaría físico < reservado → rechazo `NEX:STOCK_RESERVADO`.
7. Transferencia que invade lo reservado → rechazo; sin invadir → aceptada.
8. Respuestas «XML firmado», HTTP 200, ACK, PENDIENTE, NO_RECONOCIDO, ENVIO_INDETERMINADO: ningún movimiento; reserva intacta.
9. APROBADO por consulta manual: bandeja PENDIENTE en la misma transacción; consumo inmediato crea una SALIDA por depósito; reservado → 0; físico −6.
10. APROBADO por el planificador (modo AUTO con token): mismo resultado que 9.
11. APROBADO registrado por una función legada (NEX-054/079): el trigger igual crea la bandeja.
12. Consumo repetido (inmediato + planificador, o doble ejecución): una sola salida por depósito; el segundo devuelve repetido.
13. Consumo que falla (simulado): FE sigue APROBADA; bandeja ERROR con mensaje; reintento posterior exitoso sin reenviar el JSON.
14. FE con dos depósitos y lotes: reservas y salidas por (depósito, lote) exactas; todo o nada.
15. Cantidades con 4 decimales: reserva y salida exactas, sin redondeo.
16. Servicios: no reservan ni salen.
17. FE histórica con salida de NEX-067 que se aprueba después de NEX-082: sin bandeja, sin segunda salida.
18. FE histórica con faltante de NEX-081: se confirma con las reglas de NEX-081.
19. Faltante de FE nueva: confirmar antes de APROBADO → `NEX:PENDIENTE_FE_NO_APROBADA`; después de APROBADO y consumo → movimiento complementario con disponible para vender suficiente.
20. RECHAZADO definitivo: reserva sigue ABIERTA (incremento 1); visible como retenida.
21. Inactivar depósito, cambiar unidad base o `controla_stock` con reservas abiertas → rechazado por las guardas.
22. Cambio de política TRUE/FALSE concurrente con una emisión: se respeta la revalidación bajo bloqueo de NEX-081.
23. Repetición de la misma clave de emisión: no crea reservas nuevas ni cambia las existentes.
24. Aislamiento: ninguna función lee ni escribe reservas/bandeja de otra empresa; usuario sin alcance de depósito no ve sus reservas.
25. Previa y disponibilidad por línea (PRO-330) muestran disponible = físico − reservado.
26. Valorización, kardex e informe de ventas no cambian por reservar; el kardex muestra la salida con fecha del consumo.
27. Reversión de NEX-082 aborta si existen reservas o consumos.
28. Sin NEX-082 aplicada, el código nuevo no cambia la emisión ni la consulta (falla cerrada solo en pantallas de reservas).

---

## 11. Riesgos y puntos para la auditoría

1. **Stock retenido sin P02:** sin acción de liberación, cada FE rechazada o abandonada inmoviliza stock. GO a producción condicionado a P01/P02.
2. **Costo por momento de consumo** (sección 7): cambio de instante, no de método. Confirmar que es aceptable.
3. **Reinterpretación de `cantidad_descontada`** en pendientes de FE nuevas (sección 3.3).
4. **Trigger sobre `stock_saldos`**: costo de una suma indexada por actualización de saldo; mensajes nuevos en caminos de inventario que hoy no los conocen.
5. **Dependencia de NEX-081**: la redefinición parte de su cuerpo; si el responsable decide otro orden de aplicación, el diseño de F1/F2 cambia.
6. **APROBADO → CANCELADO** antes de consumir y la cancelación en general quedan para PRO-199.
7. **FE pre-NEX-082 rechazadas** (ya salieron al crearse): siguen sin reingreso automático; no se hace backfill (regla A10). Su tratamiento, si se quiere, es una decisión separada.

**Fin del documento. Se detiene aquí para auditoría y aprobación de ChatGPT antes de cualquier implementación.**
