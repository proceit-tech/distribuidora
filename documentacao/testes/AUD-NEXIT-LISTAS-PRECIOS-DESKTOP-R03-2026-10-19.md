# AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R03 — Reauditoria independente de PRO-166…169

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex (desktop). **GitHub:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **Commits entregues:** `f691d7ff90eeed39923af8f90cd40f8c75e1d6e9` (funcional, pai `dd2672579a4e03ae3fa7fa68e3df5c422a535369`) e `f220ff4d25321b64e90cc4ee1b1570679541cef3` (documental, pai `f691d7ff...`). **HEAD conferido:** `f220ff4d25321b64e90cc4ee1b1570679541cef3`.

## Parecer executivo

**LPR-D01 / PRO-166, LPR-D02 / PRO-167 e LPR-D04 / PRO-169 CONFORMES EM AUDITORIA ESTÁTICA DIRIGIDA**, ressalvado gate funcional **LPR-GATE-VISIBILIDADE**: somente LISTAS_PRECIO.CREAR recebe catálogos mínimos e **não consegue selecionar produtos, clientes específicos nem listas-base**, por decisão de segurança conservadora, dependente de política humana (relacionada à C24, mas não equivale a autorização de abertura do catálogo).

**LPR-D03 / PRO-168 PARCIALMENTE CONFORME:** separação de estado administrativo, vigência, dia inclusive e fuso `America/Asuncion` correta na função pura, **mas novo achado LPR-R03-01 MÉDIA**: a listagem fixa a data de hoje na montagem e não reavalia ao passar meia-noite sem remontagem. **Listas de precios NÃO HOMOLOGADO/NÃO ENCERRADO**. Nenhuma tarefa marcada Done e nenhuma correção aplicada pelo auditor.

## 1. Fontes e limites

Antes do parecer, consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e sua seção Listas, `documentacao/testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R02-2026-10-19.md`, ficha `AUD-LISTAS-PRECIOS-V1.md`, issues Linear PRO-166…169/70, diff dos dois commits e código publicado das telas, layouts, APIs, helpers, menu, testes, tipos, validações históricas e contratos de NEX-008/017/018.

Commit funcional: **1.111 adições e 754 remoções em múltiplos arquivos**, devido principalmente à extração de `page.tsx` para `_components/listado-listas.tsx`. Arquivos novos relevantes: `lib/listas-precio/{acceso-get,vigencia,carga-catalogos,listas-r02.casos}.ts` e `app/(private)/listas-precio/{nuevo,[id]}/layout.tsx`. Segundo commit modifica apenas a contagem de testes em `PROGRESSO-NEXIT-V1.md` de 25 para **24**.

**Testes declarados pelo Claude, NÃO executados pelo ChatGPT:** `listas-r02` **24/0**, `estabilizacion` Listas **68/0**, `listas-comerciales` **93/0**, `dashboard` **46/0**, `productos-r02` **61/0**, `clientes-r02` **60/0**, `proveedores-r02` **36/0**; ESLint e tipos dos arquivos tocados reportados OK. Verificados os cenários e limitações dos testes pela leitura de código. Sem render/click do React, navegador, API HTTP real, PostgreSQL, migrations, VM/Docker, testes completos, build/lint/tsc global, disparo manual de CI ou deploy. **O auditor executou 0 testes.** Os novos casos usam helpers puros/`fetch` simulado e afirmações estruturais.

## 2. Matriz de aceite

| Tarefa | Implementação revista | Parecer |
|---|---|---|
| **PRO-166 / LPR-D01 ALTA** | Layout pai admite VER ou CREAR; listado e ficha exigem VER, `/nuevo` exige CREAR. `decidirGetListas` confere finalidade; GET catálogos CREAR-only não consulta clientes, produtos/custos nem listas-base existentes e responde coleções vazias nesses campos. Lista exige VER, query mista `modo=catalogos` + extras e `modo` repetido são inválidos. POST segue CREAR e PUT EDITAR; empresa vem da sessão. Menu oferece destino /nuevo a CREAR-only, confirmação pós-alta sem links proibidos, VER redireciona à lista. | **CONFORME ESTATICAMENTE**, dependência funcional LPR-GATE-VISIBILIDADE para criar listas com itens/clientes/base; não conceder dados completos por suposição. |
| **PRO-167 / LPR-D02 MÉDIA** | GET lista devolve permissão `crear` da sessão; ambos CTAs Nueva dependem dela. GET ficha devolve `editar` da sessão; `[id]/page.tsx` passa `soloLectura`; campos no `fieldset disabled`, submissão inerte no handler e botão Atualizar ausente sem EDITAR, abas permanecem fora do fieldset para leitura. Backend mantém check POST/PUT. | **CONFORME ESTATICAMENTE**, sem navegação/React real. |
| **PRO-168 / LPR-D03 MÉDIA** | `lib/listas-precio/vigencia.ts` preserva BORRADOR e INACTIVA, usa `hoyAsuncion` via Intl com timezone explícito; lista ACTIVA futura vira AUN_NO_VIGENTE, vencida só após último dia, KPI usa `v.disponible` e filtro/etiqueta coerentes. Porém em `listado-listas.tsx` `const hoy = useMemo(() => hoyParaVigencia(), [])` **congela o dia da montagem**. | **ACEITE PARCIAL**, requer LPR-R03-01 MÉDIA para passagem de meia-noite com a mesma tela aberta. |
| **PRO-169 / LPR-D04 MÉDIA** | `carga-catalogos.ts` separa CARGANDO, ERROR, CONFIGURADO; verifica HTTP e shape (arrays principais + `monedaBase` não vazia). `ListaPrecioForm` bloqueia botão e handler se carga não confiável, não presume PYG, avisa erro e permite `Reintentar` sem mutar `form`. GET servidor obtém moeda base empresarial e retorna erro 500 se ausente. `useEffect` ignora respostas antigas após cleanup. | **CONFORME ESTATICAMENTE**, sem banco/navegador real; itens de arrays não têm validação de cada campo, mas não demonstrado bypass, pois apenas a carga do próprio servidor fornece essas opções. |

## 3. LPR-R03-01 — MÉDIA — status da vigência não muda quando a página atravessa o dia

**Fluxo concreto do código:**

1. `app/(private)/listas-precio/_components/listado-listas.tsx`, na montagem, executa `const hoy = useMemo(() => hoyParaVigencia(), [])`. O array de dependências vazio impede atualização desse valor durante toda a vida da instância React.
2. `resumen` faz `clasificarVigencia(lista, hoy)` e usa `[listas,hoy]`; filtros fazem `getEstadoReal(lista,hoy)`. Mesmo após uma nova renderização por digitar na busca/mudar filtro, `hoy` permanece o dia inicial.
3. Cenário: pessoa abre Listas de precios em **19/10/2026 às 23:58 America/Asuncion**, com lista ACTIVA habilitada e `vigenteHasta='2026-10-19'`. A tela exibe disponível. Mantém a aba aberta após **20/10/2026 00:01**, usa filtro ou busca; `hoy` permanece `2026-10-19`. A lista ainda aparece ACTIVA e é contabilizada «Disponibles para operar» apesar de estar vencida no calendário do Paraguai.
4. Só desmontar/remontar/recarregar a página corrige, contradizendo a intenção de usar data corrente na listagem. O mesmo ocorre para listas com `vigenteDesde` iniciando no novo dia.

**Impacto:** estado visual, filtro e KPI imprecisos ao passar meia-noite em tela desktop de uso contínuo. Não é corrupção de preço, alteração do banco, transgressão fiscal nem cálculo incorreto de timezone da função pura.

**Critério mínimo de correção, somente após autorização:** tornar o `hoy` reavaliável quando o **dia de Asunción** muda, inclusive depois de retomar uma aba suspensa; escolher mecanismo simples de componente (evento de visibilidade/foco e, se necessário, timer no início do próximo dia com cleanup) ou outra estratégia pequena determinística. Não adicionar polling frequente ou modificar backend. Toda classificação, filtros e KPIs devem usar a nova data coerentemente. Testes mínimos: início em 23:58 PY; passagem a 00:01 PY com tela montada; data da lista até 19 passa para VENCIDA/fora do KPI; data desde 20 passa de AUN_NO_VIGENTE para ACTIVA; foco após suspensão atualiza; sem chamadas de rede extras ou timers vazando; browser ausente indicado como limitação. Não alterar SQL, estados persistidos, regras comerciais ou C24. Registrar em tarefa nova do Linear, mantendo PRO-168 In Review parcial.

## 4. LPR-GATE-VISIBILIDADE — decisão funcional sobre os catálogos de CREAR-only

**Bloqueio legítimo e explícito comunicado pelo Claude e confirmado pelo código:** para LISTAS_PRECIO.CREAR sem VER, `GET?modo=catalogos` responde `clientes=[]`, `productos=[]`, `listasBase=[]`; demais catálogos simples, moedas e moeda base provêm da mesma empresa. Uma lista de preço simples/geral sem itens pode ser cadastrada, mas perfis somente CREAR não conseguem escolher cliente específico, preços por produto ou derivação de lista-base. O user story de criação completa **depende de política de visibilidade** de referências, distinta de dar permissão para consultar custos/saldos/listas inteiras.

Decisão humana requerida: catálogo mínimo seguro por tipo (ex. id/código/nome de produto e cliente, vínculo lista-base) e contexto de negócio/empresa, sem `costoPromedio`, `precioReferencia` ou outros dados confidenciais, e definição de quais seletores realmente devem funcionar para CREAR-only. **Não inferir do gate global C24** que visibilidade empresarial ampla está liberada; registrar dependência e consultar responsável antes de codificar. Até decisão, manter `[]`, jamais alargar GET irrestritamente. Registrar como issue funcional separada relacionada a PRO-166 e PRO-70.

## 5. Preservações e limites

LPR-A01…A09 e LPR-R02-01 seguem no código atual sem modificação dos arquivos de planejamento de filhos, conflito de conjunto completo de preços originais, lock de cabeçalho/itens, retorno 409 e rollback, preservação de IDs, REF-VENTA inalterável, escalões contíguos, referências comerciais históricas, validações de moeda/unidade/lista-base, regras NEX-008/017/018. Não alterar regra de uso de listas comerciais nas vendas nem SIFEN/IVA, custos/estoque, decisão U09/U10 ou política C24. Não foram executados testes reais de concorrência/isolamento em PostgreSQL.

Não classificar automaticamente como bug: view de custo empresarial com LISTAS_PRECIO.VER (política pendente), números `float8` nos limites sem reprodução, paginação local sem medição, snapshots GET sem ensaio concorrente, confirmações nativas e browser Back. A formatação de datas e a atualização quando a tela muda de dia são preocupações distintas.

## 6. Encaminhamento e governança

- **PRO-166, PRO-167, PRO-169:** `In Review`, código aceito estaticamente; **não Done e não homologado**.
- **PRO-168:** `In Review`, correção D03 parcialmente aceita, bloqueada por **LPR-R03-01**.
- **PRO-70:** `In Review`, quatro entregas implementadas, um defeito técnico residual e uma decisão funcional separada, **menu NÃO ENCERRADO/NÃO HOMOLOGADO**.
- Não publicar novo comando Claude automaticamente: o responsável autoriza correção dirigida, Claude faz teste curto, commit/push e para, ChatGPT audita AUD-R04. Nenhum outro menu iniciado, inclusive Catálogos comerciales.
