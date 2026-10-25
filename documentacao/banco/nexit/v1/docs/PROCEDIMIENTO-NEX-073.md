# Procedimiento NEX-073 — Fecha de emisión elegida (PRO-93 / PRO-294)

> **BLOQUEIO CRÍTICO — AUD-PRO-93-R01 (25/10/2026): NÃO EXECUTAR ESTE PROCEDIMENTO NEM O RUNNER AGORA.** O runner oficial percorre TODAS as migrations versionadas pendentes; a `NEX-072` também está versionada e NÃO APLICADA/NÃO AUTORIZADA. Assim, tentar aplicar NEX-073 pelo runner pode executar NEX-072 sem consentimento. Antes de qualquer futuro plano de aplicação, o responsável deve examinar a saída `--solo-listar`, o estado real `schema_migrations`, e aprovar EXPLICITAMENTE cada migration pendente. Se NEX-072 aparecer, ABORTAR. Também há ERRATA NORMATIVA: o bloqueio universal de datas futuras `hoy−4…hoy` foi baseado em premissa incompleta; a FAQ oficial DNIT inclui emissão POSTERIOR à transmissão dentro de 120h e assinatura→transmissão até 72h. Corrigir/verificar a regra em código E migration ANTES da aplicação. Fonte: `documentacao/testes/AUD-NEXIT-PRO-93-R01-2026-10-25.md`; DNIT https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes/-/categories/2705333. **Este documento abaixo é histórico NÃO APROVADO para execução.** Não aplicar NEX-072 nem NEX-073, não editar a VM e não marcar versão manualmente.


**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, según `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, `--solo-listar` antes). Requiere NEX-065 (y por tanto NEX-063).

## Qué hace
- Reemplaza `fe_documento_crear_fe` (misma firma; los envoltorios de stock/entrega NEX-067/NEX-068 siguen llamándola sin cambios). Sin la clave de entrada `dFecEmiSol` el comportamiento es idéntico a NEX-065 (`now()`).
- Con `dFecEmiSol` (AAAA-MM-DD, enviada por la aplicación solo cuando la fecha elegida difiere de hoy): valida fecha real, **selección** hoy−30…hoy+5 y **ventana habilitada** hoy−4…hoy (transmisión normal ≤120 h, nunca futura) en el día local de Asunción, **antes de reservar numeración**; fija `dFeEmiDE` y `documentos_electronicos.fecha_emision` = fecha elegida + hora local actual. La clave no queda en el snapshot que se envía al proveedor.
- Crea el marcador `fe_emision_fecha_soportada()`: la aplicación **no envía** una fecha distinta de hoy si el marcador no existe (responde 422 con el motivo), para que la función antigua nunca ignore la fecha en silencio.
- No modifica documentos, numeración, series, stock, entrega ni NCE.

## Límite fiscal (pendiente de confirmación del responsable)
Se pueden **elegir** fechas de −30 a +5 días, pero solo se **emite** de −4 a 0: fuera de eso el DE queda fuera del plazo de transmisión normal (120 h) o sería futuro, y requiere un tratamiento extemporáneo que no está implementado. Los límites están en `lib/facturacion/fecha-emision.ts` y en esta función; cambiar uno exige cambiar el otro.

## Orden de ejecución
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-073.sql` — sección 1 todo `ok = true`.
3. Runner oficial (`--solo-listar`, autorización expresa).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-073.sql` — todo `ok = true`.
5. Desplegar el código (migración primero, código después). Sin la migración, la pantalla funciona con la fecha de hoy y bloquea con un mensaje las demás.

## Reversión
`scripts/reversion-NEX-073.sql` (una transacción): restaura la definición de NEX-065 y elimina el marcador. Antes, desplegar la aplicación anterior; después borrar la fila `NEX-073` de `schema_migrations`.
