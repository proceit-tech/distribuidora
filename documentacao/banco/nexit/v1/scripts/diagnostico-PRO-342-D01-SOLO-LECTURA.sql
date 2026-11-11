-- =====================================================================================================================================================
-- PRO-342-D01 — DIAGNÓSTICO DE SOLO LECTURA del flujo fiscal CASA MINGO (FE 001-001-0000001 serie AA + FE 001-003-0009018..0009021).
-- NO es una migración. NO modifica datos, NO llama funciones que escriben, NO llama al gateway. La sesión se fija en READ ONLY: cualquier escritura falla.
-- Preparado por Claude SIN ejecutar (sin acceso a la base). Lo ejecuta SOLO el responsable, con su autorización, en el ambiente real.
--
-- Ejecución (desde el clone Git de la VM, ver documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md):
--   cd /tmp/nexit-instalacao
--   docker exec -i nexit-db psql -U nexit_app -d nexit -X -v empresa=<UUID_EMPRESA_CASA_MINGO> \
--     < documentacao/banco/nexit/v1/scripts/diagnostico-PRO-342-D01-SOLO-LECTURA.sql > /tmp/PRO-342-D01-salida.txt 2>&1
--   NO usar -v ON_ERROR_STOP=1: si una sección depende de una migración no aplicada (p. ej. NEX-077), falla sola y las siguientes continúan.
--   Sección 13 de credenciales DESHABILITADA: no hay lectura ni comparación de passwords ni reconstrucción de lote, aunque se pase una variable extra.
--
-- Privacidad: no imprime contraseña, token, payload completo, CDC completo ni lote completo. Imprime sólo documentos de la empresa autorizada (no cruza tenants): identidad fiscal (EEE-PPP-NNNNNNN,
-- serie, fecha), RUC/DV de la propia empresa (dato público) y segmentos NO secretos del lote/CDC. Revisar la salida antes de compartirla.
-- =====================================================================================================================================================

\if :{?empresa}
\else
  \echo 'ABORTADO: falta -v empresa=<UUID>. No se ejecutó ninguna consulta.'
  \quit
\endif

SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
SET statement_timeout = '30s';
\pset pager off
\pset null '(null)'

\echo '== 0) Contexto de la sesión (debe decir read_only = on) =='
SELECT now() AS ejecutado_at, current_user AS usuario_db, current_setting('transaction_read_only') AS read_only, current_setting('TimeZone') AS zona;

\echo '== 1) Empresa (identidad fiscal propia; dato público) =='
SELECT e.id, e.codigo, e.razon_social, e.ruc, e.dv FROM public.empresas e WHERE e.id = :'empresa'::uuid;

\echo '== 2) Migraciones registradas por el runner (NEX-045 en adelante) =='
SELECT * FROM public.schema_migrations WHERE version >= 'NEX-045' ORDER BY version;

\echo '== 3) Presencia de objetos NEX-062 / NEX-077 / NEX-078 (catálogo; no invoca funciones) =='
SELECT 'NEX-062 fe_consulta_reservar' AS objeto, to_regprocedure('public.fe_consulta_reservar(integer,integer,text[])') IS NOT NULL AS existe
UNION ALL SELECT 'NEX-062 documentos.proxima_consulta_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_electronicos' AND column_name='proxima_consulta_at')
UNION ALL SELECT 'NEX-077 documentos.consulta_lease_token', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_electronicos' AND column_name='consulta_lease_token')
UNION ALL SELECT 'NEX-077 fe_consulta_reservar_token', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fe_consulta_reservar_token')
UNION ALL SELECT 'NEX-077 fe_documento_registrar_consulta_auto', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fe_documento_registrar_consulta_auto')
UNION ALL SELECT 'NEX-078 empresas.fe_max_lineas', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empresas' AND column_name='fe_max_lineas')
UNION ALL SELECT 'NEX-063 fe_punto_secuencias.serie', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fe_punto_secuencias' AND column_name='serie')
UNION ALL SELECT 'NEX-069 fe_gateway_url_valida', to_regprocedure('public.fe_gateway_url_valida(text)') IS NOT NULL;

\echo '== 4) Huella (md5) de las funciones fiscales REALES, para comparar con el Git (no revela datos) =='
SELECT p.oid::regprocedure AS funcion, md5(pg_get_functiondef(p.oid)) AS md5_definicion
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('fe_documento_registrar_envio','fe_documento_iniciar_envio','fe_documento_registrar_consulta',
       'fe_documento_registrar_consulta_flujo_nce','fe_documento_registrar_consulta_auto','fe_consulta_reservar','fe_consulta_reservar_token',
       'fe_gateway_config_guardar','fe_gateway_credenciales_leer','fe_documento_crear_fe','fe_secuencia_reservar','fe_cdc_coherente')
 ORDER BY 1;

\echo '== 5) Documentos: identidad, estados, lote (= orden §3.1) =='
SELECT d.id, d.sucursal_id, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie, d.fecha_emision,
       d.estado_local, d.estado_sifen, d.ultima_consulta_resultado, d.ultima_consulta_at, d.estado_gateway_texto, d.cod_respuesta,
       (d.cdc IS NOT NULL) AS tiene_cdc, length(d.lote) AS largo_lote, position('[omitido]' IN coalesce(d.lote, '')) > 0 AS lote_mutilado
  FROM public.documentos_electronicos d
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
     OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
 ORDER BY d.fecha_emision DESC;

\echo '== 6) Intentos ENVIO/CONSULTA, cronológico (= orden §3.2 + actor) =='
SELECT d.punto_expedicion, d.numero, d.serie, i.id AS intento_id, i.tipo, i.creado_at, i.resultado, i.fase, i.http_status,
       i.estado_gateway, i.estado_sifen, i.cod_respuesta, left(coalesce(i.mensaje, ''), 120) AS mensaje_resumido,
       i.actor_id, (i.request_id IS NOT NULL) AS tiene_request_id_local,
       length(i.lote) AS largo_lote, position('[omitido]' IN coalesce(i.lote, '')) > 0 AS lote_mutilado,
       (i.cdc_informado IS NOT NULL) AS cdc_informado_presente,
       position('[omitido]' IN coalesce(i.respuesta #>> '{response,DE,CDC}', '')) > 0 AS cdc_json_mutilado,
       i.respuesta #>> '{response,Estado}' AS estado_gateway_json, i.respuesta #>> '{status}' AS status_body
  FROM public.documento_electronico_intentos i
  JOIN public.documentos_electronicos d ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
     OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
 ORDER BY d.numero, i.creado_at, i.id;

\echo '== 7) Estructura del lote y del CDC recibidos (segmentos NO secretos; RUC solo como booleano contra la empresa) =='
-- Lote documentado del proveedor: RUC-iTiDE-EEE-PPP-NNNNNNN-AAAAMMDDhhmmss-aleatorio. CDC SIFEN 44: tipo(1-2) RUC(3-10) DV(11) EEE(12-14) PPP(15-17) NUM(18-24)
-- tipoContrib(25) fecha emisión AAAAMMDD(26-33) ... Si «[omitido]» (9 caracteres) sustituyó al RUC (8), los segmentos posteriores se desplazan +1.
SELECT d.punto_expedicion, d.numero, d.serie, i.tipo, i.creado_at, i.resultado,
       i.lote ~ '^\[omitido\]-[0-9]+-[0-9]{3}-[0-9]{3}-[0-9]{7}-[0-9]{14}-[0-9]+$' AS lote_omitido_solo_en_ruc,
       split_part(i.lote, '-', 1) = lpad(e.ruc, 8, '0') OR split_part(i.lote, '-', 1) = e.ruc AS lote_ruc_igual_empresa,
       split_part(i.lote, '-', 2) AS lote_tipo_de,
       split_part(i.lote, '-', 3) || '-' || split_part(i.lote, '-', 4) || '-' || split_part(i.lote, '-', 5) AS lote_numero_fiscal,
       split_part(i.lote, '-', 6) AS lote_timestamp,
       coalesce(i.respuesta ->> 'nro_lote', '') = coalesce(i.lote, '') AS lote_igual_json,
       c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$' AS cdc_omitido_exactamente_en_ruc,
       position('[omitido]' IN coalesce(c.t, '')) AS pos_omitido_cdc,
       c.t ~ '^[0-9]{44}$' AS cdc_integro,
       left(c.t, 2) AS cdc_tipo,
       CASE WHEN c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$' THEN substr(c.t, 13, 3) || '-' || substr(c.t, 16, 3) || '-' || substr(c.t, 19, 7)
            WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 12, 3) || '-' || substr(c.t, 15, 3) || '-' || substr(c.t, 18, 7) END AS cdc_numero_fiscal,
       CASE WHEN c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$' THEN substr(c.t, 27, 8)
            WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 26, 8) END AS cdc_fecha_aaaammdd,
       CASE WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 3, 8) = lpad(e.ruc, 8, '0') AND substr(c.t, 11, 1) = e.dv END AS cdc_integro_ruc_dv_igual_empresa,
       CASE WHEN i.cdc_informado IS NOT NULL THEN substr(i.cdc_informado, 3, 8) = lpad(e.ruc, 8, '0') AND substr(i.cdc_informado, 11, 1) = e.dv END AS cdc_informado_ruc_dv_igual_empresa
  FROM public.documento_electronico_intentos i
  JOIN public.documentos_electronicos d ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
  JOIN public.empresas e ON e.id = d.empresa_id
 CROSS JOIN LATERAL (SELECT i.respuesta #>> '{response,DE,CDC}' AS t) c
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
     OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
 ORDER BY d.numero, i.creado_at, i.id;

\echo '== 8) JSON de emisión: solo identidad (= orden §3.4) + presencia de campos de emisor (esperado: false) =='
SELECT d.punto_expedicion, d.numero, d.serie, s.version, s.creado_at, s.payload_hash,
       s.payload ->> 'dEst' AS d_est, s.payload ->> 'dPunExp' AS d_pun_exp, s.payload ->> 'dNumDoc' AS d_num_doc,
       s.payload ->> 'dSerieNum' AS d_serie_num, s.payload ->> 'dFeEmiDE' AS fecha_de, s.payload ->> 'iTiDE' AS i_ti_de,
       s.payload ?| array['dRucEm','dDVEmi','dNumTim','iTipCont','gEmis','gTimb'] AS payload_trae_emisor_o_timbrado
  FROM public.documento_electronico_solicitudes s
  JOIN public.documentos_electronicos d ON d.empresa_id = s.empresa_id AND d.id = s.documento_id
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
     OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
 ORDER BY d.numero, s.version DESC;

\echo '== 9) Configuración ACTUAL del gateway (sin clave) y bitácora desde 01/11 (= orden §3.3 ampliada) =='
SELECT empresa_id, base_url, credencial_ref, credenciales_version, activo, timeout_ms, actualizado_at, ultima_prueba_at, ultima_prueba_estado
  FROM public.fe_gateway_config WHERE empresa_id = :'empresa'::uuid;
SELECT l.creado_at, l.accion, l.usuario_id,
       l.detalle ->> 'base_url' AS url, l.detalle ->> 'base_url_anterior' AS url_anterior, l.detalle ->> 'url_cambio' AS url_cambio,
       l.detalle ->> 'usuario_api_cambio' AS usuario_api_cambio, l.detalle ->> 'clave_cambio' AS clave_cambio,
       l.detalle ->> 'estado' AS prueba_estado, l.detalle ->> 'credenciales_guardadas' AS prueba_guardadas,
       l.detalle ->> 'version_probada' AS version_probada, l.detalle ->> 'aplicada' AS prueba_aplicada
  FROM public.fe_gateway_config_log l
 WHERE l.empresa_id = :'empresa'::uuid AND l.creado_at >= '2026-11-01 00:00:00-03'::timestamptz
 ORDER BY l.creado_at;
\echo '-- último GUARDAR anterior a la emisión 09:10:27 (configuración vigente en el envío, por exclusión)'
SELECT l.creado_at, l.detalle ->> 'base_url' AS url, l.detalle ->> 'usuario_api_cambio' AS usuario_api_cambio, l.detalle ->> 'clave_cambio' AS clave_cambio
  FROM public.fe_gateway_config_log l
 WHERE l.empresa_id = :'empresa'::uuid AND l.accion = 'GUARDAR' AND l.creado_at < '2026-11-11 09:10:27-03'::timestamptz
 ORDER BY l.creado_at DESC LIMIT 1;

\echo '== 10) Secuencia FE de los puntos 001 y 003 y su bitácora (por qué existe la serie AA) =='
SELECT pe.codigo AS punto, q.tipo_documento, q.serie, q.ultimo_numero, q.origen, q.activo, q.actualizado_at
  FROM public.fe_punto_secuencias q
  JOIN public.fe_puntos_expedicion pe ON pe.empresa_id = q.empresa_id AND pe.id = q.punto_id
 WHERE q.empresa_id = :'empresa'::uuid AND q.tipo_documento = 'FE'
 ORDER BY pe.codigo;
SELECT pe.codigo AS punto, lg.creado_at, lg.accion, lg.usuario_id, lg.anterior, lg.nuevo
  FROM public.fe_puntos_expedicion_log lg
  JOIN public.fe_puntos_expedicion pe ON pe.empresa_id = lg.empresa_id AND pe.id = lg.punto_id
 WHERE lg.empresa_id = :'empresa'::uuid AND pe.codigo IN ('001','003')
 ORDER BY lg.creado_at;

\echo '== 11) Identidad del mismo número SOLO dentro de CASA MINGO (tenant; NO inspecciona otras empresas) =='
-- No demuestra colisiones en el proveedor: eso lo confirma exclusivamente el proveedor.
SELECT d.establecimiento, d.punto_expedicion, d.numero, d.serie, d.estado_sifen,
       count(*) AS cantidad_dentro_empresa
  FROM public.documentos_electronicos d
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001'
 GROUP BY d.establecimiento, d.punto_expedicion, d.numero, d.serie, d.estado_sifen
 ORDER BY d.serie NULLS FIRST, d.estado_sifen;

\echo '== 12) Consultas desde el 10/11: quién y cuándo (manual vs worker) =='
SELECT d.punto_expedicion, d.numero, d.serie, i.creado_at, i.resultado, i.actor_id,
       (SELECT trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) FROM public.usuarios u WHERE u.empresa_id = i.empresa_id AND u.id = i.actor_id) AS actor
  FROM public.documento_electronico_intentos i
  JOIN public.documentos_electronicos d ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
 WHERE i.empresa_id = :'empresa'::uuid AND i.tipo = 'CONSULTA' AND i.creado_at >= '2026-11-10 00:00:00-03'::timestamptz
 ORDER BY i.creado_at;
\echo '-- (falla sola si NEX-062 no está aplicada)'
SELECT d.punto_expedicion, d.numero, d.serie, d.proxima_consulta_at, d.consulta_lease_hasta, d.consultas_auto
  FROM public.documentos_electronicos d
 WHERE d.empresa_id = :'empresa'::uuid AND d.tipo = 'FE'
   AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
     OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')));

\echo '== 13) Credenciales omitidas por seguridad. No se leen claves ni se reconstruyen lotes antiguos. =='
-- La comprobación excepcional de una hipótesis de igualdad clave/RUC exige aprobación separada y mecanismo aislado que NO manipule lotes/CDC.
-- Está expresamente prohibido reconstruir un lote usando una contraseña, incluso dentro de una expresión que devuelva booleanos.

\echo '== FIN: ninguna fila fue modificada (sesión READ ONLY). =='
