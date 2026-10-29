# PLAN DE IMPLEMENTACIÓN CONTROLADA — CASA MINGO — 29/10/2026

**Fuente:** solicitudes reales de CASA MINGO recibidas el 29/10/2026. **Documento rector de auditoría:** [AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md](../analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md). **Coordinador:** [PRO-329](https://linear.app/proceit/issue/PRO-329).

**Separación de responsabilidades:** ChatGPT define reglas, registra y prioriza Linear, versiona especificaciones, audita commits. Claude **solo desarrolla una tarea expresamente habilitada** y entrega SHA/para; no actualiza Linear ni decide cambios comerciales. Operación humana realiza deploy/SQL/migrations/certificados y homologación. Cada tarea pasa por auditoría independiente del ChatGPT antes de otra orden.

## 1. Matriz de tareas sin duplicidad

| Etapa | Linear | Estado inicial | Alcance exacto | Tipo |
|---|---|---|---|---|
| 00 | [PRO-327](https://linear.app/proceit/issue/PRO-327) | **UI/API PENDIENTE; SQL 561 COMPLETADO** | Habilitar código alfanumérico/ceros en alta de productos; SQL ya ejecutado y poscheck OK; **pausada** al priorizar este paquete | Código, orden antigua NO activa |
| 01 | [PRO-328](https://linear.app/proceit/issue/PRO-328) | **IMPLEMENTADA EN CÓDIGO e551943; AUD-R01 CONFORME ESTÁTICAMENTE; IN REVIEW; NEX-076 NO APLICADA** | FE nueva: origen geográfico del receptor = dirección elegida; quitar dirección automática de `dInfAdic`; proteger históricos/idempotencia | P0 fiscal; código + eventual migration solo versionada |
| 02 | [PRO-330](https://linear.app/proceit/issue/PRO-330) | **CORRECTIVO da4a02ed AUDITADO R02; F-001 CERRADA ESTÁTICAMENTE; IN REVIEW; 71 CASOS NO EJECUTADOS** | Stock disponible por línea al agregar/cambiar, sin alterar reserva/venta al emitir | P0 operativo |
| 03 | [PRO-333](https://linear.app/proceit/issue/PRO-333) | Todo; no autorizada | Orden numérico `Documento`, servidor, paginación, IDs estables | P1 bug |
| 04 | [PRO-331](https://linear.app/proceit/issue/PRO-331) | Todo; no autorizada | Ordinal visual, scroll propio de tabla editable, foco al código tras agregar | P1 UX |
| 05 | [PRO-334](https://linear.app/proceit/issue/PRO-334) | Todo; no autorizada | FE azul suave/NCE amarillo suave, estados independentes | P1 UX |
| 06 | [PRO-335](https://linear.app/proceit/issue/PRO-335) | **b8b448cc AUDITADO R03; F001/F002/F003/F004 CERRADOS ESTÁTICAMENTE; IN REVIEW, NO HOMOLOGADO** | TODAS LAS PANTALLAS: PYG 0 decimales y USD hasta 2 SOLO en importes MONETARIOS, sin alterar cantidades/fracciones, cálculo, SIFEN ni exportaciones | **P0 visual** |
| 06b | [PRO-337](https://linear.app/proceit/issue/PRO-337) | **Todo; AUD-R03 de PRO-335 concluida; requiere ORDEN NUEVA EXPLÍCITA** | Informe de Ventas: tabla «No computan» cortada, títulos compactos, responsive y scroll local (SIN lógica monetaria) | P1 UX |
| 07 | [PRO-332](https://linear.app/proceit/issue/PRO-332) | Todo; no autorizada | Vista/Excel/PDF por documento×línea×producto×vendedor×fecha, histórico fiscal fiel | P1 reporte |
| E1 | [PRO-298](https://linear.app/proceit/issue/PRO-298) | Todo; proveedor | PDF KuDE cabecera y USD 2 decimales; produce el gateway. No manipular PDF en NEXIT | Validación externa |
| E2 | [PRO-336](https://linear.app/proceit/issue/PRO-336) | Todo; proveedor | Renovación/instalación de certificado con contraseña correcta; consulta DTE APROBADOS | Validación externa |

**Relacionadas sin reabrir ni duplicar:** PRO-322 geografía del receptor ya implementada para la dirección fiscal antigua; PRO-323 texto asistido, cuyo diseño de inserción automática debe respetar la nueva decisión; PRO-324/PRO-205 identidad logística histórica; PRO-296 ventas E5 ya revisado estaticamente pero sin la nueva vista de detalle; PRO-295 cantidades de movimientos E4 sin ceros finales, pendiente de homologación; PRO-326 KuDE sin CDC (conforme estáticamente, no reabrir); PRO-93 UI factura; PRO-207 credenciales API, no certificado.

## 2. Política de ejecución

**ESTADO VIGENTE TRAS AUDITORÍA R03 29/10/2026:** [AUD-NEXIT-PRO-335-R03](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R03-2026-10-29.md) confirma **F-001/F-002/F-003/F-004 resueltos estáticamente** por los commits de Claude, el último `b8b448cc324ef759d58612712272847692528964` (2 archivos, +6 casos). **0 pruebas ejecutadas, no homologado, PRO-335 In Review. NO EXISTE ORDEN DE CÓDIGO ACTIVA EN ESTE MOMENTO.** Las secciones y órdenes inferiores se conservan como **HISTÓRICAS, NO VIGENTES**; especialmente R02-F004 quedó completada. [PRO-337](https://linear.app/proceit/issue/PRO-337) seguirá Todo hasta nueva orden expresa del responsable y ChatGPT. No iniciar automáticamente otras tareas, tests, SQL/VM, deploy ni migraciones.


**ÚNICA ORDEN AHORA R02-F004:** [ORD-CLAUDE PRO-335 R02-F004](../ordens/ORD-CLAUDE-NEXIT-PRO-335-R02-F004-ROTULO-CUSTO-APERTURA-2026-10-29.md), basada en [AUD-R02](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R02-2026-10-29.md). Corregir SOLAMENTE la moneda informada en la etiqueta del input de costo de apertura (`monedaBaseCosto`, NO `monedaReferencia`) y actualizar los tests estructurales; NO cambiar edición ni cálculos; commit+push y PARAR para R03. Las puertas R01 más abajo son históricas y NO autorizan repetir el correctivo anterior. PRO-337 sigue sin autorización. Tests/SQL/VM/CI manual/deploy no ejecutados.


**ÚNICA ORDEN AHORA (R01):** [PRO-335 R01 CORRECCIONES MONETARIAS PRODUCTOS/CLIENTES](../ordens/ORD-CLAUDE-NEXIT-PRO-335-R01-CORRECCIONES-MONEDAS-PRODUCTOS-CLIENTES-2026-10-29.md), basada en [AUD-R01](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R01-2026-10-29.md), reemplaza cualquier puerta de entrada anterior de PRO-335. **No comenzar PRO-337** hasta revisión R02. Claude solo corregirá KPI multimoneda, moneda real del costo de inventario y vista de conversión de límites; no alterar campo editable Proveedores. Commit+push y PARA; **0 tests/VM/SQL/deploy autorizados**.


**NUEVA DECISIÓN 29/10:** [ORD-PRO-335 FORMATO MONETARIO EN TODAS LAS PANTALLAS](../ordens/ORD-CLAUDE-NEXIT-PRO-335-FORMATO-MONETARIO-TODAS-TELAS-2026-10-29.md) es la **ÚNICA orden activa**. Las descripciones históricas más abajo que aún dicen «no hay orden activa» se consideran supersedidas. PRO-337 queda explícitamente bloqueada hasta commit y auditoría PRO-335. [AUDITORÍA TRANSVERSAL](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md) fija el alcance; no ejecutar tests/VM/SQL/CI manual/deploy.


1. **Orden PRO-328 EJECUTADA y CERRADA para Claude:** [ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md](../ordens/ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md). No iniciar otras etapas de esta tabla automáticamente. [AUD-PRO-328-R01](../testes/AUD-NEXIT-PRO-328-DIRECCION-RECEPTOR-R01-2026-10-29.md): código conforme estaticamente, sin pruebas ejecutadas ni NEX-076 aplicada.
2. **PRO-330 ENTREGADA/CONFORME ESTÁTICAMENTE; ORDEN CERRADA. NUEVA ORDEN ÚNICA PRO-335 ACTIVA:** [ORD-CLAUDE-NEXIT-PRO-330-R01-F001-LOTE-500-PREVIA-2026-10-29.md](../ordens/ORD-CLAUDE-NEXIT-PRO-330-R01-F001-LOTE-500-PREVIA-2026-10-29.md), [AUD-R01](../testes/AUD-NEXIT-PRO-330-STOCK-INMEDIATO-R01-2026-10-29.md). La orden original fue [ORD-CLAUDE-NEXIT-CM-PRO-330-STOCK-INMEDIATO-2026-10-29.md](../ordens/ORD-CLAUDE-NEXIT-CM-PRO-330-STOCK-INMEDIATO-2026-10-29.md) y [REQ-PRO-330](../definicoes/REQ-NEXIT-CM-PRO-330-STOCK-AL-CARGAR-LINEA-2026-10-29.md). Solo PRO-330, sin ejecutar pruebas, SQL, VM ni deploy; tras commit/push, PARA. La PRO-328 está In Review y NEX-076 sigue NO APLICADA. El siguiente trabajo requiere orden expresa NUEVA de ChatGPT; no seguir automáticamente con PRO-333 ni otras. [AUD-R02 PRO-330](../testes/AUD-NEXIT-PRO-330-STOCK-INMEDIATO-R02-2026-10-29.md) conforme estaticamente, 71 casos NO ejecutados. Claude comprueba el árbol Git limpio y sincroniza solo fast-forward. Si hay cambios locales sin commit, los protege y PARA; no sobrescribir.
3. Claude modifica **únicamente archivos autorizados por la orden**, prepara casos puntuales como código y puede versionar migración incremental solicitada, **sin ejecutarla**. No ejecutar NEXIT VM/DB/gateway, ni emitir FE reales, ni desplegar.
4. Final: commit+push, SHA completo, conteo de casos como código, pruebas ejecutadas o no y bloqueos concretos; PARA. ChatGPT audita GitHub HEAD/diff completo, prueba reglas, y autoriza siguiente etapa si está conforme.
5. **No declarar Done** con revisión estática. Las diez peticiones quedan pendientes de visualización y comparación con documentos y datos reales en ambiente humano; si alguna depende del proveedor, no prometer solución por cambio frontend.

## 3. Reglas transversales obligatorias

- Aislamiento tenant, ACL por sucursal/perfil; ninguna URL/búsqueda/control permite otro cliente o empresa.
- Fuente de verdad PostgreSQL y snapshots fiscales previos. Sin mocks, localStorage, datos fijos para negocio ni informes ficticios.
- No alterar monto, IVA, descuentos, numeración, emisión, NCE, stock/reserva, CDC o PDF del gateway en una tarea visual.
- Preservar código SKU alfanumérico con ceros iniciales, como string; distinguir GTIN y PK UUID.
- Código postal/geográfico SIFEN viene de códigos oficiales, no de descripciones libres.
- Fechas del reporte PY; monedas nunca combinadas; fracciones verdaderas no se suprimen.
- Históricos FE/NCE/KuDE jamás se sobrescriben al corregir futuras emisiones.
- Certificados y claves reales quedan bajo custodia del operador/proveedor; ni Claude ni ChatGPT los recibirán o almacenarán.
