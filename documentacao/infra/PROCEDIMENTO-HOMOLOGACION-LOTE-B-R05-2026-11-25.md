# Procedimiento de homologación — PRO-312-R03 / Lote B (evidencias R05 en el envío FE/NCE)

25/11/2026 · actualizado 26/11/2026 (PRO-312-R03-C01: §3 y §4 rehechos por F-R03-04) · Documento de **planificación**. Nada de esto se ejecutó. Cada paso requiere autorización expresa del responsable; lo ejecuta solo el responsable en la VM existente. Ninguna IA accede a la VM, a la base ni al gateway.

[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md) · [Casos](../testes/CASOS-NEXIT-PRO-312-R03-LOTE-B-2026-11-25.md) · [Desactivación R05](PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md).

## 1. Tipos de evidencia (no confundir)

| Tipo | Qué es | Qué NO es |
|---|---|---|
| Revisión estática | lectura del diff y de los contratos NEX-084/085 (Claude y auditoría ChatGPT) | ejecución |
| CI existente | GitHub Actions del push: casos R03B con base y gateway simulados, C1 (preparación de SQL contra NEX-001…085), tipos, lint, build | prueba del gateway, de SIFEN ni de NEX-084 real |
| Casos escritos | R03B-A01…M10 (en CI) y los 523 anteriores (base descartable, no en CI) | homologación |
| Evidencia real futura | resultados de los diagnósticos de solo lectura de este documento y de la ventana de homologación en la VM | algo que exista hoy |

## 2. Gates de activación (todos obligatorios, en orden)

La variable `NEXIT_E03_EVIDENCIAS` queda **sin definir** (apagada) hasta cumplir todos:

1. Auditoría ChatGPT del Lote B conforme.
2. VM con NEX-001…085 exactas y verificadores NEX-084/085 en 65/65 (ya acreditado; reconfirmar sin cambios).
3. Modo R05 `ACTIVO` y procedimiento de desactivación disponible (no ejecutarlo).
4. **D6** (§3) concluyente: `errores = 0` y `distintos = 0`, o decisión del responsable sobre los distintos encontrados.
5. **D8-B** (§3 observado, §4 teórico): `max_bytes` observado informado; con algún documento por encima de 8 MiB, o sin resultado observado concluyente, decisión expresa del responsable.
6. Decisión del responsable sobre la desactivación operacional (quién y cómo vuelve a apagar).
7. Ventana de homologación autorizada: pocos documentos de prueba, en la cuenta del gateway de la propia empresa, con seguimiento de §5.

Si algún gate falla: **no se activa**. No hay activación parcial ni fallback silencioso: con la variable en `R05` y la base no preparada, la emisión responde 503 antes de numerar.

## 3. D6 + D8-B — diagnóstico real de solo lectura (PRO-312-R03-C01, F-R03-04)

**Estado: NO ejecutado.** Lo ejecuta solo el responsable, en la VM existente, con autorización expresa. No crea otra base, no escribe nada, no exporta valores, identificadores, payloads ni secretos: solo agregados.

**Qué reemplaza.** La versión anterior de este documento usaba `(v::text)::float8::numeric` por número como equivalente del serializador de JavaScript, `octet_length(payload::text)` como cota de bytes y un corte de 180 días. Los tres quedan **retirados**: `float8 → numeric` en PostgreSQL no es `JSON.stringify` (redondeo y representación distintos, y falla con magnitudes extremas), `payload::text` no son los bytes del texto HTTP (jsonb agrega espacios y escribe números distinto) y un corte por fecha deja afuera snapshots que se pueden volver a enviar.

### 3.1 Qué tiene que reproducir el diagnóstico

La vía R05 lee el snapshot `documento_electronico_solicitudes.payload` (jsonb) con el driver `pg` de la aplicación, lo serializa **una sola vez** con `JSON.stringify` y transmite esos bytes; NEX-084 exige `texto::jsonb = snapshot` (`NEX:CUERPO_NO_COINCIDE` si no). Por eso el diagnóstico:

1. lee cada snapshot como texto jsonb y lo convierte con el **mismo parser jsonb del driver** (`require("pg").types.getTypeParser(3802, "text")`; en el código de la rama no hay `setTypeParser`, así que la aplicación usa ese mismo parser por omisión);
2. serializa con el **`JSON.stringify` real** de Node (el del contenedor `nexit-app`, el mismo runtime que transmite);
3. compara **en PostgreSQL**, parametrizado, el texto exacto `$texto::jsonb` contra el snapshot de la misma empresa, documento y versión (la misma igualdad que exige NEX-084);
4. mide los **bytes UTF-8 reales** de ese texto con `Buffer.byteLength(texto, "utf8")` (la misma medida que usa la vía R05 para las franjas D8-B);
5. corre en una transacción `REPEATABLE READ READ ONLY`, con `statement_timeout` y `lock_timeout`, paginada por clave (`documento_id`, `version`), y cierra con `ROLLBACK`.

**Universo.** Todas las versiones de todas las solicitudes de la empresa (sin corte por fecha), unidas a `documentos_electronicos` para informar `tipo` y `estado_local`. Es un superconjunto de lo que la vía R05 puede llegar a enviar (`PENDIENTE_ENVIO`, `ERROR_ENVIO`, `ENVIO_INDETERMINADO`; un `ENVIADO` no se reenvía, pero se informa aparte). **No se excluye ninguna fila**: lo que no se puede evaluar se cuenta como error y bloquea la conclusión. Documentos sin solicitud no tienen snapshot que enviar y no entran.

**Errores que bloquean un resultado concluyente** (cada uno se cuenta por grupo): texto jsonb que el parser no lee; número no finito tras el parser (p. ej. `1e400` → `Infinity`, que `JSON.stringify` convertiría en `null`); `JSON.stringify` que falla o no devuelve texto; texto que PostgreSQL no acepta como jsonb (clase SQLSTATE 22); fila que desaparece entre la lectura y la comparación. Un error de otra clase (permisos `42501`, tiempo agotado `57014`, conexión) **detiene** el diagnóstico sin conclusión.

### 3.2 Requisitos previos (todos de solo lectura; si uno falla, **BLOQUEO** y no se sigue)

1. Autorización expresa del responsable para esta ejecución.
2. El contenedor `nexit-app` resuelve el driver: `sudo docker exec nexit-app node -e 'require.resolve("pg")'` termina sin error. Si no lo resuelve, **no** se instala nada ni se usa otro driver: bloqueo para decisión.
3. `DATABASE_URL` del contenedor permite `SELECT` sobre `documento_electronico_solicitudes` y `documentos_electronicos`. Si responde `42501`, el script se detiene; usar otra conexión (otro rol) es una **decisión del responsable**, no un paso de este procedimiento.
4. Ventana de baja carga (lee todos los snapshots de la empresa, página por página).

### 3.3 Ejecución

Copiar el script de §3.4 a un archivo en la VM (por ejemplo `/tmp/d6d8-r05.js`, fuera del repositorio y de `/srv/stacks/nexit`) y ejecutarlo dentro del contenedor de la aplicación, por entrada estándar, con el UUID de la empresa:

```sh
sudo docker exec -i -e EMPRESA_ID='<uuid de la empresa>' nexit-app node - < /tmp/d6d8-r05.js
```

El script no recibe ni imprime credenciales (usa la `DATABASE_URL` que el contenedor ya tiene), no escribe en la base y termina con `ROLLBACK`. Borrar el archivo al terminar.

### 3.4 Script (solo lectura)

```js
// d6d8-r05.js — PRO-312-R03-C01 / F-R03-04. SOLO LECTURA. Solo agregados: sin valores, identificadores, payloads ni secretos.
"use strict";
const { Client, types } = require("pg");

const parsearJsonb = types.getTypeParser(3802, "text"); // el mismo parser jsonb que usa la aplicación (pg por omisión)
const EMPRESA = process.env.EMPRESA_ID || "";
const PAGINA = 200;
const MIB = 1048576;
const MIB8 = 8388608;

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(EMPRESA)) {
  console.log("BLOQUEO: EMPRESA_ID no es un UUID.");
  process.exit(2);
}

const grupos = new Map();
const grupo = (tipo, estado, version) => {
  const k = `${tipo}|${estado}|${version}`;

  if (!grupos.has(k)) {
    grupos.set(k, {
      tipo, estado, version, solicitudes: 0, documentos: new Set(), iguales: 0, distintos: 0,
      errorParser: 0, noFinitos: 0, errorSerializar: 0, errorJsonb: 0, sinFila: 0,
      maxBytes: 0, mayores1MiB: 0, mayores8MiB: 0, maxItems: 0, sinDetalles: 0,
    });
  }

  return grupos.get(k);
};

function todoFinito(v) {
  const pila = [v];

  while (pila.length) {
    const x = pila.pop();

    if (typeof x === "number" && !Number.isFinite(x)) return false;
    if (x && typeof x === "object") for (const y of Object.values(x)) pila.push(y);
  }

  return true;
}

const SQL_PAGINA = `SELECT s.documento_id::text AS d, s.version AS v, d.tipo AS tipo, d.estado_local AS estado, s.payload::text AS t
  FROM public.documento_electronico_solicitudes s
  JOIN public.documentos_electronicos d ON d.empresa_id = s.empresa_id AND d.id = s.documento_id
  WHERE s.empresa_id = $1::uuid AND (s.documento_id, s.version) > ($2::uuid, $3::smallint)
  ORDER BY s.documento_id, s.version
  LIMIT $4::integer`;

const SQL_COMPARAR = `SELECT k.i AS i, (k.t::jsonb = s.payload) AS igual
  FROM unnest($2::uuid[], $3::smallint[], $4::text[]) WITH ORDINALITY AS k(d, v, t, i)
  JOIN public.documento_electronico_solicitudes s ON s.empresa_id = $1::uuid AND s.documento_id = k.d AND s.version = k.v`;

async function comparar(c, lote) {
  if (lote.length === 0) return;
  await c.query("SAVEPOINT d6");
  try {
    const r = await c.query(SQL_COMPARAR, [EMPRESA, lote.map((x) => x.d), lote.map((x) => x.v), lote.map((x) => x.t)]);
    const vistos = new Set();

    await c.query("RELEASE SAVEPOINT d6");
    for (const f of r.rows) {
      const x = lote[Number(f.i) - 1];

      vistos.add(Number(f.i));
      if (f.igual === true) x.g.iguales += 1;
      else x.g.distintos += 1;
    }
    lote.forEach((x, n) => { if (!vistos.has(n + 1)) x.g.sinFila += 1; });
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT d6");
    // Solo un texto que PostgreSQL no acepta como jsonb (clase 22) se cuenta y se aísla fila por fila; cualquier otro error detiene todo.
    if (!String(e && e.code).startsWith("22")) throw e;
    if (lote.length === 1) { lote[0].g.errorJsonb += 1; return; }
    for (const x of lote) await comparar(c, [x]);
  }
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, application_name: "nexit-d6d8-solo-lectura" });

  await c.connect();
  try {
    await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL statement_timeout = '120s'");
    await c.query("SET LOCAL lock_timeout = '5s'");

    let desde = ["00000000-0000-0000-0000-000000000000", 0];

    for (;;) {
      const r = await c.query(SQL_PAGINA, [EMPRESA, desde[0], desde[1], PAGINA]);

      if (r.rows.length === 0) break;

      const lote = [];

      for (const f of r.rows) {
        const g = grupo(f.tipo, f.estado, f.v);
        let valor;
        let texto;

        g.solicitudes += 1;
        g.documentos.add(f.d);
        try { valor = parsearJsonb(f.t); } catch { g.errorParser += 1; continue; }
        if (!todoFinito(valor)) { g.noFinitos += 1; continue; }
        try { texto = JSON.stringify(valor); } catch { g.errorSerializar += 1; continue; }
        if (typeof texto !== "string") { g.errorSerializar += 1; continue; }

        const bytes = Buffer.byteLength(texto, "utf8");
        const items = valor && Array.isArray(valor.Detalles) ? valor.Detalles.length : null;

        g.maxBytes = Math.max(g.maxBytes, bytes);
        if (bytes > MIB) g.mayores1MiB += 1;
        if (bytes > MIB8) g.mayores8MiB += 1;
        if (items === null) g.sinDetalles += 1;
        else g.maxItems = Math.max(g.maxItems, items);
        lote.push({ d: f.d, v: f.v, t: texto, g });
      }
      await comparar(c, lote);

      const u = r.rows[r.rows.length - 1];

      desde = [u.d, u.v];
    }
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }

  const filas = [...grupos.values()].sort((a, b) => `${a.tipo}|${a.estado}|${a.version}`.localeCompare(`${b.tipo}|${b.estado}|${b.version}`));
  const errores = (g) => g.errorParser + g.noFinitos + g.errorSerializar + g.errorJsonb + g.sinFila;

  console.log("tipo|estado_local|version|solicitudes|documentos|iguales|distintos|error_parser|no_finitos|error_serializar|error_jsonb|sin_fila|max_bytes|mayores_1MiB|mayores_8MiB|max_items|sin_Detalles");
  for (const g of filas) {
    console.log([g.tipo, g.estado, g.version, g.solicitudes, g.documentos.size, g.iguales, g.distintos, g.errorParser, g.noFinitos, g.errorSerializar, g.errorJsonb, g.sinFila, g.maxBytes, g.mayores1MiB, g.mayores8MiB, g.maxItems, g.sinDetalles].join("|"));
  }

  const total = (campo) => filas.reduce((s, g) => s + (typeof campo === "function" ? campo(g) : g[campo]), 0);

  console.log(`RESUMEN: solicitudes=${total("solicitudes")} iguales=${total("iguales")} distintos=${total("distintos")} errores=${total(errores)} mayores_1MiB=${total("mayores1MiB")} mayores_8MiB=${total("mayores8MiB")}`);
  console.log(total(errores) > 0 ? "D6/D8: NO CONCLUYENTE (hay filas que no se pudieron evaluar)." : total("distintos") > 0 ? "D6: HAY SNAPSHOTS QUE LA VÍA R05 NO TRANSMITIRÍA (CUERPO_NO_COINCIDE)." : "D6: todos los snapshots coinciden.");
})().catch((e) => {
  console.log(`BLOQUEO: el diagnóstico no terminó (SQLSTATE ${e && e.code ? e.code : "sin código"}). No se concluye nada.`);
  process.exit(1);
});
```

### 3.5 Cómo se lee (gates 4 y 5)

| Resultado | D6 (serialización) | D8-B (tamaño) |
|---|---|---|
| `errores > 0` o `BLOQUEO` | no concluyente: **no activar** | no concluyente: **no activar** |
| `distintos = 0` y `errores = 0` | cumplido | — |
| `distintos > 0` | **no activar**; informar el conteo por grupo (sin documentos ni valores) para decisión del responsable | — |
| `mayores_8MiB > 0` | — | esos documentos quedarían NO_TRANSMITIDO `SOLICITUD_EXCEDE_LIMITE`: **no activar sin decisión expresa** del responsable (no se reducen ítems ni se cambia la migración) |
| `mayores_1MiB > 0` y `mayores_8MiB = 0` | — | van por la tabla de POST grandes de NEX-084 (`POST_GRANDE_R05`); informar `max_bytes` |
| todo `≤ 1 MiB` | — | evidencia NEX-072 |

`sin_Detalles > 0` no es error (un snapshot puede no tener esa clave); se informa tal cual y no se inventa un número de ítems.

## 4. D8-B — límites teóricos (análisis estático, no medición)

**Regla implementada.** Hasta 1 MiB (1.048.576 bytes) → evidencia NEX-072; más de 1 MiB y hasta 8 MiB (8.388.608) → tabla de POST grandes de NEX-084; más de 8 MiB → NO_TRANSMITIDO `SOLICITUD_EXCEDE_LIMITE` **antes de autenticar y del fetch**. No se trunca ni se quitan ítems; el límite de 999 ítems no cambia.

**Lo observado y lo teórico van separados.** Ninguna cifra de esta sección es observada: lo observado sale solo de §3. Lo de abajo es una cota derivada del código de la rama, con sus supuestos.

Límites que aplican los constructores (`lib/facturacion/payload-fe.ts`; la NCE reutiliza las líneas de la FE original y tiene su propio máximo de 999 líneas en `payload-nce.ts`):

| Campo | Límite en el código |
|---|---|
| Ítems (`Detalles`) | 999 (`MAX_LINEAS`, `MAX_LINEAS_NCE`) |
| Código interno del ítem | 1–20 caracteres |
| Descripción del ítem | 1–120 caracteres |
| GTIN | 8, 12, 13 o 14 dígitos |
| Información adicional (`dInfAdic`) | ≤ 5000 caracteres |
| Razón social / dirección del receptor | ≤ 255 cada una |
| Formas de pago (`FormaPago`) | ≤ 999, cada una con campos numéricos y textos de catálogo (descripción libre solo en «otro», denominación 99 o cheque) |
| Base (NEX-048) | `pg_column_size(payload) < 262144`: mide el almacenamiento jsonb (comprimible) y **no** acota los bytes del texto |

Bytes por carácter en el texto de `JSON.stringify`: 1 (ASCII), 2 (`"` y `\`), hasta 3 (resto del plano básico; un par sustituto son 4 bytes por 2 unidades), 6 (caracteres de control y sustitutos sueltos, que salen como `\uXXXX`). El código no muestra un filtro de caracteres de control en la descripción del ítem, así que la cota usa el peor caso de 6 bytes por unidad.

Estimación de la cota (supuestos explícitos, **no demostrada**): por ítem, ~200 bytes de nombres de campo, (20 + 120) × 6 = 840 bytes de textos en el peor caso y ~300 bytes de números → ~1,4 KiB; × 999 ≈ **1,4 MiB**. Sumando `dInfAdic` (≤ 30 KB en el peor caso), receptor (≤ ~10 KB) y hasta 999 formas de pago (orden de 0,2 MB), la cota queda en el orden de **1,5–2 MiB**: por encima de 1 MiB (franja de POST grande) y lejos de 8 MiB. Esta cota **no prueba** el máximo real: depende de que todos los caminos de creación pasen por esos validadores, de los textos de catálogo y de los snapshots históricos creados con reglas anteriores. Por eso el gate 5 exige el resultado observado de §3 (`max_bytes`, `mayores_1MiB`, `mayores_8MiB`); sin él, o con algún documento por encima de 8 MiB, **la activación requiere decisión expresa del responsable**.

## 5. Ventana de homologación (futura)

Solo con los gates 1–6 cumplidos y autorización expresa:

1. Definir `NEXIT_E03_EVIDENCIAS=R05` en el entorno del servidor y reiniciar según el procedimiento de actualización de la VM.
2. Emitir pocos documentos de prueba (FE y, si corresponde, NCE) en la cuenta propia del gateway.
3. Comprobar con lecturas R05 (`fe_e03_estado_operacion_r05`) por documento: una operación, autenticación registrada, POST 1 (y POST 2 solo tras token inválido), salida con P o motivo, cierre.
4. Comprobar que las consultas posteriores usan la misma cuenta (sin 409 inesperados) y que el KuDE sigue igual.
5. Ante cualquier anomalía: quitar la variable (apaga la vía R05 para nuevos envíos sin tocar la base). Desactivar R05 en la base solo con el procedimiento de desactivación y una orden propia.

Un ACK del gateway (ENVIADO) **no** es aprobación SIFEN: el estado fiscal sigue llegando solo por la consulta.

## 6. Lo que no cubre

Sin nueva base de pruebas, sin ejecutar el diagnóstico de §3 (solo se documenta), sin NEX-086, sin cambios a NEX-001…085, sin activar la bandera, sin desactivar ni reactivar R05, sin Lote C.
