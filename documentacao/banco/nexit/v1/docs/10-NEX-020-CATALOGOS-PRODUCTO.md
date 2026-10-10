# NEX-020 — Escritura controlada de Categorías y Marcas de producto

**Estado:** preparada y probada en PostgreSQL descartable. **NO aplicada** en la VM ni en la base real (requiere autorización del responsable).

## Qué corrige
`nexit_runtime` (NEX-013) solo tenía SELECT en `categorias_producto` y `marcas_producto`; la pantalla `/productos/catalogos` no podía crear/editar esos dos catálogos. Familias y Líneas ya funcionaban (NEX-017).

## Qué hace
1. **Guardia de duplicados**: si ya existen nombres o códigos equivalentes (mismo `empresa_id`, `lower(btrim(...))`) la migración **aborta sin cambiar nada** y lista cada duplicado.
2. **4 índices únicos**: `categorias_producto_empresa_{nombre,codigo}_key`, `marcas_producto_empresa_{nombre,codigo}_key` (nombre: `lower(btrim)`; código: `lower(btrim)`, parcial para no nulos/no vacíos). Mismas reglas que la API y que NEX-017.
3. **`catalogo_producto_guardar(p_empresa, p_usuario, p_catalogo, p_id, p_codigo, p_nombre, p_activo)`** — `SECURITY DEFINER`, `search_path = public, pg_temp`:
   - exige usuario ACTIVO de esa empresa con `PRODUCTOS.CREAR` (alta) o `PRODUCTOS.EDITAR` (edición/inactivación) vía `usuario_tiene_permiso()` (mismo mecanismo que `inventario_registrar_movimiento`);
   - todo `INSERT/UPDATE` filtra por `empresa_id = p_empresa`; un `p_id` de otra empresa → `P0002`; usuario ajeno → `42501`;
   - normaliza espacios, valida nombre (1–120) y código (≤40); sin DELETE.
4. **Grants**: `nex_aplicar_grants_runtime()` se redefine idéntica a NEX-017 + `EXECUTE` en la función nueva. El rol **no** recibe INSERT/UPDATE/DELETE sobre las tablas.
- Modelo de confianza: igual que las funciones de inventario — la aplicación (rol compartido) informa empresa y usuario de la sesión; la función verifica que el usuario pertenezca a esa empresa y tenga el permiso. No hay RLS en esta etapa.
- No modifica filas existentes (UUID y datos preservados). No modifica NEX-001..019.

## Cómo aplicar (solo con autorización)
1. Respaldo de la base. Ejecutar antes, en modo lectura, la detección de duplicados (el propio archivo la hace y aborta; puede probarse en una copia).
2. `PGDATABASE=nexit scripts/aplicar-migraciones.sh --permitir-banco-real` (NEX-019 ya aplicada; el runner registra NEX-020 con checksum, en una transacción).
3. Verificación: `select proname from pg_proc where proname='catalogo_producto_guardar'`; 4 índices; `has_table_privilege('nexit_runtime','categorias_producto','INSERT')` = false; `has_function_privilege('nexit_runtime','catalogo_producto_guardar(uuid,uuid,text,uuid,text,text,boolean)','EXECUTE')` = true.
4. Desplegar la versión de la app que usa la función (`lib/productos/catalogos-admin.ts`). Antes de aplicar la migración, Categorías/Marcas siguen sin poder escribirse con `nexit_runtime`.
- Reversión (si hiciera falta): `DROP FUNCTION catalogo_producto_guardar(...)`, `DROP INDEX` de los 4 índices y volver a ejecutar `nex_aplicar_grants_runtime()` de NEX-017 — solo con autorización.

## Pruebas
`pruebas/T14-catalogos-producto-escritura.sql` (incluida en `ejecutar-pruebas.sh`) y la batería de la app (68+ verificaciones con handlers reales como `nexit_runtime`).
