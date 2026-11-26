-- =====================================================================
-- NEX-078 — Facturación PRO-339-R01: máximo de líneas por Factura Electrónica NUEVA configurable POR EMPRESA (tenant de NEXIT, empresas.id).
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-339-R01-LIMITE-FE-CONFIGURABLE-EMPRESA-2026-11-02.md · Decisión: documentacao/decisiones/DEC-NEXIT-PRO-339-LIMITE-FE-POR-EMPRESA-2026-11-02.md
-- Qué agrega (incremental y aditiva: NO modifica NEX-002 ni ninguna migración anterior):
--  · empresas.fe_max_lineas integer NULL, CHECK (NULL o 1..999). NULL = sin política propia => 999, el máximo fiscal común (gCamItem, MAX_LINEAS de payload-fe.ts), exactamente el comportamiento actual.
--  · Sin DEFAULT distinto de NULL, sin UPDATE/INSERT de datos: al aplicarla NINGUNA empresa cambia (todas quedan en NULL = 999). Los valores concretos (p. ej. 21, 63, 99) son actos administrativos
--    separados (futura pantalla PRO-340 u operación autorizada por el responsable tras verificar empresas.id y backup); jamás se fijan aquí por nombre, RUC ni UUID.
--  · Sin permisos ni grants nuevos: la aplicación ya lee la tabla empresas (SELECT) y solo LEE esta columna por el empresa_id de la sesión. No se crea ningún camino de escritura.
-- Alcance de la regla: solo FE NUEVAS (prepararFactura, previa y emisión). No afecta NCE, FE históricas, reintentos idempotentes de una FE ya creada, KuDE, consultas ni reenvíos.
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM con backup previo y el runner oficial, después de la auditoría.
-- Pre-verificación: scripts/preflight-NEX-078.sql · Verificación: scripts/verificar-NEX-078.sql · Reversión: scripts/reversion-NEX-078.sql.
-- GATE DE DESPLIEGUE: el código de PRO-339-R01 FALLA CERRADO sin esta columna (rechaza con 422 toda FE nueva, previa incluida, con un mensaje claro; no aplica 999 en silencio).
-- Aplicar esta migración ANTES (o en la misma ventana) de habilitar esa versión de la aplicación.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE EXCEPTION 'NEX-078 requiere la tabla empresas (NEX-002).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas') THEN
    RAISE EXCEPTION 'empresas.fe_max_lineas ya existe: NEX-078 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.empresas ADD COLUMN fe_max_lineas integer NULL;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_fe_max_lineas_chk CHECK (fe_max_lineas IS NULL OR fe_max_lineas BETWEEN 1 AND 999);
COMMENT ON COLUMN public.empresas.fe_max_lineas IS 'NEX-078 / PRO-339: máximo de líneas (ítems de cuerpo.lineas, no cantidades) por Factura Electrónica NUEVA de esta empresa. NULL = 999 (máximo fiscal común). Solo FE nuevas; NCE e históricas no se limitan.';
