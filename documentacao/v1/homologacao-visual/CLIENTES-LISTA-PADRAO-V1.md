# Nexit V1 — Padrão de listagens e revisão da lista de Clientes

**Estado:** ESPECIFICAÇÃO, não implementada e não homologada. **Origem:** print real da lista de Clientes enviado pelo responsável em 2026-10-11. **Escopo da primeira execução:** só lista Clientes; após aceite, reutilizar padrões em Proveedores, Productos, Catálogos, Listas de precios e demais listas pertinentes, cada uma com revisão específica.

## Evidência ANTES
- URL: `https://nexit.proceit.net/clientes`; ambiente piloto CASA MINGO.
- Captura original da conversa: `V1-CLIENTES-LISTA-ANTES-2026-10-11-01.png` (**PENDENTE de publicação no GitHub; não afirmar que está no repositório**).
- Tela observada: chip MAESTROS isolado, título Clientes, descrição extensa e genérica; botão Nuevo cliente muito grande; quatro cartões altos; filtros ocupando duas linhas com aparência dispersa; tabela com títulos COMERCIAL / LOGÍSTICA e CRÉDITO / ESTADO, sem ordenação visível; lista vazia com grande espaço branco.
- Dados exibidos: zero Clientes para a empresa logada. **Não criar dados fictícios.**

## Decisões de UX e critérios de aceite

| ID | Prioridade | Regra | Aceite |
|---|---|---|---|
| LIS-01 | Alta | Topo compacto, sem chip MAESTROS protagonista. Breadcrumb discreto `Maestros / Clientes`; título `Clientes` e ação `Nuevo cliente` na mesma região, alinhados. | Cabeçalho profissional, coeso, sem grande área vazia; navegação consistente |
| LIS-02 | Média | Remover a descrição genérica atual ou usar a frase curta `Administre sus clientes y su información comercial.` se agregar contexto real. | Sem texto promocional solto/sem utilidade |
| LIS-03 | Alta | Botão primário visualmente refinado e proporcional: altura 38–40px, fonte 13–14px, peso ~600, ícone + discreto, sem tamanho exagerado. | Ação clara, sem dominar a tela; clique preservado |
| LIS-04 | Média | Quatro indicadores em cartões compactos; tamanho e distância equilibrados; não retirar métricas nem alterar consultas. | Valores/legendas corretos e legíveis; altura reduzida e foco na lista |
| LIS-05 | Alta | Toolbar de listagem integrada: busca, Estado/Naturaleza/Operación, limpar filtros; rótulos alinhados, alturas consistentes ~36–38px; adaptar para notebook. | Busca/filtros/limpar funcionam, sem campos dispersos ou espaços excessivos |
| LIS-06 | Alta | Grid profissional com cabeçalhos significativos e informação primária/secundária, evitando agrupamentos vagos; proposta: Cliente, Identificación, Comercial, Contacto principal, Estado, Acciones. **Não inventar campo não existente nem esconder informação atual**: se dados não estiverem disponíveis, mapear a origem e indicar impedimento, sem criar mock. | Colunas úteis e responsivas, células alinhadas, valores íntegros; preservação do que já é exibido |
| LIS-07 | Alta | Ordenação real por cabeçalhos pertinentes com indicação de direção, sem apenas ícone decorativo; manter consistência com busca/filtro/paginação e conjunto completo (avaliar necessidade de ordenação no backend). | Asc/desc corretos, consistentes com quantidade total, filtros e páginas; não ordenar só a página atual se houver paginação remota |
| LIS-08 | Média | Hover e foco acessíveis, ações Ver/Editar e menu contextual apenas para operações realmente implementadas/autorizadas. | Nada de botões fictícios; navegação real, keyboard acessível |
| LIS-09 | Média | Empty state compacto dentro da área da tabela: `Aún no hay clientes registrados` / `Cree su primer cliente para comenzar a operar.` + ação real se apropriada. | Tela vazia não aparenta falha; sem altura branca arbitrária |
| LIS-10 | Alta | Padrão contextual: título 24–26px/700; breadcrumb 12px; descrição (se houver) 13–14px; KPI rótulo 11–12px/650, valor 18–20px; filtros 13–14px; corpo da tabela 14px, secundário 12–13px, cabeçalho 12px/650; paginação 12–13px. | Não reproduzir extremos de letras minúsculas nem exageros do aumento global; boa densidade e contraste |
| LIS-11 | Alta | Responsive: sidebar permanece 236px; conteúdo aproveita restante; colunas em largura menor usam adaptação controlada (inclusive rolagem horizontal da tabela quando realmente necessária), sem desaparecer dados nem quebrar layout. | Desktop/notebook/mobile operáveis sem sobreposição |
| LIS-12 | Alta | Preservação total da funcionalidade atual e isolamento por empresa/permissões; manter APIs, sem alterações em banco ou migrations nesta tarefa sem aprovação adicional. | Fluxos de lista, busca, filtros, paginação e criação continuam funcionando no PostgreSQL real |

## Controle de antes e depois

| Etapa | Captura | Versão | Avaliação |
|---|---|---|---|
| ANTES | `capturas/V1-CLIENTES-LISTA-ANTES-2026-10-11-01.png` — pendente de upload | imagem fornecida em conversa | REPROVADO pelo responsável |
| DEPOIS | `capturas/V1-CLIENTES-LISTA-DEPOIS-AAAA-MM-DD-01.png` — ainda não existe | commit futuro | PENDENTE |

**Não confundir referência textual com captura fisicamente presente.** Para anexar imagens: confirmar visibilidade/acesso, remover dados sensíveis quando necessário, publicar PNG real pelo fluxo aprovado e conferir via GitHub. Registrar resolução, zoom (100%), SHA do código e aprovação humana.

## Fluxo e responsabilidade

ChatGPT documenta especificação, critérios e revisão; **não altera código sem ordem explícita**. Claude implementa **somente após autorização**, lê protocolos/esta especificação, faz commit+push e para. **Nenhum teste/build/processo local no notebook**, conforme ordem do responsável; o responsável executa build/deploy e homologação na VM. Resposta Claude: resultado, testes não executados, bloqueios reais e SHA, sem listas de arquivos e diffs. Não aplicar este padrão automaticamente a outros módulos antes da homologação de Clientes.

## Implementação (2026-10-11) — aguardando build, captura DEPOIS e homologação na VM
LIS-01 a LIS-12 implementados em `/clientes` (tela de referência). Decisões: tabela semântica com colunas Cliente, Identificación, Comercial, Contacto principal, Crédito, Estado e Acciones (Crédito mantido para não ocultar informação já exibida); ordenação por Cliente, Identificación, Comercial, Crédito e Estado sobre o conjunto filtrado completo antes de paginar (todos os clientes já são carregados pela API atual; ciclo sem ordem → asc → desc → sem ordem; sem ordem = ordem da API); única ação real existente: "Ver ficha" (`/clientes/[id]`, que também edita). Descrição genérica removida. APIs, banco e permissões inalterados. Nada validado no notebook por determinação do responsável.
