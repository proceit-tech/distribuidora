# Decisões pendentes de custeio (D-C1 a D-C9) — para aprovação do responsável

Requisito: REQ-2026-003 · PR #4 · Origem: `AUD-REQ-2026-003-R02` (F-003) e `levantamento/CUSTEIO-V1.md` §9 · Status: **AGUARDANDO DECISÃO — nada abaixo é aprovado até o responsável preencher a coluna "Decisão"**.

Como usar: para cada linha escolha **A** (recomendada), **B** ou escreva outra regra. Onde diz "contador", a decisão tem efeito fiscal/contábil e deve passar por quem responde pela contabilidade do cliente. Enquanto não houver decisão, a P007 usa o **padrão provisório** indicado; nenhum relatório pode ser entregue como definitivo com padrão provisório.

Legenda de efeito: **EV** = relatório de estoque valorizado · **VC** = relatório de vendas ao custo.

## Resumo para decidir (uma página)

| ID | Pergunta | Recomendação | Quem decide | Bloqueia relatório? | Decisão |
|---|---|---|---|---|---|
| D-C1 | Custo por produto×depósito ou só por produto | **A** produto×depósito | Responsável | Sim (estrutura) | ☐ A ☐ B |
| D-C2 | O que entra no valor: físico ou só disponível | **A** físico próprio (inclui reservado e quarentena), fora trânsito | Responsável + contador | Sim | ☐ A ☐ B |
| D-C3 | IVA e frete entram no custo? | **A** custo sem IVA recuperável; frete/despesas de importação entram | **Contador** | Sim | ☐ A ☐ B |
| D-C4 | Moeda base e câmbio | **A** PYG; câmbio do dia da entrada, fonte oficial definida | Responsável + contador | Sim | ☐ A ☐ B |
| D-C5 | Anulação, devolução, correção | **A** movimento inverso ao custo da saída original | Responsável + contador | Sim para VC | ☐ A ☐ B |
| D-C6 | Custo por lote | **A** sem lote (por produto/depósito) | Responsável | Não (V1) | ☐ A ☐ B |
| D-C7 | Mercadoria de terceiros | **A** fora do valor | Responsável | Sim | ☐ A ☐ B |
| D-C8 | Data de corte e saldo de abertura | **A** inventário físico + custo de abertura assinado numa data de corte | Responsável + contador | **Sim — sem isto não há relatório real** | ☐ A ☐ B |
| D-C9 | Margem: com ou sem IVA | **A** sem IVA (preço líquido − custo) | Contador | Só se houver coluna de margem | ☐ A ☐ B |

## Detalhe por decisão

### D-C1 — Nível do custo
- **A (recomendada, padrão P007):** uma linha de custo por **produto × depósito**. O mesmo produto pode ter médio diferente em D1 e D2. EV por depósito é exato; VC usa o médio do depósito de onde saiu a venda. Transferência leva o médio da origem (valor conservado).
- **B:** um custo por **produto na empresa**. EV por depósito = quantidade × médio único (subtotais por depósito ficam proporcionais, não "reais"); transferência não muda o médio. Exige mudar a chave de `inventory_costs`.
- *Se mudar depois:* reescrever `inventory_costs` e recalcular a partir dos movimentos — possível, mas só enquanto houver poucos movimentos.

### D-C2 — Físico × disponível
- **A (padrão P007):** valorizar o **saldo físico próprio** (disponível + reservado + quarentena); mercadoria em trânsito não entra até chegar. EV bate com o inventário físico.
- **B:** só **disponível**. EV menor que o físico; reservas e quarentena viram "fora do valor" e precisam de relatório à parte.
- *Efeito em VC:* nenhum (a venda sai do disponível em ambos).
- *Exige:* tratar o fluxo de transferência em trânsito (R02-F-003): o valor sai da origem no envio e só entra no destino no recebimento; a conferência saldo×valor deve explicar a diferença em trânsito.

### D-C3 — IVA, frete e despesas
- **A:** custo de entrada = valor da compra **sem IVA recuperável** + frete e despesas incorporáveis. O chamador informa o custo já calculado.
- **B:** custo com IVA (se o cliente não recupera o crédito).
- *Efeito:* altera todo o médio, portanto EV e VC. **Contador decide**; não é decisão técnica.

### D-C4 — Moeda e câmbio
- **A (padrão P007):** moeda base **PYG** por empresa; compra em USD é convertida **antes** de gravar, pela taxa do dia da entrada e fonte definida (ex.: cotação oficial publicada). A taxa usada fica registrada na compra.
- **B:** guardar custo na moeda original e converter só no relatório (mais complexo; médio por moeda).
- *Efeito:* EV sempre em uma moeda; VC compara preço de venda e custo na mesma moeda base. Sem tabela de taxas na V1: precisa ser criada se houver compra em dólar.

### D-C5 — Anulação, devolução e correção
- **A:** gerar **movimento inverso** usando o **custo congelado da saída original** (devolução de venda volta ao custo da venda, nunca ao médio atual). Compra devolvida sai ao médio vigente com ajuste explícito. O histórico nunca é editado.
- **B:** recalcular o histórico desde a data do erro (retroativo): altera relatórios já entregues; **não recomendado**.
- *Efeito:* VC passa a mostrar devolução como linha negativa ao custo original. Hoje **não está implementado** em P007 (função só cobre entrada/saída/transferência/ajustes).

### D-C6 — Lote
- **A:** custo por produto/depósito (sem lote). **B:** custo por lote (validade/rastreabilidade); aumenta tabelas e regras. Só se o cliente tiver rastreio obrigatório.

### D-C7 — Mercadoria de terceiros
- **A (padrão P007):** movimenta saldo, **não entra no valor** do estoque nem no custo. **B:** valorizar à parte, em relatório separado. Evita inflar o estoque próprio.

### D-C8 — Data de corte e saldo de abertura (crítica)
- **A:** escolher uma **data de corte**; cadastrar **saldo de abertura por produto/depósito com custo unitário assinado/validado** (movimentos de abertura com origem `ABERTURA`). Faturas anteriores à data **não** têm custo (aparecem `SIN_COSTO`; nada é inventado).
- **B:** começar sem abertura (todo estoque entra por compra futura): EV só mostra o que foi comprado depois; **inútil para o relatório urgente**.
- *Sem esta decisão e sem dados de abertura conferidos, nenhum relatório real pode ser emitido.*

### D-C9 — Margem
- **A:** margem = preço de venda **sem IVA** − custo (nas moedas base). **B:** com IVA (não recomendado: IVA não é receita).
- Hoje o relatório **não calcula margem**; entra só após esta decisão.

## O que acontece depois da decisão
1. Registrar no repositório um documento `DECISOES-...-APROVADAS` (como a `DEC-003-01..04`), com data e quem aprovou.
2. Ajustar P007 e `TESTE-P007` apenas onde a decisão for diferente do padrão (novo SHA e nova auditoria).
3. Só então detalhar API, tela e XLSX (`ROTEIRO-IMPLEMENTACAO-V1-MODULOS.md`).
