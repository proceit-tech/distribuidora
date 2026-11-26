-- =====================================================================
-- NEX-038 — Productos: código interno inmutable por estructura (PRD-API-02 / PRD-01-001). Requiere NEX-007.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-038.sql.
-- No modifica filas existentes. La aplicación ya conserva el código en la edición; este trigger lo garantiza también ante SQL directo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.productos_codigo_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'El código del producto es inmutable.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER productos_codigo_inmutable_trg
  BEFORE UPDATE OF codigo ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.productos_codigo_inmutable();
