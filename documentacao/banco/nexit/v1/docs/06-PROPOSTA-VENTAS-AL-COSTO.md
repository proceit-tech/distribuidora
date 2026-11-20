# 06 — Proposta: origem dos dados de "Ventas al costo" (PARA APROVAÇÃO)

**Princípio:** uma saída de estoque **não** é, por si só, uma venda financeira. A regra abaixo está implementada de forma **provisória e isolada** (NEX-010 + `v_ventas_al_costo` em NEX-011) e **não fica definitiva sem aprovação do proprietário**.

## Estado atual (provisório)
Uma "venda" é um movimento `SALIDA` com `tipo_origen = 'VENTA'`, cliente na cabeçalho e **preço de venda opcional na linha** (`precio_venta_unitario/total/moneda`). O custo vem **congelado na mesma linha** (custo médio móvel no instante da saída). A view `v_ventas_al_costo` considera só movimentos `REGISTRADO` (anulados e o movimento inverso ficam fora) e calcula margem apenas se venda e custo estão na mesma moeda. Linhas sem preço ficam visíveis como "sem preço"; linhas sem custo, `SIN_COSTO`.

## Opções
| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A (implementada, provisória)** | SALIDA/VENTA com preço na linha | sem novas tabelas; custo e preço na mesma linha; fácil substituir | o preço digitado no estoque não é documento fiscal; pode divergir da fatura futura |
| B | Esperar o módulo de Facturas e ligar movimento ↔ fatura | fonte fiscal correta | bloqueia relatório e dashboard na V1 |
| C | Tabela própria de vendas simples (cabeçalho/itens) que gera a saída | separa estoque de venda; permite estados e anulação própria | novo módulo (escopo adicional); duplica conceito de fatura |

## Recomendação
**A para a V1**, rotulando o relatório como *"Ventas al costo (registradas por movimiento)"* e **não** como faturamento; migrar para B quando existir Facturación (a NEX-010 foi isolada para ser substituída sem tocar custos/saldos). Dashboard "ventas" usa a mesma view e herda o mesmo rótulo.

## Decisão necessária
☐ A ☐ B ☐ C — e, se A: (1) o preço é obrigatório ou opcional em SALIDA/VENTA? (2) margem entre moedas diferentes: converter (qual câmbio?) ou omitir (hoje: omite).
