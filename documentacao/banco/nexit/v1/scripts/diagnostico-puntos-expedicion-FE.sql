-- DIAGNÓSTICO de solo lectura: por qué «Nueva factura electrónica» no ofrece sucursal o punto de expedición. NO modifica nada; no es una migración.
-- Requiere NEX-048 (fe_puntos_expedicion). Ejecución por el responsable:  psql -f diagnostico-puntos-expedicion-FE.sql
-- El formulario solo ofrece: sucursales ACTIVAS de la empresa del usuario, con establecimiento_sifen cargado y dentro de su alcance de sucursales,
-- y de ellas solo los puntos de expedición ACTIVOS. No se inventa ningún registro: si falta alguno, aquí se ve cuál.

-- 1) Sucursales por empresa y qué les falta para facturar
SELECT e.codigo AS empresa, s.codigo AS sucursal, s.nombre, s.activo, s.establecimiento_sifen,
       CASE WHEN NOT s.activo THEN 'sucursal inactiva'
            WHEN s.establecimiento_sifen IS NULL THEN 'falta establecimiento_sifen (3 dígitos, p. ej. 001)'
            ELSE 'ok' END AS estado
  FROM public.sucursales s JOIN public.empresas e ON e.id = s.empresa_id
 ORDER BY e.codigo, s.codigo;

-- 2) Puntos de expedición registrados y su último número usado (la próxima factura es ultimo_numero + 1)
SELECT e.codigo AS empresa, s.codigo AS sucursal, s.establecimiento_sifen AS establecimiento, p.codigo AS punto, p.nombre, p.activo, p.ultimo_numero,
       lpad((p.ultimo_numero + 1)::text, 7, '0') AS proximo_numero
  FROM public.fe_puntos_expedicion p
  JOIN public.sucursales s ON s.empresa_id = p.empresa_id AND s.id = p.sucursal_id
  JOIN public.empresas e ON e.id = p.empresa_id
 ORDER BY e.codigo, s.codigo, p.codigo;

-- 2b) SOLO con NEX-060 aplicada: secuencias por tipo de documento (FE, NCE, NDE, NRE, AFE) de cada punto. Desde NEX-060 el contador de la consulta 2 está CONGELADO; la numeración real es esta.
-- (Sin NEX-060 esta consulta falla porque fe_punto_secuencias no existe: ignórela.)
SELECT e.codigo AS empresa, s.establecimiento_sifen AS establecimiento, p.codigo AS punto, q.tipo_documento AS tipo, q.ultimo_numero, lpad((q.ultimo_numero + 1)::text, 7, '0') AS proximo_numero, q.origen
  FROM public.fe_punto_secuencias q
  JOIN public.fe_puntos_expedicion p ON p.empresa_id = q.empresa_id AND p.id = q.punto_id
  JOIN public.sucursales s ON s.empresa_id = p.empresa_id AND s.id = p.sucursal_id
  JOIN public.empresas e ON e.id = p.empresa_id
 ORDER BY e.codigo, s.establecimiento_sifen, p.codigo, q.tipo_documento;

-- 3) Sucursales activas con establecimiento pero SIN ningún punto activo (el formulario mostrará «sin puntos de expedición»)
SELECT e.codigo AS empresa, s.codigo AS sucursal, s.establecimiento_sifen AS establecimiento
  FROM public.sucursales s JOIN public.empresas e ON e.id = s.empresa_id
 WHERE s.activo AND s.establecimiento_sifen IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.fe_puntos_expedicion p WHERE p.empresa_id = s.empresa_id AND p.sucursal_id = s.id AND p.activo);

-- 4) Antes de fijar el contador de un punto: último número que Nexit ya tiene registrado para ese establecimiento y punto (por si hubo emisiones previas)
SELECT d.establecimiento, d.punto_expedicion, max(d.numero::integer) AS ultimo_numero_registrado, count(*) AS documentos
  FROM public.documentos_electronicos d
 WHERE d.tipo = 'FE'
 GROUP BY d.establecimiento, d.punto_expedicion
 ORDER BY 1, 2;

-- 5) Usuarios con alcance a una sucursal: si el usuario no la ve en el formulario, revisar su alcance (sucursal_en_alcance) y el permiso FACTURACION_ELECTRONICA.CREAR
-- (consultar con la administración de perfiles de Nexit; esta función es la misma que usa la aplicación):
--   SELECT public.sucursal_en_alcance('<empresa_id>'::uuid, '<usuario_id>'::uuid, '<sucursal_id>'::uuid);

-- CREAR EL PUNTO DE PRUEBA 002 (si el punto 3) lo requiere): scripts/configurar-punto-expedicion-prueba-NEX-048.sql — manual, con backup, y solo después de
-- confirmar en el gateway que no existen facturas 001-002-0050000 o posteriores (ver punto 4).
