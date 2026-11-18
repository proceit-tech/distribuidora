# BUILD-R02 — Entrega: separación del build operacional y las pruebas

- Fecha: 2026-11-18. Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-BUILD-R02-SEPARACION-BUILD-PRUEBAS-2026-11-18.md` (commit `03448ca0b6cccedcfd4565e8930dfa4fee2b4b57`). Base diagnóstico: BUILD-R01 `9a3553879d8ed90a4d2696fc8d84b56bd39590b3`.
- **Nada ejecutado localmente**: sin tests, runner, lint, typecheck, build, Docker, SQL, VM, deploy ni merge. Solo revisión estática y comprobaciones sintácticas (`node --check` del runner, `bash -n` del verificador, carga YAML del workflow). La primera validación real será la CI automática que dispare el push; sus resultados se registran sin corregir otros bloques.
- No se modificó: tsconfig.json raíz, Dockerfile, scripts/casos-clientes/tsconfig.json, ningún `*.casos.ts`, `contador-casos.ts`, app/components/lib/types, migraciones, SQL, seeds, workflows del banco, eslint.config.mjs, dependencias. Correctivos R05 `6f664fc`/`feea3e6` conservados (D6).

## 1. Cambios (allowlist de la orden)

| Archivo | Cambio | Decisión |
|---|---|---|
| `tsconfig.build.json` (nuevo) | `extends ./tsconfig.json`; mismo `include`; `exclude` de `**/*.casos.ts(x)`, `lib/clientes/contador-casos.ts`, `scripts/**`, `documentacao/**`, `.tmp-casos/**`. Hereda strict/noEmit/paths/plugin. | D1 |
| `next.config.ts` | `typescript: { tsconfigPath: "tsconfig.build.json" }`. Sin `ignoreBuildErrors`. | D1 |
| `.dockerignore` | + `**/*.casos.ts(x)`, `lib/clientes/contador-casos.ts`, `scripts`, `.tmp-casos`, `*.tsbuildinfo`, `documentacao`, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, `README.md`, `compose.yml`, `app.compose.yml`, `.claude`. `lib/mocks` y `lib/movimientos/documentos.ts` se conservan. | D2, D7 |
| `package.json` (solo scripts) | `typegen`, `typecheck`, `typecheck:casos`, `lint:app`, `lint:casos`, `casos:limpiar`, `casos:compilar`, `casos`, `verificar:dependencias`, `verificar:standalone`. `lint`, `build`, `dev`, `start` sin cambios. | D1, D3, D4 |
| `scripts/casos-clientes/run.js` | `mon`→`fmv` en la 2.ª declaración (monto-visual; `mon` = monedas intacta); registro de PRO-330/338/337; inventario automático; `process.exitCode`; resultado inválido y excepción al contar = fallo; `.catch` de carga/configuración. Suites y conteos existentes sin cambio. | D3 |
| `scripts/casos-clientes/README.md` | Comandos npm, código de salida, inventario, separación. | — |
| `scripts/verificar-separacion.sh` (nuevo, 100755) | Modos `dependencias`, `standalone`, `builder <img>`, `imagen <img>`. `set -euo pipefail`, `set -f`; resultado no vacío = fallo; grep con rc distinguido (1 = sin coincidencias, >1 = error); requeridos verificados (no se eliminan assets); inspección de `/app` con `sh` sin arrancar el servidor. | D2, D5 |
| `.github/workflows/nexit-app-ci.yml` (nuevo) | Jobs independientes `typecheck-app`, `casos`, `lint-app`, `lint-casos`, `build`, `imagen`; compuerta `liberacion` (`needs` todos, `if: always()`, exige `success` en cada uno, ausente/omitido/cancelado = fallo). Push rama oficial + `pull_request` sin `paths` + `workflow_call`. Node 22, `npm ci`, `contents: read`, sin secretos, sin deploy ni push de imagen, sin `continue-on-error`. Resumen con SHA exacto y distinción merge sintético/cabeza del PR. | D4, D5 |

## 2. Diseño por decisión

**D1.** `next build` comprueba tipos con `tsconfig.build.json`. `typecheck` = `next typegen` + `tsc --noEmit -p tsconfig.build.json` (tipos de rutas generados en CI limpia; no depende de `.next` local). Casos: `scripts/casos-clientes/tsconfig.json` (ES2020, BigInt `80000n` válido) intacto, con `next typegen` previo porque `next-env.d.ts` importa `.next/types/routes.d.ts`. La raíz no se usa como comando de aceptación.

**D2.** Dependencia demostrada estáticamente (BUILD-R01 §H4 + búsqueda en esta entrega): ningún archivo de `app/ components/ lib/ types/ instrumentation.ts next.config.ts postcss.config.mjs` referencia `documentacao`, `scripts/`, `README`, `CLAUDE.md` ni `PROGRESSO` en código; ningún módulo alcanzable importa casos ni `contador-casos`. Dockerfile intacto (`COPY . .` respeta `.dockerignore`). Contexto real (stage builder), standalone e imagen final se verifican en CI, no por supuesto.

**D3.** Inventario por **funciones invocadas**, no por `require`: `cargarCasos` envuelve cada módulo con un Proxy que registra las llamadas a `verificar*`. Fallo si: un `lib/**/*.casos.ts` no se carga; un módulo se carga dos veces; una `verificar*` exportada no se invoca o se invoca más de una vez; `.tmp-casos` contiene un caso compilado sin fuente. Varias suites distintas por módulo permitidas (`telefono.casos`: 4). `casos:limpiar` borra `.tmp-casos` antes de compilar. Los tres casos registrados no se editaron.

**D4.** `lint:app` (bloqueante) cubre `app components lib types instrumentation.ts next.config.ts` excluyendo solo casos/contador por `--ignore-pattern` (sin desactivar reglas). `lint:casos` cubre casos, contador y `scripts/casos-clientes`; también entra en la compuerta. **Fuera del alcance de ambos lints (explícito):** JS de herramientas del banco en `documentacao/**` (no son JS de la aplicación; shellcheck del banco no los cubre) y `scripts/verificar-separacion.sh` (bash). `npm run lint` (`eslint .`) se conserva sin cambios para uso manual.

**D5.** `imagen` no depende de `casos` ni de `lint`: diagnostica aunque fallen. `liberacion` es el único gate. Producción = `nexit-app-ci` + `nexit-banco-ci` verdes en el mismo SHA + aprobación explícita (documentado en el workflow; R02 no instala nada ni toca la VM, ni la protección de rama).

**D6/D7.** Sin cambios a casos, R05, mocks DEMO ni código no alcanzable.

## 3. Inventario de casos (95 archivos → 98 suites)

| # | Archivo | Variable | Suite(s) invocada(s) |
|---|---|---|---|
| 1 | `lib/ci/verificador-consultas.casos.ts` | `c1` | `verificarCasosVerificadorC1` |
| 2 | `lib/clientes/cierre-modulo.casos.ts` | `cie` | `verificarCasosCierreModulo` |
| 3 | `lib/clientes/clientes-r02.casos.ts` | `cr2` | `verificarCasosClientesR02` |
| 4 | `lib/clientes/comercial.casos.ts` | `com` | `verificarCasosComercial` |
| 5 | `lib/clientes/estabilizacion.casos.ts` | `estc` | `verificarCasosEstabilizacionClientes` |
| 6 | `lib/clientes/nueve-ajustes.casos.ts` | `nue` | `verificarCasosNueveAjustes` |
| 7 | `lib/clientes/permisos-documentos.casos.ts` | `per` | `verificarCasosPermisosDocumentos` |
| 8 | `lib/comercial/estabilizacion.casos.ts` | `cce` | `verificarCasosComercialEstabilizacion` |
| 9 | `lib/dashboard/dashboard.casos.ts` | `dsh` | `verificarCasosDashboard` |
| 10 | `lib/facturacion/ajuste-fiscal.casos.ts` | `aj` | `verificarCasosAjusteFiscal` |
| 11 | `lib/facturacion/alta-punto.casos.ts` | `alt` | `verificarCasosAltaPunto` |
| 12 | `lib/facturacion/buscador-rapido.casos.ts` | `bur` | `verificarCasosBuscadorRapido` |
| 13 | `lib/facturacion/cantidad-e01.casos.ts` | `e01` | `verificarCasosCantidadE01` |
| 14 | `lib/facturacion/cdc-dato-api-r05.casos.ts` | `r342r05` | `verificarCasosCdcDatoApiR05` |
| 15 | `lib/facturacion/cdc-inmutable-r03.casos.ts` | `r338` | `verificarCasosCdcInmutableR03` |
| 16 | `lib/facturacion/codigo-foco-pro341.casos.ts` | `p341` | `verificarCasosCodigoFocoPro341` |
| 17 | `lib/facturacion/colores-tipo-documentos.casos.ts` | `p334` | `verificarCasosColoresTipoPro334` |
| 18 | `lib/facturacion/configuracion-gateway.casos.ts` | `cgw` | `verificarCasosConfiguracionGateway` |
| 19 | `lib/facturacion/consulta-automatica-fe.casos.ts` | `p338` | `verificarCasosPro338` |
| 20 | `lib/facturacion/credito.casos.ts` | `cre` | `verificarCasosCredito` |
| 21 | `lib/facturacion/descuentos-e03.casos.ts` | `e03` | `verificarCasosDescuentosE03` |
| 22 | `lib/facturacion/detalle-factura-vista.casos.ts` | `p331` | `verificarCasosDetalleFacturaPro331` |
| 23 | `lib/facturacion/documentos-ux-r01.casos.ts` | `uxr01` | `verificarCasosDocumentosUxR01` |
| 24 | `lib/facturacion/documentos-ux-r02.casos.ts` | `uxr02` | `verificarCasosDocumentosUxR02` |
| 25 | `lib/facturacion/entrega-e04.casos.ts` | `e04` | `verificarCasosEntregaE04` |
| 26 | `lib/facturacion/estado-tipo.casos.ts` | `est65` | `verificarCasosEstadoTipo` |
| 27 | `lib/facturacion/facturacion.casos.ts` | `fac` | `verificarCasosFacturacion` |
| 28 | `lib/facturacion/fat-e2.casos.ts` | `fe2` | `verificarCasosFatE2` |
| 29 | `lib/facturacion/flujo-factura-ux.casos.ts` | `uxf` | `verificarCasosFlujoFacturaUx` |
| 30 | `lib/facturacion/flujo-fiscal-pro342.casos.ts` | `r342` | `verificarCasosFlujoFiscalPro342` |
| 31 | `lib/facturacion/gateway-config.casos.ts` | `gwc` | `verificarCasosGatewayConfig` |
| 32 | `lib/facturacion/gateway-destino.casos.ts` | `gdest` | `verificarCasosGatewayDestino` |
| 33 | `lib/facturacion/info-adicional-e1.casos.ts` | `e1ia` | `verificarCasosInfoAdicionalE1` |
| 34 | `lib/facturacion/kude.casos.ts` | `kud` | `verificarCasosKude` |
| 35 | `lib/facturacion/limite-lineas.casos.ts` | `p339` | `verificarCasosLimiteLineasPro339` |
| 36 | `lib/facturacion/monedas.casos.ts` | `mon` | `verificarCasosMonedas` |
| 37 | `lib/facturacion/nce-busqueda.casos.ts` | `bnc` | `verificarCasosBusquedaNce` |
| 38 | `lib/facturacion/nce-correcciones-r01.casos.ts` | `r01` | `verificarCasosNceCorreccionesR01` |
| 39 | `lib/facturacion/nce-descuento-e07.casos.ts` | `e07` | `verificarCasosNceDescuentoE07` |
| 40 | `lib/facturacion/nce-seleccion-e06.casos.ts` | `e06` | `verificarCasosNceSeleccionE06` |
| 41 | `lib/facturacion/nce.casos.ts` | `nce` | `verificarCasosNce` |
| 42 | `lib/facturacion/orden-documentos.casos.ts` | `p333` | `verificarCasosOrdenDocumentosPro333` |
| 43 | `lib/facturacion/pagos.casos.ts` | `pag` | `verificarCasosPagos` |
| 44 | `lib/facturacion/politica-stock-pro354.casos.ts` | `p354` | `verificarCasosPoliticaStockPro354` |
| 45 | `lib/facturacion/puntos.casos.ts` | `pun` | `verificarCasosPuntos` |
| 46 | `lib/facturacion/rediseno.casos.ts` | `red` | `verificarCasosRediseno` |
| 47 | `lib/facturacion/revision-factura.casos.ts` | `rvf` | `verificarCasosRevisionFactura` |
| 48 | `lib/facturacion/secuencias.casos.ts` | `sec` | `verificarCasosSecuencias` |
| 49 | `lib/facturacion/series.casos.ts` | `ser` | `verificarCasosSeries` |
| 50 | `lib/facturacion/stock-e02.casos.ts` | `e02` | `verificarCasosStockE02` |
| 51 | `lib/facturacion/stock-preventivo.casos.ts` | `p330` | `verificarCasosStockPreventivo` |
| 52 | `lib/facturacion/visual-codigos-e05.casos.ts` | `e05` | `verificarCasosVisualCodigosE05` |
| 53 | `lib/facturacion/visual-v1.casos.ts` | `vis` | `verificarCasosVisualV1` |
| 54 | `lib/fiscal/aptitud-sifen.casos.ts` | `apt` | `verificarCasosAptitud` |
| 55 | `lib/fiscal/telefono.casos.ts` | `tel` | `verificarCasosTelefonoYCobro`, `verificarCatalogoMundial`, `verificarCatalogoC8C9C10`, `verificarCoherenciaYDivergenciasCatalogo` |
| 56 | `lib/formato/monto-visual.casos.ts` | `fmv` | `verificarCasosFormatoMonetarioPro335` |
| 57 | `lib/inventario/cruzados.casos.ts` | `icr` | `verificarCasosInventarioCruzados` |
| 58 | `lib/inventario/depositos.casos.ts` | `idp` | `verificarCasosInventarioDepositos` |
| 59 | `lib/inventario/movimientos.casos.ts` | `imv` | `verificarCasosInventarioMovimientos` |
| 60 | `lib/inventario/reposicion.casos.ts` | `irp` | `verificarCasosInventarioReposicion` |
| 61 | `lib/inventario/residuales.casos.ts` | `irr` | `verificarCasosInventarioResiduales` |
| 62 | `lib/inventario/stock.casos.ts` | `ist` | `verificarCasosInventarioStock` |
| 63 | `lib/listas-precio/estabilizacion.casos.ts` | `lpe` | `verificarCasosListasEstabilizacion` |
| 64 | `lib/listas-precio/listas-comerciales.casos.ts` | `lco` | `verificarCasosListasComerciales` |
| 65 | `lib/listas-precio/listas-r02.casos.ts` | `lp2` | `verificarCasosListasR02` |
| 66 | `lib/movimientos/historial.casos.ts` | `mvh` | `verificarCasosMovimientosHistorial` |
| 67 | `lib/movimientos/inicializacion.casos.ts` | `mvn` | `verificarCasosMovimientosInicializacion` |
| 68 | `lib/movimientos/intenciones.casos.ts` | `mvt` | `verificarCasosMovimientosIntenciones` |
| 69 | `lib/movimientos/intento.casos.ts` | `mvi` | `verificarCasosMovimientosIntento` |
| 70 | `lib/productos/catalogos-estabilizacion.casos.ts` | `cae` | `verificarCasosCatalogosEstabilizacion` |
| 71 | `lib/productos/documentos-archivos.casos.ts` | `arc` | `verificarCasosDocumentosProductos` |
| 72 | `lib/productos/estabilizacion.casos.ts` | `est` | `verificarCasosEstabilizacionProductos` |
| 73 | `lib/productos/fiscal.casos.ts` | `fis` | `verificarCasosFiscales` |
| 74 | `lib/productos/jerarquia-catalogos.casos.ts` | `jer` | `verificarCasosJerarquiaCatalogos` |
| 75 | `lib/productos/migraciones-fiscales.casos.ts` | `mig` | `verificarCasosMigracionesFiscales` |
| 76 | `lib/productos/productos-r02.casos.ts` | `pd2` | `verificarCasosProductosR02` |
| 77 | `lib/productos/productos.casos.ts` | `pro` | `verificarCasosProductos` |
| 78 | `lib/productos/sincronizar.casos.ts` | `sin` | `verificarCasosSincronizacion` |
| 79 | `lib/proveedores/cuentas-auditoria.casos.ts` | `cau` | `verificarCasosCuentasYAuditoria` |
| 80 | `lib/proveedores/documentos.casos.ts` | `dpr` | `verificarCasosDocumentosProveedores` |
| 81 | `lib/proveedores/estabilizacion.casos.ts` | `esp` | `verificarCasosEstabilizacionProveedores` |
| 82 | `lib/proveedores/gobernanza.casos.ts` | `gob` | `verificarCasosGobernanza` |
| 83 | `lib/proveedores/proveedores-r02.casos.ts` | `pr2` | `verificarCasosProveedoresR02` |
| 84 | `lib/proveedores/proveedores.casos.ts` | `prv` | `verificarCasosProveedores` |
| 85 | `lib/proveedores/reactivacion.casos.ts` | `rea` | `verificarCasosReactivacion` |
| 86 | `lib/reportes/export-xlsx.casos.ts` | `rxl` | `verificarCasosExportacionXlsx` |
| 87 | `lib/reportes/kardex.casos.ts` | `rkd` | `verificarCasosReportesKardex` |
| 88 | `lib/reportes/lotes.casos.ts` | `rlo` | `verificarCasosReportesLotes` |
| 89 | `lib/reportes/stock-critico.casos.ts` | `rsc` | `verificarCasosReportesStockCritico` |
| 90 | `lib/reportes/stock-general.casos.ts` | `rsg` | `verificarCasosReportesStockGeneral` |
| 91 | `lib/reportes/valorizacion.casos.ts` | `rva` | `verificarCasosReportesValorizacion` |
| 92 | `lib/reportes/ventas-layout.casos.ts` | `p337` | `verificarCasosVentasLayout` |
| 93 | `lib/stock/alcance-c24.casos.ts` | `sc24` | `verificarCasosStockAlcanceC24` |
| 94 | `lib/stock/carga-instancia.casos.ts` | `sci` | `verificarCasosStockCargaInstancia` |
| 95 | `lib/stock/stock-reposicion.casos.ts` | `srm` | `verificarCasosStockReposicionMovimientos` |

Archivos: 95; módulos cargados: 95; suites invocadas: 98; sin registrar: 0

Los tres registrados en R02: `stock-preventivo` (`p330`), `consulta-automatica-fe` (`p338`), `ventas-layout` (`p337`). Ningún resultado de ejecución se afirma: la primera ejecución será la CI automática.

## 4. Matriz de aceptación (BUILD-R01 §8 + ajustes R02)

| # | Criterio | Implementación | Estado |
|---|---|---|---|
| 1 | `tsconfig.build.json` no lista casos ni `contador-casos` | `exclude` + `verificar-separacion.sh dependencias` (`tsc --listFilesOnly`) en `typecheck-app` | Escrito; verificación en 1.ª CI |
| 2 | Error de tipos solo en un caso falla `casos` y no app/build/imagen | casos fuera de `tsconfig.build.json` y del contexto Docker; job `casos` separado; `liberacion` falla | Diseño estático; prueba negativa NO realizada (sin defectos sintéticos en la rama, orden) |
| 3 | Error de tipos en la app falla typecheck-app, build, imagen y gate | strict heredado, sin `ignoreBuildErrors`; `next build` en `build` e `imagen` | Diseño estático; prueba negativa NO realizada |
| 4 | Import app→caso falla con mensaje explícito | tsc incluye importados aunque estén excluidos → `dependencias` falla | Diseño estático; prueba negativa NO realizada |
| 5 | 95 casos, contador y runner versionados, ninguna comprobación eliminada | solo se tocó `run.js` (registro/inventario) | Cumplido por diff |
| 6 | `node --check run.js` pasa; monedas y monto-visual separadas | `mon` (monedas) / `fmv` (monto-visual) | Verificado: `node --check` OK |
| 7 | Exit ≠ 0 ante fallo/excepción de carga; 0 solo si todo pasa | `process.exitCode`, `.catch`, resultado inválido, excepción al contar | Escrito; prueba negativa NO realizada |
| 8 | Todo `*.casos.ts` registrado o fallo | inventario automático (sin lista de aislados: los 95 registrados) | Escrito; inventario estático 95/95 |
| 9 | Imagen y contexto sin casos/contador/.tmp-casos/runner/documentación | `.dockerignore` + `builder` e `imagen` en CI | Escrito; verificación en 1.ª CI (H3 pendiente hasta entonces) |
| 10 | Diff sin app/components/lib/types/migraciones/SQL/datos/workflows banco | allowlist | Cumplido por diff |
| 11 | `nexit-app-ci` en push/PR; verde requisito antes de construir en VM | workflow + compuerta `liberacion` | Escrito; la regla operativa de la VM la aplica el responsable |
| R02-a | Jobs de imagen independientes de casos/lint | `imagen` sin `needs` | Escrito |
| R02-b | Gate conjunto falla si un control falla/omite/cancela | `liberacion` con `always()` y `result == success` por job | Escrito |
| R02-c | SHA exacto; merge sintético vs push | resumen del gate | Escrito |

**Pruebas negativas (diseño, no ejecutadas):** en una rama o fixture descartable autorizado posteriormente: (a) error de tipos en un `*.casos.ts` → falla `casos`, pasan `typecheck-app`/`build`/`imagen`, falla `liberacion`; (b) error de tipos en `lib/` operacional → fallan `typecheck-app`, `build`, `imagen`, `liberacion`; (c) `import` de un caso desde una ruta → falla `verificar:dependencias` (y `imagen`/`standalone` si llegara a trazarse); (d) suite que devuelve fallos / lanza / archivo `*.casos.ts` nuevo sin registrar → runner exit 1.

## 5. Riesgos y pendientes

- Primera ejecución real de typecheck de casos, runner (95 suites + 3 nuevas), lint de app y de casos: estado **desconocido**; los fallos que aparezcan se reportan y requieren órdenes focales (no se corrigen en R02).
- `next typegen` (Next ≥ 15.5) se asume disponible en 16.2.6; si la CI lo rechaza, se reporta.
- Next puede reescribir `tsconfig.build.json` durante el build si echa en falta opciones; se repitió `include` para evitarlo. Verificar en la CI que no hay diff tras el build.
- Fallas T01/T25/T26/V0/C1 del banco siguen en su cola independiente.
