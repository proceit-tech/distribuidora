-- CORRECCION PUNTUAL DEL CATALOGO GLOBAL DE UNIDADES DEL NEXIT.
-- La unidad UN ya existe; su unidad_sifen_codigo esta NULL en la VM.
-- 77 = UNI, unidad segun catalogo SIFEN.
-- IMPORTANTE: unidades_medida es GLOBAL (afecta todos los tenants que usan UN).
-- Solo ejecutar tras autorizacion del responsable y respaldo del PostgreSQL.
-- La transaccion verifica unicidad, identidad y estado antes de actualizar.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '20s';

DO $validacion$
DECLARE v_cant integer;
DECLARE v_codigo integer;
BEGIN
 SELECT count(*) INTO v_cant FROM unidades_medida WHERE codigo = 'UN' AND nombre = 'Unidad' AND activo;
 IF v_cant <> 1 THEN
   RAISE EXCEPTION 'ABORTADO: esperada exactamente una unidad UN, nombre Unidad y activa; encontradas %',v_cant;
 END IF;

 SELECT unidad_sifen_codigo INTO v_codigo FROM unidades_medida WHERE codigo='UN' AND nombre='Unidad' AND activo;
 IF v_codigo IS NOT NULL AND v_codigo <> 77 THEN
   RAISE EXCEPTION 'ABORTADO: UN tiene codigo SIFEN %, no se reemplaza automaticamente',v_codigo;
 END IF;

 IF EXISTS (SELECT 1 FROM unidades_medida WHERE codigo <> 'UN' AND unidad_sifen_codigo=77) THEN
   RAISE EXCEPTION 'ABORTADO: codigo SIFEN 77 pertenece a otra unidad; no alterar catalogo';
 END IF;
END $validacion$;

UPDATE unidades_medida
SET unidad_sifen_codigo = 77
WHERE codigo='UN'
  AND nombre='Unidad'
  AND activo
  AND unidad_sifen_codigo IS NULL;

DO $verificacion$
BEGIN
 IF (SELECT count(*) FROM unidades_medida
    WHERE codigo='UN' AND nombre='Unidad' AND activo AND unidad_sifen_codigo=77) <> 1 THEN
   RAISE EXCEPTION 'ABORTADO: unidad UN no quedo vinculada a SIFEN 77';
 END IF;
END $verificacion$;

SELECT id,codigo,nombre,unidad_sifen_codigo,activo
FROM unidades_medida WHERE codigo='UN';
COMMIT;
