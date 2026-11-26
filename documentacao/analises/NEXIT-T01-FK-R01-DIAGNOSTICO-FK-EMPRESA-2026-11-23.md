# NEXIT-T01-FK-R01 / PRO-363 — Diagnóstico de FK `empresa_id` en T01 — STOP en Fase 1 — 23/11/2026

- Orden: [ORD-CLAUDE-NEXIT-T01-FK-R01-NEX-083-2026-11-23.md](../ordens/ORD-CLAUDE-NEXIT-T01-FK-R01-NEX-083-2026-11-23.md) (commit documental `4bf4dcf8330919e5c44cbd85147ef3ee58378695`).
- HEAD de partida confirmado: `88d68590a876a413c941982fcb5231298a7a3f11` (rama `feature/NEXIT-2026-001-banco-demo`, PR #7 DRAFT). NEX-083 libre (no existe archivo `NEX-083-*`).
- Detector de solo lectura entregado: [`documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql`](../banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql). **NO EJECUTADO.**
- Nada se ejecutó: ni SQL/psql, ni pruebas, lint, typecheck, build, CI manual, VM, Docker ni gateway. Sin migration NEX-083.

## 1. Resultado

**El inventario estático de NEX-001..082 encuentra DOS tablas incumplidoras, no una:**

| Tabla | Origen | Definición | `empresa_id` | PK | FK | Acceso app | Ciclo de vida |
|---|---|---|---|---|---|---|---|
| `public.fe_estado_previo_nex065` | NEX-065 (`NEX-065-facturacion-estado-por-tipo.sql:41-50`) | foto de auditoría de la disponibilidad previa por tipo (FE/NCE) al migrar | `uuid NOT NULL` | `(empresa_id, punto_id, tipo_documento)` | **ninguna** | `REVOKE ALL` a PUBLIC (:52) y a `nexit_runtime` (:513) | se llena UNA vez en la migración (:54-56) desde `fe_punto_secuencias ⋈ fe_puntos_expedicion` (ambas con FK a `empresas`); la lee `verificar-NEX-065.sql`, T33 y `reversion-NEX-065.sql`, que la elimina (:522) |
| `public.fe_stock_pendientes_preparacion` | NEX-081 (`NEX-081-facturacion-politica-stock-pendientes.sql:195-201`) | preparación interna de UNA transacción de emisión con faltante | `uuid NOT NULL` | `(txid, empresa_id, clave)` | **ninguna** | `REVOKE ALL` a PUBLIC y `nexit_runtime` (:746-747) | INSERT (:484) y DELETE (:490) en `fe_documento_crear_fe_stock_pendiente`, lectura en `fe_stock_baja_documento` (:250); vacía fuera de una emisión; `reversion-NEX-081.sql:184` la elimina |

Ninguna migración posterior (NEX-066..082) altera, renombra, elimina ni agrega FK a `fe_estado_previo_nex065`: las únicas apariciones del nombre en `migraciones/` están en NEX-065 (líneas 12, 27, 28, 41, 51, 52, 54, 513). Por lo tanto la tabla existe en el CI efímero (M1 aplica NEX-001..082 desde cero y NEX-065 la crea siempre, aunque con 0 filas) y **sigue incumpliendo T01:38-45 aunque se corrija `fe_stock_pendientes_preparacion`**.

Por qué el CI no lo mostraba: `pg_temp.ok` aborta en la primera aserción falsa (`ON_ERROR_STOP`), y la aserción de FK devuelve un booleano sin listar tablas. Hasta NEX-082 la batería se detenía antes, en la aserción `actualizado_at` (T01:31-36); ahora se detiene en la línea 45 y el mensaje no distingue cuántas tablas fallan. NEX-065 es anterior a NEX-081, así que esta aserción ya era falsa desde que NEX-065 entró en la rama, enmascarada por la aserción previa.

**Conforme a la Fase 1 punto 3 de la orden («si se identifica MÁS DE UNA tabla… STOP y solicitar ampliación de autorización; no aplicar una solución parcial»), NO se creó NEX-083 ni preflight, verificación, reversión o casos.** Una NEX-083 limitada a `fe_stock_pendientes_preparacion` dejaría T01 en FAIL por `fe_estado_previo_nex065`.

## 2. Método del inventario (fuente, sin base de datos)

1. Se recorrieron los 82 archivos `migraciones/NEX-0*.sql` en el orden del runner (`aplicar-migraciones.sh` aplica `NEX-0*.sql` alfabéticamente; `migraciones/opcional/NEX-OPT-rls-empresa.sql` no lo aplica el runner ni `ejecutar-pruebas.sh` sobre la base principal — T08 lo prueba en una copia).
2. Con comentarios eliminados, se extrajeron todas las sentencias `CREATE [UNLOGGED|TEMP] TABLE`, `CREATE TABLE … AS`, `ALTER TABLE` (ADD COLUMN, ADD CONSTRAINT … FOREIGN KEY, DROP CONSTRAINT, DROP COLUMN, RENAME) y `DROP TABLE`, incluidas las que están dentro de bloques `DO $$`.
3. Para cada tabla se registraron la presencia de `empresa_id` y las FK cuyo **primer elemento** es `empresa_id` (equivalente estático de `conkey[1]`), sean de columna (`empresa_id uuid … REFERENCES empresas (id)`) o de tabla (`FOREIGN KEY (empresa_id, …) REFERENCES padre (empresa_id, …)`).
4. Controles adicionales:
   - **SQL dinámico:** ningún `EXECUTE` crea tablas, agrega columnas ni FK. El único `EXECUTE … DROP CONSTRAINT %I` (NEX-080:98) recorre `nex080_respaldo` con `clase = 'RESTRICCION'`, que solo contiene restricciones `contype = 'c'` (CHECK de CDC, NEX-080:85-90): no elimina FK.
   - **DROP CONSTRAINT estáticos:** solo `direcciones_cliente_geo_fk` (NEX-021:44) es FK y referencia catálogos geográficos globales, no `empresa_id`; los demás son CHECK.
   - **DROP TABLE / RENAME / DROP COLUMN:** ninguno en NEX-001..082.
   - **Herencia/particiones:** ninguna (`INHERITS`/`PARTITION OF|BY` ausentes; la única coincidencia es una función ventana `PARTITION BY` en NEX-014:470).
   - **CTAS:** solo `paises_telefonia_previo_nex027` (NEX-027:35-36: `iso3, nombre, ddi, activo, capturado_en`), sin `empresa_id`.
   - **Semillas y bootstrap de pruebas** (`seeds/*.sql`, `pruebas/bootstrap-legado-nex019.sql`): no crean tablas.
5. Resultado: **103 tablas** (102 con `CREATE TABLE` + 1 CTAS); **86 con `empresa_id`** (todas sujetas a la aserción; `empresas` no tiene esa columna y T01 la excluye igualmente); **84 cumplen**, **2 incumplen**. Las 17 sin `empresa_id` son catálogos globales o tablas técnicas: `condiciones_pago`, `empresas`, `fiscal_reconciliacion_log`, `impuestos`, `incoterms`, `monedas`, `nex080_respaldo`, `paises_telefonia`, `paises_telefonia_previo_nex027`, `permisos`, `referencia_geografica_{paises,departamentos,distritos,ciudades}`, `schema_migrations`, `unidades_medida`, `unidades_medida_sifen`.

Límite declarado: es un análisis de fuente. La confirmación en catálogo la da el detector (sección 3), que además compara la lista hallada con estas dos tablas esperadas (sección 7 del script) y marca cualquier tabla NO_ESPERADA o ESPERADA_AUSENTE.

## 3. Detector de solo lectura (`diagnostico-T01-FK-01.sql`, no ejecutado)

`BEGIN … READ ONLY` + `ROLLBACK`, `statement_timeout`/`lock_timeout` solo `SET LOCAL`; sin DDL, DML ni GRANT.

| Sección | Contenido |
|---|---|
| 0 | rol, base, aislamiento, `transaction_read_only`; registro de NEX-065/081/082/083 en `schema_migrations` |
| 1 | predicado **literal** de T01:39-45, listando tablas en lugar de devolver un booleano |
| 2 | mismo criterio por `pg_catalog` (independiente de privilegios; incluye `relkind 'p'`), con tipo/nulabilidad de `empresa_id`, PK, número de FK y aviso si `information_schema` no ve la tabla |
| 3 | todas las tablas con `empresa_id` y sus FK ancladas: `conkey`/`confkey` (números y nombres), tabla referida, `convalidated`, diferibilidad, acciones, `MATCH` |
| 4 | FK ancladas `NOT VALID` (`convalidated = false`): T01 las aceptaría, pero no prueban integridad; deben ser 0 |
| 5 | recuentos agregados por tabla incumplidora: filas, empresas distintas, `empresa_id` NULL y huérfanos frente a `empresas.id` (vía `query_to_xml`, solo SELECT, sin mostrar filas) |
| 6 | `empresas(id)` tiene PK/UNIQUE referenciable |
| 7 | contraste con el inventario estático: ESPERADA_PRESENTE / ESPERADA_AUSENTE / NO_ESPERADA |

## 4. Propuesta mínima (requiere AMPLIACIÓN de autorización; no implementada)

Una sola NEX-083 incremental con **dos** FK, cada una `(empresa_id) REFERENCES public.empresas(id)`, validadas en la misma transacción del runner, sin DML ni cambios de PK, permisos o funciones:

| Tabla | FK propuesta | Cardinalidad potencial | Riesgo de huérfanos | Bloqueos |
|---|---|---|---|---|
| `fe_stock_pendientes_preparacion` | `fe_stock_pendientes_preparacion_empresa_fk` (o nombre que fije la orden) | 0 filas fuera de una emisión; como máximo 1 fila por transacción de emisión en curso | nulo fuera de una emisión (si hubiera filas, el preflight debe ABORTAR: indicaría emisión en curso o estado anómalo) | `ADD CONSTRAINT … FOREIGN KEY` toma `SHARE ROW EXCLUSIVE` en la tabla hija y en `empresas`: bloquea INSERT/UPDATE/DELETE en `empresas` (y la emisión con faltante, que escribe en la hija) durante el alta; ventana breve con tabla vacía; `lock_timeout` local |
| `fe_estado_previo_nex065` | `fe_estado_previo_nex065_empresa_fk` | igual al número de filas de `fe_punto_secuencias` al aplicar NEX-065 (puntos × tipos); fija desde entonces | nulo por construcción (se llenó desde `fe_punto_secuencias`, cuya FK a `empresas` es validada) salvo borrado posterior de una empresa; el preflight debe contar y ABORTAR ante cualquier huérfano | mismos modos; la tabla no la usa la aplicación, de modo que el bloqueo relevante es el de `empresas` |

Alternativa para `fe_estado_previo_nex065`, también fuera del alcance actual: FK compuesta `(empresa_id, punto_id) → fe_puntos_expedicion(empresa_id, id)` (UNIQUE `fe_puntos_expedicion_empresa_id_id_key`, NEX-048:45), que T01 también acepta y además ancla el punto. Se recomienda la FK simple a `empresas(id)` por ser la mínima y homogénea con la otra tabla.

Efecto sobre reversiones existentes: `reversion-NEX-065.sql` y `reversion-NEX-081.sql` ejecutan `DROP TABLE` de la tabla hija, que elimina su propia FK sin `CASCADE`; no las bloquea. La reversión de NEX-083 debería ejecutarse antes y solo retirar las dos constraints.

## 5. Decisión requerida del responsable

1. **Ampliar la autorización** para que NEX-083 agregue las dos FK (recomendado: deja T01:38-45 en PASS de forma natural si el detector confirma el inventario), con los mismos seis archivos de la orden ajustados a dos tablas; o
2. otra decisión de modelo para `fe_estado_previo_nex065` (p. ej., FK compuesta al punto), que la orden no contempla.

La implementación queda detenida hasta esa autorización. No se modificaron NEX-001..082, sus checksums, `T01-estructura.sql`, el runner, los workflows, `CLAUDE.md` ni código de la aplicación.

## 6. Anexo — inventario completo de tablas con `empresa_id` (86, excluida `empresas`)

Nombres de FK: los explícitos son los de la migración; los de FK de columna sin nombre son el nombre por defecto que asigna PostgreSQL (`<tabla>_empresa_id_fkey`), inferido de la fuente. «(+n)» indica n FK ancladas adicionales hacia padres de la misma empresa.

| # | Tabla | Migración | FK anclada en `empresa_id` (primera) | T01:45 |
|---|---|---|---|---|
| 1 | `administradores_plataforma` | NEX-016 | `administradores_plataforma_usuario_empresa_fk(empresa_id,usuario_id)->usuarios(empresa_id,id)` | cumple |
| 2 | `canales_venta` | NEX-004 | `canales_venta_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 3 | `categorias_producto` | NEX-004 | `categorias_producto_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 4 | `cliente_contactos` | NEX-005 | `cliente_contactos_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 5 | `cliente_conversiones_moneda` | NEX-029 | `cliente_conversiones_moneda_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 6 | `cliente_documento_eventos` | NEX-031 | `cliente_documento_eventos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 7 | `cliente_documento_versiones` | NEX-031 | `cliente_documento_versiones_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 8 | `cliente_documentos` | NEX-005 | `cliente_documentos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 9 | `clientes` | NEX-005 | `clientes_empresa_id_fkey(empresa_id)->empresas(id)` (+8) | cumple |
| 10 | `compras_entradas` | NEX-075 | `compras_entradas_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 11 | `compras_entradas_intenciones` | NEX-075 | `compras_entradas_intenciones_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 12 | `deposito_usuario_eventos` | NEX-046 | `deposito_usuario_eventos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 13 | `depositos` | NEX-002 | `depositos_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 14 | `direcciones_cliente` | NEX-005 | `direcciones_cliente_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 15 | `documento_electronico_entregas` | NEX-068 | `documento_electronico_entregas_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 16 | `documento_electronico_envio_evidencias` | NEX-072 | `documento_electronico_envio_evidencias_empresa_id_fkey(empresa_id)->empresas(id)` (+5) | cumple |
| 17 | `documento_electronico_intentos` | NEX-047 | `documento_electronico_intentos_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 18 | `documento_electronico_solicitudes` | NEX-048 | `documento_electronico_solicitudes_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 19 | `documento_electronico_stock_pendientes` | NEX-081 | `documento_electronico_stock_pendientes_empresa_id_fkey(empresa_id)->empresas(id)` (+5) | cumple |
| 20 | `documento_electronico_stock_salidas` | NEX-067 | `documento_electronico_stock_salidas_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 21 | `documento_electronico_vendedor` | NEX-074 | `documento_electronico_vendedor_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 22 | `documentos_electronicos` | NEX-047 | `documentos_electronicos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 23 | `eventos_seguridad` | NEX-002 | `eventos_seguridad_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 24 | `familias_producto` | NEX-017 | `familias_producto_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 25 | `fe_estado_previo_nex065` | NEX-065 | **NINGUNA** | **INCUMPLE** |
| 26 | `fe_gateway_config` | NEX-047 | `fe_gateway_config_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 27 | `fe_gateway_config_log` | NEX-061 | `fe_gateway_config_log_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 28 | `fe_gateway_credenciales` | NEX-061 | `fe_gateway_credenciales_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 29 | `fe_gateway_prueba_limite` | NEX-061 | `fe_gateway_prueba_limite_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 30 | `fe_punto_secuencias` | NEX-060 | `fe_punto_secuencias_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 31 | `fe_puntos_expedicion` | NEX-048 | `fe_puntos_expedicion_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 32 | `fe_puntos_expedicion_log` | NEX-057 | `fe_puntos_expedicion_log_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 33 | `fe_stock_pendientes_preparacion` | NEX-081 | **NINGUNA** | **INCUMPLE** |
| 34 | `grupos_cliente` | NEX-004 | `grupos_cliente_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 35 | `grupos_proveedor` | NEX-004 | `grupos_proveedor_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 36 | `inventario_costos` | NEX-009 | `inventario_costos_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 37 | `lineas_producto` | NEX-017 | `lineas_producto_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 38 | `lista_precio_escalones` | NEX-008 | `lista_precio_escalones_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 39 | `lista_precio_items` | NEX-008 | `lista_precio_items_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 40 | `lista_precio_reglas` | NEX-008 | `lista_precio_reglas_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 41 | `listas_precio` | NEX-008 | `listas_precio_empresa_id_fkey(empresa_id)->empresas(id)` (+6) | cumple |
| 42 | `marcas_producto` | NEX-004 | `marcas_producto_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 43 | `medios_pago` | NEX-004 | `medios_pago_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 44 | `movimiento_lineas` | NEX-009 | `movimiento_lineas_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 45 | `movimientos_intenciones` | NEX-066 | `movimientos_intenciones_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 46 | `movimientos_inventario` | NEX-009 | `movimientos_inventario_empresa_id_fkey(empresa_id)->empresas(id)` (+6) | cumple |
| 47 | `nce_descuentos` | NEX-070 | `nce_descuentos_origen_fk(empresa_id,nce_id,fe_id)->nce_origen(empresa_id,nce_id,fe_id)` | cumple |
| 48 | `nce_lineas` | NEX-062 | `nce_lineas_origen_fk(empresa_id,nce_id,fe_id)->nce_origen(empresa_id,nce_id,fe_id)` | cumple |
| 49 | `nce_observaciones_originales` | NEX-071 | `nce_observaciones_originales_nce_fk(empresa_id,nce_id)->nce_origen(empresa_id,nce_id)` | cumple |
| 50 | `nce_origen` | NEX-062 | `nce_origen_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 51 | `perfil_permiso` | NEX-002 | `perfil_permiso_perfil_fk(empresa_id,perfil_id)->perfiles(empresa_id,id)` | cumple |
| 52 | `perfiles` | NEX-002 | `perfiles_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 53 | `producto_alternativos` | NEX-007 | `producto_alternativos_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 54 | `producto_clasificacion_fiscal_log` | NEX-056 | `producto_clasificacion_fiscal_log_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 55 | `producto_codigos` | NEX-007 | `producto_codigos_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 56 | `producto_componentes` | NEX-007 | `producto_componentes_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 57 | `producto_deposito_configuracion` | NEX-007 | `producto_deposito_configuracion_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 58 | `producto_documento_versiones` | NEX-041 | `producto_documento_versiones_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 59 | `producto_documentos` | NEX-007 | `producto_documentos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 60 | `producto_eventos` | NEX-041 | `producto_eventos_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 61 | `producto_imagen_versiones` | NEX-042 | `producto_imagen_versiones_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 62 | `producto_proveedores` | NEX-007 | `producto_proveedores_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 63 | `producto_unidad_base_historial` | NEX-052 | `producto_unidad_base_historial_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 64 | `producto_unidades` | NEX-007 | `producto_unidades_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 65 | `productos` | NEX-007 | `productos_empresa_id_fkey(empresa_id)->empresas(id)` (+6) | cumple |
| 66 | `proveedor_contactos` | NEX-006 | `proveedor_contactos_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 67 | `proveedor_cuenta_revisiones` | NEX-035 | `proveedor_cuenta_revisiones_empresa_id_fkey(empresa_id)->empresas(id)` (+4) | cumple |
| 68 | `proveedor_cuentas_bancarias` | NEX-006 | `proveedor_cuentas_bancarias_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 69 | `proveedor_direcciones` | NEX-006 | `proveedor_direcciones_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 70 | `proveedor_documento_versiones` | NEX-036 | `proveedor_documento_versiones_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 71 | `proveedor_documentos` | NEX-006 | `proveedor_documentos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 72 | `proveedor_eventos` | NEX-034 | `proveedor_eventos_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 73 | `proveedor_retenciones` | NEX-006 | `proveedor_retenciones_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 74 | `proveedores` | NEX-006 | `proveedores_empresa_id_fkey(empresa_id)->empresas(id)` (+4) | cumple |
| 75 | `rutas_entrega` | NEX-004 | `rutas_entrega_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 76 | `sesiones_usuario` | NEX-002 | `sesiones_usuario_usuario_fk(empresa_id,usuario_id)->usuarios(empresa_id,id)` | cumple |
| 77 | `stock_lotes` | NEX-009 | `stock_lotes_empresa_id_fkey(empresa_id)->empresas(id)` (+1) | cumple |
| 78 | `stock_saldos` | NEX-009 | `stock_saldos_empresa_id_fkey(empresa_id)->empresas(id)` (+3) | cumple |
| 79 | `sucursales` | NEX-002 | `sucursales_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 80 | `tipos_cambio` | NEX-045 | `tipos_cambio_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 81 | `usuario_deposito` | NEX-002 | `usuario_deposito_usuario_fk(empresa_id,usuario_id)->usuarios(empresa_id,id)` (+2) | cumple |
| 82 | `usuario_perfil` | NEX-002 | `usuario_perfil_usuario_fk(empresa_id,usuario_id)->usuarios(empresa_id,id)` (+2) | cumple |
| 83 | `usuario_sucursal` | NEX-002 | `usuario_sucursal_usuario_fk(empresa_id,usuario_id)->usuarios(empresa_id,id)` (+2) | cumple |
| 84 | `usuarios` | NEX-002 | `usuarios_empresa_id_fkey(empresa_id)->empresas(id)` (+2) | cumple |
| 85 | `vendedores` | NEX-004 | `vendedores_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
| 86 | `zonas_comerciales` | NEX-004 | `zonas_comerciales_empresa_id_fkey(empresa_id)->empresas(id)` | cumple |
