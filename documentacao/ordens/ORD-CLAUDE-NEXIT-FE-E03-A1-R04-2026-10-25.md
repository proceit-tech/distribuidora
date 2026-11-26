# ORD-CLAUDE-NEXIT-FE-E03-A1-R04 — ÚNICA ORDEM CORRETIVA VIGENTE

> **SUPERADA — HISTÓRICO:** Claude entregou `7d5764769a30eeadf0221a07f42f9f73341d33be`; [AUD-R04](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R04-2026-10-25.md) **NÃO CONFORME**. A guarda para terceiros foi fechada estaticamente; ficou F002-R04 (contadores de rejeição como texto/boolean, candidatos CDC/lote/eco malformados com outra ocorrência válida). **Nova ÚNICA ordem [E03-A1-R05](documentacao/ordens/ORD-CLAUDE-NEXIT-FE-E03-A1-R05-2026-10-25.md)**, só NEX-072, sem aplicar SQL/testes/VM. E03-A2/B bloqueadas. Instruções abaixo são históricas.

**Data:** 25/10/2026. **Issue:** PRO-321 (subtarefa PRO-312). **Branch:** `feature/NEXIT-2026-001-banco-demo`, repositório `proceit-tech/distribuidora`.
**SHA Claude R03:** `0d5e9c0586c8eb703dd93e0ecd0349238849614e`.
**Auditoria independente (LER INTEIRA):** [AUD-E03-A1-R03](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R03-2026-10-25.md).
**Contrato base:** [ESPEC-E03-R03](../definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md).

## Única ação liberada para Claude

**Modificar somente** o arquivo completo `documentacao/banco/nexit/v1/migraciones/NEX-072-facturacion-e03-evidencia-envios.sql`. **NÃO criar nova migration; SQL NEX-072 continua NÃO APLICADO.**

Fechar **um achado bloqueante F002-R03 — ALTA**: a função SQL `fe_e03_recepcion_confirmada` aceita potencialmente `status:success` e lote válido mesmo que `gateway.ts::interpretarRecepcion` classificasse a resposta como **ENVIO_INDETERMINADO** devido a `response.Rechazados` de terceiros ou `response.Aceptados` que identifica somente terceiros. Ao sanear a resposta, `redactarAjenos` remove entradas de outras empresas/documentos e mantém contador `OtrosDocumentosOmitidos`, que o SQL hoje ignora.

**Implementar guarda conservadora:** se a resposta saneada indicar `OtrosDocumentosOmitidos` positivo (ou existir sinal de listas aceitas/rejeitadas de terceiros sem comprovação inequívoca do documento próprio), `CIERRE OK` deverá ser bloqueado. Não inferir o conteúdo de terceiros apagado, nem aceitar `ENVIADO` só por HTTP 2xx, lote ou eco quando outro sinal da resposta não comprova que o gateway recebeu ESTE documento. Confrontar `gateway.ts::interpretarRecepcion` e `redactarAjenos` reais e documentar no SQL a natureza estritamente conservadora. **Jamais transformar `ENVIADO` em `APROBADO` SIFEN.** Não inventar uma nova estrutura de resposta do provedor nem adaptar o fluxo TS.

Preservar as correções F001 `NO_TRANSMITIDO` terminal, F003 SHA/bytes de resposta saneada, F004 `Basic` curto e Bearer, guards da cadeia POST/CIERRE, índices/FOREIGN KEY/grants NEX-052, a tabela append-only e idempotência. Revisar SQL inteiro após a alteração, sem mudanças extras. Se encontrar impossibilidade objetiva de uma guarda conservadora compatível com o contrato sanitizado, **PARAR e informar o bloqueio**, sem simular comprovação.

**Restrições:** NÃO editar nenhum arquivo além da NEX-072. NÃO executar testes, PostgreSQL, SQL, migration, lint, typecheck, build, CI, browser, gateway, SIFEN, VM/Docker/SSH, homologação/deploy. NÃO atualizar Linear, especificações, auditorias, `CLAUDE.md`, `PROGRESSO`. Alterar somente o SQL, commit/push na branch, informar SHA completo e PARAR.

Resposta final curta: `E03-A1-R04: NEX-072 corrigida; NÃO aplicada. Testes: não executados (ordem do responsável). Bloqueios: nenhum ou descrever. SHA: <SHA completo>. Parado para auditoria ChatGPT.`

**GATE:** E03-A2/E03-B e E08/E09 permanecem BLOQUEADAS. ChatGPT fará auditoria R04 antes de decidir liberação.
