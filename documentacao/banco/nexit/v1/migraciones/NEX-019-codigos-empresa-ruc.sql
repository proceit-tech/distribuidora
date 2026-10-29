-- NEX-019 — Códigos visuales de empresa basados en RUC sin DV.
-- CASA MINGO: casa_mingo -> 80003314
-- PROCEIT:    proceit    -> 5469464
-- La PK empresas.id es UUID y NO cambia. No modificar usuarios, contraseñas,
-- perfiles, sesiones ni las FK empresa_id. El login consulta empresas.codigo.
-- Migración para base ya inicializada. Aborta si encuentra estados inesperados.
DO $$
DECLARE
  v_casa uuid;
  v_proceit uuid;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM empresas WHERE codigo IN ('casa_mingo', '80003314', 'proceit', '5469464');
  IF v_total <> 2 THEN
    RAISE EXCEPTION 'NEX-019: se esperaban exactamente dos empresas con los códigos antiguos/nuevos, se encontraron %', v_total;
  END IF;

  SELECT id INTO v_casa FROM empresas WHERE codigo IN ('casa_mingo', '80003314');
  SELECT id INTO v_proceit FROM empresas WHERE codigo IN ('proceit', '5469464');
  IF v_casa IS NULL OR v_proceit IS NULL OR v_casa = v_proceit THEN
    RAISE EXCEPTION 'NEX-019: no se pudieron identificar las dos empresas sin ambigüedad';
  END IF;

  UPDATE empresas SET codigo = '80003314' WHERE id = v_casa AND codigo = 'casa_mingo';
  UPDATE empresas SET codigo = '5469464' WHERE id = v_proceit AND codigo = 'proceit';

  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = v_casa AND codigo = '80003314')
     OR NOT EXISTS (SELECT 1 FROM empresas WHERE id = v_proceit AND codigo = '5469464') THEN
    RAISE EXCEPTION 'NEX-019: verificación final de códigos falló';
  END IF;
END $$;
