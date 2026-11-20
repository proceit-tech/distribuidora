# AUD-NEXIT-CASA-MINGO-E06-E07-E08-R01 — Auditoría consolidada de las tres demandas del cliente

**Fecha:** 21/10/2026
**Commits funcionales auditados:**
- E06: `64b9c7f7f706a5a8047e03087e7bc41a9f74f62e`.
- E07: `fbc290cb5199dedc2c5a76451c9fc061007e0b9f`.
- E08: `9dc8e28f706eda069370a17e87a4cb7979a2a8d0` (HEAD funcional indicado por Claude).

**Objetivo y restricción:** revisar SOLAMENTE selección/devolución NCE, servicio fijo DESCUENTO, KuDE FE/NCE. Cancelación fiscal y reversión automática de stock fuera de alcance, por falta de API. No abrir otros menús ni funcionalidades.
**Fuentes:** código GitHub en SHA E08; `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `documentacao/definicoes/CHECKLIST-CASA-MINGO-PEDIDOS-CLIENTE-2026-10-21.md`, documentos de decisión vigente, NEX-062/NEX-070 y tests de las tres fases.
**Método:** lectura dirigida de código, diff, migración y casos; **ningún test Node/TypeScript/SQL/PG/VM/navegador/gateway real ejecutado por el auditor**. Tests 23/31/109 y regresiones fueron **relatados por Claude**, no reproducidos.

## Dictamen

**CORRECCIÓN MÍNIMA SOLICITADA, dos hallazgos MEDIOS/BAJOS, E08 conforme estáticamente.**
- E06-F001 **BAJA**: el botón `Restaurar` restablece por defecto una cantidad inicial en vez de la cantidad digitada antes de eliminar una línea, por lo que «deshacer» no deshace realmente la eliminación.
- E07-F001 **MEDIA**: el saldo presentado en la lista de facturas elegibles para NCE ignora `nce_descuentos` aprobados. El motor de preparación y NEX-070 sí los deducen, impidiendo exceder el saldo global en la emisión; el listado muestra dato incorrecto y ofrece facturas ya agotadas por DESCUENTO.
- E08: FE y NCE invocan `POST /api/kude` con exactamente 5 campos `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc`, sin `tipOpe`, sin exigir `APROBADA` ni CDC local previo. El gateway decide disponibilidad; se valida `status:success`, CDC devuelto coherente con tipo/establecimiento/punto/número y con el CDC local cuando existe, Base64/PDF y límites. Reutiliza visor/descarga/impresión, sin cambiar layout. **Sin defectos bloqueantes nuevos identificados en inspección estática; no homologado con API real.**

## E06-F001 — BAJA — Restaurar pierde valor ingresado antes de eliminar

**Ubicación:** `app/(private)/notas-credito/page.tsx`, bloque `Restaurar` bajo barra `Líneas a acreditar`.

**Evidencia:** `Eliminar seleccionados` únicamente añade números de línea al `Set eliminadas` y deja `entradas` sin cambios. Al hacer `Restaurar`, en cambio, se recalcula `const base = entradasIniciales(factura.lineas, motivo)` y para cada eliminada se ejecuta `n[l] = base[l]`, descartando el valor editado que seguía guardado. En `Devolución`, `entradasIniciales` usa el saldo disponible entero (ej. 5).

**Reproducción por código:** cantidad disponible 5; operador edita 2; selecciona y elimina; `Restaurar` devuelve 5, no 2. Los tests E06 verifican existencia del botón por regex, pero no el contenido de la restauración.

**Fix mínimo:** `Restaurar` solo quita líneas de `eliminadas` conservando entradas/valores previamente digitados (y cualquier otro estado de línea necesario); si una línea carece de `entradas` por una precarga especial, inicializar únicamente esa línea con su default, sin borrar valores presentes. Mantener selección limpiada y revisión invalidada. Test dirigido Devolución 5→2→eliminar→restaurar = 2, monto 1000→eliminar→restaurar = 1000, segunda línea intacta y precarga de rechazadas.

## E07-F001 — MEDIA — Facturas elegibles no descuenta DESCUENTO aprobado

**Ubicación:** `lib/facturacion/nce.ts`, `listarFacturasElegibles`, CTE `base` y SELECT final.

**Evidencia concreta:** `original` suma `Detalles[].dTotOpeItem`; `acreditado` suma **únicamente** `nce_lineas.monto` para NCE aprobadas, sin consultar `nce_descuentos`. El saldo mostrado es `(original-acreditado)::text` y la elegibilidad es `WHERE original-acreditado > 0`. Pero la E07 aprobó servicio sin `nce_lineas`: NEX-070 lo almacena exclusivamente en `nce_descuentos` y sus montos aprobados son restados correctamente en `leerFacturaOriginal`/SQL `fe_documento_crear_nce`.

**Caso verificable:** FE 100.000 PYG, primera NCE Descuento de 100.000 APROBADA usando servicio DESCUENTO; `nce_lineas` no tiene fila para esa NCE, `nce_descuentos` contiene 100.000. El listado presenta 100.000 y la FE elegible, aunque el saldo real sea 0. La preparación bloquea por saldo global: **inconsistencia UX/operativa, no doble emisión fiscal demostrada**.

**Fix mínimo:** ajustar el CTE para deducir también `sum(nd.monto)` de `nce_descuentos` **solo en NCE APROBADA**, garantizando empresa/FE correctas. Usar la misma definición de saldo global de `leerFacturaOriginal` y NEX-070. Evitar que el listado dependa incondicionalmente de la tabla antes de aplicar NEX-070: preservar comportamiento anterior cuando no exista esa migration o asegurar gate de rollout explícito, sin permitir SQL de tabla inexistente por error. Añadir test dirigido FE sin NCE, FE con NCE por línea, solo DESCUENTO parcial, solo DESCUENTO total, combinación mismo motivo, NCE pendiente/rechazada no consume; paginación y saldo visible.

**Importante:** No reescribir reglas fiscales, stock, gateway, ni la estructura de NEX-070; solo corregir consulta de listado y su cobertura.

## Otras comprobaciones sin hallazgo bloqueante

- **E06:** `alternarTodas`, `eliminarSeleccionadas`, `lineasVisibles`, `enNota`, validación de cantidad normalizada en UI y servidor; devolución parcial y fraccionaria con límite de saldo, sin entradas automáticas de Inventario.
- **E07:** `payload-nce.ts` construye ítem fijo DESCUENTO único con unidad 77, cantidad 1, IVA 10% y monto digitado; NEX-070 registra `nce_descuentos`, serializa por FE original `FOR UPDATE`, compara monto global contra totales/saldos acreditados aprobados. NEX-062 ya posee `UNIQUE(empresa_id,nce_id,fe_id)` para su FK compuesta; NEX-070 no aplicada. Se preservan motivo fijo y correcciones NCE rechazadas por la estructura del código.
- **E08:** no exige estado APROBADA/CDC local para llamar al gateway; mantiene permisos/alcance multiempresa, identidad FE/NCE, checks PDF y CDCS; no modifica el layout. No se valida que el gateway real emita KuDE para notas pendientes/rechazadas; si no entrega, mostrar indisponibilidad.
- **Riesgo fiscal conocido sin declarar incompatibilidad:** IVA 10% fijo de DESCUENTO ante facturas originales 5%, exentas o mixtas todavía requiere test fiscal real y respuesta SIFEN, no constituye aprobación del proveedor.
- NEX-067/068/069/070 **siguen no aplicadas según reporte de Claude**. No realizar deploy, SQL, migraciones, ni marcar Homologado/Done hasta autorización y pruebas de PostgreSQL/gateway/browser por responsable.

## QA reportada por Claude (no reproducida)

- E06 `nce-seleccion-e06`: 23 comprobaciones, 0 fallos. Regresiones `nce` 205, `nce-busqueda` 67, `facturacion` 271: 0 fallos informados.
- E07 `nce-descuento-e07`: 31, 0 fallos. Regresiones declaradas nce 205, nce-busqueda 67, E06 23, facturacion 271, ajuste-fiscal 41.
- E08 KuDE 109 y visual-v1 30, ambas 0 fallos informados, más gateway y facturación.
- TypeScript y ESLint puntuales: reportados limpios.
- Sin navegador real, PostgreSQL real, gateway real ni suite de `gateway-config.casos` por bloqueo histórico del provisionador.

## Gate de corrección única

**Claude corrige únicamente E06-F001 y E07-F001** en una entrega correctiva limitada, con tests específicos, commit/push e informe SHA; luego **PARE para auditoría R02**. **E08 no requiere nueva implementación** en este gate. El responsable hará después la homologación de los tres flujos en navegador, PostgreSQL y gateway real, con aplicación autorizada de migrations pendientes en orden verificado. No continuar hacia E10 cancelación ni otros menús.
