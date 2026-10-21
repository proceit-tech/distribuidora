-- PRE-VERIFICACIÓN de NEX-063 (puntos por tipo documental, series y paso entre series). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración
-- (por ejemplo: docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-063.sql). Cualquier fila con «bloquea = true» significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true; "NEX-063 ausente" también) =='
SELECT 'NEX-060 aplicada (fe_punto_secuencias)' AS control, to_regclass('public.fe_punto_secuencias') IS NOT NULL AS ok
UNION ALL SELECT 'NEX-061 aplicada (credenciales del gateway)', to_regclass('public.fe_gateway_credenciales') IS NOT NULL
UNION ALL SELECT 'NEX-062 aplicada (NCE)', to_regclass('public.nce_origen') IS NOT NULL AND to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NOT NULL
UNION ALL SELECT 'NEX-063 ausente (no se reaplica)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'serie');

\echo '== 2. Inventario de puntos y secuencias actuales (se conservan intactos; todas quedan ACTIVAS por tipo) =='
SELECT p.empresa_id, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, p.activo AS punto_activo, s.tipo_documento AS tipo, s.ultimo_numero,
       public.fe_punto_maximo_emitido(p.empresa_id, sc.establecimiento_sifen, p.codigo, s.tipo_documento) AS maximo_emitido_nexit
  FROM public.fe_puntos_expedicion p JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
  LEFT JOIN public.fe_punto_secuencias s ON s.empresa_id = p.empresa_id AND s.punto_id = p.id
 ORDER BY p.empresa_id, establecimiento, punto, tipo;

\echo '== 3. BLOQUEOS: secuencia menor que el máximo ya emitido por Nexit (esa numeración reutilizaría números); debe dar 0 filas =='
SELECT s.empresa_id, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, s.tipo_documento AS tipo, s.ultimo_numero, public.fe_punto_maximo_emitido(s.empresa_id, sc.establecimiento_sifen, p.codigo, s.tipo_documento) AS maximo_emitido, true AS bloquea
  FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
 WHERE s.ultimo_numero < public.fe_punto_maximo_emitido(s.empresa_id, sc.establecimiento_sifen, p.codigo, s.tipo_documento);

\echo '== 4. BLOQUEOS: documentos que ya llevan serie (NEX-063 supone que hasta hoy ninguno la tiene); debe dar 0 filas =='
SELECT empresa_id, tipo, establecimiento, punto_expedicion, serie, numero, true AS bloquea FROM public.documentos_electronicos WHERE serie IS NOT NULL ORDER BY empresa_id, tipo, establecimiento, punto_expedicion, serie, numero LIMIT 50;

\echo '== 5. BLOQUEOS: identidad fiscal (empresa + establecimiento + código) ACTIVA en más de una sucursal; debe dar 0 filas =='
SELECT p.empresa_id, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, count(*) AS puntos_activos, true AS bloquea
  FROM public.fe_puntos_expedicion p JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
 WHERE p.activo AND sc.establecimiento_sifen IS NOT NULL
 GROUP BY p.empresa_id, sc.establecimiento_sifen, p.codigo HAVING count(DISTINCT p.sucursal_id) > 1;

\echo '== 6. Aviso: secuencias de tipos NO emitibles hoy (NRE/NDE/AFE); solo se pueden configurar, la emisión sigue bloqueada =='
SELECT empresa_id, tipo_documento, count(*) AS secuencias FROM public.fe_punto_secuencias WHERE tipo_documento IN ('NRE', 'NDE', 'AFE') GROUP BY empresa_id, tipo_documento;

\echo '== 7. Aviso: números cercanos al fin del rango sin serie (>= 9990000); tras 9999999 el sistema pasará a la serie AA =='
SELECT s.empresa_id, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, s.tipo_documento AS tipo, s.ultimo_numero
  FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
 WHERE s.ultimo_numero >= 9990000;

ROLLBACK;
