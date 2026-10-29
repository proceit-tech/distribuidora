# ORDEN ÚNICA ACTIVA PARA CLAUDE — PRO-335 P0 — PRECISIÓN MONETARIA EN TODAS LAS PANTALLAS

**Fecha:** 29/10/2026. **Tipo:** desarrollo focal transversal de presentación monetaria; no cambios fiscales ni de persistencia.  
**Issue:** [PRO-335](https://linear.app/proceit/issue/PRO-335), **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329), **etapa visual posterior NO AUTORIZADA:** [PRO-337](https://linear.app/proceit/issue/PRO-337).  
**Auditoría cerrada de origen:** [AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md).  
**Repo:** `proceit-tech/distribuidora` · **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Analista / gestor de Linear / auditor independiente:** ChatGPT · **desarrollador de código:** Claude · **VM/DB/gateway/deploy/homologación:** operador humano.

**IMPORTANTE: Esta orden reemplaza el gate «ninguna orden activa» como decisión NUEVA explícita. No autoriza PRO-337, ni ninguna otra issue.**

## 1. Decisión de negocio obligatoria

En **TODAS LAS PANTALLAS DEL NEXIT** (incluidos widgets, tablas, totales, KPI, líneas, formularios en modo resumen, pestañas, detalles y modales):

- **Importe MONETARIO PYG / Gs. / GS / GS. / guaraníes:** mostrar **0 dígitos decimales**, separador de miles `.`, redondeo `mitad hacia arriba` desde texto decimal exacto. Ejemplo: `142090.90909092 → 142.091`; `1420909.09090908 → 1.420.909`; `3661500.00 → 3.661.500`. Símbolo/código monetario visible de acuerdo al componente actual; evitar duplicarlo si el bloque ya muestra «PYG».
- **Importe MONETARIO USD:** mostrar como **máximo 2 decimales**, usando **dos posiciones fijas cuando se muestran centavos** (ej. `1234.5 → 1.234,50`, `1234.56789 → 1.234,57`, `0 → 0,00` si es un importe en USD). BRL continúa con 2 decimales conforme política actual.
- **Negativos:** signo correcto; jamás `-0`. Nulos, texto inválido o ausencia de permiso no se vuelven `0`. No fabricar monto desde falta de datos. La moneda debe ser la de CADA VALOR/FILA, nunca la moneda de filtro, página o empresa cuando no corresponde.
- **NO son importes monetarios:** cantidad física de stock, cantidad facturada/fraccionaria, precio/costo editable con precisión contractual, porcentaje/descuento en %, tasa de cambio, costo base almacenado, alícuota, identificador, GTIN/código SKU, RUC/CDC, fecha ni número documental. No suprimir sus decimales significativos ni convertir códigos con cero inicial en números.
- **REGLA FISCAL INMUTABLE:** el redondeo de la pantalla **NO** cambia en ningún caso `numeric` de PostgreSQL, datos de API, `JSON/XML` SIFEN, total/IVA base, totales exactos, tasas, cálculos, liquidación de FE/NCE, pagos, descuentos, stock, facturas históricas, reintentos, CDC o PDF KuDE del gateway.
- **Cálculo de indicadores:** usar el total EXACTO preexistente y formatear SOLO al final. No construir importe neto restando valores ya redondeados visualmente; un gap visual de 1 Gs entre celdas redondeadas no autoriza modificar el cálculo fiscal.

## 2. Diagnóstico comprobado por ChatGPT — NO redefinir la regla

- `lib/reportes/formato.ts::fmtDinero` hoy imprime todos los decimales de `numeric` (causa del `142.090,90909092` visto en Informe de Ventas). Además `fmtCantidadTexto` depende del helper, **por tanto no cambiar `fmtDinero` para que trunque cantidades**. Separar explícitamente formato MONETARIO por moneda de formato CANTIDAD.
- `app/(private)/reportes/ventas/page.tsx::CeldasImportes` solo recibe `VentasImportes`, sin `moneda`: al hacer el cambio, pasar la divisa en todas sus vistas/filas. `Resumen`, KPIs, `No computan`, `Anomalías`, documentos, productos, clientes, vendedores y meses deben respetar moneda por registro; PYG y USD pueden coexistir en el mismo informe.
- `lib/formato/monto-visual.ts::formatearMontoVisual` ya tiene redondeo de texto 0 PYG / 2 otras monedas. `lib/inventario/decimal.ts::formatearMontoTexto` duplica parte de esa lógica, `lib/dashboard/formato.ts::montoTexto`, `lib/formato/listas.ts::formatearMonto`, `lib/listas-precio/calculos.ts::formatoMoneda` son formatos paralelos. Buscar una única semántica visual sin reescribir cálculos ni conversiones: no hacer refactor indiscriminado.
- `app/(private)/documentos/page.tsx::importe` usa `Number(d.total).toLocaleString`, con riesgo de pérdida de precisión; para importes `numeric` recibidos como texto, evitar pasar a `Number`.
- `app/(private)/reportes/{valorizacion,kardex,stock-critico}/page.tsx` usan `fmtDinero` sin moneda; dashboard, inventario, compras, productos y listas de precios tienen formateadores propios, con cifras monetarias que deben ser revisadas para todo el alcance.
- **PRO-337 es otra tarea**: tarjeta `No computan` cortada por `overflow:hidden`, títulos largos, responsive y scroll local. **NO cambiar su CSS/layout aquí.** Al corregir decimales el KPI puede ocupar menos espacio, pero eso no constituye resolución del corte.

## 3. Implementación obligatoria por subsistema

**3.1. Núcleo visual:** reutilizar/extender `lib/formato/monto-visual.ts` o añadir helper pequeño para `numeric` TEXTUAL exacto, con normalización explícita de alias PYG/GS y monedas USD/BRL. No usar `Number`, `parseFloat`, `toFixed` o `Intl.NumberFormat` para transformar el importe textual exacto. Redondeo puramente decimal: empate mitad hacia arriba también para negativos. El helper debe distinguir ausencia `—` de valor real `0`, importar sin ciclos y tratar entradas imprevistas sin fabricarlas.

**3.2. Informes:** `lib/reportes/formato.ts` debe disponer de dos caminos explícitos, p. ej. `fmtImporteMoneda(valor, moneda)` y `fmtCantidadTexto(valor)`, sin cambiar el valor subyacente. Adaptar TODAS las referencias monetarias en `ventas/page.tsx` (KPIs, tabla RESUMEN, DOCUMENTOS, PRODUCTOS, CLIENTES, VENDEDORES, MESES, totales, anomalías, estados). Pasar `moneda` a `CeldasImportes`; ninguna celda recibe moneda ambigua. Revisar Valorización, Kardex y Stock Crítico, usando moneda fiscal de cada registro o base de la empresa donde corresponda. Conservar stock GENERAL/LOTES como **cantidades exactas**, no confundirlas con importe.

**3.3. Flujo comercial:** revisar Dashboard, Documentos Electrónicos, Facturas, Notas de Crédito, pagos visibles, tabla de Productos, Listas de Precio y sus componentes/pestañas. Sustituir los formateadores incorrectos SOLO en los campos realmente monetarios; los inputs de valor/moneda o cálculos de precios no deben modificarse. Respetar signos NCE, moneda visual correcta por fila y límites de campos SIFEN.

**3.4. Inventario/compras:** revisar Stock General/Detalle, Movimientos/Detalle, Compras Entradas/Detalle/Alta, Reposición, Recepciones y reportes de valorización/kardex: únicamente totales/importes/costos VISUALES. El costo unitario puede tener valor exacto de 4 decimales en su CAMPO editable y en la lógica de coste; si el contexto exige detalle técnico/auditoría no suprimirlo sin una alternativa visible de precisión. Cantidades/stock decimales fraccionarios NO se redondean a 0/2 por ser PYG o USD. Módulos solo DEMO (`recepciones-storage`) no se presentan como operativos; sin inventar banco real.

**3.5. Rutas sin importes:** verificar y registrar `Sin campos monetarios`; no modificar artificialmente Clientes, Proveedores, Catálogos o permisos para aparentar cobertura. Revisar también componentes de detalle/modal no expuestos en `page.tsx`.

**3.6. Trazabilidad:** crear en código (no documentos de gestión) los casos focales de formato con tablas de entrada/salida, por ejemplo `lib/formato/monto-visual.casos.ts` o equivalente ya existente. Al entregar, incluir en la respuesta una **matriz de pantallas**: ruta/componente, campo monetario, formatter anterior, formatter final, moneda resuelta, afectado/no afectado y motivo. Inventariar TODAS las rutas activas; aclarar las DEMO y las sin valores monetarios.

## 4. Tabla de aceptación obligatoria (casos como código, NO ejecutar)

| Moneda/tipo | Input TEXTUAL original | Resultado esperado en la pantalla |
|---|---|---|
| PYG | `142090.90909092` | `142.091` |
| PYG | `1420909.09090908` | `1.420.909` |
| PYG | `3661500.00` | `3.661.500` |
| PYG | `0.49` | `0` |
| PYG | `0.50` | `1` |
| PYG | `-0.50` | `-1` |
| PYG | `-0.4` | `0` |
| USD | `1234.56789` | `1.234,57` |
| USD | `1234.5` | `1.234,50` |
| USD | `1.234` | `1,23` |
| USD | `1.235` | `1,24` |
| USD | `-1.235` | `-1,24` |
| USD | `0.00` | `0,00` |
| BRL | `42.1` | `42,10` |
| Cantidad (stock) | `1.2500` | `1,25` (sin moneda) |
| Cantidad (stock) | `0.0001` | `0,0001` (sin moneda) |
| Tipo de cambio | `7350.123456` | NO redondear por regla monetaria |
| Documento `codigo` | `000123-A` | NO convertir a número ni modificar |

También: 0 real frente a null, extremos muy largos, signo menos, moneda desconocida (no asumir PYG), mezcla PYG+USD en la misma tabla, FE/NCE en distintos signos, tabla completa Ventas incluyendo informes no computados/Anomalías, órdenes de magnitud y zoom responsive como verificación pendiente de homologación.

## 5. Archivos autorizados y prohibidos

**Solo archivos de formato y componentes de PANTALLA identificados en la auditoría**, dentro de:
- `lib/formato/{monto-visual.ts,decimal-texto.ts,listas.ts}` y casos relacionados;
- `lib/reportes/formato.ts`, `app/(private)/reportes/{ventas,valorizacion,kardex,stock-critico}/page.tsx`, y casos puntuales de formato;
- `lib/dashboard/formato.ts`, `app/(private)/dashboard/page.tsx`;
- `lib/inventario/decimal.ts` (solo PRESENTACIÓN), `app/(private)/{stock,movimientos,compras/entradas,recepciones,reposicion}/**/*.tsx` de contenido monetario real;
- `app/(private)/{documentos,facturas,notas-credito,productos,listas-precio}/**/*.tsx` con importes, y `lib/listas-precio/calculos.ts` SOLO para formato, sin modificar funciones de cálculo de precios;
- auxiliares NUEVOS de tests de formato o adaptador puro indispensable a la visualización.

**Fuera de edición:** `app/(private)/reportes/ventas/page.module.css`, `components/ui/lista-padrao/reporte.module.css`, layout PRO-337, componentes de formularios que cambien comportamiento funcional, helpers de cálculo/SIFEN, `lib/reportes/{ventas.ts,export.ts,export-ventas.ts,xlsx.ts,pdf.ts}`, todos los endpoints `app/api/**`, migrations/SQL, PostgreSQL, VM, certificados, KuDE/gateway, PRO-328/NEX-076, PRO-330, PRO-327, exportadores Excel/PDF y archivos de negocio/datos. **No modificar `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, Linear, análisis, planes o órdenes.** Si no es posible cumplir una regla sin cambiar archivo prohibido, PARAR y reportar bloqueo técnico concreto y la ruta, no ampliar por cuenta propia.

**NOTA de precisión:** presentar importes exactos redondeados solo en vista de lectura. Si un campo ya usa `formatearMontoVisual` con moneda correcta y resultado correcto, NO CAMBIAR ese archivo solo por uniformidad.

## 6. Protocolo de trabajo y entrega

1. Leer íntegros `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, [AUDITORÍA](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md), esta orden y fuentes involucradas. Confirmar `git status --short`, branch y fetch/merge **fast-forward**, preservando trabajo ajeno. Si árbol local tiene cambios/conflictos, PARAR sin descartar/stash.
2. Implementar **SOLO PRO-335** en el alcance de pantalla; preservar UI/UX, flujos fiscales, cantidades y valores almacenados. Escribir casos puntuales como código y matriz de cobertura en respuesta final.
3. **NO EJECUTAR** tests, lint, typecheck, build/CI manual, PostgreSQL/SQL, Docker/VM, gateway, FE reales, browser de producción ni deploy; en este proyecto la validación ejecutada y la aplicación operativa requieren autorização humana. No alterar ni anular CI automático existente. No declarar tests aprobados.
4. Un cambio focal, commit+push a la branch autorizada; reportar SHA COMPLETO, archivos modificados, casos escritos, resumen de pantallas cubiertas/no afectadas, bloqueos concretos y la frase **TESTES NÃO EXECUTADOS**; **PARAR** para auditoría ChatGPT.
5. PRO-337 se implementará únicamente con OTRA ORDEN NUEVA posterior a la auditoría PRO-335. No empezar PRO-337, PRO-333, PRO-332, PRO-331 ni otros tickets automáticamente.

**CRITERIO DE ÉXITO:** toda cifra de DINERO visual PYG sin decimales; USD máximo 2, sin un solo cálculo, impuesto, inventario, campo editable, código fiscal o dato exacto alterado.
