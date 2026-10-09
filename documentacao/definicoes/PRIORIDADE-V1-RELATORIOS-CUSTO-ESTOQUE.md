# DistribuNex — Prioridade revisada da V1 e solicitação urgente do cliente

Origem: pedido do responsável PROCEIT, 2026-10-09.
Cliente: "Lo unico que me objetaron que para mañana a las 08hs necesitan que ese su reporte de ventas diga al Costo y que se pueda exportar en un Excel o que puedan listar su stock valorizado por total".
Prazo pedido: 2026-10-10, 08:00, horário Paraguai. **É pedido de cliente, NÃO entrega validada nem promessa de implantação.**
Estado: REQUISITO URGENTE, IMPLEMENTAÇÃO NÃO VERIFICADA.

## Revisão de escopo V1

A versão 1 deve priorizar:
1. Segurança mínima multiempresa, login, empresas, sucursais, depósitos e permissão server-side, conforme REQ-2026-002.
2. Cadastros: Clientes, Proveedores, Productos e tabelas auxiliares indispensáveis (categorias, marcas, unidades, fornecedores associados); Listas de precios, conforme necessidade de emissão.
3. Estoque operacional: Stock e Movimientos com saldo por produto e depósito, histórico, origem de custos e integridade transacional.
4. **Relatório de ventas al costo**: período, documento, produto, quantidade, valor vendido, custo unitário e total, margem quando houver dados válidos, filtros por empresa/sucursal e exportação XLSX.
5. **Relatório de stock valorizado**: produto, depósito, quantidade disponível/física conforme critério explícito, custo unitário, valor total, subtotais por depósito e total geral; exportação XLSX.
6. Um painel simples de relatórios operacionais para abrir e filtrar esses relatórios.

Adiar: solicitações/ordens/devoluções de compra, vendas completas novas, contas a pagar/receber, caixa, entregas, notas de crédito/remissão e monitor SIFEN, **exceto dependências reais indispensáveis** para alimentar relatórios. A facturação e movimentos já existentes não devem ser apresentados como persistentes sem confirmar dados reais.

## Especificação e verificações imediatas

### Relatório de ventas al costo
- Identificar o que o cliente chama de "reporte de ventas" e sua fonte real (faturas/vendas/movimentos): localizar na tela/código; não inventar dados.
- "Al costo" = mostrar custo da mercadoria vendida (CMV/costo de venta), **não confundir com preço de venda**. Idealmente custo histórico congelado no momento da saída/venda, não custo atual do cadastro.
- Documentar devoluções, anuladas, descontos, impostos, moeda e unidade de medida para evitar somas distorcidas.
- Relatório de vendas com totais em custo; margem e lucro apenas quando venda e custo são verificados.
- Exportação XLSX de resultados filtrados; totais devem coincidir entre UI e Excel.

### Stock valorizado
- Quantidade por empresa, sucursal/depósito e produto.
- Valor = quantidade elegível × custo unitário valorizado; definir método de custo a partir das regras reais, não escolher tacitamente (média ponderada, FIFO, custo último etc.).
- Identificar se estoque disponível inclui reservas, quarentena e trânsito; não misturar físico, disponível e contabilizado.
- Evitar somar diferentes moedas e UMs sem conversão definida.
- Subtotais por depósito e total por empresa; exportação XLSX e reconciliação com movimentos.

### Controle e testes
- Acesso apenas a dados da empresa e depósitos/sucursais autorizados; custos exigem permissões explícitas para dados sensíveis conforme D-06/D-10. Relatórios não são atalho para contornar essa proteção.
- Arquivo XLSX não vaza dados de outra empresa, nem colunas sensíveis sem concessão.
- Testes: (a) uma entrada e uma saída atualizam saldo; (b) múltiplos depósitos; (c) venda e devolução; (d) valorizações e arredondamento; (e) filtros/excel = UI; (f) documento anulado; (g) usuário sem permissão de custo obtém 403; (h) empresa A não vê dados B.
- Usar decimal exato para moeda e snapshot de custo por transação.
- **Não disponibilizar números aparentemente reais baseados em mocks/localStorage**; se base/saldos/custos ainda não existem no PostgreSQL, registrar bloqueio e gerar dados sintéticos apenas em homologação.

## Plano de execução para Claude
1. Inspecionar imediatamente fontes atuais dos relatórios, telas `facturas`, `stock`, `movimientos`, `productos`, `lib/mocks`, e APIs. Apresentar prontidão concreta do pedido urgente: EXISTE / PARCIAL / AUSENTE, origem dos dados, problemas e esforço qualitativo.
2. Elaborar definição funcional ES-PY para os relatórios, com campos, filtros, totalizações e formato Excel; apontar decisões de custo pendentes.
3. No PR #4, completar mapeamento físico priorizado para produtos, movimentos, saldos, vendas/faturas e custos; reconciliar com PostgreSQL real somente leitura.
4. Separar entrega emergencial de relatório do projeto V1 permanente. Não executar migrations nem alterar código funcional no PR de levantamento; abrir novo PR de implementação depois de requisitos e autorização.
5. Registrar dependências, status e SHA para auditoria independente ChatGPT.

## Pendências de definição, sem bloqueio do inventário
- Método de custeio e data de referência da valorização.
- Fonte real de vendas e custos históricos disponíveis; sistema pode não conter dados necessários.
- Exportação: XLSX obrigatório; eventual CSV pode ser opção adicional, não substituto.
- IVA e moeda em relatórios de custo, conforme contratos contábeis.
- Escopo exato de "mañana 08hs" — demonstração ou produção.
