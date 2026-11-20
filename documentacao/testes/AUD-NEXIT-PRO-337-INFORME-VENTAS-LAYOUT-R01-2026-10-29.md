# AUD-NEXIT-PRO-337-R01 — Informe de Ventas: tablas sin recortes y cards responsivos

**Fecha:** 29/10/2026. **Analista/auditor independiente:** ChatGPT. **Desarrollador:** Claude.  
**Commit auditado:** [`137f49f1942550a6676643a2a41774bde1835815`](https://github.com/proceit-tech/distribuidora/commit/137f49f1942550a6676643a2a41774bde1835815).  
**Issue:** [PRO-337](https://linear.app/proceit/issue/PRO-337), paquete [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Orden de aceptación:** [ORD-CLAUDE-NEXIT-PRO-337-INFORME-VENTAS-CARDS-SIN-RECORTES](../ordens/ORD-CLAUDE-NEXIT-PRO-337-INFORME-VENTAS-CARDS-SIN-RECORTES-2026-10-29.md).  
**Evidencia de origen:** captura real de CASA MINGO del 29/10/2026 con «Importe informativo» recortado ANTES del desarrollo. No se dispone de una captura posterior al commit.

## 1. Dictamen

**CONFORME ESTÁTICAMENTE EN EL ALCANCE DE LOS SEIS REQUISITOS. NO HAY CORRECTIVO DE CÓDIGO COMPROBADO PENDIENTE. AÚN NO HOMOLOGADO VISUALMENTE NI DESPLEGADO POR ESTA AUDITORÍA.**

La revisión de los tres archivos del commit demuestra que los mecanismos de layout previstos existen y están acotados al Informe de Ventas. La inspección de source no prueba el resultado final del algoritmo de tamaño CSS en navegador; no se debe declarar que el usuario ya ve la columna ni cerrar como `Done`.

**Alcance del commit:**
1. `app/(private)/reportes/ventas/page.tsx`: reorganiza exclusivamente el bloque de las dos tarjetas informativas; títulos, textos, regiones/tablas accesibles, estilos locales. Preserva `actual.estados`/`actual.anomalias` y sus seis/cinco columnas.
2. `app/(private)/reportes/ventas/page.module.css`: sustituye rejilla uniforme por container queries con ancho asimétrico, fallback apilado y scroll horizontal local; fuentes/títulos compactos y altura natural.
3. `lib/reportes/ventas-layout.casos.ts` (NUEVO): 36 casos estructurales identificados `PRO337-01..36`, **NO EJECUTADOS**, suite **AISLADA**, sin conexión al runner `scripts/casos-clientes/run.js` por restricción de archivos de la orden original.

No se modificaron APIs, datos, cálculos de impuestos/IVA, reglas SIFEN, estado fiscal, stock, KuDE, PDF, Excel, migrations SQL, ni el CSS compartido `components/ui/lista-padrao/reporte.module.css`.

## 2. Verificación independiente de los seis puntos

| Punto | Código y regla comprobados | Veredicto |
|---|---|---|
| 1. La tabla no pierde `Importe informativo` | `page.tsx` conserva seis encabezados en orden y `fmtImporteMoneda(e.total,e.moneda)` íntegro; CSS remueve `overflow:hidden` de la tarjeta y añade wrapper `tablaScroll` | **CONFORME ESTÁTICO** |
| 2. Asignar más espacio al card de documentos | `@container informativo (min-width:1120px)` usa `grid-template-columns:minmax(0,2.2fr) minmax(0,1fr)` cuando no hay anomalías | **CONFORME ESTÁTICO** |
| 3. Apilar antes de recortar | Grilla base es `minmax(0,1fr)` y depende de ancho real `container-type:inline-size`; con anomalías en 1120–1459px se apilan, sobre 1460px se usa 1.3fr/1fr | **CONFORME ESTÁTICO** |
| 4. Scroll horizontal local accesible si no cabe | Ambas tablas `tablaChica` están dentro de un `div.tablaScroll` con `overflow-x:auto;max-width:100%;tabIndex=0;role=region;aria-label`; foco visible; no hay ancho global de tabla que fuerce la página | **CONFORME ESTÁTICO**; scroll real depende de anchura/render |
| 5. Títulos más breves con explicación | `Documentos no computados` y `Anomalías fiscales`, `h2 font-size:13px`, `header p font-size:12px`; conserva lista de estados y definición de anomalías excluidas, encabezados largos permiten dos líneas | **CONFORME ESTÁTICO** |
| 6. No estirar artificialmente panel de anomalías | `.informativoGrilla {align-items:start}` y sin `height/max-height` obligatorias; mensaje vacío permanece visible | **CONFORME ESTÁTICO** |

**Protección funcional:** permanecen `fmtNum(e.documentos)`, `fmtNum(e.enviados)`, `fmtImporteMoneda(e.total,e.moneda)` (PYG 0/USD 2 de PRO-335), `actual.estados.map` y `actual.anomalias.map`; botón «Ver los documentos con anomalía» conserva `cambiar({vista:"DOCUMENTOS",estado:"",situacion:"ANOMALIA"})`. No hay recorte de filas mediante `slice` ni remoción de estados/documentos.

## 3. Aspectos que NO se pueden certificar sin navegador

1. **Desktop sin scroll horizontal en la tabla** a 1120px de ancho de CONTENEDOR o con importes y textos extremos: `2.2fr` asigna aproximadamente `(1120−10)×2.2/3.2 ≈ 763px`, que fue estimado por los casos; las fuentes reales y números largos podrían elevar el ancho intrínseco. Existe fallback horizontal local que impide pérdida de información, pero **no demuestra la promesa «sin scroll en todo desktop»**. Verificar en 1366/1600/1920 con sidebar y datos largos.
2. **Container queries CSS** y condiciones combinadas `and` deben inspeccionarse con el navegador real, no por regex o estimaciones matemáticas de test.
3. `overflow-x:auto` junto a `overflow-y:visible` puede tener comportamiento computado dependiente del motor CSS; no se impone altura propia, pero scroll/barra real deben revisarse.
4. Móvil 360/768, zoom 125/200, teclado/tabulación, dos tablas con anomalías y valores largos; sin fotografía posterior, la pantalla original cortada **no prueba que esté corregida en el ambiente del cliente**.
5. La suite de **36 casos está solo escrita y no conectada al runner principal**. Una homologación posterior debe decidir cómo ejecutar/integrar los casos de modo permitido y hacer verificación visual con capturas.

**Esta auditoría NO ejecutó** tests, lint, typecheck, build, CI manual, PostgreSQL, SQL, VM, Docker, browser, gateway, emisión, migración ni deploy; no validó acceso de empresa/roles ni navegó el entorno real.

## 4. Estado y decisión

- **PRO-337**: mover a `In Review` por conformidad estática, **no** `Done`; sin orden correctiva R02 porque NO existe un defecto nuevo demostrado por diff.
- **Claude**: orden ejecutada en el SHA `137f49f1942550a6676643a2a41774bde1835815`, reconfirmada sin nuevas modificaciones; **NINGUNA ORDEN DE CÓDIGO ACTIVA** después de esta auditoría. No seguir automáticamente con PRO-333/331/332/334.
- **Próximo gate**: autorización operativa separada para pruebas/inspección visual, en ambiente accesible y con código de SHA adecuado desplegado; demostrar que la sexta columna está visible o alcanzable por scroll local sin recorte, que la tarjeta de anomalías no se estira y que títulos/cifras se leen correctamente. Sin esa evidencia no afirmar solución visual comprobada.
- **PRO-335** permanece `In Review` (auditoría estática R03; tests no ejecutados); PRO-328/330 `In Review`, NEX-076 solo versionada y NO aplicada; PRO-327 SQL 561 ya ejecutado con poscheck y NO se repite.

**Dictamen final R01: CONFORME ESTÁTICAMENTE, PENDIENTE DE TESTS Y VERIFICACIÓN VISUAL REAL, NO HOMOLOGADO.**
