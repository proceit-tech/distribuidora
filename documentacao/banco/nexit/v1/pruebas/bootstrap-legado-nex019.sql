-- Bootstrap SINTÉTICO para bases EFÍMERAS de prueba (no es una migración ni una semilla de implantación).
-- NEX-019 actualiza los códigos de DOS empresas que ya existen en la base operativa (casa_mingo y proceit) y aborta si no las encuentra; ninguna migración NEX-001…018 las crea.
-- Para poder probar el flujo completo desde cero, aplicar-migraciones.sh ejecuta este archivo en la MISMA transacción que NEX-019, y solo si ejecutar-pruebas.sh definió
-- NEX_BOOTSTRAP_ANTES_DE_019 en una base nexit_test_*. Las filas son ficticias (sin RUC, sin usuarios, sin datos reales) y no se insertan si algún código antiguo o nuevo ya existe.
INSERT INTO empresas (codigo, razon_social)
SELECT v.codigo, v.razon_social
  FROM (VALUES ('casa_mingo', 'Empresa legada sintetica A (CI)'), ('proceit', 'Empresa legada sintetica B (CI)')) AS v (codigo, razon_social)
 WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE codigo IN ('casa_mingo', '80003314', 'proceit', '5469464'));
