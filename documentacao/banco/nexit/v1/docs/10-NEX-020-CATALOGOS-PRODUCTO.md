# NEX-020 — Escritura controlada de Categorías y Marcas de producto

**Estado:** preparada y probada en PostgreSQL descartable. **NO aplicada** en la VM ni en la base real (requiere autorización del responsable).

## Qué corrige
`nexit_runtime` (NEX-013) solo tenía SELECT en `categorias_producto` y `marcas_producto`; la pantalla `/productos/catalogos` no podía crear/editar esos dos catálogos. Familias y Líneas ya funcionaban (NEX-017).

## Qué hace
1. **Guardia de duplicados**: si ya existen nombres o códigos equivalentes (mismo `empresa_id`, `lower(btrim(...))`) la migración **aborta sin cambiar nada** y lista cada duplicado.
2. **4 índices únicos**: `categorias_producto_empresa_{nombre,codigo}_key`, `marcas_producto_empresa_{nombre,codigo}_key` (nombre: `lower(btrim)`; código: `lower(btrim)`, parcial para no nulos/no vacíos). Mismas reglas que la API y que NEX-017.
3. **`catalogo_producto_guardar(p_sesion_id, p_secreto, p_catalogo, p_id, p_codigo, p_nombre, p_activo)`** — `SECURITY DEFINER`, `search_path = public, pg_temp`:
   - **No recibe empresa ni usuario.** Recibe la credencial de la sesión autenticada (id de sesión + secreto del token de la cookie) y la **verifica** en `sesiones_usuario` (`token_hash = crypt(secreto, token_hash)`, sin revocar, sin expirar, usuario ACTIVO y no bloqueado, empresa ACTIVA). Empresa y usuario se **derivan** de esa fila.
   - Luego exige `PRODUCTOS.CREAR` (alta) o `PRODUCTOS.EDITAR` (edición/inactivación) con `usuario_tiene_permiso()` sobre la identidad derivada.
   - Todo `INSERT/UPDATE` filtra por la empresa derivada; un `p_id` de otra empresa → `P0002`. Sesión inválida o sin permiso → `42501`. Sin DELETE.
   - La firma anterior `(p_empresa, p_usuario, ...)` (commit `421b9bf`, nunca aplicada) deja de existir.
4. **Grants**: `nex_aplicar_grants_runtime()` se redefine idéntica a NEX-017 + `EXECUTE` en la función nueva (diferencia verificada: una sola línea, el nombre en la lista de funciones). El rol **no** recibe INSERT/UPDATE/DELETE sobre las tablas.

## Modelo de confianza (revisado)
- **Qué impide**: con el rol compartido `nexit_runtime`, conocer el UUID de otro administrador (o de otra empresa) ya **no** permite actuar como él. La identidad solo se prueba con el secreto de una sesión viva, que existe únicamente en la cookie de ese usuario; en la BD se guarda su hash bcrypt (el rol puede leerlo, pero no invertirlo ni usarlo como secreto: probado). No se usa ninguna variable de sesión de PostgreSQL como prueba de identidad (el mismo rol podría fijarla libremente).
- **Qué NO impide (límite honesto)**: un atacante con ejecución de código dentro de la aplicación puede ver las cookies de las solicitudes en curso y usarlas durante la vida de esas sesiones; esto es inherente a cualquier esquema con rol compartido y está acotado a las sesiones que ese código observe, a sus permisos y a su expiración. Tampoco hay RLS en esta etapa.

## Observación separada — funciones de inventario (NO modificadas)
`inventario_registrar_movimiento`, `inventario_anular_movimiento` y los helpers `usuario_tiene_permiso` / `usuario_puede_deposito` (NEX-014) siguen el modelo anterior: reciben `p_empresa`/`p_usuario` del llamador. Un llamador con el rol `nexit_runtime` que conozca el UUID de un usuario con permiso `MOVIMIENTOS.*` podría invocarlas en su nombre. Además `usuario_tiene_permiso` y `usuario_puede_deposito` son ejecutables por el runtime y permiten **sondear** permisos/alcance de cualquier usuario. Posible tratamiento (requiere nueva autorización y migración): adoptar la misma credencial de sesión en esas funciones y retirar el EXECUTE directo de los helpers. Fuera del alcance de la NEX-020.

## Cómo aplicar (solo con autorización)
1. Respaldo de la base. Ejecutar antes, en modo lectura, la detección de duplicados (el propio archivo la hace y aborta; puede probarse en una copia).
2. `PGDATABASE=nexit scripts/aplicar-migraciones.sh --permitir-banco-real` (NEX-019 ya aplicada; el runner registra NEX-020 con checksum, en una transacción).
3. Verificación: `select proname from pg_proc where proname='catalogo_producto_guardar'`; 4 índices; `has_table_privilege('nexit_runtime','categorias_producto','INSERT')` = false; `has_function_privilege('nexit_runtime','catalogo_producto_guardar(uuid,uuid,text,uuid,text,text,boolean)','EXECUTE')` = true.
4. Desplegar la versión de la app que usa la función (`lib/productos/catalogos-admin.ts` + `getSessionCredentials()` en `lib/auth/session.ts`). Antes de aplicar la migración, Categorías/Marcas siguen sin poder escribirse con `nexit_runtime`.
- Reversión (si hiciera falta): `DROP FUNCTION catalogo_producto_guardar(...)`, `DROP INDEX` de los 4 índices y volver a ejecutar `nex_aplicar_grants_runtime()` de NEX-017 — solo con autorización.

## Pruebas
`pruebas/T14-catalogos-producto-escritura.sql` (incluida en `ejecutar-pruebas.sh`; 22 verificaciones, incluye intentos de representación) y la batería de la app (101 verificaciones con handlers reales y conexión real como `nexit_runtime`). Comparación de privilegios de `nexit_runtime` antes/después de NEX-020 (todas las tablas, columnas, funciones y secuencias): **única diferencia** = `EXECUTE` sobre `catalogo_producto_guardar(uuid,text,text,uuid,text,text,boolean)` (no PUBLIC).
