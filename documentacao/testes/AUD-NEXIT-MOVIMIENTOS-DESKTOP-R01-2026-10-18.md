# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R01 — Auditoría por menú «Inventario → Movimientos»

**Fecha:** 2026-10-18. **Snapshot funcional:** `eaa10106dfb273ddd57079ddab5c978dc6d28009` en `feature/NEXIT-2026-001-banco-demo`.
**Producto:** NEXIT ERP **exclusivamente desktop**; no solicitar interfaz de teléfono.
**Resultado:** **CORRECCIÓN SOLICITADA, 1 ALTA + 2 MEDIAS**, evidenciadas por inspección estática; **NO HOMOLOGADO** en navegador, API real o PostgreSQL. No se editó código funcional, DDL, migraciones ni se ejecutaron tests/suite global, VM, Docker o deploy. Este informe no constituye orden de implementación para Claude.

## 1. Fuentes y trazabilidad

Fuentes leídas: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-MOVIMIENTOS-V1.md`, `AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md` y sus secciones de reauditoría R02–R05, `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`, árbol de archivos Git y pruebas existentes.

| Componente | Archivo/elementos revisados |
|---|---|
| Shell/autorización | `app/(private)/movimientos/layout.tsx` exige MOVIMIENTOS.VER; `/movimientos/nuevo/layout.tsx` exige adicionalmente CREAR, consistente con contrato **deliberado** VER+CREAR para atajos. No declarar bug de CREAR-only sin decidir cambiar ese contrato; permisos backend continúan independientes. |
| Historial | `app/(private)/movimientos/page.tsx` (405 líneas), `lib/movimientos/historial.ts` (153): buscador debounce 300 ms, filtro de tipo, orden, 20 filas por página, totales y contadores, 404 fuera de alcance, 409/errores, aviso de éxito solo tras confirmación del servidor |
| Alta | `app/(private)/movimientos/nuevo/page.tsx` (472), `lib/movimientos/{grupos,formulario,reglas,cliente-api}.ts`: cuatro operaciones de UI / nueve tipos SQL, catálogo, fecha, producto, depósitos, cantidad y costo, lote/vencimiento, referencia/motivo, guard de salida, UUID de idempotencia y estados de envío |
| Detalle/anulación | `app/(private)/movimientos/[id]/page.tsx` (276), `app/api/movimientos/[id]/route.ts`, `app/api/movimientos/[id]/anular/route.ts`: permiso ANULAR, motivo mínimo, confirmación crítica, idempotencia de anulación, reversión sin DELETE, reconsulta tras éxito |
| API transaccional | `app/api/movimientos/route.ts` (154), `lib/movimientos/shared.ts`: 401/403, CREAR en POST, tenant desde sesión, BEGIN/COMMIT/ROLLBACK y función SQL `inventario_registrar_movimiento`, catalogo y consulta de historial bajo VER |
| SQL e integridad | `NEX-009-inventario-costos.sql`, `NEX-014-movimientos-operativos.sql` (claves por empresa, huella, `pg_advisory_xact_lock`, saldos/costos, estados e inversos), NEX-046 (depósitos) y NEX-052 (FOR SHARE al operar vs FOR UPDATE al cambiar unidad base). **No se confirmó en esta auditoría estado real de aplicación de NEX-046/052**. |
| Casos existentes | `lib/inventario/movimientos.casos.ts`, `lib/stock/stock-reposicion.casos.ts`, `lib/inventario/cruzados.casos.ts` y referencias SQL selectivas. Pruebas de auxiliares y de estructura, **no equivalen a interacción reactiva durante POST pendiente**. No se ejecutaron. |

## 2. Hallazgos actuales, impacto y criterios de corrección

### MOV-D01 — ALTA — Mutación en curso no inmoviliza la intención de registrar, permite perder la clave de idempotencia

**Evidencia exacta:**
- `app/(private)/movimientos/nuevo/page.tsx:119–150`: `submit` captura el payload `datos`, establece `saving=true`, genera `clave.current` solo si está vacía y hace `registrarMovimientoApi`. Ante error/red/timeout, pone `errorForm` y `saving=false`. El `clave.current` es la garantía para un reenvío de la **misma** operación.
- `nuevo/page.tsx:94–111`: `cambiar`, `cambiarTipo` y cambios de costo ponen `clave.current=""` sin comprobar `saving`.
- `nuevo/page.tsx:225–468`: selects, cantidad, costo, depósitos, lote, fechas, referencia, motivo y observación usan `disabled={cargando}` o ningún `disabled`, **no `saving`**. Solo el botón final tiene `disabled={saving || cargando}` (`:462`). «Cancelar» navega sin inmovilizar la petición, aunque `useProtegerCambios(sucio)` pregunta sobre descarte de borrador, **no cancela ni revierte un POST ya enviado**.
- `lib/movimientos/cliente-api.ts:60–63`: el body POST contiene la clave de idempotencia. `NEX-014-movimientos-operativos.sql:333–345`: el procedimiento busca y devuelve una operación previa solamente por **misma** `p_clave_idempotencia`; la clave distinta constituye otra operación nueva, aunque usuario/producto/fecha/cantidad sean iguales. El índice UNIQUE por empresa+clave tampoco cubre claves distintas.

**Secuencia de riesgo:** pulsar Registrar para movimiento A (clave K1) → el SQL lo registra, pero respuesta 201 se pierde → operador cambia un campo y lo devuelve o revisa el formulario mientras aún se espera, con lo cual `clave.current` pasa a vacío → se reporta timeout/error → el siguiente Registrar genera K2 → NEX-014 permite un **segundo movimiento físico**. No se probó la red ni la VM; el defecto es la gestión del UUID entre eventos, no ausencia de transacción SQL.

**Impacto:** doble entrada/salida/transferencia/ajuste/reserva (según saldo disponible) ante reenvío con nueva clave; pérdida de garantías de idempotencia que el sistema sí dispone. El segundo registro puede fallar legítimamente por saldo, pero ese rechazo no lo convierte en seguro.

**Corrección mínima:** fijar snapshot de formulario y clave por operación mientras `saving=true`; impedir cambios, Cambiar tipo/Grupo, Cancelar o navegación no gestionada sin avisar del estado **indeterminado** (no afirmar que el POST no se ejecutó). Ante fallo ambiguo conservar misma clave y mismo payload para retry idéntico; si el usuario desea alterar datos, primero resolver/consultar resultado o iniciar de forma explícita una **nueva intención** claramente diferenciada sin ocultar que podría existir una anterior. No usar `saving` simplemente para bloquear botón: probar todos los controles. Conservar 201/200 `repetido` y validaciones backend. Test controlado: POST K1 pendiente, tentativa de cambio de cantidad/tipo/motivo, lost-response después de COMMIT, retry debe mantener K1, SQL 200 repetido; si hay nueva operación autorizada usar K2 únicamente tras decisión explícita; prohibir falsa reversión/cancelación de request.

### MOV-D02 — MEDIA — Historial sigue mostrando resultado de filtro/página anterior durante carga

**Evidencia:** `app/(private)/movimientos/page.tsx:80–115` guarda `resultado` con `claveConsulta` y la petición actual usa `activo` en cleanup (evita que respuesta obsoleta sobrescriba estado, protección correcta). Sin embargo `:135–143` deriva `cargando = !listo || resultado?.clave !== claveConsulta`, pero sigue `datos = resultado?.datos ?? null` **sin exigir coincidencia** `resultado.clave === claveConsulta`. En `:280–355` la tabla presenta `filas`, que permanecen del resultado anterior durante un nuevo GET; el indicador «Cargando...» solo se ve si `filas.length===0`. También conservan resumos/paginación previos durante los nuevos filtros.

**Reproducción conceptual:** filtro Producto A carga lista → cambiar a Producto B/tipo o página → API nueva tarda → la UI ya muestra selector B pero filas, enlaces a detalle y resumen siguen siendo A. El usuario puede abrir un movimiento que no pertenece a los filtros actuales. **No es fuga de datos**, las filas anteriores ya fueron autorizadas para ese usuario, pero sí resultado contextual erróneo.

**Corrección mínima:** derivar `datosVigentes` solo cuando `resultado.clave === claveConsulta`, marcar tabla/contadores en estado de carga o identificar explícitamente resultados anteriores como obsoletos, sin exponer acción engañosa; conservar protección de respuestas fuera de orden. Tests A→B con respuesta B lenta, siguiente página lenta, error B, retry e historial inicial vacío.

### MOV-D03 — MEDIA — Cambio de fecha en Asunción puede resetear formulario no guardado cuando React rerenderiza a medianoche

**Evidencia:** `app/(private)/movimientos/nuevo/page.tsx:35–37` calcula `const hoy = hoyAsuncion()` en **cada render**; `:52–76` efectúa carga de catálogos con `useEffect(...,[hoy])` y, al resolverse, hace `setForm(p.formulario)`, `setBase(p.formulario)`, `setCantidadTxt(...)` y `setPrecargado(...)`. Si la fecha local pasa de D a D+1 mientras la página está abierta y cualquier input provoca una nueva renderización, cambia `hoy` y se dispara otra carga que **reemplaza** el borrador que ya estaba siendo digitado. `useProtegerCambios` controla navegación, pero este reset sucede dentro de la misma pantalla sin confirmación.

**Corrección mínima:** mantener catálogo y estado editado tras rollover de fecha; actualizar «hoy» solo como límite de validación o notificándolo, nunca resetear formulario por cambio de día. Tests promesa controlada: alta abierta D antes de medianoche, digitación tras medianoche, retry, fecha no futura, prevenir sobrescribir formulario sucio. No introducir reloj polling ni nuevo timeout sin necesidad.

## 3. Contratos anteriores que ESTÁN presentes (no reabrir)

- **Motor único y atomicidad:** POST transaction SQL via `inventario_registrar_movimiento`; entrada/cambio de estado/transferencia y costo; reversión `inventario_anular_movimiento` ligada a original por `anula_a_id` UNIQUE; trigger sin DELETE/cambio de histórico, saldo negativo bloqueado. **No se comprobó la ejecución real de las funciones de PostgreSQL**.
- **Idempotencia backend:** NEX-014 índice UNIQUE (empresa, clave), hash de payload y advisory lock: correcto **si cliente conserva misma clave**. MOV-D01 es problema nuevo de frontend que vulnera ese requisito.
- **Permisos:** `MOVIMIENTOS.VER` para lista/detalle y catálogo de alta; `MOVIMIENTOS.CREAR` para POST/nuevo y `MOVIMIENTOS.ANULAR` acción crítica (solo administradores según guardas SQL). La ruta `/movimientos/nuevo` hereda layout VER además de su layout CREAR: política VER+CREAR **expresa en INV-02 y testada**; no reabrir como fallo automático de CREAR-only.
- **Alcance:** historial de transferencia visible solo con **ambos depósitos** en `usuario_deposito`; consulta detalle fuera de tenant/alcance devuelve 404; anulación comprueba alcance en API y función SQL. Depósitos inactivos permanecen en histórico; no autorizan escritura nueva.
- **Tipos:** cuatro operaciones UI / nueve tipos técnicos de NEX-014; matriz de orígenes y motivos válida en UI y backend; fecha futura rechazada; costo de entrada/ajuste positivo obligatorio; stock `PROPIO` separado del de `TERCERO`; nuevos lotes solo para entrada/ajuste positivo, `ON CONFLICT` concurrente evita 409 falso.
- **Documentos:** la referencia documental de Movimientos hoy es texto libre. El contrato `lib/movimientos/documentos.ts` es solo planeamiento de evento físico; **NO** afirmar FE/NC/remisión integradas automaticamente ni generar efecto fiscal. No pedir integración ni novas migrations aquí.
- **Unidades:** cantidades de movimientos expressas en unidad-base; U07/U08/U09 y NEX-052 resguardan cambios de unidad base **si aplicada**; no reescribir movimientos históricos.
- **Notificación de alta:** `?ok=NUM` solo genera toast de éxito tras `movimientoExiste` confirmar visibilidad para la empresa y actor; no marcar éxito si carga falla.

## 4. Observaciones sin defecto demostrado ni ampliación de tareas

- **MOV-O01:** GET `?modo=catalogos` expone al actor con MOVIMIENTOS.VER `id/codigo/nombre` de **todos** los depósitos empresariales y `permitido` booleano, mientras stock/saldos/lotes se restringen a los autorizados y la UI filtra `permitido`. El contrato `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS` documenta expresamente «la pantalla lista depósitos con su permitido» y el test incluye un depósito Ajeno false. **No clasificar fuga nueva sin revisión de política de visibilidad de metadatos**; prohibir revelar saldos y operaciones de depósitos ajenos sigue vigente.
- **MOV-O02:** `leerHistorial` consulta conteos/resumen/filas como queries separadas al Pool; durante nuevas operaciones puede haber divergencia transitoria de totales/páginas. Igual que STK-D03, requiere test de concurrencia y decisión de consistencia de reportes; no presumir corrupción ni bloquear Movimientos.
- **MOV-O03:** `NEX-014` recibe cantidad/costo numérico, `prepararMovimiento`/UI usan `Number` y tolerancia `1e-9` para 4 decimales, SELECT para histórico proyecta `cantidad/costo::float8`; a largo plazo hay riesgo de representación de cantidades monetarias límite. No declarar pérdida de costo demostrado sin caso exacto ni prueba contra numeric SQL; **no refactorizar todo inventario** sin alcance autorizado.
- **MOV-O04:** anulación muestra `window.confirm` nativo, que es una confirmación crítica real; personalización visual de modal desktop es mejora secundaria. El campo motivo permanece editável durante solicitud; si cambia, `clave.current` se limpia, pero la función SQL prohíbe doble anulación mediante `anula_a_id` UNIQUE, por lo que no atribuir segundo estorno real sin prueba.
- **MOV-O05:** catálogo de saldos del formulario también se lee mediante consultas paralelas y puede quedar anticuado; el procedimiento SQL controla saldos/alcance reales al COMMIT. La advertencia es orientativa, no garantía de stock, como la UI explica.
- **MOV-O06:** las transferencias V1 son inmediatas (dos puntas) y no implementan recepción en tránsito ni eventos físicos de venta; el contrato lo deja pendiente de decisión, por lo que no marcar como bug de este menu.

## 5. Testes dirigidos y cierre de auditoría

**Si el responsable autoriza corrección futura:** priorizar MOV-D01 y reproducir con promesas/requests controlados POST K1 en vuelo, inputs editados, petición exitosa cuya respuesta se pierde, reintento con K1; otro UUID solo si intención distinta explícita. MOV-D02 con filtro A→B y errores; MOV-D03 al cambiar la fecha PY entre renders preservando cantidad/costo/depósitos/motivo. Agregar checks específicos de empresa/alcance al tocar POST/permisos. Preservar NEX-014 y sus transacciones, sin editar migration aplicada. Ejecutar **solo casos básicos focales**, no suite global, lint/tsc/build geral, CI manual, VM/PG real ni deploy por IA.

**Estado:** **Menu 9 Movimientos — auditoría estática por menú DOCUMENTADA con 1 ALTA + 2 MEDIAS, no homologada**. Ninguna implementación enviada al Claude. Próximo menú: **Inventario → Depósitos**, por separado, si el responsable lo solicita.
