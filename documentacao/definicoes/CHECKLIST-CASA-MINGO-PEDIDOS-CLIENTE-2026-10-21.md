# Checklist de escopo — Pedidos de José Franco / CASA MINGO

**Data de corte:** 21/10/2026.
**Objetivo:** acompanhar **somente** os pedidos trazidos por José Franco (mensagens/áudio de 20/10) e as decisões já tomadas pelo responsável. **Não é backlog geral do NEXIT, pedido de nova funcionalidade nem homologação**.
**Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Último commit funcional de referência (E06):** `64b9c7f7f706a5a8047e03087e7bc41a9f74f62e`.
**Regras oficiais:** `documentacao/definicoes/HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md`, `documentacao/definicoes/REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md`, `documentacao/definicoes/REQ-NEXIT-CONFIGURACION-API-EDITABLE-2026-10-21.md`, `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` e `PROGRESSO-NEXIT-V1.md`.

## Legenda

- **[x] Código implementado e auditorado estaticamente:** commit e relatório de auditoria publicados. **NÃO homologado na VM**.
- **[~] Código entregue; auditoria pendente:** ainda NÃO liberar próxima entrega.
- **[ ] Pendente de implementação:** escopo já aprovado; não iniciar até autorização/gate anterior.
- **[fora] Fora do escopo após decisão posterior do responsável.**

## 1. Facturación Electrónica — FE

| ID | Pedido do cliente | Estado | Entrega / pendência operacional |
| --- | --- | --- | --- |
| FE-01 | Digitar quantidades fracionárias com vírgula ou ponto para todos os produtos, inclusive SIFEN 77; até 4 casas | [x] | E01; sem browser |
| FE-02 | Depois de adicionar produto, editar `Cantidad` imediatamente, inclusive no seletor avançado | [x] | E01; foco real no browser ainda pendente |
| FE-03 | Verificar estoque disponível e bloquear venda acima do saldo | [x] | E02; NEX-067 não aplicada |
| FE-04 | Alocar automaticamente entre depósitos autorizados, mostrar quantidades e dar baixa ao emitir | [x] | E02; NEX-067 não aplicada, concorrência PG não homologada |
| FE-05 | Desconto por item em % ou monto, com cálculo/IVA correto | [x] | E03; homologação gateway/SIFEN pendente; monto particular por unidade conforme EA002 |
| FE-06 | Desconto geral em % ou monto, acumulável com o particular | [x] | E03; testes fiscais com gateway real pendentes |
| FE-07 | Escolher direção de entrega entre filiais já cadastradas, default automático e troca; sem endereços, aviso não bloqueante | [x] | E04; NEX-068 não aplicada; snapshot validado só estaticamente |
| FE-08 | PYG sem decimais **na apresentação** de preço, IVA, resumo, pagamentos, crédito e lateral; precisão fiscal conservada | [x] | E05; sem browser |
| FE-09 | Mostrar `Establecimiento 001` | [x] | E05; sem browser |
| FE-10 | Não perder zeros iniciais de código de produto (incluídos 11 dígitos) no cadastro/busca/payload | [x] | E05; sem browser |

## 2. Notas de Crédito — NCE

| ID | Pedido do cliente | Estado | Entrega / pendência |
| --- | --- | --- | --- |
| NCE-01 | Checkbox individual, `Seleccionar todos` e `Eliminar seleccionados` apenas na nota (nunca na FE original) | [~] | E06 entregue no commit 64b9c7f7; auditoria E06-R01 **PENDENTE** |
| NCE-02 | Devolução parcial por quantidade (ex.: 2 de 5), aceita vírgula/fração e respeita saldo | [~] | E06 entregue; auditoria E06-R01 pendente |
| NCE-03 | NCE de devolução **não gera entrada automática de estoque** | [~] | E06 mantém regra; entrada de inventário manual separada; auditoria pendente |
| NCE-04 | Motivos `Descuento` e `Bonificación`: botão `+ Agregar DESCUENTO`; único serviço fixo, qty=1, valor digitado, IVA10, zero stock | [ ] | E07 NÃO iniciada; adaptar validação/SQL/payload fiscal, não só criar SKU |
| NCE-05 | Retirar todos os itens originais da nota e emitir só linha DESCUENTO sem afetar FE original | [ ] | Depende E06 auditada e E07; IVA10 para FE original 5%/isenta/mista requer prova SIFEN real |
| NCE-06 | KuDE NCE aprovada: botão, visor, impressão e download próprios; payload cinco campos e `tipoDoc=NCE` (FE com tipoDoc=FE), sem `tipOpe` | [ ] | E08 NÃO iniciada; conservar desenho e integração FE |

## 3. API, cancelamento e operação

| ID | Pedido / decisão | Estado | Entrega / pendência |
| --- | --- | --- | --- |
| API-01 | Editar, testar e guardar URL, usuário e senha da API por empresa | [x] | G01/PRO-207, auditoria G01-R02; NEX-069 não aplicada; TLS real pendente |
| API-02 | Nova URL efetiva para envio/consulta/KuDE sem mudar a identidade fiscal do emissor | [x] | G01, sem gateway real testado |
| EVT-01 | Cancelamento SIFEN FE em 48h / NCE em 7 dias | [ ] | E10 NÃO iniciada; verificar contrato oficial de evento e critérios de prazo |
| EVT-02 | Após cancelamento **oficial** de FE, estorno automático, idempotente e auditável do estoque aos depósitos originais | [ ] | E10, depende NEX-067 e contrato real; não estornar antes de confirmação |
| BASE-01 | Catálogo e estoque inicial CASA MINGO existentes | [x] | 561 produtos importados; 91.864 unidades confirmadas em MOV-000003/004, mais dois produtos anteriores. **Não reimportar/duplicar** |

## 4. Fora do escopo — não abrir tarefas

- [fora] Trocar empresa de teste, RUC, nome do emissor, logo no KuDE ou ambiente do provedor. O cliente verá sua identidade na produção; não mudar ambiente alheio.
- [fora] Redesenhar KuDE FE/NCE, coluna `Cod. Barra`, largura da coluna `Código`, uma página, limite de 23 itens. O responsável retirou esses pedidos para esta rodada.
- [fora] Abrir revisão geral de menus, melhorias de mobile, inventário geral, cadastros, novos catálogos, outras tarefas não trazidas pelo cliente.
- [fora] Executar novamente scripts de importação do catálogo ou lançamento de estoque inicial.
- [fora] Automatizar entrada de mercadoria por NCE de devolução; é movimento separado no Inventário.

## Próximas ações — ordem estrita, sem abrir novas frentes

1. **Agora:** ChatGPT realiza **auditoria E06-R01** sobre commit `64b9c7f7f706a5a8047e03087e7bc41a9f74f62e`. Não marcar E06 aprovada apenas porque Claude relatou 23/0; navegador/PG ainda não executados.
2. **Se E06 passar:** Claude desenvolve **apenas E07 — DESCUENTO/BONIFICACIÓN** e para para auditoria; não entrar em mudanças de KuDE ou outro módulo simultaneamente.
3. **Após E07 auditada:** **E08 — KuDE NCE** com contrato de cinco campos; parar para auditoria.
4. **E10 cancelamento:** permanecer registrado como demanda do cliente, mas desenvolvimento depende do contrato SIFEN real e da decisão de sequência/implantação. Não expandir para integração geral.
5. **Implantação/homologação operacional pelo responsável humano:** antes de testar FE com stock/destino e G01 na VM, revisar backup, lista real de migrations e aplicar **NEX-067, NEX-068, NEX-069** apenas com autorização, scripts preflight/verificar e procedimento. Mesmo após deploy, testar navegador e gateway/SIFEN reais. O Git não confirma que esteja publicado.

**Regra permanente:** implementação no Git != auditoria estática != homologação do responsável. Trabalhar apenas um pedido do checklist de cada vez; nenhuma tarefa fora deste escopo sem autorização expressa.
