-- =====================================================================
-- NEX-024 — Clientes: DDI (código de país) separado para el teléfono y el celular fiscales (DEC-CLI-TEL-03/04).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh. Reversión: scripts/reversion-NEX-024.sql.
--
-- El número nacional sigue en clientes.telefono / clientes.celular (varchar(30), sin cambios, ahora solo dígitos
-- cuando lo graba la aplicación); el DDI va en columnas nuevas. NO se modifica ninguna fila existente: los
-- registros anteriores quedan con DDI NULL y su número tal como estaba (legados tolerados mientras no se editen).
-- El Manual SIFEN v150 (D214/D215) no define el DDI: solo se guarda; si el XML de V2 lo antepone queda por decidir.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN telefono_ddi varchar(3),
  ADD COLUMN celular_ddi  varchar(3);

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_telefono_ddi_chk CHECK (telefono_ddi IS NULL OR (telefono_ddi ~ '^[0-9]{1,3}$' AND telefono IS NOT NULL)),
  ADD CONSTRAINT clientes_celular_ddi_chk  CHECK (celular_ddi  IS NULL OR (celular_ddi  ~ '^[0-9]{1,3}$' AND celular  IS NOT NULL));

COMMENT ON COLUMN public.clientes.telefono_ddi IS 'DDI (código de país, 1–3 dígitos) del teléfono fiscal D214; NULL en registros anteriores a NEX-024.';
COMMENT ON COLUMN public.clientes.celular_ddi  IS 'DDI (código de país, 1–3 dígitos) del celular fiscal D215; NULL en registros anteriores a NEX-024.';
