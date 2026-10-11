# 02 — Reconciliação com o legado

Fontes: `fontes-historicas/` (001, 002, 004–017, 022–025; **003 e 018–021 ausentes no GitHub**), `INVENTARIO-SQL-LEGADO-2026-10-09.md`, `AVALIACAO-TECNICA-LEGADO-2026-10-09.md`. Os originais **não foram modificados**.

## Migrations ausentes
| Versão | Situação | Necessária para os nove itens? | Ação |
|---|---|---|---|
| 003 | localizada pelo proprietário, **ainda não incorporada ao GitHub** | Provavelmente (a 022 e as APIs referenciam tabelas de catálogo) | **Pendente**: o proprietário deve enviar o arquivo. A V1 não depende dele (NEX-003/004 cobrem os catálogos). Quando chegar: incorporar em `fontes-historicas/` e rodar a comparação de tabelas abaixo |
| 018–021 | **ausentes** | Não comprovado. Todas as dependências exigidas pelas APIs (cadastros, geografia, listas, movimentos) foram cobertas pelas NEX | **Não recriadas.** Nenhuma versão histórica ausente foi registrada como executada |

## Comparação tabela a tabela (ferramenta `herramientas/verificar-consultas-app.py`)
- 22 tabelas consultadas pelas APIs existem nos dois mundos; a V1 satisfaz todas as colunas usadas; a cadeia histórica (com 003/018–021 *simulados*) falha em 7/8 consultas de login e na de sessão (colunas/tabelas de segurança e sessões não existem no legado), 15/20 em clientes, 11/15 em productos, 18/20 em proveedores.
- `existencias` (legado) **não tem `empresa_id`** → impossível isolar por empresa; substituída por `stock_saldos` com FK composta.
- Legado mistura módulos fora de escopo (compras, finanças, logística, fiscal): **não portados**.

## Achados A1–A7 e tratamento
| Achado | Tratamento na V1 |
|---|---|
| A1 018–021 ausentes | não recriadas; ver acima |
| A2/A3 `depositos.empresa_id` inexistente em 010 e 023 | corrigido: FKs compostas `(empresa_id, id)` desde NEX-002; teste T03 |
| A4 segurança multiempresa só por gatilhos | herança de empresa + FKs compostas + funções com escopo + `nexit_runtime` (T03, T06, T10) |
| A5 escopo > nove itens | só auxiliares comprovados |
| A6 custo/relatórios não comprovados | custo médio móvel + conciliações próprias (T04, T09, T11) |
| A7 UI ≠ banco | app ainda usa `localStorage` em Stock/Movimientos: **PR de código separada** |

## Dependências "comprovadas" das versões ausentes
Nenhuma estrutura de 018–021 foi necessária para os nove itens; se o proprietário localizar esses arquivos, devem ser **comparados** (não aplicados) contra a V1. Isso é item de pendência (07).
