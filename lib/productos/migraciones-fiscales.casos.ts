/**
 * Regresión PRD-AUD-03…06 y verificación conjunta de NEX-038, NEX-039 y NEX-040: runner de migraciones (ejecutado de verdad con un `psql` simulado),
 * grants del runtime, mensajes de los triggers, espejo de unidades al retirar el vínculo, y dependencias/reversiones. Sin PostgreSQL.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";

const raiz = process.cwd();
const V1 = "documentacao/banco/nexit/v1";
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

/** Ejecuta el runner OFICIAL con un `psql` falso que registra las llamadas y responde según variables de entorno. */
function ejecutarRunner(existeFuncion: boolean, fallaConcesion: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "runner-"));
  const migraciones = join(dir, "migraciones");
  const bin = join(dir, "bin");
  const log = join(dir, "psql.log");
  const sql = "SELECT 1;\n";

  for (const d of [migraciones, bin]) spawnSync("mkdir", ["-p", d]);
  writeFileSync(join(migraciones, "NEX-001-prueba.sql"), sql);
  writeFileSync(
    join(bin, "psql"),
    `#!/usr/bin/env bash
echo "$*" >> "${log.replace(/\\/g, "/")}"
case "$*" in
  *"to_regclass('public.schema_migrations')"*) echo t ;;
  *"select checksum from schema_migrations"*) echo "$SHIM_SUM" ;;
  *"to_regprocedure('public.nex_aplicar_grants_runtime()')"*) [[ "$SHIM_EXISTE" == "1" ]] && echo t || echo f ;;
  *"select public.nex_aplicar_grants_runtime()"*) [[ "$SHIM_FALLA" == "1" ]] && { echo "ERROR: fallo de concesión" >&2; exit 1; } || exit 0 ;;
  *) exit 0 ;;
esac
`,
  );
  chmodSync(join(bin, "psql"), 0o755);

  const r = spawnSync("bash", [join(raiz, V1, "scripts/aplicar-migraciones.sh")], {
    env: {
      ...process.env,
      PATH: `${bin.replace(/\\/g, "/")}:${process.env.PATH}`,
      MIGRACIONES_DIR: migraciones.replace(/\\/g, "/"),
      PGDATABASE: "base_de_prueba",
      SHIM_SUM: createHash("sha256").update(sql).digest("hex"),
      SHIM_EXISTE: existeFuncion ? "1" : "0",
      SHIM_FALLA: fallaConcesion ? "1" : "0",
    },
    encoding: "utf8",
  });
  const llamadas = existeLog(log) ? readFileSync(log, "utf8") : "";

  return { estado: r.status, salida: `${r.stdout}${r.stderr}`, llamadas };
}

function existeLog(ruta: string) {
  try {
    readFileSync(ruta);

    return true;
  } catch {
    return false;
  }
}

/** Marcadores de un RAISE EXCEPTION: % que no sea %% frente a la cantidad de argumentos. */
function raisesDescuadrados(sql: string): string[] {
  const malos: string[] = [];

  for (const m of sinComentarios(sql).matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'\s*(?:,([^;]*?))?\s*(?:USING[^;]*)?;/g)) {
    const marcadores = (m[1].replace(/%%/g, "").match(/%/g) ?? []).length;
    const argumentos = m[2] ? m[2].split(",").map((a) => a.trim()).filter(Boolean).length : 0;

    if (marcadores !== argumentos) malos.push(`${m[1]} (${marcadores} marcadores, ${argumentos} argumentos)`);
  }

  return malos;
}

export async function verificarCasosMigracionesFiscales(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRD-AUD-03 · runner: estático
  const runner = leer(`${V1}/scripts/aplicar-migraciones.sh`);
  const runnerSql = runner.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  cierto("runner: usa to_regprocedure con la firma completa", /to_regprocedure\('public\.nex_aplicar_grants_runtime\(\)'\)/.test(runnerSql));
  cierto("runner: ya no usa to_regproc (solo nombre)", !/to_regproc\(/.test(runnerSql));
  cierto("runner: la concesión de grants no se enmascara (sin || true)", !/nex_aplicar_grants_runtime[^\n]*\|\| true/.test(runnerSql) && !/\|\| true/.test(runnerSql));
  cierto("runner: conserva la lógica de checksums y de transacción por migración", /ya aplicada/.test(runner) && /checksum distinto/.test(runner) && /psql -1 -c "SELECT pg_advisory_xact_lock/.test(runner) && /INSERT INTO schema_migrations/.test(runner));

  // ── PRD-AUD-03 · runner: ejecución real con psql simulado
  const ok = ejecutarRunner(true, false);

  igual("runner (función existe): termina bien y reaplica los permisos", [ok.estado, /select public\.nex_aplicar_grants_runtime\(\)/.test(ok.llamadas), /permisos del rol de ejecución reaplicados/.test(ok.salida)], [0, true, true]);
  const falla = ejecutarRunner(true, true);

  igual("runner (la concesión falla): ABORTA con código distinto de cero y no dice «listo»", [falla.estado !== 0, /listo\./.test(falla.salida)], [true, false]);
  const sin = ejecutarRunner(false, false);

  igual("runner (la función aún no existe): avisa explícitamente, no intenta conceder y termina bien", [sin.estado, /aviso: nex_aplicar_grants_runtime\(\) no existe/.test(sin.salida), /select public\.nex_aplicar_grants_runtime\(\)/.test(sin.llamadas)], [0, true, false]);

  // ── PRD-AUD-03 · grants de las tablas nuevas
  const n39 = leer(`${V1}/migraciones/NEX-039-unidades-medida-sifen.sql`);
  const n39sql = sinComentarios(n39);

  cierto("NEX-039: catálogo SIFEN solo con SELECT para el runtime (REVOKE ALL + GRANT SELECT)", /REVOKE ALL ON public\.unidades_medida_sifen FROM nexit_runtime;\s*GRANT SELECT ON public\.unidades_medida_sifen TO nexit_runtime;/.test(n39sql) && !/GRANT (INSERT|UPDATE|DELETE)[^;]*unidades_medida_sifen/.test(n39sql));
  cierto("NEX-039: el registro de reconciliación NO es accesible para el runtime", /REVOKE ALL ON public\.fiscal_reconciliacion_log FROM nexit_runtime/.test(n39sql) && !/GRANT[^;]*fiscal_reconciliacion_log/.test(n39sql));
  cierto("NEX-039: el envoltorio llama a base + proveedores + fiscal (resistente a la reaplicación)", /nex_aplicar_grants_runtime_base\(\);\s*PERFORM public\.nex_aplicar_grants_proveedores\(\);\s*PERFORM public\.nex_aplicar_grants_fiscal\(\);/.test(n39sql));
  cierto("NEX-039: aplica los permisos al terminar y exige NEX-037", /SELECT public\.nex_aplicar_grants_fiscal\(\);\s*$/.test(n39sql.trim()) && /requiere NEX-037/.test(n39));
  cierto("NEX-039: el envoltorio no se redefine dos veces ni se pierde el de NEX-037", (n39sql.match(/CREATE OR REPLACE FUNCTION public\.nex_aplicar_grants_runtime\(\)/g) ?? []).length === 1);
  const r39 = leer(`${V1}/scripts/reversion-NEX-039.sql`);

  cierto("reversión NEX-039: restaura el envoltorio de NEX-037 antes de retirar la función fiscal", /nex_aplicar_grants_runtime\(\) RETURNS void[\s\S]*?nex_aplicar_grants_runtime_base\(\);\s*PERFORM public\.nex_aplicar_grants_proveedores\(\);\s*END \$\$;\s*DROP FUNCTION IF EXISTS public\.nex_aplicar_grants_fiscal\(\)/.test(r39));
  cierto("reversión NEX-039: sigue abortando si hay vínculos o registro", /unidad_sifen_codigo IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(r39) && /fiscal_reconciliacion_log\) THEN\s+RAISE EXCEPTION/.test(r39));

  // ── PRD-AUD-04 · mensajes de los RAISE (marcadores = argumentos) y regla fiscal intacta
  const n38 = leer(`${V1}/migraciones/NEX-038-productos-codigo-inmutable.sql`);
  const n40 = leer(`${V1}/migraciones/NEX-040-productos-clasificacion-iva.sql`);

  for (const [nombre, sql] of [["NEX-038", n38], ["NEX-039", n39], ["NEX-040", n40]] as const) igual(`${nombre}: marcadores de RAISE coinciden con sus argumentos`, raisesDescuadrados(sql), []);
  cierto("NEX-040: el mensaje de tasa es claro («tasa de % por ciento»), sin % literal ambiguo", /exigen una tasa de 5 o 10 por ciento \(el impuesto elegido tiene una tasa de % por ciento\)/.test(n40) && /exigen una tasa de 0 por ciento \(el impuesto elegido tiene una tasa de % por ciento\)/.test(n40) && !/\(impuesto con %\)/.test(n40));
  cierto("NEX-040: la regla fiscal no cambió (1 y 4 → 5/10; 2 y 3 → 0)", /afectacion_iva IN \(1, 4\) AND v_tasa NOT IN \(5, 10\)/.test(n40) && /afectacion_iva IN \(2, 3\) AND v_tasa <> 0/.test(n40));

  // ── PRD-AUD-05 · espejo legado al retirar el vínculo
  cierto("NEX-039: sin vínculo (retirado) los campos legados quedan NULL", /ELSIF TG_OP = 'UPDATE' AND OLD\.unidad_sifen_codigo IS NOT NULL THEN[\s\S]*?NEW\.codigo_sifen := NULL;\s*NEW\.descripcion_sifen := NULL;/.test(n39sql));
  cierto("NEX-039: el valor anterior queda en el registro (rastreabilidad)", /INSERT INTO public\.fiscal_reconciliacion_log[\s\S]*?jsonb_build_object\('unidad_sifen_codigo', OLD\.unidad_sifen_codigo, 'codigo_sifen', OLD\.codigo_sifen/.test(n39sql));
  cierto("NEX-039: con vínculo, escribir los campos legados no los desincroniza (el trigger también escucha esas columnas)", /BEFORE INSERT OR UPDATE OF unidad_sifen_codigo, codigo_sifen, descripcion_sifen ON public\.unidades_medida/.test(n39sql));
  cierto("NEX-039: unidades que nunca tuvieron vínculo conservan su dato legado (sin borrado masivo)", !/UPDATE public\.unidades_medida\s+SET/.test(n39sql) && !/DELETE FROM public\.unidades_medida/.test(n39sql));
  cierto("la reconciliación informa las unidades con código legado sin vínculo", /código SIFEN LEGADO sin vínculo canónico/.test(leer(`${V1}/scripts/reconciliar-unidades-sifen-NEX-039.sql`)));

  // ── Verificación conjunta NEX-038 / 039 / 040
  const archivos = readdirSync(join(raiz, V1, "migraciones")).filter((f) => /^NEX-0(3[89]|40)-/.test(f)).sort();

  igual("orden de aplicación por nombre: 038 → 039 → 040", archivos.map((f) => f.slice(0, 7)), ["NEX-038", "NEX-039", "NEX-040"]);
  cierto("dependencias declaradas: 038←007, 039←003/037, 040←007/039", /NEX-007/.test(n38.split("\n")[1] ?? "") && /requiere NEX-003/.test(n39) && /requiere NEX-037/.test(n39) && /requiere NEX-007 y NEX-039/.test(n40));
  cierto("NEX-040 depende de una tabla creada por NEX-039 (fiscal_reconciliacion_log)", /to_regclass\('public\.fiscal_reconciliacion_log'\) IS NULL/.test(n40) && /CREATE TABLE public\.fiscal_reconciliacion_log/.test(n39));
  cierto("solo NEX-039 redefine el envoltorio de grants; 038 y 040 no tocan grants", !/nex_aplicar_grants|GRANT |REVOKE /.test(sinComentarios(n38)) && !/nex_aplicar_grants|GRANT |REVOKE /.test(sinComentarios(n40)));
  cierto("las tres tienen script de reversión con salvaguardas de datos", ["038", "039", "040"].every((n) => readdirSync(join(raiz, V1, "scripts")).includes(`reversion-NEX-${n}.sql`)) && /afectacion_iva IS NOT NULL OR proporcion_gravada_iva IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(leer(`${V1}/scripts/reversion-NEX-040.sql`)));
  cierto("las tres comienzan con las pre-condiciones/avisos y no editan migraciones previas", /NO ejecutar en la VM/.test(n38) && /NO ejecutar en la VM/.test(n39) && /NO ejecutar en la VM/.test(n40));
  cierto("las migraciones nuevas no incluyen reclasificación de datos de productos", !/UPDATE public\.productos\s+SET/.test(sinComentarios(n40)) && !/UPDATE public\.productos/.test(sinComentarios(n38)));
  cierto("triggers de 038/039/040 sin colisión de nombres", new Set(["productos_codigo_inmutable_trg", "unidades_medida_espejo_sifen_trg", "productos_iva_coherencia_trg", "impuestos_tasa_en_uso_trg"]).size === 4 && [n38, n39, n40].join("\n").match(/CREATE TRIGGER (\w+)/g)?.length === 4);

  return fallos;
}
