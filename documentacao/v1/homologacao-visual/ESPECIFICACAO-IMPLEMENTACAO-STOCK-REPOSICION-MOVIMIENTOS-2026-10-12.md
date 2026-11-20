# Nexit V1 — Especificação aprovada para Claude: Stock, Reposición e Movimientos

**2026-10-12. ChatGPT.** Entrada: capturas Stock e detalhe, auditoria `AUDITORIA-STOCK-BOTOES-REPOSICAO-V1-2026-10-12.md`, decisões `DECISAO-STOCK-ACOES-2026-10-12.md` e `DECISAO-REPOSICION-MOVIMIENTOS-DOCUMENTOS-2026-10-12.md`. **Estado:** escopo de implementação, sem homologação/SQL/VM. A entrega de Claude deve parar após commit + push para auditoria ChatGPT.

## Revalidação técnica do repositório
- `app/(private)/stock/page.tsx` tem handlers `exportarListadoExcel` e `exportarValorizadoMarca`; ambos serão removidos do cabeçalho por decisão expressa. `Movimientos` aponta para `/movimientos` e permanece. `Reposición` aponta para `/reposicion`; a rota `app/(private)/reposicion/page.tsx` não foi encontrada e `/reposicion` não integra `V1_HREFS`.
- `lib/stock/shared.ts` lê `stock_saldos`, `inventario_costos`, `v_producto_precio_referencia`. Regras atuais: físico = DISPONIBLE+RESERVADO+CUARENTENA, virtual = físico+TRANSITO; classificação BAJO é `disponible < stock_minimo`, SOBREESTOQUE usa físico `> stock_maximo`. Reposición não utiliza ainda `punto_reposicion`. A coluna `ubicacion` da visão por depósito recebe string vazia; filtro de depósito atual seleciona produtos mas não recalcula automaticamente os totais por depósito.
- `app/api/stock/route.ts`: somente GET autorizado por `STOCK.VER`; gravações passam pelo módulo de movimentos.
- `app/(private)/movimientos/page.tsx` tem lista, filtros e navega para `/movimientos/nuevo` e detalhe. `app/api/movimientos/route.ts` retorna saldos e catálogos reais com checagem de acesso a depósito.
- `lib/movimientos/shared.ts`: `TIPOS`, origens `MANUAL, COMPRA, VENTA, DEVOLUCION, TRANSFERENCIA, AJUSTE, INVENTARIO`; usa procedimentos `inventario_registrar_movimiento` e `inventario_anular_movimiento` no PostgreSQL. Aceita `documentoReferencia` textual e `clave` de idempotência. Isso **não comprova ainda** vínculo relacional por documento + linha, nem disparos automáticos por Factura/NC/Remisión — verificar DDL e módulos existentes.
- `lib/navigation/menu.ts`: já contém item de Reposición em NAVIGATION_GROUPS sob Inventario, mas ausente de `V1_HREFS`. É incorreto inventar outro local de menu.

## ETAPA A: correções concretas de Stock (autorizada)
1. Remover botões **Exportar Excel** e **Valorizado por marca** do cabeçalho de Stock; preservar valorizações e relatórios independentes existentes em Reportes. Retirar handlers/imports exclusivamente obsoletos sem afetar relatórios.
2. Manter **Movimientos** e **Reposición**; criar rota funcional de Reposición e habilitar link em `V1_HREFS` com permissão compatível. Não adicionar acesso livre por engano: `STOCK.VER` para consultas.
3. Corrigir comportamento do **filtro Depósito**: se selecionado, mostrar saldos e valores correspondentes ao depósito, ou separar explicitamente 'Visão consolidada' de 'Visão de depósito' sem falsos totais. Cartões, linha, exportações independentes e ficha devem usar mesma definição. Tratar custos `inventario_costos` por depósito, terceiros separadamente, e preço de venda nulo.
4. Verificar `ubicacion` na origem de dados: exibir localização real se houver relacionamento disponível; caso contrário rotular 'Sin ubicación registrada' e documentar ausência de modelo, sem inventar localização.
5. Conferir controle por quantidade, lote e unidade identificada; unidade base/fatores, propriedade PROPIO/TERCERO, saldos físicos/virtuais e custo médio. Não reescrever funções de saldo ou migrations antigas por conjectura.
6. UX no padrão Cliente/Productos, estados vazios, busca/filtros, acessibilidade e responsividade; não alterar números de exemplo.

## ETAPA B: Reposición como PLANEJAMENTO (autorizada para implementação de consulta/sugestão)
1. Tela `/reposicion` consulta dados reais da empresa e permissões, por Produto + Depósito, com disponible/reservado/cuarentena/tránsito, mínimo, punto reposición, máximo e classificação da necessidade. Informação distinta para próprio e terceiro; só sugerir reposição de estoque elegível.
2. Exibir alternativas **Compra de proveedor** e **Transferencia desde otro depósito** quando houver contexto; mostrar origem e saldo transferível, sem prometer compras/transferências já gravadas. Prever devoluções/ajustes como opções informativas, sem criar automaticamente entradas.
3. Cálculos com política explícita, testada, documentada: não subtrair RESERVADO de DISPONIBLE outra vez, não incluir CUARENTENA como vendível, não tratar TRANSITO sem confirmação como ingresso certo; sinalizar dados ausentes ou parâmetros inválidos. Fórmula min/max e uso de ponto reposição devem ser declarados e consistentes. **Se precisar decidir sobre inclusão de trânsito não confirmado ou metas sem máximo, registrar dúvida, não inventar compromisso de compra.**
4. O operador pode revisar sugestões e simular quantidades, mas **na V1 desta etapa NÃO gravar** pedido de compra, transferência, recibo fiscal, nota de crédito ou ajuste de estoque sem fluxo autorizado e checagem transacional. Botões de ação só podem existir quando têm destino real; caso contrário rotular como sugestão/planejamento, não aparentar operação gravada.
5. Propor rastreamento de estado para futura aprovação/execução, sem criar status fiscal fictício.

## ETAPA C: auditoria e preparação de Movimientos vinculados a documentos (implementação segura, sem automatismos fiscais)
1. Auditar completamente UI+API+functions SQL de `inventario_registrar_movimiento`, `inventario_anular_movimiento`, saldos, custos, lotes, identificados e permissões. Mapear transação e atomicidade do documento de origem, linha, e efeitos no estoque.
2. Especificar matriz **documento × fato físico × depósito × tipo de saída/entrada × referência única**: factura de venda (saída apenas se ainda não registrada); remisión (saída/transferência/entrega conforme finalidade); NC por devolução física (entrada após recebimento validado); NC financeira (zero movimento); compra recebida (entrada), devolução fornecedor (saída); perda/quarentena/ajuste conforme tipo.
3. A base atual tem `documentoReferencia` textual e `clave` de idempotência; **não presumir que isso já garante unicidade entre Factura e Remisión relacionadas**. Preparar projeto de vínculo forte `document_type/document_id/document_line_id/physical_event_id` e chave única de evento físico + linha + efeito; identificar tabelas reais antes de elaborar migration incremental.
4. Preservar estornos como operações compensatórias, nunca apagar trilha. É proibida entrada automática por NC financeira e baixa dupla por factura/remisión do mesmo despacho.
5. **Não ativar emissão fiscal, compras/vendas automáticas, gatilhos de saída por factura/NC/remisión ou novos eventos financeiros** sem checagem de modelo e decisão posterior sobre o momento de transferência física. Se módulo ainda não existe, implementar apenas documentação, contratos e testes de validação (e abstração não intrusiva se necessária).
6. Para produtos de lote/série e transferência, preservar rastreabilidade e não criar saldo negativo acidental. Homologação requer PostgreSQL real separado do ambiente operacional (Claude não acessa VM), e responsável decide momento do deploy.

## Portas de qualidade
- Confrontar as migrations reais, esquemas e contratos API antes de qualquer DDL; nova migration somente se indispensável e em próximo número livre, sem alterar migrations aplicadas.
- Testes locais para estoque por depósito, propriedade terceiro, reserva, trânsito, mínimo/ponto/máximo, sem parâmetros, sugestão entre depósitos, produtos sem preço/custo, movimentos anulados, duplicidade de documento e idempotência.
- Não criar produtos/depósitos fictícios no modo real nem usar mock/localStorage em fluxo operacional.
- Manter código em espanhol Paraguay; leitura/edição com permissões `STOCK`, `MOVIMIENTOS` e `empresa_id` da sessão.
- `tsc`, lint nos arquivos tocados, build e casos automatizados; documentar o que não pôde testar. Claude commit+push e pausa; ChatGPT audita; responsável executa VM/SQL/deploy.

## Benchmarks conceituais
SAP Business One: MRP/sugestões de compra e transferências; Odoo Reordering Rules: mínimo/máximo, cobertura de demanda e transferência; Dynamics 365 SCM: saldos/reservas/dimensões. Não copiar regras que conflitem com a operação comercial aprovada.

## Pendentes que NÃO devem ser inventadas
- Exato gatilho de movimentação entre Factura, Nota de Remisión e confirmação de Entrega/Recepción.
- Se trânsito informado equivale a entrada confirmada para planejamento; fornecedor preferencial, lead time, lote mínimo e unidade de compra.
- Política de saldo negativo, ajuste de custo de devoluções e visibilidade dos saldos de terceiros; conferir DB/código atual.
- Existência do esquema completo de documentos fiscais em Nexit: não criar dependências que travem Stock.
