-- REVERSIÓN INTEGRAL de NEX-027 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-027.sql   (una sola transacción: todo o nada).
--
-- Restaura el catálogo public.paises_telefonia EXACTAMENTE al estado anterior a NEX-027 usando la foto
-- public.paises_telefonia_previo_nex027 (creada por la propia NEX-027 antes de cambiar nada):
--   · elimina los destinos añadidos por NEX-027 (p. ej. XAC, IOT, PCN, SGS) y cualquier otro que no estuviera en la foto;
--   · devuelve nombre, DDI y 'activo' de las filas preexistentes (p. ej. VAT = 379, SHN = 'Santa Elena', inactivos de antes);
--   · reinserta filas preexistentes que hubieran sido borradas después;
--   · quita origen/jurisdiccion_iso, sus restricciones y el comentario de 'activo';
--   · comprueba (EXCEPT en ambos sentidos) que el resultado coincide con la foto y recién entonces elimina la foto.
-- LÍMITES: pierde cualquier cambio hecho al catálogo DESPUÉS de aplicar NEX-027. No toca clientes ni contactos (sin FK): los
-- que ya guardaron 'XAC'/'IOT'/… conservan su ISO; seguirán siendo válidos porque la validación usa el catálogo de Git.
-- Si la foto NO existe (NEX-027 aplicada por otro medio, foto borrada o versión anterior de este archivo), el script ABORTA sin
-- cambios: en ese caso la ÚNICA recuperación es restaurar la copia de seguridad previa (pg_dump) de la tabla. No hay reversión parcial.
-- Después, borrar la fila 'NEX-027' de schema_migrations (decisión del responsable) para poder reaplicarla.

DO $$
BEGIN
  IF to_regclass('public.paises_telefonia_previo_nex027') IS NULL THEN
    RAISE EXCEPTION 'No existe public.paises_telefonia_previo_nex027: no se puede restaurar el catálogo anterior. Restaure la copia de seguridad previa; no hay reversión parcial.';
  END IF;
  IF (SELECT count(*) FROM public.paises_telefonia_previo_nex027) = 0 THEN
    RAISE EXCEPTION 'La foto previa está vacía: abortado (un catálogo anterior vacío sería indistinguible de una foto dañada). Restaure la copia de seguridad.';
  END IF;
END $$;

DELETE FROM public.paises_telefonia t
 WHERE NOT EXISTS (SELECT 1 FROM public.paises_telefonia_previo_nex027 p WHERE p.iso3 = t.iso3);

UPDATE public.paises_telefonia t
   SET nombre = p.nombre, ddi = p.ddi, activo = p.activo
  FROM public.paises_telefonia_previo_nex027 p
 WHERE p.iso3 = t.iso3;

INSERT INTO public.paises_telefonia (iso3, nombre, ddi, activo)
SELECT p.iso3, p.nombre, p.ddi, p.activo
  FROM public.paises_telefonia_previo_nex027 p
 WHERE NOT EXISTS (SELECT 1 FROM public.paises_telefonia t WHERE t.iso3 = p.iso3);

ALTER TABLE public.paises_telefonia
  DROP CONSTRAINT IF EXISTS paises_telefonia_jurisdiccion_chk,
  DROP CONSTRAINT IF EXISTS paises_telefonia_origen_chk,
  DROP COLUMN IF EXISTS jurisdiccion_iso,
  DROP COLUMN IF EXISTS origen;
COMMENT ON COLUMN public.paises_telefonia.activo IS NULL;

DO $$
DECLARE
  sobran int;
  faltan int;
BEGIN
  SELECT count(*) INTO sobran FROM (SELECT iso3, nombre, ddi, activo FROM public.paises_telefonia
                                    EXCEPT SELECT iso3, nombre, ddi, activo FROM public.paises_telefonia_previo_nex027) x;
  SELECT count(*) INTO faltan FROM (SELECT iso3, nombre, ddi, activo FROM public.paises_telefonia_previo_nex027
                                    EXCEPT SELECT iso3, nombre, ddi, activo FROM public.paises_telefonia) x;
  IF sobran <> 0 OR faltan <> 0 THEN
    RAISE EXCEPTION 'La restauración no coincide con la foto previa (sobran %, faltan %): transacción revertida.', sobran, faltan;
  END IF;
END $$;

DROP TABLE public.paises_telefonia_previo_nex027;
