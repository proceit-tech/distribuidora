-- RECLASIFICACIÓN IVA de productos EXISTENTES (NO es una migración y NO forma parte de ninguna reconciliación automática).
-- ESTE SCRIPT ABORTA salvo autorización EXPRESA del responsable, que debe pasarla en la sesión, por ejemplo:
--   PGOPTIONS="-c nex.autorizacion_reclasificacion=SI-AUTORIZADO-POR-EL-RESPONSABLE" psql -X -v ON_ERROR_STOP=1 -1 -f reclasificar-iva-productos-NEX-040.sql
-- Requiere NEX-039 y NEX-040. Regla (la única inequívoca): producto sin clasificar cuyo impuesto es IVA10 (10 %) o IVA5 (5 %) → afectación 1 (Gravado IVA).
-- NO toca EXE (Exento vs. Exonerado es decisión fiscal del responsable), ni productos sin impuesto, ni precios, stock, costos o movimientos.
-- IDEMPOTENTE; cada producto queda en fiscal_reconciliacion_log (antes/después). Para ver antes qué se afectaría use el informe de
-- reconciliar-unidades-sifen-NEX-039.sql (solo lectura).
DO $$
BEGIN
  IF coalesce(current_setting('nex.autorizacion_reclasificacion', true), '') <> 'SI-AUTORIZADO-POR-EL-RESPONSABLE' THEN
    RAISE EXCEPTION 'Reclasificación IVA no autorizada: este script exige autorización expresa del responsable (nex.autorizacion_reclasificacion).';
  END IF;
END $$;

WITH objetivo AS (
  SELECT p.id, to_jsonb(p) AS antes
    FROM public.productos p JOIN public.impuestos i ON i.id = p.impuesto_id
   WHERE p.afectacion_iva IS NULL AND ((i.codigo = 'IVA10' AND i.porcentaje = 10) OR (i.codigo = 'IVA5' AND i.porcentaje = 5))
),
actualizado AS (
  UPDATE public.productos p SET afectacion_iva = 1 FROM objetivo o WHERE p.id = o.id
  RETURNING p.id, to_jsonb(p) AS despues
)
INSERT INTO public.fiscal_reconciliacion_log (script, tabla, registro_id, antes, despues)
SELECT 'reclasificar-iva-productos-NEX-040', 'productos', o.id, o.antes, a.despues
  FROM objetivo o JOIN actualizado a ON a.id = o.id;
