# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R03 — Auditoría independiente

**Fecha:** 24/10/2026  
**Repositorio/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado (HEAD confirmado al iniciar):** `dd7e9f7cc08793b24c0e70aaa9ab141c2c8bc18c`  
**Linear:** PRO-292, PRO-94, PRO-93; la corrección de idempotencia se registra también como hallazgo nuevo.  
**Auditoría precedente:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R02-2026-10-24.md`  
**Requisito:** `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`.

## Alcance y evidencia

Se verificaron HEAD y diff completos del commit, protocolos `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, requisito y estado E1, archivos modificados `lib/facturacion/info-adicional.ts`, `info-adicional-e1.casos.ts`, `nce.ts`, `nce-emision.ts`, SQL versionado `NEX-062` y `NEX-070` para la persistencia de `nce_origen.observacion`, y comportamiento de repetición/precarga.

**El auditor no ejecutó** los tests de Node/TypeScript/ESLint, navegador, PostgreSQL, gateway, VM, Docker, migrations ni deploy. Claude informó `info-adicional-e1 23/0`, `entrega-e04 70/0` y regresiones NCE/FE todas con 0 fallos, con lint/typecheck puntual limpio. Las cifras son evidencias **declaradas por Claude, no reproducidas independientemente**. La revisión estática identificó las dos entradas de contraejemplo siguientes, ausentes de los tests.

## Matriz de resultados E1-R03

| Invariante | Código observado | Veredicto |
|---|---|---|
| NCE con marca manual y otro vendedor (`Pablo` vs creador `Ana`) | `separarObservacion` preserva cuando nombre no coincide | **CORREGIDO para el caso específico R02** |
| NCE manual con marca y el MISMO nombre del creador | `separarObservacion` comprueba coincidencia de texto, no procedencia de las líneas | **NO CONFORME — E1-R03-F001** |
| Reenvío con clave existente y observación distinta | `coincideConObservaciones` acepta igualdad contra `dInfAdic` completo y patrón de sufijo sin fuente cruda registrada | **NO CONFORME — E1-R03-F002** |
| Separación visual F002 y huella F003 de la entrega anterior | El diff no modifica composición `componerInfoAdicional` ni huella SHA-256/revisión FE/NCE | **Sin regresión nueva demostrada** |
| Aislamiento por empresa | `vendedorEmisorDe` filtra `d.empresa_id=$1`, enlaza con `usuarios.empresa_id`; búsqueda de repetición filtra tenant/alcance | Conforme estático |
| Persistencia de origen de observación | `NEX-062`/`NEX-070` guardan `nce_origen.observacion` desde `p_payload->>'dInfAdic'` y `creado_por`, no el texto del operador por separado | **Procedencia no demostrable con esquema actual** |

## E1-R03-F001 — MEDIA — Emisor persistido no prueba procedencia de la observación

**Ubicación:** `lib/facturacion/info-adicional.ts:59-68` (`separarObservacion`), `lib/facturacion/info-adicional.ts:87-95` (`vendedorEmisorDe`), `lib/facturacion/nce.ts:519` (`propuestaCorreccion`).

**Contraejemplo determinista:** NCE histórica con creador Ana López (documentos_electronicos.creado_por vinculado a la cuenta actual Ana López) y observación redactada manualmente:
```text
Entrega especial
[Datos automáticos del sistema]
Vendedor: Ana López
```
Entonces `separarObservacion(texto, "Vendedor: Ana López")` retorna solo `"Entrega especial"`. Se pierden dos líneas **escritas por el operador**. El mismo resultado se obtiene si el operador tecleó de forma incidental el nombre que coincide con el creador. El nombre del creador en la tabla es autoritativo como **identidad del creador**, pero no como **procedencia de líneas de texto**. La coincidencia sigue siendo una inferencia textual, incluso con `creado_por`; el nombre de cuenta también es mutable.

**Impacto:** pérdida no autorizada de información comercial al corregir NCE rechazada; violación de preservar observaciones históricas. El test E1-38 ensaya solo el caso donde nombres difieren.

**Corrección exigida:** no quitar fragmentos históricos usando únicamente marcas/prefijos/nombres del creador. Separar de forma **fiable e inmutable** las observaciones originales y el bloque añadido por el sistema en documentos nuevos (p. ej., atributo de origen o valor crudo persistido de modo transaccional con la NCE). Para NCE históricas sin ese origen, mantener todo el texto conservadoramente; ningún metadato nuevo debe fingir haber existido antes.

## E1-R03-F002 — ALTA — Idempotencia acepta reutilización de clave con observaciones diferentes

**Ubicación:** `lib/facturacion/info-adicional.ts:74-84` (`coincideConObservaciones`) y `lib/facturacion/nce-emision.ts:22-66` (`repeticion`, que devuelve documento/número reutilizado).

**Contraejemplo determinista:**
1. NCE se crea con observación cruda vacía (`cuerpo.observacion=""`) y vendedor autenticado Luis Gómez; se persiste `nce_origen.observacion = "[Datos automáticos del sistema]\\nVendedor: Luis Gómez"`.
2. Un nuevo request con **la misma clave de idempotencia**, FE/motivo/ítems/punto iguales pero observación cruda modificada a `"[Datos automáticos del sistema]\\nVendedor: Luis Gómez"`.
3. `coincideConObservaciones(guardada, observacionesNuevas)` devuelve **true** debido a `g===obs`. `repeticion()` acepta reutilizar el documento, en vez del 409 obligatorio para cambio de contenido.

Se reproduce también con observación inicial `"Nota"` y nuevo texto crudo `"Nota\\n[Datos automáticos del sistema]\\nVendedor: Luis Gómez"`. Dado que solo se compara el `dInfAdic` compuesto, **dos solicitudes distintas producen el mismo criterio de identidad**. El test E1-22c no cubre esta colisión. Puede generar una confirmación de documento antiguo para una intención comercial distinta, sin verificar de forma estricta el contenido original del request. No hace falta fraude externo ni cambio en importe para ser una violación del contrato de idempotencia fiscal.

**Corrección exigida:** comparar el texto del operador del request original contra el nuevo, o una huella inmutable del cuerpo de entrada original que incluya la observación cruda, de forma consistente con la creación transaccional. Para documentos legados con origen no recuperable, rechazar con 409 cuando la identidad no pueda probarse; no aceptar una coincidencia ambigua ni reservar nueva numeración. Preservar reenvíos legítimos cuando sí existe evidencia suficiente.

## Diseño de solución mínimo a definir antes de implementar

- **Hecho persistido:** `NEX-062` y `NEX-070` escriben el `dInfAdic` completo en `nce_origen.observacion`. `documentos_electronicos.creado_por` identifica la cuenta, no el texto crudo. `documento_electronico_solicitudes.payload` contiene el JSON fiscal resultante. No se encontró almacenamiento inequívoco de la observación cruda en estas rutas.
- La solución segura para documentos nuevos probablemente requiere **dato inmutable separado** (observaciones crudas o huella original verificable), versionado/escrito atómicamente en la misma transacción de creación, dentro de la empresa correspondiente, sin meter campos internos en el JSON al gateway/XML SIFEN.
- Cualquier modificación de esquema debe ser una **migration incremental versionada y reversible cuando seguro**, compatible con NEX-062/NEX-070 y sin reinterpretar artificialmente registros históricos. El protocolo permite **preparar/versionar** scripts por Claude al implementar una tarea autorizada; **NO** ejecutar nada en PostgreSQL ni VM. Registrar preflight, verificación, rollback y posibles estados de transición (esquema aún sin aplicar).
- Si falta una ruta segura para preservar idempotencia de registros anteriores a la migration, documentar bloqueo/409 seguro y procedimiento manual. No inventar procedencia a partir de marcadores, cronología estimada o cambios de nombre.

## Tests focales obligatorios para próxima revisión

1. NCE histórica, `creado_por` = mismo usuario/nombre del `Vendedor:` manual: **no perder ninguna línea**.
2. NCE histórica, `creado_por` = otro usuario: conservar observación completa.
3. NCE nueva, observaciones manuales con marcadores/prefijos coincidentes y bloque automático real: separar exclusivamente lo que se registró como automático.
4. NCE E1 con usuario renombrado después: no reinterpretar observaciones ni perder texto.
5. Idempotencia: original obs vacía, reintento con obs igual al `dInfAdic` almacenado ⇒ **409**.
6. Idempotencia: original obs `Nota`, reintento con `Nota + bloque automático` ⇒ **409**.
7. Reenvío legítimo con obs cruda igual, usuario renombrado, mismo tenant ⇒ misma NCE/número y sin recomposición.
8. Aislamiento entre empresas y sucursales, 5000/5001 caracteres, huella previa/emisión, corrección de NCE rechazada.
9. Si hay migration, tests de su contrato y del comportamiento cuando la nueva columna aún no existe en VM; sin SQL real.
10. TypeScript/ESLint puntuales de los archivos alterados, no suite total.

## Veredicto y siguiente gate

**E1-R03 — NO CONFORME:** quedan abiertos **F001 MEDIA** y **F002 ALTA**, aunque el caso R02 de `Vendedor: Pablo` esté cubierto. La explicación de Claude sobre ausencia de procedencia y necesidad de columna separada es consistente con las limitaciones del SQL actual; la coincidencia de nombre no suple esa procedencia.

**Seguimiento:** PRO-292 permanece en revisión técnica, sin Done; registrar F002 como incidencia diferenciada vinculada al mismo gate E1. **No iniciar E2 / PRO-293** ni publicar cambios en VM. ChatGPT actualiza Lineal/PROGRESSO, audita la siguiente implementación. Claude únicamente desarrolla/testa/versiona la tarea expresamente autorizada.
