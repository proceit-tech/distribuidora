# CUSTEIO V1 — custo médio ponderado móvel, custo histórico e bases dos relatórios

Requisito: REQ-2026-003 · PR #4 · Resposta a **AUD-REQ-2026-003-R01 / F-003 e F-007** · Decisões: `definicoes/DECISOES-REQ-2026-003-CUSTEIO-E-ENTREGA-REAL.md` (DEC-003-01..04) · Implementação de referência: `migracoes/propostas/REQ-2026-003-P007-custeio-up.sql` · Testes: `validacoes/TESTE-P007-custeio.sql` (61 verificações, PostgreSQL 16 descartável).

> Nada aqui está em produção, nada foi executado no banco real e **não existe custo histórico para as faturas antigas**: o legado não persiste saldo, movimento nem venda (ver `DIAGNOSTICO-V1.md`). Quem não tem vínculo aparece como `SIN_COSTO`; o custo nunca é inventado.

## 1. Decisões que este documento executa

| Decisão | O que significa na prática |
|---|---|
| DEC-003-01 só dados reais | Os relatórios leem `inventory_costs`, `inventory_movement_lines`, `invoice_lines`; nenhum número de `localStorage` ou mock entra. |
| DEC-003-02 custo médio ponderado móvel | A cada **entrada** o custo médio do produto no depósito é recalculado; a **saída** sai ao custo médio vigente. |
| DEC-003-03 custo histórico nas saídas e vendas | A linha de movimento grava `unit_cost`/`total_cost`/`cost_currency_code` **no momento da saída**; a linha de fatura aponta para essa saída. Mudanças posteriores no custo médio não alteram o passado. |
| DEC-003-04 relatórios futuros | Estoque valorizado e vendas ao custo (+ XLSX) são **consultas sobre as views da P007**; a exportação XLSX e a API são implementação futura, em PR próprio. |

## 2. Método

- Nível do custo: **empresa × produto × depósito** (`inventory_costs`, uma linha). Alternativa "só por produto" fica em D-C1.
- Fonte da verdade: **valor total** (`total_value`), não o custo unitário. O médio é derivado (`average_cost = total_value / valued_quantity`, 4 casas). Isso evita acumular erro de arredondamento.
- Só mercadoria **PROPIO** em estado **DISPONIBLE** é valorizada. `TERCERO`, reservas, quarentena e trânsito movimentam saldo mas **não** entram no valor (D-C2, D-C7).
- Toda movimentação passa por `inventory_post_line()`: saldo + custo + linha na **mesma transação**, com bloqueio determinístico (`FOR SHARE` no cabeçalho; linhas de `inventory_costs` travadas em ordem) para duas saídas concorrentes não gastarem o mesmo saldo.

## 3. Fórmulas

Para uma **entrada** de `q_in` unidades com custo unitário `c_in` (na moeda base da empresa), sobre `q` unidades valendo `V`:

- valor da entrada: `v_in = round(q_in × c_in, 4)`
- novo valor: `V' = V + v_in`; nova quantidade: `q' = q + q_in`
- **novo custo médio** = `round(V' / q', 4)` — equivale a `(q×médio + q_in×c_in) / (q + q_in)` (DEC-003-02), mas sem arredondamento intermediário.

Para uma **saída** de `q_out` (de `q`, valor `V`):

- se `q_out = q` (zera o saldo): custo total = `V` (o resíduo inteiro)
- senão: `custo_total = round(V × q_out / q, 4)`; `custo_unitário = round(custo_total / q_out, 4)`
- depois: `q' = q − q_out`, `V' = V − custo_total`, médio recalculado = `round(V'/q', 4)`; se `q' = 0` guarda o último médio apenas como referência (a próxima entrada recomeça do zero).

**Transferência** D1→D2: sai ao médio de D1 e entra em D2 **pelo mesmo valor** (`total_cost` da saída); a soma do valor entre os dois depósitos não muda.

## 4. Onde os dados ficam

| Dado | Tabela / coluna |
|---|---|
| Custo vigente (qtd, valor, médio) | `inventory_costs` (`valued_quantity`, `total_value`, `average_cost`) |
| Custo congelado da saída | `inventory_movement_lines.unit_cost`, `total_cost`, `cost_currency_code` (imutáveis: triggers de P005) |
| Venda → saída que a custeou | `invoice_lines.inventory_movement_line_id` (FK composta, índice único parcial) |
| Moeda base / casas decimais | `companies.base_currency_code`, `currencies.minor_units` |
| Bases dos relatórios | `inventory_valuation_v`, `sales_at_cost_v`, `inventory_cost_reconciliation_v` |

## 5. Fluxos

1. **Compra/entrada**: `inventory_post_line(empresa, movimento, produto, qtd, custo_unitário)`. Custo obrigatório e ≥ 0; entrada sem custo é recusada (não existe "custo zero por omissão").
2. **Venda**: o processo de venda registra um movimento `SALIDA` (`source_type='VENTA'`) e **antes de emitir a fatura** (enquanto `BORRADOR`, porque P006 torna `EMITIDA/APROBADA` imutável) liga cada `invoice_line` à linha de saída. Fatura emitida sem vínculo = `SIN_COSTO`.
3. **Transferência / ajustes**: mesma função; ajuste positivo exige custo, ajuste negativo sai ao médio.
4. **Conferência**: `inventory_cost_reconciliation_v` deve retornar **0 linhas** (quantidade valorizada = saldo PROPIO). Linha na view = gravação fora de `inventory_post_line`.

## 6. Exemplos calculados à mão (e conferidos pelo teste)

### 6.1 Produto PA1, depósito D1 (moeda PYG)

| Passo | Operação | Cálculo | Qtd | Valor | Médio | Custo congelado |
|---|---|---|---|---|---|---|
| E1 | entrada 10 @ 100 | 10×100 | 10 | 1.000 | 100 | — |
| E2 | entrada 10 @ 130 | (1.000+1.300)/20 | 20 | 2.300 | **115** | — |
| S1 | saída 5 | 2.300×5/20 = 575 | 15 | 1.725 | 115 | 115 / 575 |
| E3 | entrada 5 @ 200 | (1.725+1.000)/20 | 20 | 2.725 | **136,25** | — |
| S2 | saída 5 | 2.725×5/20 = 681,25 | 15 | 2.043,75 | 136,25 | 136,25 / 681,25 |
| T1 | transferência D1→D2 de 6 | 2.043,75×6/15 = 817,50 | D1 9 / D2 6 | D1 1.226,25 / D2 817,50 | 136,25 | 136,25 / 817,50 |

Conferências: o custo de S1 **continua 115** depois de E3 (histórico não muda); valor total antes e depois de T1 = 2.043,75. Venda de 2 un. de PA1 em D1: 1.226,25×2/9 = **272,50**.

### 6.2 Arredondamento e resíduo — produto PA2

Entradas 1@4 e 2@3 → 3 un., valor 10, médio 3,3333. Três saídas de 1: 3,3333 · 3,3334 (6,6667/2 = 3,33335, meio sobe) · **3,3333** (a última leva o resíduo). Soma das três = **10,0000** = valor que entrou; valor final 0.

## 7. Moeda, arredondamento e limites (F-007)

- **Moeda**: todo custo e valor de estoque é guardado **na moeda base da empresa** (`companies.base_currency_code`, padrão PYG — confirmação do responsável: D-C4). Compra em outra moeda é convertida **antes** de chamar a função; a taxa e a fonte ficam registradas na compra (a tabela de taxas não existe na V1). **Nunca se somam moedas diferentes**: os relatórios agrupam por moeda.
- **Casas**: cálculo e armazenamento em `numeric(18,4)`; exibição por `currencies.minor_units` (PYG 0; USD/BRL/EUR 2). O arredondamento é **meio para cima** (`round()` do PostgreSQL em `numeric`) e é feito **uma vez** por operação de saída; o resíduo fecha o valor.
- **Limites**: `numeric(18,4)` aceita até 99.999.999.999.999,9999 (14 dígitos inteiros), muito acima de qualquer valor em PYG da operação; a coluna do preço de venda é a de P006. Quantidade com 4 casas.
- **Totais**: o total do relatório é a soma dos valores arredondados por linha (não o arredondamento da soma); o teste confere linhas = subtotais = total geral = soma de `inventory_costs`.
- **Venda em moeda diferente da base**: `sales_at_cost_v` expõe `sale_currency_code` e `cost_currency_code` separados e **não** calcula margem; converter exige a regra D-C4/D-C9.

## 8. Consultas dos relatórios (base para a futura API/XLSX)

Estoque valorizado, linha + subtotal por depósito + total geral (por moeda):

```sql
SELECT warehouse_code, product_code, currency_code,
       sum(valued_quantity) AS quantity, sum(total_value) AS total_value
  FROM inventory_valuation_v
 GROUP BY GROUPING SETS ((warehouse_code, product_code, currency_code), (warehouse_code, currency_code), (currency_code))
 ORDER BY currency_code, warehouse_code NULLS LAST, product_code NULLS LAST;
```

Vendas ao custo (só linhas com custo; as `SIN_COSTO` são listadas à parte e contadas):

```sql
SELECT issue_date, internal_number, product_code, quantity,
       sale_currency_code, sale_line_total, cost_currency_code, unit_cost, total_cost, cost_status
  FROM sales_at_cost_v
 WHERE issue_date BETWEEN :desde AND :ate
 ORDER BY issue_date, internal_number, line_number;
```

As views são `security_invoker` (RLS da empresa) e **sensíveis** (`PRODUCTOS_COSTO.VER`); a camada de dados deve aplicar também o escopo de sucursal/depósito do REQ-2026-002. A exportação XLSX é produzida pela aplicação a partir dessas consultas (nenhum código foi alterado nesta etapa).

## 9. Pendências de definição (decisões do responsável — nenhuma bloqueia a documentação)

| ID | Pergunta | Padrão adotado na P007 | Recomendação |
|---|---|---|---|
| D-C1 | Nível do custo: produto×depósito ou só produto | produto × depósito | manter; é o que permite valorizar por depósito |
| D-C2 | Valorizar físico ou só disponível | físico próprio disponível | confirmar tratamento de reservado/quarentena |
| D-C3 | IVA recuperável, frete e despesas entram no custo? | não (custo informado pelo chamador) | definir com contabilidade |
| D-C4 | Moeda base e fonte/data da taxa | PYG; taxa fora da V1 | confirmar PYG e criar tabela de taxas quando houver compra em USD |
| D-C5 | Anulação, devolução (venda/compra) e correção retroativa | **não implementado** | movimento **inverso ao custo congelado** da saída original (devolução de venda volta ao custo da venda); nunca reescrever histórico |
| D-C6 | Custo por lote | por produto/depósito | só se houver rastreabilidade obrigatória |
| D-C7 | Mercadoria de terceiros | fora do valor | manter |
| D-C8 | Data de corte e custo de abertura | sem abertura (greenfield) | definir saldo inicial com custo auditável antes do 1º relatório |
| D-C9 | Base da margem (com/sem IVA) | margem **não** calculada | definir antes de expor margem |

## Autoverificação

- Fórmulas e exemplos (§3, §6) foram calculados à mão e coincidem com as asserções de `TESTE-P007-custeio.sql` (E1..T1, R0..R6, V0, VAL).
- Concorrência testada com duas conexões reais (`dblink`): a segunda saída espera o bloqueio e é recusada por saldo insuficiente.
- Não testado: carga/volume, deadlock com muitos produtos numa mesma operação, integração com API/XLSX (não existem), dados reais.
