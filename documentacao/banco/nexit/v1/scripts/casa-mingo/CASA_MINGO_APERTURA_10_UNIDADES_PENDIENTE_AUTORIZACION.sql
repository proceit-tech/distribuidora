-- NO EJECUTAR: este archivo quedo INVALIDADO por el responsable (20/10/2026).
-- Error: proponia 10 unidades PARA TODOS, ignorando cantidades originales.
-- REGLA CORRECTA: 465 cantidades positivas intactas; 89 ceros intactos;
-- solo 7 cantidades ausentes reciben 10. Ver script de apertura desde Excel.
\set ON_ERROR_STOP on
\echo 'BLOQUEADO: 10 unidades para todos los productos es incorrecto.'
\echo 'USAR CASA_MINGO_APERTURA_STOCK_EXCEL_PENDIENTE_AUTORIZACION.sql solo tras validar costos y permisos.'
\quit 2
