-- =====================================================================
-- NEX-021 — PROPUESTA (NO aplicada, fuera de migraciones/ para que aplicar-migraciones.sh no la tome)
-- Barrios de Paraguay + ubicación geográfica OPCIONAL y jerárquica en Clientes y Proveedores.
-- Requiere autorización expresa antes de aplicarse en la VM. Para activarla: moverla a migraciones/NEX-021-*.sql.
--
-- Estado verificado (NEX-003/005/006):
--  * NO existe referencia_geografica_barrios ni columnas de barrio en direcciones_cliente / proveedor_direcciones.
--  * direcciones_cliente_pry_geo_chk y proveedor_direcciones_geo_codigos_chk EXIGEN los 3 códigos para PRY, y
--    direcciones_cliente_geo_fk es MATCH FULL: impiden departamento/distrito/ciudad opcionales.
-- Esta migración: crea la tabla de barrios (clave compuesta), agrega barrio_codigo/barrio a ambas tablas,
-- reemplaza las restricciones por una cadena jerárquica de FKs (cada nivel opcional, nunca sin su padre)
-- y deja el catálogo legible por nexit_runtime. No modifica datos existentes (las filas actuales cumplen las nuevas reglas).
-- La carga de barrios (1104 filas de la planilla oficial, 025 histórico) es un SQL aparte, a generar tras aprobar esta migración.
-- =====================================================================

CREATE TABLE referencia_geografica_barrios (
  departamento_codigo integer     NOT NULL,
  distrito_codigo     integer     NOT NULL,
  ciudad_codigo       integer     NOT NULL,
  codigo              integer     NOT NULL CHECK (codigo > 0),
  nombre              text        NOT NULL CHECK (length(btrim(nombre)) > 0),
  activo              boolean     NOT NULL DEFAULT true,
  creado_at           timestamptz NOT NULL DEFAULT now(),
  actualizado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (departamento_codigo, distrito_codigo, ciudad_codigo, codigo),
  FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo)
);

-- ---- Clientes
ALTER TABLE direcciones_cliente
  ADD COLUMN barrio_codigo integer,
  ADD COLUMN barrio        text CHECK (char_length(barrio) <= 150);
ALTER TABLE direcciones_cliente DROP CONSTRAINT direcciones_cliente_geo_fk;
ALTER TABLE direcciones_cliente DROP CONSTRAINT direcciones_cliente_pry_geo_chk;
ALTER TABLE direcciones_cliente
  ADD CONSTRAINT direcciones_cliente_dep_fk FOREIGN KEY (departamento_codigo) REFERENCES referencia_geografica_departamentos (codigo),
  ADD CONSTRAINT direcciones_cliente_dis_fk FOREIGN KEY (departamento_codigo, distrito_codigo)
    REFERENCES referencia_geografica_distritos (departamento_codigo, codigo),
  ADD CONSTRAINT direcciones_cliente_ciu_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo),
  ADD CONSTRAINT direcciones_cliente_bar_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo, barrio_codigo)
    REFERENCES referencia_geografica_barrios (departamento_codigo, distrito_codigo, ciudad_codigo, codigo),
  ADD CONSTRAINT direcciones_cliente_geo_jerarquia_chk CHECK (
    (distrito_codigo IS NULL OR departamento_codigo IS NOT NULL)
    AND (ciudad_codigo IS NULL OR distrito_codigo IS NOT NULL)
    AND (barrio_codigo IS NULL OR ciudad_codigo IS NOT NULL)
    AND (pais_codigo = 'PRY' OR (departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL AND barrio_codigo IS NULL)));

-- ---- Proveedores (hoy sin FKs geográficas: solo el CHECK que se reemplaza)
ALTER TABLE proveedor_direcciones
  ADD COLUMN barrio_codigo integer,
  ADD COLUMN barrio        text CHECK (char_length(barrio) <= 150);
ALTER TABLE proveedor_direcciones DROP CONSTRAINT proveedor_direcciones_geo_codigos_chk;
ALTER TABLE proveedor_direcciones
  ADD CONSTRAINT proveedor_direcciones_dep_fk FOREIGN KEY (departamento_codigo) REFERENCES referencia_geografica_departamentos (codigo),
  ADD CONSTRAINT proveedor_direcciones_dis_fk FOREIGN KEY (departamento_codigo, distrito_codigo)
    REFERENCES referencia_geografica_distritos (departamento_codigo, codigo),
  ADD CONSTRAINT proveedor_direcciones_ciu_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo)
    REFERENCES referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo),
  ADD CONSTRAINT proveedor_direcciones_bar_fk FOREIGN KEY (departamento_codigo, distrito_codigo, ciudad_codigo, barrio_codigo)
    REFERENCES referencia_geografica_barrios (departamento_codigo, distrito_codigo, ciudad_codigo, codigo),
  ADD CONSTRAINT proveedor_direcciones_geo_jerarquia_chk CHECK (
    (distrito_codigo IS NULL OR departamento_codigo IS NOT NULL)
    AND (ciudad_codigo IS NULL OR distrito_codigo IS NOT NULL)
    AND (barrio_codigo IS NULL OR ciudad_codigo IS NOT NULL)
    AND (pais_codigo = 'PRY' OR (departamento_codigo IS NULL AND distrito_codigo IS NULL AND ciudad_codigo IS NULL AND barrio_codigo IS NULL)));

SELECT nex_aplicar_grants_runtime();   -- SELECT sobre el nuevo catálogo para nexit_runtime
