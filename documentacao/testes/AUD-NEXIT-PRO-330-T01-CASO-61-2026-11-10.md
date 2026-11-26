# AUDITORÍA INDEPENDIENTE — PRO-330-T01 / Actualización de caso heredado PRO330-61

**Fecha:** 10/11/2026  
**Commit auditado:** [873ea17f3e50a71f5f1c362185b7380f1fca5528](https://github.com/proceit-tech/distribuidora/commit/873ea17f3e50a71f5f1c362185b7380f1fca5528)  
**Linear:** [PRO-330](https://linear.app/proceit/issue/PRO-330) · **Origen:** [AUD PRO-341-R02](AUD-NEXIT-PRO-341-CODIGO-FOCO-R02-2026-11-10.md)  
**Auditor:** ChatGPT. Inspección estática independiente del diff y del archivo de casos completo, comparado con la versión real del componente `Nueva factura` en el mismo SHA. **No se ejecutaron casos, tests, runner, lint, typecheck, build, SQL, PostgreSQL, navegador, gateway, Docker, VM ni despliegue.**  
**VEREDICTO: CONFORME ESTÁTICAMENTE — PRO330-61 actualizado correctamente, sin necesidad de T02 por el hallazgo original.**

## 1. Alcance y control de cambios

El commit modifica **EXACTAMENTE UN ARCHIVO**: `lib/facturacion/stock-preventivo.casos.ts`. El diff reemplaza únicamente el caso `PRO330-61` y agrega comentario explicativo sobre los flujos vigentes; **no modifica ningún archivo funcional, CSS, API, configuración, base de datos ni migración**.

## 2. Causa original y corrección comprobada

**Expectativa obsoleta original:** `<BuscadorProducto alElegir={agregar}/>` y búsqueda del SKU existente directamente en un `lineas.find(...)` de render. Después de PRO-331/PRO-339/PRO-341, el flujo legítimo es:

- **Búsqueda rápida / escáner:** `<BuscadorProducto alElegir={agregarRapido} />`, donde `agregarRapido(p)` invoca `agregar(p,"rapido")` y traduce `ALTA_BLOQUEADA` a `ELECCION_RECHAZADA`, o confirma `ELECCION_ACEPTADA`.
- **Selector avanzado:** `<SelectorProducto ... alAgregar={agregar} ... />` llama a la misma función `agregar` con su origen predeterminado `"avanzado"`.
- **Identidad e incremento:** `agregar` consulta `const lineas = lineasActuales.current;`, identifica un producto ya presente por `l.producto.id===p.id` (UUID), e incrementa una unidad con `aplicarLineas`.
- **Atomicidad:** la función `aplicarLineas` ejecuta `const nuevas = cambio(lineasActuales.current);`, sincroniza inmediatamente `lineasActuales.current=nuevas` y establece `setLineas(nuevas)`, evitando snapshot previo de React. El otro camino de agregar nueva línea usa también `aplicarLineas` y mantiene el límite por empresa.
- **Stock preventivo:** `borradorStock` se arma desde el estado `lineas` renderizado con `productoId: l.producto.id`, `cantidad` y `controlaStock` para cada fila; `claveStock` y el efecto `stockCtl.actualizar` se mantienen como en los casos vecinos PRO330-57/58.

**Caso PRO330-61 corregido (líneas ~389–403):** ahora inspecciona explícitamente ambos wrappers, la firma de `agregar`, el estado `lineasActuales.current`, el `find` por UUID, dos llamadas de `aplicarLineas` dentro de la función, la ausencia de escrituras directas `setLineas` en ese flujo, la implementación sincronizada de `aplicarLineas`, y el armado del `BorradorStock`.

No reemplaza el caso por `true`, no borra su finalidad, no elimina los controles de stock y no cambia el contrato del código productivo.

## 3. Revisión de casos vecinos

Inspeccionados estáticamente **PRO330-57..63** en `stock-preventivo.casos.ts`:
- 57: `controlaStock` y borrador derivado de líneas;
- 58: efecto de actualización de stock al cambiar `claveStock` y limpieza;
- 59: avisos y reintento;
- 60: bloqueo por pendientes/insuficiencia;
- 61: flujo unificado nuevo;
- 62: destaque visual de insuficiencia;
- 63: imports de módulo preventivo libres de Node.

**No se identificó otra contradicción estructural evidente en esos casos**, pero no se afirma que hayan pasado sin ejecutarlos. La prueba de `PRO330-61` es principalmente **una aserción de estructura del código**; no sustituye un test real de React, petición de stock o navegador.

## 4. Decisión de secuencia y gate operativo

**PRO-330-T01: CONFORME ESTÁTICAMENTE.** Ningún T02 solicitado por este hallazgo; el caso legado quedó alineado con la arquitectura actual. PRO-330 y PRO-341 siguen `In Review` por carecer de ejecución/homologación; no marcar `Done` por esta auditoría.

**Ninguna orden nueva de desarrollo activa por esta decisión.** PRO-340 (pantalla admin) sigue `Todo` / NO AUTORIZADA. No modificar límite de empresas reales ni ejecutar migración, tests o deploy.

**Gate crítico de instalación vigente:** NEX-078 `empresas.fe_max_lineas` está versionada pero NO aplicada. Habilitar las versiones dependientes de PRO-339/341 sin aplicar/verificar el schema hace que **toda FE nueva se rechace con HTTP 422**. Requiere ventana, respaldo, preflight, aplicación y verificación coordinada por responsable, y homologación funcional autorizada **antes** de activar versión dependiente. Esta auditoría no autoriza acciones operacionales.
