# PRO-354-R01 — Gate de diseño: mapa de impacto y decisiones contables pendientes

Fecha: 17/11/2026 · Autor: Claude (desarrollador) · Base: `53ddeba356c2e7c75559c0556227aa4859917961` (rama `feature/NEXIT-2026-001-banco-demo`)
Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-354-R01-STOCK-INSUFICIENTE-CONFIGURABLE-2026-11-17.md` · Linear PRO-354

**Resultado del gate: DETENIDO.** La política de costo/valorización para vender sin existencias y confirmar la baja faltante a saldo negativo **no se deduce inequívocamente** de las reglas vigentes del motor de inventario. Conforme a la orden («si la política de costo no se deduce inequívocamente… publicar diseño y pedir decisión al responsable antes de codificar esa parte; implementar únicamente lo definido cuando no haya decisiones contables/lotificación abiertas; si las hay, parar»), **no se modificó código, no se creó migration y no se escribieron casos ejecutables**. Este documento es el único entregable de R01: mapa de impacto, diseño propuesto, decisiones D1–D8 con recomendación, matriz de aceptación prevista y control de integridad.

Nada ejecutado: 0 SQL, 0 migrations, 0 tests/lint/typecheck/build, 0 VM/Docker/gateway/deploy/merge.

---

## 1. Motor vigente (leído en las sucesoras efectivas, no en la histórica)

| Pieza | Definición efectiva | Regla que choca con RF02/RF07 |
|---|---|---|
| `stock_saldos` | NEX-009:51, sin sucesora que la altere | `stock_saldos_cant_chk CHECK (cantidad >= 0)` — global para todo tipo de stock/propiedad. |
| `inventario_costos` | NEX-009:197–216, sin sucesora | `cantidad_valorizada >= 0`, `valor_total >= 0`, `costo_promedio >= 0`, `cero_chk (cantidad_valorizada > 0 OR valor_total = 0)`. |
| `movimiento_lineas` | NEX-009:136/226 | `cantidad > 0`; costo `>= 0` o todo NULL. |
| `inventario_registrar_linea` | **NEX-014:58–183** (sucede NEX-009 y NEX-010) | Salida: exige `stock_saldos.cantidad >= p_cantidad` y `cantidad_valorizada >= p_cantidad` («saldo y costo divergen»). Costo de salida = parte proporcional del **valor** (`valor_total * q / cantidad_valorizada`); con saldo 0 conserva `costo_promedio` «solo como referencia». Entrada: promedio ponderado `costo_promedio_ponderado` (devuelve 0 si `prev_qty + in_qty <= 0`). |
| `inventario_agregar_linea` | NEX-052:34 (sucede NEX-014:224) | Envuelve la anterior con conversión de unidad base. |
| `inventario_registrar_movimiento` | NEX-014:282 (+ intenciones NEX-066) | Requiere `MOVIMIENTOS.CREAR`; máx. 500 líneas; idempotencia por clave + huella. |
| `inventario_anular_movimiento` | NEX-014:369 | Inverso de SALIDA entra al costo congelado; inverso de ENTRADA exige saldo disponible. |
| `fe_stock_disponibilidad` | NEX-067 | Filtra `cantidad > 0`, PROPIO/DISPONIBLE, depósito activo, propio, de la sucursal y en alcance. |
| `fe_stock_baja_documento` | NEX-067 | Bajo bloqueo exige `s.cantidad >= b.cantidad` → `NEX:STOCK_INSUFICIENTE`; concilia Σ reparto = Σ `dCantProSer` por producto con control de stock. |
| `documento_electronico_stock_salidas` | NEX-067 | PK `(empresa, documento, depósito)`, inmutable, una SALIDA/VENTA por depósito; `fe_stock_movimiento_protegido` impide anular salida ligada a FE. |
| Vistas | NEX-009 | `v_valoracion_stock WHERE cantidad_valorizada > 0` (un negativo desaparece de la valorización); `v_conciliacion_costo_stock` compara valorizada vs saldo PROPIO. |
| Compras → Entradas | NEX-075 | Entrada valorizada vía `inventario_registrar_movimiento` (ENTRADA/COMPRA) → promedio ponderado. |

Conclusión técnica: **ninguna** regla actual define (a) a qué costo sale una cantidad que no existe, (b) cómo se representa un valor negativo, (c) cómo se regulariza al entrar mercadería. El comentario `ELSE c.costo_promedio END -- solo como referencia` indica expresamente que el último promedio **no** es un costo contable vigente. Elegir cualquiera de estos tratamientos es una decisión contable, no técnica.

## 2. Mapa de impacto (qué tocaría la implementación completa)

| Capa | Archivo / objeto | Cambio previsto | ¿Depende de D1–D8? |
|---|---|---|---|
| Config empresa | NEX-080 (nueva): `empresas.bloquear_stock_insuficiente boolean NOT NULL DEFAULT TRUE` + función SQL de cambio auditada | Backfill TRUE implícito; lectura autoritativa en SQL. | D7 (dónde y con qué permiso) |
| Disponibilidad UI | `lib/facturacion/stock-preventivo.ts` (vistaStock 274–309), `app/api/facturas/stock/disponibilidad/route.ts`, `app/(private)/facturas/nueva/page.tsx` | En FALSE: insuficiencia = advertencia no bloqueante (requerido/disponible/faltante/efecto); errores técnicos siguen bloqueando. | No |
| Reparto | `lib/facturacion/stock-fe.ts` `asignarStock/planificarStock/huellaReparto` | Plan con `salidas` (disponible) + `pendientes` (faltante, con depósito de destino elegido); huella incluye pendientes y política. | D4 (lotes), D8 (depósito destino) |
| Previa / emisión | `app/api/facturas/previa/route.ts:30–32`, `lib/facturacion/emision.ts:768–772` | Leer política en servidor; si cambió desde la previa → 409 revisar de nuevo, sin numerar. | No |
| Baja SQL | NEX-080: nueva versión de `fe_stock_baja_documento` / wrapper (sin editar NEX-067) | Revalidar política y saldo bajo lock; salida = min(disponible, pedido) sin consumir saldo negativo; resto → `documento_electronico_stock_pendientes`; conciliación Σ salidas + Σ pendientes = cantidad fiscal. | No para registrar el pendiente; **sí** para confirmarlo |
| Pendientes | NEX-080: tabla `documento_electronico_stock_pendientes` (id propio; vínculo a FE/producto/depósito; estado PENDIENTE/CONFIRMADA; movimiento de confirmación) | Las confirmaciones generan SALIDA/VENTA **adicional** ligada por la tabla de pendientes, no por la PK de `documento_electronico_stock_salidas` (que no se toca). | No |
| Confirmación | NEX-080: `fe_stock_confirmar_pendiente(...)` + API + vista «Bajas pendientes de stock» en Stock | Con saldo suficiente: salida normal por el motor vigente (sin cambio contable). **A negativo:** requiere relajar CHECKs y nueva rama del motor de costos. | **Sí: D1, D2, D3, D4, D5, D6** |
| Motor de costos | `inventario_registrar_linea` (sucesora NEX-014) | Rama de salida a negativo + regularización en entrada. | **Sí: D1–D3** |
| Reportes | `lib/reportes/{stock-general,stock-critico,kardex,valorizacion,valorizacion-cobertura,snapshot,lotes}.ts`, `app/(private)/stock/page.tsx`, `app/api/stock` | Mostrar negativo sin truncar; distinguir físico / pendiente / proyectado; `valorizacion.ts:107` y `v_valoracion_stock` hoy filtran `> 0`. | D2 (cómo se valoriza el negativo) |
| Fiscal | payload, envío, consulta, CDC, KuDE, NCE | **Sin cambios.** | — |

## 3. Decisiones pendientes del responsable (bloquean el código)

Cada una con opciones y recomendación técnica del desarrollador. **No se elige ninguna unilateralmente.**

### D1 — Costo de la cantidad faltante al confirmarla a saldo negativo
- **A.** Último `costo_promedio` del depósito (el que NEX-014 guarda «solo como referencia» al llegar a 0); si nunca hubo costo → bloquear (ver C).
- **B.** Salida sin costo (línea con costo NULL / valor 0) y valorización al regularizar (D3).
- **C.** Bloquear la confirmación a negativo cuando no exista costo conocido > 0 (producto nunca valorizado en ese depósito).
- *Recomendación:* A + C (nunca costo inventado, trazable, no toca histórico). Requiere aprobación porque convierte un valor «de referencia» en costo contable.

### D2 — Representación del valor con cantidad negativa
- **A.** Permitir `inventario_costos.cantidad_valorizada/valor_total` negativos (relajar 4 CHECKs con guarda por origen).
- **B.** Mantener `inventario_costos` ≥ 0 (CHECKs intactos) y llevar la parte negativa en un registro aparte («cantidad y valor adeudados» por producto/depósito, ligado a la pendiente confirmada); `stock_saldos` negativo solo para PROPIO/DISPONIBLE bajo guarda.
- *Recomendación:* B — no relaja los CHECKs globales del motor de costos y aísla el caso excepcional. `stock_saldos_cant_chk` igual debe sustituirse por una guarda (trigger/CHECK condicional) que solo admita negativo marcado por confirmación FE; decisión técnica, aceptable si se aprueba D2.

### D3 — Regularización cuando entra mercadería sobre un saldo negativo
- **A.** La entrada cubre primero la deuda: las unidades que cancelan el negativo se valoran al costo real de la entrada y la diferencia contra el costo provisorio de D1 se registra como ajuste de costo trazable (movimiento/registro de ajuste de valor ligado a la pendiente).
- **B.** La entrada se promedia sin ajuste (la diferencia queda absorbida en el promedio futuro).
- **C.** Sin regularización automática; ajuste manual del contador.
- *Recomendación:* A (consistente, auditable). Afecta Compras → Entradas (NEX-075) y AJUSTE_POSITIVO; necesita aprobación contable explícita.

### D4 — Lotes
Verificado: el esquema **no tiene** flag de «lote obligatorio» por producto (`grep` sin resultados en migraciones); los lotes existen como `stock_saldos.lote_id` y el reparto usa FEFO.
- **A.** Si el producto tiene saldo con lote en el depósito, el faltante no puede quedar pendiente → se bloquea la emisión de esa línea en FALSE (como hoy).
- **B.** El faltante se registra sin lote y se confirma sobre la fila sin lote.
- **C.** El operador elige el lote del faltante en la previa.
- *Recomendación:* A hasta que exista política de lotes (no inventar lotes ni degradar integridad, RF04).

### D5 — Relación con PRO-310 (reserva al enviar / baja al aprobar)
PRO-354 conserva la baja al **emitir** (NEX-067). Confirmar que PRO-310, cuando se implemente, absorberá las pendientes (o que se acepta re-diseñarlas entonces). Sin decisión, el diseño de pendientes queda acoplado al momento actual de baja.

### D6 — Pendiente de una FE luego RECHAZADA o no transmitida
RF05 prohíbe crear reglas de reversión por iniciativa. Pero confirmar a negativo una pendiente de una FE rechazada registra una venta inexistente.
- **A.** Permitir confirmar solo si la FE no está RECHAZADO (sin revertir nada automáticamente).
- **B.** Permitir siempre (el operador decide).
- *Recomendación:* A (bloqueo simple, sin reversión).

### D7 — Dónde se configura y con qué permiso
PRO-340 (pantalla admin por empresa) está bloqueada. Existe `Configuración → Facturación electrónica` con permiso `FACTURACION_ELECTRONICA.CONFIGURAR` y función SQL que verifica el permiso.
- **A.** Interruptor en esa pantalla, permiso `FACTURACION_ELECTRONICA.CONFIGURAR`, cambio auditado en `eventos_seguridad`.
- **B.** Sin UI (solo función SQL administrativa, como `fe_max_lineas`), UI en PRO-340.
- *Recomendación:* A (RF01 pide configuración administrativa con permiso y auditoría; no abre PRO-340).

### D8 — Depósito de destino del faltante con varios depósitos elegibles
RF04 exige selección explícita. Confirmar: ¿selección por línea en la previa (obligatoria si >1 elegible) o depósito «principal» configurable por sucursal? *Recomendación:* selección por línea en la previa; con un solo elegible, preselección.

## 4. Lo que SÍ es determinable sin decisión contable (diseño listo para codificar tras aprobar D1–D8)

1. Columna `bloquear_stock_insuficiente NOT NULL DEFAULT TRUE`; TRUE = comportamiento exacto actual (mismas funciones, mismos errores `NEX:STOCK_INSUFICIENTE`).
2. FALSE en emisión: salida de min(disponible > 0, pedido) por el reparto determinista existente; saldo ≤ 0 → toda la cantidad pendiente; nada consume saldo negativo; pendiente con producto, sucursal, depósito elegido, cantidad numeric(18,4), FE/línea agregada por UUID, usuario/fecha, estado.
3. Conciliación SQL: Σ salidas + Σ pendientes = Σ `dCantProSer` por producto con control de stock; idempotencia por la misma guarda de NEX-067 (FE ya con baja/pendientes → 0, nada se duplica).
4. Confirmación **con saldo suficiente** (TRUE o FALSE): salida normal por `inventario_agregar_linea` sin cambio contable, bajo lock, una sola vez.
5. Revalidación de política y huella en previa/emisión con 409 «revisar de nuevo» sin reservar numeración.

Estos puntos podrían entregarse como subconjunto si el responsable lo autoriza expresamente (pendientes que solo se confirman con stock disponible), dejando la confirmación a negativo para cuando D1–D3 estén aprobadas. **No se implementan sin esa autorización**, porque la orden pide un paquete coherente posterior al gate.

## 5. Matriz de aceptación prevista (se escribirá como casos tras la aprobación; NO ejecutada)

| # | Caso | Resultado esperado | Depende de |
|---|---|---|---|
| 01 | TRUE con stock suficiente / faltante | Igual a hoy; falta bloqueada en UI, API (409) y SQL (`NEX:STOCK_INSUFICIENTE`), sin número reservado | — |
| 02 | FALSE 10/15 | Salida 10, pendiente 5, físico 0, proyectado −5; confirmar → −5, pendiente 0 | D1–D3 |
| 03 | FALSE saldo 0 / saldo ya negativo / suficiente | Todo pendiente / no consume negativo / sin pendiente | D2 |
| 04 | Reposición 8 antes de confirmar 5 | Saldo 3, salida normal; reposición posterior a negativo regulariza | D3 |
| 05 | 0,0001; líneas repetidas; 999 líneas; lotes de 500 | Agregación UUID exacta, sin Number | — |
| 06 | Varios depósitos, alcance parcial, sin depósito elegible, lotes | Selección explícita; sin elegible bloquea; lotes según D4 | D4, D8 |
| 07 | Servicios (`controla_stock=false`) | Ni salida ni pendiente | — |
| 08 | Permisos, tenant ajeno, flag falsificado en payload, RLS | Política leída solo del servidor/SQL; 403/42501 | D7 |
| 09 | Cambio de política/reparto tras previa; error de red | 409 revisar de nuevo; error técnico ≠ cero | — |
| 10 | Emisiones concurrentes, doble confirmación, reintentos, rollback | Una sola salida/pendiente/confirmación; todo o nada | — |
| 11 | FALSE→TRUE con pendientes/negativos | Nada se borra; confirmación a negativo rechazada; con disponible sí | D2 |
| 12 | Costo conocido / sin costo; reposición parcial/total | Según D1–D3 aprobadas; kardex y valorización consistentes | **D1–D3** |
| 13 | Stock general/crítico, movimientos, indicadores | Negativo visible, sin truncar, sin doble conteo físico/pendiente | D2 |
| 14 | Regresión FE/NCE/SIFEN/KuDE/compras/stock ordinario | Sin cambios | — |
| 15 | Reversión NEX-080 | Se niega con pendientes o negativos; grants mínimos; migraciones anteriores intactas | — |

## 6. Control de integridad de esta entrega

- Archivo único agregado: este documento. Sin cambios en código, SQL, migraciones históricas, CLAUDE.md, PROGRESSO, Linear ni documentos de gestión.
- No toca PRO-342, PRO-340, PRO-310, PRO-199, BSERP ni ningún flujo fiscal.
- Numeración prevista de la migration: **NEX-080** (última existente en HEAD: NEX-079, verificada en `documentacao/banco/nexit/v1/migraciones/`). No creada.
- CASA MINGO no aparece en el diseño como excepción: la política es por `empresas.id`.

## 7. Próximo paso

Aprobación del responsable (vía auditoría ChatGPT) de **D1–D8**, o autorización expresa del subconjunto §4. Con eso, R02 entrega en un solo paquete: NEX-080 (preflight, verificación, reversión protegida), código, vista de pendientes y casos 01–15 escritos sin ejecutar.
