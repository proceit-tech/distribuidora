# AUD-NEXIT-CASA-MINGO-E02-R01 — Stock y baja de inventario en FE

**Fecha:** 20/10/2026  
**Commit funcional auditado:** `51181fbcc10805c39b1306609c0677e1527f1af0`  
**Requisito:** `documentacao/definicoes/HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md`, E02; `REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md` §5.A.  
**Alcance:** migración nueva NEX-067, scripts de preflight/verificación/reversión, integración servidor y UI, orquestación de revisión, pruebas y compatibilidad con motor NEX-014 y emisora NEX-065.  
**Tipo de inspección:** lectura estática del diff y de archivos versionados en GitHub; **SIN ejecutar PostgreSQL, Docker, VM, migración, suite Node/TypeScript, build, SIFEN o navegador**. Los resultados de tests son **declarados por Claude**, no reproducidos por el auditor.

## Veredicto
**CORRECCIÓN OBLIGATORIA — NO APLICAR NEX-067 NI DESPLEGAR E02.**
- **F-001 ALTA:** los movimientos SALIDA/VENTA ligados a FE pueden anularse manualmente por `inventario_anular_movimiento` sin cancelación oficial SIFEN, repone stock y deja vínculo fiscal a una salida anulada.
- **F-002 MEDIA:** la validación SQL de asignaciones contra el payload omite detalles fiscales que no coincidan con un producto de catálogo; un `Detalles` vacío/desconocido con `p_asignaciones=[]` pasa la conciliación y crea FE sin baja. La ruta HTTP normal prepara los detalles desde el catálogo y mitiga el caso ordinario, pero el contrato atómico `SECURITY DEFINER` no garantiza por sí solo la integridad declarada.
- Pruebas operacionales faltantes de SQL real, grants, concurrencia y UI. **No iniciar E03** hasta nueva auditoría R02 según protocolo. E01 no se homologa por esta auditoría.

## Matriz RN/CA → evidencia → estado

| Criterio | Evidencia de código | Estado |
|---|---|---|
| Solo saldos DISPONIBLE/PROPIO por empresa, depósito activo y alcance | `NEX-067` líneas 64–88, `fe_stock_disponibilidad`; `stock-fe.ts` líneas 118–144 | Conforme estático |
| Reparto automático por depósito/lote y fracciones | `stock-fe.ts` líneas 30–101, asignación determinística BigInt; cantidad SQL numeric | Conforme estático |
| Vista previa sin baja y muestra origen | `app/api/facturas/previa/route.ts` líneas 27–34; `page.tsx` resumen stock | Conforme estático, sin navegador |
| Factura y varias salidas transaccionales | `fe_documento_crear_fe_con_stock` invoca creación y `fe_stock_baja_documento` en la misma función SQL | Conforme en diseño, ejecución PG NO_VERIFICADO |
| Bloqueo concurrente, costo y saldo | `fe_stock_baja_documento` usa locks costo/saldo y motor `inventario_agregar_linea` | Plausible, PG real NO_VERIFICADO |
| No emitir sin baja ni alterar FE ya creada | Nuevo wrapper, revocación de `fe_documento_crear_fe` a `nexit_runtime`; `repartoHuella` de revisión | Parcial; F-001 y F-002 vulneran invariantes globales |
| Movimiento ligado a FE no anulable fuera de cancelación | `inventario_anular_movimiento` NEX-014, sin guarda FE del nuevo vínculo | **F-001 ALTA** |
| Validar que cada detalle fiscal corresponde a producto conocido y control de stock | `fe_stock_baja_documento` líneas 145–161 solo join de `Detalles` por `dCodInt`; los no coincidentes desaparecen del conjunto esperado | **F-002 MEDIA** |
| Scripts de operación seguros | preflight/verificar/reversion NEX-067 versionados | Revisados estructuralmente; no ejecutados |
| No cambiar NCE, KuDE, gateway ni migration aplicada | Diff sin esos servicios operacionales | Conforme estático |

## F-001 — ALTA — Anulación manual indebida de movimientos FE

**Archivos y evidencia**
- `NEX-067-facturacion-stock-baja-fe.sql` líneas 171–196: cada salida FE se registra como `movimientos_inventario.tipo_movimiento='SALIDA'`, `tipo_origen='VENTA'`, y se vincula en `documento_electronico_stock_salidas`; la inmutabilidad solo protege el **registro de vínculo**.
- `NEX-014-movimientos-operativos.sql` `inventario_anular_movimiento` (líneas aprox. 369–435): autorizado a usuarios con `MOVIMIENTOS.ANULAR`, trata `SALIDA` genérica devolviendo `ENTRADA` y actualiza el movimiento original a `ANULADO`. **No consulta la tabla de vínculo nueva ni estado de SIFEN.**
- `PROCEDIMIENTO-NEX-067.md` línea 25 incluso contempla anulación manual autorizada de salida vinculada; ese atajo contradice la decisión posterior de que la FE solo se revierte tras evento oficial.

**Impacto:** usuario administrativo puede reponer stock sin cancelar FE en SIFEN. Los saldos ya no representan las FE emitidas; el vínculo sigue apuntando a una salida `ANULADO` y el reintento FE la considera bajada (link existente). Una reversión automática E10 futura podría duplicar devolución.

**Corrección esperada:** protección **incremental en NEX-067**, sin reescribir NEX-014 ya aplicada, que impida `inventario_anular_movimiento` afectar una `SALIDA` ligada a FE (p. ej. trigger seguro en la transición de estado a ANULADO con lectura del vínculo, de modo que la operación completa se deshaga), independientemente de que el usuario sea administrador. Solo el futuro procedimiento fiscal confirmado podrá registrar compensaciones específicas y auditables. Revisar concurrencia e inmutabilidad; evitar que una ruta alternativa abra la misma excepción. **No implementar E10 ahora.** Eliminar recomendación de anular manualmente FE de procedimiento.

**Testes necesarios:** saldo FE A3+B3; intento de anular cada SALIDA por usuario con MOVIMIENTOS.ANULAR → error con detalles claros, ningún movimiento de compensación ni aumento de saldo; anular SALIDA MANUAL no ligada a FE debe continuar funcionando; reintento de FE no crea baja adicional; repetición concurrente.

## F-002 — MEDIA — Conciliación SQL omite detalles no asociados a productos

**Evidencia:** `NEX-067` líneas 145–159:
```sql
FROM jsonb_array_elements(COALESCE(v_payload->'Detalles', '[]'::jsonb)) d
JOIN public.productos p ON p.empresa_id = p_empresa
  AND p.codigo = d->>'dCodInt' AND p.controla_stock
```
La comparación con las asignaciones cubre solo productos del catálogo con coincidencia de código. Si `Detalles` está vacío, no es array, carece de `dCodInt`, o todos los códigos son desconocidos, **no se genera ninguna fila esperada**; con `p_asignaciones=[]`, el `FULL JOIN` tampoco genera filas y la función `RETURN 0` sin baja. `fe_documento_crear_fe` preexistente valida `iTiDE`, `Subtotales` y total, pero no la presencia/identidad de todos los detalles fiscales. La API `prepararFactura` se basa en productos reales, por lo que el flujo UI ordinario está mitigado; el contrato DB no debe permitir el bypass con payload inválido.

**Corrección esperada:** validar que `Detalles` es un array **no vacío**, que todos los detalles fiscales refieren inequívocamente a productos de la empresa y que los tipos de producto/control_stock corresponden a la asignación exigida. Servicios válidos siguen admitidos sin salida; ni una mercancía controlada puede omitirse de la conciliación. No convertir mercadería a servicio ni inventar cantidad.

**Testes necesarios:** una FE con línea de mercadería real y `p_asignaciones=[]` falla; `Detalles=[]` o detalles sin `dCodInt` / código desconocido y total positivo falla sin FE ni numeración; servicio real sin control de stock se permite; FE mixta solo registra stock para mercadería; payload modificado no puede reutilizar idempotencia.

## Observaciones de rollout (no hallazgos extra en esta auditoría)

- `NEX-067` no aplicada; el nuevo código falla cerrado sin funciones SQL nuevas. **Prohibido** desplegar antes de aplicar una migration corregida, verificaciones reales y backup autorizado.
- Retries de FE históricas emitidas **antes de E02** reutilizan documento por idempotencia pero NO generan baja retroactiva; el preflight cuenta las FE anteriores. No reponer ni rebajar históricas a ciegas; documentar transición y distinguirlas en soporte/auditoría.
- Cancelación oficial/compensación fiscal sigue en E10. Hasta ella, el sistema no repone automáticamente por rechazo/cancelación y requiere gestión operativa; no etiquetar la E02 como solución completa de ese ciclo.
- Las 32 pruebas `stock-e02` y las regresiones/TS/ESLint fueron reportadas por Claude (0 fallas), **no repetidas**. Su simulador emplea `Number`/comparaciones aproximadas y no ejecuta PL/pgSQL real. Para afirmar atomicidad, grants y concurrencia falta evidencia del responsable en PostgreSQL.

## Gate E02-R02

Claude debe corregir solo F-001 y F-002, añadir tests de regresión y actualizar scripts/procedimiento, sin tocar NEX-014 aplicada ni E03. Emitir SHA, conteos de tests, límites y parar para auditoría ChatGPT **E02-R02**. Nadie aplica migration SQL en VM hasta aprobación técnica y ejecución autorizada por el responsable. Mantener PRO-200/PRO-93 abiertos; no marcar Done/homologado.
