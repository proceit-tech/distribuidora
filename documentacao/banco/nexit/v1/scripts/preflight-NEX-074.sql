-- PRE-VERIFICACIÓN de NEX-074 (usuarios, perfiles predefinidos y vendedor de la FE). SOLO LECTURA. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-074.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'seguridad base (usuarios, perfiles, usuario_perfil, sesiones_usuario, eventos_seguridad)' AS control,
       to_regclass('public.usuarios') IS NOT NULL AND to_regclass('public.perfiles') IS NOT NULL AND to_regclass('public.usuario_perfil') IS NOT NULL
       AND to_regclass('public.sesiones_usuario') IS NOT NULL AND to_regclass('public.eventos_seguridad') IS NOT NULL AS ok
UNION ALL SELECT 'administradores_plataforma (NEX-016)', to_regclass('public.administradores_plataforma') IS NOT NULL
UNION ALL SELECT 'emisión con stock y entrega de 13 parámetros (NEX-067/068)', to_regprocedure('public.fe_documento_crear_fe_con_stock_entrega(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid)') IS NOT NULL
UNION ALL SELECT 'nex_reinicio_demo_activo(uuid)', to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
UNION ALL SELECT 'pgcrypto (crypt / gen_salt)', to_regprocedure('crypt(text,text)') IS NOT NULL AND to_regprocedure('gen_salt(text,integer)') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'usuarios SIN columnas ci/telefono (NEX-074 las agrega)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('ci', 'telefono'))
UNION ALL SELECT 'NEX-074 ausente (no se reaplica)', to_regclass('public.documento_electronico_vendedor') IS NULL AND to_regprocedure('public.usr_crear(uuid,uuid,text,text,text,text,text,text,text,text[])') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-067', 'NEX-068', 'NEX-072', 'NEX-073', 'NEX-074') ORDER BY version;

\echo '== 2b. Conciliación de legado (TODAS las filas deben dar ok = true; si no, NO APLICAR: NEX-074 rechazaría la empresa) =='
SELECT 'ninguna empresa con perfil ADMIN que no sea administrador' AS control, NOT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.codigo = 'ADMIN' AND NOT p.es_administrador) AS ok
UNION ALL SELECT 'ninguna empresa con perfil PROPIO (no del sistema) cuyo código coincida con los ocho nuevos',
       NOT EXISTS (SELECT 1 FROM public.perfiles p WHERE NOT p.es_sistema AND p.codigo IN ('GERENTE','VENDEDOR','FACTURADOR','CONTADOR','COMPRAS','INVENTARIO_DEPOSITOS','FINANZAS','CONSULTAS_INFORMES'));

\echo '== 2c. Informativo: empresas sin perfil ADMIN (NEX-074 lo crea SIN asignarlo a nadie) y empresas sin administrador activo =='
SELECT e.codigo AS empresa,
       EXISTS (SELECT 1 FROM public.perfiles p WHERE p.empresa_id = e.id AND p.codigo = 'ADMIN') AS tiene_perfil_admin,
       (SELECT count(DISTINCT u.id) FROM public.usuarios u JOIN public.usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
          JOIN public.perfiles p ON p.empresa_id = up.empresa_id AND p.id = up.perfil_id AND p.activo AND p.es_administrador WHERE u.empresa_id = e.id AND u.estado = 'ACTIVO') AS administradores_activos
  FROM public.empresas e ORDER BY e.codigo;

\echo '== 2d. Informativo: usuarios con contraseña provisional pendiente (debe_cambiar_contrasena) =='
SELECT count(*) AS pendientes FROM public.usuarios WHERE debe_cambiar_contrasena;

\echo '== 2e. Informativo: usuarios existentes (quedan con ci y telefono NULL; el administrador los completa al editarlos) =='
SELECT count(*) AS usuarios_historicos FROM public.usuarios;

\echo '== 3. Informativo: perfiles por empresa (los nueve del catálogo se crean sin permisos) =='
SELECT e.codigo AS empresa, string_agg(p.codigo, ', ' ORDER BY p.codigo) AS perfiles FROM public.empresas e LEFT JOIN public.perfiles p ON p.empresa_id = e.id GROUP BY e.codigo ORDER BY e.codigo;

ROLLBACK;
