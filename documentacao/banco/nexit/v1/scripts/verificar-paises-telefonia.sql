-- VERIFICACIÓN SOLO LECTURA (no modifica nada): el espejo SQL debe ser idéntico al catálogo canónico de Git
-- (lib/fiscal/paises-ddi.ts). Ejecutar únicamente con autorización del responsable, después de NEX-026 y NEX-027:
--   psql -v ON_ERROR_STOP=1 -f verificar-paises-telefonia.sql
-- PROCEDIMIENTO OBJETIVO: aceptar SOLO si la columna 'resultado' de la consulta 1 dice 'COINCIDE' (247 filas y la huella
-- esperada) y la consulta 2 no devuelve filas. Cualquier otro resultado = DIVERGENCIA: no usar el espejo, no reaplicar por
-- suposición; informar a la auditoría. Para ubicar la fila divergente, comparar la consulta 3 con el listado canónico de Git.
-- Huella esperada (= HUELLA_CATALOGO_MD5 de lib/fiscal/paises-ddi.ts y md5 del texto "ISO|Nombre|DDI|ORIGEN" por línea,
-- ordenado por ISO en orden binario, con "\n" final): f46a9ca0a35b41bf6f4d8f5b0fba84e9

-- 1) Conteo y huella
WITH h AS (
  SELECT count(*) AS filas,
         md5(string_agg(iso3 || '|' || nombre || '|' || ddi || '|' ||
             CASE WHEN origen = 'USR' THEN 'USR' || COALESCE(':' || jurisdiccion_iso, '') ELSE 'ISO' END,
             E'\n' ORDER BY iso3 COLLATE "C") || E'\n') AS huella
  FROM public.paises_telefonia
)
SELECT filas, huella,
       CASE WHEN filas = 247 AND huella = 'f46a9ca0a35b41bf6f4d8f5b0fba84e9' THEN 'COINCIDE' ELSE 'DIVERGENCIA' END AS resultado
FROM h;

-- 2) Filas marcadas inactivas (informativo: la validación de la aplicación NO lee esta tabla; debe ser vacío salvo decisión expresa)
SELECT iso3, nombre FROM public.paises_telefonia WHERE NOT activo ORDER BY iso3;

-- 3) Listado ordenado para comparar con Git (diff contra el listado canónico)
SELECT iso3 || '|' || nombre || '|' || ddi || '|' ||
       CASE WHEN origen = 'USR' THEN 'USR' || COALESCE(':' || jurisdiccion_iso, '') ELSE 'ISO' END AS fila
FROM public.paises_telefonia ORDER BY iso3 COLLATE "C";

-- 4) ¿Sigue existiendo la foto de reversión? (debe existir mientras la reversión de NEX-027 pueda ser necesaria)
SELECT to_regclass('public.paises_telefonia_previo_nex027') IS NOT NULL AS foto_de_reversion_presente;
