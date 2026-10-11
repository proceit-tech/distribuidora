-- REVERSIÓN manual de NEX-027 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y
-- con backup:  psql -1 -f reversion-NEX-027.sql. Quita las columnas añadidas; las filas añadidas/corregidas por NEX-027
-- (p. ej. XAC, IOT, PCN, SGS, VAT=39) permanecen: para volver al seed exacto de NEX-026 se debe reaplicar ese seed.
ALTER TABLE public.paises_telefonia
  DROP CONSTRAINT IF EXISTS paises_telefonia_jurisdiccion_chk,
  DROP CONSTRAINT IF EXISTS paises_telefonia_origen_chk,
  DROP COLUMN IF EXISTS jurisdiccion_iso,
  DROP COLUMN IF EXISTS origen;
COMMENT ON COLUMN public.paises_telefonia.activo IS NULL;
