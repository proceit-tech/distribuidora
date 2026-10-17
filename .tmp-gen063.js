const fs = require("fs");
process.chdir("C:/PROJETOS/PROCEIT/distribuidora");
const M = "documentacao/banco/nexit/v1/migraciones/";
const lf = (t) => t.split("\r\n").join("\n");
const m60 = lf(fs.readFileSync(M + "NEX-060-facturacion-secuencias-por-tipo.sql", "utf8"));
const m62 = lf(fs.readFileSync(M + "NEX-062-facturacion-nce-v1.sql", "utf8"));

function bloque(src, inicio, fin) {
  const i = src.indexOf(inicio);
  if (i < 0) throw new Error("inicio " + inicio);
  const j = src.indexOf(fin, i);
  if (j < 0) throw new Error("fin " + fin);
  return src.slice(i, j);
}
function reemplazar(txt, a, b) {
  if (!txt.includes(a)) throw new Error("falta " + a.slice(0, 90));
  return txt.replace(a, () => b);
}

// ── crear_fe (NEX-060) ──
let fe = bloque(m60, "CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(", "COMMENT ON FUNCTION public.fe_documento_crear_fe");
fe = reemplazar(fe, "  v_sec public.fe_punto_secuencias%ROWTYPE;\n  v_num integer;\n", "  v_serie text;\n  v_num integer;\n");
const feRes0 = fe.indexOf("  SELECT * INTO v_sec FROM public.fe_punto_secuencias");
const feRes1 = fe.indexOf("  v_payload := p_payload");
if (feRes0 < 0 || feRes1 < feRes0) throw new Error("reserva fe");
fe = fe.slice(0, feRes0) + "  SELECT r.o_serie, r.o_numero INTO v_serie, v_num FROM public.fe_secuencia_reservar(p_empresa, p_punto, 'FE') r;\n  v_numero := lpad(v_num::text, 7, '0');\n\n" + fe.slice(feRes1);
fe = reemplazar(fe, "'dNumDoc', v_numero, 'dSerieNum', NULL,", "'dNumDoc', v_numero, 'dSerieNum', v_serie,");
fe = reemplazar(fe, "v_punto.codigo, v_numero, NULL, now(), p_cliente", "v_punto.codigo, v_numero, v_serie, now(), p_cliente");
fe = reemplazar(fe, "  -- Reserva del número. Orden de bloqueos:", "  -- NEX-063: reserva (serie, número) con paso atómico a la serie siguiente. Orden de bloqueos:");

// ── crear_nce (NEX-062) ──
let nce = bloque(m62, "CREATE OR REPLACE FUNCTION public.fe_documento_crear_nce(", "-- ── 4) Envío");
nce = reemplazar(nce, "  v_sec public.fe_punto_secuencias%ROWTYPE;\n", "  v_serie text;\n");
const nRes0 = nce.indexOf("  SELECT * INTO v_sec FROM public.fe_punto_secuencias");
const nRes1 = nce.indexOf("  v_payload := p_payload");
if (nRes0 < 0 || nRes1 < nRes0) throw new Error("reserva nce");
nce = nce.slice(0, nRes0) + "  SELECT r.o_serie, r.o_numero INTO v_serie, v_num FROM public.fe_secuencia_reservar(p_empresa, p_punto, 'NCE') r;\n  v_numero := lpad(v_num::text, 7, '0');\n\n" + nce.slice(nRes1);
nce = reemplazar(nce, "'dNumDoc', v_numero, 'dSerieNum', NULL,", "'dNumDoc', v_numero, 'dSerieNum', v_serie,");
nce = reemplazar(nce, "v_punto.codigo, v_numero, NULL, now(), v_fe.cliente_id", "v_punto.codigo, v_numero, v_serie, now(), v_fe.cliente_id");
nce = reemplazar(nce, "  -- Reserva del número NCE:", "  -- NEX-063: reserva (serie, número) de la secuencia NCE con paso atómico a la serie siguiente. Reserva del número NCE:");

const head = lf(fs.readFileSync(".tmp-063-head.sql", "utf8"));
const tail = lf(fs.readFileSync(".tmp-063-tail.sql", "utf8"));
const comentarios =
  "\n-- ── Emisión de la Factura Electrónica (NEX-060) con reserva por serie ────────────────────────────────────────────\n" + fe +
  "COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS 'NEX-063: crea la FE reservando (serie, número) de la secuencia FE del punto; exige el tipo activo.';\n\n" +
  "-- ── Emisión de la Nota de Crédito (NEX-062) con reserva por serie ────────────────────────────────────────────────\n" + nce.replace(/\n+$/, "\n") +
  "COMMENT ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) IS 'NEX-063: crea la NCE reservando (serie, número) de la secuencia NCE del punto; exige el tipo activo.';\n";
fs.writeFileSync(M + "NEX-063-facturacion-puntos-tipos-series.sql", head + comentarios + tail);

// ── reversión: restaura las definiciones previas (copiadas de NEX-060/062) y aborta si hay datos que solo existen con NEX-063 ──
const feOld = bloque(m60, "CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(", "COMMENT ON FUNCTION public.fe_documento_crear_fe");
const nceOld = bloque(m62, "CREATE OR REPLACE FUNCTION public.fe_documento_crear_nce(", "-- ── 4) Envío");
const triggerOld = bloque(m60, "CREATE OR REPLACE FUNCTION public.fe_secuencias_inmutable()", "CREATE TRIGGER fe_punto_secuencias_inmutable_trg");
const rev = `-- =====================================================================
-- REVERSIÓN de NEX-063 (puntos por tipo documental, series y paso atómico entre series). Ejecutar SOLO con autorización del responsable, con backup previo, en una transacción (psql -1).
-- ABORTA sin cambios si existen datos que solo tienen sentido con NEX-063: secuencias con serie, tipos desactivados o documentos emitidos con serie (volver atrás reutilizaría o ignoraría su
-- numeración). Restaura fe_documento_crear_fe (NEX-060), fe_documento_crear_nce (NEX-062) y el trigger de NEX-060; elimina las funciones y columnas nuevas. NO toca documentos, CDC ni numeración.
-- Después hay que borrar la fila 'NEX-063' de schema_migrations (como en las demás reversiones).
-- =====================================================================
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'serie') THEN
    RAISE EXCEPTION 'NEX-063 no está aplicada (fe_punto_secuencias.serie no existe): nada que revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE serie IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay secuencias con serie (AA…ZZ). Volver a NEX-060/062 las dejaría sin serie y reutilizaría números. Concilie con el responsable.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE serie IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: existen documentos emitidos con serie (dSerieNum). No se revierte la numeración por series.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE NOT activo) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay tipos desactivados por punto; NEX-062 no distingue su estado y los dejaría emitiendo. Actívelos o decida su baja antes de revertir.';
  END IF;
END $$;

LOCK TABLE public.fe_punto_secuencias IN EXCLUSIVE MODE;

DROP TRIGGER IF EXISTS fe_punto_secuencias_inmutable_trg ON public.fe_punto_secuencias;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_series();
DROP FUNCTION IF EXISTS public.fe_punto_estado(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.fe_secuencia_estado(uuid, uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fe_secuencia_configurar(uuid, uuid, uuid, text, text, integer, boolean, boolean);
DROP FUNCTION IF EXISTS public.fe_punto_registrar(uuid, uuid, uuid, text, text);

${feOld.replace(/\n+$/, "\n")}
${nceOld.replace(/\n+$/, "\n")}
${triggerOld.replace(/\n+$/, "\n")}
CREATE TRIGGER fe_punto_secuencias_inmutable_trg BEFORE UPDATE OR DELETE ON public.fe_punto_secuencias FOR EACH ROW EXECUTE FUNCTION public.fe_secuencias_inmutable();

DROP FUNCTION IF EXISTS public.fe_secuencia_reservar(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fe_punto_maximo_emitido_serie(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.fe_secuencia_siguiente(text, integer);
DROP FUNCTION IF EXISTS public.fe_serie_orden(text);
ALTER TABLE public.fe_punto_secuencias DROP COLUMN serie, DROP COLUMN activo;
`;
fs.writeFileSync("documentacao/banco/nexit/v1/scripts/reversion-NEX-063.sql", rev);
console.log("ok", fs.statSync(M + "NEX-063-facturacion-puntos-tipos-series.sql").size, rev.length);
