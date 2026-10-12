-- RECONCILIACIÓN de UNIDADES de medida existentes con la Tabla 5 SIFEN (NO es una migración). Solo con autorización del responsable y con copia
-- de seguridad previa:   psql -X -v ON_ERROR_STOP=1 -1 -f reconciliar-unidades-sifen-NEX-039.sql
-- Requiere NEX-039. IDEMPOTENTE: solo toca unidades que aún no tienen vínculo; cada cambio queda en fiscal_reconciliacion_log (antes/después, incluidos los
-- campos legados que el trigger de espejo reescribe). NO modifica IDs, referencias, presentaciones, stock, costos ni movimientos.
-- NO vincula: Metro (decisión pendiente 87/108) ni ninguna unidad cuyo código y nombre no coincidan EXACTAMENTE con la regla (Caja→131/BX y Docena→113/DOC, NT023).
-- Vincular NO crea conversiones: una caja o una docena no implican factor alguno; los factores de las presentaciones son datos comerciales independientes.
-- Este script NO toca productos ni impuestos: la reclasificación IVA de productos existentes es otra operación, aparte y con autorización expresa
-- (scripts/reclasificar-iva-productos-NEX-040.sql).

-- A) Unidades con regla inequívoca: código interno + nombre exactos → código oficial (Tabla 5).
WITH regla(interno, nombre, oficial) AS (VALUES ('UN', 'unidad', 77), ('KG', 'kilogramo', 83), ('LT', 'litro', 89), ('CJ', 'caja', 131), ('DOC', 'docena', 113)),
objetivo AS (
  SELECT u.id, r.oficial, to_jsonb(u) AS antes
    FROM public.unidades_medida u JOIN regla r ON u.codigo = r.interno AND lower(btrim(u.nombre)) = r.nombre
   WHERE u.unidad_sifen_codigo IS NULL
),
actualizado AS (
  UPDATE public.unidades_medida u SET unidad_sifen_codigo = o.oficial
    FROM objetivo o WHERE u.id = o.id
  RETURNING u.id, to_jsonb(u) AS despues
)
INSERT INTO public.fiscal_reconciliacion_log (script, tabla, registro_id, antes, despues)
SELECT 'reconciliar-unidades-sifen-NEX-039/A-unidades', 'unidades_medida', o.id, o.antes, a.despues
  FROM objetivo o JOIN actualizado a ON a.id = o.id;

-- B) INFORMES de solo lectura (lo que queda pendiente de decisión del responsable)
SELECT 'unidad sin equivalencia SIFEN' AS pendiente, codigo, nombre, codigo_sifen AS codigo_legado
  FROM public.unidades_medida WHERE unidad_sifen_codigo IS NULL ORDER BY codigo;
SELECT 'unidad con código SIFEN LEGADO sin vínculo canónico (no es válido hasta vincularla)' AS pendiente, codigo, nombre, codigo_sifen, descripcion_sifen
  FROM public.unidades_medida WHERE unidad_sifen_codigo IS NULL AND (codigo_sifen IS NOT NULL OR descripcion_sifen IS NOT NULL) ORDER BY codigo;
SELECT 'GTIN con longitud no admitida por E706/E707' AS pendiente, c.empresa_id, c.producto_id, c.tipo, c.codigo
  FROM public.producto_codigos c
 WHERE c.tipo IN ('GTIN', 'GTIN_EMPAQUE', 'EAN', 'UPC') AND char_length(c.codigo) NOT IN (8, 12, 13, 14);
SELECT 'productos sin clasificación IVA por impuesto (informe; NO se reclasifica)' AS pendiente, coalesce(i.codigo, '(sin impuesto)') AS impuesto, count(*) AS productos
  FROM public.productos p LEFT JOIN public.impuestos i ON i.id = p.impuesto_id
 WHERE p.afectacion_iva IS NULL GROUP BY 2 ORDER BY 2;
