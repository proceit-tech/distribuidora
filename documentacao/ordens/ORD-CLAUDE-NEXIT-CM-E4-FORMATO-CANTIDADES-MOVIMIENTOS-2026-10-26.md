# ORDEM FOCAL E4 — PRO-295 / PRO-79 — Cantidades legibles en Movimientos de stock (26/10/2026)

**Proyecto:** NEXIT V1 / Casa Mingo · **Repositorio:** `proceit-tech/distribuidora` · **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Alcance autorizado por el responsable:** quitar las casas decimales redundantes de los enteros presentados en `Movimientos de stock`. **No convertir cantidades fraccionarias a enteros**, ya que el dominio admite `numeric(18,4)`.
**Análisis y referencias:** `documentacao/analises/ANA-NEXIT-REPORTES-VENTAS-COMPRAS-MARGEN-MOVIMIENTOS-2026-10-26.md`, `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`. Tareas Linear: PRO-295 y PRO-79. **NO ejecutar E5/E6 en esta entrega.**

## 1. Verificación de código actual antes de modificar

1. Sincronizar branch oficial; leer enteros los archivos `CLAUDE.md`, análisis E4/E5/E6, `lib/formato/listas.ts`, `app/(private)/movimientos/page.tsx`, `app/(private)/movimientos/[id]/page.tsx`, `app/(private)/movimientos/nuevo/page.tsx`, `types/movimientos-stock.ts` y cualquier exportación realmente existente para Movimientos.
2. Distinguir "número entero con ceros finales" de "cantidad fraccionaria real". Código actual `formatearCantidad` usa `maximumFractionDigits:2` con mínimo 0: **ya debería mostrar `1` en lugar de `1,0000`**. No inventar defecto que no existe en esa ruta de la rama. Identificar si hay otro formateador/superficie donde aparecen ceros redundantes.
3. El modelo físico `movimiento_lineas.cantidad numeric(18,4)` permite 4 decimales: actualmente `0,0001` corre riesgo de visualizarse como 0 con formatter de 2 decimales. Revisar impacto y usos compartidos antes de tocar la utilidad.

## 2. Ajuste mínimo

- Presentación en **es-PY** de cantidades de Movimientos con hasta 4 decimales significativos y **sin ceros finales**. Ejemplos de contrato: `1.0000→1`, `100.0000→100`, `2.5000→2,5`, `0.0001→0,0001`, `-1.2500→-1,25`. Separador de miles: punto; decimal: coma.
- Aplicar solo donde se muestran cantidades (listado, detalle y líneas, controles informativos si existen); no cambiar formularios que aceptan fracciones ni otros módulos sin necesidad. Si `formatearCantidad` es compartido y el cambio afectaría ámbitos no autorizados, crear o usar helper focal en Movimientos. Evitar una migración de tipos por este cambio de UI.
- Asegurar que un entero, valor cero o movimiento inverso no presente coma decimal o zeros de relleno. Mantener identificación de la unidad y signo; no pasar valores indefinidos como datos reales.
- **NO** utilizar `toFixed(0)`, `Math.round`, `Math.trunc` ni `numeric::integer` para ocultar fracciones de stock. **NO** modificar los valores persistidos, cálculos, IVA, inventario, validaciones, SQL, endpoint, DTO, ids ni permisos.
- Si la rama YA cumple íntegramente el contrato indicado y no hay cambio justificable, **no fabricar patch ni commit funcional**: demostrar por lectura estática y reportar posible desfase de versión del ambiente para verificación humana futura.

## 3. Entrega y parada

- Leer archivos completos ANTES y DESPUÉS, confirmar cascada/efecto exacto y alcance. Informar cada ruta de presentación afectada, ejemplos calculados por inspección del código y cualquier riesgo conocido; **no afirmar pruebas ejecutadas**.
- Si existe defecto real de presentación, hacer commit/push únicamente del patch focal en branch oficial; reportar SHA completo y archivos. No marcar issues Done.
- **Prohibido:** tests/lint/typecheck/build/CI por IA, browser, SQL/migrations, VM, PostgreSQL, API externa, SIFEN, FE real o deploy (sin autorización expresa de responsable). No tocar E5 Ventas, E6 Compras, informe Gerencial, KuDE o roles.
- **PARAR PARA AUDITORIA DEL CHATGPT**. El responsable humano comprobará la pantalla real después de la revisión del código. No iniciar otra etapa sin orden.
