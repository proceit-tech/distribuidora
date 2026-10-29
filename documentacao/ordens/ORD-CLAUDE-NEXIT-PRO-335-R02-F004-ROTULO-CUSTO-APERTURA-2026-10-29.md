# ORDEN CORRECTIVA ÚNICA — CLAUDE / PRO-335 — R02-F004: moneda del rótulo de costo de apertura

**Fecha:** 29/10/2026 · **Issue:** [PRO-335](https://linear.app/proceit/issue/PRO-335) · **Auditor:** ChatGPT · **Desarrollador:** Claude.  
**Rama:** `feature/NEXIT-2026-001-banco-demo` · **Repo:** `proceit-tech/distribuidora`.  
**Commit R01 correctivo auditado:** `dd310116c8bb86425114e41f30741ab7c1cd053b`.  
**[Auditoría independiente R02](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R02-2026-10-29.md):** F-001 cerrado estáticamente (KPI multimoneda), F-003 cerrado estáticamente (límites clientes), F-002 correcto en vistas de lectura; **R02-F004 pendiente** en la etiqueta del input editable de apertura.

## 1. Problema concreto, sin modificar el valor editable

Actualmente `app/(private)/productos/_components/pestanas/inventario.tsx` (cerca de líneas 18–19, 59) usa `catalogos.monedaReferencia`, que representa la **moneda de la lista de precios de venta**, para el texto `Costo unitario de apertura (XXX)`. Sin embargo, `lib/productos/shared.ts::registrarInventarioInicial` registra la apertura con la moneda BASE de la empresa por el contrato de NEX-009 `inventario_registrar_movimiento`; el catálogo GET de Productos ya proporciona `catalogos.monedaBaseCosto` desde `empresas.moneda_base_codigo`.

Ejemplo: empresa base PYG y lista de precios USD. El rótulo actual dice «Costo unitario de apertura (USD)», aunque ese dato se contabilizará en PYG. **Mantener intacto el input y su precisión NO obliga a conservar un rótulo que induce a error monetario.**

## 2. Corrección EXCLUSIVA

1. Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, auditoría R02 completa y esta orden. Verificar rama, `git status --short`, sincronizar fast-forward sin descartar/stash cambios ajenos.
2. En `app/(private)/productos/_components/pestanas/inventario.tsx`, ajustar **SOLO** el cálculo de la **etiqueta** de `<Texto campo="inventarioInicial.costoUnitario" ...>`: el texto debe referenciar **`catalogos.monedaBaseCosto`**, no `catalogos.monedaReferencia`. Usar `rotulo` preexistente para mostrar `(PYG)`/`(USD)`. Si no existe `monedaBaseCosto`, mostrar «Costo unitario de apertura» sin código, nunca inventar ni poner referencia comercial. No alterar el campo editable ni el redondeo.
3. Conservar literalmente **`valor={form.inventarioInicial.costoUnitario}`**, **`alCambiar`**, `modo="decimal"`, `maxLength`, los cuatro decimales admitidos, validación, guardado, movimientos, impuestos, stock, precio de venta y los rótulos de costos históricos ya corregidos en R01.
4. En `lib/formato/monto-visual.casos.ts`, actualizar el caso estructural **`PRO335-R01-12`**, que actualmente contiene la afirmación equivocada `/Costo unitario de apertura\\$\\{moneda\\}/`. Debe dejar de exigir esa asociación y pasar a comprobar de modo concreto que la etiqueta procede de `monedaBaseCosto` y que el input mantiene su valor textual exacto, `alCambiar`, y modo decimal. Añadir casos **`PRO335-R02-19+`** para base PYG con lista USD, base USD con lista PYG, base ausente sin moneda inventada; la aserción estructural sobre metadata debe ser relevante y detectar futuras regresiones. No sustituir pruebas por comentarios o validación de regex solamente si una prueba de helper puro también es posible.
5. Archivos **AUTORIZADOS ÚNICOS**:
   - `app/(private)/productos/_components/pestanas/inventario.tsx`
   - `lib/formato/monto-visual.casos.ts`
6. Prohibido editar otros archivos: ni `app/api/productos/**`, `types/productos.ts`, endpoints, CSS, `lib/productos/shared.ts`, SQL, migrations, `CLAUDE.md`, LINEAR, plan, PROGRESSO, SIFEN/FE/NCE/KuDE ni PRO-337.

**NO EJECUTAR** tests, lint, typecheck, build/CI manual, PostgreSQL/SQL, VM, Docker, browser real, gateway, emisión o deploy. Los casos se ESCRIBEN pero no se ejecutan.

Al terminar, commit+push solo de los 2 archivos y reportar SHA completo, número de casos nuevos, rutas y detalle breve. Declarar explícitamente **TESTES NÃO EXECUTADOS**, y **PARAR para auditoría R03 ChatGPT**. No iniciar PRO-337 ni otra issue; no declarar DONE, producción u homologación.
