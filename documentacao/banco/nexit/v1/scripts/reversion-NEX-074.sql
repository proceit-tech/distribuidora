-- REVERSIÓN de NEX-074. UNA transacción. SE NIEGA si ya hay FE con vendedor registrado (la tabla es evidencia inmutable). No elimina los perfiles del catálogo creados (pueden estar asignados) ni restaura el rótulo
-- anterior de ADMIN. ANTES: desplegar la aplicación anterior (la actual emite con fe_documento_crear_fe_vendedor). DESPUÉS: borrar la fila NEX-074 de schema_migrations.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.documento_electronico_vendedor') IS NOT NULL AND EXISTS (SELECT 1 FROM public.documento_electronico_vendedor) THEN
    RAISE EXCEPTION 'REVERSIÓN NEGADA: hay facturas con vendedor registrado (documento_electronico_vendedor es evidencia inmutable).';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fe_documento_crear_fe_vendedor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid);
DROP TABLE IF EXISTS public.documento_electronico_vendedor;
DROP FUNCTION IF EXISTS public.fe_vendedor_inmutable();
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_vendedor();

DROP FUNCTION IF EXISTS public.usr_crear(uuid, uuid, text, text, text, text, text, text, text, text[]);
DROP FUNCTION IF EXISTS public.usr_actualizar(uuid, uuid, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.usr_cambiar_estado(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.usr_asignar_perfiles(uuid, uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.usr_perfiles_catalogo(uuid, uuid);
DROP FUNCTION IF EXISTS public.usr_cambiar_contrasena_propia(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.usr_asignar_alcance(uuid, uuid, uuid, uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.usr_serializar_admins(uuid, uuid);
DROP FUNCTION IF EXISTS public.usr_aplicar_perfiles(uuid, uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.usr_exigir_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.usr_exigir_datos(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.usr_normalizar_ci(text);
DROP FUNCTION IF EXISTS public.usr_normalizar_telefono(text);
DROP FUNCTION IF EXISTS public.usr_otros_admins(uuid, uuid);
DROP FUNCTION IF EXISTS public.usr_codigos_catalogo();
DROP FUNCTION IF EXISTS public.usuario_es_vendedor_activo(uuid, uuid);
DROP FUNCTION IF EXISTS public.usuario_es_admin_empresa(uuid, uuid);
DROP FUNCTION IF EXISTS public.nex_asegurar_perfiles_estandar(uuid);
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_usuarios_vendedores();

-- Devuelve a la aplicación el acceso de NEX-068 a la emisión de 13 parámetros.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid) TO nexit_runtime;
  END IF;
END $$;

-- Columnas CI/teléfono: se eliminan SOLO si ningún usuario las ha llenado (son datos personales cargados por los administradores; no se destruyen). Si hay datos, se conservan y la reversión continúa sin tocarlas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE ci IS NOT NULL OR telefono IS NOT NULL) THEN
    DROP INDEX IF EXISTS public.usuarios_empresa_ci_key;
    ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_ci_chk, DROP CONSTRAINT IF EXISTS usuarios_telefono_chk, DROP COLUMN IF EXISTS ci, DROP COLUMN IF EXISTS telefono;
  ELSE
    RAISE NOTICE 'Se conservan usuarios.ci / usuarios.telefono: ya contienen datos cargados.';
  END IF;
END $$;

COMMIT;
