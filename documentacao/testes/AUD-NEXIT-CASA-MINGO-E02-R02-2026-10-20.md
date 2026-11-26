# AUD-NEXIT-CASA-MINGO-E02-R02 — Protección de salidas FE y conciliación fiscal/stock

**Fecha:** 20/10/2026  
**Commit funcional auditado:** `19071947d1392f4b27335803c43c22bbde5bd2ac`  
**Baseline E02-R01:** `51181fbcc10805c39b1306609c0677e1527f1af0`.  
**Informe anterior:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-E02-R01-2026-10-20.md`.  
**Tareas:** PRO-202 (ALTA), PRO-203 (MEDIA), PRO-200, PRO-93.

## Alcance y resultado

**Veredicto: E02-R02 ESTÁTICAMENTE CONFORME; F-001 y F-002 CORREGIDOS.** Sin nuevos hallazgos bloqueantes en el patch auditado.

**NO HOMOLOGADA, NO APLICADA:** auditor revisó diff, SQL, código y tests en GitHub, comparando NEX-067 con NEX-014, NEX-009, NEX-007 y el generador fiscal real de FE. **No ejecutó scripts SQL, motor PostgreSQL, VM, Docker, navegador, build, Node ni gateway.** No marcar Done en Linear ni habilitar aplicación de migration sin validación operativa controlada. **E03 puede comenzar como fase de desarrollo aislada tras este gate estático**, con commit y parada para auditoría E03-R01.

## F-001 — PRO-202 — CORREGIDA EN CÓDIGO

- `NEX-067-facturacion-stock-baja-fe.sql`: función `fe_stock_movimiento_protegido()` con `SECURITY DEFINER SET search_path=public,pg_temp` y trigger `fe_stock_movimiento_protegido_trg BEFORE UPDATE OF estado` en `movimientos_inventario`.
- Ante `NEW.estado='ANULADO'` y movimiento existente en `documento_electronico_stock_salidas`, lanza `P0001` / `NEX:MOVIMIENTO_VINCULADO_FE`. No depende de permisos del usuario; protege también las operaciones administrativas.
- `inventario_anular_movimiento` (NEX-014) inserta su compensación y luego actualiza la salida original. Si el trigger genera excepción, la misma llamada SQL falla y se revierte el trabajo de la transacción: no queda compensación ni saldo reingresado **en la semántica prevista de PostgreSQL**. La función existente NEX-014 no fue modificada.
- Los triggers del mismo tipo/evento se ejecutan por orden de nombre: `fe_stock_movimiento_protegido_trg` precede a `movimientos_inventario_guard_trg` de NEX-009. La protección no requiere esa precedencia para el resultado de rechazo: ambos son BEFORE y una excepción aborta la operación.
- `lib/movimientos/shared.ts` traduce el error a HTTP 409. `PROCEDIMIENTO-NEX-067.md` retiró las instrucciones incompatibles que sugerían anulación o entrada manual de FE y añadió pruebas operacionales S-09 y S-10. `verificar-NEX-067.sql` reconoce el trigger y la reversión lo elimina.
- **Pruebas declaradas:** escenarios F001 con FE distribuida A/B, operación repetida/concurrente y salida manual no ligada; el simulador modela el efecto, no prueba el trigger real. **S-09 y S-10 siguen obligatorias en PostgreSQL**.

## F-002 — PRO-203 — CORREGIDA EN CÓDIGO

- `fe_stock_baja_documento`, NEX-067: tras obtener la solicitud fiscal persistida, exige `Detalles` JSON array no vacío. Itera **todos** sus elementos por `jsonb_array_elements` con `LEFT JOIN` al catálogo de productos de la empresa, verificando `jsonb_typeof(det.d)='object'`, `dCodInt` no vacío y presente, `dCantProSer` tipo JSON numérico positivo. Ante error: `NEX:STOCK_PAYLOAD_INVALIDO`.
- La comparación de totales `es` vs `da` por producto controlado sigue en SQL; por eso mercadería con asignación faltante o adicional falla y servicios legítimos sin control no generan movimiento. El catálogo tiene `UNIQUE(empresa_id,codigo)` (NEX-007), evitando correspondencia ambigua.
- El payload fiscal real generado en `lib/facturacion/payload-fe.ts` emite `Detalles[].dCodInt` como cadena y `dCantProSer` como número JSON, congruentes con los predicados introducidos. La ruta `respuestaErrorFacturacion` responde 409 a `NEX:STOCK_PAYLOAD_INVALIDO`.
- **Pruebas declaradas:** 11 payloads inválidos y casos positivos de servicio, mixto y producto repetido, con observación de rollback **simulada**. El simulador usa `Number` para sus saldos; PostgreSQL real usa NUMERIC y la aplicación BigInt para planificar. Esto limita la extrapolación a cantidades límite/fraccionarias.

## Alcance del commit y QA

Cambios funcionales: NEX-067, `lib/facturacion/shared.ts`, `lib/movimientos/shared.ts`, tests E02. Scripts de verificar/reversión/procedimiento y progreso actualizados; sin ediciones funcionales a NEX-014, KuDE, NCE, gateway o FE payload.

**Resultados informados por Claude, no reejecutados:**
- `stock-e02`: 61 verificaciones / 0 fallos.
- Inventario/movimientos 20; movimientos intento 30, historial 15, inicializacion 17; facturacion 271; ajuste-fiscal 41; monedas 84; credito 91; pagos 77; rediseno 90; revision-factura 42; cantidad-e01 16; visual-v1 29; todos 0 fallos.
- TypeScript del proyecto de casos y ESLint dirigido: informados limpios.

### Limitaciones y observaciones no bloqueantes

- `verificar-NEX-067.sql` comprueba existencia del trigger, **no su comportamiento en vivo** (lo harán S-09/S-10).
- `respuestaErrorFacturacion` agrupa `STOCK_PAYLOAD_INVALIDO` bajo un mensaje genérico de reparto cambiado, aunque el problema sea detalle fiscal inválido; los rechazos son seguros, pero podría especializarse el texto si surge necesidad de soporte. No abrir otra ronda cosmética.
- Las FE previas a NEX-067 no reciben baja retroactiva, por decisión del procedimiento. Identificar ese corte en despliegue y auditoría.
- **Dependencia del ciclo fiscal:** E10 aún no implementa reversión oficial de FE cancelada. No confundir protección contra anulación manual con stock ya reversible; evaluar rollout con ese riesgo documentado y habilitar sólo después de pruebas reales. Si la FE termina rechazada, la política temporal impide compensación manual de las salidas vinculadas: no declarar flujo fiscal completo.

## Gate

1. **PRO-202 / PRO-203: corregidos estaticamente**, pero estatus de homologación y pruebas con PostgreSQL pendientes; no marcar Done.
2. **Se autoriza el desarrollo E03 (descuentos FE por línea y global)** como nueva entrega independiente; Claude leerá requisitos, implementará una sola fase, ejecutará pruebas dirigidas, hará commit/push, documentará SHA y se detendrá para auditoría. No desplegar E02 ni tocar migraciones aplicadas.
3. El responsable aplicará NEX-067 **solamente** tras respaldo, preflight, revisión de migraciones pendientes, autorización expresa, verificación y S-01…S-10 incluyendo concurrencia real/grants/trigger.
