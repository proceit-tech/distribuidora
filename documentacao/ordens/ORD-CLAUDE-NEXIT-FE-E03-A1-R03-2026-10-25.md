# ORD-CLAUDE-NEXIT-FE-E03-A1-R03 — ORDEM CORRETIVA ÚNICA

> **HISTÓRICO — ORDEM SUPERADA (25/10/2026).** Claude publicou `0d5e9c0586c8eb703dd93e0ecd0349238849614e`. A [AUD-R03](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R03-2026-10-25.md) registrou F001/F003/F004 conformes estaticamente e **F002-R03 bloqueante** (resposta de terceiros sanitizada em `OtrosDocumentosOmitidos` não avaliada pelo SQL). A **única ordem atual** é [E03-A1-R04](documentacao/ordens/ORD-CLAUDE-NEXIT-FE-E03-A1-R04-2026-10-25.md), somente NEX-072; sem SQL executado, sem testes/VM; E03-A2/B e E08/E09 bloqueadas.

**25/10/2026.** **Projeto:** NEXIT; repo `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`; issue PRO-321 (PRO-312).
**Último SHA Claude:** `c8af2dd7107346c1de954ebedda5d2b0c3d83936`.
**Auditoria estática R02 — NÃO CONFORME:** [AUD-E03-A1-R02](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R02-2026-10-25.md) (leitura integral obrigatória).
**Contrato:** [ESPEC-E03-R03](../definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md).

## ÚNICA ORDEM AUTORIZADA

**Modificar SOMENTE** `documentacao/banco/nexit/v1/migraciones/NEX-072-facturacion-e03-evidencia-envios.sql`, que permanece **NÃO APLICADA**, para fechar DOIS achados residuais. Nenhuma migration nova, sem mudanças TypeScript, de envio real, consultas, estado SIFEN, estoque, editor, API/UI ou outras migrations.

### E03-A1-F002-R02 — ALTA: HTTP 2xx não confirma recepção

A validação atual de `fe_e03_cerrar_envio` só exige HTTP 2xx e `p_resultado=OK`; ela aceita `HTTP_RESPUESTA` 200 com `respuesta_saneada.status='error'` ou `success` sem identificador confiável, o que `gateway.ts::interpretarRecepcion` considera rejeição ou indeterminação.

**Corrigir:** validar que o último evento `HTTP_RESPUESTA` está correlacionado e demonstra `status='success'` **e evidência de recepção específica**, como lote válido, CDC coerente ou eco integral de estabelecimento/ponto/número, segundo contrato real de `gateway.ts` (verificar código vigente antes de alterar SQL). Uma resposta 2xx de erro ou sem identificação não autoriza `OK/ENVIADO`; nunca inferir aprovação SIFEN. Preservar regras de último POST, saída, reintento após 401, idempotência, falha/autenticação, e incerteza. Validar coerência dos campos de `CIERRE` com a evidência do gateway. **Não duplicar interpretação frágil das respostas:** se o contrato real de `interpretarRecepcion` for estruturalmente impossível de validar com `respuesta_saneada` disponível na NEX-072, **parar e informar bloqueio arquitetural objetivo**; não usar condição que simule recepção nem alterar `gateway.ts` fora do escopo.

### E03-A1-F004-R02 — ALTA: credenciais curtas

Os helpers SQL `fe_e03_redactar_texto` e `fe_e03_secreto_residual` não eliminam nem detectam cabeçalho HTTP Basic com Base64 curto, como `Basic dTpw`. O redator exige Base64 >=12 e o verificador residual não inspeciona Basic.

**Corrigir:** reconhecer `Basic` com credenciais Base64 válidas independentemente de serem curtas, tanto para redação quanto verificação residual. Reavaliar limites fixos também para `Bearer` curto; não gravar credencial em `mensaje` nem `respuesta_saneada`, nem ecoar o segredo em erro. Preservar JSON estruturalmente válido e limitar sobre-redação; documentar que o regex SQL é defesa em profundidade, não saneamento infalível do transporte.

## Gate e resposta Claude

Os achados **F001 e F003 da R02 estão FECHADOS estaticamente** — NÃO regressar nem reescrever seu desenho. Preservar o resto: log append-only, tabelas/FKs, `UNIQUE` composto em intentos, grants dinâmicos NEX-052, número/CDC, `NO_TRANSMITIDO` terminal, hash SHA256 do texto HTTP e do JSON saneado, regras de último POST e autorização multiempresa. **Não executar migration, PostgreSQL, testes, lint, build, typecheck, CI manual, VM/SSH/Docker, gateway ou navegação.** Não criar testes ou arquivos paralelos. Claude só desenvolve, faz commit/push e PARA. Não modificar Linear, especificações, `PROGRESSO` ou `CLAUDE.md`.

Resposta curta: `E03-A1-R03: NEX-072 corrigida; NÃO aplicada. Testes não executados (ordem do responsável). Bloqueios: ... SHA completo: ... Parado para auditoria ChatGPT.`

**E03-A2, E03-B, E08, E09 e demais etapas continuam BLOQUEADAS.** O commit R03 exige auditoria independente do ChatGPT antes da liberação de qualquer outra etapa ou aplicação de SQL.
