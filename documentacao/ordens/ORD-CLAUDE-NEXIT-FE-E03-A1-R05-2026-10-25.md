# ORD-CLAUDE-NEXIT-FE-E03-A1-R05 — ÚNICA ORDEM CORRETIVA VIGENTE

> **R05 FINALIZADA — SEM ORDEM CORRETIVA R06 (25/10/2026).** Claude já executou esta ordem, produzindo `5acd9ca3aa317a95c6deee61a696c9e21d52c433`; [auditoria R05](documentacao/testes/AUD-NEXIT-FE-E03-A1-PRO-321-R05-2026-10-25.md) confirmou conformidade SOMENTE ESTÁTICA da NEX-072. Esta ordem foi atendida e é HISTÓRICA, não deve ser executada novamente. **A migration ainda NÃO foi aplicada nem testada em PostgreSQL.** Próximo gate: validação/aplicação controlada em homologação sob autorização humana. E03-A2/B e E08/E09 não foram liberadas.

**Data:** 25/10/2026. **Issue:** PRO-321 (subtarefa PRO-312). **Repositório:** `proceit-tech/distribuidora`; **branch:** `feature/NEXIT-2026-001-banco-demo`.
**SHA Claude R04:** `7d5764769a30eeadf0221a07f42f9f73341d33be`.
**Auditoria INDEPENDENTE — LER INTEIRA:** [AUD-E03-A1-R04](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R04-2026-10-25.md).
**Contrato de referência:** [ESPEC-E03-R03](../definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md).

## ÚNICA TAREFA

Corrigir **APENAS E03-A1-F002-R04** no arquivo já existente e **NÃO APLICADO**:

`documentacao/banco/nexit/v1/migraciones/NEX-072-facturacion-e03-evidencia-envios.sql`.

**Não criar nova migration nem alterar TS, outras migrations, interfaces ou serviços.**

### A. Rejeições declaradas como string/boolean

No `lib/facturacion/gateway.ts::interpretarRecepcion`, `raiz.rechazados` é interpretado com `Number(raiz.rechazados) > 0`, não apenas com comparação JSON number. Portanto, `{"status":"success","nro_lote":"LOTE123","rechazados":"1"}` ou `rechazados:true` **não** autorizam `OK` pelo gateway; o SQL atualmente ignora esses formatos e pode registrar `ENVIADO`. Implementar guarda conservadora, especialmente para o contador no nível principal, sem presumir sucesso para variantes ambíguas. Não perder rejeições já identificadas por `response.Rechazados`.

### B. Candidatos de identidade malformados

O gateway usa `buscar()`, que devolve a **primeira** ocorrência admissível para chaves CDC, lote, `dEst/dPunExp/dNumDoc`; o SQL percorre vários candidatos e pode **ignorar um candidato inválido** para aceitar outro válido mais adiante. Exemplo sem lote/eco: `{"status":"success","cdc":"INVALIDO","response":{"cdc":"<44 dígitos de CDC coerente>"}}`: `interpretarRecepcion` não aceita com base no segundo CDC, mas `fe_e03_recepcion_confirmada` pode aceitar. Adotar guarda **fail-closed** para candidatos não vazios, tipagem inválida, CDC incoerente/malformado, lote impossível ou eco parcial/contraditório; em caso de informação insuficiente, `CIERRE OK` deve ser recusado, sem reinterpretação inventada.

### C. Revisão de contrato completa numa única passagem

Revisar comparativamente **todas as condições necessárias** de `gateway.ts::interpretarRecepcion` / `buscar` / `redactarAjenos`, no estado real da branch: `status:success`, HTTP, resposta inteira não truncada, contador/lista de rejeitados, token/autenticação, lote válido, CDC coerente, eco fiscal, `Aceptados` apenas próprios e `OtrosDocumentosOmitidos`, e consistência do `CIERRE` com o último POST. O SQL pode rejeitar **mais** que TS, mas nunca aceitar **mais**. Não atualizar gateway, não duplicar parser frágil, não confirmar APROBADO SIFEN a partir de ENVIADO.

Preservar integralmente F001 `NO_TRANSMITIDO` terminal, F003 hash/tamanho da resposta saneada calculados pelo banco, F004 redação Basic/Bearer, F002-R03 terceiros omitidos, FK, `UNIQUE`, grants NEX-052, append-only, idempotência e escopo multiempresa. Depois das mudanças, **reler o arquivo completo**, não apenas o diff.

**Proibições:** nenhum teste ou script, SQL/PostgreSQL executado, migration aplicada, lint, typecheck, build, CI, navegador, gateway/SIFEN, VM, SSH, Docker, deploy, credenciais. **Nenhum outro arquivo** deve ser modificado, incluindo `CLAUDE.md`, Linear, especificações, auditorias ou progresso.

**Entrega:** commit/push exclusivamente da NEX-072 na branch e parada. Informar: `E03-A1-R05 NEX-072 corrigida; NÃO aplicada. Testes não executados por ordem. Bloqueios: ... SHA completo: ... Parado para auditoria ChatGPT.`

**Gate:** E03-A2/E03-B/E08/E09 continuam bloqueadas. A entrega depende de reauditoria independente R05 e, posteriormente, validação da migration em ambiente autorizado antes de qualquer aplicação produtiva.
