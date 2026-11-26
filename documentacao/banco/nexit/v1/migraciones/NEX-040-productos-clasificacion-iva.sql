-- =====================================================================
-- NEX-040 — Productos: clasificación fiscal estándar IVA (Tabla 6 y grupo E8.2 del MT v150). Requiere NEX-007 y NEX-039 (registro de reconciliación).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-040.sql.
--
--   · productos.afectacion_iva (E731: 1 Gravado, 2 Exonerado, 3 Exento, 4 Gravado parcial) y productos.proporcion_gravada_iva (E733, solo afectación 4).
--   · La tasa (E734) NO se duplica: es el porcentaje del impuesto elegido (impuestos.porcentaje), validado por trigger: 5/10 para afectación 1 y 4; 0 para 2 y 3.
--   · Proporción: 100 (afectación 1) y 0 (2/3) son valores fijos DERIVADOS, no se almacenan; con afectación 4 es obligatoria y 0 < x < 100.
--   · NO se reclasifica ningún producto existente: afectacion_iva queda NULL («sin clasificar»). El impuesto legado EXE (0 %) NO se convierte en Exento ni Exonerado.
--     NINGÚN script ejecuta ni automatiza la reclasificación de productos existentes: scripts/reclasificar-iva-productos-NEX-040.sql existe pero
--     aborta sin autorización expresa del responsable (PRD-AUD-06).
--   · E735–E737 (bases y liquidación) son cálculo de la operación: no se guardan en el producto.
--   · No toca impuestos, precios, unidades, saldos, costos ni movimientos.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.productos') IS NULL OR to_regclass('public.fiscal_reconciliacion_log') IS NULL THEN
    RAISE EXCEPTION 'NEX-040 requiere NEX-007 y NEX-039.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'afectacion_iva') THEN
    RAISE EXCEPTION 'productos.afectacion_iva ya existe: NEX-040 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.productos
  ADD COLUMN afectacion_iva smallint CONSTRAINT productos_afectacion_iva_chk CHECK (afectacion_iva IN (1, 2, 3, 4)),
  ADD COLUMN proporcion_gravada_iva numeric(7,4) CONSTRAINT productos_proporcion_iva_chk CHECK (proporcion_gravada_iva > 0 AND proporcion_gravada_iva < 100),
  ADD CONSTRAINT productos_iva_coherencia_chk CHECK (
    (afectacion_iva = 4 AND proporcion_gravada_iva IS NOT NULL)
    OR (afectacion_iva IS DISTINCT FROM 4 AND proporcion_gravada_iva IS NULL));

COMMENT ON COLUMN public.productos.afectacion_iva IS 'E731: 1 Gravado IVA, 2 Exonerado, 3 Exento, 4 Gravado parcial. NULL = sin clasificar (legado). La tasa E734 es impuestos.porcentaje.';
COMMENT ON COLUMN public.productos.proporcion_gravada_iva IS 'E733 informada: solo con afectacion_iva = 4 (0 < x < 100). En 1/2/3 la proporción es fija (100/0) y no se almacena.';

-- Coherencia afectación × tasa del impuesto elegido (validaciones 155/156 del MT).
CREATE OR REPLACE FUNCTION public.productos_iva_coherencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_tasa numeric;
BEGIN
  IF NEW.afectacion_iva IS NOT NULL THEN
    SELECT porcentaje INTO v_tasa FROM public.impuestos WHERE id = NEW.impuesto_id;
    IF v_tasa IS NULL THEN
      RAISE EXCEPTION 'La afectación IVA requiere un impuesto con tasa definida.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.afectacion_iva IN (1, 4) AND v_tasa NOT IN (5, 10) THEN
      RAISE EXCEPTION 'Gravado IVA y Gravado parcial exigen una tasa de 5 o 10 por ciento (el impuesto elegido tiene una tasa de % por ciento).', v_tasa USING ERRCODE = 'P0001';
    END IF;
    IF NEW.afectacion_iva IN (2, 3) AND v_tasa <> 0 THEN
      RAISE EXCEPTION 'Exonerado y Exento exigen una tasa de 0 por ciento (el impuesto elegido tiene una tasa de % por ciento).', v_tasa USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER productos_iva_coherencia_trg
  BEFORE INSERT OR UPDATE OF afectacion_iva, impuesto_id ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.productos_iva_coherencia();

-- La tasa de un impuesto usado por productos ya clasificados no puede cambiar bajo sus pies.
CREATE OR REPLACE FUNCTION public.impuestos_tasa_en_uso() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.porcentaje IS DISTINCT FROM OLD.porcentaje
     AND EXISTS (SELECT 1 FROM public.productos WHERE impuesto_id = OLD.id AND afectacion_iva IS NOT NULL) THEN
    RAISE EXCEPTION 'No se cambia la tasa de un impuesto usado por productos con clasificación IVA.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER impuestos_tasa_en_uso_trg
  BEFORE UPDATE OF porcentaje ON public.impuestos
  FOR EACH ROW EXECUTE FUNCTION public.impuestos_tasa_en_uso();
