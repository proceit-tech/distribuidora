# Implementação — Stock (Etapa A), Reposición (Etapa B) e Movimientos (Etapa C, auditoria e contrato)

**2026-10-12 · Claude Code.** Base: `ESPECIFICACAO-IMPLEMENTACAO-STOCK-REPOSICION-MOVIMIENTOS-2026-10-12.md`. **Sem migration** (nenhuma necessária), sem SQL, PostgreSQL real, VM, Docker ou deploy. Não homologado; sem validação em navegador ou banco.

## Etapa A — Stock
- Removidos do cabeçalho **Exportar Excel** e **Valorizado por marca** (handlers e `xlsx` da página). Os relatórios de Reportes (`valorizacion`, `stock-general`, `kardex`, `stock-critico`, `lotes`) não foram tocados. Mantidos **Movimientos** e **Reposición**.
- **Filtro por depósito:** `lib/stock/vista.ts` recalcula TUDO para o depósito escolhido (disponível, reservado, quarentena, trânsito, físico/virtual, terceiros, valor a custo e custo médio de `inventario_costos` do depósito, valor de venda de referência = preço × disponível do depósito, lotes, mínimo/máximo/ponto **do depósito**). Sem depósito: visão consolidada. Linhas, cartões e filtros usam a mesma definição; um rótulo informa «Visión consolidada» ou «Visión del depósito X». Produtos sem saldo no depósito não aparecem. Preço ausente → valor de venda ausente (não 0).
- **Nível** (`clasificarNivel`, definição única): SIN_STOCK, BAJO (disponível < mínimo), SOBRESTOCK (físico > máximo). Na visão por depósito só valem os parâmetros configurados para o depósito (os do produto são globais).
- **Localização:** não existe modelo de ubicações no banco (`ubicacion_preferida_id` é um uuid sem tabela). A ficha mostra **«Sin ubicación registrada»**; nada é inventado. Lotes mostram o depósito.
- **Autorização de depósitos:** `leerStock` filtra saldos e custos pelos depósitos do usuário (alcance TODOS ou `usuario_deposito`; inclui depósitos inativos para não perder saldo) e informa `alcanceParcial`.
- Terceiros ficam separados das quantidades próprias; custo médio e valor seguem `inventario_costos`. Funções de saldo e migrations não foram alteradas.
- Corrigido o erro de ESLint (paginação derivada) da página de Stock.

## Etapa B — Reposición (`/reposicion`, `STOCK.VER`, somente leitura)
API `GET /api/reposicion` + página no padrão Nexit (busca, filtros depósito/marca/situação/trânsito, ordenação, paginação, cartões, estado vazio). **Planejamento: nada é gravado.**
Política (`lib/reposicion/calculo.ts`, testada):
- Parâmetros por depósito (`producto_deposito_configuracion`) comparam-se com o saldo desse depósito; os do produto, com o consolidado dos depósitos autorizados.
- Posição = **disponível próprio**; reservado não se subtrai de novo; quarentena não conta; **trânsito não conta** por padrão (opção «Considerar como ingresso»).
- Necessita se disponível ≤ 0, < mínimo ou ≤ ponto de reposição. Sugerido = máximo − posição; sem máximo, a «cantidade de reposición» do depósito; sem nenhum, **sem quantidade** (aviso, não se inventa meta).
- **Transferência antes da compra:** outros depósitos autorizados **com parâmetros** cedem o disponível acima do próprio ponto/mínimo (quantidade transferível confirmada); um depósito **sem parâmetros não cede nada automaticamente**: seu disponível aparece como «a validar manualmente», fora da quantidade transferível e sem reduzir a compra. O restante é compra ao fornecedor principal (plazo e quantidade mínima de compra só informativos, não aplicados). Nunca se transfere nem se compra automaticamente.
- **Um único plano por produto (AUD-REP-01):** se o produto tem parâmetros por depósito, o renglão consolidado (parâmetros globais) fica apenas como **referência** — não gera necessidade, compra nem transferência e não se soma aos planos por depósito. Sem parâmetros por depósito, o consolidado é o plano.
- **Quantidade de reposição sem gatilho (AUD-REP-03):** se há «cantidad de reposición» mas nenhum mínimo, ponto ou máximo, a situação é «Cantidad sin gatillo» com advertência explícita; não se gera plano nem se oculta a incoerência.
- Devolução de cliente e ajuste de inventário: informação (entradas registradas em Movimientos com autorização); sem botões que aparentem operação gravada. Link «Ir a Movimientos» só com `MOVIMIENTOS.CREAR` e destino real.
- Menu: `/reposicion` em `V1_HREFS` e permissão do item alinhada a `STOCK.VER`.

## Etapa C — Movimientos (auditoria e contrato)
Auditoria, matriz documento × fato físico, projeto de vínculo forte e decisões pendentes em `CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md`. Implementado apenas `lib/movimientos/documentos.ts` (funções puras: decisão de efeito, validação de linha, chave de idempotência por evento físico + linha + efeito, plano de estorno) e testes. **Nenhum gatilho** de facturação/remisión/nota de crédito foi criado.

## Decisões pendentes
1. Trânsito não confirmado conta como ingresso no planejamento? (hoje não, por opção do usuário).
2. Meta quando não há máximo nem cantidad de reposición; múltiplos/lote mínimo de compra e unidade de compra (hoje informativos).
3. Fornecedor preferencial além de `es_principal`; lead time na sugestão.
4. Política para ceder estoque de depósitos sem parâmetros (hoje: disponibilidade a validar manualmente, fora do plano).
5. Política de saldo negativo, custo das devoluções, visibilidade de saldos de terceiros.
6. Toda a Etapa C: momento de baixa por venda, finalidades de remisión, tránsito em traslados, modelo de documentos/eventos físicos (ver contrato).
7. Localização física (modelo de ubicações) inexistente.

## Verificação local
`tsc` e ESLint sem erros/avisos nos arquivos tocados; 1635 verificações, 0 falhas (78 novas); `next build` compilou (`/reposicion` e `/api/reposicion`). **Sem PostgreSQL, sem navegador, sem armazenamento real.**
