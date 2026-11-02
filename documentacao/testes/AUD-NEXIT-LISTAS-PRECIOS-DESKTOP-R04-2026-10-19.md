# AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R04 — Reauditoria independente PRO-170 / LPR-R03-01

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex, somente desktop. **Repositório:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **Commit funcional auditado:** `09a831ea5c312f8f1301529fc0cbde89285dd55c`; **pai:** `49963bdb30f71332f57a1eccfb3a60870274dc9c`; HEAD da branch conferido no SHA funcional no início da revisão.

## Parecer

**PRO-170 / LPR-R03-01: CORREÇÃO SUBSTANCIAL, ACEITE ESTÁTICO PARCIAL.** A passagem de dia **depois da instalação do vigilante** funciona no código: há um único timer até a próxima meia-noite de `America/Asuncion`, revisão no foco/visibilidade, recalculo por mudança efetiva de `hoy` e cleanup no unmount; sem requisições adicionais de dados. Porém **LPR-R04-01 MÉDIA (novo achado)**: corrida de inicialização **entre render React e efeito** quando atravessam meia-noite deixa `hoy` React desatualizado **mesmo após foco**, embora o vigilante tenha a data correta internamente. Não declarar PRO-170 concluída. **Listas de precios NÃO HOMOLOGADO / NÃO ENCERRADO.**

## 1. Fontes e limite

Consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, relatório anterior `documentacao/testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R03-2026-10-19.md`, ficha `AUD-LISTAS-PRECIOS-V1.md`, tarefas Linear PRO-170/171/168/70 e diff/composição atual dos arquivos relevantes: `app/(private)/listas-precio/_components/listado-listas.tsx`, `lib/listas-precio/{vigencia,calculos,listas-r02.casos}.ts`, cadeia de GET/permissões previamente auditada, sem mudança neste commit. A análise é **estática e dirigida**, não uma revisão integral de todos os componentes. Código alterado em **4 arquivos: +188 / -3 linhas**, sendo `listado-listas.tsx`, `vigencia.ts`, `listas-r02.casos.ts`, `PROGRESSO-NEXIT-V1.md`.

**Testes informados pelo Claude, NÃO executados pelo ChatGPT:** `listas-r02` **32 verificações / 0 falhas** (8 novas), lint e tipos focais dos arquivos tocados OK. Casos de timer e relógio usam o helper real com dependências injetadas; ligação à UI é aferida por assert estrutural. Sem navegador/React montado, execução de timers e eventos nativos, HTTP real, PostgreSQL, VM/Docker/SQL/migrations, suíte global, build/lint/tsc global, CI manual ou deploy.

## 2. Matriz do que ficou conforme

| Cenário | Evidência do código | Parecer |
|---|---|---|
| Dia muda com a tela montada **e vigilante já instalado** | `useState` mantém `hoy` e `crearVigilanteDia` chama `setHoy` quando `hoyParaVigencia` difere do seu `actual`; indicadores/filtros/ordem usam `hoy` como dependência | **CONFORME ESTATICAMENTE** |
| Data e meia-noite no Paraguai | `msHastaProximoDia` usa busca do primeiro instante em que `hoyParaVigencia` muda com timezone explícito `America/Asuncion`; não usa meia-noite do dispositivo. `+500 ms` evita execução precoce junto à fronteira. | **CONFORME ESTATICAMENTE**, sem ensaio de navegador real |
| Computador suspenso/aba em segundo plano após instalação | `focus` e `visibilitychange` visível chamam `revisar`, atualizando `actual` e `hoy`, e reprogramando timer | **CONFORME ESTATICAMENTE** |
| Não duplicar recursos | `iniciar()` evita segundo subscribe se já há `retirar`; `reprogramar` cancela timer anterior, `detener` limpa timer/assinatura | **CONFORME ESTATICAMENTE** |
| Regra comercial e consultas | `clasificarVigencia` preserva estados administrativos e dias inclusivos, `resumen` usa `hoy`, e `cargarListasConPermisos` segue efeito independente com dependências vazias; nenhum SQL/GET extra neste commit | **PRESERVADO** |
| Render antes e `useEffect` depois da meia-noite | Estado React inicial antigo, vigilante novo com `actual` novo; `revisar` não chama `setHoy` por igualdade interna | **NÃO CONFORME — LPR-R04-01** |

## 3. LPR-R04-01 — MÉDIA — corrida entre renderização e inicialização do vigilante em meia-noite

**Caminho determinado pelo código atual:**

1. `app/(private)/listas-precio/_components/listado-listas.tsx:174` inicializa o estado do React com `useState(() => hoyParaVigencia())`. Considere montagem/render em **19/10/2026 às 23:59:59.999 no calendário PY**; portanto, `hoy` React = `2026-10-19`.
2. O `useEffect` monta o vigilante **depois** da renderização. Se for agendado pelo React após **20/10/2026 00:00:00 no Paraguai**, `crearVigilanteDia(d)` executa `let actual = hoyParaVigencia(d.ahora())`, logo o vigilante começa com `actual='2026-10-20'`.
3. `vigilante.iniciar()` chama `revisar()`, mas compara **data nova** com `actual` já novo: `if (hoy !== actual)` é **false**, portanto **não chama `alCambiar:setHoy`**. React continua no dia 19, enquanto o vigilante acha que está no dia 20.
4. Ao voltar o foco ou a visibilidade no dia 20, `revisar()` continua comparando `2026-10-20` com `actual='2026-10-20'`, não chamando `setHoy`. O próximo timer programa a **meia-noite do dia 21**, e só então atualizará `hoy` React, pulando visualmente o dia 20.
5. Exemplos de efeito: lista que venceu em 19/10 continua mostrada como ACTIVA/disponível em 20/10; lista que começa em 20/10 continua como «Aún no vigente». Não há dano a banco ou atualização de preços, mas o KPI/filtro pode permanecer incorreto **por quase um dia inteiro**, se o caso raro ocorrer.
6. Os 8 novos testes começam o `crearVigilanteDia` e sua memória interna **no mesmo instante**; não simulam duas leituras distintas de hora entre `useState` React e construção do vigilante no efeito.

**Condição:** janela temporal estreita, mas possível por render assíncrono, montagem adiada, aba suspensa ou diferença de agendamento de efeitos; não afirmar que foi observado em navegador. **Impacto MÉDIO na confiabilidade de vigência**, não falha de autorização, rede ou banco.

**Correção mínima esperada (sob nova autorização):**
- Garantir uma **sincronização inicial** do estado React com o dia observado **no momento em que o vigilante inicia**, independentemente de ter sido construído antes ou depois da meia-noite; alternativa equivalente: inicializar vigilante com o valor `hoy` do render e comparar no primeiro `revisar`. Evitar loop React, segunda inscrição ou chamada desnecessária.
- Após a sincronização, manter comportamento já corrigido: timer único até a próxima meia-noite de Asunción, foco/visibilidade, cleanup, atualização somente em mudança, mesmo `hoy` em KPI/filtros/ordenação; sem rede extra.
- Testes **focais**: render com 19/10 23:59:59.999 e iniciar efeito com 20/10 00:00:00.001 → `setHoy('2026-10-20')` uma vez; foco repetido no dia 20 não duplica; virada subsequente ao dia 21 funciona; caso normal sem cruzar meia-noite não gera update indevido; unmount cancela recursos. Preferir testar helper com relógio e estado React simulado, e estruturalmente confirmar integração. Não criar testes de browser ou PG como se fossem realizados.
- Alterações somente em `lib/listas-precio/vigencia.ts`, `listado-listas.tsx`, casos focais e progresso, se necessários. Sem SQL, alteração em autenticação, GET, lista persistida, PRO-171, custo ou outros menus.

## 4. Governança e gate funcional separado

- **PRO-170 / LPR-R03-01: In Review, parcialmente conforme**, bloqueado por nova tarefa `LPR-R04-01` (a ser registrada como subtarefa técnica de PRO-70 em Todo).
- **PRO-168 / LPR-D03: In Review parcial**, pela mesma dependência de atualização contínua; regras puras do calendário PY e BORRADOR/INACTIVA aceitas da R03.
- **PRO-166 / D01, PRO-167 / D02 e PRO-169 / D04: In Review, aceitos estaticamente**, não reabertos por esse diff.
- **PRO-171 / LPR-GATE-VISIBILIDADE: Todo**, decisão humana específica sobre itens/clientes/listas-base acessíveis ao usuário CREAR-only, sem expor custos nem decidir C24 implicitamente.
- **PRO-70: In Review, NÃO HOMOLOGADO/NÃO ENCERRADO**, com uma pendência técnica focal e o gate funcional separado. **Não iniciar Catálogos comerciales automaticamente nem marcar tarefas Done.** Depois de correção dirigida por Claude sob autorização humana, auditar R05 no GitHub e Linear. Auditor não alterou código funcional nem ambiente real.
