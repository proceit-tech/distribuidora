-- =====================================================================
-- NEX-035 — Proveedores: aprobación de cuentas bancarias y una cuenta principal APROBADA por moneda
-- (DEC-PRV-04, DEC-PRV-07, PRV-A06, PRV-A13). Requiere NEX-006 y NEX-034 (permiso PROVEEDORES.APROBAR_BANCO y auditoría).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-035.sql.
-- No borra ni modifica datos bancarios existentes.
--
-- Modelo:
--   · proveedor_cuentas_bancarias guarda la versión APROBADA de cada cuenta (o la cuenta nueva aún pendiente / rechazada).
--       estado_aprobacion: PENDIENTE (nueva o corregida tras rechazo) | APROBADA | RECHAZADA.
--     Solo una cuenta APROBADA es elegible para pagos (función proveedor_cuenta_pagable).
--   · Una modificación de una cuenta APROBADA NO la sobrescribe: crea una REVISIÓN pendiente en proveedor_cuenta_revisiones
--     (datos propuestos). La cuenta aprobada sigue siendo la que se usa para pagos hasta que un usuario con APROBAR_BANCO apruebe la
--     revisión; al aprobar, los datos propuestos pasan a la cuenta y quedan en la auditoría (proveedor_eventos) con antes y después.
--   · Principal por moneda (DEC-PRV-07): el índice único parcial solo considera cuentas APROBADAS; una cuenta pendiente nunca
--     reemplaza a la principal aprobada.
--   · Cuentas existentes: quedan PENDIENTES (nadie las aprobó con este control); el responsable de pagos debe aprobarlas
--     explícitamente. Decisión conservadora: no se presume aprobación de datos bancarios previos.
-- =====================================================================

ALTER TABLE public.proveedor_cuentas_bancarias
  ADD COLUMN estado_aprobacion text NOT NULL DEFAULT 'PENDIENTE'
    CONSTRAINT proveedor_cuentas_bancarias_estado_chk CHECK (estado_aprobacion IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  ADD COLUMN aprobado_por uuid,
  ADD COLUMN aprobado_at  timestamptz,
  ADD COLUMN motivo_resolucion text CHECK (char_length(motivo_resolucion) <= 1000),
  ADD CONSTRAINT proveedor_cuentas_bancarias_aprobador_fk FOREIGN KEY (empresa_id, aprobado_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT proveedor_cuentas_bancarias_aprobada_chk CHECK (estado_aprobacion <> 'APROBADA' OR (aprobado_por IS NOT NULL AND aprobado_at IS NOT NULL));

-- Una principal por moneda, solo entre las APROBADAS (reemplaza el índice de una principal global de NEX-006).
DROP INDEX IF EXISTS public.proveedor_cuentas_bancarias_uno_principal_uq;
CREATE UNIQUE INDEX proveedor_cuentas_bancarias_principal_moneda_uq
  ON public.proveedor_cuentas_bancarias (empresa_id, proveedor_id, moneda_codigo)
  WHERE es_principal AND estado_aprobacion = 'APROBADA';

CREATE TABLE public.proveedor_cuenta_revisiones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  proveedor_id   uuid        NOT NULL,
  cuenta_id      uuid        NOT NULL,
  datos          jsonb       NOT NULL,
  estado         text        NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  solicitado_por uuid        NOT NULL,
  solicitado_at  timestamptz NOT NULL DEFAULT now(),
  resuelto_por   uuid,
  resuelto_at    timestamptz,
  motivo         text        CHECK (char_length(motivo) <= 1000),
  CONSTRAINT proveedor_cuenta_revisiones_cuenta_fk FOREIGN KEY (empresa_id, cuenta_id) REFERENCES public.proveedor_cuentas_bancarias (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_cuenta_revisiones_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES public.proveedores (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_cuenta_revisiones_solicitante_fk FOREIGN KEY (empresa_id, solicitado_por) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT proveedor_cuenta_revisiones_resolutor_fk FOREIGN KEY (empresa_id, resuelto_por) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT proveedor_cuenta_revisiones_resuelta_chk CHECK ((estado = 'PENDIENTE') = (resuelto_por IS NULL))
);

-- Como máximo UNA revisión pendiente por cuenta (una nueva solicitud reemplaza a la pendiente).
CREATE UNIQUE INDEX proveedor_cuenta_revisiones_pendiente_uq ON public.proveedor_cuenta_revisiones (empresa_id, cuenta_id) WHERE estado = 'PENDIENTE';
CREATE INDEX proveedor_cuenta_revisiones_proveedor_idx ON public.proveedor_cuenta_revisiones (empresa_id, proveedor_id, solicitado_at DESC);

COMMENT ON TABLE public.proveedor_cuenta_revisiones IS 'Modificaciones propuestas de cuentas bancarias APROBADAS; la cuenta aprobada no cambia hasta que se aprueba la revisión.';

-- Contrato para Pagos: solo una cuenta APROBADA es elegible. (No elimina el pago de obligaciones anteriores: eso lo decide Pagos.)
CREATE OR REPLACE FUNCTION public.proveedor_cuenta_pagable(p_empresa uuid, p_cuenta uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.proveedor_cuentas_bancarias c
                  WHERE c.empresa_id = p_empresa AND c.id = p_cuenta AND c.estado_aprobacion = 'APROBADA')
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.proveedor_cuenta_revisiones TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.proveedor_cuenta_pagable(uuid, uuid) TO nexit_runtime;
  END IF;
END $$;
