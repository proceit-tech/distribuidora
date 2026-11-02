-- =====================================================================
-- NEX-058 — Facturación (PRO-129, AUD-PRO129-R02-01): protege sucursales.establecimiento_sifen una vez que la sucursal tiene puntos de expedición o documentos electrónicos.
-- Requiere NEX-057 (gestión de puntos con identidad fiscal única). Incremental: NO edita NEX-001…057. Es una migración APARTE (y no un cambio en NEX-057) porque no se puede confirmar si NEX-057
-- ya fue aplicada en el banco real: así funciona tanto si NEX-057 está instalada como si se aplican ambas en orden. Reversión: scripts/reversion-NEX-058.sql.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo y consulta del historial real schema_migrations). ESTADO: versionada y NO aplicada.
--
-- Problema: NEX-057 garantiza que dos puntos ACTIVOS no compartan la identidad fiscal (empresa + establecimiento + código) PERO la identidad se calcula con sucursales.establecimiento_sifen, que NEX-002
-- permite modificar libremente. Cambiar después el establecimiento de una sucursal con puntos convertiría identidades distintas en iguales (contadores independientes que colisionan) y desvincularía
-- los puntos de los documentos ya emitidos con el establecimiento anterior.
--
-- Solución (preferida por la auditoría): mientras la sucursal tenga puntos de expedición (en cualquier estado) o documentos electrónicos, NO se puede cambiar su establecimiento SIFEN (ni a otro valor ni a
-- NULL). Un cambio futuro exigirá un proceso administrativo fiscal específico (no existe: se creará una sucursal nueva con el nuevo establecimiento). Una sucursal SIN puntos ni documentos conserva su
-- comportamiento (puede fijar, cambiar o quitar el establecimiento). Reasignar el MISMO valor es un no-op permitido. El reinicio DEMO queda exento (borra los puntos y documentos).
-- NO impone unicidad global de establecimiento entre sucursales, NO borra puntos, NO reinicia numeración y NO toca fe_documento_crear_fe (NEX-048) ni las funciones de NEX-057.
--
-- Locks: el UPDATE de la sucursal toma el bloqueo de su fila; un trigger BEFORE INSERT en fe_puntos_expedicion toma FOR SHARE sobre esa fila, de modo que un alta de punto en curso y un cambio de
-- establecimiento se serializan: si el punto se inserta primero, el UPDATE espera y luego es rechazado; si el UPDATE gana, el alta ve el establecimiento nuevo al activar (la activación vuelve a comprobar la
-- identidad con el valor vigente y el trigger de NEX-057 impide dos activos con la misma identidad). Sin riesgo de deadlock: el UPDATE no toma el advisory lock de identidad.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)') IS NULL OR to_regprocedure('public.fe_punto_identidad_en_uso(uuid,text,text,uuid,uuid,boolean)') IS NULL
     OR to_regclass('public.fe_puntos_expedicion_log') IS NULL THEN
    RAISE EXCEPTION 'NEX-058 requiere NEX-057 en su versión con identidad fiscal única (fe_punto_identidad_en_uso).';
  END IF;
  IF to_regprocedure('public.fe_sucursal_establecimiento_protegido()') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-058 parece aplicada (la función de protección ya existe); no se reaplica por suposición.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_sucursal_establecimiento_protegido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.establecimiento_sifen IS NOT DISTINCT FROM OLD.establecimiento_sifen THEN
    RETURN NEW;
  END IF;
  IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_puntos_expedicion WHERE empresa_id = OLD.empresa_id AND sucursal_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE empresa_id = OLD.empresa_id AND sucursal_id = OLD.id) THEN
    RAISE EXCEPTION 'el establecimiento SIFEN de una sucursal con puntos de expedición o documentos electrónicos no se puede cambiar: altere la identidad fiscal y la continuidad de la numeración. Cree una sucursal nueva con el nuevo establecimiento.'
      USING ERRCODE = 'P0001', DETAIL = 'NEX:ESTABLECIMIENTO_CON_PUNTOS';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sucursales_establecimiento_protegido_trg BEFORE UPDATE OF establecimiento_sifen ON public.sucursales
  FOR EACH ROW EXECUTE FUNCTION public.fe_sucursal_establecimiento_protegido();

-- Serializa el alta de un punto con un cambio de establecimiento en curso (ver «Locks»): el INSERT toma FOR SHARE sobre la fila de la sucursal hasta el fin de su transacción.
CREATE OR REPLACE FUNCTION public.fe_puntos_expedicion_bloquea_sucursal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.sucursales WHERE empresa_id = NEW.empresa_id AND id = NEW.sucursal_id FOR SHARE;
  RETURN NEW;
END $$;

CREATE TRIGGER fe_puntos_expedicion_bloquea_sucursal_trg BEFORE INSERT ON public.fe_puntos_expedicion
  FOR EACH ROW EXECUTE FUNCTION public.fe_puntos_expedicion_bloquea_sucursal();

REVOKE ALL ON FUNCTION public.fe_sucursal_establecimiento_protegido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_puntos_expedicion_bloquea_sucursal() FROM PUBLIC;
