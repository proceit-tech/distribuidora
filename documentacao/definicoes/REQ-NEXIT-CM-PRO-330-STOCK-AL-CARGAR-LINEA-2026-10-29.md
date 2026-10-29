# REQUISITO CERRADO — NEXIT / CASA MINGO — PRO-330 — Aviso inmediato de stock en Nueva factura

**Fecha:** 29/10/2026. **Estado:** DEFINIDO PARA DESARROLLO. **Prioridad:** P0 operativa.  
**Issue:** [PRO-330](https://linear.app/proceit/issue/PRO-330) · **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Analista y auditor:** ChatGPT. **Desarrollador:** Claude. **Entorno real:** único PostgreSQL/VM, operación exclusiva del responsable. **Branch:** `feature/NEXIT-2026-001-banco-demo`.

## 1. Problema comprobado en Git

- `app/api/facturas/productos/route.ts`: busca catálogo, precio y unidad; **NO consulta saldos**.
- `app/(private)/facturas/nueva/page.tsx`: `agregar` añade cantidad 1 o incrementa el producto repetido; `editar` cambia cantidad; `sucursalId` puede cambiar. Ninguna acción consulta saldo hasta pulsar «Revisar y confirmar».
- `app/api/facturas/previa/route.ts`: usa `prepararFactura` y `planificarStock`; rechaza insuficiencia con 409 antes de mostrar revisión. `emision.ts::crearFacturaElectronica` vuelve a recalcular/revalidar y exige `repartoHuella`.
- `lib/facturacion/stock-fe.ts::consultarDisponibilidad` usa `fe_stock_disponibilidad` (NEX-067); `asignarStock` agrega cantidad por UUID y trabaja en aritmética decimal exacta. NEX-067 filtra `DISPONIBLE/PROPIO`, depósitos activos de la sucursal, no terceros, `usuario_puede_deposito`, NEX-067 revalida bajo bloqueo al registrar.
- `SELECT_PRODUCTOS` ya proyecta `p.controla_stock AS "controlaStock"`; la interfaz `Producto` aún no declara esa propiedad.
- `fe_stock_disponibilidad` **acepta como máximo 500 UUID en una llamada**, mientras la FE admite hasta 999 líneas; un lote mayor requiere dividir en grupos de hasta 500 (no simular saldo cero ni truncar silenciosamente).
- `NEX-076` (PRO-328) está **solo versionada, NO aplicada**. Esta PRO-330 no altera ni intenta solucionar ese gate fiscal.

## 2. Objetivo

El usuario que prepara una FE recibe aviso **al cargar cada ítem y al modificar su cantidad o la sucursal**, antes de entrar al resumen y antes de cualquier intento de emisión. El aviso usa la **misma fuente autorizada** que el reparto en la previa/emisión; no es reserva ni garantía permanente de saldo.

## 3. Reglas de negocio vinculantes

**RN-01 — disparo temprano:** consultar disponibilidad después de añadir/incrementar por código, escáner, buscador rápido o «Búsqueda avanzada», al editar cantidad, quitar línea o cambiar sucursal. El mismo producto repetido que incrementa la cantidad existente se verifica por el total. Actualización breve tras escritura (debounce limitado, p.ej. 150–250 ms), sin esperar a presionar «Revisar». No introducir nueva pantalla/modal.

**RN-02 — fuente autorizada:** usar `prepararFacturacion("CREAR")`, empresa/usuario de sesión y `fe_stock_disponibilidad` mediante `consultarDisponibilidad` de `stock-fe.ts`, más el algoritmo puro `asignarStock`. No calcular disponibilidad desde catálogos/precios, `localStorage`, saldos cacheados o `Number`; todos los importes de cantidad son TEXTO decimal exacto. Nunca usar stock de otra empresa, sucursal o depósito no autorizado.

**RN-03 — datos del request:** objeto JSON `{sucursalId: UUID, lineas: [{productoId:UUID,cantidad:TEXTO}, ...]}`; no pasar ni confiar en `controlaStock`, descripción, código, precio, depósito o empresa del navegador. El servidor valida todos los IDs y cantidades, vuelve a leer producto activo, vendible y tipo permitido de la misma empresa y determina `controla_stock` de BD. Responder error genérico por producto inexistente/ajeno, sin fugas; denegar sin permiso. No cambiar las rutas públicas existentes.

**RN-04 — disponibilidad real:** productos con control de stock: total por UUID, hasta cuatro decimales, solo saldos `DISPONIBLE + PROPIO` de depósitos activos, de la sucursal elegida, no terceros y en alcance del operador. `disponible=0` únicamente si la consulta fue exitosa y no hay saldos válidos. No contar `RESERVADA`, `CONFIRMADA`, `RECHAZADA_DEFINITIVA`, terceros, ni otras sucursales. Misma regla de FE transaccional (incluida la coexistencia con PRO-310), sin alterar consumo/reserva/firma.

**RN-05 — servicios/ítems sin control:** identificados en servidor `controla_stock=false`, se devuelven con estado `SIN_CONTROL`; no exigen stock ni bloquean revisión. No son «saldo cero» o «sin stock».

**RN-06 — agregación:** una sola entrada de resultado por UUID y requerido = suma EXACTA de las cantidades de todas las líneas con ese UUID; si UI mantiene una sola línea al incrementar, el resultado es equivalente. Si hay cantidad temporalmente inválida, indicar «Corrija la cantidad» y no usar una suma redondeada/estimada; bloquear revisión por cantidad inválida como ya hace el formulario.

**RN-07 — aviso visual por línea:** `INSUFICIENTE`: destacar discretamente fila/área del producto y mostrar **código + descripción, requerido, disponible, faltante**, con accesibilidad `role="alert"` / `aria-live`. `SUFICIENTE`: mensaje breve y no intrusivo o marca neutra «Stock disponible» si aporta claridad. `VERIFICANDO`: indicar «Verificando stock…» sin falsear éxito. `SIN_CONTROL`: no mensaje de falta. `ERROR`: «No se pudo verificar el stock. Reintentar.» con acción funcional, distinto de insuficiencia. Respetar cantidad fraccionaria e idioma español PY. Al corregir cantidad o retirar ítem, quitar aviso anterior.

**RN-08 — seguridad contra respuestas atrasadas:** la firma del request incluye `sucursalId`, productos UUID y cantidades normalizadas, con versión/identificador de solicitud; usar `AbortController` y comprobar versión/firma **al resolver, al rechazar y al actualizar estado**. Una respuesta de una sucursal, cantidad, búsqueda o borrador anterior NUNCA pisa el estado vigente. Al cambiar sucursal, cualquier saldo anterior se invalida inmediatamente. Al vaciar líneas, limpiar estado. Al sustituir cliente, no publicar resultados obsoletos. La consulta siempre depende del conjunto real `lineas`, no del último ítem clicado.

**RN-09 — bloqueo antes de revisión:** mientras haya al menos un SKU con stock insuficiente, consulta pendiente/desactualizada, error de disponibilidad o sucursal aún no seleccionada, no permitir «Revisar y confirmar». Incluir causa concisa en resumen de pendientes; permitir siempre corregir cantidades/quitar líneas/cambiar sucursal. Si todos son `SIN_CONTROL`, no demorar ni bloquear por consulta innecesaria. **No crear bloqueo de `Enviar` con dato cliente stale**: solo una revisión válida (que ya reconsulta stock y firma `repartoHuella`) permite emitir, preservando la doble validación de servidor/BD. No omitir el control de la previa si un usuario llama API directamente.

**RN-10 — contrato de respuesta:** para request válido devolver JSON con `sucursalId`, `suficiente`, `productos` por UUID: `{productoId,codigo,descripcion,controlaStock,requerido,disponible,faltante,estado}` donde `estado` es `SUFICIENTE | INSUFICIENTE | SIN_CONTROL`; cantidades como texto decimal canónico, `faltante=null` si suficiente o sin control; para `SIN_CONTROL` usar `disponible=null` (no inventar un saldo). No exponer depósitos, lotes, costos, stock de terceros ni stock de otras empresas. Respuestas no almacenables: `Cache-Control: no-store`. Errores HTTP seguros por 400/401/403/422/503 y respuesta existente de `respuestaErrorFacturacion` cuando corresponda; distinguir error técnico de insuficiencia verdadera. Restringir tamaño/cantidad del payload, hasta el máximo real de FE 999 líneas, sin duplicar consultas excesivas. **Si >500 UUID con stock**, consultar en tandas de ≤500 y agregar los resultados (ningún truncamiento silencioso).

**RN-11 — no alterar motor existente:** mantener `app/api/facturas/previa/route.ts`, `crearFacturaElectronica`, `planificarStock`, `repartoHuella`, `fe_stock_baja_documento`/control SQL de stock y reglas fiscales intactas. Nada de movimientos, reserva, bloqueos SQL, `UPDATE`, `INSERT`, `DELETE`, migraciones, ni temporizadores de fondo. UI nueva usa solo lectura y no es fuente de verdad. No cambiar los momentos de salida/reserva decididos por PRO-310.

**RN-12 — aislamiento de fases:** no tocar PRO-328 (dirección y `dInfAdic`; NEX-076 sigue no aplicada), PRO-327 (códigos SQL 561 ya ejecutados, UI aún pendiente), PRO-326 (KuDE), PRO-331 (scroll/ordinal/foco), informes, NCE, permisos, certificados ni despliegue.

## 4. Archivos y flujo técnico recomendado

- Nuevo `app/api/facturas/stock/disponibilidad/route.ts`: `POST` seguro, sesión CREAR, verificación de sucursal y producto por empresa, `consultarDisponibilidad` en lotes + `asignarStock`, respuesta mínima/decimal.
- `lib/facturacion/stock-fe.ts`: reutilizar funciones exportadas, sin alterar la lógica existente de previa/emisión; añadir solo helper puro/reutilizable si evita duplicar cálculo. No modificar `fe_stock_disponibilidad` SQL.
- `app/(private)/facturas/nueva/page.tsx`: declarar `Producto.controlaStock`, estado/verificación asíncrona ligada a sucursal e ítems, alertas por SKU, invalidación y bloqueo de revisión. Mantener búsqueda/escáner, selector y foco como hoy (PRO-331 lo cambiará).
- `app/(private)/facturas/nueva/page.module.css`: solo estilos de aviso, accesibilidad y disposición responsive para líneas.
- Casos como código: `lib/facturacion/stock-e02.casos.ts` y/o `lib/facturacion/stock-preventivo.casos.ts` para endpoint/algoritmo, manejo de carreras y guards. Pruebas estructurales no equivalen a validación SQL real.

## 5. Matriz de aceptación

CA-01: Producto controlado disponible 2 / solicitado 3 => inmediato `INSUFICIENTE`, pedido `3`, disponible `2`, faltante `1`, revisión bloqueada; ajuste a 2 => `SUFICIENTE`.
CA-02: Disponible 0 con consulta exitosa => falta exacta; error de red => estado `ERROR`, NO saldo 0 ni saldo confirmado.
CA-03: Cantidad `0,0001`, `1,5`, `5,0000` => aritmética exacta; inválida => no confirmar disponibilidad.
CA-04: SKU idéntico añadido por código dos veces, o líneas repetidas => requerimiento agregado y aviso actualizado, sin duplicación de stock.
CA-05: Cambio sucursal A→B mientras A responde tarde => A ignorada; B solo compara depósitos de B y alcance.
CA-06: Quitar ítem, vaciar lista, sustituir cliente o cambiar cantidad con request en curso => resultado anterior ignorado, aviso borrado.
CA-07: Servicios/`controla_stock=false` => `SIN_CONTROL`, no bloqueo ni consulta innecesaria.
CA-08: `productoId` de otro tenant/inactivo/no vendible, sucursal fuera del alcance, sesión expirada o sin CREAR => rechazo seguro sin fuga.
CA-09: Usuario con depósitos parciales, stock reservado/terceros/otra sucursal => no contados.
CA-10: 501 UUID de productos controlados => consulta lotes de 500+1 sin fabricar insuficiencia; máximo 999 líneas y request inválido controlado.
CA-11: `/api/facturas/previa` conserva consulta real, `repartoHuella` e invariantes; el endpoint nuevo jamás escribe ni numera.
CA-12: Revisión no se habilita durante consulta `VERIFICANDO` o `ERROR` de stock controlado; el operador puede reintentar y corregir.
CA-13: PRO-328/NEX-076, SIFEN/KuDE, precios, impuestos, inventario histórico y servicios sin control mantienen su comportamiento.

## 6. Restricciones de ejecución y entrega

Claude desarrolla un cambio focal en la branch definida, escribe casos y hace commit+push/SHA. **No ejecutar tests, lint, typecheck, build/CI manual, VM, Docker, PostgreSQL, SQL, gateway, FE reales ni despliegue**, siguiendo la excepción focal aprobada en el paquete 29/10. No modificar Linear, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, planos ni auditorías: ChatGPT gestiona. **PARAR** después de publicar para auditoría independiente. No declarar probado/homologado.

**Definido por ChatGPT, no delegar análisis funcional a Claude.**
