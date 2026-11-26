-- =====================================================================
-- NEX-056 — Facturación, Fase A (PRO-93, FE-UX-07/08): permiso FACTURACION_ELECTRONICA.AJUSTE_FISCAL y bitácora de las clasificaciones de IVA que una factura guarda en Productos.
-- Requiere NEX-048 (permiso CREAR, documentos_electronicos) y NEX-052 (envoltorio de grants que descubre los ayudantes nex_aplicar_grants_*). Incremental: NO edita NEX-001…055.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-056.sql. ESTADO: versionada y NO aplicada.
--
--  · Permiso AJUSTE_FISCAL: corregir en la propia factura (solo para ese documento) la unidad SIFEN, la afectación/tasa/proporción de IVA, la descripción fiscal y el GTIN de un ítem. Se registra SIN
--    asignarlo a ningún perfil (el administrador de la empresa lo tiene por definición; los demás, por decisión expresa del responsable). Sin la migración, o sin el permiso, la aplicación sigue
--    exigiendo que el producto esté completo en el cadastro, como hasta ahora.
--  · producto_clasificacion_fiscal_log: bitácora inmutable (solo altas) de cada vez que una factura, con confirmación explícita y permiso PRODUCTOS.EDITAR, GUARDA en Productos la clasificación de IVA
--    corregida (valor anterior, valor nuevo, documento, usuario). La unidad SIFEN y el precio NO se guardan en el producto desde la factura (la unidad pertenece al catálogo de unidades y a las reglas
--    DEC-PRD-U03/U08/U09; el precio, a Listas de precios).
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CREAR') OR to_regclass('public.documentos_electronicos') IS NULL OR to_regclass('public.productos') IS NULL THEN
    RAISE EXCEPTION 'NEX-056 requiere NEX-048 (permiso FACTURACION_ELECTRONICA.CREAR y documentos_electronicos).';
  END IF;
  IF to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-056 requiere NEX-012 (nex_reinicio_demo_activo) y NEX-052 (envoltorio de grants que reaplica todos los ayudantes).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL') OR to_regclass('public.producto_clasificacion_fiscal_log') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-056 parece aplicada (el permiso o la bitácora ya existen); no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('FACTURACION_ELECTRONICA.AJUSTE_FISCAL', 'FACTURACION_ELECTRONICA', 'AJUSTE_FISCAL', 'facturacion', 'SUCURSAL', 'OPERACIONAL');

CREATE TABLE public.producto_clasificacion_fiscal_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid        NOT NULL REFERENCES public.empresas (id),
  producto_id   uuid        NOT NULL,
  documento_id  uuid        NOT NULL,
  usuario_id    uuid        NOT NULL,
  anterior      jsonb       NOT NULL,
  nuevo         jsonb       NOT NULL,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_clasificacion_fiscal_log_producto_fk  FOREIGN KEY (empresa_id, producto_id)  REFERENCES public.productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_clasificacion_fiscal_log_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_clasificacion_fiscal_log_usuario_fk   FOREIGN KEY (empresa_id, usuario_id)   REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX producto_clasificacion_fiscal_log_producto_idx ON public.producto_clasificacion_fiscal_log (empresa_id, producto_id, creado_at DESC);

COMMENT ON TABLE public.producto_clasificacion_fiscal_log IS 'Bitácora inmutable de las clasificaciones de IVA guardadas en Productos desde una factura (confirmación explícita + PRODUCTOS.EDITAR). Solo altas; el borrado solo ocurre al eliminar una empresa DEMO.';

CREATE OR REPLACE FUNCTION public.producto_clasificacion_fiscal_log_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'producto_clasificacion_fiscal_log es de solo altas: no se modifica ni se borra.' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER producto_clasificacion_fiscal_log_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.producto_clasificacion_fiscal_log
  FOR EACH ROW EXECUTE FUNCTION public.producto_clasificacion_fiscal_log_inmutable();
CREATE TRIGGER producto_clasificacion_fiscal_log_inmutable_truncate_trg BEFORE TRUNCATE ON public.producto_clasificacion_fiscal_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.producto_clasificacion_fiscal_log_inmutable();

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_ajuste() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  GRANT SELECT, INSERT ON public.producto_clasificacion_fiscal_log TO nexit_runtime;
  REVOKE UPDATE, DELETE, TRUNCATE ON public.producto_clasificacion_fiscal_log FROM nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_ajuste();
