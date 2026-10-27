# Decisões oficiais PROCEIT — REQ-2026-003: custeio e entrega real

Data: 2026-10-09
Origem: decisão expressa do responsável PROCEIT em conversa com ChatGPT.
PR: https://github.com/proceit-tech/distribuidora/pull/4
Auditoria de referência: documentacao/testes/AUD-REQ-2026-003-R01.md

## DEC-003-01 — Entrega urgente com dados reais — APROVADO

**Não criar uma versão demonstrativa dos relatórios para apresentar como entrega.** A prioridade é a implementação operacional com fontes reais verificadas no PostgreSQL, incluindo saldos, movimentos, custos e vendas quando existirem.

- Não usar `localStorage`, mocks, números artificiais ou preço de venda no lugar de custo em relatórios declarados reais.
- Reporte de stock valorizado e reporte de ventas al costo devem calcular de fontes persistidas, com filtros por empresa/sucursal/depósito, proteção de custo sensível e exportação XLSX consistente.
- Se não houver dados confiáveis para algum relatório, informar claramente NAO_DISPONIVEL e quais dependências faltam; não fabricar histórico de custo das faturas já emitidas.
- Prazo anteriormente solicitado pelo cliente, 2026-10-10 às 08:00 Paraguai, é uma solicitação, **não promessa de entrega nem comprovação de prontidão**. Comunicar riscos de prazo.
- Código funcional, publicação, alteração em banco real ou migração exigem PR específico, testes e autorização correspondente. Este PR #4 continua documental.

## DEC-003-02 — Método oficial: custo médio ponderado móvel — APROVADO

Método escolhido: **custo médio ponderado móvel**, atualizado a cada entrada valorizada conforme regras de negócio validadas. Não usar último preço de venda ou último custo de compra como método de valorização.

### Contrato mínimo a detalhar no desenho
1. Calcular novo custo médio com exatidão decimal a partir do valor anterior do estoque e do custo da entrada, respeitando quantidade, unidade e moeda:
   `custo_medio_novo = (quantidade_anterior * custo_medio_anterior + quantidade_entrada * custo_unitario_entrada) / (quantidade_anterior + quantidade_entrada)` quando denominador positivo e entrada constitui compra valorizada.
2. **Congelar o custo efetivamente aplicado nas saídas e vendas**, com histórico por linha de movimento, para que o CMV não varie quando o custo médio futuro mudar.
3. Apurar valor de estoque a partir dos saldos e custos verificáveis, com subtotais e total geral reconciliados.
4. Definir explicitamente: custo por empresa e produto ou por empresa/produto/depósito; transferências internas (sem gerar ganho e mantendo conservação de valor), devoluções, custo inicial, lote, ajustes, saldo zero, estoque negativo, cancelamentos e correções retroativas.
5. Definir tratamento de IVA recuperável/não recuperável, frete/despesas incorporáveis, unidades, moedas, taxas, precisão, arredondamento e data de corte com os responsáveis contábeis/negócio. **A aprovação do método não resolve automaticamente esses parâmetros.**
6. Bloquear movimentação que não possa ser valorizada corretamente; não inventar custo para dados históricos ausentes.
7. Testes de concorrência e transação atômica (saldo + movimento + custo), multiempresa, múltiplos depósitos, entradas e saídas, transferências, devoluções, exportação Excel e autorização de custo.

## Instrução de correção da AUD-R01 ao Claude

1. **Reaproveitar integralmente o trabalho já publicado** no SHA `212a4ba`: 7 mapas, 1.144 campos, 178 divergências, propostas SQL P001–P006 e respectivos testes. Não recomeçar nem duplicar.
2. Resolver/documentar cada apontamento F-001 a F-007 em `documentacao/testes/AUD-REQ-2026-003-R01.md`; respostas verificáveis, referências, limitações e rastreabilidade.
3. Priorizar na V1 Clientes, Proveedores, Productos, Depósitos, Stock, Movimientos e relatórios reais de estoque valorizado e vendas ao custo; listas de preços conforme dependências.
4. Acrescentar o método aprovado e regras pendentes nos documentos e propostas P003/P005/P006 **sem mascarar lacunas de dados ou supor compatibilidade com o legado**.
5. Completar dicionário, relações e plano de migração inglês apenas para a V1, partindo dos mapas existentes.
6. Reproduzibilidade dos testes PostgreSQL descartável; não chamar as propostas de migrations de cliente. Inventário do PostgreSQL real somente leitura antes da migração.
7. Verificar alinhamento com segurança REQ-2026-002, em especial D-06 e D-09..D-12 e acesso a dados de custo.
8. Publicar novo SHA no PR #4 e solicitar AUD-REQ-2026-003-R02. Preservar AUD-R01 e todos os arquivos de decisão.

## Estado
Regras de negócio aprovadas; modelagem detalhada, base real, testes de sistema, migrations e implantação seguem pendentes. Nenhuma alteração em produção está autorizada por este documento.
