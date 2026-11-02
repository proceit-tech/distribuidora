-- =====================================================================
-- NEX-023 — Clientes: un único cliente Innominado por empresa, garantizado por el banco (DEC-CLI-03).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- El índice existente clientes_empresa_identificacion_key EXCLUYE a INNOMINADO, por lo que la API era la única barrera
-- y no resistía solicitudes concurrentes. Este índice parcial cierra esa brecha.
-- No modifica ni borra filas: si ya hay empresas con más de un Innominado, ABORTA sin cambios para que el
-- responsable regularice los datos (por ejemplo, reasignando referencias y eliminando duplicados) antes de reintentar.
-- Reversión: DROP INDEX clientes_empresa_innominado_key (scripts/reversion-NEX-022-023.sql).
-- =====================================================================

DO $$
DECLARE
  v_empresas integer;
BEGIN
  SELECT count(*) INTO v_empresas FROM (
    SELECT empresa_id FROM public.clientes WHERE tipo_documento = 'INNOMINADO' GROUP BY empresa_id HAVING count(*) > 1
  ) x;

  IF v_empresas > 0 THEN
    RAISE EXCEPTION 'NEX-023 abortada: % empresa(s) tienen más de un cliente Innominado. Regularice los datos antes de aplicar.', v_empresas;
  END IF;
END
$$;

CREATE UNIQUE INDEX clientes_empresa_innominado_key
  ON public.clientes (empresa_id)
  WHERE tipo_documento = 'INNOMINADO';
