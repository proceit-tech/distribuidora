-- REVERSIÓN manual de NEX-046 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-046.sql
-- ABORTA si deposito_usuario_eventos tiene filas (auditoría) y si algún perfil ya tiene asignado un permiso INVENTARIO.* (se perdería esa configuración sin aviso). No modifica depósitos ni
-- atribuciones (usuario_deposito) creados o editados con las funciones: sus datos se conservan. Después hay que borrar la fila 'NEX-046' de
-- schema_migrations.
DO $$
BEGIN
  IF to_regprocedure('public.deposito_crear(uuid,uuid,uuid,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'deposito_crear no existe: NEX-046 no está aplicada.';
  END IF;
  IF to_regclass('public.deposito_usuario_eventos') IS NOT NULL AND EXISTS (SELECT 1 FROM public.deposito_usuario_eventos) THEN
    RAISE EXCEPTION 'deposito_usuario_eventos tiene filas: exporte la auditoría de atribuciones antes de revertir (no se pierde en silencio).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.recurso = 'INVENTARIO') THEN
    RAISE EXCEPTION 'hay perfiles con permisos INVENTARIO.* asignados: retírelos desde la administración de perfiles antes de revertir.';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-045 (base + proveedores + fiscal + productos + comercial) y retira la función de depósitos.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_depositos();

DROP FUNCTION IF EXISTS public.deposito_usuario_revocar(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.deposito_usuario_asignar(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.deposito_cambiar_estado(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.deposito_editar(uuid, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.deposito_crear(uuid, uuid, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.deposito_en_alcance(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.sucursal_en_alcance(uuid, uuid, uuid);

DROP TRIGGER IF EXISTS deposito_usuario_eventos_inmutable_truncate_trg ON public.deposito_usuario_eventos;
DROP TRIGGER IF EXISTS deposito_usuario_eventos_inmutable_fila_trg ON public.deposito_usuario_eventos;
DROP FUNCTION IF EXISTS public.deposito_usuario_eventos_inmutable();
DROP TABLE IF EXISTS public.deposito_usuario_eventos;
DROP TRIGGER IF EXISTS movimientos_deposito_sucursal_trg ON public.movimientos_inventario;
DROP FUNCTION IF EXISTS public.movimientos_deposito_sucursal();
DROP TRIGGER IF EXISTS stock_saldos_deposito_activo_trg ON public.stock_saldos;
DROP FUNCTION IF EXISTS public.stock_saldos_deposito_activo();
DROP TRIGGER IF EXISTS depositos_codigo_inmutable_trg ON public.depositos;
DROP FUNCTION IF EXISTS public.depositos_codigo_inmutable();
DROP INDEX IF EXISTS public.depositos_empresa_codigo_ci_key;

DELETE FROM public.permisos WHERE codigo IN ('INVENTARIO.VER', 'INVENTARIO.CREAR', 'INVENTARIO.EDITAR');
