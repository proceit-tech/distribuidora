# 08 — Productos: Familias, Líneas, precio de venta de referencia, inventario inicial y stock (NEX-017)

Regla definitiva del Nexit: **no se retira una funcionalidad prevista porque el banco aún no la soporta; se evalúa la estructura y se complementa el banco.** Esta nota documenta cómo se aplicó a la ficha de Productos. Migration: `migraciones/NEX-017-familias-lineas-precio-referencia.sql` (no modifica NEX-001..016; no se ejecutó en la VM ni en el banco `nexit`).

## 1. Qué ya existía y qué se creó

| Necesidad | Ya existía | Creado en NEX-017 |
|---|---|---|
| Familia | solo la columna `productos.familia_id` (uuid **sin tabla ni FK**) | tabla `familias_producto` + FK compuesta |
| Línea | solo `productos.linea_id` (sin tabla ni FK) | tabla `lineas_producto` (ligada a una familia) + FK compuesta que obliga línea ⊂ familia |
| Precio de venta de referencia | `listas_precio` + `lista_precio_items` (precio, moneda, vigencia) | solo `listas_precio.es_referencia` + índice único parcial + funciones/vista de lectura. **No hay tabla de precios duplicada** |
| Inventario inicial | `inventario_registrar_movimiento` (origen `ABERTURA`, D-C8), `stock_saldos`, `inventario_costos`, `movimientos_inventario`, `movimiento_lineas` | nada (se reutiliza tal cual) |
| Stock actual | vista `v_stock_producto`, tabla `stock_saldos` | vista `v_producto_costo_promedio` (lectura de `inventario_costos`) |

## 2. Tablas nuevas

### `familias_producto` (catálogo auxiliar por empresa)
`id` PK · `empresa_id` → `empresas` · `codigo` (opcional, ≤40) · `nombre` (obligatorio, ≤120) · `descripcion` · `activo` · `creado_at` · `actualizado_at`.
- `UNIQUE (empresa_id, id)` (destino de FKs compuestas).
- Índices únicos: `(empresa_id, lower(codigo))` si hay código; `(empresa_id, lower(btrim(nombre)))`.

### `lineas_producto` (catálogo auxiliar por empresa, vinculado a una familia)
Mismos campos + `familia_id` NOT NULL.
- FK compuesta `(empresa_id, familia_id)` → `familias_producto (empresa_id, id)`: una línea **no puede colgar de la familia de otra empresa**.
- `UNIQUE (empresa_id, familia_id, id)`: destino de la FK de `productos` (coherencia línea→familia).
- Índices únicos: `(empresa_id, lower(codigo))`; `(empresa_id, familia_id, lower(btrim(nombre)))` (el mismo nombre de línea puede repetirse en familias distintas). Índice de búsqueda `(empresa_id, familia_id)`.

### Cambios en `productos` (columnas que ya existían)
- `productos_familia_fk (empresa_id, familia_id)` → familias; `productos_linea_fk (empresa_id, familia_id, linea_id)` → `lineas_producto (empresa_id, familia_id, id)`: la línea del producto debe pertenecer a **su** familia; `productos_linea_requiere_familia_chk`: no hay línea sin familia.
- Índices parciales `productos_familia_idx`, `productos_linea_idx`.
- Guardia en la migración: si existiera algún `familia_id`/`linea_id` huérfano, la migración aborta (en la práctica eran siempre NULL).
- Borrar una familia/línea en uso se rechaza (FK). Para retirar del uso se marca `activo = false`.

## 3. Precio de venta de referencia
- **Modelo**: una lista de precios de venta marcada `listas_precio.es_referencia = true` (máx. **una por empresa**, índice único parcial). Debe ser `tipo_lista = 'VENTA'`, `modo_precio = 'PRECIO_FIJO'` y sin cliente/grupo/zona/canal ni lista base (`listas_precio_referencia_chk`). El precio de cada producto es su fila en `lista_precio_items` (`precio_lista`/`precio_base`, `unidad_medida_id` = unidad base, `moneda_codigo`, `vigente_desde`).
- **Moneda**: la de la lista. Se crea (código `REF-VENTA`) la primera vez que se carga un precio, con la **moneda base de la empresa** (`empresas.moneda_base_codigo`); se copia en el ítem. La pantalla muestra la moneda en la etiqueta del campo.
- **Escritura**: `producto_fijar_precio_referencia(empresa, producto, precio)` (invoker, con el rol `nexit_runtime`): inserta/actualiza el ítem (sin duplicar) o, con `NULL`, lo elimina. `lista_precio_referencia(empresa, crear)` devuelve/crea la lista (con bloqueo consultivo).
- **Lectura**: vista `v_producto_precio_referencia (empresa_id, producto_id, precio, moneda, vigente_desde)`.
- **Sin precio**: no hay fila ⇒ la API devuelve `null` y la pantalla muestra "Sin precio" (jamás 0 inventado). **Valor venta referencia** = precio × stock actual (solo si hay precio).
- **Permisos**: `PRODUCTOS.CREAR` / `PRODUCTOS.EDITAR` bastan para el precio de referencia (decisión documentada; el módulo Listas de precios podrá refinarla). El módulo Listas de precios (ítem 5) verá esta lista como cualquier otra; no se pierde información.
- Límite actual: no se guarda historial de precios (se actualiza el vigente); lo trae Listas de precios.

## 4. Inventario inicial
- En el **alta**, `inventarioInicial {cantidad, costoUnitario, depositoId}` genera un **movimiento real** `ENTRADA` / origen `ABERTURA` con `inventario_registrar_movimiento` en la **misma transacción** que el `INSERT` del producto (y del precio de referencia): o se guarda todo o nada. No hay saldo fijo desconectado de movimientos.
- Trazabilidad: número de movimiento, depósito destino, usuario, fecha, costo; clave de idempotencia `apertura:<producto_id>`.
- Costo: es el **costo unitario de apertura informado** (D-C8: costo exacto de la apertura). **Obligatorio** si hay cantidad (el banco no inventa costos); no se introdujo ninguna regla de costo promedio/valorización nueva: el promedio lo calcula el motor ya existente (P007, `inventario_costos`).
- Permisos: además de `PRODUCTOS.CREAR`, la API exige `MOVIMIENTOS.CREAR` (403 si falta) y la función valida el alcance del usuario sobre el depósito.
- Rechazos con ROLLBACK total: sin costo, sin depósito, depósito de otra empresa/inactivo, producto que no controla stock, producto por lote/serie (su apertura se registra desde Movimientos porque necesita identificar el lote).
- En **edición** el inventario inicial no se reescribe: se muestra solo lectura (cantidad, costo, depósito, nº de movimiento). Cualquier ajuste posterior es un movimiento (módulo Movimientos).

## 5. Stock actual y costo promedio (solo lectura)
- Stock actual = `v_stock_producto.disponible` (saldos DISPONIBLE propios) por empresa y producto; detalle por depósito desde `stock_saldos`. El campo "Stock actual" quedó en la ficha y la lista; se quitó únicamente el valor demostrativo.
- Costo promedio = `v_producto_costo_promedio` (suma de `inventario_costos` de todos los depósitos); `NULL` si no hay saldo valorizado. La columna histórica `productos.costo_promedio` no se escribe desde la ficha.

## 6. API (Productos)
- `GET/POST /api/productos/familias` y `GET/POST /api/productos/lineas[?familiaId=]` — `PRODUCTOS.VER` / `PRODUCTOS.CREAR`, siempre con el `empresa_id` de la sesión. Alimentan los selects; el `GET /api/productos?modo=catalogos` también devuelve `familias`, `lineas` (con `familiaId`) y `monedaReferencia`.
- Lista y detalle devuelven familia/línea, precio y moneda de referencia, stock, costo promedio e inventario inicial reales.

## 7. Dependencias
- Inventario inicial depende de: Movimientos/Inventario (NEX-009/014), depósitos activos de la empresa, `MOVIMIENTOS.CREAR`, costo informado.
- Precio de venta depende de: Listas de precios (NEX-008), moneda base de la empresa.
- Stock depende de: movimientos (única fuente de verdad), vistas NEX-011.

## 8. Planeamiento de cadastros auxiliares de Productos
| Catálogo | Tabla | Estado del banco | API para selects | Pantalla administrativa |
|---|---|---|---|---|
| Categorías | `categorias_producto` | existe | sí (catálogos) | **pendiente** |
| Marcas | `marcas_producto` | existe | sí | **pendiente** |
| **Familias** | `familias_producto` | **creada (NEX-017)** | sí (GET/POST) | **pendiente** |
| **Líneas** | `lineas_producto` | **creada (NEX-017)** | sí (GET/POST, por familia) | **pendiente** |
| Unidades de medida / impuestos / países | globales (NEX-003) | existen | sí | fuera de alcance (catálogo global) |
**Origen de los datos:** las **51 familias y 203 líneas** de CASA MINGO (`casa_mingo`) fueron **suministradas por la propia CASA MINGO en una planilla Excel**; son datos reales del cliente (no DEMO) y se cargan con `seeds/S-004-casa-mingo-familias-lineas.sql` (ejecución manual, solo para esa empresa, idempotente). Verificado: el seed coincide 1:1 con la lista original incorporada al formulario (51/51 familias, 203/203 pares familia→línea; 3 familias sin líneas —CAFETERIA, COCTELERIA, DESCORCHADOR— tal como en la fuente).
**Futuro:** estos registros deben quedar disponibles en las pantallas administrativas de **Familias** y **Líneas** (altas, edición, inactivación, códigos), todavía pendientes; mientras tanto se mantienen por API/seed. Con la lista vacía (otras empresas) los selects muestran "Sin familias registradas".

## 9. Pruebas
`pruebas/T12-productos-familias-precio.sql` (30 verificaciones, incluido en `ejecutar-pruebas.sh`): aislamiento y unicidad de familias/líneas, coherencia línea→familia, precio de referencia (alta, actualización sin duplicar, quitar, otra empresa, lista única, tipo VENTA), apertura vía `ABERTURA` (saldo, costo promedio, sin costo rechazado) y permisos de `nexit_runtime`. La batería completa quedó en 351 verificaciones, 0 fallas (PostgreSQL 16 descartable). Las rutas de la API se probaron además con el rol `nexit_runtime` y las rutas reales (ver PROGRESSO-NEXIT-V1.md).

## 10. Notas
- `demo_reiniciar` (NEX-012) no conoce las tablas nuevas: en empresas DEMO las familias/líneas no se borran con el reinicio (sin impacto: las empresas reales no se reinician). Si se desea, una migración futura puede ampliarlo.
- NEX-014 definía `nex_aplicar_grants_runtime()`; NEX-017 la **redefine** (CREATE OR REPLACE) con las tablas/funciones nuevas, sin tocar los archivos aplicados.
