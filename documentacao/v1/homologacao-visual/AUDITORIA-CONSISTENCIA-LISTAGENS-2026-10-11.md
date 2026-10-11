# Nexit V1 — Auditoria cruzada de consistência das listagens

**Data:** 2026-10-11 · **Status:** especificação de ajustes, NÃO implementada e NÃO homologada.
**Evidências:** sete capturas recebidas em conversa: Clientes, Proveedores, Productos, Catálogos de productos (aba Categorías), Listas de precios, Stock e Movimientos. PNGs originais ainda **não foram incorporados ao GitHub**; não declarar histórico visual completo até upload e verificação. Uso posterior: comparação ANTES/DEPOIS e controle por tela. **Responsabilidades:** ChatGPT especifica; Claude implementa somente sob autorização; responsável testa na VM. Não executar testes no notebook.

## Referência de padrão
- Tela Clientes, commit de referência `081b587`, homologação apenas visual da lista vazia. Base: `CLIENTES-LISTA-PADRAO-V1.md` e `PADRAO-GLOBAL-LISTAGENS-V1.md`.
- Preservar funcionalidade e dados existentes; não padronizar inventando colunas, filtros ou KPIs.
- Padrão dimensional: breadcrumb 12px; título 24–26px/700; botão 38–40px, 13–14px/600; KPIs rótulo 11–12px, número 18–20px; filtros 13–14px/36–38px; cabeçalho de tabela 12px/650; dado primário 14px, secundário 12–13px.

## Achados verificáveis e critérios de aceite

| ID | Prioridade | Tela | Evidência na captura | Critério |
|---|---|---|---|---|
| CON-01 | Alta | Productos | Filtros em uma linha e `Limpiar filtros` sozinho na linha inferior | Toolbar responsiva com linha secundária organizada quando necessário; pesquisa com largura prioritária; contador/ações alinhados, sem controles isolados |
| CON-02 | Alta | Stock | Seis KPIs e filtro de pesquisa muito estreito, `Depósito`/limpar na segunda linha de modo desbalanceado | Grade de KPIs responsiva sem esmagar valores; toolbar organizada em linhas intencionais; pesquisa utilizável e ação contextual alinhada |
| CON-03 | Alta | Productos / Stock | Código de inventário exibido como `026102469668` no exemplo; piloto exige zeros à esquerda | Verificar valor persistido versus representação original do Excel, formato e quantidade de dígitos; não alterar código automaticamente sem confrontar fonte |
| CON-04 | Alta | Productos / Catálogos | Producto exibe `FRANCIA` em procedência e `Sin categoría`; catálogo exibe `FRANCESA` como categoria | Verificar associação real procedência/categoria, confirmar intenção de mapeamento do piloto; não misturar país de origem e categoria de produto por suposição |
| CON-05 | Média | Catálogos | Coluna Código aparece `—` nas quatro categorias | Determinar se código é opcional por modelo; se obrigatório, validar fluxo; se opcional, exibir padrão correto para ausentes e permitir operação |
| CON-06 | Média | Proveedores | Email visualmente em maiúsculas, badges de risco/homologação pouco diferenciados, `Sin grupo` | Padronizar capitalização visual sem corromper dados; badge de estado consistente, linguagem natural, cor nunca como única informação; valor ausente consistente |
| CON-07 | Média | Listas de precios | Descrição extensa em MOSTRADOR e visualização heterogênea de períodos/condições | Textos longos legíveis em hierarquia principal/secundária, sem cortar valor importante; datas e vigência em apresentação uniforme |
| CON-08 | Média | Stock / Productos / Precios / Proveedores | `Gs.`, `PYG`, `USD` em contextos distintos | Regra única para apresentar moedas, preservando moeda transacional e precisão; exemplos reais PYGs e USD; não converter moeda sem taxa |
| CON-09 | Média | Stock | Badges `R 0`, `C 0`, `T 0` e `Sobrestock` sem contexto | Tooltip/legenda/nome acessível para reservado/quarentena/trânsito (confirmar semântica pelo código); conferir cálculo de sobrestock, nunca tratar como mero detalhe visual se incorreto |
| CON-10 | Média | Todas | Ações de topo diferentes (Novo vs Exportar/Reposición/Voltar), tabelas com ações heterogêneas | Aplicar tokens únicos para ação primária/secundária, borda/altura/ícones, preservando hierarquia e permissões |
| CON-11 | Média | Todas | Terminologia inconsistente entre quantidades, moedas, datas e estados | Padrão de formatação es-PY, data legível, medidas completas ou abreviação explicada, estado acessível |
| CON-12 | Média | Clientes / Proveedores | Estados vazios e listados com dados usam alturas naturalmente diferentes | Não forçar grande altura em estados vazios; apresentação consistente de loading/erro/vazio, sem conteúdo fictício |
| CON-13 | Alta | Todas | Os prints demonstram aparência, não funcionalidade de ordenação, filtros ou paginação em conjuntos maiores | Homologar navegação, filtro, ordenação antes de paginar, persistência, paginação, links e responsividade em browser; não marcar funcionalmente aprovado a partir do print |
| CON-14 | Média | Movimientos | Data, unidade `271 Unidad`, badge Entrada e detalhamento podem ser apresentados de forma mais consistente | Convenção comum para data/hora, concordância de unidade, badges e ação Ver detalle, sem mudar histórico do movimento |

## Avaliação por tela

- **Clientes:** referência visual; sem registros, portanto não demonstrou ordenação e linha de tabela.
- **Proveedores:** próximo do padrão; verificar capitalização, badges, termos ausentes.
- **Productos:** toolbar desbalanceada e possíveis divergências de código e classificação, que exigem verificação de dados.
- **Catálogos:** boa estrutura; códigos ausentes e semântica de categorias precisam conferência.
- **Listas de precios:** estrutura boa; refinar descrições e vigência.
- **Stock:** maior densidade; seis KPIs e muitos filtros, necessitando composição responsiva específica; badges de disponibilidade requerem significado.
- **Movimientos:** estrutura clara; padronizar apresentação de datas/unidades/estados.

## Critérios gerais e restrições

1. **Não recriar todas as telas**, nem reverter alterações aprovadas. Refinar inconsistências verificadas com CSS e componentes reutilizáveis onde fizer sentido.
2. Não eliminar KPI, coluna, filtro, ação, registro ou permissão para acomodar o layout; não mascarar deficiência real com aparência.
3. Análises de dados (código com zero, procedência/categoria, sobrestock) exigem confirmação com dados/código, não podem ser tratados apenas como ajustes cosméticos.
4. Manter exclusão de Barrio e Facturación fora do escopo V1.
5. Screenshots ANTES recebidos em conversa; DEPOIS ainda por coletar. Preparar nomes `V1-[MODULO]-LISTA-ANTES-2026-10-11.png` e `V1-[MODULO]-LISTA-DEPOIS-AAAA-MM-DD.png`. Upload real para GitHub requer verificação de visibilidade e privacidade.
6. O Claude **não deve executar testes/build/servidores/processos no notebook**. Somente leitura, edição e commit/push após autorização. Revisão pelo ChatGPT; testes e homologação pelo responsável na VM.
