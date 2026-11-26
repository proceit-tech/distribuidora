# ORDEN CORRECTIVA ÚNICA — CLAUDE — PRO-330 R01-F001 / límite 500 en previa y emisión

**Fecha:** 29/10/2026 · **Estado:** SOLO ESTE CORRECTIVO AUTORIZADO, no reejecutar la implementación general.  
**Origen:** [AUDITORÍA INDEPENDIENTE PRO-330 R01](../testes/AUD-NEXIT-PRO-330-STOCK-INMEDIATO-R01-2026-10-29.md) — **F-001 ALTA**.  
**Commit funcional a corregir:** `2b54b468359c00df4726bc55b592bc9d9d5fff18`.  
**Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.

## Diagnóstico y regla técnica cerrada por ChatGPT

El endpoint de la PRO-330 ya tiene `consultarDisponibilidadEnLotes`, que divide UUID en tandas de 500 y conserva el mismo cálculo mediante `asignarStock`. Pero `planificarStock` (reutilizado por `/api/facturas/previa` y `crearFacturaElectronica`) aún llama a `consultarDisponibilidad` directamente, pasando 501–999 UUID a `fe_stock_disponibilidad` (NEX-067). La función SQL retorna 0 filas cuando recibe más de 500 UUID. Resultado: aviso preventivo suficiente y posterior 409 falso. Esta contradicción **F-001 ALTA** es la única corrección ordenada.

**Desarrollar SOLO:**
1. Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `REQ-NEXIT-CM-PRO-330-STOCK-AL-CARGAR-LINEA-2026-10-29.md`, auditoría R01 completa y archivos autorizados.
2. Comprobar `git status --short`, rama, fetch/merge fast-forward sin descartar ni sobrescribir cambios locales.
3. En `lib/facturacion/stock-fe.ts::planificarStock`, cambiar EXCLUSIVAMENTE la llamada de lectura de saldos por la función `consultarDisponibilidadEnLotes` ya presente, con los UUID únicos controlados, conservando:
   - `controladas.length===0` → `asignarStock([],[])`;
   - la firma pública, tipos, retorno `asignarStock(lineas,saldos)` y orden deterministic FEFO;
   - la distribución, `huellaReparto`, `asignacionesSql`, mensajes 409, la previa, idempotencia, baja/rollback y todos los efectos fiscales/stock de la emisión.
4. Añadir casos **reales de lógica** (mocks locales del contrato SQL, NO meras búsquedas regex) en `lib/facturacion/stock-e02.casos.ts` o `lib/facturacion/stock-preventivo.casos.ts`:
   - 501 productos controlados únicos, cantidad 1 y disponible 1 ⇒ 2 llamadas con tamaños 500+1, `planificarStock.suficiente===true`, 501 salidas;
   - 501 con 1 producto realmente insuficiente ⇒ insuficiente únicamente por ese UUID y cantidades correctas;
   - repetición del mismo SKU ⇒ una sola consulta por UUID y suma 1+2;
   - servicios sin control no entran al lote;
   - caso pequeño de referencia compara reparto, orden y `huellaReparto` antes/después, sin alterar bytes fiscales ni `repartoHuella` de una revisión válida.
5. Si el modelo de tests no admite ejecutar un caso de 501, escribir el caso con mocks y reportar impedimento técnico específico. No resolver ampliando otras capas.

**Archivos autorizados para EDITAR exclusivamente:**
- `lib/facturacion/stock-fe.ts`;
- `lib/facturacion/stock-e02.casos.ts`;
- `lib/facturacion/stock-preventivo.casos.ts`.

Prohibido modificar `page.tsx`, endpoint `stock/disponibilidad`, APIs de previa/emisión, SQL/migrations NEX-067/076, `CLAUDE.md`, PROGRESSO, Linear, documentación gerencial, NCE, KuDE, PRO-328/327, inventario, precios, o cualquier tarea del paquete PRO-329.

**NO EJECUTAR** tests, lint, typecheck, build/CI manual, SQL, PostgreSQL, Docker, VM, gateway, emisión real o deploy en esta orden. Casos escritos como código, **TESTES NÃO EXECUTADOS**. La nueva versión debe publicarse como commit+push focal, reportando SHA completo, casos añadidos y bloqueos reales, y **PARAR para auditoría independiente R02 del ChatGPT**. No abrir automáticamente PRO-333 u otra issue.
