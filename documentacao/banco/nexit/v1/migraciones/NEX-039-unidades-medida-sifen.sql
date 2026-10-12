-- =====================================================================
-- NEX-039 — Unidades de medida SIFEN (Tabla 5 del Manual Técnico v150, 34 entradas; E709 código, E710 representación).
-- Requiere NEX-003 (unidades_medida) y NEX-037 (envoltorio de grants nex_aplicar_grants_runtime / nex_aplicar_grants_proveedores). NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-039.sql (aborta si ya hay vínculos). Reconciliación de unidades EXISTENTES: scripts/reconciliar-unidades-sifen-NEX-039.sql.
--
--   · Catálogo oficial unidades_medida_sifen con clave en el CÓDIGO NUMÉRICO. NO hay UNIQUE sobre descripción ni representación: Metros figura
--     dos veces (87/m y 108/MT) y 'ml' (660) difiere de 'ML' (88) solo por mayúsculas.
--   · unidades_medida.unidad_sifen_codigo (N:1, nullable): se conservan IDs, referencias, apresentaciones y movimientos. NO se fusiona ni se renombra nada.
--   · Una sola fuente de verdad: las columnas legadas codigo_sifen/descripcion_sifen quedan como ESPEJO derivado; un trigger las rellena desde el catálogo
--     cuando existe el vínculo; si el vínculo se RETIRA, se limpian y el valor anterior queda en fiscal_reconciliacion_log (nunca un código
--     antiguo que parezca válido sin vínculo canónico). La aplicación solo usa unidad_sifen_codigo. Ningún dato se pierde sin rastro.
--   · Grants: el catálogo es de SOLO LECTURA para el rol de la aplicación y el registro de reconciliación no es accesible para él (guarda instantáneas de
--     varias empresas). nex_aplicar_grants_runtime() (que hace REVOKE ALL y reconcede) se envuelve para reaplicar también estos permisos (convención de NEX-037).
--   · No vincula ni modifica ninguna unidad existente (eso lo hace el script de reconciliación, con registro antes/después).
--   · Decisión pendiente (NO tomada aquí): código de Metro (87 ó 108); Caja y Docena no tienen equivalencia en la Tabla 5.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.unidades_medida') IS NULL THEN
    RAISE EXCEPTION 'NEX-039 requiere NEX-003 (unidades_medida).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL OR to_regprocedure('public.nex_aplicar_grants_proveedores()') IS NULL THEN
    RAISE EXCEPTION 'NEX-039 requiere NEX-037 (envoltorio de grants del runtime).';
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
    -- Con vínculo, los campos legados son SIEMPRE el espejo del catálogo (aunque alguien intente escribirlos).
    SELECT representacion INTO v_repr FROM public.unidades_medida_sifen WHERE codigo = NEW.unidad_sifen_codigo;
    NEW.codigo_sifen := NEW.unidad_sifen_codigo::text;
    NEW.descripcion_sifen := v_repr;
  ELSIF TG_OP = 'UPDATE' AND OLD.unidad_sifen_codigo IS NOT NULL THEN
    -- Vínculo retirado: el código legado deja de existir como «válido». El valor anterior queda trazado.
    INSERT INTO public.fiscal_reconciliacion_log (script, tabla, registro_id, antes, despues)
    VALUES ('trigger/unidades_medida_espejo_sifen/desvinculo', 'unidades_medida', OLD.id,
            jsonb_build_object('unidad_sifen_codigo', OLD.unidad_sifen_codigo, 'codigo_sifen', OLD.codigo_sifen, 'descripcion_sifen', OLD.descripcion_sifen),
            jsonb_build_object('unidad_sifen_codigo', NULL, 'codigo_sifen', NULL, 'descripcion_sifen', NULL));
    NEW.codigo_sifen := NULL;
    NEW.descripcion_sifen := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER unidades_medida_espejo_sifen_trg
  BEFORE INSERT OR UPDATE OF unidad_sifen_codigo, codigo_sifen, descripcion_sifen ON public.unidades_medida
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

-- Permisos del rol de la aplicación sobre las tablas NUEVAS (idempotentes y resistentes a nex_aplicar_grants_runtime(), que hace REVOKE ALL):
--   · unidades_medida_sifen: solo SELECT (catálogo oficial; sin INSERT/UPDATE/DELETE).
--   · fiscal_reconciliacion_log: sin acceso (instantáneas de datos de varias empresas; solo el administrador de la base).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_fiscal() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON public.unidades_medida_sifen FROM nexit_runtime;
  GRANT SELECT ON public.unidades_medida_sifen TO nexit_runtime;
  REVOKE ALL ON public.fiscal_reconciliacion_log FROM nexit_runtime;
END $$;

-- Convención de NEX-037: el envoltorio llama a la función base y a cada función de permisos por módulo.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
END $$;

SELECT public.nex_aplicar_grants_fiscal();
