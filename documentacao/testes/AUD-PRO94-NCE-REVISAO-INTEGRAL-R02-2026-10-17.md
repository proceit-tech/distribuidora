# AUD-PRO94-NCE-REVISAO-INTEGRAL-R02 — reauditoria técnica INT-01/02/03

**Data:** 2026-10-17. **Responsável pela auditoria:** ChatGPT.  
**SHA auditado:** [`834fd72279f9b592f4832ecc49a6c523502617da`](https://github.com/proceit-tech/distribuidora/commit/834fd72279f9b592f4832ecc49a6c523502617da).  
**Branch oficial:** `feature/NEXIT-2026-001-banco-demo`. **Gestão:** [PRO-94](https://linear.app/proceit/issue/PRO-94).  
**Ordem autorizada:** `documentacao/v1/PRO-94-ORDEM-AJUSTES-NCE-INT-01-03-2026-10-17.md`.  
**Auditoria anterior:** `documentacao/testes/AUD-PRO94-NCE-REVISAO-INTEGRAL-R01-2026-10-17.md`.  
**Requisitos de referência:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` (24 RN, 23 CA). **Protocolos:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seções pertinentes do `PROGRESSO-NEXIT-V1.md`, todos consultados na revisão.

## Veredito

**APROVADO ESTRITAMENTE POR INSPEÇÃO ESTÁTICA DO SHA — INT-01, INT-02 e INT-03 ENCERRADOS; 0 novos defeitos de aplicação confirmados dentro das mudanças.**

O commit alterou somente `lib/facturacion/gateway.ts`, `lib/facturacion/nce-emision.ts`, `lib/facturacion/nce.ts`, `lib/facturacion/nce.casos.ts` e `PROGRESSO-NEXIT-V1.md`. Não houve modificação de migrations, NEX-062, T26, esquema de tabelas, código de emissão FE ou componente de UI. A aprovação estática **não implica homologação nem autorização de implantação**.

### INT-01 — ALTA anterior → ENCERRADO ESTATICAMENTE

**Problema original:** `interpretarRecepcion` devolvia `ERROR_ENVIO/RECHAZO` para certas respostas genéricas HTTP 4xx e `status:error` (inclusive 200), ainda que a rejeição não identificasse a própria NCE; `fe_nce_clasificar` da NEX-062 então classificava `LIBRE`, permitindo novo crédito fiscal prematuro.

**Código inspecionado:** [`lib/facturacion/gateway.ts:507`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/gateway.ts#L507)–573. A função já possuía a regra `propio = rechazados.find(e => e.numero === numeroFiscal)` e só declara rejeição explícita se existir `propio`, não existir `Aceptados` do mesmo número e não houver texto de duplicidade. O diff introduziu `esNce = doc?.tipo === "NCE"` nos dois ramos que anteriormente decidiam `RECHAZO` por mensagem/status genérico: HTTP 4xx (400/422, após os códigos especiais) e HTTP 2xx com `status:"error"`. Para NCE, esses ramos agora resultam em `ENVIO_INDETERMINADO`, `errorTipo=null`. Não houve mudança na classe SQL: `LIBRE` continua reservada a rejeição efetivamente reconhecida, `BLOQUEA` cobre o indeterminado. Não foi criado reenvio de NCE, nem gateway genérico paralelo.

**Casos revisados:** A01/A02 (422 e status:error genéricos) indeterminados; A03/A03b (Rechazados próprio e contradição) corretos segundo parser; A04 outro número indeterminado; A05 duplicidade; A06 5xx/resposta inválida; A07 success+lote/CDC → ENVIADO, não APROBADO; A08 auth/429; A09 regressão do comportamento anterior da FE. As asserções efetivamente presentes em `nce.casos.ts` chamam `interpretarRecepcion` puro (sem rede). [`lib/facturacion/nce.casos.ts:472`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce.casos.ts#L472)–517.

**Ressalva não bloqueante para esta correção:** comportamento e autenticidade de retornos reais não são comprovados pelos objetos JSON simulados. A política FE preservada mantém o tratamento original de HTTP genérico; isso **não é uma nova certificação do fluxo FE**.

### INT-02 — MÉDIA anterior → ENCERRADO ESTATICAMENTE

**Problema original:** conferência de cardinalidade somada a `.find` permitia que duas entradas repetissem o mesmo ordinal de linha e reutilizassem a chave original.

**Código inspecionado:** [`lib/facturacion/nce-emision.ts:20`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce-emision.ts#L20)–78, [`lib/facturacion/nce.ts:49`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce.ts#L49)–74. `repeticion` agora constrói `Map<number, linha>`, rejeita ordinal duplicado, exige cardinalidade igual à das linhas persistidas e compara cada ordinal armazenado ao valor da entrada com `parseDec` na precisão de 8 casas. A chave, motivo, FE, sucursal, ponto e observação continuam protegidos. A ordem das linhas não influencia a identidade, como exigido. O parser também rejeita ordinais repetidos antes da chamada de emissão (resposta 400). Nenhuma nova NCE é criada por esta verificação; repetição legítima retorna o mesmo `documentoId`/número.

**Casos revisados:** I01 corpo idêntico, I02 ordem trocada, I03 duplicado, I04 ausente/trocada/extra, I05 quantidade/monto divergente, I06 mesmo valor em linhas distintas, I07 identidade de cabeçalho distinta, I03b parser. O teste usa DB simulada, não PostgreSQL. [`lib/facturacion/nce.casos.ts:518`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce.casos.ts#L518)–559.

### INT-03 — MÉDIA anterior → ENCERRADO ESTATICAMENTE

**Problema original:** busca de clientes e reconciliação das FE do fluxo NCE ignoravam `NO_RECONOCIDO` e `ENVIO_INDETERMINADO`, deixando FE sem resultado sem consulta ao abrir o fluxo.

**Código inspecionado:** [`lib/facturacion/nce.ts:197`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce.ts#L197)–224 e [`lib/facturacion/nce-emision.ts:142`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce-emision.ts#L142)–168. Agora a condição da descoberta e a da consulta dirigida incluem **somente FE** `estado_local IN ('ENVIADO','ENVIO_INDETERMINADO')` e `estado_sifen IN ('SIN_CONSULTA','PENDIENTE','NO_RECONOCIDO')`, além das FE já aprovadas na lista de clientes. A reconciliação mantém `LIMIT 5`, intervalo ≥60 segundos desde última consulta, mesmo cliente/empresa e `sucursal_en_alcance`. Cada consulta usa `consultarEstado(...,{flujoNce:true})`, função SQL que admite esses estados para FE/NCE. A listagem de FE **elegíveis para emissão** permanece restrita a `APROBADO` com CDC e saldo > 0. Worker permanece apenas para NCE; não há novo agendador nem reenvio.

**Casos revisados:** F01–F04 combinações de estados, F05 exclusões, F06 elegibilidade apenas aprovada, F07 filtros, limite e intervalo. Em `nce.casos`, a validação de estados/limite usa **inspeção textual das consultas SQL**; a execução simulada força falha da chamada de gateway e confirma que a exceção não interrompe a reconciliação. **Não representa consulta real a banco nem reconciliação de FE até APROBADO.** [`lib/facturacion/nce.casos.ts:557`](https://github.com/proceit-tech/distribuidora/blob/834fd72279f9b592f4832ecc49a6c523502617da/lib/facturacion/nce.casos.ts#L557)–590.

## Matriz de requisitos / critérios afetados

Legenda: **CÓDIGO OK** = requisito implementado estaticamente no trecho afetado pelo commit; **OPERACIONAL PENDENTE** = prova real que não foi realizada. O checklist integral RN-01…24/CA-01…23 permanece no relatório R01; a presente matriz cobre os requisitos afetados por esta correção e não reclassifica os demais artificialmente.

| Requisito | Implementação inspecionada | Verificação disponível | Resultado |
|---|---|---|---|
| RN-01 / CA-02 | Descoberta + reconciliação FE não definitivas, sem torná-las elegíveis | F01–F07 (SQL texto/mock) | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-05 / RN-07 / CA-09 | NCE indeterminada continua bloqueando saldos; rejeição explícita pode liberar | A01–A05, classificação SQL existente | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-17 / CA-15 | Chave de idempotência exige ordinais únicos + correspondência bijetiva | I01–I07, I03b mock/parser | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-18 / CA-17 | Erro 4xx/status:error ambíguo NCE → indeterminado; sucesso gateway ≠ aprovação | A01–A09 parser puro; FAT-E2 segundo executor | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-19 / RN-21 / CA-19 | Rejeição específica mantém nova proposta, genérica não pode habilitar correção | Estado SQL/consulta histórico não alterados | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-20 / CA-18 | Reconciliação dirigida reutiliza consulta existente; worker geral NCE preservado | Código/SQL texto, não instância real | CÓDIGO OK · OPERACIONAL PENDENTE |
| RN-23 | Empresa/usuário e alcance por sucursal preservados nos filtros | Inspeção SQL de cliente e FE | CÓDIGO OK · OPERACIONAL PENDENTE |

## Verificações de regressão e limites

**Relatadas pelo Claude no commit, não repetidas pelo ChatGPT:** `nce.casos` 0 falhas (cenários A01–A09, I01–I07, F01–F07); FAT-E2 0 falhas; Facturación 0 falhas; ESLint dos arquivos alterados limpo. Total agregado de asserções não informado; não inventar contagem. **Nenhum teste de PostgreSQL/T26, browser, VM, gateway ou SIFEN realizado.** Testes de consulta SQL usam mocks/verificação textual, não execução real.

**Integridade estrutural preservada no diff:** NEX-062 (CDC FE e próprio, nce_origen, nce_lineas, FK composta, total, IVA, sequência independente, transações/locks), NEX-047…061, rollback e T26 inalterados. A migração NEX-062 continua **NÃO APLICADA** e não há evidência de homologação do resultado do gateway, de `dDesMotEmi` no XML, dos motivos 3/4/8, USD/BRL ou rotina real de consulta sem browser. O JSON pode precisar de prova em ambiente controlado. Não executar T26 sintético no único PostgreSQL operacional.

## Próxima etapa / decisão

**Os três achados INT-01/02/03 estão ENCERRADOS ESTATICAMENTE.** Não iniciar outro ciclo Claude/R03 só para repetir suites. PRO-94 permanece `In Progress` por falta de validação operacional, não por defeito confirmado nas correções deste commit. Implantação e testes reais exigem aprovação humana expressa com plano seguro de pré-verificação, backup, ordem de migrations e rollback; não inferir que NEX-062 foi aplicada por estar no Git.

**Veredito:** `AUD-PRO94-NCE-REVISAO-INTEGRAL-R02=APROVADA_ESTATICA`; `NEX-062=NAO_APLICADA`; `T26=NAO_EXECUTADO_EM_POSTGRESQL`; `NCE=NAO_HOMOLOGADA`.
