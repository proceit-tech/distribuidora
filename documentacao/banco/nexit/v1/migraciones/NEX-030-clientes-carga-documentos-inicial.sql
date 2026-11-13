-- =====================================================================
-- NEX-030 — Clientes: carga inicial de documentos vinculada a la CREACIÓN del cliente (F-CLI-09-03).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo).
-- Reversión: scripts/reversion-NEX-030.sql. No modifica el contenido de ninguna fila existente (solo agrega una columna).
--
-- Contexto: quien tiene solo CLIENTES.CREAR puede subir los archivos del alta, pero únicamente al cliente que ÉL creó y mientras
-- esa carga inicial siga abierta. La autoría ya existe en el modelo: clientes.creado_por (NEX-005, FK compuesta a usuarios, que la
-- aplicación pasa a completar en el alta). Falta un ESTADO que cierre la ventana de forma funcional (sin plazos arbitrarios):
--   clientes.carga_documentos_inicial_abierta = true  → el alta lo deja abierto; se cierra al terminar el flujo de alta
--   (POST /api/clientes/{id}/documentos/finalizar) o en la primera edición del cliente (PUT).
-- Clientes anteriores: queda false (DEFAULT), es decir, solo quien tenga CLIENTES.EDITAR puede agregarles documentos.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN carga_documentos_inicial_abierta boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.carga_documentos_inicial_abierta IS
  'true mientras el creador (creado_por) puede subir los documentos del alta con solo CLIENTES.CREAR. Se cierra al finalizar el alta o en la primera edición.';
