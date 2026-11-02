# AUD-PRO94-NCE-REVISAO-INTEGRAL-R01 — NCE V1 do zero, 17/10/2026

**Auditor:** ChatGPT. **Gestão:** [PRO-94](https://linear.app/proceit/issue/PRO-94). **Repositório:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **Código examinado:** estado da branch após correção do T26 `33b5c479300a0463427e7c6a3856066638147eb5` e commits documentais.  
**Fontes normativas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` (24 RN, 23 CA).  
**Método:** revisão independente estática **sem aproveitar as aprovações anteriores como prova**, analisando rotas, tela, parser/validador, cálculo, JSON, cliente/FE, chave/idempotência, gateway, resposta, estados, worker, NEX-047/048/050/054/060/062, relacionamento, T26 e rollback. Foram lidos arquivos reais da branch, não somente o relato do Claude. **Não** se executou testes, VM, Docker, PostgreSQL, gateway, SIFEN ou navegador.

## Resultado executivo

**REPROVADA PARA HOMOLOGAÇÃO/IMPLANTAÇÃO.** Existem **3 defeitos confirmados pela leitura do código** (1 ALTO, 2 MÉDIOS), relacionados a tratamento de resultados incertos, identidade do reenvio e conciliação da FE. Nenhuma correção foi executada. As correções monetárias, CDC/FK e T26 das rodadas anteriores permanecem no código, mas aprovação estática passada não substitui a evidência faltante de execução.

### INT-01 — ALTO — Resultado não identificado pode virar rejeição DEFINITIVA e liberar saldo fiscal

**Cadeia de evidências:**
- [`lib/facturacion/gateway.ts:511`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/gateway.ts#L511)–544: `interpretarRecepcion` retorna `estadoLocal="ERROR_ENVIO", errorTipo="RECHAZO"` para HTTP 400/422 genérico sem `Rechazados` identificando este número, depois de tratar 408/409/423/425, 401/403/429. Também retorna RECHAZO para HTTP 200 `{"status":"error","message":"..."}` genérico não duplicado, sem vínculo inequívoco.
- [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:92`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L92)–101: `fe_nce_clasificar` retorna `LIBRE` para `ERROR_ENVIO/RECHAZO`; [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:203`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L203)–215 bloqueia novas NCE apenas se `BLOQUEA`.
- [`lib/facturacion/nce.ts:400`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L400)–423 e [`app/(private)/documentos/page.tsx:429`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L429)–434: a classificação `RECHAZO` também habilita fluxo de nova NCE/correção.

**Prova lógica reprodutível sem gateway:** para documento NCE `001-001-0000001`, resposta HTTP **422** `{"status":"error","message":"Error de validación"}` (sem `Rechazados` e sem identificação de documento). Passa pelo ramo 4xx genérico → `ERROR_ENVIO/RECHAZO` → NCE classificada `LIBRE` → a FE pode ser creditada novamente. A mesma cadeia ocorre com HTTP 200 `{"status":"error","message":"Error general"}`. Não é evidência de que o fornecedor enviará tal resposta nem que houve dupla emissão real; **é um caminho executável de falha lógica** e contraria RN-07/RN-18. A política preexistente só reconhece rejeição de documento quando resposta confiável identifica o próprio número; não é seguro liberar saldo por HTTP isolado.

**Correção necessária (depende de autorização do responsável):** garantir que `ERROR_ENVIO/RECHAZO` só seja usado quando a rejeição foi **inequivocamente atribuída à própria NCE** conforme contrato comprovado do gateway. Resposta genérica ou não vinculada → `ENVIO_INDETERMINADO` / `BLOQUEA`, sem reenviar, sem reusar número, com tentativa/mensagem preservadas. Manter tratamento de erro de autenticação antes da transmissão, 429 de frequência e rejeição explícita do próprio número, sem relaxar bloqueios fiscais ou modificar FE inadvertidamente. **Testes mínimos puros**: 422 genérico, 200 status:error genérico, 422 com rejeitado identificando NCE, erro atribuído a outro número, 409 duplicado, timeout/5xx e sucesso lote.

### INT-02 — MÉDIO — Idempotência permite requisição com ordinal duplicado passar como repetição legítima

**Evidência:** [`lib/facturacion/nce-emision.ts:21`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce-emision.ts#L21)–54. A função `repeticion` confere `lineas.length === cuerpo.lineas.length`; para cada linha solicitada executa `lineas.find(x => x.linea===l.linea)`, sem exigir ordinais únicos na nova requisição e sem comprovar correspondência bijetiva do conjunto. Ela retorna o mesmo `documentoId` sem recalcular a entrada se todas as pesquisas retornarem valor igual.

**Caso determinístico:** NCE persistida com `[(linea=1,monto=100),(linea=2,monto=200)]`; nova requisição com **mesma chave** e `[(linea=1,monto=100),(linea=1,monto=100)]`, mesma FE/motivo/ponto/sucursal/observação. Comprimentos =2 e cada `find` encontra a linha gravada 1; `iguales=true` embora a requisição seja diferente. O resultado é a NCE antiga, contrariando identidade integral de idempotência (RN-17/CA-15); não há prova de que crie novo documento ou duplique saldo nesse caso. O formulário normal não gera ordinais duplicados, mas a API deve ser segura frente a payloads adversariais.

**Correção necessária:** validar univocidade do ordinal na entrada **antes de aceitar repetição**, e comparar o conjunto por ordinal de forma **bijetiva** com as linhas persistidas, considerando motivo, quantidade e valor pertinente. Alternativamente comparar representação canônica/hash completo persistido sem enfraquecer o comportamento legítimo de retry. Testes puros ou mock de DB, mínimo: permutação válida, duplicação, linha faltante/substituída, quantidade/valor diferentes, mesmo payload.

### INT-03 — MÉDIO — Busca de FE para NCE não reconcilia outros estados sem resultado final

**Evidência:** [`lib/facturacion/nce.ts:199`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L199)–211 limita clientes elegíveis a FE `APROBADO` ou `estado_local='ENVIADO' AND estado_sifen IN ('SIN_CONSULTA','PENDIENTE')`. [`lib/facturacion/nce-emision.ts:133`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce-emision.ts#L133)–149 só reconcilia as mesmas combinações; o worker automático definido em [`lib/facturacion/consulta-automatica.ts:21`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/consulta-automatica.ts#L21)–23 trata **apenas NCE**, não FE.

**Cenário:** cliente tem somente uma FE `ENVIO_INDETERMINADO/NO_RECONOCIDO` ou `ENVIADO/NO_RECONOCIDO`; a FE pode chegar a `APROBADO` posteriormente, mas o cliente não aparece no fluxo de seleção NCE e a busca não tenta consulta; o worker NCE não a alcança. Isso não torna FE automaticamente elegível (o bloqueio de emitir sem APROBADO é correto), mas impede a **reconciliação limitada ao selecionar/buscar**, prevista RN-01/CA-02. `fe_documento_registrar_consulta_flujo_nce` já contempla consulta de FE em `ENVIO_INDETERMINADO` e `NO_RECONOCIDO` sem resultado final, com permissão CREAR/EDITAR, sem reenvio.

**Correção necessária:** incluir na descoberta/reconciliação somente estados que a função SQL e o gateway já admitem como FE legítima sem decisão, com limites de número/frequência e alcance de empresa/sucursal. **Nunca** listar como elegível sem `APROBADO` + CDC válido; apenas consultá-las para atualizar decisão. Sem ampliar worker global ou criar segundo agendador. Testes focados de filtros/tenant/rate limit.

## Verificações positivas por inspeção (não equivalem a homologação)

- **Relacionamento:** `nce_origen` associa 1 NCE à FE por `nce_id/fe_id/fe_cdc` (44 dígitos), `nce_lineas` conserva ordinal e crédito, FK composta `(empresa_id,nce_id,fe_id)`; documentos NCE, JSON e tentativas em tabelas compartilhadas. [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:35`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L35)–91.
- **Cálculo:** PYG inteiro, total representável exatamente em `numeric(20,4)`, bases/IVA a 8 casas, sem arredondamento silencioso; `fe_documento_crear_nce` valida valores derivados e subtotais **antes da sequência**. [`lib/facturacion/payload-nce.ts:169`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L169)–215 e [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:238`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L238)–330.
- **CDC e histórico:** original `nce_origen.fe_cdc` e CDC próprio `documentos_electronicos.cdc` aparecem diferenciados em `Documentos electrónicos`. [`lib/facturacion/shared.ts:82`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/shared.ts#L82), [`app/(private)/documentos/page.tsx:406`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L406)–408.
- **Envio:** snapshot, hash/idempotência SQL, sequência NCE no ponto FE existente, início `ENVIANDO`, tentativa de transmissão `recepcion_de`, consulta `consulta_de` com `tipoDoc=NCE`; lote/HTTP não alteram `estado_sifen` como aprovado. [`lib/facturacion/nce-emision.ts:58`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce-emision.ts#L58), [`lib/facturacion/envio.ts:160`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/envio.ts#L160), [`lib/facturacion/gateway.ts:311`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/gateway.ts#L311).
- **Worker:** `instrumentation.ts` em Node, lease/`SKIP LOCKED`, consulta NCE com usuário real de mesmo tenant e CREAR/EDITAR, sem browser, código presente; implantação/execução não verificada.
- **Migração e rollback:** NEX-062 é incremental e bloqueia aplicação duplicada; rollback aborta se existem NCE ou ações `SECUENCIA`; T26 tem fixtures sintéticos e **não foi executado em PostgreSQL**.
- **Limites:** CDC 44, est/ponto 3, número 7, observação 5000, linhas ≤999, `documentos_electronicos.total numeric(20,4)`, `nce_lineas.monto numeric(24,8)`, payload JSONB com `pg_column_size<262144`. A guarda TS de 240000 bytes UTF-8 **não demonstra sozinha** `pg_column_size(jsonb)<262144`: o banco usa representação diferente, e o JSON recebe campos adicionais na função. Falha de armazenamento tende a reverter a transação; falta prova real do tamanho.
- **Persistência SQL:** os procedimentos e constraints só estão nos arquivos de migration; **não há evidência de que a NEX-062 tenha sido aplicada na VM**. Na fonte canônica consta explicitamente que NÃO está aplicada.

## Contratos externos NÃO comprovados

1. XML SIFEN: `dDesMotEmi` (E402) deve estar no XML, mas o cliente do gateway só fornece `iMotEmi`; não há evidência de como o gateway próprio acrescenta o campo. **Não inventar propriedade JSON ou afirmar que o endpoint pertence a outro gateway**. Comprovar por XML/contrato real.
2. Apenas a amostra de NCE `Devolución` (motivo 2) foi apresentada como aprovada; motivos 3,4,8 usam quantidade=1 e preço=monto, **sem aprovação real comprovada**.
3. USD/BRL/câmbio original e F023 foram revisados estaticamente; respostas SIFEN reais ainda não existem. PDF/KuDE/XML e cadência global ainda dependem de confirmação do provedor/projeto posterior.
4. T26 e SQL não executados sobre PostgreSQL descartável; não executar T26 no único banco operacional, pois cria dados sintéticos. Runner de testes pode criar/remover bases de prova: **nunca o usar inadvertidamente contra produção**.
5. Cancelamento de NCE já APROBADO detectável via consulta oficial manual; reconsulta automática pós-aprovação não foi autorizada e fica como política futura, sem inferir que há defeito atual na função de reconhecimento.

## Matriz integral RN-01…24 e CA-01…23

Legenda: **C** = implementação identificada estaticamente; **D** = defeito concreto apontado neste relatório; **R** = implementação com efeito indireto de defeito; **E** = precisa de evidência externa/ambiente real. **Não são percentuais de sucesso/homologação**. Uma mesma regra pode ter código implementado e requisito operacional não verificado.

### Regras de negócio

| Regra | Estado | Resultado |
|---|---|---|
| RN-01 | D | Consulta de FE sem resultado exclui NO_RECONOCIDO e ENVIO_INDETERMINADO (INT-03). |
| RN-02 | C | Lista paginada, CDC/número/data, saldo e NCE pendiente. |
| RN-03 | C | NCE iTiDE=5, 1 CDC FE associado e CDC próprio. |
| RN-04 | C | Somente motivos 2/3/4/8. |
| RN-05 | R | Motivo histórico/pendências implementados; risco indireto de LIBRE prematuro (INT-01). |
| RN-06 | R | Lock FE e múltiplas NCE mesmo motivo; risco de LIBRE prematuro. |
| RN-07 | D | HTTP ambíguo pode virar RECHAZO e liberar saldo (INT-01). |
| RN-08 | C | Snapshot FE, receptor e ordinal. |
| RN-09 | C | Linhas completas e esgotadas desabilitadas no código. |
| RN-10 | C | Devolución quantidade histórica/preseleção, estoque intacto. |
| RN-11 | E | Montos por linha 3/4/8 representados como qtd 1; aceitação fiscal real não comprovada. |
| RN-12 | C | Saldos por linha, precisão 8, PYG inteiro/total numeric(20,4), SQL sob lock. |
| RN-13 | E | Moeda/câmbio histórico e F023 codificados; validação gateway USD/BRL pendente. |
| RN-14 | C | Fecha de emisión do servidor America/Asuncion. |
| RN-15 | E | Observação dInfAdic e limite 5000 codificados, mapeamento gateway não comprovado. |
| RN-16 | C | Ponto compartilhado FE/NCE com sequências próprias. |
| RN-17 | D | Repeticion idempotente não rejeita ordinais duplicados (INT-02). |
| RN-18 | D | Classificação de respostas genéricas como rejeição definitiva (INT-01). |
| RN-19 | C | Documentos electrónicos, CDCs, histórico e refresh GET. |
| RN-20 | E | Worker Node com lease e cadência implementados, funcionamento real sem navegador não verificado. |
| RN-21 | R | Corregir y emitir nueva codificado; classificação errada de rejeição pode ativá-lo prematuramente. |
| RN-22 | E | CANCELADO oficial reconhecido por consulta, detecção pós-aprovação não automatizada por decisão futura. |
| RN-23 | C | Autorização sessão, alcance, SECURITY DEFINER e grants no código. |
| RN-24 | C | Sem lançamento em estoque/financeiro. |

### Critérios de aceite

| Critério | Estado | Resultado |
|---|---|---|
| CA-01 | C | Formulário e rotas próprios; histórico em Documentos. |
| CA-02 | D | CDC/FE autorizadas e aprovadas no código; reconciliação exclui certos estados sem final (INT-03). |
| CA-03 | C | NCE pendiente bloqueia e refresh está implementado. |
| CA-04 | C | Snapshot FE original em payload persistido. |
| CA-05 | C | Ordinais distinguem mesmo SKU. |
| CA-06 | C | Devolución e saldos/IVA fiscais originais. |
| CA-07 | E | Motivos 3/4/8 exigem confirmação SIFEN do contrato. |
| CA-08 | C | Motivo fixado pelo primeiro aprovado. |
| CA-09 | R | Múltiplas NCE e limites corretos sob lock; risco de desbloqueio prematuro por INT-01. |
| CA-10 | C | Bloqueio de indeterminada e lock SQL, se corretamente classificada. |
| CA-11 | E | Cancelamento reconhecido após consulta; fluxo real não comprovado. |
| CA-12 | C | Sequência independente NCE no mesmo ponto. |
| CA-13 | E | PYG/USD/BRL FX original no código; gateway real não validado. |
| CA-14 | C | Hora PY e dInfAdic, contrato externo pendente. |
| CA-15 | D | Repetição da chave não confronta conjunto unívoco de linhas (INT-02). |
| CA-16 | E | JSON e IVA codificados; XML e motivos 3/4/8 externos pendentes. |
| CA-17 | D | Envio/consulta codificados; rejeição ambígua classificada como definitiva (INT-01). |
| CA-18 | E | Worker registrado em instrumentation.ts; execução contínua real não comprovada. |
| CA-19 | R | Nova NCE após rejeição implementada, mas resultado genérico pode ser erroneamente tratado como rejeição. |
| CA-20 | C | Sem estoque/financeiro e isolamento multiempresa nas rotas. |
| CA-21 | E | Migration/rollback/runner versionados, NEX-062 e T26 não executados em PostgreSQL. |
| CA-22 | E | Testes locais relatados pelo Claude; nenhum teste real SQL/gateway/browser. |
| CA-23 | C | Auditoria independente neste commit documental. |

## Recomendação operacional e limites

**Não aplicar NEX-062 nem liberar NCE para uso fiscal enquanto INT-01 permanecer.** Após autorização do responsável, Claude deve implementar **somente INT-01/02/03 em um ciclo** e apresentar SHA; ChatGPT audita o diff sem repetir suítes gerais. A validação operacional posterior exige sequência segura de migration+backup autorizada e provas de PostgreSQL/gateway/SIFEN pelo responsável humano. Não prometer **zero defeitos** sem essas etapas e sem os resultados externos.

**Estado:** `AUD-PRO94-NCE-REVISAO-INTEGRAL-R01 = CORRECOES_NECESSARIAS`, `PRO-94 = In Progress`, `NEX-062 = NAO_APLICADA`, `T26 = NAO_EXECUTADO`, `NCE = NAO_HOMOLOGADA`.
