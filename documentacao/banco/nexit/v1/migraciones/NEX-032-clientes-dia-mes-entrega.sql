-- =====================================================================
-- NEX-032 — Clientes: día del mes para la frecuencia de entrega MENSUAL (decisión final 9, 2026-10-11).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-032.sql. No modifica ninguna fila existente (los clientes MENSUAL anteriores quedan con NULL).
--
-- MENSUAL: se solicita el día del mes (1–31). A_DEMANDA y demás frecuencias: sin día del mes. El comportamiento de los días 29–31 en
-- meses más cortos NO está definido (requiere especificación previa): aquí solo se guarda la preferencia; no se genera calendario.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN dia_mes_entrega smallint,
  ADD CONSTRAINT clientes_dia_mes_entrega_chk CHECK (
    dia_mes_entrega IS NULL OR (dia_mes_entrega BETWEEN 1 AND 31 AND frecuencia_entrega = 'MENSUAL'));

COMMENT ON COLUMN public.clientes.dia_mes_entrega IS 'Día del mes (1–31) de entrega cuando frecuencia_entrega = MENSUAL; NULL en cualquier otro caso o en registros anteriores.';
