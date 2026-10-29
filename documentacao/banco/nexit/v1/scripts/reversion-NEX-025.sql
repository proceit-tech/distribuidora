-- REVERSIÓN manual de NEX-025 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y
-- con backup:  psql -1 -f reversion-NEX-025.sql. Elimina país/DDI/área de teléfonos (los números nacionales quedan).
-- Después, borrar la fila 'NEX-025' de schema_migrations (decisión del responsable) para poder reaplicarla.
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_telefono_pais_chk,
  DROP CONSTRAINT IF EXISTS clientes_celular_pais_chk,
  DROP COLUMN IF EXISTS telefono_pais, DROP COLUMN IF EXISTS telefono_area,
  DROP COLUMN IF EXISTS celular_pais,  DROP COLUMN IF EXISTS celular_area;
ALTER TABLE public.cliente_contactos
  DROP CONSTRAINT IF EXISTS cliente_contactos_telefono_pais_chk,
  DROP CONSTRAINT IF EXISTS cliente_contactos_celular_pais_chk,
  DROP COLUMN IF EXISTS telefono_pais, DROP COLUMN IF EXISTS telefono_ddi, DROP COLUMN IF EXISTS telefono_area,
  DROP COLUMN IF EXISTS celular_pais,  DROP COLUMN IF EXISTS celular_ddi,  DROP COLUMN IF EXISTS celular_area;
