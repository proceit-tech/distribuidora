# Casos de regresión de Clientes (ejecución local)

Compila y ejecuta, con Node y el `tsc` del proyecto, los `*.casos.ts` de `lib/` (lógica pura: teléfonos, catálogo de países, importes y
conversión de moneda, frecuencia de entrega, GLN, filtros de la lista, permisos de documentos, aptitud/compuerta fiscal con una base de datos
simulada en memoria). **No** usa PostgreSQL, red, servidor, VM ni Docker.

Desde la raíz del repositorio:

```bash
node_modules/.bin/tsc -p scripts/casos-clientes/tsconfig.json && node scripts/casos-clientes/run.js
```

El resultado indica por suite si hay fallos y cuántas comprobaciones se contaron (las suites de catálogo no tienen contador y se ejecutan igual).
La salida de compilación queda en `.tmp-casos/` (ignorada por Git).
