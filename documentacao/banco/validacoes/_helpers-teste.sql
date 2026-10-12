-- Helpers de teste para bancos DESCARTÁVEIS. Não criar em banco real.
-- Uso: \i _helpers-teste.sql  (como superusuário do banco descartável)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dn_app_test') THEN
    CREATE ROLE dn_app_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO dn_app_test;

-- Falha o teste se o comando NÃO gerar o SQLSTATE esperado (ou qualquer erro, se NULL).
CREATE OR REPLACE FUNCTION expect_error(test_name text, stmt text, expected_state text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF expected_state IS NOT NULL AND SQLSTATE <> expected_state THEN
      RAISE EXCEPTION 'TESTE FALHOU [%]: esperado %, obtido % (%)', test_name, expected_state, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'OK   [%] negado com % ', test_name, SQLSTATE;
    RETURN;
  END;
  RAISE EXCEPTION 'TESTE FALHOU [%]: o comando deveria falhar', test_name;
END $$;

CREATE OR REPLACE FUNCTION expect_count(test_name text, query text, expected bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || query || ') q' INTO n;
  IF n <> expected THEN
    RAISE EXCEPTION 'TESTE FALHOU [%]: esperado % linhas, obtido %', test_name, expected, n;
  END IF;
  RAISE NOTICE 'OK   [%] % linha(s)', test_name, n;
END $$;

-- Falha o teste se o DML afetar um número de linhas diferente do esperado.
CREATE OR REPLACE FUNCTION expect_affected(test_name text, stmt text, expected bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> expected THEN
    RAISE EXCEPTION 'TESTE FALHOU [%]: esperado % linha(s) afetadas, obtido %', test_name, expected, n;
  END IF;
  RAISE NOTICE 'OK   [%] % linha(s) afetadas', test_name, n;
END $$;
