-- VERIFICACIÓN POSTERIOR de NEX-081 (PRO-354-R02). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable INMEDIATAMENTE después de aplicar:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-081.sql
--
-- PRO-354-R02-R03 (V001): las comprobaciones sobre el CÓDIGO de las funciones miran solo lo que se EJECUTA (misma técnica que verificar-NEX-080.sql, que no se modifica).
-- pg_get_functiondef/prosrc conservan los comentarios: NEX-081 nombra fe_documento_crear_fe_receptor en un comentario ANTES de la comparación de la unidad base, así que una búsqueda
-- de posición sobre el texto completo daba un falso negativo sobre código correcto. Ahora el cuerpo (prosrc) se limpia así:
--   1) sin comentarios «-- …» ni «/* … */» → codigo_ejecutable (conserva literales: sirve para los marcadores 'NEX:…' y el candado 'movimientos.numero:');
--   2) además, sin literales '…' → codigo_sin_textos (sirve para LLAMADAS y para el ORDEN: un comentario o un mensaje que nombra algo no cuenta).
-- Orden verificado en fe_documento_crear_fe_stock_pendiente (posiciones sobre codigo_sin_textos):
--   · unidad base: lectura del producto FOR SHARE (p.unidad_medida_id INTO v_pr) → comparación IS DISTINCT FROM v_uni (cuyo RAISE lleva NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO)
--     → llamada efectiva a fe_documento_crear_fe_receptor (reserva la numeración);
--   · lotes: primera consulta real a stock_lotes (v_prod, con su RAISE NEX:STOCK_PENDIENTE_LOTE) antes de la llamada → candado pg_advisory_xact_lock('movimientos.numero:')
--     → SEGUNDA consulta real a stock_lotes (r.producto_id, con su RAISE NEX:STOCK_PENDIENTE_LOTE) → INSERT del pendiente.
-- Las filas «detector» prueban el limpiado y el orden con textos de muestra: comentario que nombra la llamada antes del marcador = sigue bien; comparación tras numerar, comparación
-- solo en un literal, segunda comprobación de lotes solo comentada o antes del candado = mal. Si un detector falla, su fila da ok = false y la verificación no se da por buena.
-- Condición del limpiado, revisada en la fuente de NEX-081: sus cuerpos no tienen «--» ni «/*» dentro de literales ni literales con $tag$ internos.
-- No se quitó ningún control ni se fuerza ningún resultado: solo cambia QUÉ texto se inspecciona.
-- PRO-354-R02-R04 (rectificación: la venta ocurre al emitir; PRO-310 cancelada): controles nuevos, sin quitar ninguno:
--   · elegibilidad EXACTA de la confirmación manual, el MISMO predicado en fe_stock_pendiente_confirmar y en o_fe_confirmable del listado (código ejecutable): estado_local 'ENVIADO' y
--     estado_sifen en ('SIN_CONSULTA', 'PENDIENTE', 'APROBADO', 'RECHAZADO'); RECHAZADO (rechazo fiscal definitivo) admitido, ningún otro estado agregado (CANCELADO, INUTILIZADO,
--     NO_RECONOCIDO y los estados locales de error técnico siguen fuera). Detectores: predicado R04 correcto = true; lista anterior sin RECHAZADO, lista ampliada con CANCELADO y predicado
--     solo comentado = false.
--   · ninguna respuesta fiscal mueve stock: las funciones instaladas que registran envíos y consultas (fe_documento_registrar_envio%, fe_documento_registrar_consulta%) y los triggers de
--     documentos_electronicos no referencian, en código ejecutable, el motor de movimientos, saldos, movimientos, la baja de la FE ni las bajas pendientes.
BEGIN READ ONLY;
WITH fuente(nombre, src) AS (
  SELECT 'MUESTRA_ORDEN_OK', E'BEGIN\n  -- la unidad se compara antes de fe_documento_crear_fe_receptor (este comentario nombra la función antes del marcador)\n  SELECT p.activo, p.controla_stock, p.unidad_medida_id INTO v_pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE;\n  IF v_pr.unidad_medida_id IS DISTINCT FROM v_uni THEN\n    RAISE EXCEPTION ''la unidad base cambió'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'';\n  END IF;\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  SELECT c.o_documento_id INTO v_id FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario) c;\n  PERFORM pg_advisory_xact_lock(hashtextextended(''movimientos.numero:'' || p_empresa::text, 0));\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = r.producto_id) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id) VALUES (p_empresa, v_id);\nEND'
  UNION ALL SELECT 'MUESTRA_UNIDAD_TRAS_NUMERAR', E'BEGIN\n  SELECT p.activo, p.controla_stock, p.unidad_medida_id INTO v_pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE;\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  SELECT c.o_documento_id INTO v_id FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario) c;\n  IF v_pr.unidad_medida_id IS DISTINCT FROM v_uni THEN\n    RAISE EXCEPTION ''la unidad base cambió'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'';\n  END IF;\n  PERFORM pg_advisory_xact_lock(hashtextextended(''movimientos.numero:'' || p_empresa::text, 0));\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = r.producto_id) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id) VALUES (p_empresa, v_id);\nEND'
  UNION ALL SELECT 'MUESTRA_UNIDAD_EN_LITERAL', E'BEGIN\n  SELECT p.activo, p.controla_stock, p.unidad_medida_id INTO v_pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE;\n  RAISE NOTICE ''IF v_pr.unidad_medida_id IS DISTINCT FROM v_uni THEN NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'';\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  SELECT c.o_documento_id INTO v_id FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario) c;\n  PERFORM pg_advisory_xact_lock(hashtextextended(''movimientos.numero:'' || p_empresa::text, 0));\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = r.producto_id) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id) VALUES (p_empresa, v_id);\nEND'
  UNION ALL SELECT 'MUESTRA_LOTE_SOLO_COMENTADO', E'BEGIN\n  SELECT p.activo, p.controla_stock, p.unidad_medida_id INTO v_pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE;\n  IF v_pr.unidad_medida_id IS DISTINCT FROM v_uni THEN\n    RAISE EXCEPTION ''la unidad base cambió'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'';\n  END IF;\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  SELECT c.o_documento_id INTO v_id FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario) c;\n  PERFORM pg_advisory_xact_lock(hashtextextended(''movimientos.numero:'' || p_empresa::text, 0));\n  -- IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = r.producto_id) THEN\n  -- RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  -- END IF;\n  INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id) VALUES (p_empresa, v_id);\nEND'
  UNION ALL SELECT 'MUESTRA_LOTE_ANTES_DEL_CANDADO', E'BEGIN\n  SELECT p.activo, p.controla_stock, p.unidad_medida_id INTO v_pr FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE;\n  IF v_pr.unidad_medida_id IS DISTINCT FROM v_uni THEN\n    RAISE EXCEPTION ''la unidad base cambió'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'';\n  END IF;\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  SELECT c.o_documento_id INTO v_id FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario) c;\n  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = r.producto_id) THEN\n    RAISE EXCEPTION ''controla lotes'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:STOCK_PENDIENTE_LOTE'';\n  END IF;\n  PERFORM pg_advisory_xact_lock(hashtextextended(''movimientos.numero:'' || p_empresa::text, 0));\n  INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id) VALUES (p_empresa, v_id);\nEND'
  UNION ALL SELECT 'MUESTRA_ELEG_R04_OK', E'BEGIN\n  -- antes: v_doc.estado_sifen NOT IN (''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'')\n  IF v_doc.estado_local IS DISTINCT FROM ''ENVIADO'' OR v_doc.estado_sifen NOT IN (''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'', ''RECHAZADO'') THEN\n    RAISE EXCEPTION ''no confirmable'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:PENDIENTE_FE_NO_CONFIRMABLE'';\n  END IF;\nEND'
  UNION ALL SELECT 'MUESTRA_ELEG_SIN_RECHAZADO', E'BEGIN\n  IF v_doc.estado_local IS DISTINCT FROM ''ENVIADO'' OR v_doc.estado_sifen NOT IN (''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'') THEN\n    RAISE EXCEPTION ''no confirmable'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:PENDIENTE_FE_NO_CONFIRMABLE'';\n  END IF;\nEND'
  UNION ALL SELECT 'MUESTRA_ELEG_AMPLIADA', E'BEGIN\n  IF v_doc.estado_local IS DISTINCT FROM ''ENVIADO'' OR v_doc.estado_sifen NOT IN (''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'', ''RECHAZADO'', ''CANCELADO'') THEN\n    RAISE EXCEPTION ''no confirmable'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:PENDIENTE_FE_NO_CONFIRMABLE'';\n  END IF;\nEND'
  UNION ALL SELECT 'MUESTRA_ELEG_COMENTADA', E'BEGIN\n  -- IF v_doc.estado_local IS DISTINCT FROM ''ENVIADO'' OR v_doc.estado_sifen NOT IN (''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'', ''RECHAZADO'') THEN\n  --   RAISE EXCEPTION ''no confirmable'' USING ERRCODE = ''P0001'', DETAIL = ''NEX:PENDIENTE_FE_NO_CONFIRMABLE'';\n  -- END IF;\n  NULL;\nEND'
  UNION ALL SELECT f.nombre, p.prosrc
  FROM (VALUES
    ('crear', 'public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'),
    ('confirmar', 'public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)'),
    ('listar', 'public.fe_stock_pendientes_listar(uuid,uuid,text,uuid,uuid,text,integer,integer)'),
    ('filtros', 'public.fe_stock_pendientes_filtros(uuid,uuid)'),
    ('baja', 'public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)')
  ) AS f(nombre, firma)
  JOIN pg_proc p ON p.oid = f.firma::regprocedure
), ejecutable AS (
  SELECT nombre, regexp_replace(regexp_replace(src, '--[^\n]*', ' ', 'g'), '/\*.*?\*/', ' ', 'g') AS codigo_ejecutable FROM fuente
), codigo AS (
  SELECT nombre, codigo_ejecutable, regexp_replace(codigo_ejecutable, '''([^'']|'''')*''', ' ', 'g') AS codigo_sin_textos FROM ejecutable
), orden AS (
  SELECT nombre, codigo_ejecutable, codigo_sin_textos,
         strpos(codigo_sin_textos, 'p.unidad_medida_id INTO v_pr') AS p_lee,
         strpos(codigo_sin_textos, 'IS DISTINCT FROM v_uni') AS p_compara,
         strpos(codigo_sin_textos, 'l.producto_id = v_prod') AS p_lote1,
         strpos(codigo_sin_textos, 'fe_documento_crear_fe_receptor') AS p_llamada,
         strpos(codigo_sin_textos, 'pg_advisory_xact_lock') AS p_candado,
         strpos(codigo_sin_textos, 'l.producto_id = r.producto_id') AS p_lote2,
         strpos(codigo_sin_textos, 'INSERT INTO public.documento_electronico_stock_pendientes') AS p_insert
    FROM codigo
), evaluacion AS (
  SELECT nombre,
         (codigo_sin_textos ~ 'p\.unidad_medida_id INTO v_pr FROM public\.productos p WHERE p\.empresa_id = p_empresa AND p\.id = v_prod FOR SHARE'
          AND codigo_ejecutable ~ 'IS DISTINCT FROM v_uni[[:space:]]+THEN[[:space:]]+RAISE EXCEPTION[^;]*''NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'''
          AND codigo_sin_textos ~* '(^|[^a-z0-9_$])"?fe_documento_crear_fe_receptor"?[[:space:]]*\('
          AND p_lee > 0 AND p_lee < p_compara AND p_compara < p_llamada) AS unidad_ok,
         (codigo_ejecutable ~ 'stock_lotes l WHERE l\.empresa_id = p_empresa AND l\.producto_id = v_prod\)[[:space:]]+THEN[[:space:]]+RAISE EXCEPTION[^;]*''NEX:STOCK_PENDIENTE_LOTE'''
          AND codigo_ejecutable ~ 'stock_lotes l WHERE l\.empresa_id = p_empresa AND l\.producto_id = r\.producto_id\)[[:space:]]+THEN[[:space:]]+RAISE EXCEPTION[^;]*''NEX:STOCK_PENDIENTE_LOTE'''
          AND codigo_ejecutable ~ 'pg_advisory_xact_lock[[:space:]]*\([[:space:]]*hashtextextended[[:space:]]*\([[:space:]]*''movimientos\.numero:'''
          AND p_lote1 > 0 AND p_lote1 < p_llamada AND p_llamada < p_candado AND p_candado < p_lote2 AND p_lote2 < p_insert) AS lotes_ok,
         -- R02-R04: elegibilidad exacta de la confirmación (lista cerrada; el «\)» final impide estados agregados).
         (codigo_ejecutable ~ 'v_doc\.estado_local IS DISTINCT FROM ''ENVIADO'' OR v_doc\.estado_sifen NOT IN \(''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'', ''RECHAZADO''\)[[:space:]]+THEN[[:space:]]+RAISE EXCEPTION[^;]*''NEX:PENDIENTE_FE_NO_CONFIRMABLE''') AS elegibilidad_confirmar_ok,
         (codigo_ejecutable ~ 'd\.estado_local = ''ENVIADO'' AND d\.estado_sifen IN \(''SIN_CONSULTA'', ''PENDIENTE'', ''APROBADO'', ''RECHAZADO''\)\)') AS elegibilidad_listar_ok
    FROM orden
), fiscal AS (
  -- R02-R04: registro de envíos/consultas instalado y triggers de documentos_electronicos, en código ejecutable.
  SELECT p.proname::text AS nombre, regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g'), '/\*.*?\*/', ' ', 'g') AS codigo_ejecutable
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'fe\_documento\_registrar\_envio%' OR p.proname LIKE 'fe\_documento\_registrar\_consulta%')
  UNION ALL
  SELECT 'trigger:' || t.tgname, regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g'), '/\*.*?\*/', ' ', 'g')
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.documentos_electronicos'::regclass AND NOT t.tgisinternal
)
SELECT 'detector: un comentario que nombra fe_documento_crear_fe_receptor ANTES del marcador no adelanta la llamada (orden correcto = true)' AS control,
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_ORDEN_OK' AND unidad_ok AND lotes_ok) AS ok
UNION ALL SELECT 'detector: comparar la unidad DESPUÉS de reservar numeración se rechaza',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_UNIDAD_TRAS_NUMERAR' AND NOT unidad_ok)
UNION ALL SELECT 'detector: una comparación de unidad que solo aparece en un literal no cuenta',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_UNIDAD_EN_LITERAL' AND NOT unidad_ok)
UNION ALL SELECT 'detector: la segunda comprobación de lotes solo comentada no cuenta',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_LOTE_SOLO_COMENTADO' AND NOT lotes_ok)
UNION ALL SELECT 'detector: la segunda comprobación de lotes ANTES del candado de numeración se rechaza',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_LOTE_ANTES_DEL_CANDADO' AND NOT lotes_ok)
UNION ALL SELECT 'detector R02-R04: el predicado de elegibilidad con RECHAZADO se reconoce (= true)',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_ELEG_R04_OK' AND elegibilidad_confirmar_ok)
UNION ALL SELECT 'detector R02-R04: la lista anterior sin RECHAZADO no cuenta',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_ELEG_SIN_RECHAZADO' AND NOT elegibilidad_confirmar_ok)
UNION ALL SELECT 'detector R02-R04: una lista ampliada (CANCELADO) se rechaza',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_ELEG_AMPLIADA' AND NOT elegibilidad_confirmar_ok)
UNION ALL SELECT 'detector R02-R04: el predicado solo comentado no cuenta',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'MUESTRA_ELEG_COMENTADA' AND NOT elegibilidad_confirmar_ok)
UNION ALL SELECT 'R02-R04: la confirmación admite FE ENVIADA con rechazo fiscal definitivo (RECHAZADO) y ningún otro estado nuevo (código ejecutable)',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'confirmar' AND elegibilidad_confirmar_ok)
UNION ALL SELECT 'R02-R04: el listado marca confirmable con el MISMO predicado (o_fe_confirmable, código ejecutable)',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'listar' AND elegibilidad_listar_ok)
UNION ALL SELECT 'R02-R04: ninguna respuesta fiscal mueve stock (registro de envío/consulta y triggers de documentos_electronicos sin motor, saldos, movimientos ni bajas)',
       EXISTS (SELECT 1 FROM fiscal WHERE nombre LIKE 'fe\_documento\_registrar\_consulta%')
       AND NOT EXISTS (SELECT 1 FROM fiscal WHERE codigo_ejecutable ~* '(inventario_registrar_movimiento|inventario_anular_movimiento|stock_saldos|movimientos_inventario|fe_stock_baja_documento|documento_electronico_stock_pendientes|fe_stock_pendiente_confirmar)')
UNION ALL SELECT 'funciones inspeccionadas presentes (5)', (SELECT count(*) FROM codigo WHERE nombre NOT LIKE 'MUESTRA\_%') = 5
UNION ALL SELECT 'empresas.bloquear_stock_insuficiente boolean NOT NULL DEFAULT true',
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'bloquear_stock_insuficiente'
               AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'true')
UNION ALL SELECT 'al aplicar, TODAS las empresas quedan en TRUE (comportamiento actual)', NOT EXISTS (SELECT 1 FROM public.empresas WHERE NOT bloquear_stock_insuficiente)
UNION ALL SELECT 'tabla documento_electronico_stock_pendientes con PK propia', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND contype = 'p')
UNION ALL SELECT 'conciliación descontado + pendiente = facturado (CHECK)', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_cantidades_chk')
UNION ALL SELECT 'un pendiente por FE y producto (UNIQUE)', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_documento_producto_uk')
UNION ALL SELECT 'triggers de inmutabilidad y de movimiento vinculado',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_inmutable_trg' AND NOT tgisinternal) AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendiente_movimiento_protegido_trg' AND NOT tgisinternal)
UNION ALL SELECT 'R01: la obligación congela unidad base y sucursal (columnas NOT NULL + FK de sucursal)',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_stock_pendientes'
          AND column_name IN ('unidad_medida_id', 'sucursal_id') AND is_nullable = 'NO') = 2
       AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_sucursal_fk')
UNION ALL SELECT 'R01: guardas de producto (unidad/control/estado) y de depósito (sucursal/estado/terceros)',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_producto_guarda_trg' AND tgrelid = 'public.productos'::regclass AND NOT tgisinternal)
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_deposito_guarda_trg' AND tgrelid = 'public.depositos'::regclass AND NOT tgisinternal)
UNION ALL SELECT 'R01: la confirmación no bloquea costo/saldo antes del motor y referencia la serie (código ejecutable)',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'confirmar' AND strpos(codigo_sin_textos, 'inventario_costos') = 0 AND strpos(codigo_sin_textos, 'v_doc.serie') > 0)
UNION ALL SELECT 'R01: el registro del faltante toma el candado de numeración de movimientos (llamada efectiva con el literal ''movimientos.numero:'')',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'crear'
               AND codigo_ejecutable ~ 'pg_advisory_xact_lock[[:space:]]*\([[:space:]]*hashtextextended[[:space:]]*\([[:space:]]*''movimientos\.numero:''')
UNION ALL SELECT 'R02-R02/V001: unidad base revisada leída FOR SHARE y comparada (NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO) ANTES de la llamada efectiva que reserva numeración',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'crear' AND unidad_ok)
UNION ALL SELECT 'R02-R02/V001: lotes comprobados antes de numerar y RE-COMPROBADOS con una consulta real después del candado y antes del INSERT del pendiente',
       EXISTS (SELECT 1 FROM evaluacion WHERE nombre = 'crear' AND lotes_ok)
UNION ALL SELECT 'R02-R02: listado y filtros usan el alcance histórico (deposito_en_alcance); la confirmación sigue exigiendo alcance operativo y depósito activo (código ejecutable)',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'listar' AND codigo_sin_textos ~* 'deposito_en_alcance[[:space:]]*\(' AND codigo_sin_textos !~* 'usuario_puede_deposito')
       AND EXISTS (SELECT 1 FROM codigo WHERE nombre = 'filtros' AND codigo_sin_textos ~* 'deposito_en_alcance[[:space:]]*\(' AND codigo_sin_textos !~* 'usuario_puede_deposito')
       AND EXISTS (SELECT 1 FROM codigo WHERE nombre = 'confirmar' AND codigo_sin_textos ~* 'usuario_puede_deposito[[:space:]]*\(' AND strpos(codigo_sin_textos, 'NOT v_dp.activo') > 0)
UNION ALL SELECT 'PK histórica de documento_electronico_stock_salidas intacta (empresa, documento, depósito)',
       EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.documento_electronico_stock_salidas'::regclass AND c.contype = 'p' AND array_length(c.conkey, 1) = 3)
UNION ALL SELECT 'baja redefinida: lee la preparación y concilia pendientes (código ejecutable)',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'baja' AND strpos(codigo_sin_textos, 'fe_stock_pendientes_preparacion') > 0)
UNION ALL SELECT 'stock_saldos conserva su CHECK de cantidad no negativa (NEX-081 no lo toca)',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.stock_saldos'::regclass AND conname = 'stock_saldos_cant_chk' AND pg_get_constraintdef(oid) LIKE '%cantidad >= %0%')
UNION ALL SELECT 'tablas sin pendientes ni preparación al aplicar',
       NOT EXISTS (SELECT 1 FROM public.documento_electronico_stock_pendientes) AND NOT EXISTS (SELECT 1 FROM public.fe_stock_pendientes_preparacion)
UNION ALL SELECT 'la aplicación NO accede a las tablas nuevas',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_stock_pendientes', 'SELECT,INSERT,UPDATE,DELETE')
           AND NOT has_table_privilege('nexit_runtime', 'public.fe_stock_pendientes_preparacion', 'SELECT,INSERT,UPDATE,DELETE'))
UNION ALL SELECT 'la aplicación NO ejecuta la baja interna', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR NOT has_function_privilege('nexit_runtime', 'public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)', 'EXECUTE')
UNION ALL SELECT 'la aplicación ejecuta las 6 funciones públicas de NEX-081',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_function_privilege('nexit_runtime', 'public.fe_politica_stock_actualizar(uuid,uuid,boolean)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_politica_contexto(uuid,uuid,uuid,uuid[])', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendientes_listar(uuid,uuid,text,uuid,uuid,text,integer,integer)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendientes_filtros(uuid,uuid)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)', 'EXECUTE'))
UNION ALL SELECT 'PUBLIC no ejecuta las funciones nuevas',
       NOT has_function_privilege('public', 'public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_stock_pendientes_filtros(uuid,uuid)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_stock_pendientes_producto_guarda()', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)', 'EXECUTE')
UNION ALL SELECT 'la emisión de siempre (receptor) sigue disponible para la aplicación (política TRUE sin cambios)',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)', 'EXECUTE');
ROLLBACK;
