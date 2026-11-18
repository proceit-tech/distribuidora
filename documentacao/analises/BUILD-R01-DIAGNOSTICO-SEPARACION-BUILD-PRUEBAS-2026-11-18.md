# BUILD-R01 — Diagnóstico y propuesta: separación del build operacional y las pruebas NEXIT

- Fecha: 2026-11-18
- Rama: `feature/NEXIT-2026-001-banco-demo`, HEAD analizado `feea3e63d7eae90dc2eecf0921d140f872e1b607`
- Orden: «ORDEN PRIORITARIA — SEPARACIÓN DEL BUILD OPERACIONAL Y LAS PRUEBAS NEXIT» (responsable, 18/11/2026). Solo diagnóstico y propuesta.
- **Nada implementado ni ejecutado**: sin tests, runner, lint, typecheck, build, Docker, VM, deploy ni merge. Única verificación local: `node --check scripts/casos-clientes/run.js` (análisis sintáctico del archivo, no ejecuta ningún caso) para confirmar el hallazgo H5. Ningún archivo de código, configuración, migración ni dato fue modificado; este documento es el único cambio del commit.
- Los correctivos individuales de build de PRO-342-R05 (`6f664fc`, `feea3e6`) quedan suspendidos según la orden.

## 1. Resumen ejecutivo

1. **Causa raíz confirmada.** `Dockerfile` hace `COPY . .` y `npm run build` (`next build`). `next build` comprueba tipos con `tsconfig.json`, cuyo `include` es `**/*.ts` / `**/*.tsx` sin excluir pruebas. Resultado: los **95 archivos `*.casos.ts` (~30.100 líneas, ~28 % del TypeScript del repo)** entran en la comprobación de tipos del build operacional. Un error de tipos en un caso (TS2367/TS2345 de PRO-342-R05) rompe la imagen de producción aunque ninguna ruta de la app lo use.
2. **La aplicación no depende de las pruebas.** Análisis de alcance de importaciones desde los 210 puntos de entrada de Next (`page/layout/route/...`, `instrumentation.ts`, `next.config.ts`): 517 módulos alcanzables, **0 archivos `*.casos.ts`** entre ellos. Ningún archivo no-caso importa un caso.
3. **El runner de casos no puede ejecutarse desde el 29/10/2026.** `scripts/casos-clientes/run.js` declara `const mon` dos veces (líneas 63 y 82) → `SyntaxError: Identifier 'mon' has already been declared` al parsear: no corre **ninguna** suite. Además el runner **termina con código 0 aunque haya fallos**.
4. **No existe CI de aplicación.** Los dos workflows existentes son solo del banco (`nexit-banco-ci.yml`, filtrado por `documentacao/banco/nexit/v1/**`) y su deploy manual. Ningún job compila TypeScript, ejecuta casos, hace `next build` ni `docker build` antes de que el responsable construya `nexit-app:teste` en la VM.
5. **La imagen final ya no contiene casos** (el stage `runner` solo copia `.next/standalone`, `.next/static` y `public`, y el trazado de archivos de Next solo incluye módulos importados), pero el **contexto Docker y el stage `builder` sí** reciben casos, `documentacao/` (incl. `PROGRESSO-NEXIT-V1.md` 775 KB, `CLAUDE.md` 192 KB) y `scripts/`, porque `.dockerignore` no los excluye. Falta una verificación automática que lo garantice.

Propuesta (sección 5): **dos configuraciones TypeScript** (app para el build / completa para pruebas), `next.config.ts` apuntando a la de app, `.dockerignore` que excluya pruebas y documentación, corrección del runner (`mon` duplicado + código de salida), scripts npm explícitos y **un workflow `nexit-app-ci`** con typecheck app, typecheck casos, ejecución de casos, lint, `next build` y `docker build` con inspección de contenido, como compuerta previa al despliegue. Nada se oculta: los casos siguen compilándose y fallando en CI si tienen errores.

## 2. Inventario revisado (estado actual)

| Archivo | Estado actual | Efecto |
|---|---|---|
| `Dockerfile` | 2 stages. `builder`: `COPY package*.json` → `npm ci` → **`COPY . .`** → `npm run build`. `runner`: copia solo `.next/standalone`, `.next/static`, `public`; usuario 1001. | El build ve todo el repo. La imagen final es mínima. |
| `.dockerignore` | `node_modules .next .git .github .env .env.* !.env.example *.log coverage dist tmp .DS_Store` | **No excluye** `**/*.casos.ts`, `lib/clientes/contador-casos.ts`, `scripts/`, `documentacao/`, `.tmp-casos/`, `*.tsbuildinfo`, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, `compose*.yml`. |
| `tsconfig.json` | `strict`, `noEmit`, `incremental`, plugin `next`, `paths @/*`; `include: ["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts",".next/dev/types/**/*.ts"]`; `exclude: ["node_modules"]`. | **Única configuración usada por `next build`** → incluye casos. |
| `next.config.ts` | `reactStrictMode`, `output: "standalone"`. Sin `typescript.tsconfigPath`, sin `ignoreBuildErrors` (correcto, no se oculta nada). | Next usa `tsconfig.json` por omisión. |
| `package.json` | scripts: `dev`, `build` (`next build`), `start`, `lint` (`eslint .`). Sin `typecheck`, sin script de casos. | La compilación de casos solo está documentada en el README del runner. |
| `scripts/casos-clientes/tsconfig.json` | `extends ../../tsconfig.json`; emite CommonJS a `.tmp-casos/`; `include: lib/**/*.casos.ts + next-env.d.ts`. | Correcto como configuración independiente de pruebas (req. 3). Depende de la raíz para `strict`/`paths`. |
| `scripts/casos-clientes/run.js` | Carga 92 módulos compilados al inicio, ejecuta 95 suites en serie, imprime OK/FALLA. | **H5** `mon` duplicado; **H6** sale con 0 con fallos; **H7** 3 casos no registrados. |
| `.github/workflows/nexit-banco-ci.yml` | PostgreSQL 16 descartable; T01–T34, respaldo, runtime y C1 (`verificar-consultas-app.js` con `APP_REPO`). Disparo solo por cambios en `documentacao/banco/nexit/v1/**` o en los workflows del banco. | No cubre la app. |
| `.github/workflows/nexit-banco-deploy.yml` | Manual, solo desde `main`, entorno protegido; despliega **el banco** (no la app). | La app se despliega a mano en la VM: `docker build -t nexit-app:teste .` (ver `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` §143). |
| `eslint.config.mjs` | `next/core-web-vitals` + `next/typescript`; ignora `.next`, `out`, `next-env.d.ts`. | `eslint .` también analiza casos, `scripts/` y JS de `documentacao/`. Next 16 ya no ejecuta lint dentro de `next build`. |
| `.gitignore` | Ignora `.tmp-casos/` y `*.tsbuildinfo`. | Correcto; los casos están versionados (req. 2 ya se cumple). |

## 3. Hallazgos

### H1 — El build operacional compila las pruebas (req. 1) — CONFIRMADO, CAUSA RAÍZ
`next build` ejecuta la comprobación de tipos del proyecto definido por `tsconfig.json`. Con `include: **/*.ts`, los 95 `*.casos.ts` y su soporte (`lib/clientes/contador-casos.ts`) forman parte del programa. Consecuencias:
- Un error de tipos solo en un caso (ej. `EMPRESA`/`EMPRESA_B` en `cdc-dato-api-r05.casos.ts`, fases `recep` R05) bloquea la imagen de producción. Es exactamente lo que motivó `6f664fc` y `feea3e6`.
- El tiempo y la memoria del build en la VM crecen con ~30.100 líneas que no se despliegan.
- Corregir caso por caso para «hacer pasar el build» mezcla calidad de pruebas con disponibilidad del despliegue.

### H2 — Contexto Docker sin filtrar (req. 5) — CONFIRMADO
`COPY . .` copia al stage `builder` todos los casos, `scripts/casos-clientes/`, `documentacao/` completo (migraciones, scripts SQL, órdenes, auditorías), `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, `compose.yml`, `app.compose.yml`. No llegan a la imagen final (multi-stage), pero:
- aumentan el contexto enviado al daemon y el riesgo de que una futura instrucción `COPY` o un cambio de `output` los arrastre;
- si alguien ejecutó los casos localmente antes del build, `.tmp-casos/` (JS compilado de pruebas) también entra al contexto.

### H3 — La imagen final: no se encontraron fixtures, pero no está verificado automáticamente (req. 5) — PARCIAL
- Stage `runner`: solo `.next/standalone` + `.next/static` + `public`. El trazado (`@vercel/nft`) incluye módulos importados; ningún caso es alcanzable (H4), y la única lectura dinámica de disco de la app (`lib/almacenamiento/archivos-privados.ts:105`) usa el volumen `NEXIT_ARCHIVOS_DIR`, no rutas del repo.
- **No se pudo comprobar empíricamente** (build no autorizado). Debe validarse en la CI propuesta listando `.next/standalone` y el sistema de archivos de la imagen.
- `lib/mocks/*` **sí** va a la imagen porque lo importan páginas DEMO de `app/(private)/recepciones/*` y `types/productos.ts`. Son datos de funcionalidad DEMO en uso (no fixtures de pruebas); retirarlos sería un cambio funcional fuera de esta orden (req. 9). Se deja registrado para decisión separada. `lib/mocks/facturas*.ts`, `types/facturas.ts` y `lib/auth/demo-session.ts` no son alcanzables desde la app (código muerto, ver anexo A).

### H4 — Ninguna función operacional depende de archivos de casos (req. 4) — VERIFICADO ESTÁTICAMENTE
Método: grafo de importaciones (`import`/`import()`/`require`, alias `@/` y rutas relativas) sobre todos los `.ts/.tsx/.js/.mjs` versionados fuera de `documentacao/` y `scripts/`, recorrido desde los 210 puntos de entrada de Next más `instrumentation.ts` y `next.config.ts`.
- Módulos alcanzables desde la app: 517. **Casos alcanzables: 0.**
- Ningún archivo no-caso importa un `*.casos.*` (búsqueda directa de especificadores).
- Dirección inversa (normal): los casos importan módulos de la app (`@/lib/facturacion/*`, `@/lib/productos/*`, etc.) y leen fuentes como **texto** con `node:fs` (86 de 95 casos) para comprobaciones estructurales; esto exige que el árbol fuente exista donde corren las pruebas, no en la imagen.
- Soporte exclusivo de pruebas dentro de `lib/`:
  - `lib/clientes/contador-casos.ts` — contador de comprobaciones; lo usan 93 casos y `run.js`. No es alcanzable desde la app.
  - `lib/movimientos/documentos.ts` — contrato «ETAPA C» de Movimientos ↔ documentos; hoy solo lo importa `lib/stock/stock-reposicion.casos.ts`. Es código de dominio documentado como «sin conectar»; no es un fixture. Se conserva.
  - Casos que importan otros casos: `@/lib/reportes/export-xlsx.casos` (4 casos). Funciona porque ambos están en la configuración de pruebas.
- Gancho de prueba dentro de código operacional: `lib/facturacion/shared.ts:58` exporta `reiniciarNex080ParaCasos()` (reinicia la memoria de NEX-080 confirmada). No lo llama ninguna ruta; es una dependencia inversa benigna (la app no depende de él). No se propone tocarlo: pertenece a PRO-342-R05, congelada (req. 9).

### H5 — Constante `mon` duplicada en el runner (req. 7) — CONFIRMADO, BLOQUEANTE
- `run.js:63` `const mon = cargar("lib/facturacion/monedas.casos.js");` (MFE-03 P2, existente desde antes de `620ea83`, 21/10/2026).
- `run.js:82` `const mon = cargar("lib/formato/monto-visual.casos.js");` introducida en `d221435` (PRO-335, 29/10/2026).
- Uso: `run.js:153` `mon.verificarCasosMonedas()` y `run.js:179` `mon.verificarCasosFormatoMonetarioPro335()`.
- En JavaScript, dos `const` con el mismo nombre en el mismo ámbito es error **de análisis**: Node rechaza el archivo completo antes de ejecutar nada (`node --check` lo confirma: `run.js:82 SyntaxError: Identifier 'mon' has already been declared`).
- Impacto: desde `d221435` **ninguna suite del runner pudo ejecutarse** (ni las 95 actuales). Cualquier afirmación posterior de ejecución del runner no es posible con este archivo. Es la única declaración duplicada del runner (comprobado: `uniq -d` sobre las `const`).
- Si solo se renombrara la segunda, la línea 153 seguiría correcta y la 179 debe apuntar al nuevo nombre; si se renombrara la primera, al revés. Propuesta en §5.4.

### H6 — El runner no falla cuando hay fallos — CONFIRMADO
`run.js` imprime `FALLA` y el total, pero nunca asigna `process.exitCode`. Con el error H5 corregido, un CI que lo invoque quedaría **verde aunque haya casos fallidos**. Incompatible con req. 6 y req. 8 (ocultaría errores).

### H7 — Casos compilados pero no ejecutados — CONFIRMADO
`scripts/casos-clientes/tsconfig.json` compila los 95 `lib/**/*.casos.ts`, pero `run.js` solo registra 92. No registrados:
- `lib/reportes/ventas-layout.casos.ts` — aislado a propósito (PRO-337: «no está registrada en run.js, fuera del alcance autorizado»).
- `lib/facturacion/consulta-automatica-fe.casos.ts` — PRO-338 P338-01..20 (escritos «fuera del runner» según AUD R01).
- `lib/facturacion/stock-preventivo.casos.ts` — PRO-330 / PRO-330-T01 (incluye PRO330-61).
Se compilan (sus errores de tipos serían visibles) pero nunca se ejecutan. Su registro es decisión del auditor (§7, D3).

### H8 — No hay CI de aplicación (req. 6) — CONFIRMADO
- `nexit-banco-ci` solo se dispara con cambios en `documentacao/banco/nexit/v1/**` o en sus workflows; un cambio en `app/` o `lib/` no ejecuta nada. Su paso C1 (consultas SQL de la app contra el esquema) sí lee el código de la app, pero solo cuando el banco cambia.
- No hay `tsc`, ni casos, ni `next build`, ni `docker build` automáticos. La primera compilación real ocurre en la VM con `docker build -t nexit-app:teste .`, que es donde se descubrieron los errores de R05.

### H9 — Riesgos menores observados
- `tsconfig.json` tiene `incremental: true`; `next build` puede dejar `tsconfig.tsbuildinfo` en el contexto local (ignorado por Git, no por Docker).
- `eslint .` (script `lint`) analiza `documentacao/**/*.js` y `scripts/`: el estado actual del lint es **desconocido** (nunca ejecutado en CI).
- El estado actual del typecheck de los casos en HEAD `feea3e6` también es **desconocido**: los fixes R05 no fueron compilados.

## 4. Archivos afectados

| Archivo | Cambio propuesto | Tipo |
|---|---|---|
| `tsconfig.json` | Sin cambios de contenido (sigue siendo la configuración **completa**: editor + typecheck de todo). | — |
| `tsconfig.build.json` (nuevo) | `extends ./tsconfig.json` y `exclude` de pruebas y soporte. | Config build |
| `next.config.ts` | Añadir `typescript: { tsconfigPath: "tsconfig.build.json" }`. **No** `ignoreBuildErrors`. | Config build |
| `.dockerignore` | Excluir pruebas, soporte, runner, documentación y artefactos. | Config Docker |
| `Dockerfile` | Sin cambios obligatorios (opcional: comprobación de contenido en el `builder`, §5.3). | — |
| `package.json` | Scripts `typecheck`, `typecheck:casos`, `casos`, `verificar:separacion`. Sin dependencias nuevas. | Config |
| `scripts/casos-clientes/run.js` | Renombrar el segundo `mon`; `process.exitCode`; falla si un caso compilado no está registrado ni en la lista explícita de aislados. | Runner de pruebas |
| `scripts/casos-clientes/tsconfig.json` | Sin cambios (ya es independiente; hereda `strict`/`paths`). | — |
| `scripts/casos-clientes/README.md` | Actualizar comandos (`npm run casos`). | Doc |
| `.github/workflows/nexit-app-ci.yml` (nuevo) | CI de aplicación (§6). | CI |
| `scripts/verificar-separacion.sh` (nuevo, opcional) | Comprueba que ningún módulo de la app importe casos y que la imagen/standalone no contenga pruebas. | CI |

**No se tocan**: `app/`, `components/`, `lib/` (código y casos), `types/`, migraciones, scripts SQL, datos, `nexit-banco-*.yml`, reglas de facturación/stock/costos/CDC/KuDE (req. 9). Ningún caso se elimina ni se desactiva (req. 2 y 8).

## 5. Propuesta técnica de separación

### 5.1 Dos configuraciones TypeScript (recomendada: opción B)

**Opción B (recomendada) — `tsconfig.json` completo + `tsconfig.build.json` para Next:**

```jsonc
// tsconfig.build.json (nuevo)
{
  "extends": "./tsconfig.json",
  "exclude": [
    "node_modules",
    "**/*.casos.ts",
    "lib/clientes/contador-casos.ts",
    "scripts/**",
    "documentacao/**",
    ".tmp-casos/**"
  ]
}
```

```ts
// next.config.ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  typescript: { tsconfigPath: "tsconfig.build.json" },
};
```

- `include` se hereda (incluidos `.next/types/**`), `strict` intacto, `ignoreBuildErrors` NO se usa: el build sigue fallando ante cualquier error de tipos **de la app**.
- `tsconfig.json` sigue incluyendo todo: el editor resuelve `@/` en los casos y `tsc --noEmit -p tsconfig.json` comprueba app + pruebas juntas.
- `scripts/casos-clientes/tsconfig.json` no cambia (redefine su propio `include`/`exclude`, por lo que no hereda las exclusiones).
- Si un archivo de la app llegara a importar un caso, `tsc` lo incluiría igualmente por importación: por eso la CI añade la verificación explícita de §5.5.
- A verificar en la primera ejecución de CI: Next 16 puede escribir ajustes automáticos en el archivo indicado por `tsconfigPath` (inclusión de `.next/types`); debe quedar sin diff después del build.

**Opción A (descartada) — excluir los casos en `tsconfig.json`:** más simple, pero el editor deja de asociar los casos a un proyecto con `paths` (errores falsos de `@/...` al editarlos) y el typecheck completo depende solo de la config del runner.

**Opción C (descartada) — mover los casos a `tests/`:** separación física más limpia, pero toca 95 archivos, las rutas `node:fs` relativas de 86 casos y el historial de auditorías. Desproporcionado para el objetivo; puede reconsiderarse más adelante.

### 5.2 `.dockerignore`

Añadir:

```
# Pruebas y soporte de pruebas (versionados en Git, fuera de la imagen)
**/*.casos.ts
lib/clientes/contador-casos.ts
scripts
.tmp-casos
*.tsbuildinfo
# Documentación, banco y gestión
documentacao
CLAUDE.md
PROGRESSO-NEXIT-V1.md
README.md
compose.yml
app.compose.yml
.claude
```

Con esto la separación queda en dos capas independientes: aunque alguien volviera a usar `tsconfig.json` para el build, los casos no estarían en el contexto. Requisito: ningún archivo de la app puede importar algo excluido (verificado hoy, §3 H4; vigilado en CI, §5.5).

### 5.3 `Dockerfile`

Sin cambios obligatorios: el stage final ya es mínimo. Alternativa evaluada y **no recomendada**: sustituir `COPY . .` por una lista blanca (`COPY app components lib types public ...`), más estricta pero fácil de romper al añadir un archivo de configuración nuevo. Se prefiere la lista negra de `.dockerignore` + verificación de contenido en CI (§6, job `imagen`).

### 5.4 Runner de casos

1. **`mon` duplicado:** renombrar solo la segunda declaración, que es la que introdujo la colisión:
   - `run.js:82` → `const fmv = cargar("lib/formato/monto-visual.casos.js");`
   - `run.js:179` → `fmv.verificarCasosFormatoMonetarioPro335()`
   - `run.js:63` y `:153` (`mon` = monedas MFE-03 P2) sin cambios.
2. **Código de salida:** al final, `process.exitCode = fallosTotal > 0 ? 1 : 0;` y un `.catch` del IIFE que imprima la excepción y salga con 1 (un `require` que falle al cargar debe fallar la CI, no quedar en «OK»).
3. **Cobertura del registro:** antes de ejecutar, listar `lib/**/*.casos.ts` y fallar si alguno no está registrado ni en una lista explícita `AISLADOS = [...]` con su motivo. Así ningún caso queda fuera en silencio. El contenido inicial de `AISLADOS` depende de la decisión D3.
4. No se cambian las suites, los conteos ni ningún caso.

### 5.5 Scripts `package.json`

```json
"typecheck": "tsc --noEmit -p tsconfig.build.json",
"typecheck:casos": "tsc --noEmit -p scripts/casos-clientes/tsconfig.json",
"casos:compilar": "tsc -p scripts/casos-clientes/tsconfig.json",
"casos": "npm run casos:compilar && node scripts/casos-clientes/run.js",
"verificar:separacion": "bash scripts/verificar-separacion.sh"
```

`build` sigue siendo `next build` (con `tsconfig.build.json` vía `next.config.ts`). `scripts/verificar-separacion.sh` comprueba:
- que `tsc --listFilesOnly -p tsconfig.build.json` no contenga ningún `.casos.` ni `contador-casos` (detecta importaciones accidentales de la app hacia pruebas);
- tras el build, que `.next/standalone` no contenga `*.casos.*`, `contador-casos`, `scripts/casos-clientes`, `.tmp-casos` ni `documentacao`.

## 6. CI propuesta — `.github/workflows/nexit-app-ci.yml`

Disparo: `push` a `feature/NEXIT-2026-001-banco-demo` y `pull_request`, con `paths` `app/**`, `components/**`, `lib/**`, `types/**`, `public/**`, `scripts/casos-clientes/**`, `instrumentation.ts`, `next.config.ts`, `tsconfig*.json`, `package*.json`, `Dockerfile`, `.dockerignore`, `eslint.config.mjs`, `postcss.config.mjs`, `.github/workflows/nexit-app-*.yml`; también `workflow_call` para usarlo como compuerta. `permissions: contents: read`. Node 22 (igual que la imagen), `npm ci` con caché. Sin secretos, sin base de datos, sin red externa salvo npm/registry de Docker Hub para `node:22-alpine`.

| Job | Depende de | Comando | Bloquea |
|---|---|---|---|
| `typecheck-app` | — | `npm run typecheck` + verificación `--listFilesOnly` sin casos | Sí |
| `typecheck-casos` | — | `npm run typecheck:casos` | Sí |
| `casos` | `typecheck-casos` | `npm run casos` (con `process.exitCode` del runner) | Sí |
| `lint` | — | `npm run lint` | Ver D4 |
| `build` | `typecheck-app` | `npm run build` + verificación de `.next/standalone` | Sí |
| `imagen` | `build`, `casos` | `docker build -t nexit-app:ci-${{ github.sha }} .` (sin push) + `docker run --rm --entrypoint sh ... -c 'find / -xdev \( -name "*.casos.*" -o -name contador-casos* -o -name .tmp-casos -o -name documentacao \) -print'` que debe salir vacío | Sí |

Relación con el despliegue:
- El banco sigue con `nexit-banco-ci` / `nexit-banco-deploy` sin cambios.
- La app hoy se despliega a mano en la VM. Regla operativa propuesta (a confirmar por el responsable): **solo se construye `nexit-app` en la VM a partir de un SHA con `nexit-app-ci` verde** en todos los jobs bloqueantes. Un workflow de despliegue de la app (análogo a `nexit-banco-deploy`, manual, entorno protegido) queda fuera de esta propuesta y requeriría orden propia.
- Los casos no requieren PostgreSQL (simulaciones en memoria y lectura de fuentes). Los casos que importan `pg` solo usan tipos/simulaciones; si alguno abriera conexión, fallaría visiblemente en CI (sin `DATABASE_URL`), no se ocultaría.

Primera ejecución esperada: es probable que `typecheck-casos`, `casos` y/o `lint` fallen (H5/H9: nunca ejecutados desde hace semanas). Eso es el comportamiento correcto (req. 8): los errores se ven y se corrigen con órdenes focales, sin bloquear la imagen operacional si la app compila.

## 7. Decisiones para el auditor / responsable

- **D1** Opción B (dos tsconfig + `tsconfigPath`) vs A. Recomendado: **B**.
- **D2** Lista negra en `.dockerignore` (recomendado) vs lista blanca en `Dockerfile`.
- **D3** Los 3 casos no registrados (H7): registrarlos en el runner o declararlos en `AISLADOS` con motivo. Recomendado: registrar `stock-preventivo` y `consulta-automatica-fe` (ya auditados como parte de PRO-330/PRO-338) y dejar `ventas-layout` aislado hasta orden de PRO-337, todo explícito.
- **D4** `lint` bloqueante desde el primer día o informativo mientras se mide la base actual. Recomendado: bloqueante sobre `app/ components/ lib/ types/` y ajustar `eslint.config.mjs` para ignorar `documentacao/**` (JS de herramientas del banco, ya cubiertos por shellcheck/CI del banco); confirmar con la primera ejecución.
- **D5** Regla «solo SHA con CI verde se construye en la VM» y si se desea, más adelante, un workflow de despliegue de la app.
- **D6** Qué hacer con los commits de build fix R05 (`6f664fc`, `feea3e6`): con la separación, ya no condicionan el build operacional; sus errores (si quedan) aparecerán en `typecheck-casos` y se corregirán con orden propia.
- **D7** `lib/mocks/*` (DEMO de Recepciones) y código no alcanzable (anexo A): fuera de alcance; solo se registra.

## 8. Criterios de aceptación (para la implementación futura)

1. `tsc --listFilesOnly -p tsconfig.build.json` no lista ningún `*.casos.ts` ni `lib/clientes/contador-casos.ts`.
2. Un error de tipos introducido **solo en un caso** hace fallar `typecheck-casos` (y `casos`) en CI, y **no** hace fallar `npm run build` ni `docker build`.
3. Un error de tipos introducido en un archivo de la app hace fallar `typecheck-app`, `build` e `imagen` (no se oculta nada; `ignoreBuildErrors` ausente, `strict` intacto).
4. Si un archivo de la app importa un caso, `typecheck-app` falla con mensaje explícito.
5. Los 95 `*.casos.ts`, `contador-casos.ts`, `scripts/casos-clientes/*` siguen versionados y sin eliminar ni desactivar ninguna comprobación.
6. `node --check scripts/casos-clientes/run.js` pasa; `monedas` y `monto-visual` se ejecutan como suites separadas con sus nombres actuales.
7. El runner termina con código ≠ 0 si hay al menos un fallo o una excepción de carga, y con 0 solo si todas las suites pasan.
8. Todo `lib/**/*.casos.ts` está registrado en `run.js` o figura en `AISLADOS` con motivo; si no, el runner falla.
9. La imagen `nexit-app` construida en CI no contiene `*.casos.*`, `contador-casos*`, `.tmp-casos`, `scripts/casos-clientes` ni `documentacao`; el contexto Docker tampoco los incluye.
10. El diff de la implementación no toca `app/`, `components/`, `lib/`, `types/`, migraciones, scripts SQL, datos ni workflows del banco.
11. `nexit-app-ci` corre en push/PR de la rama oficial y su estado verde es requisito documentado antes de construir la imagen en la VM.

## 9. Plan de implementación sugerido (tras aprobación)

Un solo commit de configuración (o dos: config + CI), sin tocar código funcional:
1. `tsconfig.build.json` + `next.config.ts` (`tsconfigPath`).
2. `.dockerignore`.
3. `run.js`: `mon`→`fmv` en la segunda declaración, `process.exitCode`, verificación de registro + `AISLADOS` según D3.
4. `package.json` scripts + `scripts/verificar-separacion.sh` + README del runner.
5. `.github/workflows/nexit-app-ci.yml`.
La primera ejecución de la CI (no manual: por push) dará la línea base real de typecheck/casos/lint; sus fallos se reportan sin corregirlos en el mismo commit, para auditoría.

## Anexo A — Módulos no alcanzables desde la app (análisis estático)

Soporte exclusivo de pruebas: `lib/clientes/contador-casos.ts`; usado solo por casos: `lib/movimientos/documentos.ts`.
Sin referencias desde puntos de entrada (código muerto o configuración): `app/(private)/clientes/_components/cliente-card.tsx`, `app/(private)/clientes/_components/cliente-form.tsx`, `app/(private)/productos/_components/estado-pagina.tsx`, `components/ui/toast/toast-provider.tsx`, `components/ui/toast/toast.tsx`, `lib/auth/demo-session.ts`, `lib/mocks/facturas-storage.ts`, `lib/mocks/facturas.ts`, `types/facturas.ts` (más `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts`, que son configuración). No se propone eliminarlos en esta orden.

## Anexo B — Método

Lectura completa de `Dockerfile`, `.dockerignore`, `tsconfig.json`, `next.config.ts`, `package.json`, `scripts/casos-clientes/{tsconfig.json,run.js,README.md}`, `.github/workflows/*.yml`, `eslint.config.mjs`, `.gitignore`, `compose.yml`, `app.compose.yml`, `instrumentation.ts`, `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md`. Grafo de importaciones con un script de lectura (Python, solo lectura) sobre `git ls-files`; historial con `git log -S` (profundidad 600). Comprobación sintáctica `node --check` del runner. Ninguna compilación, prueba, lint, build, contenedor ni acceso a VM/BD.
