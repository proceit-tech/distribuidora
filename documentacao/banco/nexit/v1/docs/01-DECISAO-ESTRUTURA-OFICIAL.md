# 01 — Decisão: estrutura oficial do banco Nexit V1

**Decisão:** a única estrutura oficial da V1 é a série **NEX-001…NEX-015** em `documentacao/banco/nexit/v1/migraciones/`. Os SQLs históricos (`fontes-historicas/`, 20 arquivos) ficam preservados **sem alteração** como referência; **não** são executados na V1 e **nenhuma** migration histórica é registrada em `schema_migrations`. Não existe uma segunda arquitetura concorrente: o "caminho B" (cadeia histórica) do plano anterior fica **superado** por este documento.

## Por que NEX e não a cadeia histórica
| Critério | Cadeia histórica (001–017, 022–025) | NEX v1 |
|---|---|---|
| Completa | **Não**: faltam 018–021 e a 022 exige a versão 021 registrada | Sim, autossuficiente |
| Compatível com as APIs atuais | Simulando 003/018–021, **só 14 das 66 consultas** da app passam em `PREPARE` (ver 03) | 65/66 passam; 1 é bug da app (F-01) |
| Bugs próprios | `depositos.empresa_id` inexistente em 010/023 (A2/A3); `existencias` sem `empresa_id` | Corrigido por desenho (FKs compostas `(empresa_id, id)`) |
| Escopo | Arrasta compras, finanças, logística, fiscal (A5) | Apenas os nove itens + auxiliares |
| Multiempresa | Gatilhos de validação, sem isolamento por usuário | Herança de `empresa_id`, FKs compostas, funções com escopo, `nexit_runtime` sem escrita direta em estoque |
| Testável | Não reproduzível desde zero | 319 verificações PASS em PG16 descartável |

## O que foi reaproveitado do legado
Nomes de tabelas e colunas que as APIs consultam (22 tabelas em comum — ver 02), regras de cadastro (clientes/proveedores/productos com SIFEN), geografia do Paraguai (conceito da 025), listas de preços, kits/componentes, séries de código, `schema_migrations` com checksum. As regras corretas foram portadas; as incorretas (A2/A3) não.

## Mapeamento NEX → itens
| Migration | Conteúdo | Itens |
|---|---|---|
| NEX-001 | base: `schema_migrations`, triggers de herança de empresa e atualização | todos |
| NEX-002 | empresas, sucursales, depósitos, usuários, perfis, permissões, sessões, eventos de segurança | 1 |
| NEX-003/004 | catálogos globais (países, geografia, moedas, UM, impostos, condições de pagamento) e por empresa | 2,3,4,7 |
| NEX-005/006/007 | clientes, proveedores, productos e filhos | 2,3,4 |
| NEX-008 | listas de preços (itens, escalões, regras) | 7 |
| NEX-009 | movimentos, linhas, saldos, lotes, custo médio móvel | 5,6,8 |
| NEX-010 | venda simples por movimento (isolada, substituível — ver 06) | 8,9 |
| NEX-011 | views de stock, movimentos, custo, dashboard | 6,8,9 |
| NEX-012 | ciclo de vida DEMO | demo |
| NEX-013 | papel `nexit_runtime` e política de privilégios | segurança |
| **NEX-014** (novo) | idempotência, anulação, reservas/quarentena, kardex, API segura de estoque | 5,6 |
| **NEX-015** (novo) | inicialização da empresa real e do administrador, reset de senha | 1 |

## Premissas técnicas assumidas (documentadas, reversíveis)
- Tabelas/colunas em espanhol, como o código da app. Datas padrão em `America/Asuncion`; datas futuras rejeitadas em movimentos.
- Valores monetários `numeric(18,4)`; custo médio com arredondamento a 4 casas e **resíduo na última saída** (zera o saldo exatamente).
- RLS **não** é aplicada na V1 (opcional em `opcional/NEX-OPT-rls-empresa.sql`, testada em cópia — T08). Ver 04.
- Numeração de movimentos serializada por empresa (advisory lock): limite de vazão aceito para a V1.
