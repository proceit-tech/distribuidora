-- =====================================================================
-- NEX-021 — Ubicación geográfica OPCIONAL y jerárquica (Departamento → Distrito → Ciudad) para Paraguay
-- en direcciones de Clientes y de Proveedores.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum en schema_migrations).
--
-- ALCANCE: Barrio está FUERA del alcance de la V1 (decisión del responsable): esta migración NO crea
-- tabla de barrios ni columnas de barrio. Solo hace opcional la ubicación paraguaya.
--
-- Estado verificado (NEX-003/005/006):
--  * direcciones_cliente_pry_geo_chk y proveedor_direcciones_geo_codigos_chk EXIGEN los 3 códigos para PRY, y
--    direcciones_cliente_geo_fk es MATCH FULL: impiden departamento/distrito/ciudad opcionales.
--  * proveedor_direcciones no tiene FKs al catálogo geográfico (solo el CHECK que se reemplaza).
-- Esta migración reemplaza esas restricciones por una cadena jerárquica de FKs (cada nivel opcional,
-- nunca sin su padre) y un CHECK de jerarquía. No modifica, borra ni reescribe filas existentes; si alguna
-- fila actual no cumpliera las reglas nuevas, ABORTA sin cambios (verificación previa, transacción única).
-- No crea tablas ni cambia grants (nexit_runtime conserva sus permisos actuales).
-- =====================================================================

-- ---- Verificación previa: no continuar si hay filas que las reglas nuevas rechazarían -----------------
DO $$
DECLARE v_cli integer; v_pro integer;
BEGIN
  SELECT count(*) INTO v_cli FROM direcciones_cliente d
   WHERE (d.distrito_codigo IS NOT NULL AND d.departamento_codigo IS NULL)
      OR (d.ciudad_codigo   IS NOT NULL AND d.distrito_codigo     IS NULL)
      OR (d.pais_codigo <> 'PRY' AND (d.departamento_codigo IS NOT NULL OR d.distrito_codigo IS NOT NULL OR d.ciudad_codigo IS NOT NULL))
      OR (d.departamento_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_departamentos x WHERE x.codigo = d.departamento_codigo))
      OR (d.distrito_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_distritos x WHERE x.departamento_codigo = d.departamento_codigo AND x.codigo = d.distrito_codigo))
      OR (d.ciudad_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_ciudades x WHERE x.departamento_codigo = d.departamento_codigo AND x.distrito_codigo = d.distrito_codigo AND x.codigo = d.ciudad_codigo));
  SELECT count(*) INTO v_pro FROM proveedor_direcciones d
   WHERE (d.distrito_codigo IS NOT NULL AND d.departamento_codigo IS NULL)
      OR (d.ciudad_codigo   IS NOT NULL AND d.distrito_codigo     IS NULL)
      OR (d.pais_codigo <> 'PRY' AND (d.departamento_codigo IS NOT NULL OR d.distrito_codigo IS NOT NULL OR d.ciudad_codigo IS NOT NULL))
      OR (d.departamento_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_departamentos x WHERE x.codigo = d.departamento_codigo))
      OR (d.distrito_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_distritos x WHERE x.departamento_codigo = d.departamento_codigo AND x.codigo = d.distrito_codigo))
      OR (d.ciudad_codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM referencia_geografica_ciudades x WHERE x.departamento_codigo = d.departamento_codigo AND x.distrito_codigo = d.distrito_codigo AND x.codigo = d.ciudad_codigo));
  IF v_cli > 0 OR v_pro > 0 THEN
    RAISE EXCEPTION 'NEX-021 abortada: % direcciones de cliente y % de proveedor no cumplen las reglas de ubicación nuevas. Revisar esos datos antes de aplicar (no se modificó nada).', v_cli, v_pro;
  END IF;
END $$;

-- ---- Clientes
ALTER TABLE direcciones_cliente DROP CONSTRAINT direcciones_cliente_geo_fk;
ALTER TABLE direcciones_cliente DROP CONSTRAINT direcciones_cliente_pry_geo_chk;
ALTER TABLE direcciones_cliente
  ADD CONSTRAINT direcciones_cliente_dep_fk FOREIGN KEY (departamento_codigo) REFERENCES referencia_geografica_departamentos (codigo),
  ADD CONSTRAINT direcciones_cliente_dis_fk FOREIGN KEY (departamento_codigo, distrito_codigo)
    REFERENCES referencia_geografica_distritos (departamento_codigo, codigo),
  ADD CONSTRAINT direcciones_cliente_ciu_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo),
  ADD CONSTRAINT direcciones_cliente_geo_jerarquia_chk CHECK (
    (distrito_codigo IS NULL OR departamento_codigo IS NOT NULL)
    AND (ciudad_codigo IS NULL OR distrito_codigo IS NOT NULL)
    AND (pais_codigo = 'PRY' OR (departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL)));

-- ---- Proveedores
ALTER TABLE proveedor_direcciones DROP CONSTRAINT proveedor_direcciones_geo_codigos_chk;
ALTER TABLE proveedor_direcciones
  ADD CONSTRAINT proveedor_direcciones_dep_fk FOREIGN KEY (departamento_codigo) REFERENCES referencia_geografica_departamentos (codigo),
  ADD CONSTRAINT proveedor_direcciones_dis_fk FOREIGN KEY (departamento_codigo, distrito_codigo)
    REFERENCES referencia_geografica_distritos (departamento_codigo, codigo),
  ADD CONSTRAINT proveedor_direcciones_ciu_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo),
  ADD CONSTRAINT proveedor_direcciones_geo_jerarquia_chk CHECK (
    (distrito_codigo IS NULL OR departamento_codigo IS NOT NULL)
    AND (ciudad_codigo IS NULL OR distrito_codigo IS NOT NULL)
    AND (pais_codigo = 'PRY' OR (departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL)));

-- ---- Reversión (manual; solo segura mientras no existan filas PRY con ubicación parcial o vacía):
-- ALTER TABLE direcciones_cliente DROP CONSTRAINT direcciones_cliente_dep_fk, DROP CONSTRAINT direcciones_cliente_dis_fk,
--   DROP CONSTRAINT direcciones_cliente_ciu_fk, DROP CONSTRAINT direcciones_cliente_geo_jerarquia_chk;
-- ALTER TABLE direcciones_cliente
--   ADD CONSTRAINT direcciones_cliente_geo_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
--     REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo) MATCH FULL,
--   ADD CONSTRAINT direcciones_cliente_pry_geo_chk CHECK (pais_codigo <> 'PRY' OR (departamento_codigo IS NOT NULL AND distrito_codigo IS NOT NULL AND ciudad_codigo IS NOT NULL));
-- ALTER TABLE proveedor_direcciones DROP CONSTRAINT proveedor_direcciones_dep_fk, DROP CONSTRAINT proveedor_direcciones_dis_fk,
--   DROP CONSTRAINT proveedor_direcciones_ciu_fk, DROP CONSTRAINT proveedor_direcciones_geo_jerarquia_chk;
-- ALTER TABLE proveedor_direcciones ADD CONSTRAINT proveedor_direcciones_geo_codigos_chk CHECK (
--   (pais_codigo = 'PRY' AND departamento_codigo IS NOT NULL AND distrito_codigo IS NOT NULL AND ciudad_codigo IS NOT NULL)
--   OR (pais_codigo <> 'PRY' AND departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL));
