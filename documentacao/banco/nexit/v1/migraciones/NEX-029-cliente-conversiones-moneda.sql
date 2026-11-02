-- =====================================================================
-- NEX-029 — Clientes: auditoría de la conversión de moneda de los límites de crédito (CLI-VIS-05/06; D-10).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-029.sql. No modifica filas existentes.
--
-- Al cambiar la moneda predeterminada de un cliente con límites, la edición exige una tasa de cambio informada por el
-- usuario y su confirmación expresa; el servidor recalcula con aritmética decimal exacta (redondeo half-up a 4 decimales,
-- escala de numeric(18,4)) y registra aquí, en la misma transacción, la tasa y los valores de origen y destino.
-- Tabla de solo altas (sin UPDATE/DELETE para la aplicación). No convierte saldos ni operaciones futuras.
-- =====================================================================

CREATE TABLE public.cliente_conversiones_moneda (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid          NOT NULL REFERENCES public.empresas (id),
  cliente_id              uuid          NOT NULL,
  moneda_origen           text          NOT NULL REFERENCES public.monedas (codigo),
  moneda_destino          text          NOT NULL REFERENCES public.monedas (codigo),
  tasa                    numeric(24,8) NOT NULL CHECK (tasa > 0),
  limite_origen           numeric(18,4) NOT NULL CHECK (limite_origen >= 0),
  limite_destino          numeric(18,4) NOT NULL CHECK (limite_destino >= 0),
  limite_temporal_origen  numeric(18,4) CHECK (limite_temporal_origen >= 0),
  limite_temporal_destino numeric(18,4) CHECK (limite_temporal_destino >= 0),
  redondeo                text          NOT NULL DEFAULT 'HALF_UP_4',
  confirmado_por          uuid,
  creado_at               timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT cliente_conversiones_moneda_distintas_chk CHECK (moneda_origen <> moneda_destino),
  CONSTRAINT cliente_conversiones_moneda_temporal_chk CHECK ((limite_temporal_origen IS NULL) = (limite_temporal_destino IS NULL)),
  CONSTRAINT cliente_conversiones_moneda_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES public.clientes (empresa_id, id),
  CONSTRAINT cliente_conversiones_moneda_usuario_fk FOREIGN KEY (empresa_id, confirmado_por) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX cliente_conversiones_moneda_cliente_idx ON public.cliente_conversiones_moneda (empresa_id, cliente_id, creado_at DESC);

COMMENT ON TABLE public.cliente_conversiones_moneda IS 'Auditoría de conversiones de moneda de límites de crédito de Clientes (tasa informada por el usuario). Solo altas.';

SELECT nex_instalar_heredar_empresa('cliente_conversiones_moneda', 'clientes', 'cliente_id');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT SELECT, INSERT ON public.cliente_conversiones_moneda TO nexit_runtime;
  END IF;
END $$;
