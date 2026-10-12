-- =====================================================================
-- NEX-039 — Unidades de medida SIFEN (Tabla 5 del Manual Técnico v150, 34 entradas; E709 código, E710 representación).
-- Requiere NEX-003 (unidades_medida). NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-039.sql (aborta si ya hay vínculos). Reconciliación de datos EXISTENTES: scripts/reconciliar-fiscal-NEX-039-040.sql.
--
--   · Catálogo oficial unidades_medida_sifen con clave en el CÓDIGO NUMÉRICO. NO hay UNIQUE sobre descripción ni representación: Metros figura
--     dos veces (87/m y 108/MT) y 'ml' (660) difiere de 'ML' (88) solo por mayúsculas.
--   · unidades_medida.unidad_sifen_codigo (N:1, nullable): se conservan IDs, referencias, apresentaciones y movimientos. NO se fusiona ni se renombra nada.
--   · Una sola fuente de verdad: las columnas legadas codigo_sifen/descripcion_sifen quedan como ESPEJO derivado; un trigger las rellena desde el catálogo
--     cuando existe el vínculo (sin vínculo no se leen: la aplicación solo usa unidad_sifen_codigo). No se borra ningún dato.
--   · No vincula ni modifica ninguna unidad existente (eso lo hace el script de reconciliación, con registro antes/después).
--   · Decisión pendiente (NO tomada aquí): código de Metro (87 ó 108); Caja y Docena no tienen equivalencia en la Tabla 5.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.unidades_medida') IS NULL THEN
    RAISE EXCEPTION 'NEX-039 requiere NEX-003 (unidades_medida).';
  END IF;
  IF to_regclass('public.unidades_medida_sifen') IS NOT NULL THEN
    RAISE EXCEPTION 'unidades_medida_sifen ya existe: NEX-039 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE TABLE public.unidades_medida_sifen (
  codigo         integer     PRIMARY KEY CONSTRAINT unidades_medida_sifen_codigo_chk CHECK (codigo BETWEEN 1 AND 99999),
  representacion text        NOT NULL CONSTRAINT unidades_medida_sifen_repr_chk CHECK (char_length(representacion) BETWEEN 1 AND 10),
  descripcion    text        NOT NULL CONSTRAINT unidades_medida_sifen_desc_chk CHECK (length(btrim(descripcion)) > 0),
  fuente         text        NOT NULL DEFAULT 'MT150-T5',
  vigente        boolean     NOT NULL DEFAULT true,
  creado_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.unidades_medida_sifen IS 'Catálogo oficial SIFEN (MT v150, Tabla 5). Clave = código numérico E709. Solo lectura para el rol de la aplicación.';

INSERT INTO public.unidades_medida_sifen (codigo, representacion, descripcion) VALUES
  (87, 'm', 'Metros'),
  (2366, 'CPM', 'Costo por Mil'),
  (2329, 'UI', 'Unidad Internacional'),
  (110, 'M3', 'Metros cúbicos'),
  (77, 'UNI', 'Unidad'),
  (86, 'g', 'Gramos'),
  (89, 'LT', 'Litros'),
  (90, 'MG', 'Miligramos'),
  (91, 'CM', 'Centimetros'),
  (92, 'CM2', 'Centimetros cuadrados'),
  (93, 'CM3', 'Centimetros cubicos'),
  (94, 'PUL', 'Pulgadas'),
  (96, 'MM2', 'Milímetros cuadrados'),
  (79, 'kg/m²', 'Kilogramos s/ metro cuadrado'),
  (97, 'AA', 'Año'),
  (98, 'ME', 'Mes'),
  (99, 'TN', 'Tonelada'),
  (100, 'Hs', 'Hora'),
  (101, 'Mi', 'Minuto'),
  (104, 'DET', 'Determinación'),
  (103, 'Ya', 'Yardas'),
  (108, 'MT', 'Metros'),
  (109, 'M2', 'Metros cuadrados'),
  (95, 'MM', 'Milímetros'),
  (666, 'Se', 'Segundo'),
  (102, 'Di', 'Día'),
  (83, 'kg', 'Kilogramos'),
  (88, 'ML', 'Mililitros'),
  (625, 'Km', 'Kilómetros'),
  (660, 'ml', 'Metro lineal'),
  (885, 'GL', 'Unidad Medida Global'),
  (891, 'pm', 'Por Milaje'),
  (869, 'ha', 'Hectáreas'),
  (569, 'ración', 'Ración')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.unidades_medida
  ADD COLUMN unidad_sifen_codigo integer CONSTRAINT unidades_medida_unidad_sifen_fk REFERENCES public.unidades_medida_sifen (codigo);
CREATE INDEX unidades_medida_unidad_sifen_idx ON public.unidades_medida (unidad_sifen_codigo);
COMMENT ON COLUMN public.unidades_medida.unidad_sifen_codigo IS 'Equivalencia oficial SIFEN (E709). NULL = sin equivalencia configurada. Fuente única; codigo_sifen/descripcion_sifen son espejo legado.';
COMMENT ON COLUMN public.unidades_medida.codigo_sifen IS 'LEGADO (NEX-003): espejo de unidad_sifen_codigo. No leer ni escribir directamente.';
COMMENT ON COLUMN public.unidades_medida.descripcion_sifen IS 'LEGADO (NEX-003): espejo de la representación E710. No leer ni escribir directamente.';

CREATE OR REPLACE FUNCTION public.unidades_medida_espejo_sifen() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_repr text;
BEGIN
  IF NEW.unidad_sifen_codigo IS NOT NULL THEN
    SELECT representacion INTO v_repr FROM public.unidades_medida_sifen WHERE codigo = NEW.unidad_sifen_codigo;
    NEW.codigo_sifen := NEW.unidad_sifen_codigo::text;
    NEW.descripcion_sifen := v_repr;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER unidades_medida_espejo_sifen_trg
  BEFORE INSERT OR UPDATE OF unidad_sifen_codigo ON public.unidades_medida
  FOR EACH ROW EXECUTE FUNCTION public.unidades_medida_espejo_sifen();

-- Registro de las reconciliaciones fiscales de datos existentes (antes/después). Global; el rol de la aplicación solo lee (grants por nex_aplicar_grants_runtime).
CREATE TABLE public.fiscal_reconciliacion_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  script        text        NOT NULL,
  tabla         text        NOT NULL,
  registro_id   uuid,
  antes         jsonb,
  despues       jsonb,
  ejecutado_por text        NOT NULL DEFAULT current_user,
  ejecutado_at  timestamptz NOT NULL DEFAULT now()
);
