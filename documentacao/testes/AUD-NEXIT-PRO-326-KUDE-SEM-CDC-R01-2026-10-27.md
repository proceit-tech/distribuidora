# AUD-NEXIT-PRO-326-KUDE-SEM-CDC-R01 — Auditoria independente

**Data:** 27/10/2026  
**Sistema:** NEXIT / DistribuNex V1 · Facturación → Documentos electrónicos → KuDE FE/NCE  
**Auditor:** ChatGPT (análise de negócio, sistema e auditoria); **Implementador:** Claude Code  
**Repositório:** `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`  
**SHA funcional examinado:** [`d22fa7da53a07be9aa08e1fe5dfef9403548fc23`](https://github.com/proceit-tech/distribuidora/commit/d22fa7da53a07be9aa08e1fe5dfef9403548fc23)  
**Linear:** [PRO-326](https://linear.app/proceit/issue/PRO-326) / dependência [PRO-194](https://linear.app/proceit/issue/PRO-194)  
**Requisito prevalecente:** [REQ-NEXIT-PRO-326](../definicoes/REQ-NEXIT-PRO-326-KUDE-POR-DOCUMENTO-SEM-CDC-2026-10-27.md)  
**Ordem executada:** [ORD-CLAUDE-NEXIT-PRO-326](../ordens/ORD-CLAUDE-NEXIT-PRO-326-KUDE-POR-NUMERO-SEM-CDC-2026-10-27.md)

## 1. Veredito e limite

**CONFORME ESTATICAMENTE NO ESCOPO PRO-326. Zero achados corretivos novos comprovados no diff da mudança. NÃO HOMOLOGADO, NÃO TESTADO NESTA RODADA.**

A revisão do commit e dos blobs dos três arquivos modificados demonstra eliminação da dependência de CDC para a entrega de KuDE. Foi revisada a integração de leitura, autenticação, parser JSON/Base64/PDF e controlador/modal já existentes, sem modificar aplicação. A regra final é **solicitar pelo documento selecionado** (tipo/estabelecimento/ponto/número/série), autenticado para a empresa, e **apresentar o PDF tecnicamente válido devolvido** para essa requisição, mesmo quando o estado é RECHAZADO ou o CDC local/retornado está ausente ou divergente. CDC não é usado como decisão de KuDE nem se grava ao visualizar.

**Evidência restrita a GitHub:** testes novos e regressões NÃO executados por Claude por ordem expressa; auditor ChatGPT também **não executou** testes, TypeScript, lint, build, CI, navegador, HTTP real, gateway, PostgreSQL, migrations, VM ou deploy. O parecer não demonstra funcionamento real, conformidade fiscal do conteúdo do PDF, nem autorização operacional para ativação. Não confundir com aprovação SIFEN.

## 2. Diferença entre o SHA anterior e o SHA entregue

O commit `d22fa7da53a07be9aa08e1fe5dfef9403548fc23` altera **somente três arquivos**:
1. `lib/facturacion/shared.ts`
2. `lib/facturacion/gateway.ts`
3. `lib/facturacion/kude.casos.ts`

**shared.ts, obterKude():** preserva `leerDocumento(db,empresaId,usuarioId,id)`, tipo restrito FE/NCE, leitura da configuração/token da empresa; constrói identidade fiscal sem CDC; apaga a consulta `SELECT DISTINCT substr(cdc,3,9)...APROBADO LIMIT 10` e o veto de emissor de outro histórico. Retorna apenas PDF e nome derivado do documento.

**gateway.ts, KuDE:** `DocumentoKude` e `ResultadoKude` deixam de incluir CDC; `interpretarKude` não exige nem compara `CDC/cdc` do JSON; aceita somente `status:'success'` e PDF Base64 íntegro dentro de limites. `cuerpoKudeGateway` preserva FE com cinco campos `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc:'FE'` e NCE com seis `tipOpe:'4',dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc:'ncr'`. O helper fiscal `cdcCoherente`, inclusive seu uso em outros caminhos de emissão/recepção, não foi modificado no diff.

**kude.casos.ts:** revisa cenários antigos dependentes de CDC e adiciona casos FE RECHAZADA 001-003-0009011 sem CDC em banco/resposta, CDC diferente, FE aprovada divergente, NCE rejeitada via `ncr`/`tipOpe:'4'`, acesso cruzado, ausência de permissão (inspeção estrutural de rota), erro HTTP/JSON, Base64/PDF inválido/grande, nova consulta e invariantes sem escrita. **Cobertura escrita NÃO equivale a teste executado**.

## 3. Matriz de aceitação (inspeção estática)

| ID | Requisito | Evidência revisada | Resultado |
|---|---|---|---|
| CA-01 | Solicitar por ID persistido / identidade fiscal, não por CDC | `shared.ts::obtenerKude` + `cuerpoKudeGateway` | CONFORME CÓDIGO |
| CA-02 | FE RECHAZADA sem CDC local/retornado e PDF válido | `gateway.ts::interpretarKude` + caso `PRO326-01` | CONFORME CÓDIGO; SEM EXECUÇÃO |
| CA-03 | CDC retornado divergente nunca impede PDF | `ResultadoKude` sem CDC + `PRO326-02/03` e `NCR-04` | CONFORME CÓDIGO; SEM EXECUÇÃO |
| CA-04 | NCE RECHAZADA com contrato `ncr`/`tipOpe:'4'` | `cuerpoKudeGateway` + `PRO326-04` | CONFORME CÓDIGO; SEM EXECUÇÃO |
| CA-05 | Sem consulta ao histórico APROBADO / RUC para veto | bloco antigo removido de `shared.ts`; mock rejeita SQL não esperado | CONFORME CÓDIGO |
| CA-06 | Isolamento empresa/sucursal/permissão | `leerDocumento` com `ALCANCE`, `prepararFacturacion("VER")` na rota | PRESERVADO ESTATICAMENTE; SEM TESTE REAL |
| CA-07 | Credenciais do gateway por empresa; HTTPS/SSRF | `adjuntarCredencialesDeBase` e serviço KuDE não alterados | SEM REGRESSÃO OBSERVADA NO DIFF |
| CA-08 | PDF só com sucesso HTTP/JSON/Base64/assinatura/EOF/limite | `obtenerKudeGateway`, `interpretarKude`, `esPdfValido`, `decodificarBase64Estricto` | PRESERVADO ESTATICAMENTE |
| CA-09 | Sem DB write/cache; nova consulta para abrir/baixar; respostas tardias | rota GET, `kude-visor`, casos atuais | PRESERVADO ESTATICAMENTE |
| CA-10 | Emissão/consulta fiscal CDC inalteradas | diff limitado, `cdcCoherente` e chamadas fiscais existentes | SEM REGRESSÃO OBSERVADA NO DIFF |

## 4. Pontos que não constituem defeito da PRO-326

- O CDC devolvido pelo gateway **pode** referir outro documento; a decisão vinculante do responsável é confiar no PDF devolvido pelo serviço autenticado para o conjunto de identificadores da FE/NCE selecionada, sem usar CDC como veto. Não reintroduzir igualdade por CDC, RUC/DV, histórico ou aprovação.
- **Rejeição fiscal** (`estado_sifen=RECHAZADO`) é diferente de resposta HTTP de erro do endpoint `/api/kude`. Em caso de erro externo, ausência de PDF ou PDF inválido, exibir erro e não criar documento fictício.
- O teste de autorização `PRO326-06` inspeciona estruturalmente a chamada da rota; não equivale a teste HTTP negativo, a ser coberto na validação dirigida autorizada futuramente.
- A validade técnica PDF (`%PDF-` e `%%EOF` e limites) não comprova conformidade visual/fiscal do conteúdo enviado pelo fornecedor; esta análise não valida conteúdo do PDF real.
- A PRO-326 é correção focal; não encerra issues fiscais FE/estoque nem homologação da PRO-194.

## 5. Decisão e próxima etapa

**PRO-326: correção de código entregue e conforme estaticamente; estado Linear IN REVIEW, não Done. Sem ordem corretiva adicional ao Claude.**

O próximo gate depende de autorização do responsável para verificações pertinentes e, depois, validação operacional humana do documento FE 001-003-0009011 e de NCE relevante, confirmando retorno do gateway, abertura/reabertura, impressão/download, escopo por empresa/usuário, erro de serviço e invariância dos estados SIFEN. Sem comprovação: **PENDENTE DE HOMOLOGAÇÃO**. Claude não realiza ações na VM nem reexecuta a PRO-326.

**Testes executados nesta auditoria:** 0. **Build/lint/typecheck executados:** 0. **Gateway real / browser / PostgreSQL / VM / deploy:** 0.
