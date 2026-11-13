# AUD-NEXIT-KARDEX-DESKTOP-R01 — auditoría independiente por función: Kardex de movimientos

**Fecha:** 18/10/2026. **Módulo:** Reportes → Kardex de movimientos, ruta `/reportes/kardex`. **Rama:** `feature/NEXIT-2026-001-banco-demo`.
**Dictamen:** AUDITORÍA ESTÁTICA DOCUMENTADA CON HALLAZGOS ABIERTOS — **NO HOMOLOGADO**. No se autoriza implementar correcciones en Claude ni cambiar código funcional, SQL o migrations.
**Fuente verificable:** lectura de los protocolos actuales `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, `REPORTES-V1-ALCANCE-APROBADO.md`, progreso pertinente, historial completo de la ficha `AUD-REPORTE-KARDEX-V1.md` (AUD-KDX-R01…R05), índice, y auditoría transversal RPT-D01/D02; lectura directa de las fuentes del código actual de la rama. **Corte de blobs:** `lib/reportes/kardex.ts` `961e2c4506740c1bddccc4adb07d3a73a0036d3e` (336 líneas); `lib/reportes/kardex-plan.ts` `5f86abeaf1cd9ce629833635c67684890931b436` (177); pantalla `app/(private)/reportes/kardex/page.tsx` `a2b8c3be50585a5abf1cab77d233ac9042e036a5` (423); exportador `lib/reportes/export-kardex.ts` `3f373218fd0fefd4c682ab983942742a455af305` (173); casos `lib/reportes/kardex.casos.ts` `b2715d87908f3fdf68678dbdd252f75cbfd75dad` (971). Blob SHA no es HEAD/deploy de VM.
**Material inspecionado:** pantalla completa con filtros/2 vistas/tabla y detalle expandido; GET y GET /exportar, serialización cliente, parseo, fuentes SQL de saldo y conciliación, tipo de propiedad, agregados, labels por unidad, exportación XLSX/PDF, permisos/alcance/snapshot, NEX-052 fallback, casos existentes con emulador. No se ejecutaron tests, HTTP, PostgreSQL, VM, Docker, browser, PDF/Excel externo, build, tsc ni CI manual. ERP exclusivamente desktop (no pedir 375px móvil).

## 1. Función exclusiva del reporte y límites

**Pregunta que responde:** «¿Qué movimientos han modificado cada posición de inventario, quién los registró, en qué orden, con qué efecto sobre DISPONIBLE/RESERVADO/CUARENTENA, y cómo se explica el saldo histórico por producto, depósito, lote, propiedad, propietario y unidad de medida?»

**No sustituye:** `Inventario → Movimientos` (motor que escribe/aprueba/anula movimientos), `Inventario → Stock` (fotografía actual), `Reportes → Stock general` (saldos cuantitativos), `Reportes → Valorización` (inventario patrimonial a costo real) ni `Inventario → Reposición` (planificación). Kardex es un **libro de solo lectura con conciliación**, no registra ni corrige cantidades; no reconstruye saldo valorizado histórico a partir del costo actual.

**Contratos observados:**
- **Secuencia:** `movimientos_inventario` + `movimiento_lineas` forman efectos de cada movimiento; ventana SQL por producto×depósito×lote×PROPIO/TERCERO×propietario×`unidad_id`; orden por número, fecha de línea, ID y lado. Saldo acumulado calculado sobre la **historia completa**, nunca reiniciado por página.
- **Fecha:** filtros Desde/Hasta usan fecha de **registro** en zona `America/Asuncion`. Fecha propia del movimiento se rotula si retroactiva.
- **Movimientos:** ENTRADA/SALIDA y ajustes afectan físico; transferencias generan ambos lados en depósitos respectivos con el mismo número y solo muestran la contraparte nominal si pertenece al alcance; RESERVA, LIBERACION_RESERVA, CUARENTENA y LIBERACION_CUARENTENA modifican estados internos, no el físico.
- **Anulación:** conserva el asiento original marcado ANULADO, más otro inverso vinculado; ambos efectos participan del libro; no borrar registros.
- **Propiedad:** propios y terceros se separan físicamente y también por propietario; costos solo para PROPIO, y en transferencias el costo únicamente en el lado de salida.
- **Unidad histórica:** consulta disponibilidad de `producto_unidad_base_historial` (NEX-052) por `to_regclass`; si existe toma UUID de unidad vigente en instante registrado; si no, usa unidad actual, con nota expresa. No asumir migration aplicada en VM ni usar códigos SIFEN como identidad.
- **Agregados:** `KardexGrupo` y SQL agrupan por UUID físico de unidad, propiedad y propietario; los totales no mezclan medidas incompatibles. Etiquetas de unidades homónimas se desambiguan de acuerdo con AUD-KDX-R05; propiedad terceras presenta defecto NUEVO de rótulo (KDX-D03).
- **Cuadre:** `saldoInicial + movimientos del período (incluyendo fuera de filtro) = saldoFinal` por grupo, y conciliación separada contra `stock_saldos` dentro del mismo snapshot; no confundir identidad del libro con concordancia patrimonial de Stock.
- **Exportaciones:** Excel/PDF leen todos los resultados de filtros vigentes con nueva instantánea/permiso, topes 50.000; PDF largo se divide en bloques conservando columnas ancla; conteos/histórico coinciden con snapshot propio del archivo, no necesariamente la foto anterior de la pantalla.

## 2. Cobertura por función y archivo

| Área | Evidencia fuente | Resultado del examen estático |
| --- | --- | --- |
| Entrada y permisos | `lib/navigation/menu.ts`; `app/(private)/reportes/layout.tsx`; `app/api/reportes/kardex/route.ts:8–29` | `REPORTES.VER` obligatorio. GET usa empresa+actor de sesión, no tenant de URL |
| Exportación protegida | `app/api/reportes/kardex/exportar/route.ts:9–38`, `lib/reportes/guard.ts` | `REPORTES.VER+EXPORTAR` también en servidor; 401/403/503 por guard |
| Alcance | `lib/reportes/alcance.ts:9–20`, `kardex.ts:88–91,106–107,160–162,240–242` | Solo saldos de depósitos autorizados, activos e inactivos; contraparte no accesible no revela nombre |
| Libro físico | `kardex.ts:128–164,221–258` | Efectos, ventanas, saldo por dimensiones y costos registrados sin float |
| Filtros cliente/API | `page.tsx:22–100,161–242`; `kardex.ts:41–77,110–126` | 2 vistas, período, producto, depósito, tipo, usuario, documento, estado, estado afectado, lote, paginación; KDX-D01/D02 |
| Saldo anterior/período | `kardex.ts:166–189` | Totales por grupos desde historia anterior; movimientos de filtro y fuera de filtro diferenciados |
| Conciliación | `kardex.ts:190–211`, `page.tsx:282–289` | FULL JOIN contra Stock de misma foto; KDX-D05 texto atribuye causa que no puede deducir |
| Unidad histórica | `kardex.ts:93–104,152–163,180–187,259–304` | UUID en particiones/agregados y en resumen; fallback NEX-052 documentado |
| Usuarios del filtro | `kardex.ts:310–314`, `page.tsx:221–226` | **KDX-D04:** catálogo considera todos los movimientos de la empresa, no los depósitos del alcance |
| Propietarios | `kardex-plan.ts:19–27,47–70`; `page.tsx:264,333–357,382–388` | Los saldos son separados por UUID interno; **KDX-D03:** rótulo de terceros abrevia UUID a ocho caracteres |
| Reporte/Excel/PDF | `lib/reportes/export-kardex.ts:27–173`; exportador compartido | Dos diseños; rótulos de unidades homónimas compartidos UI/XLSX/PDF, moneda de costos, totales por grupo, detalles y PDF ancho |
| Validación JSON | `lib/reportes/kardex-plan.ts:124–176`, `lib/reportes/cliente-kardex.ts:19–36` | HTTP/forma, campos numéricos exactos y vigencia de página; errores limpian datos; protege respuestas fuera de orden iniciadas |
| Casos históricos | `lib/reportes/kardex.casos.ts:1–971`, auditorías R01…R05 | Emulador pruebas KDX-T01…10, transferencia, anulación, NEX-052, UUID homónimos de unidad, XLSX/PDF, 50.001, alcance; no cubre rótulo de propietario con colisión ni catálogo de usuarios aislado |

## 3. Hallazgos vigentes — sin multiplicar transversales ni reabrir R05

### KDX-D01 — ALTA HEREDADA de RPT-D01 — filtro de texto normalizado en API, no en cliente
**Evidencia:** `kardex.ts:70–71` aplica `trim().slice(0,80/60/40)` a `q`, `documento`, `lote`; `page.tsx:36–43` estabiliza texto crudo 300ms; `kardex-plan.ts:124–130` exige igualdad exacta de API y filtros aplicados. GET `q="MOV "` se convierte en `"MOV"` y la respuesta legítima queda oculta (`actual=null`), tanto en Detalle como Resumen.
**Corrección futura:** normalizador puro compartido cliente+API+igualdad, sin relajar compuerta ni validaciones; pruebas textos con espacios iniciales/finales, solo espacios, longitud +1, q/documento/lote, XLSX/PDF. **Ya contabilizado como RPT-D01; no añadir otra ALTA al acumulado global.**

### KDX-D02 — MEDIA HEREDADA de RPT-D02 — resultados/descargas anteriores visibles durante debounce
**Evidencia:** `page.tsx:36–43,77–85,123–134,138–159` mantiene `textoAplicado` anterior 300ms tras escribir nueva búsqueda `q`, `documento` o `lote`; hasta entonces `actual` puede seguir vinculando filas/totales y permisos/exportación del filtro anterior. Compuerta `:45–69` solo invalida al programar nuevo fetch.
**Corrección futura:** marcar búsqueda pendiente inmediatamente, invalidar o rotular resultados/exportación de la foto anterior sin disparar GET por tecla. Probar 0ms,100ms,300ms, A/B + GET tardío, error B, dos vistas. **Ya contabilizado como RPT-D02.**

### KDX-D03 — MEDIA NUEVA — dos propietarios TERCERO distintos pueden tener el mismo rótulo visible, aunque su saldo está separado por UUID
**Evidencia:** `kardex-plan.ts:19–24` devuelve `Tercero ${propietarioId.slice(0, 8)}`; `:26–27,47–70` usa todo el UUID en `claveGrupo`, por lo que las sumas físicas no se mezclan. El API `kardex.ts:249–257,302–306` únicamente transporta `propietario` **ya truncado**, sin `propietarioId` en `KardexFila/KardexResumenFila/KardexGrupo` (`types/reportes.ts:209–330`). La pantalla utiliza `textoPropiedadFila` en `page.tsx:264,335–357,383`, y el exportador `export-kardex.ts:22,58,82,105–107,138–164` reutiliza el mismo rótulo.
**Escenario permitido:** dos `propietario_id` diferentes (por ejemplo `12345678-aaaa-...` y `12345678-bbbb-...`) aparecen ambos como «Tercero 12345678». El libro conserva dos saldos internos, pero las líneas de dos propietarios se ven como si fueran de uno en la tabla, los totales y Excel/PDF. **Defecto confirmado por el formato del rótulo; no se ha verificado colisión real en VM.**
**Criterio:** desambiguar propietario con identificador único en el alcance efectivo (idealmente UUID completo si hay colisión o representación inequívoca derivada), preservando seguridad y privacidad de identidades, y sin sumar los propietarios ni mezclar atributos por accidente. Considerar transportar UUID bruto internamente a la API y derivar etiqueta compartida en pantalla/exportador; mantener «Tercero (propietario no registrado)» para NULL. Ejercitar dos IDs distintos con prefijo idéntico, dos unidades iguales, depósitos y lotes distintos, propiedad propia, totales, Excel/PDF y detalle expandido, sin exponer terceros fuera del alcance.

### KDX-D04 — MEDIA NUEVA / alcance de metadatos — lista de usuarios incluye operadores sin movimientos visibles al usuario actual
**Evidencia:** `kardex.ts:310–314` construye `catalogos.usuarios` mediante `SELECT u.id,u.usuario FROM usuarios u WHERE u.empresa_id=$1 AND EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id=$1 AND m.creado_por=u.id)`. **No aplica** `deps` ni consulta `movimiento_lineas`/depósitos de los efectos autorizados. `page.tsx:221–226` exhibe todos esos nombres y `export-kardex.ts:35` puede describirlos en filtros. En contraste, el libro real (`kardex.ts:160–162`) filtra depósitos.
**Caso:** operador puede ver solo depósito A; usuario B ha registrado movimientos únicamente en depósito X, fuera del alcance. Su nombre aparece en el selector de usuarios pese a que su selección nunca mostrará líneas autorizadas. La empresa permanece aislada por `empresa_id` — **no es fuga interempresa ni de movimientos o saldos**, solo exposición/descontextualización de catálogo intratenant bajo alcance parcial. Requiere confirmar si la política autorizaba visibilidad de nombres de todos los operadores; defecto UX de relevancia aun con catálogo empresarial público.
**Criterio:** catálogo de autores restringido a movimientos que tengan al menos un efecto en `deps` autorizado (teniendo en cuenta ambas puntas de transferencia), **o** decisión explícita de catálogo corporativo global con mensaje de alcance. Probar usuario solo en A, solo en X, transferencias A↔X, inactivos permitidos, usuario con alcance TODOS, empresa distinta, `usuarioId` no válido y filtros persistidos, sin ampliar consulta del libro.

### KDX-D05 — BAJA NUEVA — mensaje de conciliación afirma una causa que el algoritmo no diagnostica
**Evidencia:** `page.tsx:282–286` muestra, si `!conciliado`, el texto «(stock cargado fuera del libro de movimientos)». `kardex.ts:190–211` calcula `divergentes` por FULL JOIN de sumas de efectos contra `stock_saldos`; la consulta **detecta diferencia numérica**, pero no clasifica causa.
**Consecuencia:** cualquier inconsistencia histórica, rollback parcial, desajuste de fuente, operación fuera del motor, error de costo/unidad heredado o dato de migración podría ocasionar diferencia; no hay evidencia suficiente para atribuirla automáticamente a «stock cargado fuera del libro». La nota de exportación `export-kardex.ts:140–142` es más neutral.
**Criterio:** mensaje «El libro no coincide con Stock; revisar el origen de la diferencia» sin diagnóstico prematuro, mantener cifras y advertencia de saldos no confiables. Caso de libro con 1 divergencia por discrepancia de stock y sin atribución causal; preservar mensaje «Conciliado» para cero diferencias.

**Recuento individual:** 1 ALTA heredada + 1 MEDIA heredada + **2 MEDIAS NUEVAS + 1 BAJA NUEVA**; las dos heredadas ya se contabilizaron a nivel de módulo. En el acumulado de auditorías separadas de Reportes después de Stock general y Valorización, incrementar únicamente **+2 MEDIAS +1 BAJA**: **2 ALTAS +5 MEDIAS +2 BAJAS** en total (transversales + nuevos locales).

## 4. Riesgos/condiciones sin bug nuevo confirmado

- **KDX-O01 — NEX-052 operativo:** `to_regclass` protege tabla inexistente, pero no prueba integridad del historial de cambios ni su aplicación en PostgreSQL real. Probar una unidad modificada con saldo cero y cambios antes/durante/después del período. Nunca tocar códigos de unidad SIFEN 108/87 por esta auditoría.
- **KDX-O02 — interpretación de CUADRA:** `cuadra` es identidad del propio libro respecto de sus efectos; puede cuadrar matemáticamente aunque `conciliacion.conciliado=false` respecto de Stock. Los dos indicadores se presentan separados; la distinción debe quedar clara en pruebas visuales, evitando interpretar «Cuadra» como prueba de inventario correcto.
- **KDX-O03 — período y retroactivos:** numeración y registro crean orden, no fecha del movimiento; comprobar fechas/sucesión reales incluyendo movimientos retroactivos y fecha límite Paraguay. No afirmar reconciliación histórica sin control de migraciones.
- **KDX-O04 — tamaño/consulta:** las CTE y ventanas recorren histórico y `tq` agrupa dimensiones; `MAX_FILAS_EXPORTACION=50000` limita líneas exportadas pero no necesariamente historia intermedia, grupos y tiempo. Requiere perfilado con datos autorizados, no inventar tiempos de respuesta ni resultados.
- **KDX-O05 — parser de paginación:** `Math.floor(Number(sp.get("pagina")))` tolera no finitos (`Infinity`), que pueden llegar a OFFSET no apto para PG; probar seguridad y respuesta 400/500 para parámetros anormales. No reproducido ni elevado a exploit.
- **KDX-O06 — catálogo/sucursal:** `depositosDelAlcance` cruza empresa+asignaciones pero no interseca explícitamente sucursal; confirmar política TODOS/sucursal común a Inventario/Depósitos antes de clasificar exposición.
- **KDX-O07 — PDFs muy anchos:** PDF distribuido en bloques con anclas y cifras exactas; límites de espacio/hora/formato ya documentados históricamente, probar un PDF real largo con propietario y UUID desambiguados. No reabrir limitaciones conocidas solo por inspección.
- **KDX-O08 — filas sin actividad en período:** la vista Resumen puede incluir saldos iniciales históricos aunque no haya movimientos del período, por decisión explícita para conservar saldos; no etiquetar como datos duplicados por defecto.
- **KDX-O09 — fuente actual vs captura:** cada exportación obtiene nueva instantánea independiente; una modificación posterior a la pantalla puede cambiar totales legítimamente.

## 5. Matriz de pruebas dirigidas para la futura fase autorizada

| Prueba | Objetivo |
| --- | --- |
| KDX-IND-T01 | Producto en A con entrada/salida/ajuste y cancelación: saldo exacto acumulado, asiento original e inverso presentes |
| KDX-IND-T02 | Transferencia A→B con usuario solo A: no revelar nombre de B; otra sesión con A+B: dos efectos y costo una vez |
| KDX-IND-T03 | Reserva/cuarentena/liberación: saldo físico constante, estados correctos y filtro de «estado afectado» |
| KDX-IND-T04 | 2 propietarios terceros con **mismos 8 caracteres iniciales**: dos nombres inequívocos y dos saldos independientes en pantalla, resumen, XLSX/PDF |
| KDX-IND-T05 | Usuario limitado a A y otro autor solo de B: selector de usuarios conforme política aprobada, transferencias A↔B y empresa distinta |
| KDX-IND-T06 | Divergencia Stock 5 vs libro 4: alerta neutra, conciliación no confiable, cuadre interno explicado por separado |
| KDX-IND-T07 | NEX-052 aplicada/no aplicada, cambio histórico unidad, homónimos de unidad con UUID y prefijos/sufijos parecidos, largo PDF |
| KDX-IND-T08 | Filtros q/documento/lote con espacios y límites, debounce 300ms, respuestas fuera de orden, errores/200 incompleto |
| KDX-IND-T09 | Fecha de registro frente a movimiento retroactivo, saldo inicial no reiniciado, sin movimientos en período y con saldo |
| KDX-IND-T10 | Filtros por usuario/tipo/estado: fuera del filtro reconcilia variación, y paginación 50 no altera saldos |
| KDX-IND-T11 | Decimal exacto 0.1+0.2, unidades heterogéneas, propietarios, 0/NULL y cambio de estado |
| KDX-IND-T12 | 50.000/50.001 filas, Exportar VER+EXPORTAR, 401/403/503/413, nombre de archivo, PDF bloques y XLSX |
| KDX-IND-T13 | 2 empresas, deposito ASIGNADOS/TODOS e inactivo; acceso a UUID ajeno 403, sin nombres/saldos fuera de permiso |
| KDX-IND-T14 | Uso desktop real 1440/1920, tabla 22 columnas, detalle abierto, scroll horizontal, foco, cards y filtros |

## 6. Cierre

**Hallazgos abiertos del Kardex actual:** **1 ALTA heredada, 3 MEDIAS (1 heredada, 2 nuevas), 1 BAJA nueva; 9 observaciones no confirmadas.** Las correcciones históricas **KDX-01…09, R02…R05 permanecen preservadas**, especialmente sumas por UUID, rendimiento de etiquetas de unidad, transferencia/anulación, libro desde origen, saldo acumulado por orden histórico, snapshot, aislamiento del ledger y XLSX/PDF por grupos. Ninguna nueva regresión del algoritmo de saldo quedó probada; tres nuevos defectos se sitúan en presentación/alcance de catálogos/diagnóstico. La homologación humana sigue pendiente. No ejecutar VM, Postgres, migration ni CI manual; no liberar implementación a Claude durante revisión de menús. **Próximo reporte individual cuando lo solicite el responsable: Stock crítico y reposición.**
