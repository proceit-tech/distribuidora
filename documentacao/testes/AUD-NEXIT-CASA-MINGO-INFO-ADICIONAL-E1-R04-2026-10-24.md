# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R04 — Auditoría independiente

**Fecha:** 24/10/2026.  
**Repositorio:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado (HEAD confirmado):** `7f3ba24c42a1bb6c857a95b8dfeb7c204bb4ea42`.  
**Linear:** PRO-292 / PRO-300 (F001/F002 de R03); nuevas incidencias E1-R04-F001 y E1-R04-F002.  
**Antecedente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R03-2026-10-24.md`.  
**Requisito y protocolo:** `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`, `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`.

## Método y limitaciones

Se confirmaron branch/HEAD y los 9 archivos del diff. Se revisaron el SQL NEX-071 completo, preflight, verificación, reversión y procedimiento; `lib/facturacion/info-adicional.ts`, `nce.ts`, `nce-emision.ts`, `info-adicional-e1.casos.ts`, motor E07 `payload-nce.ts`, pruebas E07 y la versión NEX-070 de `fe_documento_crear_nce`.

**No se ejecutaron PostgreSQL, navegador, gateway, VM, Docker, migrations, build ni suite global.** Tampoco se reejecutaron tests Node/TypeScript/ESLint por ChatGPT. Claude informó `info-adicional-e1` 29/0, `entrega-e04` 70/0, regresiones NCE/FE todas 0 y TypeScript/ESLint puntuales limpios. El SQL solo tiene pruebas estructurales/estáticas; se necesita validación PostgreSQL antes de aplicarlo.

## Dictamen sobre los defectos R03

| Control | Evidencia de código | Dictamen |
| --- | --- | --- |
| R03-F001: no borrar observaciones históricas por inferencia | `propuestaCorreccion` lee `observacionOriginalDe(empresaId,nceId)`, y si no existe registro conserva `nce_origen.observacion` completo; se eliminaron `separarObservacion` y el comparador por nombre | **CONFORME en inspección estática**; no se probó DB |
| R03-F002: no confundir el `dInfAdic` compuesto con input original | `repeticion` obtiene `nce_observaciones_originales.observacion` y la compara con `cuerpo.observacion.trim()`; sin registro usa `legadoCoincide` conservador, que no acepta marcador automático | **CONFORME para colisiones de R03**, con F002 residual sobre igualdad *exacta* |
| Atomía de NCE nueva + observación original | `fe_documento_crear_nce_obs` delega a `fe_documento_crear_nce` e inserta dentro de la misma llamada/tx si `NOT v_reutilizado`. Se conservan PK/FK por empresa y triggers solo-altas | **Diseño conforme estático**, funcionamiento SQL aún sin probar |
| Compatibilidad sin migration | `observacionOriginalDisponible` via `to_regclass`; `crearNotaCredito` llama función antigua si tabla no existe. NCE antiguas no reciben metadatos inventados | **Conforme estático** |
| Integridad operativa | Migration NEX-071 versionada y NO aplicada, con scripts y procedimiento | **Pendiente de PostgreSQL real** |

**E1-R04: NO CONFORME para cierre del flujo NCE completo:** los defectos originales están sustancialmente resueltos, pero se demostraron dos nuevas fallas en la semántica de idempotencia del mismo camino crítico.

## E1-R04-F001 — ALTA — Servicio DESCUENTO no participa en repeticion()

**Ubicación:** `lib/facturacion/nce-emision.ts`, `repeticion` (líneas aprox. 22–69); tabla `nce_descuentos` creada en NEX-070. El motor `payload-nce.ts` define una NCE con servicio `DESCUENTO` como **sin `nce_lineas`** y un `nce_descuentos.monto` persistido.

**Contraejemplo a partir del código:**
1. Emitir NCE motivo 3 (Descuento) con servicio `{monto:"30000"}`, sin líneas, observación `Nota`, punto/sucursal/FE X, clave K. La NCE queda creada con `nce_descuentos.monto=30000`.
2. Repetir clave K, mismos FE/punto/sucursal/motivo/observación pero `servicio:{monto:"50000"}`, también `lineas:[]`.
3. `repeticion` valida la observación original (NEX-071), consulta **solo** `nce_lineas`. Como `nce_lineas` está vacía en ambas solicitudes y `cuerpo.lineas` también, tamaño y comparación pasan sin verificar servicio. Devuelve el documento/número **de 30000** como si el nuevo cuerpo de 50000 fuera el mismo.

Es un defecto preexistente E07 descubierto al auditar el camino de idempotencia; no es causado por la nueva NEX-071. La función SQL de creación no protege esta ruta porque `emitirNce` devuelve el documento desde `repeticion` ANTES de llamar la función SQL.

**Aceptación:** cuando haya `cuerpo.servicio`, comprobar la presencia/ausencia y el monto exacto o decimal-normalizado conforme al contrato en `nce_descuentos`, por la misma empresa y `nce_id`, sin permitir intercambiar NCE por líneas con servicio. Mismo monto legítimo reutiliza la NCE; distinto monto da **409**. Preservar comprobaciones de observaciones/FE/motivo/sucursal/punto/ACL, concurrencia/numeração/CDC e idempotencia para otros motivos. Si NEX-070 no existe, la consulta a `nce_descuentos` debe ser compatible con su ausencia; no ejecutar DDL en runtime. Añadir pruebas ejecutando `repeticion`, no solo checks de texto, para motivos 3/4 con servicios iguales/distintos y modos con/sin NEX-070.

## E1-R04-F002 — MEDIA — Se registra observación normalizada, no la original exacta

**Ubicación:** `lib/facturacion/nce.ts`, `crearNotaCredito` (usa `cuerpo.observacion.trim()` al mandar el 12.º parámetro), `lib/facturacion/nce-emision.ts`, `repeticion` (usa `cuerpo.observacion.trim()` para comparar).

**Contraejemplo:** crear una NCE con observación original `" Nota "`; el wrapper almacena `"Nota"`. Reenviar misma clave con `"Nota"` se acepta como el mismo input, aunque las entradas originales difieren. Lo mismo ocurre con saltos de línea/espacios al principio o final. La especificación de la NEX-071 y el reporte del desarrollador declaran guardar la observación **exacta**; la implementación actual guarda el valor **recortado**.

Esta normalización puede ser una regla de negocio válida si se decide expresamente, pero **no se debe describir como exactitud de entrada** ni usarla para garantizar igualdad byte a byte. La exigencia registrada para R03 era guardar y comprobar el valor original. **Corrección pedida:** persistir la cadena cruda recibida y compararla sin `.trim()` o, si se pretende identidad por normalización, pedir una decisión formal y actualizar el contrato, los tests y la evidencia. Mantener composición `dInfAdic` compatible con J003 (actualmente se normaliza visualmente con `.trim()`) y validar límites apropiados también sobre la entrada cruda; no romper la presentación fiscal. Probar `" Nota "` vs `"Nota"`, `"\nNota"` vs `"Nota"`, vacío vs espacios, documento histórico y renombre de usuario.

## Observaciones y riesgos no homologados

- `NEX-071` requiere NEX-070. Su instalación no se probó en PostgreSQL: confirmar grants y propietario de `SECURITY DEFINER`, triggers de solo-altas, runner/registro de migraciones y rollback bajo un entorno controlado antes de la VM operacional. No marcar SQL validado por regex como si fuese ejecución real.
- `verificar-NEX-071.sql` comprueba tabla vacía inmediatamente al aplicar; este control debe correrse antes de emitir nuevas NCE, para no producir falsos errores si ya hay filas.
- Las NCE anteriores a NEX-071 pueden rechazar un reenvío legítimo 409 por falta de procedencia, según diseño conservador explicitado y sin reenvío fiscal ciego. No desbloquear con comparación heurística.
- La etiqueta «exacta» requiere corregir la diferencia de `.trim()` referida en F002.
- F002/F003 originales de E1 (marcador de vendedor y huella de revisión) no fueron modificados materialmente en este diff; no hay regresión demostrada. No se verificó visualización KuDE real.

## Gate siguiente

**Corrección focal de E1-R04-F001 (servicio DESCUENTO) y E1-R04-F002 (semántica de observación cruda), sin reescribir NEX-071 fuera del mínimo.** ChatGPT registra Linear, PROGRESSO y la auditoría; Claude solo implementa/tests unitarios/focais/commit/push y detiene para R05. No VM/SQL aplicado/deploy, no PRO-293 y no Done/Homologación.
