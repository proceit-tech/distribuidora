-- PRE-VERIFICACIÓN de NEX-065 (estado de emisión por tipo). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-065.sql
-- Cualquier fila con «bloquea = true» significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true) =='
SELECT 'NEX-063 aplicada (series y reserva por tipo)' AS control, to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)') IS NOT NULL AS ok
UNION ALL SELECT 'NEX-064 aplicada (alta única punto + tipo)', to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NOT NULL
UNION ALL SELECT 'NEX-065 ausente (no se reaplica)', to_regclass('public.fe_estado_previo_nex065') IS NULL;

\echo '== 2. Índice único fiscal real (debe existir y tratar la serie NULL como valor: COALESCE(serie, '''')) =='
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documentos_electronicos' AND indexname = 'documentos_electronicos_numero_key';
SELECT 'índice con COALESCE(serie, '''')' AS control, EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documentos_electronicos' AND indexname = 'documentos_electronicos_numero_key'
         AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%empresa_id, tipo, establecimiento, punto_expedicion, numero, COALESCE(serie, ''::text)%') AS ok;

\echo '== 3. BLOQUEOS: identidades fiscales duplicadas hoy (empresa, tipo, establecimiento, punto, serie-o-vacío, número); debe dar 0 filas =='
SELECT empresa_id, tipo, establecimiento, punto_expedicion, coalesce(serie, '') AS serie, numero, count(*) AS veces, true AS bloquea
  FROM public.documentos_electronicos GROUP BY empresa_id, tipo, establecimiento, punto_expedicion, coalesce(serie, ''), numero HAVING count(*) > 1 LIMIT 50;

\echo '== 4. Disponibilidad EFECTIVA actual por tipo (punto.activo AND secuencia.activo) y qué hará la migración =='
SELECT p.empresa_id, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, s.tipo_documento AS tipo, coalesce(s.serie, '(sin serie)') AS serie, s.ultimo_numero,
       p.activo AS punto_activo, s.activo AS tipo_activo, (p.activo AND s.activo) AS efectivo_hoy,
       CASE WHEN s.activo AND NOT p.activo THEN 'pasará a INACTIVO (hoy está bloqueado por el punto: sigue bloqueado)' ELSE 'sin cambio' END AS migracion
  FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
 ORDER BY p.empresa_id, establecimiento, punto, tipo;

\echo '== 5. Garantía: ningún tipo hoy bloqueado quedará habilitado (la migración solo puede pasar a inactivo); filas que se desactivarán =='
SELECT count(*) AS tipos_que_pasaran_a_inactivo FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id WHERE s.activo AND NOT p.activo;

ROLLBACK;
