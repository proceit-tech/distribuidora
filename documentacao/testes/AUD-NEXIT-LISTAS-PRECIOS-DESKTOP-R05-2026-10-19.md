# AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R05 — Reauditoria independente PRO-172 / LPR-R04-01

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex, exclusivamente desktop. **Repositório:** `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `2ab08e868b771d0e4e1406c3ee4e8802937216af`; **pai:** `47b3dac9c22fd40722802ff6c14f228b3445181a`. A branch apontava exatamente ao SHA funcional no início da inspeção.

## Parecer executivo

**PRO-172 / LPR-R04-01: CONFORME EM AUDITORIA ESTÁTICA DIRIGIDA.** A corrida render→efeito atravessando meia-noite, registrada na R04, está corrigida: a data conhecida pela tela no render é passada em `fechaInicial` ao `crearVigilanteDia`. Ao instalar o efeito após a virada de dia em `America/Asuncion`, `iniciar()->revisar()` detecta a diferença contra a data que o React efetivamente possui e chama `setHoy`. Na instalação normal, sem diferença, não há notificação redundante. O timer único, a retomada por foco/visibilidade, o cleanup, a classificação pura e as regras comerciais anteriores foram preservados.

**LPR-D03/PRO-168 e LPR-R03-01/PRO-170: bloqueios técnicos correlatos aceitos estaticamente.** PRO-166, PRO-167 e PRO-169 já estavam aceitos estaticamente na R03 e não foram alterados. **Nenhum novo bloqueio técnico demonstrável neste recorte R02–R05.** Ainda resta **PRO-171 / LPR-GATE-VISIBILIDADE — decisão FUNCIONAL humana, estado Todo**: para usuário apenas LISTAS_PRECIO.CREAR, decidir quais referências mínimas de clientes, produtos e listas-base podem ser exibidas sem abrir custo/preço/catálogo completo e sem conceder acesso VER. Não presumir solução a partir da política C24.

**Estado do menu:** etapa de correções técnicas conhecidas de **Maestros → Listas de precios encerrada estaticamente no recorte auditado; NÃO HOMOLOGADO e NÃO Done**. Requer homologação humana em browser, HTTP integrado, PostgreSQL e condições operacionais. A possibilidade de auditar o próximo menu **Maestros → Catálogos comerciales** depende de solicitação do responsável, sem alterar PRO-171 nem declarar homologação de Listas.

## 1. Fontes e escopo

Consulta independente a `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e entradas pertinentes de Listas, relatório `documentacao/testes/AUD-NEXIT-LISTAS-PRECIOS-DESKTOP-R04-2026-10-19.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-LISTAS-PRECIOS-V1.md`, tarefas Linear PRO-172/170/168/171/70, diff e versões efetivamente publicadas do código de `listado-listas.tsx`, `vigencia.ts`, `listas-r02.casos.ts`, `calculos.ts` e sua cadeia de chamadas, efeitos, dependências de memoização e links entre filtros/KPI e classificação.

**Commit Claude: 4 arquivos alterados, 62 adições e 5 exclusões:**
- `app/(private)/listas-precio/_components/listado-listas.tsx` — `const [hoyMontaje]=useState(()=>hoyParaVigencia()); const [hoy,setHoy]=useState(hoyMontaje);`, `fechaInicial:hoyMontaje` na criação do vigilante, dependência `[hoyMontaje]`.
- `lib/listas-precio/vigencia.ts` — dependência opcional `fechaInicial?:string`, `let actual=d.fechaInicial??hoyParaVigencia(d.ahora())`, mantendo `iniciar()->revisar()`.
- `lib/listas-precio/listas-r02.casos.ts` — relógio/timers controlados estendidos com data do render injetada e oito asserções focais adicionais.
- `PROGRESSO-NEXIT-V1.md` — entrada operacional de implementação.

**Sem mudanças neste commit:** `msHastaProximoDia`, `clasificarVigencia`, `hoyAsuncion`, SQL/migrations, APIs de GET/POST/PUT, autenticação, schemas monetários, `REF-VENTA`, planejamento dos itens com versão/409, filtros/paginação, funcionamento de PRO-166/167/169, PRO-171/C24.

## 2. Matriz independente de aceite

| Requisito | Evidência atual | Parecer |
|---|---|---|
| Render às 23:59:59.999 PY, `useEffect` às 00:00:00.001 PY | O React inicializa `hoyMontaje=19` e `hoy=19`; o vigilante recebe `fechaInicial=19` mesmo instalado em dia 20. `iniciar()->revisar()` obtém `hoy=20` do relógio de Asunción, compara com `actual=19` e chama `setHoy(20)` | **CONFORME** |
| Render e efeito no mesmo dia | `actual=fechaInicial` coincide com `hoyParaVigencia`; não há chamada `alCambiar` desnecessária | **CONFORME** |
| Virada subsequente, sem remontar | `reprogramar()` usa um `msHastaProximoDia` para a próxima meia-noite paraguaia, com revisão e reagendamento; `hoy` React atualiza após disparo | **CONFORME** |
| Foco/visibilidade e aba suspensa | Listeners do `useEffect` chamam `revisar` ao foco e ao retornar ao estado visível; a data atual é calculada no evento, independentemente da eventual suspensão do timer | **CONFORME** |
| Recursos sem duplicação/vazamento | `iniciar` evita segundo subscribe, `reprogramar` cancela timer anterior, `detener` retira listeners e timer, cleanup do efeito devolve `vigilante.detener()` | **CONFORME** |
| Coerência de indicadores/filtros/ordenação | `resumen`, `filtradas` e `ordenados` referenciam `hoy` como dependência/valor, portanto a mudança do estado recalcula as projeções; não há atualização de registros ou GET adicional devido ao timer | **CONFORME** |
| Preservação das demais correções | Diff restrito a vigilante/UI de data, seus testes e progresso; sem alterações nas APIs ou serviços monetários | **SEM REGRESSÃO NO DIFF** |

## 3. Testes e limites do parecer

**Claude informou, não reexecutado por ChatGPT:** `listas-r02` **40 verificações, 0 falhas** (**8 novas**), ESLint e checagem de tipos pontuais nos arquivos alterados OK. Conferidas as verificações de funções de produção, não apenas nomes: `entorno(inicio, fechaInicial)` injeta relógio, agenda/cancelamento de timers, inscrições e callback de data no `crearVigilanteDia`; testa render 19→efeito 20, ausência de atualização espúria no mesmo dia, segunda virada 21, foco repetido, suspensão de 30h e recuperação, desmontagem e não notificação posterior. Teste estrutural complementar confirma `fechaInicial:hoyMontaje` e `alCambiar:setHoy` na UI.

**ChatGPT executou 0 testes neste turno.** Não renderizou/clicou React, não observou `focus/visibilitychange` ou suspensão real, não fez HTTP real/integração, PostgreSQL, VM/Docker, SQL/migrations, suíte global, build/tsc/lint global, CI manual ou deploy. Não se pode declarar homologação operacional, segurança integral ou aprovação E2E.

O duplo estado `hoyMontaje/hoy` é intencional: o primeiro permanece estável como valor da montagem, e o segundo evolui quando o vigilante notifica a nova data; o efeito de vigilância não é rearmado a cada atualização de `hoy`.

## 4. Estado por tarefa e continuidade

- **PRO-172 / LPR-R04-01:** `In Review`, **CONFORME ESTATICAMENTE**; não Done/não homologado.
- **PRO-170 / LPR-R03-01:** `In Review`, o último bloqueio técnico conhecido de atualizações de data foi saneado estaticamente por PRO-172; não Done/não homologado.
- **PRO-168 / LPR-D03:** `In Review`, classificação e calendário PY aceitos estaticamente, mais o vigilante agora coerente com a renderização inicial; não Done.
- **PRO-166 / D01, PRO-167 / D02, PRO-169 / D04:** `In Review`, aceites anteriores preservados; não Done.
- **PRO-171 / LPR-GATE-VISIBILIDADE:** `Todo`, decisão humana em aberto sobre catálogos CREAR-only (cliente, produto, lista-base, custo/valor/escopo). **Não criar autorização adicional nem implementar gate por inferência.**
- **PRO-70 / Listas de precios:** `In Review`, **etapa corretiva estática R02–R05 concluída**, **NÃO HOMOLOGADO**, sem certificado integral de todos os fluxos.

**Próximo menu:** o responsável poderá solicitar auditoria de `Maestros → Catálogos comerciales` independentemente da homologação operacional de Listas. Não iniciar espontaneamente. Não criar nova tarefa técnica Claude sem defeito comprovado.
