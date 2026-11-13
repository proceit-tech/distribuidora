-- =====================================================================
-- NEX-018 — Integridad de Listas de precios (módulo 5)
-- NEX-008 dejó sin controlar: vigencias invertidas, porcentajes/precios fuera de rango, escalones incoherentes, moneda del ítem distinta de la
-- de su lista y, sobre todo, lista_precio_reglas.referencia_id SIN FK (podía apuntar a un cliente/grupo/zona/canal de OTRA empresa).
-- Esta migración añade las reglas de integridad. No modifica NEX-001..017; no cambia columnas ni datos.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- =====================================================================

-- 1) Listas
ALTER TABLE listas_precio
  ADD CONSTRAINT listas_precio_vigencia_chk  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  ADD CONSTRAINT listas_precio_ajuste_chk    CHECK (ajuste_general_pct BETWEEN -100 AND 999),
  ADD CONSTRAINT listas_precio_descmax_chk   CHECK (descuento_maximo_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT listas_precio_prioridad_chk CHECK (prioridad >= 0);

-- 2) Ítems (precio por producto)
ALTER TABLE lista_precio_items
  ADD CONSTRAINT lista_precio_items_vigencia_chk CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  ADD CONSTRAINT lista_precio_items_montos_chk   CHECK (costo_referencia >= 0 AND precio_base >= 0 AND precio_lista >= 0),
  ADD CONSTRAINT lista_precio_items_desc_chk     CHECK (descuento_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT lista_precio_items_cant_chk     CHECK (cantidad_minima > 0);

-- 3) Escalones
ALTER TABLE lista_precio_escalones
  ADD CONSTRAINT lista_precio_escalones_cant_chk   CHECK (cantidad_minima > 0 AND (cantidad_maxima IS NULL OR cantidad_maxima >= cantidad_minima)),
  ADD CONSTRAINT lista_precio_escalones_precio_chk CHECK (precio >= 0),
  ADD CONSTRAINT lista_precio_escalones_desc_chk   CHECK (descuento_pct BETWEEN 0 AND 100);

-- 4) Reglas comerciales
ALTER TABLE lista_precio_reglas
  ADD CONSTRAINT lista_precio_reglas_vigencia_chk CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  ADD CONSTRAINT lista_precio_reglas_cant_chk     CHECK (cantidad_minima > 0),
  ADD CONSTRAINT lista_precio_reglas_desc_chk     CHECK (descuento_maximo_pct BETWEEN 0 AND 100),
  ADD CONSTRAINT lista_precio_reglas_prioridad_chk CHECK (prioridad >= 0),
  ADD CONSTRAINT lista_precio_reglas_referencia_chk CHECK ((tipo_aplicacion = 'GENERAL') = (referencia_id IS NULL));

-- La referencia debe existir en el catálogo que indica el tipo, DENTRO de la misma empresa.
CREATE OR REPLACE FUNCTION lista_precio_reglas_referencia_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  IF NEW.referencia_id IS NULL THEN RETURN NEW; END IF;
  v := CASE NEW.tipo_aplicacion
    WHEN 'GRUPO_CLIENTE' THEN EXISTS (SELECT 1 FROM grupos_cliente    WHERE empresa_id = NEW.empresa_id AND id = NEW.referencia_id)
    WHEN 'CLIENTE'       THEN EXISTS (SELECT 1 FROM clientes          WHERE empresa_id = NEW.empresa_id AND id = NEW.referencia_id)
    WHEN 'ZONA'          THEN EXISTS (SELECT 1 FROM zonas_comerciales WHERE empresa_id = NEW.empresa_id AND id = NEW.referencia_id)
    WHEN 'CANAL_VENTA'   THEN EXISTS (SELECT 1 FROM canales_venta     WHERE empresa_id = NEW.empresa_id AND id = NEW.referencia_id)
    ELSE false END;
  IF NOT v THEN
    RAISE EXCEPTION 'la referencia de la regla (%) no existe en esta empresa para el tipo %', NEW.referencia_id, NEW.tipo_aplicacion USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lista_precio_reglas_referencia_trg BEFORE INSERT OR UPDATE ON lista_precio_reglas
  FOR EACH ROW EXECUTE FUNCTION lista_precio_reglas_referencia_guard();

-- 5) Moneda del ítem = moneda de su lista (también para la lista de referencia de la ficha de Productos, NEX-017).
CREATE OR REPLACE FUNCTION lista_precio_items_moneda_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
  SELECT moneda_codigo INTO m FROM listas_precio WHERE empresa_id = NEW.empresa_id AND id = NEW.lista_precio_id;
  IF m IS DISTINCT FROM NEW.moneda_codigo THEN
    RAISE EXCEPTION 'la moneda del ítem (%) debe ser la de su lista (%)', NEW.moneda_codigo, m USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lista_precio_items_moneda_trg BEFORE INSERT OR UPDATE ON lista_precio_items
  FOR EACH ROW EXECUTE FUNCTION lista_precio_items_moneda_guard();

CREATE OR REPLACE FUNCTION listas_precio_moneda_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moneda_codigo IS DISTINCT FROM OLD.moneda_codigo
     AND EXISTS (SELECT 1 FROM lista_precio_items WHERE empresa_id = NEW.empresa_id AND lista_precio_id = NEW.id AND moneda_codigo <> NEW.moneda_codigo) THEN
    RAISE EXCEPTION 'no se puede cambiar la moneda de una lista con precios en otra moneda' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER listas_precio_moneda_trg BEFORE UPDATE OF moneda_codigo ON listas_precio
  FOR EACH ROW EXECUTE FUNCTION listas_precio_moneda_guard();

-- 6) Permisos del rol de ejecución (las funciones de trigger se conceden automáticamente).
SELECT nex_aplicar_grants_runtime();
