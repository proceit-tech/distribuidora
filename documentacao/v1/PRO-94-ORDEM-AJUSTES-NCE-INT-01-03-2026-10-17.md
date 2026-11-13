# PRO-94 — ORDEM AUTORIZADA DE IMPLEMENTAÇÃO: NCE-INT-01/02/03

**Data:** 2026-10-17. **Responsável:** autorizou expressamente ao **Claude Code** um ciclo de implementação dos três defeitos concretos da revisão integral independente. **ChatGPT** auditará o commit resultante; responsável humano decidirá aplicação no único ambiente operacional. Esta ordem não é homologação nem autorização para SQL/deploy.

**Branch oficial:** `feature/NEXIT-2026-001-banco-demo` em `proceit-tech/distribuidora`.  
**Relatório vinculante:** `documentacao/testes/AUD-PRO94-NCE-REVISAO-INTEGRAL-R01-2026-10-17.md` (3 achados, matriz das 24 RN/23 CA).  
**Requisitos:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` — RN-01/05/07/17/18/21, CA-02/09/15/17/19.  
**Protocolo obrigatório:** ler integralmente `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, PRO-94 no `PROGRESSO-NEXIT-V1.md`, depois auditar o código real antes de alterar.  
**Estado atual:** NEX-062 **NÃO aplicada**, T26 **NÃO executado** em PostgreSQL, NCE **NÃO homologada**.

## Objetivo fechado

Corrigir **exclusivamente** os três achados confirmados, sem abrir novas funcionalidades, sem reescrever FE ou gateway, sem novas migrations, sem alterar controle fiscal/IVAs anteriores e sem alterar NEX-047…062 salvo defeito estritamente demonstrado que torne impossível cumprir o aceite; se isso surgir, **PARAR e documentar impedimento** antes de mudar SQL. A correção da classificação ambígua é crítica e deve ser tratada primeiro.

## INT-01 — ALTA / bloqueante: rejeição de gateway sem identidade não pode liberar crédito de NCE

### Falha demonstrada

`lib/facturacion/gateway.ts` → `interpretarRecepcion`: HTTP 400/422 genérico, ou HTTP 200 com `status:"error"` genérico, pode ser traduzido em `estadoLocal="ERROR_ENVIO", errorTipo="RECHAZO"` sem evidência que identifica **a NCE efetivamente enviada**. Na NEX-062, `fe_nce_clasificar` trata `ERROR_ENVIO/RECHAZO` como `LIBRE` e `propuestaCorreccion`/tela liberam «Corregir y emitir nueva». Uma mensagem ambígua pode, portanto, liberar saldo prematuramente.

### Ação autorizada

1. Na política de **recepção de NCE** do parser/fluxo do gateway, somente classificar `ERROR_ENVIO/RECHAZO` quando o retorno de validação demonstrar **rejeição específica da NCE pela identidade fiscal do próprio documento** conforme o contrato de retorno já comprovado e a lista `Rechazados`; nenhuma mensagem livre, HTTP isolado ou `status:error` sem associação bastam. Se houver `Aceptados` contraditório, também não declarar rejeição.
2. Respostas genéricas sem rejeição específica, 4xx desconhecido, duplicidade, 5xx, timeout, falha de rede e retorno indecifrável **não liberam saldo**: manter como `ENVIO_INDETERMINADO`, `errorTipo=null`, classe SQL `BLOQUEA`. Preservar tentativa, HTTP, mensagem sanitizada e controle anti-reenvio.
3. **Preservar FE/FAT-E2:** `interpretarRecepcion` é módulo **compartilhado**. Implementar isolamento mínimo por tipo NCE ou endurecimento comum apenas se comprovadamente compatível com os contratos e testes existentes; não alterar sem necessidade os casos FE de autenticação (401/403 e token vencido), rate limit 429, rejeições explícitas por número, recepção com lote/CDC e consultas SIFEN. Nunca marcar APROBADO por HTTP/lote.
4. **Não alterar SQL de `fe_nce_clasificar` como substituto da correção de origem**: a classe `LIBRE` por RECHAZO permanece válida **quando a rejeição do próprio DE for inequívoca**. Se identificar impossibilidade de distinguir retornos confiáveis só com o parser, registrar bloqueio contratual e não supor outro endpoint.
5. Resposta ambígua não pode mostrar «Corregir y emitir nueva» como rejeição definitiva; manter consulta/reconciliação e aviso de indeterminado, sem trocar número.

**Aceites A01–A09 (testes focados, sem rede):** para uma NCE identificada, (A01) 422 `{"status":"error","message":"Error de validación"}` → indeterminado/bloqueia; (A02) HTTP 200 `{"status":"error","message":"Error general"}` → indeterminado/bloqueia; (A03) `Rechazados` vinculando exatamente o número da NCE, sem `Aceptados` contraditório/duplicidade → RECHAZO definitivo; (A04) erro de outro número → indeterminado; (A05) 409/duplicado → indeterminado; (A06) timeout/5xx/red → indeterminado; (A07) resposta success+lote ou CDC coerente → ENVIADO, **não APROBADO**; (A08) 401/403/token e 429 preservam tratamento seguro documentado, sem tornar bloqueada uma falha comprovadamente anterior à transmissão; (A09) FE/FAT-E2 existentes não sofrem regressões no pequeno conjunto de cenários tocados. Se necessário, adicionar asserção localizada de coerência `RECHAZO ⇒ resposta do próprio documento`, sem pedir DB real.

**Pontos de código:** `lib/facturacion/gateway.ts`, testes dirigidos em `lib/facturacion/nce.casos.ts` e `lib/facturacion/fat-e2.casos.ts`, apenas outros arquivos diretamente necessários à semântica da NCE.

## INT-02 — MÉDIA: idempotência compara linhas por conjunto unívoco, nunca com duplicadas

### Falha demonstrada

`lib/facturacion/nce-emision.ts` → `repeticion` compara cardinalidade e usa `cuerpo.lineas.every(l => guardadas.find(x=>x.linea===l.linea))`. NCE guardada `[1:100,2:200]` pode aceitar, com a mesma chave, corpo novo `[1:100,1:100]` porque encontra duas vezes o registro 1.

### Ação autorizada

1. Antes de aceitar reutilização por idempotência, rejeitar ordinal duplicado em `cuerpo.lineas` e garantir **correspondência bijetiva** da entrada com as linhas persistidas; as ordens podem variar se a semântica fiscal permitir, mas cada ordinal deve corresponder a um registro único. Não aplicar `sort` destrutivo ao array do usuário nem assumir que identificador de produto = ordinal.
2. Validar motivo, FE, sucursal, ponto, observação e **valor correto por motivo** (quantidade em Devolución; monto em 3/4/8), em precisão decimal; preservar a identidade já verificada e a idempotência do SQL. Evitar aceitar solicitação diferente que reutilize número/documento.
3. Repetição idêntica continua retornando mesmo `documentoId`/número sem reservar outro nem chamar `prepararNce` (pois uma NCE própria pendente já bloquearia o saldo); parâmetros conflitantes → HTTP 409/erro claro.
4. Se fizer sentido, rejeitar ordinais repetidos também no parser `leerCuerpoNce` para tornar a API consistente em `previa` e `emitir`, mantendo validação posterior SQL. Alterar apenas fluxo NCE; sem mexer na FE.

**Aceites I01–I07:** (I01) corpo idêntico usa mesma NCE; (I02) mesma NCE com linha reordenada e mesmo conteúdo não duplica nem muda número; (I03) `[1,2]` persistida vs corpo `[1,1]` com mesma chave → 409 (ou 400 de entrada inválida, antes da idempotência); (I04) linha ausente ou outra linha → conflito; (I05) mesmo ordinal com quantidade/monto diferente → conflito; (I06) mesmo valor em ordinais **diferentes** não vira a mesma linha; (I07) motivo/FE/ponto/observação diferentes continuam conflitantes.

**Pontos de código:** `lib/facturacion/nce-emision.ts`, opcionalmente `lib/facturacion/nce.ts` para validação prévia, `lib/facturacion/nce.casos.ts` mockado/puros, sem PG real.

## INT-03 — MÉDIA: reconciliar FE sem decisão fiscal na busca da NCE

### Falha demonstrada

`lib/facturacion/nce.ts` → `buscarClientesConFacturas` descobre FE `APROBADO` ou `ENVIADO + SIN_CONSULTA/PENDIENTE`; `lib/facturacion/nce-emision.ts` → `reconciliarFacturasPendientes` consulta só esse subconjunto. O worker atual `TIPOS_CONSULTA_AUTOMATICA=["NCE"]`; FE `ENVIO_INDETERMINADO/NO_RECONOCIDO` ou `ENVIADO/NO_RECONOCIDO` pode não aparecer para reconciliar na busca. A elegibilidade da FE exige APROBADO + CDC válido e NÃO deve ser ampliada.

### Ação autorizada

1. Para **descoberta do cliente e reconciliação limitada ao procurar facturas da NCE**, incluir somente combinações de estado de FE sem decisão definitiva **permitidas pela função `fe_documento_registrar_consulta_flujo_nce` e pelo gateway atual**: estados locais `ENVIADO`/`ENVIO_INDETERMINADO`, estado SIFEN `SIN_CONSULTA`/`PENDIENTE`/`NO_RECONOCIDO`. Filtrar `tipo='FE'`, tenant, cliente, sucursal e sessão reais. Não consultar `PENDIENTE_ENVIO`, `ENVIANDO`, FE `RECHAZADO`, `CANCELADO` ou `APROBADO` de novo por esse caminho.
2. Reutilizar `consultarEstado(...,{flujoNce:true})` **somente para consulta de FE não definitiva**, pois função SQL NCE já aceita FE pendente; manter limite de até **5 FE** e pausa de **60 segundos** por documento, sem chamadas N×listado ilimitadas.
3. Listar como **elegível para emitir NCE** exclusivamente a FE `APROBADO`, CDC válido/coerente e saldo > 0, respeitando bloqueio NCE pendente. O cliente pode aparecer para reconciliação mesmo antes de haver FE selecionável; UI deve exibir mensagem apropriada, sem criar expectativa de aprovação.
4. Nenhum segundo worker, nenhuma alteração do escopo global de consultas automáticas, nenhum reenvio de FE/NCE, nenhuma nova permissão, nenhum status presumido.

**Aceites F01–F07:** (F01) cliente com FE `ENVIADO/SIN_CONSULTA` é descoberto e sua FE é consultada respeitando 60s; (F02) `ENVIADO/NO_RECONOCIDO` idem; (F03) `ENVIO_INDETERMINADO/SIN_CONSULTA` idem; (F04) `ENVIO_INDETERMINADO/NO_RECONOCIDO` idem; (F05) `PENDIENTE_ENVIO` e definitivo rejeitado não são consultados; (F06) nenhuma dessas FE aparece elegível sem APROBADO+CDC confiável; (F07) fora do tenant/sucursal/cliente e mais que 5 registros não são consultados. Falha de consulta não libera FE nem interrompe busca do cliente.

**Pontos de código:** `lib/facturacion/nce.ts`, `lib/facturacion/nce-emision.ts`, teste localizado em `nce.casos.ts`. Sem migration para ampliar condição da consulta FE.

## Invariantes obrigatórias e não escopo

- Não mexer em `NEX-062` (ainda não aplicada) por reflexo, nem em migrations aplicadas ou T26 se nenhuma das três correções o exigir. Em especial manter `nce_origen.fe_cdc`, `nce_lineas`, FK composta, ordinal, gravação de estados e SQL locks, número NCE independente do FE dentro do mesmo ponto, total PYG inteiro e precisão de `numeric(20,4)`, IVA até 8 decimais, CDC próprio só após retorno coerente.
- Não inventar `dDesMotEmi` ou endpoint PDF/XML/KuDE. A transformação JSON→XML do gateway, os motivos 3/4/8, moeda estrangeira e SIFEN real continuam **sem homologação**.
- Não permitir novo crédito por resposta indeterminada; não duplicar número nem reenviar NCE/FE às cegas. Não mover estoque/financeiro, não implementar cancelamento, novos perfis, NDE/NRE/AFE, worker global, menu/tela novos, telemetry ampla ou refatoração de arquitetura.
- Segredos/credenciais/tokens devem continuar ausentes das respostas ao cliente e de logs. Controle tenant e sucursal em cada consulta e atualização.

## Execução estritamente limitada ao Claude Code

1. No clone local, antes de editar: `git status`, confirmar branch, `git fetch`, sincronizar somente via fast-forward seguro. Se houver conflito/alteração local: parar e informar sem descartar arquivos. Ler integralmente protocolos, progresso, especificação, auditoria e esta ordem; inspecionar código real.
2. Fazer **uma única implementação** INT-01, INT-02 e INT-03 na mesma branch. Garantir que testes/alterações não reescrevam comportamento compartilhado da FE indevidamente.
3. Rodar somente **testes dirigidos** aos casos **A01–A09, I01–I07, F01–F07** e pequena regressão FAT-E2 **apenas se o parser compartilhado foi tocado**; não voltar a rodar milhares de casos aprovados ou suíte integral, `next build`, lint/tsc globais, nem CI manual. Uma verificação pontual de sintaxe do código modificado é permitida se realmente necessária. Registrar **somente o que executou**, com resultados honestos.
4. **Não acessar VM/SSH/Docker/PostgreSQL real**, não rodar T26 nem aplicar NEX-062. Não enviar solicitações reais ao gateway/SIFEN, não executar migração, não criar base falsa operacional. Dados simulados em testes locais podem provar apenas o código, não a produção.
5. Atualizar apenas a seção PRO-94 pertinente do `PROGRESSO-NEXIT-V1.md`, sem editar `AUD-*`, sem novos documentos redundantes. Commit e push na branch oficial; não mergear `main`. Informar **SHA completo**, total/resumo mínimo de testes dirigidos, bloqueios e pontos dependentes de homologação. **PARAR para ChatGPT fazer AUD-PRO94-NCE-REVISAO-INTEGRAL-R02**.
6. A auditoria do ChatGPT deverá conferir diff, invariantes de envio/saldo/FE, cenários dirigidos, ausência de alteração indevida de migrations e limitação do contrato gateway. Uma aprovação estática **não substitui** validação SQL/gateway/SIFEN autorizada pelo humano.

**Estado obrigatório após o commit do Claude até prova em contrário:** `PRO-94 = In Progress`, `NEX-062 = NÃO APLICADA`, `T26 = NÃO EXECUTADO EM POSTGRESQL`, `NCE = NÃO HOMOLOGADA`.
