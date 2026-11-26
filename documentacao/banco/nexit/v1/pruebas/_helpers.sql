-- Helpers de prueba (sesión actual). Cada archivo T-xx hace \i _helpers.sql
\set ON_ERROR_STOP on
SET client_min_messages = notice;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALLA: %', msg; END IF;
  RAISE NOTICE 'PASS: %', msg;
END $$;
-- Ejecuta sql y exige que falle con el SQLSTATE indicado (o cualquiera si es NULL).
CREATE OR REPLACE FUNCTION pg_temp.falla(p_sql text, p_estado text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_estado IS NULL OR SQLSTATE = p_estado THEN
      RAISE NOTICE 'PASS: % (rechazado: %)', msg, SQLSTATE; RETURN;
    END IF;
    RAISE EXCEPTION 'FALLA: % — SQLSTATE inesperado % (%), esperado %', msg, SQLSTATE, SQLERRM, p_estado;
  END;
  RAISE EXCEPTION 'FALLA: % — la sentencia debió ser rechazada', msg;
END $$;
