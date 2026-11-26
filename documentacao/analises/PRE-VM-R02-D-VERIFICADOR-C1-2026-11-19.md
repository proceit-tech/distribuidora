# PRE-VM-R02-D — Estabilización del verificador SQL C1

Fecha: 19/11/2026. Base: `7c4dd8bcfba116139c371e77451d104a36b40ce5` (PR #7). CI de referencia: app 44562740682, PostgreSQL 44562740740.

Alcance: solo el verificador `documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js` y sus casos `lib/ci/verificador-consultas.casos.ts`. No se modificó código funcional (reportes, facturación, compras, dashboard, stock), contratos fiscales, NEX-001…081, T01 ni `c1-linea-base.json`.

## 1. Qué cambió en el verificador

1. **Intérprete acotado (nuevo).** Reconstruye el SQL que una función arma en tiempo de ejecución sin ejecutar la aplicación. Interpreta un subconjunto de TypeScript: declaraciones, asignaciones, `if/else`, `push` a arreglos, plantillas, ternarios, objetos y arreglos literales, funciones auxiliares de módulo y clausuras como `p()`/`pe()`/`agregar()`, además de importaciones rastreadas. Todo dato de ejecución (filtros, esquema leído, filas) es **opaco**: nunca se inventa su valor y solo se recorren sus condiciones. Si un valor opaco llega al texto SQL, o aparece una forma no soportada (`for`, `try`, `switch`, desestructuración…), la consulta queda NO_VERIFICABLE con su motivo. Nunca queda en PASS.
2. **Recorrido de caminos ("mundos").** Cada condición sobre un dato opaco es una variable con dominio {falso, verdadero, literales comparados o claves del objeto indexado}. Primero se busca un camino que alcance la consulta, superando las guardas con `return` anticipado. Después se varía cada condición por separado, reparando el camino si una guarda lo exige, y por último se arma un mundo de **activación máxima**. Una vista sin definición (`def` indefinido) aborta el camino igual que en JS.
3. **Consultas anfitrionas.** Una envoltura `const q = (sql, adicional, extra) => …query(\`WITH ${cte}${adicional ? …} ${sql}\`)` convierte cada `q(\`…\`, cteVista, params)` en una **consulta completa** que se prepara entera: CTE común de `construirCte` + CTE de la vista + numeración `pe(k) = base + k`. El texto suelto que depende de un CTE ya no se prepara solo.
4. **Fragmentos.** Toda plantilla consumida al armar anfitrionas (cuerpos `dsc`/`vend`, retorno de `construirCte`, `ATRIBUCION_NCE`) es FRAGMENTO:
   - queda cubierto solo si **todas** sus anfitrionas son válidas;
   - si alguna anfitriona tiene FALLA, se informa la FALLA de la anfitriona y el fragmento no se da por cubierto;
   - si alguna anfitriona es NO_VERIFICABLE, el fragmento queda NO_VERIFICABLE ("fragmento de consulta anfitriona sin consulta anfitriona verificada").
5. **Uniones de arreglos locales.** Cuando la resolución exacta falla por `X.join(…)` o `X.map(…).join(…)`, se reintenta con el intérprete sobre la función que contiene la consulta. Si tampoco puede, se conserva el motivo original. Las variables calculadas como `filtro` **no** pasan por esta vía, porque así lo exige el caso C1-R03-01.
6. **Resolución exacta ampliada:**
   - constantes enteras (`const X = 24;`, también importadas) y sumas enteras (`INTENTOS_POR_PAGINA + 1` → `101`);
   - fragmentos condicionales entre dos literales **sin `$n`** (ambas ramas);
   - funciones flecha de una expresión (`alcanceIntegral(5)`);
   - `.split("a").join(b)`.
7. **Falsos negativos.** Ahora es candidata también una plantilla cuyos marcadores son calculados (`$${n}`, p. ej. `LIMIT $${params.length + 1}`). Antes se omitían en silencio.
8. Salida del CLI: nuevas líneas ANFITRIONAS, INTERPRETADAS y "fragmentos en anfitriona con FALLA".

## 2. Matriz de los 10 errores PREPARE (`lib/reportes/ventas.ts`)

La correspondencia con las relaciones informadas por el CI (docs, fil, lista, g, prd, grt) se dedujo del código: son las plantillas que se preparaban sueltas.

| Línea | Consulta | Relación faltante | Causa raíz | Solución | Cobertura recuperada |
|---|---|---|---|---|---|
| 151 | cuerpo del CTE `dsc` (`… JOIN docs n …`) | docs | cuerpo de CTE preparado como consulta autónoma | FRAGMENTO consumido por las 11 anfitrionas | ambas ramas de `esq.nceDescuento` dentro de consultas completas |
| 154 | cuerpo del CTE `vend` (`… FROM docs … FROM org`) | docs | ídem | FRAGMENTO | ambas ramas de `esq.vendedor` |
| 380 | resumen por moneda `q(…)` | fil | plantilla de `q()` sin `WITH ${cte}` | ANFITRIONA completa | 16 combinaciones |
| 386 | estados no computables | fil | ídem | ANFITRIONA | 16 |
| 391 | anomalías | fil | ídem | ANFITRIONA | 16 |
| 421 | totales de documentos (`lista`) | lista | falta el CTE común y el CTE adicional `lista` | ANFITRIONA con `adicional = lista` | 20 |
| 477 | conteo de productos `FROM g` | g | falta el CTE común y `prd` (ATRIBUCION_NCE, itm, prd, g) | ANFITRIONA | 18 |
| 492 | totales de productos `FROM prd` | prd | ídem | ANFITRIONA | 18 |
| 496 | ajustes no atribuibles (`fil` + `atr`) | fil | falta el CTE común y el adicional ATRIBUCION_NCE | ANFITRIONA | 16 |
| 529 | conteo de grupos `FROM grt` | grt | falta el CTE común y `grp`/`grt` | ANFITRIONA con `def` de CLIENTES/VENDEDORES/MESES | 18 |

Las otras tres plantillas `q()` (430, 479, 531) no llegaban a PREPARE porque eran NO_VERIFICABLE (expresiones 9–11). Hoy también son anfitrionas: 430 con 20 combinaciones, 479 con 20 y 531 con 18.

En total hay 11 anfitrionas con 196 combinaciones PREPARE. Cada combinación numera los parámetros sin huecos: base `$1…$4`, después los filtros del CTE común y al final los de la vista.

## 3. Matriz de las 12 expresiones

| # | Expresión | Antes | Solución | Estado | Limitación |
|---|---|---|---|---|---|
| 1 | `compras/entradas.ts` `cond.join(" AND ")` (`where`) | NO_VERIFICABLE | intérprete: unión de arreglo local con la clausura `agregar((n) => …)`, `ISO.test`, `includes(ESTADOS_ENTRADA)` | conteo (8 combinaciones) y lista (8) RECONSTRUIDAS; la lista se detecta ahora por `$${…}` | caminos: base, uno por uno y máximo |
| 2 | `dashboard/shared.ts:105` `alcanceIntegral(5)` | NO_VERIFICABLE | flecha de una expresión importada + `.split("$2").join(\`$${usuario}\`)` sobre `ALCANCE_MOVIMIENTO` (historial.ts) | RECONSTRUIDA | — |
| 3 | `dashboard/shared.ts:119` `alcanceIntegral(…)` | NO_VERIFICABLE | ídem | RECONSTRUIDA | — |
| 4 | `facturacion/nce.ts:307` `descuentos` | NO_VERIFICABLE | fragmento condicional entre dos literales sin `$n` | ambas ramas RECONSTRUIDAS | la condición (`hayTablaDescuentos`) no se evalúa; se prueban las dos |
| 5 | `facturacion/shared.ts:318` `UMBRAL_REVISION_HORAS` | NO_VERIFICABLE | constante entera importada (estados.ts = 24) | RECONSTRUIDA | — |
| 6 | `facturacion/shared.ts:427` `INTENTOS_POR_PAGINA + 1` | NO_VERIFICABLE | constante entera (100) + suma entera | RECONSTRUIDA (`LIMIT 101`) | — |
| 7 | `reportes/ventas.ts:162` `condDocs.map(…).join(" ")` | NO_VERIFICABLE | retorno de `construirCte` interpretado dentro de las anfitrionas | FRAGMENTO cubierto (11 anfitrionas válidas) | — |
| 8 | `ventas.ts:274` `FIRMA(…)` en `ATRIBUCION_NCE` | NO_VERIFICABLE | `FIRMA`/`NUMX` evaluadas por el intérprete al armar las anfitrionas de PRODUCTOS | FRAGMENTO cubierto (477, 479, 492, 496) | — |
| 9 | `ventas.ts:430` `pe(…)` | NO_VERIFICABLE | ANFITRIONA: `pe(k) = base + k` con la base real | 20 combinaciones | — |
| 10 | `ventas.ts:479` `um` | NO_VERIFICABLE | ANFITRIONA: rama `esq.unidades` verdadera y falsa | 20 combinaciones | — |
| 11 | `ventas.ts:531` `def.orden` | NO_VERIFICABLE | ANFITRIONA: objeto indexado por la vista → CLIENTES, VENDEDORES y MESES; una vista sin definición aborta el camino | 18 combinaciones | — |
| 12 | `stock/shared.ts:34` `filtro` | NO_VERIFICABLE | **se mantiene NO_VERIFICABLE** | NO_VERIFICABLE (ID nuevo, ver §5) | ver nota |

Nota sobre la #12. `filtro` es una variable local condicional cuyo texto depende de `idx = params.length + 1`, y `params` cambia según `productoId`. El intérprete podría recorrerla, pero la regla vigente C1-R03-01 (caso existente) exige que los `filtro` de `aptitud-cliente.ts` y de `stock/shared.ts` sigan siendo NO_VERIFICABLE, para no confundir variables homónimas. Por eso el intérprete solo se aplica a uniones de arreglos locales y a anfitrionas.

Tratamiento propuesto: mantenerla en la línea base con su ID nuevo. Si se decide ampliar el intérprete a variables locales calculadas, debe hacerse en una orden propia que revise ese caso.

## 4. Casos C1 (Fase 3)

Se conservan los 27 casos existentes sin cambios en sus comprobaciones. Solo se amplió el tipo `Informe` con los campos nuevos.

Casos nuevos:

| Caso | Qué cubre |
|---|---|
| R02-D anfitriona | CTE dependiente: la plantilla de `q()` nunca se prepara suelta; consulta completa `WITH docs…, fil…` |
| R02-D CTE adicional y parámetros | CTE de la vista + `pe(k)`; numeración `$1…$4` sin huecos con todos los filtros |
| R02-D CTE dependiente del esquema | cuerpo `dsc` (`JOIN docs`) solo dentro de la anfitriona, ambas ramas, FRAGMENTO cubierto |
| R02-D SQL realmente inválido | FALLA por variante, fragmentos ni cubiertos ni NO_VERIFICABLE, veredicto negativo |
| R02-D anfitriona no reconstruible | NO_VERIFICABLE con motivo; sus fragmentos quedan "sin consulta anfitriona verificada" |
| R02-D unión de arreglo local | función auxiliar `agregar((n) => …)`: base, cada filtro y todos juntos con numeración real |
| R02-D sin falsos positivos (bucle) | arreglo armado en `for` → NO_VERIFICABLE con el motivo original |
| R02-D sin falsos positivos (sombra) | parámetro homónimo de una constante del módulo: no se sustituye |
| R02-D constantes | entero + suma, ternario literal sin `$n`, flecha de expresión importada |
| R02-D sin falsos negativos | consulta con marcadores `$${n}` ya no se omite |
| R02-D variantes por objeto | objeto de definiciones indexado: cada clave; clave inexistente aborta el camino |
| R02-D código real ventas | 11 anfitrionas válidas, ningún PREPARE suelto `FROM fil/lista/g/prd/grt`, sin NO_VERIFICABLE en ventas.ts |

## 5. Propuesta de línea base (Fase 4, sin aplicar)

`c1-linea-base.json` **no se modificó**. Con el verificador corregido, el análisis estático del código actual da 4 consultas nuevas fuera de la línea base y 7 entradas obsoletas. La línea base pasaría de 57 a 54 entradas.

**Bajas (7):**

| ID | Motivo anterior | Razón |
|---|---|---|
| `lib/stock/shared.ts:f9e47cee5a4b` | variable de ejecución: filtro | entrada obsoleta: el texto de la consulta cambió (sustituida por el alta `e037e0b3e9a8`) |
| `lib/reportes/lotes.ts:794224b8e3b1` | `" AND " + donde.join(" AND ")` | reconstruida por el intérprete (unión de arreglo local) |
| `lib/reportes/lotes.ts:87b579f62810` | ídem | CTE `cte` reconstruido; FRAGMENTO cubierto por sus anfitrionas `WITH ${cte}` |
| `lib/reportes/lotes.ts:98f40b5a2b71` | ídem | reconstruida |
| `lib/reportes/lotes.ts:9a90330b87b3` | ídem | reconstruida |
| `lib/reportes/lotes.ts:9d66e832ea97` | ídem | reconstruida |
| `lib/reportes/lotes.ts:d52c880973a3` | ídem | reconstruida |

**Altas (4):**

| ID | Línea | Motivo | Razón |
|---|---|---|---|
| `lib/stock/shared.ts:e037e0b3e9a8` | 34 | variable de ejecución: filtro | la misma consulta con su texto actual (expresión #12) |
| `app/api/proveedores/[id]/route.ts:5d92226dbd3c` | 313 | expresión de ejecución: columnas.length + 3 | antes invisible (marcador `$${…}`); fragmento SET de un UPDATE cuya consulta (`sets.join`) ya está en la línea base |
| `lib/facturacion/shared.ts:f09f679a9080` | 267 | expresión de ejecución: f.sql | antes invisible (`LIMIT $${…}`); mismo origen que `e0cccbb70a9e` (ya en la línea base) |
| `lib/movimientos/historial.ts:d6889b02be11` | 96 | expresión de ejecución: SELECT_FILAS.slice(0, SELECT_FILAS.indexOf("FROM movimientos_inventario m")) | antes invisible (`LIMIT $${…}`); además usa la variable local `base`, igual que `67cf9be9bbe1` |

Hasta que se audite y aplique esta propuesta, el caso existente "código real: ninguna consulta nueva … ninguna entrada obsoleta" seguirá en rojo. Antes de este cambio ya fallaba por la entrada de `stock/shared.ts`.

## 6. Limitaciones

- **Caminos.** No se prueban todas las combinaciones de filtros: se prueba la base, cada condición por separado (con reparación de guardas) y la activación máxima. Los límites son 600 recorridos por consulta y 48 SQL distintos. En la activación máxima, para un filtro con literal comparado se usa el primer literal que sigue alcanzando la consulta (p. ej. `vendedor = "SIN"`). La rama con UUID se cubre en su variación individual.
- **Subconjunto interpretado.** `for`, `while`, `switch`, `try`, la desestructuración y los métodos que mutan arreglos fuera de `push` contaminan los valores que tocan. El resultado es NO_VERIFICABLE, nunca PASS.
- **Detección de anfitrionas.** Solo se detectan envolturas `const X = (sql, …) => …query(\`…${sql}…\`)` que agregan SQL propio. Hoy la única es `q` en `lib/reportes/ventas.ts`.
- **Reintento por intérprete.** Solo se aplica a uniones de arreglos locales (`X.join` / `X.map(…).join`).
- **Sin validación real todavía.** El PREPARE real lo hace el CI. En este trabajo **no** se ejecutaron tests, lint, typecheck, build, SQL ni PREPARE. Solo se usaron `node --check` y una ejecución estática del analizador en un borrador, con PREPARE simulado (sin base de datos), para calcular los IDs exactos de §5 y revisar el SQL reconstruido.
