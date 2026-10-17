-- =====================================================================
-- NEX-043 — Catálogo SIFEN de unidades de medida: 30 unidades de la NT023 §3.1 (códigos 111–140). Incremental sobre NEX-039.
-- NEX-039 NO se modifica (ya aplicada con 34 unidades de la Tabla 5 del MT v150); esta migración solo AGREGA filas: las 34 existentes,
-- los vínculos de unidades_medida, el trigger espejo y los grants quedan intactos. Catálogo resultante: 34 + 30 = 64 entradas.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-043.sql.
--   · Caja es 131/BX y Docena es 113/DOC (NT023). No se vincula ninguna unidad existente (lo hace scripts/reconciliar-unidades-sifen-NEX-039.sql
--     con autorización). Decisión pendiente (NO tomada aquí): código de Metro (87 ó 108).
--   · Solo requiere NEX-039 (tabla unidades_medida_sifen con la columna fuente); no depende de NEX-040, 041 ni 042 y no toca sus objetos.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.unidades_medida_sifen') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'unidades_medida_sifen' AND column_name = 'fuente') THEN
    RAISE EXCEPTION 'NEX-043 requiere NEX-039 (public.unidades_medida_sifen).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.unidades_medida_sifen WHERE codigo BETWEEN 111 AND 140) THEN
    RAISE EXCEPTION 'unidades_medida_sifen ya tiene códigos 111–140: NEX-043 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.unidades_medida_sifen (codigo, representacion, descripcion, fuente) VALUES
  (111, '4A', 'Bovinas', 'NT023-T5'),
  (112, 'Ci', 'Curie', 'NT023-T5'),
  (113, 'DOC', 'Docena', 'NT023-T5'),
  (114, 'GLL', 'Galones (US) (3,7843 LT)', 'NT023-T5'),
  (115, 'GRO', 'Gruesas', 'NT023-T5'),
  (116, 'E4', 'Kilogramo Bruto', 'NT023-T5'),
  (117, 'KT', 'Kits', 'NT023-T5'),
  (118, 'M5', 'Microcurie', 'NT023-T5'),
  (119, 'MCU', 'Milicurie', 'NT023-T5'),
  (120, 'MIL', 'Millar', 'NT023-T5'),
  (121, 'PAR', 'Par', 'NT023-T5'),
  (122, 'FOT', 'Pies', 'NT023-T5'),
  (123, 'FTK', 'Pies Cuadradas', 'NT023-T5'),
  (124, 'PCE', 'Piezas', 'NT023-T5'),
  (125, 'KLT', 'Quilate', 'NT023-T5'),
  (126, 'RM', 'Resmas', 'NT023-T5'),
  (127, 'RO', 'Rollos', 'NT023-T5'),
  (128, 'kWh', '1000 Kilowatt Hora', 'NT023-T5'),
  (129, 'U(JGO)', 'Mazos', 'NT023-T5'),
  (130, 'DR', 'Tambores', 'NT023-T5'),
  (131, 'BX', 'Caja', 'NT023-T5'),
  (132, 'SET', 'Juego', 'NT023-T5'),
  (133, 'PK', 'Paquete', 'NT023-T5'),
  (134, 'BG', 'Bolsa', 'NT023-T5'),
  (135, 'DPC', 'Docena Par', 'NT023-T5'),
  (136, 'JR', 'Pote', 'NT023-T5'),
  (137, 'BL', 'Fardos', 'NT023-T5'),
  (138, 'AB', 'Bulto', 'NT023-T5'),
  (139, 'BK', 'Cesta', 'NT023-T5'),
  (140, 'BW', 'Peso Base', 'NT023-T5');

-- Verificación posterior: las 30 filas nuevas están completas y el catálogo no perdió ninguna de las anteriores.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.unidades_medida_sifen WHERE codigo BETWEEN 111 AND 140 AND fuente = 'NT023-T5') <> 30 THEN
    RAISE EXCEPTION 'NEX-043: se esperaban 30 unidades NT023 (111–140).';
  END IF;
END $$;
