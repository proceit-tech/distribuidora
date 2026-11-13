# Nexit V1 — Homologação visual: Dashboard e Sidebar

**Resultado:** REPROVADO VISUALMENTE pelo responsável, após publicação dos ajustes globais de tipografia (`cf576f7`). **Data:** 2026-10-10.
**Origem:** seis capturas fornecidas pelo responsável: dashboard completo, área inferior com atividade/inventário, menus expandidos Maestros/Inventario/Reportes e menu recolhido. Prints recebidos na conversa; **não publicados no GitHub**. Cópias de captura somente com autorização e revisão de privacidade.
**Escopo:** corrigir a aparência de Dashboard e Sidebar, preservar dados, APIs, filtros, navegação e permissões. Não considerar aprovadas as telas internas sem avaliação separada.

| ID | Prioridade | Evidência | Critério de aceite |
|---|---|---|---|
| VIS-DASH-01 | Alta | Sidebar mantém marca `DistribuNex` enquanto login usa `Nexit` | Marca Nexit uniforme em sidebar expandida e recolhida, sem alterações de autenticação/infra |
| VIS-DASH-02 | Alta | Menus longos cortados, particularmente Reportes (`Valorización de inventario`, `Stock crítico y reposición`) | Todos os nomes legíveis por inteiro: adaptar largura/recuos e/ou quebra em múltiplas linhas; nenhuma opção inacessível |
| VIS-DASH-03 | Alta | Aumento global deixou títulos e letras do menu desproporcionais | Escala contextual para menu (seções 12–13px, submenu 13–14px, principal ~14px), com pesos equilibrados e contraste legível |
| VIS-DASH-04 | Média-alta | Marca/subtítulo e rodapé de usuário/empresa truncados | Nome Nexit, empresa, RUC e usuário apresentados adequadamente, sem cortar informação crítica; área de navegação rolável |
| VIS-DASH-05 | Alta | Cartões KPI truncam textos e descrições com reticências | Mostrar informações relevantes completas por adaptação responsiva de layout/colunas; não esconder valor, unidade ou significado do indicador |
| VIS-DASH-06 | Média | Hierarquia do Dashboard pesada, muitos rótulos em caixa alta e negrito | Melhorar equilíbrio dos pesos, espaçamentos e legibilidade; preservar gráficos, filtros, indicadores e links |
| VIS-DASH-07 | Alta | Não houve verificação visual em diversas larguras após 575 alterações globais | Conferir desktop, notebook e modo sidebar recolhida, sem sobreposições/cortes; itens de menu abrem e navegam; Dashboard carrega dados reais |

## Diretriz de escala

Não usar substituição cega de font-size nem impor 15px a todos os elementos. Como referência: conteúdo primário ~14px; menu 13–14px; grupos 12–13px; texto auxiliar 12–13px quando legível; campos ~15px; KPIs 18–22px; título da página 26–28px. **Legibilidade, conteúdo completo e responsividade prevalecem sobre um mínimo global arbitrário**. Refinar dimensões, line-height, quebras, recuos e altura dos itens. Evitar tanto fonte minúscula quanto fonte desproporcional.

## Procedimento

Uma tarefa específica para Sidebar + Dashboard; consultar protocolos GitHub antes de alterar; não iniciar Next Dev/Webpack/Turbopack no notebook; testes estáticos leves e commit/push na branch correta; revisão ChatGPT e deploy/homologação pelo responsável. Não reverter globalmente as 575 mudanças nem alterar outras telas de forma indiscriminada.

**Critério final:** aprovado somente após novo print da VM e aceite expresso do responsável.

## Segunda rodada visual — REPROVADA (2026-10-10)

Após commits `5be99f2` e `a7c2bdb`, a sidebar foi ampliada de 236px para 268px. O responsável reprovou o resultado: aumentou espaço ocupado pelo menu e reduziu indevidamente a área principal. O print mostra os textos dos submenus mais completos, mas a proporção geral piorou.

**Nova direção obrigatória:** voltar à largura aproximadamente original de 236px (sem aumentar a sidebar para resolver rótulos); otimizar recuos, espaçamento, pesos e fonte contextual de 12–13px para grupos e ~13px para submenus; permitir duas linhas somente quando necessário, manter navegação e menu recolhido. Não esconder informações do Dashboard e não fazer nova substituição global de fontes. Testar visualmente na VM após revisão do commit. **Estado: REPROVADO, correção ainda não implementada.**

## Terceira observação — topo do Dashboard (2026-10-10)

**REPROVADO pelo responsável.** A captura recortada evidencia excesso de altura/vazio no topo, duplicação do nome CASA MINGO S.A. já disponível na sidebar, cabeçalho sem composição e filtros soltos.

**Diretriz de correção:** remover o badge repetido da empresa no Dashboard; organizar `Panel general`, seletor de período, seletor de depósito e ação `Actualizar` em uma barra compacta e responsiva, com alinhamento e espaçamento coerentes, preservando filtros e comportamento existentes. Descrição secundária pode ser reduzida ou retirada caso não acrescente informação; não sacrificar a área de KPIs/gráficos. Em telas estreitas, permitir quebra organizada em vez de sobreposição. Não redesenhar dados nem APIs. **Aprovação depende de novo print da VM.**

## Padrão dimensional obrigatório — substitui recomendações genéricas anteriores

A sidebar NÃO pode crescer para acomodar tipografia. Referências de CSS px:

| Componente | Fonte | Peso |
|---|---:|---:|
| Logo Nexit no menu | 19px | 750 |
| Subtítulo da marca | 10–11px | 550 |
| Legenda MÓDULOS | 11px | 650 |
| Grupos MAESTROS / INVENTARIO / REPORTES | 12px | 700 |
| Submenus e links | 13px | 500–600 |
| Painel geral no menu | 13px | 650 |
| Empresa e usuário no rodapé | 12px | 650 |
| RUC e função do usuário | 11px | 450 |
| Título Panel general no Dashboard | 24px | 700 |
| Descrição do Dashboard | remover, ou 12px | 400 |
| Rótulos Período / Depósito | 12px | 600 |
| Valores dos filtros e botão Actualizar | 13px | 600 |
| KPI: legenda | 11–12px | 650 |
| KPI: valor | 20px | 700 |
| KPI: descrição | 12px | 450 |
| Títulos de painéis | 15px | 650 |
| Legendas e metadados | 12px | 450 |

**Estrutura:**
- Sidebar expandida **236px**, recolhida **72px**. Não ampliar nenhuma das duas para resolver textos.
- Submenus: altura de linha ~18px, até duas linhas para nomes longos; reduzir recuos, padding e tamanho de ícones. Não truncar rótulos essenciais nem deixar letras cortadas.
- Cabeçalho sidebar: marca e botão de recolher visíveis, sem título antigo DistribuNex e sem texto cortado.
- Topo Dashboard: **uma barra horizontal compacta**, título à esquerda e filtros Período / Depósito / Actualizar agrupados à direita no desktop. Remover badge da empresa duplicado. Altura alvo do conjunto: **56–72px**, incluindo espaçamentos. Em larguras menores permitir quebra organizada dos filtros.
- Altura dos filtros/botões: 36–38px, alinhados. Sem excesso de caixa alta/negrito.
- KPIs em grade responsiva: dados, valores e unidades completos; títulos e descrições podem quebrar em duas linhas; preservar espaço para gráfico e painéis operacionais.
- Ajustar somente Dashboard, sidebar e shell compartilhado estritamente necessário. **Não** aplicar esta escala a formulários de outros módulos nem desfazer CSS global.
- Não executar testes, build, tsc, eslint, Next, Docker, servidores ou processos no notebook. Somente editar, commit/push e parar. Validação na VM pelo responsável.

**Aceite:** interface equilibrada no navegador a 100%, submenus legíveis integralmente, sidebar recolhida íntegra, cabeçalho compacto, indicadores sem cortes, nenhuma funcionalidade alterada. Sem aceite antes de novo print.
