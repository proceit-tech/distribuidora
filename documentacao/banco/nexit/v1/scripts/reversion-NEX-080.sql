-- =====================================================================
-- REVERSIÓN PROTEGIDA de NEX-080 (PRO-342-R05). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-080.sql
-- Antes, desplegar una versión de la aplicación que NO use las funciones *_r05 (la R05 se niega a consultar/enviar sin ellas: no hay fallback silencioso).
-- La reversión ABORTA sin cambiar nada si:
--   · hay intentos con evidencia R05 (cdc_proyeccion / cdc_anterior): es evidencia append-only, no se borra;
--   · algún CDC guardado (documentos, intentos o nce_origen) no cumple las restricciones anteriores (44 dígitos / coherencia): las reglas antiguas no admiten ese dato y no se descarta.
-- Restaura EXACTAMENTE las definiciones respaldadas al aplicar NEX-080 (nex080_respaldo). Después borrar la fila 'NEX-080' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.nex080_respaldo') IS NULL THEN
    RAISE EXCEPTION 'NEX-080 no está aplicada (nex080_respaldo no existe): nada que revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE cdc_proyeccion IS NOT NULL OR cdc_anterior IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay intentos con evidencia de proyección del CDC (R05): la reversión no borra evidencia. Mantener NEX-080.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE cdc IS NOT NULL AND (cdc !~ '^[0-9]{44}$' OR NOT public.fe_cdc_coherente(tipo, establecimiento, punto_expedicion, numero, cdc)))
     OR EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE cdc_informado IS NOT NULL AND cdc_informado !~ '^[0-9]{44}$')
     OR EXISTS (SELECT 1 FROM public.nce_origen WHERE fe_cdc !~ '^[0-9]{44}$') THEN
    RAISE EXCEPTION 'Hay CDC informados por la API que las restricciones anteriores no admiten: la reversión no los descarta ni los modifica. Mantener NEX-080.';
  END IF;
  IF (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'FUNCION') <> 2 OR (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'RESTRICCION') <> 4 THEN
    RAISE EXCEPTION 'Respaldo de NEX-080 incompleto: no se revierte por suposición.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_cdc_dato_api();
DROP FUNCTION IF EXISTS public.fe_documento_registrar_envio_r05(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_auto_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_flujo_nce_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_nucleo_r05(text, uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fe_cdc_proyectar_r05(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.fe_cdc_texto_r05(text);

-- Definiciones anteriores EXACTAS (pg_get_functiondef al aplicar NEX-080): trigger de NEX-047 y fe_documento_crear_nce de NEX-070. CREATE OR REPLACE conserva los privilegios.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT definicion FROM public.nex080_respaldo WHERE clase = 'FUNCION' LOOP
    EXECUTE r.definicion;
  END LOOP;
END $$;

ALTER TABLE public.documento_electronico_intentos DROP CONSTRAINT documento_electronico_intentos_cdc_cambio_chk;
ALTER TABLE public.documento_electronico_intentos DROP COLUMN cdc_proyeccion, DROP COLUMN cdc_anterior;
ALTER TABLE public.documentos_electronicos DROP CONSTRAINT documentos_electronicos_cdc_texto_chk;
ALTER TABLE public.documento_electronico_intentos DROP CONSTRAINT documento_electronico_intentos_cdc_informado_texto_chk;
ALTER TABLE public.nce_origen DROP CONSTRAINT nce_origen_fe_cdc_texto_chk;

-- Restricciones anteriores con su nombre y definición exactos (se validan contra los datos: si algo no cumple, la transacción entera se deshace).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tabla, nombre, definicion FROM public.nex080_respaldo WHERE clase = 'RESTRICCION' LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tabla, r.nombre, r.definicion);
  END LOOP;
END $$;

DROP TABLE public.nex080_respaldo;
