# ORDEN ÚNICA ACTIVA — CLAUDE — PRO-330 P0 / AVISO DE STOCK AL CARGAR UNA LÍNEA

**Fecha:** 29/10/2026. **Tarea autorizada de código:** [PRO-330](https://linear.app/proceit/issue/PRO-330) · **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Analista de negocio, sistemas, auditor y Linear:** ChatGPT. **Claude: solo implementación de los criterios ya cerrados.**  
**Repositorio:** `proceit-tech/distribuidora` · **branch obligatoria:** `feature/NEXIT-2026-001-banco-demo` · **clone:** `C:\projetos\PROCEIT\distribuidora`.  
**REGLAS NORMATIVAS:** [REQ-NEXIT-CM-PRO-330-STOCK-AL-CARGAR-LINEA-2026-10-29.md](../definicoes/REQ-NEXIT-CM-PRO-330-STOCK-AL-CARGAR-LINEA-2026-10-29.md), [AUD-SOLICITUDES 29/10](../analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md), [PLAN-CASA-MINGO](../planos/PLAN-NEXIT-CASA-MINGO-AJUSTES-29-OCT-2026.md).

## 0. Preparación obligatoria — no delegar análisis al desarrollador

1. Confirmar clone, rama, `git status --short`, `git fetch`, `git merge --ff-only` y no sobrescribir modificaciones locales. Con árbol sucio o conflicto: PARAR e informar; no stash/descarte automático.
2. Leer completos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, esta orden, requisito PRO-330 y los archivos del §2 antes de editar. El requisito YA define reglas comerciales; no cambiar alcance ni abrir tareas nuevas.
3. **PRO-328 ya implementada SHA e551943 y auditada estaticamente, NEX-076 AÚN NO APLICADA; NO TOCAR esa entrega. PRO-327 UI/API suspendida; SQL de 561 productos aplicado y validado, NO REEJECUTAR. PRO-331/332/333/334/335, KuDE, NCE, certificados quedan fuera.**

## 1. Decisión exacta — en qué momento y qué saldos consultar

- La selección de un producto facturable que controla stock debe causar una **consulta de solo lectura inmediata** (sin esperar a «Revisar y confirmar»), incluida alta por código/escáner, buscador rápido y «Búsqueda avanzada». Lo mismo cuando se incrementa el mismo producto, cambia cantidad, se quita una línea o cambia sucursal.
- **Cantidad solicitada TOTAL por producto UUID**, no por código de barras, GTIN o PK de línea. Convertir coma/punto con `normalizarCantidadTexto`; hasta 4 decimales, suma EXACTA mediante `parseDec/textoDec`. Un producto en dos líneas 1+2=3 solicitado, no contar solo última línea.
- Considerar EXCLUSIVAMENTE `fe_stock_disponibilidad(empresaId, usuarioId, sucursalId, productoIds)`: `DISPONIBLE` + `PROPIO`, depósito activo de la sucursal, dentro de alcance del usuario, no tercero, ninguna otra empresa, ni reservado/transito/cuarentena. No crear otra lógica de saldo.
- **SKU controla_stock=false** => `SIN_CONTROL`, no consultar saldo ni bloquear; no mostrarlos como agotados. El navegador no decide ese flag; servidor lo obtiene de BD. `SELECT_PRODUCTOS` ya trae el campo y frontend `Producto` todavía no lo tipa.
- **Diferenciar estados:** `SUFICIENTE`, `INSUFICIENTE`, `SIN_CONTROL`, `VERIFICANDO`, `ERROR`; error de red/servidor NO equivale a cero disponible. Cero es correcto solo si consulta exitosa devolvió cero. Si una cantidad es inválida, NO afirmar disponibilidad comprobada.
- **Al detectar falta:** mensaje en la propia línea con código/descripcion, `Solicitado N · Disponible M · Faltante X`, visual discreto, accesible `role="alert"`. El usuario puede cambiar cantidad, quitar línea, sucursal y reintentar consulta. Aviso se actualiza en cuanto cambie el pedido.
- **Prevención UI:** deshabilitar «Revisar y confirmar» durante insuficiencia, error de consulta o comprobación requerida pendiente/vencida; integrar al listado de pendientes, sin eliminar validaciones actuales de sucursal, IVA, precio, vendedor y cliente. Servicios sin stock NO deben generar consulta pendiente falsa. Cliente cambia o borrador limpia líneas: descartar cualquier respuesta de otro contexto. Tras corregir cantidad, estado suficiente habilita revisión conforme a las demás reglas.
- **Independencia transaccional:** la consulta adelantada es REFERENCIAL, puede cambiar por ventas simultáneas. La previa y emisión **SIEMPRE** ejecutan su propio `planificarStock`, `repartoHuella` y validación SQL bajo bloqueo como hoy. PRO-310 decide cuándo se reserva/consume, no reescribir esa regla. No cambiar números de FE, inventario ni payload.

## 2. Contratos técnicos obligatorios

**Endpoint nuevo:** `POST app/api/facturas/stock/disponibilidad/route.ts`. Utilizar `prepararFacturacion("CREAR")`; obtener empresa/usuario de sesión, NO del request. Entrada estricta:
```json
{"sucursalId":"UUID", "lineas":[{"productoId":"UUID","cantidad":"1.5"}]}
```
Validar `sucursalId`, 0..999 líneas reales (sin líneas => vaciar, sin consulta), UUID, cantidad positiva hasta 4 decimales, tamaño razonable; confirmar sucursal activa/en alcance por SQL; consultar productos por IDs de empresa mediante `productos`, activos/vendibles y tipos `MERCADERIA|SERVICIO`, tomar `codigo`, `descripcion_factura`, `controla_stock` autoritativos. Para productos ajenos/no encontrados, 422 genérico sin revelar datos.

Usar **`consultarDisponibilidad` + `asignarStock` existentes**, sin duplicar fórmula ni tocar `fe_stock_disponibilidad`. La función SQL NEX-067 limita `p_productos` a 500 UUID: **si hay 501–999 únicos controlados, dividir en tandas de máximo 500**, sumar saldos en memoria y ejecutar **una única agregación lógica**; no truncar, no confundir respuesta vacía con saldos cero. No es necesario cambiar `planificarStock` actual; si algún helper puro lo mejora, preservar su contrato y resultados existentes. Evitar consultas al saldo para el subconjunto que no controla stock.

Respuesta JSON:
```json
{"sucursalId":"UUID","suficiente":false,
 "productos":[{"productoId":"UUID","codigo":"000123-A","descripcion":"Descripción","controlaStock":true,
 "requerido":"3","disponible":"2","faltante":"1","estado":"INSUFICIENTE"}]}
```
Para suficiente: `faltante:null, estado:"SUFICIENTE"`. Para sin control: `disponible:null, faltante:null, estado:"SIN_CONTROL"`. Decimal siempre texto; nunca `Number` para cálculo. No devolver detalle de depósitos, lotes, costos, datos de otros tenants. `Cache-Control: no-store`; códigos HTTP 400/401/403/422/503 diferenciados, sin exponer errores internos.

**Frontend:** `app/(private)/facturas/nueva/page.tsx`, reutilizar `lineas` y `sucursalId`; tipar `Producto.controlaStock`, derivar necesidad desde datos actuales. Usar una sola petición **agrupada por el borrador completo**, no un request por cada línea; debounce corto (150–250 ms) y `AbortController`, versión monotónica/firma que incluya sucursal y UUIDs/cantidades, descarte de respuestas tardías incluso tras cambio a otra sucursal y retorno a la original. Al desaparecer líneas/control de stock, limpiar. `Reintentar` fuerza consulta real. No crear polling/background. Mostrar estado por UUID debajo del producto usando estilo nuevo en `page.module.css`; no editar código del modal Resumen ni foco/scroll/ordinal (reservado a PRO-331).

**Seguridad:** `prepararFacturacion("CREAR")` verifica sesión+permiso; `fe_stock_disponibilidad` revalida `FACTURACION_ELECTRONICA.CREAR` y `sucursal_en_alcance`, `usuario_puede_deposito`. No ampliar GRANT ni SELECT directos. Sin `NEX-076` aplicada, la consulta de stock debe seguir funcionando independientemente del error 422 fiscal de PRO-328; no habilitar por esta vía la emisión con dirección seleccionada.

## 3. Archivos permitidos para editar

1. **Nuevo:** `app/api/facturas/stock/disponibilidad/route.ts` — ruta consulta temprana sin escrituras.
2. `app/(private)/facturas/nueva/page.tsx` — estado/control de consulta, aviso por línea, pendientes y bloqueo de revisión.
3. `app/(private)/facturas/nueva/page.module.css` — estilos puntuales de mensaje.
4. `lib/facturacion/stock-fe.ts` — **SOLO** helper puro para reuso/batches si de veras necesario, sin cambiar `planificarStock` ni cálculos existentes.
5. `lib/facturacion/stock-e02.casos.ts` — casos focales; si separar es más claro, **nuevo** `lib/facturacion/stock-preventivo.casos.ts`. Mantener runner/exports existentes, no simular como datos reales.
6. Únicamente si estrictamente necesario para tipado de endpoint, helper **nuevo** `lib/facturacion/stock-preventivo.ts` (validación/serialización), con motivación breve en commit; no cambiar otras capas.

Otros archivos son **lectura solamente**, especialmente `app/api/facturas/previa/route.ts`, `app/api/facturas/route.ts`, `lib/facturacion/emision.ts`, `lib/facturacion/payload-fe.ts`, `lib/facturacion/revision-factura.ts`, migraciones NEX-067/NEX-076, NCE, KuDE. Si se requiere modificar otro archivo, PARAR y explicar necesidad; no ampliar por iniciativa propia.

## 4. Matriz de casos OBLIGATORIA (escribir como código; NO ejecutar)

- `3` solicitado / `2` disponible => `INSUFICIENTE`, faltante `1`, aviso en línea y revisión no permitida; corregir a `2` => suficiente.
- Cero real por consulta exitosa ≠ fallo de red `ERROR`; retry actualiza.
- Mismo UUID añadido dos veces => requerimiento total, no confundir con GTIN ni SKU texto `000123`.
- `1,5`, `0,0001`, `5,0000` sin float; cantidad no válida bloquea su validación.
- Servicio y mercadería `controlaStock=false` => sin control ni bloqueo/consulta.
- Filtrado por tenant, usuario, sucursal, depósitos activos/autorizados, propiedad, estado; sin fuga por IDs foráneos.
- Cambio sucursal A→B y respuesta A tardía; edición y retiro ítem con request pendiente; abort/version/firma, no status verde stale.
- Máximo 999 líneas y **501 productos UUID únicos** en dos tandas de 500 y 1.
- Accesibilidad del aviso, teclado, búsquedas rápidas, selector avanzado, scanner intactos.
- «Revisar y confirmar» bloqueado con insuficiencia/VERIFICANDO/ERROR, habilitable después de suficiencia; previa/emitir siguen revalidando; PRO-328/NEX-076 no tocada.

## 5. Prohibiciones y entrega

**NO EJECUTAR** tests, lint, typecheck, build, CI manual, SQL, scripts, migration, Docker, VM, PostgreSQL, gateway, PDF real, emisión ni deploy. **No implementar** otras tasks ni actualizar Linear, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, requisitos, auditorías o plan de gestión. No introducir caches persistentes, mocks en producción ni alterar credenciales.

Tras completar PRO-330: un commit/push focal en branch indicada; reportar SHA **COMPLETO**, número de casos añadidos, si hubo bloqueo y declarar claramente `TESTES NÃO EXECUTADOS`; **PARAR PARA AUDITORIA CHATGPT**. PRO-333 solo se libera tras orden posterior.

**Las RN/CA del requisito PRO-330 son definitivas.**
