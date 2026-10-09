# Nexit V1 — preparación PROCEIT y CASA MINGO (NEX-016)

## Alcance implementado

* `proceit`: empresa real administradora; su usuario ADMIN puede ser habilitado explícitamente como administrador global.
* `casa_mingo`: empresa **cliente real separada**, no empresa DEMO efímera. No recibe permisos globales.
* La elevación de administración global no se infiere del código de empresa ni del perfil `ADMIN`; requiere una fila explícita en `administradores_plataforma`, escrita por operador de base de datos.
* `NEX-016` no modifica ni recrea empresas ni datos de NEX-001 a NEX-015.
* Las pantallas de inventario y el Dashboard todavía contienen mocks: esta fase no constituye puesta en producción.

## Paso 1. Instalar migration

Actualizar copia Git de los scripts; copiar los archivos de `documentacao/banco/nexit/v1/` al contenedor PostgreSQL sin borrar el volumen. Aplicar **solo con autorización**, mediante `aplicar-migraciones.sh --permitir-banco-real`. El runner omitirá NEX-001..015 ya instaladas por checksum.

Verificar `SELECT version FROM schema_migrations ORDER BY version;` y el resultado `NEX-016`.

## Paso 2. Inicializar empresas reales

Usar **dos veces** `scripts/inicializar-empresa.sh` desde entorno con `psql`, `PGUSER=nexit_app`, `PGDATABASE=nexit` y generador bcrypt instalado. Cada ejecución solicita la contraseña por terminal, sin dejarla en historial ni SQL.

PROCEIT: `--codigo proceit --razon-social '<razón social legal>' --ruc <raíz RUC> --dv <DV> --usuario <usuario> --nombre <nombre> --permitir-banco-real`.

CASA MINGO: `--codigo casa_mingo --razon-social '<razón social legal>' --ruc <raíz RUC> --dv <DV> --usuario <usuario cliente> --nombre <nombre> --permitir-banco-real`.

No se inventan números de RUC ni contraseñas. El código de empresa para acceso coincide con el parámetro de inicialización. Se crea el perfil ADMIN de **cada empresa**, pero eso no concede administración global.

## Paso 3. Habilitar administrador global PROCEIT

Después de inicializar ambas empresas, un **operador autorizado de PostgreSQL** ejecuta en una transacción:

```sql
BEGIN;
INSERT INTO administradores_plataforma (usuario_id, empresa_id)
SELECT u.id, e.id
FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
WHERE e.codigo = 'proceit' AND u.usuario = :'usuario_admin_proceit'
  AND u.estado = 'ACTIVO'
ON CONFLICT (usuario_id) DO UPDATE SET activo = true;
-- Confirmar exactamente 1 fila insertada/actualizada; si no, ROLLBACK.
COMMIT;
```

El trigger impide promover un usuario ajeno a PROCEIT y exige perfil ADMIN vigente. El operador debe pasar el nombre por parámetro de psql, no concatenar una entrada arbitraria.

Verificar que el cliente no sea global:

```sql
SELECT e.codigo, u.usuario, ap.activo
FROM administradores_plataforma ap
JOIN usuarios u ON u.id = ap.usuario_id
JOIN empresas e ON e.id = ap.empresa_id;
```

Resultado esperado: solo PROCEIT.

## Paso 4. Activar login PostgreSQL de verdad

Configurar `DEMO_MODE=false` en la aplicación desplegada, configurar conexión PostgreSQL con credenciales de runtime y redeplegar la imagen construida desde esta branch tras pruebas. La interfaz pide código de empresa: `proceit` o `casa_mingo`; **no** utiliza claves precargadas.

## Pendencias explícitas

No se creó aquí un CRUD de administración global ni un panel de gestión de empresas. No abrir acceso de clientes a pantallas sin aislamiento efectivo por empresa y comprobación de permisos en servidor. Las consultas, APIs de módulos y menús deben completarse y probarse antes de permitir uso real.
