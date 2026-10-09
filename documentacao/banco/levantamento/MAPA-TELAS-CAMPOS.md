# DistribuNex — Mapeamento de telas para banco de dados

Status: LEVANTAMENTO INICIAL, não é DDL autorizado.
Regra: os campos visíveis em telas determinam os requisitos de dados; tipos, chaves, constraints e tabelas definitivas dependem de inventário do PostgreSQL real.

| Módulo | Telas fonte | API atual | Persistência/risco |
|---|---|---|---|
| Login, empresa, usuário e perfis | app/(public)/login; lib/auth | api/auth/login e logout | PostgreSQL pressuposto; esquema não inspecionado |
| Clientes | app/(private)/clientes/{novo,[id],page} | api/clientes | PostgreSQL em API; diferenças UI/API a reconciliar |
| Proveedores | app/(private)/proveedores/{novo,[id],page} | api/proveedores | API PostgreSQL; interface ainda usa mocks |
| Productos | app/(private)/productos/{nuevo,[id],page} | api/productos | API PostgreSQL; formulário extenso requer entidades filhas |
| Listas de precio | app/(private)/listas-precio | não localizada | Storage demonstrativo; necessita modelo persistente |
| Stock | app/(private)/stock | não localizada | Storage demonstrativo; movimentos e saldos devem ser coerentes |
| Movimientos | app/(private)/movimientos | não localizada | Storage demonstrativo; requer transações e histórico |
| Recepciones | app/(private)/recepciones | não localizada | Storage demonstrativo; relacionar documento e linhas |
| Facturas | app/(private)/facturas | não localizada | Storage demonstrativo; cabeçalho, itens, totais e estado eletrônico |
| Dashboard | app/(private)/dashboard | não aplicável | indicadores dependem das transações reais |

## Procedimento para Claude
1. Ler TODOS os formulários, tipos, defaults, validações de UI, handlers, mocks e APIs; extrair campos em uma planilha Markdown com: módulo, tela, campo, label ES-PY, tipo TS, obrigatoriedade, validações, entidade/tabela candidata, coluna candidata, origem, fonte arquivo/linha, confirmado/inferido, notas.
2. Identificar campos compostos e coleções (múltiplos contatos, endereços, códigos, apresentações, itens, pagamentos); mapear tabelas filhas em vez de JSON indiscriminado.
3. Ler o PostgreSQL real somente com consultas de catálogo autorizadas e comparar tabela a tabela com as expectativas; marcar AUSENTE/EXISTENTE/INCOMPATÍVEL/NAO_VERIFICADO.
4. Priorizar criação de modelos e scripts por módulo; preservar esquema existente. Não alterar dados nem rodar DDL no levantamento.
5. Projetar tenant `empresa_id`, `sucursal_id` e `deposito_id` conforme REQ-2026-002. Não criar tabelas globais ou novas colunas por presunção.
6. Gerar SQL incremental `REQ-AAAA-NNN-XXX-up.sql`, rollback quando seguro, checks, índices e constraints; executar primeiro contra base descartável e testar casos cruzados A/B.
7. Em cada PR, registrar TST, SHA e evidências para auditoria ChatGPT.

## Entregáveis do levantamento
- Matriz completa campo de tela → entidade/coluna e validações, com referências;
- Dicionário de dados real do PostgreSQL (ou NAO_VERIFICADO);
- ERD textual ou gráfico derivado de esquema verificado, não imaginado;
- Lista de divergências UI/API/DB e plano de migrações;
- Ordem de implementação: cadastros e permissões, compras/recepções, estoque, preço, faturamento/SIFEN e relatórios, ajustada às dependências reais.

## Política de scripts
Pasta de produção: `documentacao/banco/migracoes/`. Cada SQL é uma alteração incremental rastreada a REQ e nunca deve ser reescrito após aplicação. Separar scripts de inspeção e validação de scripts que alterem schema. Aplicação em produção exige backup, plano de rollback, janela aprovada e aceite humano.

## Atualização 2026-10-09 (REQ-2026-003)
- Mapeamento campo a campo por módulo: `levantamento/campos/*.md` (1.144 campos e 178 divergências).
- Diagnóstico do que existe, escopo V1 e viabilidade dos relatórios urgentes: `levantamento/DIAGNOSTICO-V1.md`.
- Propostas SQL (não executáveis em banco real): `migracoes/propostas/`; testes: `validacoes/TESTE-P00N-*.sql`; resultados: `testes/TST-REQ-2026-003.md`.
