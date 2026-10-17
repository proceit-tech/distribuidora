# Nexit V1 — padrão obrigatório para TODAS as telas de listagem

**Decisão do responsável, 2026-10-11:** adotar a listagem de Clientes publicada no commit `081b587` como **referência de padrão visual e estrutural** para todas as listagens existentes nos menus V1. A avaliação em estado vazio é uma referência visual aprovada pelo responsável para padronização; **não significa homologação funcional** de tabelas com dados. Fonte detalhada: `CLIENTES-LISTA-PADRAO-V1.md`.

## Abrangência

Aplicar às telas **de listagem** em Maestros (Clientes, Proveedores, Productos, Catálogos de productos e Listas de precios), Inventario (Stock e Movimientos), Reportes (índice/listagens e as listas de resultados dos cinco relatórios), e Administração (listas de Empresas e outras listas V1 existentes, respeitando acessos). Incluir demais telas tabulares/listas reais apresentadas no menu V1 após inventário rápido das rotas. Não modificar formulários Novo/Editar, Dashboard, Login, nem módulos fora da V1 (Facturas/Recepciones).

## Padrão visual e de comportamento

1. **Topo:** breadcrumb discreto quando útil, título objetivo e botão de ação real proporcional (38–40px); sem chip decorativo, slogan ou descrição genérica. Não criar botão Novo onde não há criação prevista.
2. **Indicadores:** compactos e somente se já existem ou possuem métrica real disponível; não inventar quatro KPIs em cada tela.
3. **Toolbar:** busca e filtros próprios do módulo na mesma faixa, alinhados, com alturas próximas de 36–38px, contador de resultados e Limpiar filtros quando houver filtros. Não retirar nenhum filtro atual.
4. **Tabela/grade:** headers concretos por módulo, colunas essenciais com hierarquia entre valor principal e secundário, bordas/alinhamentos consistentes, hover/foco; não copiar as colunas de Clientes para outros módulos.
5. **Ordenação real:** adicionar aos campos pertinentes, com estado asc/desc e acessibilidade; respeitar dados totais, filtros e paginação (se paginada remotamente, garantir ordenação sobre o conjunto correto). Nunca ícones decorativos de ordenação sem função.
6. **Ações:** somente operações reais e autorizadas para o perfil; não introduzir editar/excluir se não houver fluxo implementado.
7. **Empty/loading/error:** padrões coesos, sem grandes áreas vazias artificiais e sem dados demonstrativos no ambiente real.
8. **Paginação e responsividade:** layout legível no notebook com sidebar 236px; rolagem horizontal apenas dentro de tabelas densas quando necessária; manter valores/unidades íntegros e nenhuma opção cortada.
9. **Escala tipográfica contextual:** título 24–26px/700, breadcrumb 12px, corpo tabela 14px e secundário 12–13px, headers 12px/650, filtros 13–14px, botão principal 13–14px, KPIs números 18–20px/700; densidade profissional, sem repetir aumento global de 575 fontes.
10. **Segurança/integridade:** preservar company scoping, permissões, APIs, ordenação persistente quando aplicável, filtros, consultas, estoque e relatórios; sem modificar banco/migrations para maquiagem visual. Se uma função requisitada exigir mudança de backend, apresentar bloqueio objetivo antes de expandir escopo.

## Execução e evidências

- **Autorização expressa:** o responsável autorizou Claude Code a aplicar o padrão a **todas as listas da V1**. Organizar entregas em commits por módulo ou grupo pequeno, sempre na mesma branch e com revisão do ChatGPT antes de deployment, evitando um commit gigante difícil de auditar. Não iniciar outras funcionalidades.
- **Proibido testar no notebook:** não executar npm build/dev, Next, Webpack, Turbopack, tsc, eslint, suites, Docker, banco, servidores ou processos de validação locais. Apenas leitura, edição, commit e push. O responsável compila/testa e homologa na VM após revisão.
- **Evidência por tela:** registrar estado ANTES, commit de alteração, print DEPOIS, ambiente, zoom/resolução, problemas e status humano. Prints físicos só são declarados versionados após upload real e confirmação; evitar conteúdo sensível em repo público.
- **Status:** decisão documentada, implementação geral ainda pendente. Nenhum módulo deve ser marcado como HOMOLOGADO apenas por CSS/commit.
- **Respostas do Claude:** somente resultado, testes não executados, bloqueios reais e SHA(s). Sem lista de arquivos, diffs ou justificativas duplicadas que constam no Git.

## Implementação (2026-10-11) — aguardando build, capturas DEPOIS e homologação na VM
Aplicado a: Proveedores, Productos, Catálogos de productos, Listas de precios, Stock, Movimientos (Clientes é a referência), índice e cinco relatórios de Reportes e Empresas (Administración). Componentes reutilizáveis em `components/ui/lista-padrao` (estilos de lista, estilos de relatórios, ordenação e cabeçalho ordenável). Nas listas completas (todos os registros carregados no cliente) a ordenação atua sobre o conjunto filtrado completo antes de paginar. Catálogos, Movimientos e Empresas ganharam paginação (20 por página) para igualar o padrão.
**Limitação registrada:** os cinco relatórios são paginados e filtrados no servidor; ordenar por coluna no cliente só reordenaria a página visível (e quebraria o saldo acumulado do Kardex). Ordenação por coluna nos relatórios exigiria parâmetro de ordenação nas APIs de relatório — decisão do responsável antes de implementar. Nada foi validado no notebook por determinação do responsável.
