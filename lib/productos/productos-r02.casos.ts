/**
 * Productos (AUD-NEXIT-PRODUCTOS-DESKTOP-R02) — verificaciones focales de PRD-D01…D06, sin PostgreSQL ni navegador: funciones puras, controladores con promesas controladas, simulaciones de la secuencia de
 * edición (NO son pruebas integradas de base de datos) y verificación estructural de rutas, layouts y pantallas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ErrorValidacion } from "@/lib/productos/errores";
import { eliminacionesVacias, formularioAPayload, type FormularioProducto } from "@/lib/productos/formulario";
import { respuestaError } from "@/lib/productos/shared";
import { exigirVersion, exigirVersionPresente } from "@/lib/productos/version";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

function lanza(f: () => void): { estado: number; mensaje: string } | null {
  try {
    f();

    return null;
  } catch (e) {
    return e instanceof ErrorValidacion ? { estado: e.estado, mensaje: e.message } : { estado: -1, mensaje: String(e) };
  }
}

export async function verificarCasosProductosR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRD-D03: concurrencia de edición ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const V1 = "2026-10-19T14:03:22.123456";
  const V2 = "2026-10-19T14:05:01.654321";

  igual("D03: versión ausente, vacía o no textual → 409 antes de validar", [undefined, "", "   ", null, 123, {}].map((v) => lanza(() => exigirVersionPresente(v))?.estado), [409, 409, 409, 409, 409, 409]);
  igual("D03: la versión vigente exacta se acepta; una distinta → 409", [lanza(() => exigirVersion(V1, V1)), lanza(() => exigirVersion(V1, V2))?.estado], [null, 409]);
  igual("D03: la precisión de microsegundos se conserva (…123456 ≠ …123457 → 409; no se reduce a milisegundos)", [lanza(() => exigirVersion("2026-10-19T14:03:22.123456", "2026-10-19T14:03:22.123457"))?.estado, lanza(() => exigirVersion("2026-10-19T14:03:22.123", "2026-10-19T14:03:22.123456"))?.estado], [409, 409]);
  cierto("D03: el mensaje del 409 es claro y orienta a recargar (sin cambios guardados)", /Recargue la ficha/.test(lanza(() => exigirVersion(V1, V2))?.mensaje ?? "") && /no se guardó ningún cambio/i.test(lanza(() => exigirVersion(V1, V2))?.mensaje ?? ""));

  {
    // Dos editores A/B sobre la misma ficha (simulación de la secuencia: fila bloqueada → comparar versión → escribir)
    const base = { descripcion: "ARROZ", version: V1, hijos: ["u1"] };
    let bd = { ...base };
    const guardar = (enviada: string, cambio: Partial<typeof base>) => {
      const e = lanza(() => exigirVersion(enviada, bd.version));

      if (e) return e.estado;

      bd = { ...bd, ...cambio, version: V2 }; // actualizado_at = now() renueva la versión

      return 200;
    };
    const aDatos = guardar(V1, { descripcion: "ARROZ A" });
    const bDatos = guardar(V1, { descripcion: "ARROZ B", hijos: [] });

    igual("D03: dos editores — A (versión actual) guarda; B (versión obsoleta) recibe 409 y NO modifica descripción ni hijos", [aDatos, bDatos, bd.descripcion, bd.hijos], [200, 409, "ARROZ A", ["u1"]]);
    igual("D03: tras releer la versión nueva B puede guardar", guardar(V2, { descripcion: "ARROZ B" }), 200);
  }

  const ruta = leer("app/api/productos/[id]/route.ts");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  const pos = (t: string) => put.indexOf(t);

  cierto("D03: el PUT exige la versión presente al inicio, la compara DESPUÉS del FOR UPDATE y ANTES de validar o escribir (referencias, alcance, unidad, hijos, precio, UPDATE)", pos("exigirVersionPresente(cuerpo.version)") > 0 && pos("empresa_id = $2 FOR UPDATE") > pos("exigirVersionPresente") && pos("exigirVersion(cuerpo.version") > pos("empresa_id = $2 FOR UPDATE") && ["resolverPais(", "validarReferencias(", "validarAlcanceConfiguraciones(", "validarCambioUnidadBase(", "eliminarHijos(", "UPDATE productos SET", "guardarHijos(", "fijarPrecioReferencia("].every((t) => pos("exigirVersion(cuerpo.version") < pos(t)));
  cierto("D03: el GET entrega la versión con microsegundos (UTC, texto) y el conflicto hace ROLLBACK", /AS version,/.test(ruta) && /HH24:MI:SS\.US/.test(ruta) && /\$\{SQL_VERSION\} AS version/.test(ruta) && /ROLLBACK/.test(put));

  const resp = respuestaError(new ErrorValidacion("Otro usuario modificó este producto", null, 409), "actualizar");
  const cuerpo = (await resp.json()) as { error: string; campo: string | null };

  igual("D03: un ErrorValidacion 409 sale como HTTP 409 (antes se degradaba a 400) conservando el campo", [resp.status, cuerpo.campo, /Otro usuario/.test(cuerpo.error), respuestaError(new ErrorValidacion("x", "descripcion"), "actualizar").status], [409, null, true, 400]);

  const f = { version: V1, descripcion: "x", codigo: "PRD-1", inventarioInicial: { cantidad: "", costoUnitario: "", depositoId: "" }, eliminaciones: eliminacionesVacias() } as unknown as FormularioProducto;

  igual("D03: el formulario de edición envía la versión; el de alta no", [formularioAPayload(f, "editar").version, "version" in formularioAPayload(f, "crear")], [V1, false]);

  const form = leer("app/(private)/productos/_components/producto-form.tsx");

  cierto("D03: ante un 409 la pantalla ofrece recargar la ficha de forma deliberada (con confirmación) y nunca sobrescribe en silencio", /setConflicto\(mode === "edit" && e\.estado === 409\)/.test(form) && /Recargar la ficha actual/.test(form) && /window\.confirm\("Se descartarán sus cambios sin guardar/.test(form));

  return fallos;
}
