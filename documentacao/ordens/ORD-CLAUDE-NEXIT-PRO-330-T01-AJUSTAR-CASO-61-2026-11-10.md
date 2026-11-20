# ORDEN DE MANTENIMIENTO EXCLUSIVO DE CASO — PRO-330-T01 / PRO330-61

**Fecha:** 10/11/2026  
**Issue:** [PRO-330](https://linear.app/proceit/issue/PRO-330), relacionada con [PRO-341](https://linear.app/proceit/issue/PRO-341).  
**Auditoría de origen:** [AUD PRO-341-R02](../testes/AUD-NEXIT-PRO-341-CODIGO-FOCO-R02-2026-11-10.md)  
**Commit funcional auditado y conforme estáticamente:** `b7ca1ebb329d0fa87d568d2385323e3fe5f33105`.
**Estado:** **MANTENIMIENTO DE PRUEBA ANTIGUA**, NO correctivo funcional PRO-341-R03 ni despliegue. PRO-340 no autorizada.

## 1. ÚNICO defecto de caso fuente

La prueba **`PRO330-61`** en `lib/facturacion/stock-preventivo.casos.ts` exige:
`/<BuscadorProducto alElegir=\{agregar\}/.test(pag)`,
pero el flujo real vigente tras PRO-331/339/341 es:
`<BuscadorProducto alElegir={agregarRapido} />`,
`agregarRapido(p)` ejecuta `agregar(p,"rapido")`,
`<SelectorProducto alAgregar={agregar} />` ejecuta `agregar` con origen predeterminado `"avanzado"`.

La verificación heredada falla estáticamente aunque ambos recorridos llegan a la misma función y ésta sigue identificando productos existentes por UUID y llama `aplicarLineas` para actualizar el borrador sobre `lineasActuales.current`. El stock preventivo se recalcula a partir de las líneas efectivas; su comportamiento funcional NO debe cambiar.

## 2. Cambios autorizados

1. Leer `CLAUDE.md`, los protocolos IA y la auditoría R02, y obtener **versión COMPLETA y MÁS RECIENTE de cada archivo UNO POR VEZ**. Inspeccionar especialmente `lib/facturacion/stock-preventivo.casos.ts` y `app/(private)/facturas/nueva/page.tsx` actuales; identificar el cuerpo de `PRO330-61`, handlers `agregarRapido/agregar`, refs de PRO-339-R02, recalculo de stock y su continuidad. No usar snapshots antiguos.
2. **Modificar únicamente el caso fuente PRO330-61** en `lib/facturacion/stock-preventivo.casos.ts` para que compruebe el contrato real vigente:
   - Buscador rápido: `BuscadorProducto → agregarRapido → agregar(p,"rapido")`, retorno de resultado real aceptado/bloqueado PRO-341-R02 y SKU igual identificado por `producto.id`.
   - Selector avanzado: `SelectorProducto.alAgregar={agregar}`, con origen predeterminado `"avanzado"`.
   - Ambos caminos escriben líneas mediante `aplicarLineas`/ref sincronizada y siguen disparando el stock preventivo del borrador real.
   - Preservar la finalidad original de PRO330-61 y el resto del archivo. No reemplazar el caso por `true` ni eliminar aserciones de stock para hacerlo pasar.
3. Inspeccionar **solo** casos vecinos PRO330-57..63 y advertir si otras aserciones resultan obsoletas por cambios anteriores. No cambiar otra sin evidencia y autorización; no ampliar a refactor de suite.
4. **NO modificar código funcional**, especialmente `page.tsx`, `busqueda-rapida.ts`, `stock-preventivo.ts`, `stock-fe.ts`, NEX-067/NEX-078, SQL/API, validación FE, stock, KuDE, PRO-341/CSS/foco, ni lógica de selección y permisos. No introducir modificación alguna de producción.

## 3. Protocolo y entrega

**No ejecutar** casos, runner, tests, lint, typecheck, build, CI manual, SQL, migrations, DB/PostgreSQL, Docker/VM, gateway, navegador de cliente ni deploy.

Publicar commit+push en la branch autorizada con **único archivo de casos** modificado, SHA completo, texto del caso actualizado y explicación precisa de por qué la aserción antigua era falsa. Informar que TODOS los casos continúan **NO EJECUTADOS**. **PARAR para auditoría ChatGPT PRO-330-T01**. No iniciar PRO-340.

**GATE P0 de instalación NO levantado:** NEX-078 sigue sin aplicación; código de PRO-339/341 sin schema provoca HTTP 422 a toda FE nueva. NEX-078 debe aplicarse/validarse previamente por responsable autorizado, no por Claude ni en esta tarea.
