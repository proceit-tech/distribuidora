# ORDEM DE DESENVOLVIMENTO CLAUDE — PRO-342-R01 / Fluxo fiscal correto do NEXIT

**Data:** 11/11/2026
**Repo:** `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`
**Linear:** [PRO-342](https://linear.app/proceit/issue/PRO-342) · **GitHub:** [#19](https://github.com/proceit-tech/distribuidora/issues/19)
**Analista e regras de negócio:** ChatGPT / PROCEIT. **Desenvolvedor:** Claude.
**Especificação ÚNICA e VINCULANTE:** [PRO-342 — solução simplificada](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md) incluindo a **RETIFICAÇÃO OPERACIONAL** no topo (`XML firmado` é INTERMEDIÁRIO, exige reconsultas). Se relatórios D01/R03-R06, commits ou banners históricos divergirem, prevalecem a decisão recente do responsável e ESTA ordem.
**AUTORIZAÇÃO DESTA ORDEM:** implementar CORREÇÃO DE CÓDIGO e escrever casos de teste, sem executá-los; se indispensável, criar SQL NEX-079 **APENAS VERSIONADA**, NÃO aplicada. **NÃO autoriza execução de testes, lint, typecheck, build, CI, SQL, gateway real, migrations, VM/Docker nem deploy.** Não reemitir nem alterar registros fiscais.

## OBJETIVO ÚNICO, DO INÍCIO AO FIM

Corrigir a implementação do fluxo real:

```text
CRIAR DOCUMENTO/JSON (uma vez)
   ↓
ENVIAR JSON à API (uma vez) → gravar ACK + LOTE ORIGINAL + histórico ENVIO
   ↓
CONSULTA 1: "XML firmado"  → gravar histórico, estado INTERMEDIÁRIO
                KuDE pode estar habilitado; NÃO é aprovação nem rejeição
                CDC só se a API o devolver (não supor presença)
   ↓
CONSULTA 2, 3, 4...: MESMO documento, somente consulta (NUNCA reenvio JSON)
   ↓
SIFEN "Aprobado" OU "Rechazado" → gravar estado FINAL, código, mensagem, data
   ↓
PARAR reconsultas fiscais desse estado FINAL;
preservar histórico de todas as consultas, inclusive "XML firmado", erros e transições.
```

### 1. ENVIO / LOTE (corrigir sem reescrever sistema)
- Manter JSON fiscal persistido, série AA e idempotência existentes. `POST /api/recepcion_de` SOMENTE no envio original; `POST /api/consulta_de` para reconsultar sem CDC.
- `ENVIADO` significa ACK de recepção pelo gateway, NÃO `APROBADO` fiscal. Não confundir sucesso HTTP ou `status:success` com aprovação SIFEN.
- Conservar `nro_lote` **exatamente** como veio do gateway, inclusive quando a senha sintética coincide com substring do lote. Não gravar `[omitido]` no lote operacional. Sanear somente mensagens/logs/campos livres. Não imprimir senhas/tokens.
- Usar conexão da própria empresa e registrar referência não secreta da conexão efetivamente utilizada por tentativa (se necessário, NEX-079 versionada), sem criar nova configuração/conta/emissor de testes ou alterar credenciais.
- Não criar segundo envio automático ao falhar consulta, KuDE ou perder resposta. Em caso indeterminado, preservar histórico e exigir verificação, não reenviar.

### 2. CONSULTAS REPETIDAS E ESTADO FINAL — A PRIORIDADE CENTRAL
- `XML firmado` é o PRIMEIRO ESTADO INTERMEDIÁRIO do gateway. Registrar texto bruto exatamente, horário, HTTP, código/mensagem quando houver, e manter a factura elegível para a **PRÓXIMA consulta** automática.
- Usar o worker existente `lib/facturacion/consulta-automatica.ts` e `instrumentation.ts`, com reserva/lease/backoff NEX-077, FE e NCE, sem outro cron, monitor ou scheduler.
- **NÃO ENCERRAR** por `XML firmado`, `NO_RECONOCIDO`, estado técnico pendente, existência de CDC ou KuDE habilitado. Continuar consultando (com intervalos e retry existentes) até `Aprobado` ou `Rechazado`. Em falha transitória, registrar tentativa/reagendar. Não inventar estado final nem bloquear eternamente por uma string intermediária. Qualquer condição que inviabilize consultas deve ficar visível para o operador.
- Quando API disser `Aprobado` ou `Rechazado`, persistir estado SIFEN FINAL, `codRespuesta`, mensagem, data e documento associado, e só então parar a rotina de consultas normais. Preservar tratamentos de cancelamento/inutilização já existentes; não regredir proteção de estados finais.
- `XML firmado` não é o status fiscal consolidado. UI distingue `estado_local` (recepção), último texto bruto gateway (`XML firmado`), histórico das tentativas e `estado_sifen` definitivo.

### 3. CDC: DADO DA API, SEM NOVAS FÓRMULAS
- NEXIT **NUNCA** calcula, gera, completa, reconstrói, inventa ou mascara o CDC operacional. NÃO envia CDC no request de `consulta_de`.
- **Não presumir** que `XML firmado` retorna CDC: se não veio, permanecer NULL. Se a API realmente devolver CDC para o documento consultado, guardar **a sequência EXATA de 44 dígitos** recebida (sem aguardar `Aprobado`), uma vez, sem substituir depois. Outro JSON/documento terá seu próprio CDC informado pela API; não reutilizar do anterior.
- Manter isolamento empresa/documento e proteger contra valores retornados para outro documento ou texto livre que o parser não reconhece como campo fiscal do contrato. **Não acrescentar regras locais novas** de RUC/DV/fecha/checkdigit/serie dentro de CDC, nem OCR/criptografia, nem assumir que `response.CDC` aninhado é oficial sem prova. Resolver contradição do parser/saneador já documentada em R05/R06 usando campo/rota reconhecida no contrato real; se houver dependência indisponível de fornecedor, comunicar bloqueio específico sem improvisar.
- Não modificar CDC nem estados históricos via SQL. Se o histórico antigo tem `[omitido]`, marcar como evidência incompleta; somente nova resposta oficial autorizada poderá proporcionar CDC ausente.

### 4. HISTÓRICO
- Cada `ENVIO` e cada `CONSULTA` realmente realizada deixa tentativa append-only: documento/empresa, data, HTTP, resultado, estado bruto, código, mensagem, lote/CDC informados se vierem. A consulta manual deve preservar também `cdc_informado` de forma equivalente à automática, sem mutilar valor fiscal.
- Erro de rede/timeout fica no histórico, sem inventar resposta SIFEN nem apagar finais anteriores; não gravar tentativas falsas de chamadas que não ocorreram.
- Se `SIN_CONSULTA` persiste como estado fiscal validado, a UI DEVE mostrar que houve consulta técnica `XML firmado`, para não parecer que nunca se consultou.
- Se precisar evoluir schema, criar **só NEX-079 incremental e versionada**, preservando funções/índices/RLS e compatibilidade sem executar. Não editar NEX-047...NEX-078 existentes.

### 5. KuDE
- `KuDE habilitado` durante `XML firmado` é apenas DISPONIBILIDADE DO PDF, **NÃO** aprovação ou rejeição e NÃO cancela as consultas automáticas.
- Preservar contrato FE `tipoDoc:"FE"` com cinco campos; NCE `tipoDoc:"ncr", tipOpe:"4"` com seis; não inventar CDC nem depender de resultado final para consultar KuDE.
- Usar empresa, gateway, tipo, EEE/PPP/número/serie do documento escolhido e resposta verdadeira da API. Não apresentar PDF de outro emissor como pertencente ao documento; não alterar PDF nem gerar substituto. Se a API não comprova a correspondência entre pedido e PDF devolvido, tratar como resposta inconsistente e documentar dado do provedor que falta. Não criar OCR, regras de série dentro de CDC nem novo RUC de teste.

## ARQUIVOS E ALCANCE
Ler `CLAUDE.md`, especificação vinculante, auditoria e **versão COMPLETA MAIS RECENTE de cada arquivo, UM POR VEZ**. Focar `lib/facturacion/gateway.ts`, `estados.ts`, `reconciliacion.ts`, `shared.ts`, `consulta-automatica.ts`, `envio.ts`, `presentacion-sifen.ts`, os componentes/rotas estritamente necessários do histórico/KuDE, casos reais e eventual NEX-079. **Não modificar** PRO-340, estoque, descontos, FE editor, limites NEX-078 ou outras áreas. Informar se algum arquivo adicional for realmente indispensável antes de ampliá-lo.

## CASOS FONTE OBRIGATÓRIOS — ESCREVER, NÃO EXECUTAR
1. ENVIO único: JSON identidade `001-001-0000001 (AA)`, lote exato com senha sintética coincidindo com RUC e sem `[omitido]`.
2. Consulta 1 `XML firmado` sem CDC, com KuDE habilitado: salvar tentativa e **manter elegível** para consulta 2, sem APROBADO/RECHAZADO.
3. Consulta 1 `XML firmado` com CDC efetivamente informado: guardar CDC exato, manter reconsulta.
4. Consulta 2 `XML firmado` novamente ou erro transitório: histórico duplo/triplo e agendamento seguinte, sem reenvio de JSON.
5. Consulta posterior `Aprobado`: gravar estado/código/mensagem/data e encerrar consultas.
6. Consulta posterior `Rechazado` (p.ex. código 1101): mesma persistência e encerramento, sem falso APROBADO.
7. Nenhuma consulta posterior sobrescreve CDC do MESMO documento; uma nova FE/JSON não recebe CDC da anterior.
8. Consulta manual e worker real (com DB/fetch SIMULADOS) conservam histórico, flags/leases e reprogramação, sem duplicidade entre instâncias.
9. KuDE habilitado desde XML firmado, acessível sem aprovação; PDF de outro documento não se apresenta como factura correta.
10. Mensagens e tokens secretos saneados, CDC/lote fiscal operativo intactos, e dados antigos nunca reparados por suposição.

Os casos devem exercitar **FUNÇÕES REAIS** com dependências simuladas, não criar funções-testes paralelas que não passam pelo caminho de produção. Não afirmar «teste passou» quando foi somente escrito.

## ENTREGA E STOP
- Publicar UM commit funcional (ou commits necessários do MESMO escopo PRO-342-R01) em Draft, com SHA(s) completos, lista exata de arquivos, resumo da correção integral e casos novos escritos **0 EXECUTADOS**.
- **NENHUM** teste/lint/typecheck/build/CI/SQL/migration/VM/Docker/gateway real/deploy; nenhuma reemissão, alteração de CDC/lote/status históricos ou conta/credenciais.
- **PARAR para AUDITORIA INDEPENDENTE CHATGPT PRO-342-R01** após push. Não iniciar PRO-340 nem retornar à PRO-338-R06 separadamente.
