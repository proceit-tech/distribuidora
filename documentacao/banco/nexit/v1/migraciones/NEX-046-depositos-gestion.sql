-- =====================================================================
-- NEX-046 — Gestión de Depósitos (CRUD completo con atribuciones de usuarios): permisos INVENTARIO.*, funciones transaccionales de alta/edición/
-- estado y de atribución/revocación de usuarios, código inmutable y guarda contra saldo en depósitos inactivos.
-- Requiere NEX-002 (depositos, sucursales, usuarios, usuario_deposito, usuario_sucursal), NEX-009 (stock_saldos), NEX-014 (usuario_tiene_permiso,
-- usuario_puede_deposito) y el envoltorio de grants de NEX-037/039/041/045. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del
-- responsable (backup previo). Reversión: scripts/reversion-NEX-046.sql.
-- ESTADO: versionada y NO aplicada (no hay registro de ejecución en schema_migrations ni en PROGRESSO-NEXIT-V1.md); por eso se revisó en su lugar.
-- Si alguna vez se comprueba que ya se aplicó, esta migración NO se edita (su checksum quedaría distinto): se prepara una incremental.
--
-- Decisiones (autorizadas por el responsable):
--  · Alta, consulta, edición, inactivación y administración de los usuarios autorizados por depósito; SIN exclusión física. El rol de la aplicación
--    NO recibe INSERT/UPDATE/DELETE sobre depositos ni usuario_deposito: solo ejecuta las funciones SECURITY DEFINER de abajo, que validan permiso,
--    empresa y alcance dentro de la transacción.
--  · El código es inmutable tras la creación (trigger). Tampoco cambian empresa_id ni es_de_terceros (las funciones crean siempre es_de_terceros =
--    false: los depósitos de terceros no tienen alta desde esta pantalla porque su semántica no está decidida).
--  · Permisos específicos INVENTARIO.VER / CREAR / EDITAR (clase OPERACIONAL). NO se asignan a ningún perfil existente: el administrador de la
--    empresa los tiene por definición y los demás perfiles los reciben solo por decisión expresa del responsable. Atribuir/revocar usuarios exige
--    INVENTARIO.EDITAR y que el actor tenga el depósito en su propio alcance.
--  · ATRIBUCIONES: solo para usuarios de la empresa con alcance_depositos = 'ASIGNADOS' (los de alcance 'TODOS' ven todo y no dependen de un vínculo
--    individual: atribuirles no tendría efecto y se rechaza). No se modifica el alcance general de ningún usuario. El usuario debe tener la sucursal
--    del depósito en su propio alcance de sucursales (alcance_sucursales = 'TODAS' o usuario_sucursal); si no, se rechaza (no se altera su sucursal).
--    Revocar solo borra el vínculo (usuario_deposito): el historial de movimientos y saldos no se toca.
--  · Creación: la autoatribución del creador (si tiene alcance 'ASIGNADOS') es EXPLÍCITA: parámetro p_asignar_creador, que la pantalla ofrece
--    marcado. Sin él, el creador con 'ASIGNADOS' no vería el depósito que acaba de crear.
--  · Inactivar: permitido aunque el depósito tenga historial (los vínculos de usuarios se conservan y el historial sigue legible; Stock e historial
--    de Movimientos incluyen depósitos inactivos del alcance). BLOQUEADO si aún tiene saldo (cualquier estado, propio o de terceros): operar exige
--    depósito activo (usuario_puede_deposito), así que inactivarlo con saldo dejaría ese stock sin poder moverse ni anular sus movimientos.
--    SIN CARRERA: la inactivación bloquea la fila del depósito (FOR UPDATE) y un trigger en stock_saldos toma FOR SHARE sobre esa fila antes de crear
--    o aumentar un saldo y rechaza el depósito inactivo. Un movimiento concurrente o espera a la inactivación (y falla al ver el depósito inactivo)
--    o la inactivación espera a que ese movimiento confirme (y entonces ve el saldo y se rechaza). No se modifica ninguna función de inventario.
--  · SUCURSAL IMUTABLE TRAS EL PRIMER MOVIMIENTO (decisión aprobada): se rechaza cambiar sucursal_id si existe CUALQUIER movimiento del depósito
--    (incluidos anulados y aperturas), por la función Y por trigger (también ante SQL directo). Mientras nunca se movió, el cambio exige además
--    sucursal activa y en el alcance, y que los usuarios atribuidos la tengan en su alcance (si no, antes hay que revocarlos). Sin carrera: un trigger
--    en movimientos_inventario toma FOR SHARE sobre el depósito y fija la sucursal vigente en el movimiento, de modo que no puede nacer el primer
--    movimiento con una sucursal vieja mientras se cambia. Los movimientos históricos y los saldos no se reclasifican. Cambiar solo el nombre es libre.
--  · AUDITORÍA PERSISTENTE Y TRANSACCIONAL de toda atribución y revocación EFECTIVA: tabla de solo altas deposito_usuario_eventos (empresa, depósito,
--    usuario afectado, actor, evento ATRIBUIR/REVOCAR, origen MANUAL/CREACION y fecha del servidor; solo identificadores, sin datos sensibles). La
--    escribe únicamente la misma función que cambia el vínculo, en la misma transacción, y solo si el vínculo realmente cambió (ROW_COUNT): los
--    intentos repetidos o rechazados no dejan evento. Incluye la atribución inicial del creador (origen CREACION). Sin UPDATE/DELETE/TRUNCATE; el
--    DELETE solo se admite durante el reinicio de una empresa DEMO (nex_reinicio_demo_activo). Sobrevive a revocaciones, inactivaciones y cambios de
--    perfil. El rol de la aplicación solo tiene SELECT.
--  · Unicidad de código sin distinguir mayúsculas dentro de la empresa; si ya hubiera códigos que solo difieren en mayúsculas la migración ABORTA
--    sin cambiar nada. La unicidad de nombre NO está decidida y no se impone.
--  · No se agrega DELETE ni trigger de borrado: NEX-012 elimina depósitos al depurar una empresa DEMO; el rol de la aplicación no tiene DELETE y las
--    claves foráneas de movimientos/saldos impiden borrar un depósito con historial.
-- No modifica ninguna fila existente. No toca saldos, costos ni las funciones de inventario.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.depositos') IS NULL OR to_regclass('public.sucursales') IS NULL OR to_regclass('public.usuario_deposito') IS NULL
     OR to_regclass('public.usuario_sucursal') IS NULL OR to_regclass('public.stock_saldos') IS NULL OR to_regclass('public.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION 'NEX-046 requiere NEX-002 (depositos, sucursales, usuario_deposito, usuario_sucursal) y NEX-009/NEX-014 (stock_saldos, movimientos_inventario).';
  END IF;
  IF to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-046 requiere NEX-012 (nex_reinicio_demo_activo).';
  END IF;
  IF to_regclass('public.deposito_usuario_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'deposito_usuario_eventos ya existe: NEX-046 parece aplicada; no se reaplica por suposición.';
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
  IF to_regprocedure('public.deposito_crear(uuid,uuid,uuid,text,text,boolean)') IS NOT NULL THEN
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
  IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     AND EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = OLD.empresa_id AND (m.deposito_origen_id = OLD.id OR m.deposito_destino_id = OLD.id)) THEN
    RAISE EXCEPTION 'el depósito % ya tiene movimientos: su sucursal es inmutable', OLD.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_SUCURSAL_CON_MOVIMIENTOS';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER depositos_codigo_inmutable_trg BEFORE UPDATE ON public.depositos
  FOR EACH ROW EXECUTE FUNCTION public.depositos_codigo_inmutable();

-- 2b) Guarda contra saldo en un depósito inactivo (cierra la carrera entre inactivar y operar). Solo cuando una fila de saldo se crea con cantidad > 0 o
--     su cantidad AUMENTA (las salidas y las puestas en cero no se bloquean). FOR SHARE sobre la fila del depósito conflicta con el FOR UPDATE de deposito_cambiar_estado.
CREATE OR REPLACE FUNCTION public.stock_saldos_deposito_activo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_activo boolean;
BEGIN
  IF NEW.cantidad > 0 AND (TG_OP = 'INSERT' OR NEW.cantidad > OLD.cantidad) THEN
    SELECT activo INTO v_activo FROM public.depositos WHERE empresa_id = NEW.empresa_id AND id = NEW.deposito_id FOR SHARE;
    IF v_activo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'el depósito está inactivo: no admite saldo' USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_INACTIVO';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stock_saldos_deposito_activo_trg BEFORE INSERT OR UPDATE ON public.stock_saldos
  FOR EACH ROW EXECUTE FUNCTION public.stock_saldos_deposito_activo();

-- 2c) Sin carrera entre el primer movimiento y un cambio de sucursal: el movimiento toma FOR SHARE sobre el/los depósito(s) (conflicta con el FOR UPDATE de
--     deposito_editar) y adopta la sucursal vigente del depósito. En el flujo normal el valor es idéntico al que ya calculó la función de inventario.
CREATE OR REPLACE FUNCTION public.movimientos_deposito_sucursal() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_suc uuid;
BEGIN
  IF NEW.deposito_origen_id IS NULL AND NEW.deposito_destino_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.depositos WHERE empresa_id = NEW.empresa_id AND id IN (NEW.deposito_origen_id, NEW.deposito_destino_id) ORDER BY id FOR SHARE;
  SELECT sucursal_id INTO v_suc FROM public.depositos WHERE empresa_id = NEW.empresa_id AND id = COALESCE(NEW.deposito_origen_id, NEW.deposito_destino_id);
  IF v_suc IS NOT NULL THEN
    NEW.sucursal_id := v_suc;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER movimientos_deposito_sucursal_trg BEFORE INSERT ON public.movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION public.movimientos_deposito_sucursal();

-- 2d) Auditoría de atribuciones (solo altas). Sin datos sensibles: solo identificadores.
CREATE TABLE public.deposito_usuario_eventos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  deposito_id  uuid        NOT NULL,
  usuario_id   uuid        NOT NULL,
  actor_id     uuid        NOT NULL,
  evento       text        NOT NULL CHECK (evento IN ('ATRIBUIR','REVOCAR')),
  origen       text        NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL','CREACION')),
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposito_usuario_eventos_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES public.depositos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT deposito_usuario_eventos_usuario_fk  FOREIGN KEY (empresa_id, usuario_id)  REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT deposito_usuario_eventos_actor_fk    FOREIGN KEY (empresa_id, actor_id)    REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT deposito_usuario_eventos_origen_chk  CHECK (origen = 'MANUAL' OR evento = 'ATRIBUIR')
);

CREATE INDEX deposito_usuario_eventos_deposito_idx ON public.deposito_usuario_eventos (empresa_id, deposito_id, creado_at DESC);
CREATE INDEX deposito_usuario_eventos_usuario_idx  ON public.deposito_usuario_eventos (empresa_id, usuario_id, creado_at DESC);

COMMENT ON TABLE public.deposito_usuario_eventos IS 'Auditoría (solo altas) de las atribuciones y revocaciones efectivas de usuarios a depósitos: quién, a quién, en qué depósito, evento y fecha del servidor.';

CREATE OR REPLACE FUNCTION public.deposito_usuario_eventos_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'deposito_usuario_eventos es de solo altas: no se vacía.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'deposito_usuario_eventos es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  -- DELETE: solo durante el reinicio/eliminación de una empresa DEMO (cascada), nunca en operación normal.
  IF NOT public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    RAISE EXCEPTION 'deposito_usuario_eventos es de solo altas: no se elimina.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER deposito_usuario_eventos_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.deposito_usuario_eventos
  FOR EACH ROW EXECUTE FUNCTION public.deposito_usuario_eventos_inmutable();
CREATE TRIGGER deposito_usuario_eventos_inmutable_truncate_trg BEFORE TRUNCATE ON public.deposito_usuario_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.deposito_usuario_eventos_inmutable();

-- 3) Alcance. Funciones auxiliares (solo lectura).
CREATE OR REPLACE FUNCTION public.sucursal_en_alcance(p_empresa uuid, p_usuario uuid, p_sucursal uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.sucursales s ON s.empresa_id = u.empresa_id AND s.id = p_sucursal
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario
       AND (u.alcance_sucursales = 'TODAS'
            OR EXISTS (SELECT 1 FROM public.usuario_sucursal us WHERE us.empresa_id = u.empresa_id AND us.usuario_id = u.id AND us.sucursal_id = p_sucursal)))
$$;

-- Alcance para gestionar: el mismo que Stock e historial (alcance TODOS o depósitos asignados, activos o no).
CREATE OR REPLACE FUNCTION public.deposito_en_alcance(p_empresa uuid, p_usuario uuid, p_deposito uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.depositos d ON d.empresa_id = u.empresa_id AND d.id = p_deposito
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario
       AND (u.alcance_depositos = 'TODOS'
            OR EXISTS (SELECT 1 FROM public.usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = p_deposito)))
$$;

-- 4) Funciones transaccionales. El permiso, la empresa y el alcance se validan aquí, además de la API.
CREATE OR REPLACE FUNCTION public.deposito_crear(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text, p_asignar_creador boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
  v_n integer;
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

  -- Autoatribución EXPLÍCITA del creador (solo si su alcance es 'ASIGNADOS'; con 'TODOS' ya lo ve todo). No cambia su alcance general.
  IF coalesce(p_asignar_creador, false) THEN
    INSERT INTO public.usuario_deposito (empresa_id, usuario_id, deposito_id, asignado_por)
    SELECT u.empresa_id, u.id, v_id, u.id FROM public.usuarios u
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.alcance_depositos = 'ASIGNADOS'
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    -- Atribución inicial auditada (misma transacción), solo si el vínculo se creó realmente.
    IF v_n = 1 THEN
      INSERT INTO public.deposito_usuario_eventos (empresa_id, deposito_id, usuario_id, actor_id, evento, origen)
      VALUES (p_empresa, v_id, p_usuario, p_usuario, 'ATRIBUIR', 'CREACION');
    END IF;
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.deposito_editar(p_empresa uuid, p_usuario uuid, p_deposito uuid, p_nombre text, p_sucursal uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_suc_actual uuid;
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

  -- La fila del depósito se bloquea: serializa con atribuciones, inactivación y movimientos que toman FOR SHARE.
  SELECT sucursal_id INTO v_suc_actual FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;

  IF p_sucursal IS DISTINCT FROM v_suc_actual THEN
    IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo)
       OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
      RAISE EXCEPTION 'la sucursal no existe en la empresa, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE empresa_id = p_empresa AND (deposito_origen_id = p_deposito OR deposito_destino_id = p_deposito)) THEN
      RAISE EXCEPTION 'el depósito ya tiene movimientos: su sucursal no se puede cambiar (el historial y los informes por sucursal quedarían divididos); solo puede cambiar el nombre'
        USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_SUCURSAL_CON_MOVIMIENTOS';
    END IF;
    IF EXISTS (SELECT 1 FROM public.usuario_deposito ud WHERE ud.empresa_id = p_empresa AND ud.deposito_id = p_deposito
                  AND NOT public.sucursal_en_alcance(p_empresa, ud.usuario_id, p_sucursal)) THEN
      RAISE EXCEPTION 'hay usuarios atribuidos al depósito que no tienen la nueva sucursal en su alcance: revoque primero su atribución'
        USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_SUCURSAL_USUARIOS';
    END IF;
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

  -- Bloqueo de la fila ANTES de mirar el saldo: ver stock_saldos_deposito_activo (sin carrera con movimientos concurrentes).
  SELECT activo INTO v_actual FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;
  IF v_actual = p_activo THEN
    RETURN;
  END IF;

  IF NOT p_activo AND EXISTS (SELECT 1 FROM public.stock_saldos WHERE empresa_id = p_empresa AND deposito_id = p_deposito AND cantidad <> 0) THEN
    RAISE EXCEPTION 'el depósito aún tiene saldo: trasládelo o regularícelo con Movimientos antes de inactivarlo (un depósito inactivo no permite operar su stock)'
      USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_CON_SALDO';
  END IF;

  -- Solo cambia el estado: los vínculos de usuarios, el historial y los saldos en cero se conservan.
  UPDATE public.depositos SET activo = p_activo, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_deposito;
END $$;

-- 5) Atribución de usuarios (solo alcance 'ASIGNADOS'; no se toca el alcance general ni el perfil del usuario).
CREATE OR REPLACE FUNCTION public.deposito_usuario_asignar(p_empresa uuid, p_actor uuid, p_deposito uuid, p_usuario uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_suc uuid;
  v_alcance text;
  v_estado text;
  v_n integer;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_actor, 'INVENTARIO', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso INVENTARIO.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.deposito_en_alcance(p_empresa, p_actor, p_deposito) THEN
    RAISE EXCEPTION 'el depósito no existe o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_NO_ENCONTRADO';
  END IF;

  SELECT sucursal_id INTO v_suc FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;
  SELECT alcance_depositos, estado INTO v_alcance, v_estado FROM public.usuarios WHERE empresa_id = p_empresa AND id = p_usuario;

  IF v_alcance IS NULL OR v_estado = 'BAJA' THEN
    RAISE EXCEPTION 'el usuario no existe en la empresa o está dado de baja' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_NO_ENCONTRADO';
  END IF;
  IF v_alcance <> 'ASIGNADOS' THEN
    RAISE EXCEPTION 'el usuario tiene acceso a todos los depósitos: no depende de una atribución individual' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_ALCANCE_TODOS';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_suc) THEN
    RAISE EXCEPTION 'la sucursal del depósito no está en el alcance de sucursales del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_SUCURSAL_FUERA';
  END IF;

  INSERT INTO public.usuario_deposito (empresa_id, usuario_id, deposito_id, asignado_por)
  VALUES (p_empresa, p_usuario, p_deposito, p_actor)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Auditoría atómica y solo de la operación efectiva: una repetición (el vínculo ya existía) no deja evento.
  IF v_n = 1 THEN
    INSERT INTO public.deposito_usuario_eventos (empresa_id, deposito_id, usuario_id, actor_id, evento, origen)
    VALUES (p_empresa, p_deposito, p_usuario, p_actor, 'ATRIBUIR', 'MANUAL');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.deposito_usuario_revocar(p_empresa uuid, p_actor uuid, p_deposito uuid, p_usuario uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_actor, 'INVENTARIO', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso INVENTARIO.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.deposito_en_alcance(p_empresa, p_actor, p_deposito) THEN
    RAISE EXCEPTION 'el depósito no existe o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:DEPOSITO_NO_ENCONTRADO';
  END IF;

  PERFORM 1 FROM public.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;
  -- Solo se borra el vínculo (idempotente): movimientos, saldos y costos no se tocan.
  DELETE FROM public.usuario_deposito WHERE empresa_id = p_empresa AND deposito_id = p_deposito AND usuario_id = p_usuario;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Auditoría atómica y solo si había un vínculo que revocar (DELETE sin vínculo no deja evento).
  IF v_n = 1 THEN
    INSERT INTO public.deposito_usuario_eventos (empresa_id, deposito_id, usuario_id, actor_id, evento, origen)
    VALUES (p_empresa, p_deposito, p_usuario, p_actor, 'REVOCAR', 'MANUAL');
  END IF;
END $$;

-- 6) Privilegios del rol de la aplicación: solo ejecutar las funciones (sin escritura directa sobre depositos ni usuario_deposito).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_depositos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.deposito_crear(uuid, uuid, uuid, text, text, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_editar(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_cambiar_estado(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_usuario_asignar(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.deposito_usuario_revocar(uuid, uuid, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.deposito_crear(uuid, uuid, uuid, text, text, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_editar(uuid, uuid, uuid, text, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_cambiar_estado(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_usuario_asignar(uuid, uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.deposito_usuario_revocar(uuid, uuid, uuid, uuid) TO nexit_runtime;
  -- Auditoría: el rol de la aplicación solo la lee; la escriben únicamente las funciones SECURITY DEFINER de arriba.
  REVOKE ALL ON public.deposito_usuario_eventos FROM nexit_runtime;
  GRANT SELECT ON public.deposito_usuario_eventos TO nexit_runtime;
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
