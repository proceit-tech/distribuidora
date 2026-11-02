-- =====================================================================
-- NEX-033 — Proveedores: razón social y nombre de fantasía hasta 255 caracteres (PRV-A02) y código PRV inmutable (PRV-01-01).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Requiere NEX-006. No modifica ninguna fila existente. Reversión: scripts/reversion-NEX-033.sql.
--
-- Las columnas son `text` con restricciones CHECK nombradas (no hay varchar ni vistas que dependan de un tipo), por lo que basta
-- reemplazar las dos restricciones por otras con el límite ampliado; las filas actuales (≤ 200) cumplen la nueva regla.
-- Hasta aplicar esta migración la base sigue limitando ambos nombres a 200 caracteres: la API de Proveedores ya valida 255 y
-- devuelve un mensaje explícito si la base rechaza un valor de 201 a 255 caracteres.
-- =====================================================================

ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS proveedores_legal_nombre_chk;
ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS proveedores_trade_nombre_chk;

ALTER TABLE public.proveedores
  ADD CONSTRAINT proveedores_legal_nombre_chk CHECK (length(btrim(razon_social)) > 0 AND char_length(razon_social) <= 255),
  ADD CONSTRAINT proveedores_trade_nombre_chk CHECK (char_length(nombre_fantasia) <= 255);

-- El código PRV lo asigna el trigger al insertar y no puede cambiar nunca (ni por la aplicación ni por SQL directo).
CREATE OR REPLACE FUNCTION public.proveedores_codigo_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'El código del proveedor es inmutable.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER proveedores_codigo_inmutable_trg
  BEFORE UPDATE OF codigo ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.proveedores_codigo_inmutable();
