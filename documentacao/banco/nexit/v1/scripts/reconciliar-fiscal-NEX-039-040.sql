-- RECONCILIACIÓN FISCAL de datos EXISTENTES (NO es una migración). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -X -v ON_ERROR_STOP=1 -1 -f reconciliar-fiscal-NEX-039-040.sql
-- Requiere NEX-039 y NEX-040 aplicadas. IDEMPOTENTE: solo toca filas que aún no tienen vínculo/clasificación; cada cambio queda en
-- fiscal_reconciliacion_log (antes/después). NO modifica IDs, referencias, presentaciones, stock, costos ni movimientos.
-- NO vincula: Metro (decisión pendiente 87/108), Caja, Docena ni ninguna unidad cuyo código y nombre no coincidan EXACTAMENTE con la regla.
-- NO clasifica el impuesto legado EXE (ni ningún producto sin IVA10/IVA5): Exento vs. Exonerado es decisión del responsable.

-- A) Unidades con regla inequívoca: código interno + nombre exactos → código oficial (Tabla 5).
WITH regla(interno, nombre, oficial) AS (VALUES ('UN', 'unidad', 77), ('KG', 'kilogramo', 83), ('LT', 'litro', 89)),
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
SELECT 'reconciliar-fiscal-NEX-039-040/A-unidades', 'unidades_medida', o.id, o.antes, a.despues
  FROM objetivo o JOIN actualizado a ON a.id = o.id;

-- B) Productos con IVA10/IVA5 sin clasificar → Gravado IVA (afectación 1). EXE y productos sin impuesto NO se tocan.
WITH objetivo AS (
  SELECT p.id, to_jsonb(p) AS antes
    FROM public.productos p JOIN public.impuestos i ON i.id = p.impuesto_id
   WHERE p.afectacion_iva IS NULL AND ((i.codigo = 'IVA10' AND i.porcentaje = 10) OR (i.codigo = 'IVA5' AND i.porcentaje = 5))
),
actualizado AS (
  UPDATE public.productos p SET afectacion_iva = 1 FROM objetivo o WHERE p.id = o.id
  RETURNING p.id, to_jsonb(p) AS despues
)
INSERT INTO public.fiscal_reconciliacion_log (script, tabla, registro_id, antes, despues)
SELECT 'reconciliar-fiscal-NEX-039-040/B-productos-iva', 'productos', o.id, o.antes, a.despues
  FROM objetivo o JOIN actualizado a ON a.id = o.id;

-- C) INFORMES de solo lectura (lo que queda pendiente de decisión del responsable)
SELECT 'unidad sin equivalencia SIFEN' AS pendiente, codigo, nombre, codigo_sifen AS codigo_legado
  FROM public.unidades_medida WHERE unidad_sifen_codigo IS NULL ORDER BY codigo;
SELECT 'productos sin clasificación IVA por impuesto' AS pendiente, coalesce(i.codigo, '(sin impuesto)') AS impuesto, count(*) AS productos
  FROM public.productos p LEFT JOIN public.impuestos i ON i.id = p.impuesto_id
 WHERE p.afectacion_iva IS NULL GROUP BY 2 ORDER BY 2;
SELECT 'GTIN con longitud no admitida por E706/E707' AS pendiente, c.empresa_id, c.producto_id, c.tipo, c.codigo
  FROM public.producto_codigos c
 WHERE c.tipo IN ('GTIN', 'GTIN_EMPAQUE', 'EAN', 'UPC') AND char_length(c.codigo) NOT IN (8, 12, 13, 14);
