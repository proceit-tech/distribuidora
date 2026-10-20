-- =====================================================================
-- CASA MINGO S.A. | APERTURA ADMINISTRATIVA CONTROLADA DE STOCK
-- 561 productos numericos de la carga enero 2026 | 10 unidades c/u
-- Deposito DEP-PRINCIPAL, propiedad PROPIO, estado DISPONIBLE.
-- EXCLUYE productos historicos PRD-000001 y PRD-000002.
-- Motor oficial: inventario_registrar_movimiento() (NEX-014); NO escribir
-- stock_saldos, inventario_costos o movimiento_lineas directamente.
-- 2 movimientos de 300 y 261 lineas (limite 500 por movimiento).
-- El flujo UI estandar NEX-066 reserva intenciones por producto; este
-- script es IMPORTACION ADMINISTRATIVA de una unica transaccion explicita.
-- NO EJECUTAR sin preflight, respaldo, costo real autorizado y aprobacion.
-- El costo unitario se exige explicito (NO usar precio de VENTA como costo).
-- Admite 0 desde el motor, pero produce inventario SIN VALOR CONTABLE.
-- Requiere operador real con MOVIMIENTOS.CREAR y acceso al deposito.
-- Idempotencia: keys fijas, bloquear re-ejecucion tras COMMIT.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?autorizar_apertura}
\else
  \echo 'ABORTADO: falta -v autorizar_apertura=true'
  \quit 2
\endif
\if :autorizar_apertura
\else
  \echo 'ABORTADO: autorizar_apertura debe ser true'
  \quit 2
\endif
\if :{?usuario_uuid}
\else
  \echo 'ABORTADO: falta -v usuario_uuid=<UUID real con MOVIMIENTOS.CREAR>'
  \quit 2
\endif
\if :{?costo_unitario}
\else
  \echo 'ABORTADO: falta -v costo_unitario=<valor PYG no negativo confirmado>'
  \quit 2
\endif

BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='180s';

-- Parametros propios de la conexion y esta transaccion.
SELECT set_config('casa_mingo.usuario_uuid', :'usuario_uuid', true);
SELECT set_config('casa_mingo.costo_unitario', :'costo_unitario', true);
SELECT pg_advisory_xact_lock(hashtextextended('CASA-MINGO-STOCK-10-20261020',0));

CREATE TEMP TABLE cm_apertura_evidencias (
  lote integer PRIMARY KEY,
  movimiento_id uuid NOT NULL,
  numero text NOT NULL,
  repetido boolean NOT NULL,
  lineas integer NOT NULL
) ON COMMIT DROP;

DO $valida$
DECLARE
  v_e uuid := '12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid;
  v_d uuid := 'a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid;
  v_u uuid := current_setting('casa_mingo.usuario_uuid')::uuid;
  v_k numeric := current_setting('casa_mingo.costo_unitario')::numeric;
  v_n integer;
BEGIN
 IF v_k<0 OR v_k<>round(v_k,4) OR v_k>99999999999999 THEN
   RAISE EXCEPTION 'COSTO INVALIDO: hasta 4 decimales, >= 0 (PYG)';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM empresas
    WHERE id=v_e AND codigo='80003314' AND razon_social='CASA MINGO S.A.'
      AND estado='ACTIVA' AND es_demo=false AND moneda_base_codigo='PYG'
 ) THEN RAISE EXCEPTION 'EMPRESA no coincide con CASA MINGO S.A. 80003314'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM depositos WHERE empresa_id=v_e AND id=v_d AND codigo='DEP-PRINCIPAL' AND activo
 ) THEN RAISE EXCEPTION 'DEPOSITO no coincide con DEP-PRINCIPAL activo'; END IF;
 IF NOT public.usuario_tiene_permiso(v_e,v_u,'MOVIMIENTOS','CREAR')
    OR NOT public.usuario_puede_deposito(v_e,v_u,v_d) THEN
    RAISE EXCEPTION 'USUARIO sin permiso MOVIMIENTOS.CREAR o alcance al deposito'; END IF;

 SELECT count(*) INTO v_n FROM productos p
 WHERE p.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$';
 IF v_n<>561 THEN RAISE EXCEPTION 'CARGA INCONSISTENTE: se esperaban 561 productos; encontrados %',v_n; END IF;
 IF EXISTS (
   SELECT 1 FROM productos p
   WHERE p.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$'
     AND (NOT p.activo OR NOT p.controla_stock OR p.modo_control_stock<>'CANTIDAD')
 ) THEN RAISE EXCEPTION 'PRODUCTOS INCOMPATIBLES con apertura automatica; revisar preflight'; END IF;
 IF EXISTS (
   SELECT 1 FROM stock_saldos s JOIN productos p ON p.empresa_id=s.empresa_id AND p.id=s.producto_id
   WHERE s.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$' AND s.cantidad<>0
 ) THEN RAISE EXCEPTION 'SALDO PREVIO: hay al menos un producto importado con stock en algun deposito; no sumar 10 a ciegas'; END IF;
 IF EXISTS (
   SELECT 1 FROM inventario_costos ic JOIN productos p ON p.empresa_id=ic.empresa_id AND p.id=ic.producto_id
   WHERE ic.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$'
     AND (ic.cantidad_valorizada<>0 OR ic.valor_total<>0)
 ) THEN RAISE EXCEPTION 'COSTO HISTORICO: existen cantidades/valores, revisar antes de apertura'; END IF;
 IF EXISTS (
   SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id=v_e
    AND m.clave_idempotencia IN ('CM-STOCK10-20261020-LOTE1','CM-STOCK10-20261020-LOTE2')
 ) THEN RAISE EXCEPTION 'APERTURA YA REGISTRADA: no repetir ni generar segunda entrada'; END IF;
END $valida$;

-- NEX-014 exige costo unitario por cada linea.
-- No usa ventas, no crea lotes artificiales ni afecta PRD-000001/2.
DO $registra$
DECLARE
  v_e uuid := '12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid;
  v_d uuid := 'a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid;
  v_u uuid := current_setting('casa_mingo.usuario_uuid')::uuid;
  v_k numeric := current_setting('casa_mingo.costo_unitario')::numeric;
  fila record;
  v_id uuid;
  v_num text;
  v_rep boolean;
BEGIN
 FOR fila IN
   WITH ordenados AS (
    SELECT p.id,p.codigo,
           CASE WHEN row_number() OVER(ORDER BY p.codigo)<=300 THEN 1 ELSE 2 END AS lote
    FROM productos p
    WHERE p.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$'
   )
   SELECT lote,count(*)::int AS n,
          jsonb_agg(jsonb_build_object(
            'producto_id',id,'cantidad',10,'costo_unitario',v_k,'propiedad','PROPIO'
          ) ORDER BY codigo) AS lineas
   FROM ordenados GROUP BY lote ORDER BY lote
 LOOP
   SELECT o_movimiento_id,o_numero,o_repetido
   INTO STRICT v_id,v_num,v_rep
   FROM public.inventario_registrar_movimiento(
     v_e,v_u,'ENTRADA','ABERTURA',DATE '2026-10-20',
     NULL::uuid,v_d,fila.lineas,
     'CM-STOCK10-20261020-LOTE'||fila.lote,
     NULL::uuid,
     'Carga inicial autorizada de 10 unidades por producto para CASA MINGO',
     'Importacion administrativa controlada; no representa conteo fisico certificado',
     'CASA-MINGO-10U-20261020'
   );
   IF v_rep THEN RAISE EXCEPTION 'Registro de idempotencia repetido en lote %: abortado', fila.lote; END IF;
   INSERT INTO cm_apertura_evidencias VALUES (fila.lote,v_id,v_num,v_rep,fila.n);
 END LOOP;
END $registra$;

\echo '=== Evidencias de movimientos del motor ==='
TABLE cm_apertura_evidencias;

DO $audita$
DECLARE
 v_e uuid := '12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid;
 v_d uuid := 'a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid;
 v_n integer;
 v_correctos integer;
 v_costos integer;
 v_lineas integer;
BEGIN
 SELECT COUNT(*),COALESCE(SUM(lineas),0) INTO v_n,v_lineas FROM cm_apertura_evidencias;
 IF v_n<>2 OR v_lineas<>561 THEN
   RAISE EXCEPTION 'EVIDENCIA: movimientos %, lineas %, esperado 2 y 561',v_n,v_lineas;
 END IF;
 SELECT COUNT(*) INTO v_correctos
 FROM productos p
 WHERE p.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$'
   AND (SELECT COALESCE(SUM(s.cantidad),0) FROM stock_saldos s
         WHERE s.empresa_id=v_e AND s.producto_id=p.id AND s.deposito_id=v_d
           AND s.estado_stock='DISPONIBLE' AND s.propiedad='PROPIO')=10;
 IF v_correctos<>561 THEN
   RAISE EXCEPTION 'AUDITORIA STOCK: solo %/561 productos tienen 10 disponibles',v_correctos;
 END IF;
 SELECT COUNT(*) INTO v_costos FROM productos p JOIN inventario_costos ic
   ON ic.empresa_id=p.empresa_id AND ic.producto_id=p.id AND ic.deposito_id=v_d
 WHERE p.empresa_id=v_e AND p.codigo ~ '^[0-9]{1,20}$' AND ic.cantidad_valorizada=10;
 IF v_costos<>561 THEN
   RAISE EXCEPTION 'AUDITORIA COSTO: solo %/561 productos con cantidad valorizada de 10',v_costos;
 END IF;
END $audita$;

SELECT COUNT(*) AS productos_con_10, SUM(cantidad) AS unidades_disponibles
FROM stock_saldos s JOIN productos p ON p.empresa_id=s.empresa_id AND p.id=s.producto_id
WHERE p.empresa_id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
 AND p.codigo ~ '^[0-9]{1,20}$'
 AND s.deposito_id='a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid
 AND s.estado_stock='DISPONIBLE' AND s.propiedad='PROPIO';

COMMIT;
-- CONDICION: NO se reemplaza inventario fisico real por supuesto de 10 unidades.
-- Validar por UI Stock/Movimientos antes de emitir facturas reales.
