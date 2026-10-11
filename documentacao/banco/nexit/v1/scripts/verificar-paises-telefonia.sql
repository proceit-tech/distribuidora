-- Verificación SOLO LECTURA (no modifica nada): el espejo SQL debe ser idéntico al catálogo canónico de Git.
-- Ejecutar únicamente con autorización del responsable, después de NEX-026 y NEX-027.
-- Esperado: 247 filas y huella f46a9ca0a35b41bf6f4d8f5b0fba84e9 (= HUELLA_CATALOGO_MD5 de lib/fiscal/paises-ddi.ts).
SELECT count(*) AS filas,
       md5(string_agg(iso3 || '|' || nombre || '|' || ddi || '|' ||
           CASE WHEN origen = 'USR' THEN 'USR' || COALESCE(':' || jurisdiccion_iso, '') ELSE 'ISO' END,
           E'\n' ORDER BY iso3 COLLATE "C") || E'\n') AS huella
FROM public.paises_telefonia;
-- Filas del espejo marcadas inactivas (informativo; la validación NO las lee):
SELECT iso3, nombre FROM public.paises_telefonia WHERE NOT activo ORDER BY iso3;
