-- INFORME DE SOLO LECTURA — saneamiento de la jerarquía Categoría → Familia → Línea (NEX-044, decisión CAT-012).
-- Uso (tras aplicar NEX-044, con autorización del responsable):  psql -v ON_ERROR_STOP=1 -f informe-jerarquia-catalogos-NEX-044.sql
-- No modifica nada (transacción de solo lectura). NO propone ni asigna categorías: solo lista lo que una persona debe clasificar.
BEGIN READ ONLY;

\echo '== 1) Familias SIN categoría (a clasificar manualmente desde Catálogos → Familias)'
SELECT e.razon_social AS empresa, f.id AS familia_id, coalesce(f.codigo, '') AS codigo, f.nombre AS familia, f.activo,
       (SELECT count(*) FROM public.lineas_producto l WHERE l.empresa_id = f.empresa_id AND l.familia_id = f.id) AS lineas,
       (SELECT count(*) FROM public.productos p WHERE p.empresa_id = f.empresa_id AND p.familia_id = f.id) AS productos
  FROM public.familias_producto f
  JOIN public.empresas e ON e.id = f.empresa_id
 WHERE f.categoria_id IS NULL
 ORDER BY e.razon_social, f.nombre;

\echo '== 2) Familias sin categoría cuyos productos ya declaran categorías (dato informativo; la decisión es humana)'
SELECT e.razon_social AS empresa, f.nombre AS familia, k.nombre AS categoria_declarada_en_productos, count(*) AS productos
  FROM public.familias_producto f
  JOIN public.empresas e ON e.id = f.empresa_id
  JOIN public.productos p ON p.empresa_id = f.empresa_id AND p.familia_id = f.id AND p.categoria_id IS NOT NULL
  JOIN public.categorias_producto k ON k.empresa_id = p.empresa_id AND k.id = p.categoria_id
 WHERE f.categoria_id IS NULL
 GROUP BY e.razon_social, f.nombre, k.nombre
 ORDER BY e.razon_social, f.nombre, productos DESC;

\echo '== 3) Productos incoherentes: categoría del producto distinta de la categoría de su familia'
SELECT e.razon_social AS empresa, p.codigo, p.descripcion, kp.nombre AS categoria_producto, f.nombre AS familia, kf.nombre AS categoria_de_la_familia
  FROM public.productos p
  JOIN public.empresas e ON e.id = p.empresa_id
  JOIN public.familias_producto f ON f.empresa_id = p.empresa_id AND f.id = p.familia_id
  JOIN public.categorias_producto kp ON kp.empresa_id = p.empresa_id AND kp.id = p.categoria_id
  JOIN public.categorias_producto kf ON kf.empresa_id = f.empresa_id AND kf.id = f.categoria_id
 WHERE p.categoria_id <> f.categoria_id
 ORDER BY e.razon_social, p.codigo;

\echo '== 4) Dependientes por familia: líneas y productos (para planificar la clasificación)'
SELECT e.razon_social AS empresa, f.nombre AS familia, f.categoria_id IS NOT NULL AS clasificada,
       count(DISTINCT l.id) AS lineas, count(DISTINCT p.id) AS productos
  FROM public.familias_producto f
  JOIN public.empresas e ON e.id = f.empresa_id
  LEFT JOIN public.lineas_producto l ON l.empresa_id = f.empresa_id AND l.familia_id = f.id
  LEFT JOIN public.productos p ON p.empresa_id = f.empresa_id AND p.familia_id = f.id
 GROUP BY e.razon_social, f.id, f.nombre, f.categoria_id
 ORDER BY clasificada, e.razon_social, f.nombre;

\echo '== 5) Resumen por empresa'
SELECT e.razon_social AS empresa,
       count(*) AS familias,
       count(*) FILTER (WHERE f.categoria_id IS NULL) AS sin_categoria,
       count(*) FILTER (WHERE f.categoria_id IS NOT NULL) AS clasificadas
  FROM public.familias_producto f
  JOIN public.empresas e ON e.id = f.empresa_id
 GROUP BY e.razon_social
 ORDER BY e.razon_social;

ROLLBACK;
