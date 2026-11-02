# Nexit V1 — AUDITORIA INTEGRADA MAESTROS antes de Stock/Movimientos

**Data:** 2026-10-12. **Autor:** ChatGPT. **Estado:** REVISÃO ESTÁTICA, NÃO HOMOLOGADA; não autoriza SQL ou deploy. Captura do menu enviada pelo responsável em 2026-10-12 (Maestros expandido); código no GitHub `feature/NEXIT-2026-001-banco-demo`.

## Evidência e escopo
Confrontados: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seção relevante de `PROGRESSO-NEXIT-V1.md`, `lib/navigation/menu.ts`, `app/(private)/catalogos-comerciales/layout.tsx`, `app/(private)/catalogos-comerciales/page.tsx`, `app/(private)/productos/catalogos/page.tsx`, `lib/productos/shared.ts`, `lib/listas-precio/shared.ts`, `lib/listas-precio/calculos.ts`, `app/api/listas-precio/route.ts`, `NEX-045-catalogos-comerciales-tipos-cambio.sql`. Auditorias anteriores para Catálogos de Productos e Listas de Precios continuam complementares. **Não foram executados SELECTs no PostgreSQL real, testes de API, nem cliques no navegador.** Captura não comprova criação/edição de dados.

## Matriz de integração

| ID | Área | Evidência | Avaliação | Próxima validação |
|---|---|---|---|---|
| MAE-01 | Navegação | Screenshot e seis primeiros itens em `NAVIGATION_GROUPS[masters]` | Conforme: Clientes, Proveedores, Productos, Catálogos de productos, Listas de precios, Catálogos comerciales | Link e volta para cada um |
| MAE-02 | Visibilidade | `V1_HREFS` inclui os seis caminhos; `resolveNavigation` filtra permissões | Conforme no código; verificar perfil não admin | 401/403 e acesso direto URL |
| MAE-03 | Permissões comerciais | `app/(private)/catalogos-comerciales/layout.tsx` exige `LISTAS_PRECIO.VER` | Intencional nesta V1; compartilha privilégio com listas | Aprovação do negócio sobre delegação de cadastro comercial |
| MAE-04 | Categorias/Famílias/Linhas | NEX-044 define `familias_producto.categoria_id` nullable e hierarquia condicional | Transição intencional; legado ainda não classificado | Relatório de famílias sem categoria e combinações contraditórias |
| MAE-05 | Produtos | API e tela dependem de família, linha, categorias, unidades e impostos | Pré-requisito para movimentação correta | Criar/editar um produto de teste, conferir fator de conversão, estoque controlado e vinculação fiscal |
| MAE-06 | Preço de referência | `app/api/listas-precio/route.ts` lê `v_producto_precio_referencia` | Dependência de listas/produtos existente | Sem preço, tratar `NULL` e não converter custo em preço |
| MAE-07 | Câmbio | NEX-045 tabela por empresa/data/moeda, versão, vigente, sem conversão automática | Modelo de cadastro implementado; persistência no banco real a validar | POST, corrigir, anular, histórico, permissões entre empresas |
| MAE-08 | Canais/Zonas | Consulta APIs listas e catálogos; tabelas existentes, NEX-045 adiciona escrita/índices | Compartilham dados reais | Criar, editar, inativar, conferir listas vinculadas |
| MAE-09 | Listas de preços | `lib/listas-precio/shared.ts` normaliza itens e persiste preço/margem/escala | Armazenamento implementado; motor de preço não implementado | Não afirmar cálculo final de pedido/venda |
| MAE-10 | Limites de integração | Estoque/Movimientos ainda não revisados neste documento | Sem conclusão sobre fluxo operacional de estoque | Auditoria específica a seguir |

## Achados técnicos relevantes

**MAE-A01 — margem nula e persistência (P1 / semântica):** `margenBruto(precio,costo)` retorna `null` com custo ou preço <=0, corretamente produzindo '—' na UI. Contudo `lib/listas-precio/shared.ts` transforma esse `null` em `0` ao persistir `margen: margenBruto(precio,costo) ?? 0`. Assim a BD conserva zero para margem indefinida; não necessariamente quebra a interface pois ela recalcula, mas pode confundir relatórios e integrações. Propor distinguir margem indefinida de margem 0, após conferir constraints `NOT NULL` do schema, sem alterar migrations já aplicadas.

**MAE-A02 — cadastro comercial e permissão (DECISÃO):** `LISTAS_PRECIO` também governa criação e edição de câmbio, zonas e canais; um colaborador capaz de manter listas pode manter cotações. Não é bug de autorização (há guardPage/API), mas decisão de segregação de funções ainda pendente, especialmente pelo impacto financeiro.

**MAE-A03 — famílias importadas (P1 operacional):** `familias_producto.categoria_id` permanece nullable em NEX-044 para não destruir legado; menu mostrar Catálogos não garante saneamento das 51 famílias históricas. Confirmar categoria correta com usuário, sem atribuição automática por nome.

**MAE-A04 — engine comercial (BLOQUEIO DE ESCOPO):** precedência grupo/cliente/zona/canal, acumulação de descontos, derivação de listas, conversão de moedas, aplicação do IVA e versões de preço não têm regra aprovada. O módulo de cadastro pode continuar, mas não autorizar preço transacional como motor completo.

**MAE-A05 — documentação de implantação (P2):** alguns documentos de progresso/implementação ainda dizem NEX-044/045 'não aplicada', descrevendo o estado na data da entrega de Claude. Usuário informou aplicação até 045 e atualização do app, mas sem comprovantes nesta auditoria. Diferenciar estado de desenvolvimento do estado operacional; atualizar um registro operacional quando confirmado por consulta real; nunca modificar texto histórico de migração para maquiar status.

## Gate mínimo antes de iniciar Stock/Movimientos
1. Confirmar operacionalmente NEX-001..045 sem checksum alterado, versão do app e nenhum erro de inicialização; sem exigir reinstalação ou novo deploy.
2. Validar na VM fluxo real de criação/edição/leitura por empresa para Clientes, Proveedores, Productos, Catálogos, Listas de Precios e comerciais, com registros de teste controlados.
3. Validar nos Produtos: unidade base, apresentação/conversões, código, modo de estoque (quantidade/lote/unidade etiquetada), ativo, depósito, preço de referência e família/linha; preparar cenários para Stock.
4. Executar relatório de NEX-044 em modo leitura, revisar famílias ainda não categorizadas; sem atualizar dados automaticamente.
5. Usar navegador para confirmar erros por campo, dados não salvos, telas 375/768/desktop e vínculos comerciais.
6. Registrar como **pendência não bloqueante para revisão Stock** o motor comercial, que não deve ser misturado com as regras de quantidade/custo do estoque. Não confundir início da auditoria de Stock com homologação dos Maestros.

## Recomendações de ordenação de trabalho
- **Antes de publicar correções de Maestros**: conferir MAE-A01 no DDL real e decidir MAE-A02.
- **Pode iniciar auditoria Stock e Movimientos** sem completar todas as decisões comerciais, mantendo gate de integridade do cadastro de Produtos.
- **Não implantar novamente** apenas porque a auditoria foi produzida. Claude implementa somente tarefas autorizadas, ChatGPT audita, humano executa banco/VM.

**Fontes adicionais no Git:** `documentacao/v1/homologacao-visual/AUDITORIA-CATALOGOS-NEX-044-2026-10-12.md`; `AUDITORIA-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md`; `IMPLEMENTACAO-LISTAS-PRECIO-Y-CATALOGOS-COMERCIALES-2026-10-12.md`.
