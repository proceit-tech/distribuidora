-- =====================================================================
-- NEX-034 — Proveedores: auditoría append-only, permisos de gobernanza, motivo de bloqueo y elegibilidad para compras
-- (DEC-PRV-01/02/03/06/10, PRV-A03, PRV-A09, PRV-A11). Requiere NEX-006 y NEX-033.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-034.sql.
-- No modifica ninguna fila existente (la restricción de motivo se crea NOT VALID: los bloqueos anteriores sin motivo, si existieran, se
-- conservan y solo se exigirá el motivo en los nuevos).
--
-- 1) proveedor_eventos: auditoría de TODA operación administrativa y de cada cambio de las filas relacionadas (solo altas: el rol de
--    la aplicación no puede modificar ni borrar eventos).
-- 2) Permisos específicos (clase OPERACIONAL: se asignan a perfiles; el administrador de la empresa los tiene por definición):
--      PROVEEDORES.HOMOLOGAR        aprobar / rechazar / suspender / renovar la homologación (DEC-PRV-02)
--      PROVEEDORES.EVALUAR_RIESGO   fijar nivel de riesgo y calificación (DEC-PRV-10)
--      PROVEEDORES.BLOQUEAR         bloquear y desbloquear administrativamente (DEC-PRV-06)
--      PROVEEDORES.APROBAR_BANCO    aprobar o rechazar cuentas bancarias nuevas o modificadas (DEC-PRV-04)
--    La edición cadastral (PROVEEDORES.EDITAR) NO concede ninguno de ellos.
-- 3) Bloqueo: quién y cuándo (bloqueado_por/at) y motivo obligatorio al bloquear.
-- 4) Función proveedor_elegible_para_compra(): contrato de elegibilidad que Compras deberá consultar en el servidor al confirmar una
--    orden de compra (DEC-PRV-01/03). Este paquete NO modifica Compras ni Pagos.
-- =====================================================================

CREATE TABLE public.proveedor_eventos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid        NOT NULL REFERENCES public.empresas (id),
  proveedor_id  uuid        NOT NULL,
  entidad       text        NOT NULL CHECK (entidad IN ('PROVEEDOR','CONTACTO','DIRECCION','CUENTA','RETENCION','DOCUMENTO')),
  entidad_id    uuid,
  accion        text        NOT NULL CHECK (accion ~ '^[A-Z_]{3,40}$'),
  anterior      jsonb,
  nuevo         jsonb,
  justificacion text        CHECK (char_length(justificacion) <= 1000),
  usuario_id    uuid        NOT NULL,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_eventos_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES public.proveedores (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_eventos_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX proveedor_eventos_proveedor_idx ON public.proveedor_eventos (empresa_id, proveedor_id, creado_at DESC);
CREATE INDEX proveedor_eventos_entidad_idx ON public.proveedor_eventos (empresa_id, entidad, entidad_id, creado_at DESC);

COMMENT ON TABLE public.proveedor_eventos IS 'Auditoría (solo altas) de Proveedores: homologación, riesgo, bloqueo, cuentas bancarias, documentos y cambios de filas relacionadas, con valor anterior/nuevo, usuario, fecha y justificación.';

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
SELECT r || '.' || a, r, a, 'compras', 'EMPRESA', 'OPERACIONAL'
  FROM (VALUES
    ('PROVEEDORES','HOMOLOGAR'),
    ('PROVEEDORES','EVALUAR_RIESGO'),
    ('PROVEEDORES','BLOQUEAR'),
    ('PROVEEDORES','APROBAR_BANCO')
  ) t(r, a)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.proveedores
  ADD COLUMN bloqueado_por uuid,
  ADD COLUMN bloqueado_at  timestamptz,
  ADD CONSTRAINT proveedores_bloqueado_por_fk FOREIGN KEY (empresa_id, bloqueado_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT proveedores_motivo_bloqueo_chk CHECK (NOT bloqueado OR length(btrim(coalesce(motivo_bloqueo, ''))) > 0) NOT VALID,
  ADD CONSTRAINT proveedores_motivo_bloqueo_largo_chk CHECK (char_length(motivo_bloqueo) <= 1000) NOT VALID;

-- Elegibilidad para NUEVAS órdenes de compra: activo, no bloqueado, HOMOLOGADO y con homologación vigente. La fecha de vencimiento
-- vale hasta el final de ese día (hora de Asunción); al día siguiente el proveedor deja de ser elegible aunque el estado almacenado
-- siga diciendo HOMOLOGADO (DEC-PRV-03). No afecta pedidos, obligaciones ni pagos anteriores.
CREATE OR REPLACE FUNCTION public.proveedor_elegible_para_compra(p_empresa uuid, p_proveedor uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proveedores p
     WHERE p.empresa_id = p_empresa AND p.id = p_proveedor
       AND p.activo AND NOT p.bloqueado AND p.estado_homologacion = 'HOMOLOGADO'
       AND (p.fecha_vencimiento_homologacion IS NULL OR p.fecha_vencimiento_homologacion >= (now() AT TIME ZONE 'America/Asuncion')::date))
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT SELECT, INSERT ON public.proveedor_eventos TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.proveedor_elegible_para_compra(uuid, uuid) TO nexit_runtime;
  END IF;
END $$;
