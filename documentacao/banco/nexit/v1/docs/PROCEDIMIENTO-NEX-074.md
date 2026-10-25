# Procedimiento NEX-074 — Usuarios, perfiles predefinidos y vendedor de la FE (PRO-93 / PRO-72 / PRO-307 / PRO-109 / PRO-293, recorte mínimo)

> **BLOQUEO — NO EJECUTAR AÚN.** Estado: versionada y **NO aplicada**. Ningún agente de IA la aplica. **NO usar el runner oficial** (`aplicar-migraciones.sh`) sin antes revisar la salida de `--solo-listar` y el estado real de `schema_migrations`:
> el runner aplica TODAS las migraciones pendientes en orden, y `NEX-072` (evidencia de envíos, no autorizada) y `NEX-073` (fecha de emisión, con su regla fiscal en revisión) también están versionadas y sin aplicar. Si `--solo-listar` incluye `NEX-072` o `NEX-073`
> sin autorización individual del responsable, **ABORTAR**. No se debe omitir un archivo, falsear `schema_migrations` ni evitar la verificación de checksums para "aplicar solo esta". Hasta que exista un plan humano de aplicación selectiva, la migración permanece solo en Git.

## Qué hace
- **Perfiles:** garantiza, para todas las empresas, los nueve perfiles comunes (`ADMIN` → rótulo «Administrador de empresa» y los códigos `GERENTE`, `VENDEDOR`, `FACTURADOR`, `CONTADOR`, `COMPRAS`, `INVENTARIO_DEPOSITOS`, `FINANZAS`, `CONSULTAS_INFORMES`). Los ocho nuevos se crean **sin permisos**: la matriz de permisos por perfil está pendiente de aprobación y lo no especificado queda denegado.
- **Usuarios (solo el administrador de empresa de ESA empresa; un administrador de plataforma no puede):** `usr_crear`, `usr_actualizar`, `usr_cambiar_estado` (bloquear/activar; revoca sesiones; no sobre sí mismo; protege al último administrador), `usr_asignar_perfiles` (solo del catálogo; revoca sesiones; protege al último administrador), `usr_perfiles_catalogo`. Contraseña inicial con bcrypt en la base; el usuario queda con `debe_cambiar_contrasena`. Todo en `eventos_seguridad`. **No se crea ninguna tabla `vendedores`.**
- **Vendedor de la FE:** tabla inmutable `documento_electronico_vendedor` (ID + nombre al emitir + emisor, separado del `creado_por`) y `fe_documento_crear_fe_vendedor` (14 parámetros), que envuelve la emisión de 13 parámetros y exige un usuario ACTIVO de la empresa con el perfil `VENDEDOR`. Repetir la clave con otro vendedor (o sin vendedor registrado) es conflicto de idempotencia. La aplicación pasa a emitir **solo** con esta función.

## Pendiente (no incluido, para decisión/orden del responsable)
Matriz de permisos por perfil; catálogo técnico de módulos contratados (RN-14); alcance por sucursal/depósito de cada usuario (los usuarios nuevos quedan con alcance «asignadas» y sin asignaciones); cambio forzado de contraseña en el login y restablecimiento de contraseña; alta de empresa/primer administrador por MASTER.

## Orden de ejecución (cuando exista plan aprobado)
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-074.sql` — sección 1 todo `ok = true`.
3. Aplicación según el plan humano aprobado (ver el bloqueo de arriba).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-074.sql` — todo `ok = true`.
5. Desplegar el código (**migración primero, código después**: sin NEX-074 la emisión de FE responde 422 explicando que falta la migración).

## Reversión
`scripts/reversion-NEX-074.sql` (una transacción): **se niega** si ya hay FE con vendedor registrado; si no, elimina funciones y tabla y devuelve a la aplicación el acceso a la emisión de 13 parámetros. No elimina los perfiles creados. Antes, desplegar la aplicación anterior; después borrar la fila `NEX-074` de `schema_migrations`.
