-- =====================================================================
-- NEX-046 — Gestión de Depósitos: permisos INVENTARIO.*, funciones transaccionales de alta/edición/estado y código inmutable.
-- Requiere NEX-002 (depositos, sucursales, usuario_deposito), NEX-014 (usuario_tiene_permiso, usuario_puede_deposito) y el envoltorio de grants
-- de NEX-037/039/041/045. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-046.sql.
--
-- Decisiones (autorizadas por el responsable):
--  · Alta, consulta, edición e inactivación; SIN exclusión física. El rol de la aplicación NO recibe INSERT/UPDATE/DELETE sobre depositos: solo
--    ejecuta las tres funciones SECURITY DEFINER de abajo, que validan permiso, empresa y alcance dentro de la transacción.
--  · El código es inmutable tras la creación (trigger). Tampoco cambian empresa_id ni es_de_terceros (las funciones crean siempre es_de_terceros =
--    false: los depósitos de terceros no tienen alta desde esta pantalla porque su semántica no está decidida).
--  · Permisos específicos INVENTARIO.VER / CREAR / EDITAR (clase OPERACIONAL). Esta migración NO los asigna a ningún perfil existente: el
--    administrador de la empresa los tiene por definición y los demás perfiles los reciben solo por decisión expresa del responsable.
--  · La sucursal debe estar en el alcance del usuario (alcance_sucursales = 'TODAS' o sucursales asignadas en usuario_sucursal) y activa.
--  · Quien crea un depósito y tiene alcance 'ASIGNADOS' queda asignado a él (si no, no podría verlo ni operarlo). El alcance de los demás usuarios
--    no se modifica.
--  · Inactivar: permitido aunque el depósito tenga historial (el historial sigue legible; Stock e historial de Movimientos incluyen depósitos
--    inactivos del alcance). BLOQUEADO si el depósito aún tiene saldo (cualquier estado, propio o de terceros): operar exige depósito activo
--    (usuario_puede_deposito), de modo que inactivarlo con saldo dejaría ese stock sin poder moverse ni anular sus movimientos.
--  · Unicidad de código sin distinguir mayúsculas dentro de la empresa; si ya hubiera códigos que solo difieren en mayúsculas la migración ABORTA
--    sin cambiar nada. La unicidad de nombre NO está decidida y no se impone.
--  · No se agrega DELETE ni trigger de borrado: NEX-012 elimina depósitos al depurar una empresa DEMO; el rol de la aplicación simplemente no tiene
--    DELETE y las claves foráneas de movimientos/saldos impiden borrar un depósito con historial.
-- No modifica ninguna fila existente. No toca saldos, costos ni las funciones de inventario.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.depositos') IS NULL OR to_regclass('public.sucursales') IS NULL OR to_regclass('public.usuario_deposito') IS NULL THEN
    RAISE EXCEPTION 'NEX-046 requiere NEX-002 (depositos, sucursales, usuario_deposito).';
  END IF;
  IF to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL OR to_regprocedure('public.usuario_puede_deposito(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-046 requiere NEX-014 (usuario_tiene_permiso, usuario_puede_deposito).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_proveedores()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_fiscal()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_productos()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_comercial()') IS NULL THEN
    RAISE EXCEPTION 'NEX-046 requiere NEX-037, NEX-039, NEX-041 y NEX-045 (envoltorio de grants del runtime).';
  END IF;
  IF to_regprocedure('public.deposito_crear(uuid,uuid,uuid,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'deposito_crear ya existe: NEX-046 parece aplicada; no se reaplica por suposición.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.depositos GROUP BY empresa_id, lower(codigo) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'depositos tiene códigos duplicados que solo difieren en mayúsculas dentro de una empresa: depúrelos manualmente antes de aplicar NEX-046 (no se modifican datos).';
  END IF;
END $$;

-- 1) Permisos (sin asignarlos a perfiles).
INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
SELECT r || '.' || a, r, a, 'inventario', 'EMPRESA', 'OPERACIONAL'
  FROM (VALUES ('INVENTARIO','VER'), ('INVENTARIO','CREAR'), ('INVENTARIO','EDITAR')) t(r, a)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Unicidad del código sin distinguir mayúsculas y código/empresa/tipo inmutables.
CREATE UNIQUE INDEX depositos_empresa_codigo_ci_key ON public.depositos (empresa_id, lower(codigo));

CREATE OR REPLACE FUNCTION public.depositos_codigo_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'el código del depósito % es inmutable', OLD.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_CODIGO_INMUTABLE';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.es_de_terceros IS DISTINCT FROM OLD.es_de_terceros THEN
    RAISE EXCEPTION 'la empresa y el tipo (propio / de terceros) del depósito % no se modifican', OLD.codigo USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER depositos_codigo_inmutable_trg BEFORE UPDATE ON public.depositos
  FOR EACH ROW EXECUTE FUNCTION public.depositos_codigo_inmutable();

-- 3) Funciones transaccionales. El permiso, la empresa y el alcance se validan aquí, además de la API.
CREATE OR REPLACE FUNCTION public.sucursal_en_alcance(p_empresa uuid, p_usuario uuid, p_sucursal uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.sucursales s ON s.empresa_id = u.empresa_id AND s.id = p_sucursal
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario
       AND (u.alcance_sucursales = 'TODAS'
            OR EXISTS (SELECT 1 FROM public.usuario_sucursal us WHERE us.empresa_id = u.empresa_id AND us.usuario_id = u.id AND us.sucursal_id = p_sucursal)))
$$;

CREATE OR REPLACE FUNCTION public.deposito_crear(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'INVENTARIO', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso INVENTARIO.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF v_codigo !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$' THEN
    RAISE EXCEPTION 'el código debe tener de 1 a 30 caracteres: letras, números, punto, guion o guion bajo, sin espacios' USING ERRCODE = 'P0001';
  END IF;
  IF v_nombre = '' OR char_length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'el nombre es obligatorio (máximo 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo)
     OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe en la empresa, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.depositos WHERE empresa_id = p_empresa AND lower(codigo) = lower(v_codigo)) THEN
    RAISE EXCEPTION 'ya existe un depósito con el código %', v_codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_CODIGO_DUPLICADO';
  END IF;

  INSERT INTO public.depositos (empresa_id, sucursal_id, codigo, nombre, es_de_terceros, activo)
  VALUES (p_empresa, p_sucursal, v_codigo, v_nombre, false, true)
  RETURNING id INTO v_id;

  -- Quien lo crea con alcance 'ASIGNADOS' queda asignado (sin esto no podría verlo ni operarlo). Los demás usuarios no cambian.
  INSERT INTO public.usuario_deposito (empresa_id, usuario_id, deposito_id, asignado_por)
  SELECT u.empresa_id, u.id, v_id, u.id FROM public.usuarios u
   WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.alcance_depositos = 'ASIGNADOS';

  RETURN v_id;
END $$;

-- Alcance para gestionar: el mismo que Stock e historial (alcance TODOS o depósitos asignados, activos o no).
CREATE OR REPLACE FUNCTION public.deposito_en_alcance(p_empresa uuid, p_usuario uuid, p_deposito uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.depositos d ON d.empresa_id = u.empresa_id AND d.id = p_deposito
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario
       AND (u.alcance_depositos = 'TODOS'
            OR EXISTS (SELECT 1 FROM public.usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = p_deposito)))
$$;

CREATE OR REPLACE FUNCTION public.deposito_editar(p_empresa uuid, p_usuario uuid, p_deposito uuid, p_nombre text, p_sucursal uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'INVENTARIO', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso INVENTARIO.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.deposito_en_alcance(p_empresa, p_usuario, p_deposito) THEN
    RAISE EXCEPTION 'el depósito no existe o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_NO_ENCONTRADO';
  END IF;
  IF v_nombre = '' OR char_length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'el nombre es obligatorio (máximo 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  -- Si la sucursal no cambia se conserva aunque esté inactiva o fuera del alcance; si cambia, debe estar activa y en el alcance.
  IF p_sucursal IS DISTINCT FROM (SELECT sucursal_id FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito)
     AND (NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo)
          OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal)) THEN
    RAISE EXCEPTION 'la sucursal no existe en la empresa, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.depositos SET nombre = v_nombre, sucursal_id = p_sucursal, actualizado_at = now()
   WHERE empresa_id = p_empresa AND id = p_deposito;
END $$;

CREATE OR REPLACE FUNCTION public.deposito_cambiar_estado(p_empresa uuid, p_usuario uuid, p_deposito uuid, p_activo boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actual boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'INVENTARIO', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso INVENTARIO.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'indique el estado del depósito' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.deposito_en_alcance(p_empresa, p_usuario, p_deposito) THEN
    RAISE EXCEPTION 'el depósito no existe o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_NO_ENCONTRADO';
  END IF;

  SELECT activo INTO v_actual FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;
  IF v_actual = p_activo THEN
    RETURN;
  END IF;

  IF NOT p_activo AND EXISTS (SELECT 1 FROM public.stock_saldos WHERE empresa_id = p_empresa AND deposito_id = p_deposito AND cantidad <> 0) THEN
    RAISE EXCEPTION 'el depósito aún tiene saldo: trasládelo o regularícelo con Movimientos antes de inactivarlo (un depósito inactivo no permite operar su stock)'
      USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_CON_SALDO';
  END IF;

  UPDATE public.depositos SET activo = p_activo, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_deposito;
END $$;

-- 4) Privilegios del rol de la aplicación: solo ejecutar las funciones (sin escritura directa sobre depositos).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_depositos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.deposito_crear(uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_editar(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_cambiar_estado(uuid, uuid, uuid, boolean) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.deposito_crear(uuid, uuid, uuid, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_editar(uuid, uuid, uuid, text, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_cambiar_estado(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_en_alcance(uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.sucursal_en_alcance(uuid, uuid, uuid) TO nexit_runtime;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
  PERFORM public.nex_aplicar_grants_depositos();
END $$;

SELECT public.nex_aplicar_grants_depositos();
