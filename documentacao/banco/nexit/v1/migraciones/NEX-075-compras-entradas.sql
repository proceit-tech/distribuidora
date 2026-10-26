-- =====================================================================
-- NEX-075 — Compras → Entradas (E6-A / PRO-325): entrada de mercadería con proveedor, registrada por el motor oficial de inventario en UNA sola transacción, con intención DURABLE.
-- Norma: documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md. Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-E6-A-COMPRAS-ENTRADAS-2026-10-26.md.
-- Qué agrega (incremental, NO modifica NEX-001…074 ni el motor NEX-014):
--  · compras_entradas: metadatos 1:1 de la entrada (proveedor + snapshot código —opcional, NULL si el proveedor no tiene— / nombre / documento, fecha operativa, referencia libre, usuario) ligados por FK compuesta (empresa) al ÚNICO movimiento
--    ENTRADA/COMPRA (movimiento_id UNIQUE). No guarda stock, cantidades ni costos: las líneas y costos reales viven en movimiento_lineas (motor). Es la fuente EXCLUSIVA de la futura E6-B; un movimiento
--    COMPRA manual anterior NO tiene fila aquí y nunca se clasifica como entrada de Compras. Inmutable (solo el reinicio DEMO borra).
--  · compras_entradas_intenciones: protocolo durable EQUIVALENTE a NEX-066 (mismos estados RESERVADA / CONFIRMADA / RECHAZADA_DEFINITIVA, ACK `reconocida_at`, una pendiente por operador garantizada por
--    índice único parcial, huella del snapshot, titularidad por sesión, visibilidad vigente) pero con snapshot de VARIAS líneas. Tabla propia para no mezclar el snapshot multi-línea de Compras con la
--    recuperación de «Nuevo movimiento» (NEX-066 no se modifica ni se comparte).
--  · compras_entrada_ejecutar(): en UNA transacción (la del llamador) bloquea la intención, valida proveedor/depósito/productos/lotes, llama a inventario_registrar_movimiento (ENTRADA, COMPRA, N líneas,
--    costos explícitos, clave de movimiento 'COMPRA-ENT:<K1>'), inserta compras_entradas y marca la intención CONFIRMADA. O todo o nada. Un rechazo DETERMINISTA (reglas de negocio / datos) se revierte en
--    una subtransacción, se comprueba que NO existe movimiento con esa clave y solo entonces la intención pasa a RECHAZADA_DEFINITIVA. Permisos, alcance, bloqueos, conexión: la intención sigue RESERVADA.
--  · Permisos de catálogo COMPRAS.VER y COMPRAS.CREAR (OPERACIONAL, alcance EMPRESA). NO se asignan a ningún perfil: hasta que el responsable los conceda, solo el administrador de empresa opera.
--    El motor conserva MOVIMIENTOS.CREAR y usuario_puede_deposito.
-- Grants: la aplicación solo LEE compras_entradas y EJECUTA reservar / pendiente / ejecutar / reconocer. Sin acceso a la tabla de intenciones ni a la función interna de registro.
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM con backup previo (docs/PROCEDIMIENTO-NEX-075.md): preflight (scripts/preflight-NEX-075.sql),
-- runner oficial, verificación (scripts/verificar-NEX-075.sql) y reversión segura (scripts/reversion-NEX-075.sql). Sin esta migración la aplicación responde 503 «No disponible» en Compras → Entradas.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.usuario_puede_deposito(uuid,uuid,uuid)') IS NULL
     OR to_regclass('public.movimientos_inventario_idem_key') IS NULL THEN
    RAISE EXCEPTION 'NEX-075 requiere el motor de movimientos operativos (NEX-014).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-075 requiere el envoltorio de grants que descubre los ayudantes nex_aplicar_grants_* (NEX-037/NEX-052).';
  END IF;
  IF to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-075 requiere nex_reinicio_demo_activo (NEX-012/NEX-014).';
  END IF;
  IF to_regclass('public.compras_entradas') IS NOT NULL OR to_regclass('public.compras_entradas_intenciones') IS NOT NULL THEN
    RAISE EXCEPTION 'compras_entradas ya existe: NEX-075 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 0) Permisos del módulo (catálogo). Sin asignación a perfiles: no se concede nada implícitamente.
INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('COMPRAS.VER', 'COMPRAS', 'VER', 'compras', 'EMPRESA', 'OPERACIONAL'),
       ('COMPRAS.CREAR', 'COMPRAS', 'CREAR', 'compras', 'EMPRESA', 'OPERACIONAL')
ON CONFLICT (codigo) DO NOTHING;

-- 1) Metadatos de la entrada (1:1 con su movimiento). Sin cantidades ni costos.
CREATE TABLE public.compras_entradas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid        NOT NULL REFERENCES public.empresas (id),
  movimiento_id       uuid        NOT NULL,
  proveedor_id        uuid        NOT NULL,
  proveedor_codigo    text,       -- opcional: NEX-006 admite proveedores sin código interno (NULL = sin código; nunca se inventa)
  proveedor_nombre    text        NOT NULL,
  proveedor_documento text        NOT NULL,
  fecha_operativa     date        NOT NULL,
  referencia          text,
  clave               text        NOT NULL,
  creado_por          uuid        NOT NULL,
  creado_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compras_entradas_empresa_id_key   UNIQUE (empresa_id, id),
  CONSTRAINT compras_entradas_movimiento_uk    UNIQUE (empresa_id, movimiento_id),
  CONSTRAINT compras_entradas_clave_uk         UNIQUE (empresa_id, clave),
  -- ON DELETE CASCADE solo actúa en el reinicio DEMO: fuera de él movimientos_inventario_guard() prohíbe todo DELETE de movimientos.
  CONSTRAINT compras_entradas_movimiento_fk    FOREIGN KEY (empresa_id, movimiento_id) REFERENCES public.movimientos_inventario (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT compras_entradas_proveedor_fk     FOREIGN KEY (empresa_id, proveedor_id) REFERENCES public.proveedores (empresa_id, id),
  CONSTRAINT compras_entradas_usuario_fk       FOREIGN KEY (empresa_id, creado_por) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT compras_entradas_referencia_chk   CHECK (referencia IS NULL OR (length(btrim(referencia)) > 0 AND char_length(referencia) <= 120)),
  CONSTRAINT compras_entradas_clave_chk        CHECK (length(btrim(clave)) BETWEEN 8 AND 120),
  CONSTRAINT compras_entradas_snapshot_chk     CHECK ((proveedor_codigo IS NULL OR length(btrim(proveedor_codigo)) > 0) AND length(btrim(proveedor_nombre)) > 0 AND length(btrim(proveedor_documento)) > 0)
);
CREATE INDEX compras_entradas_fecha_idx ON public.compras_entradas (empresa_id, fecha_operativa DESC, creado_at DESC);
CREATE INDEX compras_entradas_proveedor_idx ON public.compras_entradas (empresa_id, proveedor_id);
COMMENT ON TABLE public.compras_entradas IS 'NEX-075: entrada de Compras (proveedor + snapshot) ligada 1:1 a su movimiento ENTRADA/COMPRA. Fuente exclusiva del Informe de Compras (E6-B). Sin costos ni cantidades; inmutable; la escribe solo compras_entrada_ejecutar().';

CREATE OR REPLACE FUNCTION public.compras_entradas_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'compras_entradas es inmutable: una entrada se anula solo por el movimiento inverso oficial (inventario_anular_movimiento)' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER compras_entradas_inmutable_trg BEFORE UPDATE OR DELETE ON public.compras_entradas
  FOR EACH ROW EXECUTE FUNCTION public.compras_entradas_inmutable();

-- 2) Intención durable de registro (equivalente a NEX-066, con snapshot multi-línea).
CREATE TABLE public.compras_entradas_intenciones (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid        NOT NULL REFERENCES public.empresas (id),
  usuario_id        uuid        NOT NULL,
  clave             text        NOT NULL,
  snapshot          jsonb       NOT NULL,
  huella            text        NOT NULL,
  estado            text        NOT NULL DEFAULT 'RESERVADA',
  entrada_id        uuid,
  movimiento_id     uuid,
  numero_movimiento text,
  detalle_rechazo   text,
  creado_at         timestamptz NOT NULL DEFAULT now(),
  actualizado_at    timestamptz NOT NULL DEFAULT now(),
  resuelta_at       timestamptz,
  reconocida_at     timestamptz,
  CONSTRAINT compras_entradas_int_usuario_fk   FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT compras_entradas_int_clave_uk     UNIQUE (empresa_id, clave),
  CONSTRAINT compras_entradas_int_clave_chk    CHECK (length(btrim(clave)) BETWEEN 8 AND 120),
  CONSTRAINT compras_entradas_int_snapshot_chk CHECK (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) <= 262144),
  CONSTRAINT compras_entradas_int_estado_chk   CHECK (estado IN ('RESERVADA', 'CONFIRMADA', 'RECHAZADA_DEFINITIVA')),
  CONSTRAINT compras_entradas_int_resultado_chk CHECK ((estado = 'CONFIRMADA') = (entrada_id IS NOT NULL AND movimiento_id IS NOT NULL AND numero_movimiento IS NOT NULL)),
  CONSTRAINT compras_entradas_int_resuelta_chk CHECK ((estado = 'RESERVADA') = (resuelta_at IS NULL)),
  CONSTRAINT compras_entradas_int_reconocida_chk CHECK (reconocida_at IS NULL OR estado = 'CONFIRMADA')
);
COMMENT ON TABLE public.compras_entradas_intenciones IS 'NEX-075: intención durable (K1 + snapshot multi-línea) de una entrada de Compras, por empresa y usuario. Sin acceso directo para la aplicación; solo funciones SECURITY DEFINER.';

-- Una sola intención SIN RESOLVER O SIN RECONOCER por empresa + usuario (garantía de la base, no de la interfaz).
CREATE UNIQUE INDEX compras_entradas_int_pendiente_uk ON public.compras_entradas_intenciones (empresa_id, usuario_id) WHERE reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA');

REVOKE ALL ON public.compras_entradas FROM PUBLIC;
REVOKE ALL ON public.compras_entradas_intenciones FROM PUBLIC;

-- 3) Visibilidad vigente de una intención (interna): COMPRAS.VER + alcance sobre el depósito destino. Sin visibilidad nunca se responde «no hay pendiente» (42501 + NEX:INTENCION_SIN_VISIBILIDAD).
CREATE OR REPLACE FUNCTION public.compras_entrada_intencion_visible(p_empresa uuid, p_usuario uuid, p_snapshot jsonb)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'VER')
     AND NULLIF(p_snapshot->>'depositoId', '') IS NOT NULL
     AND (p_snapshot->>'depositoId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND public.usuario_puede_deposito(p_empresa, p_usuario, (p_snapshot->>'depositoId')::uuid)
$$;

-- 4) Reservar K1 + snapshot (el llamador hace COMMIT ANTES de cualquier operación de stock). Idempotente para la misma K1 del mismo usuario y el mismo snapshot.
CREATE OR REPLACE FUNCTION public.compras_entrada_intencion_reservar(p_empresa uuid, p_usuario uuid, p_clave text, p_snapshot jsonb)
RETURNS TABLE (o_clave text, o_estado text, o_snapshot jsonb, o_creado_at timestamptz, o_nueva boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev   public.compras_entradas_intenciones%ROWTYPE;
  v_huella text;
BEGIN
  IF p_empresa IS NULL OR p_usuario IS NULL THEN
    RAISE EXCEPTION 'empresa y usuario son obligatorios' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso COMPRAS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_clave IS NULL OR length(btrim(p_clave)) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'la clave del registro no es válida' USING ERRCODE = 'P0001';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' OR pg_column_size(p_snapshot) > 262144
     OR jsonb_typeof(p_snapshot->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'lineas') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'los datos de la entrada no son válidos' USING ERRCODE = 'P0001';
  END IF;

  -- Serializa pestañas / sesiones / llamadas simultáneas del mismo operador (mismo bloqueo que reconocer).
  PERFORM pg_advisory_xact_lock(hashtextextended('compras.entradas.int:' || p_empresa::text || ':' || p_usuario::text, 0));
  v_huella := md5(p_snapshot::text);

  SELECT * INTO v_prev FROM public.compras_entradas_intenciones WHERE empresa_id = p_empresa AND clave = p_clave;
  IF FOUND THEN
    -- Respuesta neutra: no se revela si la clave pertenece a otro usuario.
    IF v_prev.usuario_id <> p_usuario OR v_prev.huella <> v_huella THEN
      RAISE EXCEPTION 'la clave del registro no está disponible' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_CONFLICTO';
    END IF;
    IF NOT public.compras_entrada_intencion_visible(p_empresa, p_usuario, v_prev.snapshot) THEN
      RAISE EXCEPTION 'la operación anterior no puede recuperarse con los permisos actuales' USING ERRCODE = '42501', DETAIL = 'NEX:INTENCION_SIN_VISIBILIDAD';
    END IF;
    RETURN QUERY SELECT v_prev.clave, v_prev.estado, v_prev.snapshot, v_prev.creado_at, false;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.compras_entradas_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA')) THEN
    RAISE EXCEPTION 'hay una entrada anterior sin resolver' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_PENDIENTE';
  END IF;

  RETURN QUERY
    INSERT INTO public.compras_entradas_intenciones (empresa_id, usuario_id, clave, snapshot, huella)
    VALUES (p_empresa, p_usuario, p_clave, p_snapshot, v_huella)
    RETURNING compras_entradas_intenciones.clave, compras_entradas_intenciones.estado, compras_entradas_intenciones.snapshot, compras_entradas_intenciones.creado_at, true;
END $$;

-- 5) Intención pendiente del operador (SOLO LECTURA): RESERVADA, o CONFIRMADA aún no reconocida (con número y entrada originales). Marca de revisión (> 7 días, solo RESERVADA) sin liberar nada.
CREATE OR REPLACE FUNCTION public.compras_entrada_intencion_pendiente(p_empresa uuid, p_usuario uuid)
RETURNS TABLE (o_clave text, o_estado text, o_snapshot jsonb, o_creado_at timestamptz, o_requiere_revision boolean, o_evidencia_numero text, o_entrada_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE i public.compras_entradas_intenciones%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso COMPRAS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM public.compras_entradas_intenciones
   WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA');
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT public.compras_entrada_intencion_visible(p_empresa, p_usuario, i.snapshot) THEN
    RAISE EXCEPTION 'la operación anterior no puede recuperarse con los permisos actuales' USING ERRCODE = '42501', DETAIL = 'NEX:INTENCION_SIN_VISIBILIDAD';
  END IF;
  RETURN QUERY SELECT i.clave, i.estado, i.snapshot, i.creado_at, (i.estado = 'RESERVADA' AND i.creado_at < now() - interval '7 days'),
           CASE WHEN i.estado = 'CONFIRMADA' THEN i.numero_movimiento ELSE
             (SELECT m.numero_movimiento FROM public.movimientos_inventario m
               WHERE m.empresa_id = i.empresa_id AND m.clave_idempotencia = 'COMPRA-ENT:' || i.clave AND m.creado_por = i.usuario_id LIMIT 1) END,
           i.entrada_id;
END $$;

-- 6) Registro interno de la entrada (NO ejecutable por la aplicación; solo lo llama compras_entrada_ejecutar dentro de su transacción).
--    Valida proveedor, depósito, productos, cantidades, costos y lotes; registra UN movimiento ENTRADA/COMPRA con N líneas mediante el motor oficial; inserta los metadatos. Cualquier error aborta todo.
CREATE OR REPLACE FUNCTION public.compras_entrada_registrar(p_empresa uuid, p_usuario uuid, p_clave text, p_snapshot jsonb)
RETURNS TABLE (o_entrada_id uuid, o_movimiento_id uuid, o_numero text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uuid      constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_clave_mov text := 'COMPRA-ENT:' || p_clave;
  v_fecha     date;
  v_deposito  uuid;
  v_ref       text := NULLIF(btrim(COALESCE(p_snapshot->>'referencia', '')), '');
  v_obs       text := NULLIF(btrim(COALESCE(p_snapshot->>'observacion', '')), '');
  pv          record;
  pr          record;
  x           jsonb;
  v_prod      uuid;
  v_cant      numeric;
  v_costo     numeric;
  v_lote_txt  text;
  v_venc      date;
  v_lote      uuid;
  v_lote_venc date;
  v_lineas    jsonb := '[]'::jsonb;
  v_linea     jsonb;
  v_vistos    text[] := ARRAY[]::text[];
  v_mov       uuid;
  v_num       text;
  v_rep       boolean;
  v_entrada   uuid;
  v_prov_cod  text;
  v_prov_doc  text;
  v_prov_id   text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso COMPRAS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  -- Cabecera
  IF COALESCE(p_snapshot->>'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'la fecha de la entrada no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;
  v_fecha := (p_snapshot->>'fecha')::date;
  IF COALESCE(p_snapshot->>'depositoId', '') !~* v_uuid THEN
    RAISE EXCEPTION 'seleccione el depósito destino' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;
  v_deposito := (p_snapshot->>'depositoId')::uuid;
  IF COALESCE(p_snapshot->>'proveedorId', '') !~* v_uuid THEN
    RAISE EXCEPTION 'seleccione el proveedor' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;
  IF v_ref IS NOT NULL AND char_length(v_ref) > 120 THEN
    RAISE EXCEPTION 'la referencia admite hasta 120 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 1000 THEN
    RAISE EXCEPTION 'la observación admite hasta 1000 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;

  -- Proveedor de la empresa, activo y no bloqueado. FOR SHARE: no puede bloquearse/desactivarse mientras se confirma la entrada.
  SELECT p.id, p.codigo, p.razon_social, p.tipo_documento, p.numero_documento, p.dv, p.activo, p.bloqueado INTO pv
    FROM public.proveedores p WHERE p.empresa_id = p_empresa AND p.id = (p_snapshot->>'proveedorId')::uuid FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el proveedor no existe en esta empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_PROVEEDOR_INVALIDO';
  END IF;
  -- Código interno OPCIONAL (NEX-006): NULL o vacío = sin código; se guarda NULL. Sin código, el proveedor se identifica por su razón social y documento reales.
  v_prov_cod := CASE WHEN btrim(COALESCE(pv.codigo, '')) = '' THEN NULL ELSE pv.codigo END;
  v_prov_doc := pv.tipo_documento || ' ' || pv.numero_documento || CASE WHEN pv.dv IS NOT NULL THEN '-' || pv.dv ELSE '' END;
  v_prov_id  := COALESCE(v_prov_cod, pv.razon_social || ' (' || v_prov_doc || ')');
  IF NOT pv.activo OR pv.bloqueado THEN
    RAISE EXCEPTION 'el proveedor % está inactivo o bloqueado', v_prov_id USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_PROVEEDOR_INVALIDO';
  END IF;

  -- Líneas
  IF jsonb_typeof(p_snapshot->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'lineas') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'la entrada necesita entre 1 y 500 productos' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
  END IF;
  FOR x IN SELECT e FROM jsonb_array_elements(p_snapshot->'lineas') e LOOP
    IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR COALESCE(x->>'productoId', '') !~* v_uuid THEN
      RAISE EXCEPTION 'un ítem de la entrada no tiene producto válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    v_prod := (x->>'productoId')::uuid;
    IF COALESCE(x->>'cantidad', '') !~ '^\d{1,14}(\.\d{1,4})?$' OR (x->>'cantidad')::numeric <= 0 THEN
      RAISE EXCEPTION 'la cantidad debe ser mayor que cero y tener hasta 4 decimales' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    v_cant := (x->>'cantidad')::numeric;
    -- Costo expreso: un costo ausente NUNCA se toma como cero.
    IF COALESCE(x->>'costo', '') !~ '^\d{1,14}(\.\d{1,4})?$' THEN
      RAISE EXCEPTION 'ingrese el costo unitario de cada ítem (>= 0, hasta 4 decimales): el costo no se inventa' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    v_costo := (x->>'costo')::numeric;
    v_lote_txt := NULLIF(btrim(COALESCE(x->>'lote', '')), '');
    IF NULLIF(btrim(COALESCE(x->>'vencimiento', '')), '') IS NULL THEN
      v_venc := NULL;
    ELSIF (x->>'vencimiento') ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_venc := (x->>'vencimiento')::date;
    ELSE
      RAISE EXCEPTION 'la fecha de vencimiento no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    IF v_lote_txt IS NOT NULL AND char_length(v_lote_txt) > 80 THEN
      RAISE EXCEPTION 'el lote admite hasta 80 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    IF (v_prod::text || '|' || COALESCE(v_lote_txt, '')) = ANY (v_vistos) THEN
      RAISE EXCEPTION 'un producto (y lote) está repetido en la entrada: unifique la cantidad en un solo ítem' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_DATOS_INVALIDOS';
    END IF;
    v_vistos := v_vistos || (v_prod::text || '|' || COALESCE(v_lote_txt, ''));

    SELECT p.codigo, p.activo, p.controla_stock, p.modo_control_stock AS modo INTO pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'el producto no existe en esta empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_PRODUCTO_INVALIDO';
    END IF;
    IF NOT pr.activo OR NOT pr.controla_stock THEN
      RAISE EXCEPTION 'el producto % está inactivo o no controla stock', pr.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_PRODUCTO_INVALIDO';
    END IF;
    -- Unidad identificada (serie/etiqueta): el motor aún no la soporta. Bloqueo explícito, sin bypass.
    IF pr.modo = 'UNIDAD_ETIQUETADA' THEN
      RAISE EXCEPTION 'el producto % se controla por unidad identificada (serie/etiqueta): aún no se puede ingresar desde Compras', pr.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_PRODUCTO_SERIE';
    END IF;

    v_lote := NULL;
    IF pr.modo = 'LOTE' THEN
      IF v_lote_txt IS NULL THEN
        RAISE EXCEPTION 'el producto % se controla por lote: ingrese el lote', pr.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_LOTE_INVALIDO';
      END IF;
      SELECT l.id, l.fecha_vencimiento INTO v_lote, v_lote_venc FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod AND l.codigo_lote = v_lote_txt;
      IF FOUND THEN
        IF v_venc IS NOT NULL AND v_lote_venc IS NOT NULL AND v_venc <> v_lote_venc THEN
          RAISE EXCEPTION 'el lote % del producto % ya existe con vencimiento %', v_lote_txt, pr.codigo, to_char(v_lote_venc, 'DD/MM/YYYY') USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_LOTE_INVALIDO';
        END IF;
      ELSE
        -- Mismo criterio que «Nuevo movimiento»: una entrada puede crear el lote (dos entradas simultáneas reutilizan el mismo).
        INSERT INTO public.stock_lotes (empresa_id, producto_id, codigo_lote, fecha_vencimiento) VALUES (p_empresa, v_prod, v_lote_txt, v_venc)
          ON CONFLICT (empresa_id, producto_id, codigo_lote) DO NOTHING RETURNING id INTO v_lote;
        IF v_lote IS NULL THEN
          SELECT l.id INTO v_lote FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod AND l.codigo_lote = v_lote_txt;
        END IF;
        IF v_lote IS NULL THEN
          RAISE EXCEPTION 'no fue posible resolver el lote %', v_lote_txt USING ERRCODE = '40001';
        END IF;
      END IF;
    ELSIF v_lote_txt IS NOT NULL OR v_venc IS NOT NULL THEN
      RAISE EXCEPTION 'el producto % no se controla por lote: no indique lote ni vencimiento', pr.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_LOTE_INVALIDO';
    END IF;

    v_linea := jsonb_build_object('producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_costo, 'propiedad', 'PROPIO');
    IF v_lote IS NOT NULL THEN
      v_linea := v_linea || jsonb_build_object('lote_id', v_lote);
    END IF;
    v_lineas := v_lineas || jsonb_build_array(v_linea);
  END LOOP;

  -- Un movimiento con esta clave sin intención confirmada sería una inconsistencia: no se vincula ni se rechaza (la intención queda pendiente para revisión).
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.clave_idempotencia = v_clave_mov) THEN
    RAISE EXCEPTION 'ya existe un movimiento con la clave de esta entrada sin entrada confirmada: requiere revisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_ENTRADA_INCONSISTENTE';
  END IF;

  -- Motor oficial (NEX-014): permisos MOVIMIENTOS.CREAR, alcance del depósito, fecha no futura, stock y costo promedio, idempotencia K1. Sin escritura directa de saldos ni costos.
  SELECT r.o_movimiento_id, r.o_numero, r.o_repetido INTO v_mov, v_num, v_rep
    FROM public.inventario_registrar_movimiento(p_empresa, p_usuario, 'ENTRADA', 'COMPRA', v_fecha, NULL, v_deposito, v_lineas, v_clave_mov, NULL,
                                                'Compras → Entradas · proveedor ' || v_prov_id, v_obs, v_ref) r;
  IF v_rep THEN
    RAISE EXCEPTION 'el motor devolvió un movimiento ya existente para esta entrada: requiere revisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:COMPRA_ENTRADA_INCONSISTENTE';
  END IF;

  INSERT INTO public.compras_entradas (empresa_id, movimiento_id, proveedor_id, proveedor_codigo, proveedor_nombre, proveedor_documento, fecha_operativa, referencia, clave, creado_por)
  VALUES (p_empresa, v_mov, pv.id, v_prov_cod, pv.razon_social, v_prov_doc,
          v_fecha, v_ref, p_clave, p_usuario)
  RETURNING id INTO v_entrada;

  RETURN QUERY SELECT v_entrada, v_mov, v_num;
END $$;

-- 7) Ejecutar (o repetir) la intención del operador con SU K1 y el snapshot persistido. La aplicación la llama dentro de BEGIN … COMMIT: intención, movimiento, líneas, costos y metadatos se confirman juntos.
--    o_estado: CONFIRMADA (o_repetido = true si ya lo estaba) | RECHAZADA (rechazo definitivo comprobado: nada se registró). Cualquier error propagado deja la intención RESERVADA (reintentable con la misma K1).
CREATE OR REPLACE FUNCTION public.compras_entrada_ejecutar(p_empresa uuid, p_usuario uuid, p_clave text)
RETURNS TABLE (o_estado text, o_entrada_id uuid, o_numero text, o_repetido boolean, o_detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v   public.compras_entradas_intenciones%ROWTYPE;
  r   record;
  v_msg text;
  v_det text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso COMPRAS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  -- Bloquea la fila: dos ejecuciones simultáneas de la misma K1 se serializan; la segunda ve CONFIRMADA.
  SELECT * INTO v FROM public.compras_entradas_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.compras_entrada_intencion_visible(p_empresa, p_usuario, v.snapshot) THEN
    RAISE EXCEPTION 'la operación anterior no puede recuperarse con los permisos actuales' USING ERRCODE = '42501', DETAIL = 'NEX:INTENCION_SIN_VISIBILIDAD';
  END IF;
  IF v.estado = 'CONFIRMADA' THEN
    RETURN QUERY SELECT 'CONFIRMADA'::text, v.entrada_id, v.numero_movimiento, true, NULL::text;
    RETURN;
  END IF;
  IF v.estado = 'RECHAZADA_DEFINITIVA' THEN
    RETURN QUERY SELECT 'RECHAZADA'::text, NULL::uuid, NULL::text, false, v.detalle_rechazo;
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO r FROM public.compras_entrada_registrar(p_empresa, p_usuario, p_clave, v.snapshot);
    UPDATE public.compras_entradas_intenciones
       SET estado = 'CONFIRMADA', entrada_id = r.o_entrada_id, movimiento_id = r.o_movimiento_id, numero_movimiento = r.o_numero, resuelta_at = now(), actualizado_at = now()
     WHERE id = v.id AND estado = 'RESERVADA';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'la intención no está pendiente' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_NO_PENDIENTE';
    END IF;
  EXCEPTION
    -- Rechazo DETERMINISTA (regla de negocio P0001, datos 22xxx, integridad 23xxx): la subtransacción ya revirtió movimiento, líneas, costos, lotes y metadatos.
    -- Permisos/alcance (42501), bloqueos/serialización (40xxx), cancelaciones y fallas de conexión NO se capturan: la intención queda RESERVADA.
    WHEN raise_exception OR data_exception OR integrity_constraint_violation THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL;
      IF COALESCE(v_det, '') LIKE 'NEX:IDEMPOTENCIA_CONFLICTO%' OR COALESCE(v_det, '') LIKE 'NEX:INTENCION%' OR COALESCE(v_det, '') LIKE 'NEX:COMPRA_ENTRADA_INCONSISTENTE%' THEN
        RAISE;
      END IF;
      IF EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.clave_idempotencia = 'COMPRA-ENT:' || p_clave) THEN
        RAISE EXCEPTION 'existe un movimiento con la clave de esta entrada: la intención no puede rechazarse' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_NO_RECHAZABLE';
      END IF;
      UPDATE public.compras_entradas_intenciones
         SET estado = 'RECHAZADA_DEFINITIVA', detalle_rechazo = left(COALESCE(v_msg, ''), 300), resuelta_at = now(), actualizado_at = now()
       WHERE id = v.id;
      RETURN QUERY SELECT 'RECHAZADA'::text, NULL::uuid, NULL::text, false, left(COALESCE(v_msg, ''), 300);
      RETURN;
  END;

  RETURN QUERY SELECT 'CONFIRMADA'::text, r.o_entrada_id, r.o_numero, false, NULL::text;
END $$;

-- 8) Reconocer (ACK) el resultado de una intención CONFIRMADA: autenticado, idempotente, serializado con reservar; nunca toca stock. Solo después queda libre una entrada nueva.
CREATE OR REPLACE FUNCTION public.compras_entrada_intencion_reconocer(p_empresa uuid, p_usuario uuid, p_clave text)
RETURNS TABLE (o_estado text, o_numero text, o_entrada_id uuid, o_reconocida_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.compras_entradas_intenciones%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'COMPRAS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso COMPRAS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('compras.entradas.int:' || p_empresa::text || ':' || p_usuario::text, 0));
  SELECT * INTO v FROM public.compras_entradas_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.compras_entrada_intencion_visible(p_empresa, p_usuario, v.snapshot) THEN
    RAISE EXCEPTION 'la operación anterior no puede recuperarse con los permisos actuales' USING ERRCODE = '42501', DETAIL = 'NEX:INTENCION_SIN_VISIBILIDAD';
  END IF;
  IF v.estado <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'solo se reconoce una entrada confirmada' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_NO_CONFIRMADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compras_entradas e JOIN public.movimientos_inventario m ON m.empresa_id = e.empresa_id AND m.id = e.movimiento_id
                  WHERE e.empresa_id = p_empresa AND e.id = v.entrada_id AND e.clave = p_clave AND m.numero_movimiento = v.numero_movimiento) THEN
    RAISE EXCEPTION 'no existe la entrada original de esta intención' USING ERRCODE = 'P0001';
  END IF;
  IF v.reconocida_at IS NULL THEN
    UPDATE public.compras_entradas_intenciones SET reconocida_at = now(), actualizado_at = now() WHERE id = v.id RETURNING reconocida_at INTO v.reconocida_at;
  END IF;
  RETURN QUERY SELECT v.estado, v.numero_movimiento, v.entrada_id, v.reconocida_at;
END $$;

-- 9) Grants: la aplicación LEE compras_entradas y EJECUTA reservar / pendiente / ejecutar / reconocer. Ayudante descubierto por el envoltorio nex_aplicar_grants_runtime() (NEX-052).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_compras_entradas() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.compras_entradas FROM PUBLIC;
  REVOKE ALL ON public.compras_entradas FROM nexit_runtime;
  GRANT SELECT ON public.compras_entradas TO nexit_runtime;
  REVOKE ALL ON public.compras_entradas_intenciones FROM PUBLIC;
  REVOKE ALL ON public.compras_entradas_intenciones FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.compras_entrada_intencion_visible(uuid, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_intencion_visible(uuid, uuid, jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.compras_entrada_registrar(uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_registrar(uuid, uuid, text, jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.compras_entradas_inmutable() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_intencion_reservar(uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_intencion_pendiente(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_ejecutar(uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.compras_entrada_intencion_reconocer(uuid, uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.compras_entrada_intencion_reservar(uuid, uuid, text, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.compras_entrada_intencion_pendiente(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.compras_entrada_ejecutar(uuid, uuid, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.compras_entrada_intencion_reconocer(uuid, uuid, text) TO nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.compras_entradas_inmutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_intencion_visible(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_intencion_reservar(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_intencion_pendiente(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_registrar(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_ejecutar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compras_entrada_intencion_reconocer(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_compras_entradas() FROM PUBLIC;

SELECT public.nex_aplicar_grants_compras_entradas();
