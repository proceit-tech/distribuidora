-- =====================================================================
-- S-001 — Catálogos globales y permisos (idempotente)
-- Contenido de REFERENCIA para la demostración. NO es una carga oficial SIFEN/DNIT:
--   * geografía: subconjunto ilustrativo (Capital y Central) con códigos únicos globales
--     (el código desplegado une ciudades solo por distrito_codigo);
--   * unidades/impuestos: valores usuales; códigos SIFEN de unidades a confirmar en la carga oficial.
-- Seguro de re-ejecutar: ON CONFLICT DO NOTHING. No contiene datos de clientes reales ni contraseñas.
-- =====================================================================
INSERT INTO monedas (codigo, nombre, simbolo, decimales) VALUES
  ('PYG','Guaraní','₲',0), ('USD','Dólar estadounidense','US$',2), ('BRL','Real brasileño','R$',2), ('EUR','Euro','€',2)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO referencia_geografica_paises (codigo, nombre) VALUES
  ('PRY','Paraguay'),('ARG','Argentina'),('BRA','Brasil'),('URY','Uruguay'),('BOL','Bolivia'),('CHL','Chile'),
  ('USA','Estados Unidos'),('CHN','China'),('ESP','España'),('DEU','Alemania')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO referencia_geografica_departamentos (codigo, nombre) VALUES
  (1,'Capital'),(2,'Concepción'),(3,'San Pedro'),(4,'Cordillera'),(5,'Guairá'),(6,'Caaguazú'),(7,'Caazapá'),(8,'Itapúa'),
  (9,'Misiones'),(10,'Paraguarí'),(11,'Alto Paraná'),(12,'Central'),(13,'Ñeembucú'),(14,'Amambay'),(15,'Canindeyú'),
  (16,'Presidente Hayes'),(17,'Boquerón'),(18,'Alto Paraguay')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO referencia_geografica_distritos (departamento_codigo, codigo, nombre) VALUES
  (1,1,'Asunción'),
  (12,121,'Lambaré'),(12,122,'San Lorenzo'),(12,123,'Luque'),(12,124,'Fernando de la Mora'),(12,125,'Capiatá'),
  (11,111,'Ciudad del Este')
ON CONFLICT DO NOTHING;

INSERT INTO referencia_geografica_ciudades (departamento_codigo, distrito_codigo, codigo, nombre) VALUES
  (1,1,1,'Asunción'),
  (12,121,1210,'Lambaré'),(12,122,1220,'San Lorenzo'),(12,123,1230,'Luque'),(12,124,1240,'Fernando de la Mora'),(12,125,1250,'Capiatá'),
  (11,111,1110,'Ciudad del Este')
ON CONFLICT DO NOTHING;

INSERT INTO incoterms (codigo, nombre) VALUES
  ('EXW','En fábrica'),('FCA','Franco transportista'),('FOB','Franco a bordo'),('CIF','Costo, seguro y flete'),('DAP','Entregada en lugar'),('DDP','Entregada derechos pagados')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO unidades_medida (codigo, nombre, codigo_sifen, descripcion_sifen) VALUES
  ('UN','Unidad','77','Unidad'),('KG','Kilogramo','83','Kilogramo'),('LT','Litro','87','Litro'),
  ('CJ','Caja','CJ','Caja'),('MT','Metro','86','Metro'),('DOC','Docena','DOC','Docena')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO impuestos (codigo, nombre, porcentaje) VALUES
  ('IVA10','IVA 10 %',10),('IVA5','IVA 5 %',5),('EXE','Exenta',0)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO condiciones_pago (codigo, nombre, dias_vencimiento, requiere_credito) VALUES
  ('CONTADO','Contado',0,false),('CRED15','Crédito 15 días',15,true),('CRED30','Crédito 30 días',30,true),('CRED45','Crédito 45 días',45,true)
ON CONFLICT (codigo) DO NOTHING;

-- Permisos de las áreas aprobadas para la 1.ª demostración. clase: OPERACIONAL va a perfiles; DATO_SENSIBLE y ACCION_CRITICA
-- son controlados (el trigger ESC-13 impide ponerlos en un perfil; los otorga un flujo aparte, fuera de esta etapa).
INSERT INTO permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
SELECT r || '.' || a, r, a, m, 'EMPRESA', c
  FROM (VALUES
    ('CLIENTES','VER','ventas','OPERACIONAL'),('CLIENTES','CREAR','ventas','OPERACIONAL'),('CLIENTES','EDITAR','ventas','OPERACIONAL'),
    ('PROVEEDORES','VER','compras','OPERACIONAL'),('PROVEEDORES','CREAR','compras','OPERACIONAL'),('PROVEEDORES','EDITAR','compras','OPERACIONAL'),
    ('PRODUCTOS','VER','inventario','OPERACIONAL'),('PRODUCTOS','CREAR','inventario','OPERACIONAL'),('PRODUCTOS','EDITAR','inventario','OPERACIONAL'),
    ('LISTAS_PRECIO','VER','ventas','OPERACIONAL'),('LISTAS_PRECIO','CREAR','ventas','OPERACIONAL'),('LISTAS_PRECIO','EDITAR','ventas','OPERACIONAL'),
    ('STOCK','VER','inventario','OPERACIONAL'),
    ('MOVIMIENTOS','VER','inventario','OPERACIONAL'),('MOVIMIENTOS','CREAR','inventario','OPERACIONAL'),('MOVIMIENTOS','ANULAR','inventario','ACCION_CRITICA'),
    ('REPORTES','VER','reportes','OPERACIONAL'),('REPORTES','EXPORTAR','reportes','OPERACIONAL'),
    ('DASHBOARD','VER','general','OPERACIONAL'),
    ('PRODUCTOS_COSTO','VER','inventario','DATO_SENSIBLE'),('CLIENTES_CREDITO','VER','ventas','DATO_SENSIBLE'),('PROVEEDORES_BANCARIO','VER','compras','DATO_SENSIBLE')
  ) t(r, a, m, c)
ON CONFLICT (codigo) DO NOTHING;
