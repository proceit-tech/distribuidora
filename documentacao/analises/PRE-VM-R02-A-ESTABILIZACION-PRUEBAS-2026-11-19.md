# PRE-VM-R02-A — Estabilización de pruebas (entrega para auditoría)

- Fecha: 19/11/2026. Base: diagnóstico PRE-VM-R01 (`5ccfda4`), dictamen ChatGPT «conforme con reservas», directivas D1–D5.
- Alcance ejecutado: A-01…A-25, A-27, A-28, A-30…A-42, C-02, C-03, C-04. **Excluidos:** A-26, A-29, C-01, C-05 y bloque B (lint).
- Sólo se tocaron archivos de prueba (`*.casos.ts`, `pruebas/T25`, `pruebas/T26`), el runner de casos y el script de la batería descartable. **Sin código funcional, migraciones, contratos fiscales, gateway, inventario ni numeración.**
- **Nada ejecutado**: ni tests, ni lint, ni typecheck, ni build, ni SQL, ni CI manual. Sólo `node --check` del runner y `bash -n` del script.

## 1. Matriz de hallazgos corregidos

| Hallazgo | Archivo | Corrección | Regla aplicada |
|---|---|---|---|
| A-01…A-10 | facturacion, ajuste-fiscal, credito, pagos, monedas, rediseno, stock-e02, descuentos-e03, entrega-e04, visual-codigos-e05 (`*.casos.ts`) | `vendedorId` válido en todos los fixtures. Capa común `contrato-fe-simulado.casos.ts` que responde vendedor activo (NEX-074), límite de líneas (NEX-078), política de stock (NEX-081), fecha (NEX-073), receptor (NEX-076) y geografía. `cuerpoValido()` reemplaza los `leerCuerpoFactura(...) as never`: un fixture inválido falla nombrando el motivo. Las regex de emisión aceptan los envoltorios `_vendedor`/`_receptor` (mismos parámetros posicionales). | PRO-307, PRO-339, PRO-354, PRO-328, PRO-322 |
| A-09 (E04) | entrega-e04 | El simulador `mundo` responde el vendedor elegido desde sus cuentas por empresa, `fe_direccion_receptor_elegida` y el payload histórico. `mundo328` responde `fe_max_lineas`. E1-05 y E1-07 se reescriben a la regla vigente: el vendedor es el ELEGIDO, no el que emite; otra empresa da 422 sin fuga. | PRO-307 |
| A-11 | proveedores/estabilizacion | Comportamiento de `decidirGet` (8 combinaciones) y su uso en la ruta antes de abrir la base. Sustituye el texto de la implementación anterior. | PRV-R03-01 |
| A-12, A-13 | inventario/cruzados, reportes/stock-general | En vez de «la última migración es NEX-053», se comprueba con SHA-256 que no cambiaron las migraciones que definen inventario (NEX-009, NEX-014, NEX-046). | Invariancia de esquema |
| A-14 | nce | Se exige un CDC presente: ausente o vacío da error. Se copia literal: «123» se asocia tal cual. La entrada sin líneas sigue rechazándose. | PRO-342-R05 |
| A-15 | nce | A07 se divide en tres casos: con lote → ENVIADO; sólo con CDC → indeterminado; con eco del número coincidente → ENVIADO, y con eco de otro número → indeterminado. | R05, D3 |
| A-16 | secuencias | T24 copia de `$BASE` (base propia NEX-001…060), no de `$ORIG`. | PRO-130/131/132-R02 |
| A-17, A-18 | visual-v1 | Se admite `fd(p.cantidad)`, que es una cantidad pendiente y no un importe. La celda de cantidad admite atributos (`data-label`). | PRO-354, PRO-331 |
| A-19 | cantidad-e01 | Se incorpora la rama `ALTA_BLOQUEADA` del selector. | PRO-339 |
| A-20 | flujo-factura-ux | Texto vigente: la dirección elegida es el domicilio del receptor. | PRO-328 |
| A-21 | flujo-fiscal-pro342 | El resumen esperado pasa a ser «Enviado · CDC informado · SIFEN Rechazado». | D3 |
| A-22 | consulta-automatica-fe | La búsqueda de «kude» se hace sólo en el código: se excluyen comentarios y literales de texto. | Ninguna regla cambia |
| A-23 | documentos-ux-r02 | Se espera `contexto: contextoAplicado`. | PRO-195-UX-R01-R01 F002 |
| A-24 | documentos-ux-r02 | La guarda `if (generacion === null) return;` admite antes declaraciones sin efectos (sin await, fetch, setters ni llamadas a informar). | F002 |
| A-25 | documentos-ux-r02 | La consulta se rige por la época de contexto (`destinoConsulta`, «descartar»). El envío conserva la protección por generación. | D2 |
| A-27 | documentos-pro195-r01 | Se quita el literal `MOTIVO_EVENTOS_NO_DISPONIBLES` completo antes de buscar «stock»; el texto contiene «;». | Ninguna regla cambia |
| A-28 | gateway-config | El detector de temporales excluye el archivo `.provisionar-gateway-*.estado`. Su modo 600 sigue comprobándose. | Ninguna regla cambia |
| A-30 | configuracion-gateway + runner | Se llama a `limpiarCacheTokens()` antes de la sección 3 de la suite. El runner limpia la caché antes de CADA suite y registra un error de inventario si no puede hacerlo. | Aislamiento |
| A-31 | kude | NCR-04: sin CDC registrado, un CDC de otro número o de tipo FE se descarta (502, NO_CORRESPONDE) y el mensaje no muestra el CDC. | D1 |
| A-32, A-36 | detalle-factura-vista, codigo-foco-pro341 | Se aplica `sinCom()` a `busqueda-rapida.ts` antes de la regex. | Ninguna regla cambia |
| A-33, A-35 | detalle-factura-vista, codigo-foco-pro341 | El bloque de modo tarjeta empieza después de la llave del `@media`; la condición `max-width: 900px` ya no cuenta como un ancho fijo. | Ninguna regla cambia |
| A-34 | detalle-factura-vista | `:not(.itemsResumen)` se trata como exclusión del resumen. | Ninguna regla cambia |
| A-37 | codigo-foco-pro341 | La búsqueda de `alAgregar={agregar}` se acota a la etiqueta `<SelectorProducto …/>`; antes se cortaba en el `=>` de `alCerrar`. | Ninguna regla cambia |
| A-38…A-41 | flujo-fiscal-pro342, documentos-ux-r01 | `const acciones = accionesFila(...)` se busca en la página y su uso (`acciones.filter(...)`) en la fila. | PRO-195-UX-R01 |
| A-42 | politica-stock-pro354 | `enOrden` pasa a ser progresivo: cada texto se busca después del anterior, en sus dos definiciones. | Ninguna regla cambia |
| C-02 | pruebas/T25 | Se captura `ultima_prueba_estado` y `ultima_prueba_at` antes y se exige que no cambien. | NEX-061 |
| C-03 | pruebas/T26 | RECHAZADO con `estado_local = 'ENVIADO'`, que es la combinación coherente. No se reutiliza el número. | A02 |
| C-04 | scripts/ejecutar-pruebas.sh (V0) | Una sola transacción (`-1`): perfil_permiso → perfiles → empresas, con el mismo filtro de código y razón social. Se aborta si hay usuarios. Guardas: `nexit_test_*` en el shell y `current_database() ~ '^nexit_test_[0-9]+_prod$'` dentro de la transacción. | Entorno descartable |

## 2. Archivos modificados

- **Nuevo:** `lib/facturacion/contrato-fe-simulado.casos.ts`. Es sólo de prueba, sin `verificar*`, y queda excluido del build operativo por su sufijo.
- **Runner:** `scripts/casos-clientes/run.js`. Carga el módulo de apoyo para el inventario (y rechaza que exporte `verificar*`) y aísla la caché de tokens por suite.
- **Casos:** los 10 de FE de A-01…A-10, más ajustes en `estabilizacion`, `cruzados`, `stock-general`, `nce`, `secuencias`, `visual-v1`, `cantidad-e01`, `flujo-factura-ux`, `flujo-fiscal-pro342`, `consulta-automatica-fe`, `documentos-ux-r01`, `documentos-ux-r02`, `documentos-pro195-r01`, `gateway-config`, `configuracion-gateway`, `kude`, `detalle-factura-vista`, `codigo-foco-pro341` y `politica-stock-pro354`. Además, E02-35 (stock-e02) y EN-53 (entrega-e04), que comprobaban el nombre antiguo de la función de emisión.
- **SQL/batería:** `pruebas/T25-nex061-gateway-config.sql`, `pruebas/T26-nex062-nce.sql`, `scripts/ejecutar-pruebas.sh`.

## 3. Cobertura recuperada

- **Suites FE (A-01…A-10):** dejan de abortar en el primer fixture. Vuelven a evaluarse todas las comprobaciones posteriores de emisión, crédito, pagos, monedas, descuentos, ajuste fiscal, stock, entrega/E1/PRO-328 y visual E05.
- **KuDE (NCR-04):** la excepción ya no corta la suite; NCR-05 y las siguientes vuelven a evaluarse.
- **T26:** el UPDATE incoherente ya no aborta el bloque; R02-02 y las siguientes vuelven a ejecutarse.
- **Gateway:** la sección 3 de configuracion-gateway ya no depende de la caché que dejaron suites o secciones anteriores.
- **V0/I1:** la instalación limpia puede volver a comprobarse.

## 4. Casos preservados y añadidos

- **Negativos de vendedor:** se conservan los tres de cuerpo sin vendedor, no UUID o de tipo no texto («Seleccione el vendedor.»). Se añaden tres en servidor: vendedor inexistente o inactivo, vendedor de otra empresa y NEX-074 ausente. Los tres dan 422 sin llegar a la función de emisión.
- **Invariantes intactos:** seguridad, permisos, multiempresa, moneda, IVA, stock, numeración, idempotencia y CDC. Ninguna comprobación se reemplazó por `true` ni se eliminó; las obsoletas se reescribieron a la regla vigente.
- **No reabiertos:** T19, T21, T24 y T27–T34.

## 5. Limitaciones

- Nada se ejecutó, así que el resultado real depende del CI de GitHub Actions o de una corrida autorizada.
- Las cuentas por hallazgo provienen del diagnóstico estático de PRE-VM-R01. Una suite que vuelve a correr puede mostrar fallos que antes estaban ocultos por el aborto; no se predijeron.
- **Fuera de alcance:**
  - A-26, A-29, C-01, C-05 y el bloque B (7 errores `react-hooks/set-state-in-effect`).
  - El verificador y la línea base C1 quedan para PRE-VM-R02-D (D5).
  - NEX-082 no se crea (D4).
