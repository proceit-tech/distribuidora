# Casos de regresión de Clientes (ejecución local)

Compila y ejecuta, con Node y el `tsc` del proyecto, los `*.casos.ts` de `lib/` (lógica pura: teléfonos, catálogo de países, importes y
conversión de moneda, frecuencia de entrega, GLN, filtros de la lista, permisos de documentos, aptitud/compuerta fiscal con una base de datos
simulada en memoria). **No** usa PostgreSQL, red, servidor, VM ni Docker.

Desde la raíz del repositorio:

```bash
npm run casos            # limpia .tmp-casos, genera los tipos de rutas de Next (next typegen), compila y ejecuta
npm run typecheck:casos  # solo comprobación de tipos de los casos (sin emitir)
npm run lint:casos       # lint de los casos, su contador y este runner
```

El resultado indica por suite si hay fallos y cuántas comprobaciones se contaron (las suites de catálogo no tienen contador y se ejecutan igual).
La salida de compilación queda en `.tmp-casos/` (ignorada por Git) y se borra antes de cada compilación para no ejecutar JS viejo.

**Separación del build (BUILD-R02):** los `*.casos.ts` y `lib/clientes/contador-casos.ts` NO forman parte del build operacional
(`next build` usa `tsconfig.build.json`) ni del contexto Docker (`.dockerignore`). Se compilan solo con `scripts/casos-clientes/tsconfig.json` (ES2020).

**Código de salida:** 0 solo si todas las suites registradas se ejecutaron sin fallos y el inventario está completo; 1 ante cualquier fallo,
excepción de carga o ejecución, resultado inválido o error de inventario. El inventario exige que cada `lib/**/*.casos.ts` esté cargado una vez,
que cada función `verificar*` exportada se invoque exactamente una vez (un módulo puede tener varias suites distintas) y que `.tmp-casos/` no
contenga casos compilados sin fuente. Una suite nueva se registra añadiendo su `cargar(...)` y su entrada en `suites`.

En CI corre en el workflow `nexit-app-ci` (job `casos`), separado de typecheck/lint/build/imagen de la aplicación; la compuerta `liberacion`
exige todos los jobs en verde.
