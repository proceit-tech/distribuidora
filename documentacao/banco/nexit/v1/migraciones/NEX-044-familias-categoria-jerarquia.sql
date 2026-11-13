-- =====================================================================
-- NEX-044 — Jerarquía de catálogos de Productos: Categoría → Familia → Línea (decisión CAT-012). Marca queda independiente.
-- Requiere NEX-004 (categorias_producto) y NEX-017 (familias_producto, lineas_producto). No modifica migraciones aplicadas.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-044.sql.
--
--   · familias_producto.categoria_id es NULLABLE a propósito: las familias históricas NO se clasifican automáticamente (ni por su nombre).
--     Sin UPDATE ni DELETE de datos. El informe de solo lectura scripts/informe-jerarquia-catalogos-NEX-044.sql lista lo que falta clasificar;
--     la clasificación la hace una persona desde Catálogos → Familias. NOT NULL queda para una migración posterior, tras el saneamiento.
--   · FK compuesta (empresa_id, categoria_id) → categorias_producto (empresa_id, id): una familia solo puede apuntar a categorías de su empresa.
--   · Coherencia producto ↔ jerarquía (solo cuando se CAMBIA el dato, para no bloquear productos históricos):
--       - productos: si su familia tiene categoría y el producto declara otra categoría, el alta/cambio de categoría o familia se rechaza.
--       - familias_producto: no se cambia la categoría de una familia con productos clasificados en otra categoría (no hay reclasificación
--         automática de descendientes). La coherencia línea → familia ya la garantiza la FK de NEX-017.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.categorias_producto') IS NULL OR to_regclass('public.familias_producto') IS NULL OR to_regclass('public.lineas_producto') IS NULL THEN
    RAISE EXCEPTION 'NEX-044 requiere NEX-004 y NEX-017 (categorias_producto, familias_producto, lineas_producto).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'familias_producto' AND column_name = 'categoria_id') THEN
    RAISE EXCEPTION 'familias_producto.categoria_id ya existe: NEX-044 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.familias_producto
  ADD COLUMN categoria_id uuid,
  ADD CONSTRAINT familias_producto_categoria_fk FOREIGN KEY (empresa_id, categoria_id) REFERENCES public.categorias_producto (empresa_id, id);

CREATE INDEX familias_producto_categoria_idx ON public.familias_producto (empresa_id, categoria_id);

COMMENT ON COLUMN public.familias_producto.categoria_id IS 'Categoría a la que pertenece la familia (jerarquía Categoría → Familia → Línea). NULL = familia histórica pendiente de clasificar manualmente.';

-- Un producto no puede quedar en una categoría distinta de la de su familia (cuando la familia está clasificada). Solo se evalúa si cambian
-- categoria_id o familia_id: los productos históricos incoherentes siguen editables en el resto de sus datos y se listan en el informe.
CREATE OR REPLACE FUNCTION public.productos_jerarquia_coherente() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_categoria uuid;
BEGIN
  IF NEW.familia_id IS NULL OR NEW.categoria_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.familia_id IS NOT DISTINCT FROM OLD.familia_id AND NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id THEN
    RETURN NEW;
  END IF;
  SELECT categoria_id INTO v_categoria FROM public.familias_producto WHERE empresa_id = NEW.empresa_id AND id = NEW.familia_id;
  IF v_categoria IS NOT NULL AND v_categoria <> NEW.categoria_id THEN
    RAISE EXCEPTION 'La familia del producto no pertenece a la categoría elegida.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER productos_jerarquia_coherente_trg
  BEFORE INSERT OR UPDATE OF categoria_id, familia_id ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.productos_jerarquia_coherente();

-- No se reclasifica una familia si dejaría incoherentes a productos que ya declaran otra categoría.
CREATE OR REPLACE FUNCTION public.familias_categoria_sin_incoherencia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.categoria_id IS NOT DISTINCT FROM OLD.categoria_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.productos
              WHERE empresa_id = NEW.empresa_id AND familia_id = NEW.id AND categoria_id IS NOT NULL AND categoria_id IS DISTINCT FROM NEW.categoria_id) THEN
    RAISE EXCEPTION 'La familia tiene productos con otra categoría; reclasifíquelos antes de cambiar la categoría de la familia.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER familias_categoria_sin_incoherencia_trg
  BEFORE UPDATE OF categoria_id ON public.familias_producto
  FOR EACH ROW EXECUTE FUNCTION public.familias_categoria_sin_incoherencia();

-- Privilegios: familias_producto ya tiene INSERT/UPDATE/DELETE para nexit_runtime a nivel de tabla (NEX-013/017), que cubre la columna nueva.
-- Las funciones de trigger no requieren EXECUTE para dispararse; nex_aplicar_grants_runtime_base() las reconcede igualmente si se reaplica.
