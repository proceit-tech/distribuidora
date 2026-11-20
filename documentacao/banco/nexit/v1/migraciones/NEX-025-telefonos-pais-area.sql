-- =====================================================================
-- NEX-025 — Teléfono y celular por PAÍS y código de ÁREA (retificación 2026-10-11): cliente principal y contactos.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Requiere NEX-024 (telefono_ddi / celular_ddi en clientes). Reversión: scripts/reversion-NEX-025.sql.
--
-- Modelo: país del número (ISO alfa-3 del plan configurado, o 'OTR' = país sin plan, con DDI manual), DDI, código de
-- área (solo donde el plan del país lo usa) y número nacional en las columnas existentes (telefono / celular).
-- NO se modifica ninguna fila: los registros anteriores quedan con país/DDI/área NULL.
-- NO HAY ni habrá ninguna restricción de UNICIDAD sobre teléfonos: los números pueden repetirse entre clientes, contactos
-- y empresas (retificación 2026-10-11). El país del teléfono es independiente del país fiscal del receptor.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN telefono_pais varchar(3),
  ADD COLUMN telefono_area varchar(5),
  ADD COLUMN celular_pais  varchar(3),
  ADD COLUMN celular_area  varchar(5);

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_telefono_pais_chk CHECK (
    (telefono_pais IS NULL OR (telefono_pais ~ '^[A-Z]{3}$' AND telefono IS NOT NULL))
    AND (telefono_area IS NULL OR (telefono_area ~ '^[0-9]{1,5}$' AND telefono_pais IS NOT NULL))),
  ADD CONSTRAINT clientes_celular_pais_chk CHECK (
    (celular_pais IS NULL OR (celular_pais ~ '^[A-Z]{3}$' AND celular IS NOT NULL))
    AND (celular_area IS NULL OR (celular_area ~ '^[0-9]{1,5}$' AND celular_pais IS NOT NULL)));

ALTER TABLE public.cliente_contactos
  ADD COLUMN telefono_pais varchar(3),
  ADD COLUMN telefono_ddi  varchar(3),
  ADD COLUMN telefono_area varchar(5),
  ADD COLUMN celular_pais  varchar(3),
  ADD COLUMN celular_ddi   varchar(3),
  ADD COLUMN celular_area  varchar(5);

ALTER TABLE public.cliente_contactos
  ADD CONSTRAINT cliente_contactos_telefono_pais_chk CHECK (
    (telefono_pais IS NULL OR (telefono_pais ~ '^[A-Z]{3}$' AND telefono IS NOT NULL AND telefono_ddi ~ '^[0-9]{1,3}$'))
    AND (telefono_area IS NULL OR (telefono_area ~ '^[0-9]{1,5}$' AND telefono_pais IS NOT NULL))
    AND (telefono_ddi IS NULL OR telefono_pais IS NOT NULL)),
  ADD CONSTRAINT cliente_contactos_celular_pais_chk CHECK (
    (celular_pais IS NULL OR (celular_pais ~ '^[A-Z]{3}$' AND celular IS NOT NULL AND celular_ddi ~ '^[0-9]{1,3}$'))
    AND (celular_area IS NULL OR (celular_area ~ '^[0-9]{1,5}$' AND celular_pais IS NOT NULL))
    AND (celular_ddi IS NULL OR celular_pais IS NOT NULL));

COMMENT ON COLUMN public.clientes.telefono_pais IS 'País del número del teléfono (ISO alfa-3 del plan, u OTR); independiente del país fiscal; NULL en registros anteriores.';
COMMENT ON COLUMN public.clientes.celular_pais  IS 'País del número del celular (ISO alfa-3 del plan, u OTR); independiente del país fiscal; NULL en registros anteriores.';
