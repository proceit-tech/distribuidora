-- =====================================================================
-- NEX-053 — Clientes: privilegios permanentes de los documentos del cliente (CLI-A06). Requiere NEX-052 (envoltorio de grants que reaplica TODOS los ayudantes).
-- Incremental: NO modifica NEX-001…052. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-053.sql. Verificación: scripts/verificar-NEX-053.sql. ESTADO: versionada y NO aplicada.
--
-- Problema: NEX-031 quitó DELETE sobre cliente_documentos y concedió SELECT, INSERT sobre cliente_documento_versiones y cliente_documento_eventos UNA SOLA vez. Cada vez que se
-- ejecuta nex_aplicar_grants_runtime() (NEX-014 en adelante) se revoca todo y se vuelve a conceder según listas fijas: cliente_documentos recupera DELETE físico y las tablas de
-- versiones y eventos pierden INSERT, de modo que subir/versionar documentos fallaría y la eliminación lógica dejaría de estar garantizada por la base.
--
-- Solución: ayudante idempotente nex_aplicar_grants_clientes(), que el envoltorio de NEX-052 descubre y aplica después de la base en cada reaplicación. Preserva todos los
-- demás ayudantes (no los toca) y deja exactamente el estado de NEX-031: documentos sin DELETE; versiones y eventos solo SELECT e INSERT (historial inmutable).
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.cliente_documentos') IS NULL OR to_regclass('public.cliente_documento_versiones') IS NULL OR to_regclass('public.cliente_documento_eventos') IS NULL THEN
    RAISE EXCEPTION 'NEX-053 requiere NEX-031 (versiones y eventos de documentos de clientes).';
  END IF;
  IF to_regclass('public.producto_unidad_base_historial') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-053 requiere NEX-052 (envoltorio de grants que reaplica todos los ayudantes).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_clientes()') IS NOT NULL THEN
    RAISE EXCEPTION 'nex_aplicar_grants_clientes ya existe: NEX-053 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_clientes() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- Documentos: alta y exclusión LÓGICA (UPDATE); jamás DELETE físico.
  GRANT SELECT, INSERT, UPDATE ON public.cliente_documentos TO nexit_runtime;
  REVOKE DELETE ON public.cliente_documentos FROM nexit_runtime;
  -- Versiones y eventos: historial inmutable (solo lectura e inserción).
  GRANT SELECT, INSERT ON public.cliente_documento_versiones TO nexit_runtime;
  GRANT SELECT, INSERT ON public.cliente_documento_eventos TO nexit_runtime;
  REVOKE UPDATE, DELETE ON public.cliente_documento_versiones FROM nexit_runtime;
  REVOKE UPDATE, DELETE ON public.cliente_documento_eventos FROM nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_clientes();
