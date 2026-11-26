-- REVERSIÓN PROTEGIDA de NEX-085 (PRO-312-R02-C03: privilegios internos R05, hallazgo F-VM-084-01). NO es una migración: el runner no la ejecuta ni la descubre.
-- Nada de esto fue ejecutado por Claude.
--
-- NEX-085 es una corrección de SEGURIDAD: retira de nexit_runtime el EXECUTE (y grant option) de los 31 auxiliares internos de NEX-084 y del propio ayudante, por firma exacta,
-- y lo reimpone en cada reaplicación de nex_aplicar_grants_runtime(). NO existe una reversión rutinaria segura: deshacerla significaría
--   - restituir el ayudante vulnerable de NEX-084 (sin la revocación), con lo que la próxima reaplicación del wrapper devolvería a runtime el EXECUTE de los guardas de disparador
--     (fe_e03_r05_evidencia_guarda, fe_e03_r05_operacion_inicio_guarda, fe_e03_r05_post_grande_guarda, nex_e03_r05_estado_guarda), es decir, reintroducir F-VM-084-01; o
--   - conceder de nuevo esos privilegios a mano, con el mismo efecto.
-- Ninguna de las dos mantiene las invariantes de NEX-084 (control 63 de verificar-NEX-084.sql). Por eso este script NO modifica nada:
--   no restaura concesiones indebidas, no redefine ni restaura el ayudante, no borra la fila 'NEX-085' de schema_migrations, no cambia el modo ACTIVO/REVERTIDO de R05,
--   no toca NEX-084, sus tablas, disparadores ni evidencia, y no reaplica privilegios.
-- Desactivar el ENVÍO R05 (modo REVERTIDO, que retira las 7 escrituras y conserva las 3 lecturas) NO es deshacer NEX-085: con NEX-085 instalada se hace con el procedimiento
-- de operador desactivar-envio-r05.sql (PRO-312-R02-C04; runbook documentacao/infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md), que reaplica solo el ayudante
-- corregido por NEX-085 y conserva la revocación de los auxiliares internos. reversion-NEX-084.sql NO sirve con NEX-085 instalada: su P1 aborta ante cualquier migración posterior.
-- Cualquier intervención excepcional (p. ej. un defecto demostrado en la redefinición del ayudante) requiere diagnóstico, una DECISIÓN separada del responsable y una ORDEN
-- específica con su propia migración incremental posterior, preflight y verificación; nunca la edición de NEX-085 ya aplicada (el runner aborta ante un checksum distinto).
--
-- Uso (solo para dejar constancia; siempre termina en error y sin cambios):
--   psql -X -v ON_ERROR_STOP=1 -f reversion-NEX-085.sql
-- Checksum de NEX-085 que este script reconoce: 34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7
BEGIN READ ONLY;

\echo '== Estado (informativo, solo lectura) =='
SELECT (SELECT count(*) FROM public.schema_migrations WHERE version = 'NEX-085' AND checksum = '34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7') = 1 AS nex085_registrada_con_checksum,
       (SELECT count(*) FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = '38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854') = 1 AS nex084_original,
       (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS modo_r05;

DO $$
BEGIN
  RAISE EXCEPTION 'NEX-085: reversión NO disponible. Deshacer la corrección reintroduciría EXECUTE de nexit_runtime en auxiliares internos de NEX-084 (F-VM-084-01). No se modificó nada.'
    USING ERRCODE = 'P0001',
          DETAIL = 'NEX:NEX085_REVERSION_PROTEGIDA',
          HINT = 'Para desactivar el envío R05 con NEX-085 instalada use desactivar-envio-r05.sql (modo REVERTIDO; ver PROCEDIMENTO-DESACTIVACION-COORDINADA-R05). Toda intervención excepcional exige decisión y orden separadas del responsable y una migración incremental nueva.';
END $$;

ROLLBACK;
