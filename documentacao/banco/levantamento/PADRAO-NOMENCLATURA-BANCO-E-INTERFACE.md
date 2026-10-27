# DistribuNex — Padrão oficial de nomenclatura do banco e da interface

Status: DIRETRIZ FUNCIONAL EXPLÍCITA DA PROCEIT — 2026-10-09.
Abrangência: DistribuNex e seus scripts e documentação de banco.

## Idiomas obrigatórios
- **PostgreSQL: inglês** para nomes físicos de tabelas, colunas, chaves, índices, constraints, views, funções, triggers e scripts de migrations. Padrão `snake_case` minúsculo ASCII, sem acentos.
- **Interface do sistema: espanhol (Paraguay)** em menus, telas, labels, campos apresentados, mensagens, erros e documentos destinados ao usuário.
- **Código TypeScript/API:** preservar interfaces existentes durante a transição; definir adaptadores DTO e mapeamento explícito entre entidades persistidas em inglês e contratos em espanhol quando necessário. Não refatorar contratos existentes sem requisito e teste.

## Exemplos de equivalência (ILUSTRATIVOS, não esquema aprovado)
| Conceito | Banco (inglês) | Tela (espanhol) |
|---|---|---|
| Empresa | `companies` | Empresas |
| Usuário | `users` | Usuarios |
| Perfil | `roles` | Perfiles |
| Permissão | `permissions` | Permisos |
| Sucursal | `branches` | Sucursales |
| Depósito | `warehouses` | Depósitos |
| Cliente | `customers` | Clientes |
| Fornecedor | `suppliers` | Proveedores |
| Produto | `products` | Productos |
| Fatura | `invoices` | Facturas |
| Nota de crédito | `credit_notes` | Notas de crédito |
| Movimento de estoque | `inventory_movements` | Movimientos de stock |
| Identificador da empresa | `company_id` | Empresa |
| Razão social | `legal_name` | Razón social |
| Data de emissão | `issued_at` | Fecha de emisión |

Exemplos são proposta de nomenclatura, **não indicação de que as tabelas existam**. Especificar coluna a coluna pela tela e pelo schema efetivo.

## Transição segura do banco atual
O código atual contém SQL com nomes em espanhol (ex.: `empresas`, `usuarios`, `productos`, `empresa_id`), e o esquema real ainda não foi inspecionado. Portanto:
1. **Não renomear tabelas/colunas existentes imediatamente** e não recriar a base para seguir a convenção.
2. Primeiro inventariar esquema PostgreSQL real (somente leitura) e identificar usos em código, queries, funções, views, índices, constraints, ferramentas e integrações.
3. Produzir a matriz `nome atual -> nome alvo em inglês -> tela/label espanhol -> API/DTO -> impacto -> estratégia de migração`.
4. Definir plano incremental de compatibilidade: views/adaptadores/migrations conforme viabilidade verificada; considerar rollback, backfill e zero perda de dados.
5. Novas entidades seguem inglês desde a definição, mas não executar DDL enquanto o levantamento e a migração não forem aprovados.
6. Toda migração e teste deve confirmar isolamento multiempresa, integridade, compatibilidade com API e o idioma espanhol da interface.
7. Proteger a lógica fiscal paraguaya (RUC, DV, SIFEN, CDC, KuDE, etc.): siglas oficiais podem ser preservadas em nomes técnicos quando apropriado, e labels continuam em espanhol.

## Tabela obrigatória no mapeamento
Para cada campo visível (ou campo operacional não visível), registrar: módulo, tela, label ES, componente e arquivo/linha, valor/atributo atual, entidade/coluna SQL atual (NAO_VERIFICADO se necessário), entidade/coluna SQL alvo inglês, tipo, obrigatoriedade, validação, empresa/sucursal/depósito, contrato API/DTO, necessidade de migration e teste.

## Critério de aceite
Nomes físicos novos em inglês e `snake_case`; UI e mensagens em espanhol; documentos e scripts reconhecem o legado em espanhol explicitamente até a transição comprovada e autorizada. Nunca inferir que mudar o nome visível altera o banco.
