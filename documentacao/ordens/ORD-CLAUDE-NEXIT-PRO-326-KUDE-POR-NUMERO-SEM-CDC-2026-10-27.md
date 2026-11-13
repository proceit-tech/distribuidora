# ÚNICA ORDEM ATIVA PARA CLAUDE — PRO-326 P0 — KUDE POR DOCUMENTO, SEM CDC
**Data:** 27/10/2026. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**DECISÃO FINAL do responsável:** KuDE é consultado pelo **tipo/estabelecimento/ponto/número/série** do documento escolhido; **CDC não participa da validação para exibir PDF**; FE/NCE pode estar **RECHAZADO** ou sem CDC e ainda assim deve exibir PDF se o gateway devolver KuDE válido.
**Requisito vinculante que PREVALECE:** `documentacao/definicoes/REQ-NEXIT-PRO-326-KUDE-POR-DOCUMENTO-SEM-CDC-2026-10-27.md`.
**REVOGADOS:** `ANA-NEXIT-CASA-MINGO-KUDE-FE-EMISOR-RUC-2026-10-27.md` e `ORD-CLAUDE-NEXIT-P0-KUDE-EMISOR-CANONICO-CASA-MINGO-2026-10-27.md` na parte que ordenava validar CDC↔RUC/DV. Não implementar tal validação, **nem** substituir por outra análise histórica de CDC.

## 1. Contexto técnico obrigatório
Captura 27/10/2026: portal E-FacturaHub abre PDF FE `001-003-0009011`, NEXIT mostra `El KuDE recibido pertenece a un emisor distinto del de los documentos aprobados de esta empresa...`.
- Em `lib/facturacion/shared.ts::obtenerKude`, a mensagem vem do SELECT `DISTINCT substr(cdc,3,9) ... APROBADO ... LIMIT 10` e comparação `r.cdc.slice(2,11)` quando doc não tem CDC.
- `lib/facturacion/gateway.ts::interpretarKude` também rejeita PDF válido sem CDC ou se CDC retornado não é igual/coerente com CDC fiscal persistido. Esse segundo veto igualmente **NÃO** pertence à regra KuDE.
- O browser fornece apenas ID, backend recebe empresa/usuário da sessão, lê identidade fiscal imutável da FE/NCE e chama gateway da empresa com token isolado. Proteção ACL e validade do PDF devem permanecer.

## 2. Implementação estritamente focal
1. Ler integralmente `CLAUDE.md`, requisito acima, `shared.ts`, `gateway.ts`, `kude.casos.ts`, `kude-visor.ts`, `kude-modal.tsx`, API `/api/documentos/[id]/kude`, contratos `REQ-DOC-KUDE-PDF-GATEWAY` e `INC-NEXIT-NCE-KUDE-GATEWAY`. Considerar como superados trechos históricos que condicionavam PDF ao CDC, RUC ou estado SIFEN.
2. Em `shared.ts`, eliminar **inteiramente** o SELECT de outros documentos aprovados e o veto de emissor por `r.cdc`. **NÃO** adicionar consulta a `empresas.ruc`, `empresas.dv`, histórico SIFEN, CDC local, CDC do gateway ou outras fontes para restringir KuDE.
3. Em `gateway.ts`, no caminho **KuDE exclusivamente**, remover a condição `(doc.cdc && cdc !== doc.cdc) || !cdcCoherente(...,cdc)`. Não exigir campo `CDC`/ `cdc` na resposta: o contrato funcional de sucesso é `HTTP 200, status:'success', kude:<PDF Base64 válido>`. Se CDC vier, ignorá-lo para a exibição e NÃO persisti-lo; ajustar retorno/tipos `ResultadoKude` e consumidores apenas se necessário. O helper fiscal `cdcCoherente` deve **continuar** exatamente com seu papel na emissão/consulta/registro fiscal fora do fluxo KuDE.
4. Manter contrato externo imutável: **FE cinco campos** `dEst, dPunExp, dNumDoc, dSerieNum, tipoDoc:'FE'`, sem `tipOpe`; **NCE seis campos** `tipOpe:'4',dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc:'ncr'`. Tipos fiscalmente distintos; preservação de zeros e série.
5. Manter servidor com `FACTURACION_ELECTRONICA.VER`, tenant, escopo sucursal, token por empresa, proteção HTTPS/SSRF, limites de resposta, validação estrita de Base64/PDF e resposta de sucesso do provedor; no frontend controlar chegada atrasada, fechar/baixar/imprimir, sem dados persistidos ou exposição credencial.
6. **Não exigir APROBADO**. FE/NCE `RECHAZADO`, `SIN_CONSULTA`, `PENDIENTE`, `ENVIADO` podem pedir PDF. Se o gateway tiver KuDE e retornar PDF válido, apresentar. Se não devolver PDF, informar indisponibilidade sem fabricar arquivo.
7. Atualizar `lib/facturacion/kude.casos.ts` para remover asserts obsoletos de CDC divergente obrigatório, bloqueio por outro emissor/histórico e pré-requisito de CDC; conservar cobertura de URL/body correto, autorização usuário/empresa/sucursal, download novo, PDF válido/inválido, erro/timeout. Incluir explicitamente **FE RECHAZADA sem CDC local e sem CDC no JSON do gateway, mas com PDF** -> deve MOSTRAR; FE com CDC divergente, mas PDF solicitado devolvido válido -> MOSTRAR; e NCE `ncr`/ `tipOpe:4`.
8. Restringir alterações a `shared.ts`, `gateway.ts`, `kude.casos.ts` e referências de `ResultadoKude` estritamente necessárias. Não corrigir outros bugs por analogia.

## 3. Proibições
- Não tentar comparar CDC do gateway com RUC/DV da empresa; usuário REVOGOU isso. Não utilizar CDC para seleção, autorização ou disponibilidade do KuDE. NÃO modificar verificações CDC relacionadas a emissão/consulta SIFEN fora de KuDE.
- Não mudar gateway remoto, cadastro de empresas, URL/credenciais, banco, migrations, FE/NCE emitidas, numeração, timbrado, estoque, relatórios, perfis, FE/stock P0 nem qualquer outra etapa do V1.
- Não executar SQL/VM/Postman/HTTP real, testes, lint, build, CI, navegador ou deploy. Casos serão atualizados como código e auditoria estática; não declarar execução.
- Claude desenvolve e publica commit/push. Não alterar Linear, progresso ou análise gerencial; ChatGPT cuida da auditoria.
- **PARAR DEPOIS DO COMMIT PARA REAUDITORIA DO CHATGPT.** A validação com gateway real só poderá ser declarada posteriormente mediante teste autorizado.

## 4. Resumo de critérios obrigatórios
| Cenário | Resultado esperado |
|---|---|
| FE escolhida, status RECHAZADO, sem CDC local; gateway retorna PDF válido sem CDC | MOSTRAR |
| FE escolhida, gateway retorna PDF válido com CDC diferente do local/histórico | MOSTRAR, SEM ALTERAR CDC |
| NCE RECHAZADA, gateway retorna PDF válido via contrato ncr + tipOpe 4 | MOSTRAR |
| Documento de outra empresa/sucursal/sem VER | NEGAR antes do gateway |
| Gateway não devolve PDF, Base64 inválido ou status não-sucesso | ERRO seguro |
| Reabrir/baixar de novo | NOVA requisição, sem armazenar PDF |
