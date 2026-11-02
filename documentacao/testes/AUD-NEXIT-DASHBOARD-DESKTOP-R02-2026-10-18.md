# AUD-NEXIT-DASHBOARD-DESKTOP-R02 — Reauditoria independente completa do escopo Dashboard desktop

**Data:** 18/10/2026. **Auditor:** ChatGPT. **Projeto:** NEXIT / ERP DistribuNex; repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **Menu:** Panel general, `/dashboard`, sidebar e landing diretamente vinculados. **Não se aplica a FactuNex.**

**Veredito:** CORREÇÕES PENDENTES — **2 ALTAS, 5 MÉDIAS, 1 BAIXA** (incluem os cinco achados históricos R01). **Não homologado**; nenhum teste executado nesta auditoria. Requer autorização humana para qualquer implementação por Claude; NÃO iniciar C04 ou mudar de menu automaticamente.

## 1. Fontes e integridade de escopo

- Lidos os protocolos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trecho pertinente de `PROGRESSO-NEXIT-V1.md`, auditoria `AUD-NEXIT-DASHBOARD-DESKTOP-R01-2026-10-18.md`, ficha `AUD-DASHBOARD-V1.md`, especificação visual `DASHBOARD-SIDEBAR-V1-REVISAO-2026-10-10.md`, plano de correções desktop e controle de revalidação de 22 menus.
- Inspeção de `app/(private)/dashboard/page.tsx` (468 linhas), `page.module.css` (778), `layout.tsx`, `app/api/dashboard/route.ts` (50), `lib/dashboard/shared.ts` (187), `lib/dashboard/cliente-api.ts` (13), `types/dashboard.ts` (41), `components/layout/sidebar/sidebar.tsx`, `components/layout/app-shell/app-shell.tsx`, `lib/navigation/menu.ts`, `lib/auth/permissions.ts`, `lib/auth/server-context.ts`, `app/(private)/layout.tsx`, `app/page.tsx`, login/landing, serviço `lib/movimientos/historial.ts` e GET detalhe de movimento.
- Contraste com migrations SQL NEX-009, NEX-011, NEX-014, fonte `lib/stock/shared.ts`, T07 histórico de Dashboard, auditoria de Stock. Conteúdo estático do Git; migrations versionadas NÃO implicam migrations aplicadas.
- **Controle contra rollback indevido:** blob SHA da página `48c1ebf658617685de8f052e5265e3b6d85abaed`, API `70927df8ae8ea3086fe34d9600c8d9ac1bbb88fe`, serviço `10efa658fea4693b8a4e1a64e69b85ac165e851c`, CSS `380ddd8f3ddd3f12254386856ff8166bc48f8c94`, sidebar `ed60d222ca51e98ffce430250231ac93de3313e4`, menu `ab08464cad9d60377a1fef9006b967d9ccfefe20`, histórico `05466bc8cb93a53780b2e361e9f7b4cca777cd63` são **idênticos** entre snapshot R01 `6a649403f12c52dcdb7fc92f9afd765655c92468` e a branch atual nesta auditoria. **Nenhum rollback funcional do Dashboard é justificável por alterações recentes.**
- Não foram executados PostgreSQL, VM, Docker, browser, gateway, pipeline, build ou testes TS; não houve screenshots reais atuais; não se afirma que um cenário foi reproduzido no ambiente operacional.

## 2. Matriz de fluxo auditado

| Interface / regra | Servidor, SQL e acesso | Resultado |
|---|---|---|
| Entrada da empresa em `/`, login e sidebar | `app/page.tsx` e `login-form.tsx` apontam a `/dashboard`; layout Dashboard desvia plataforma; API exige `DASHBOARD.VER` | **F-DASH-04**: perfis empresariais sem VER chegam a tela sem dados (API 403); não ocorre 403 de plataforma |
| Período 7/15/30/90 e depósito | `PERIODOS`, UUID e depósito autorizado; `activo` em useEffect descarta respostas anteriores após cleanup | **F-DASH-02**, **F-DASH-08**; proteção básica entre respostas do GET presente |
| KPIs produtos/clientes | Contagens por empresa, gated por `PRODUCTOS.VER` / `CLIENTES.VER` | Sem falha nova no escopo: indicadores são da empresa, não do período |
| Valor inventário | `inventario_costos` com depósito autorizado, total `numeric(18,4)` convertido para `float8`, enviado como JS number | **F-DASH-07**, perda de contrato de precisão para totais grandes; efeito real depende de magnitude |
| Alertas e gráfico de stock | `stock_saldos` somente de depósitos autorizados; consulta de produtos começa por catálogo inteiro; usuários sem depósitos contam falso sem-stock | **F-DASH-01**, depende de decisão de visibilidade do catálogo; não mudar produto global por conta própria |
| Movimentos no gráfico | `MOV_OK` aplica estado registrado e não-inverso, mas depósito permite origem OU destino | **F-DASH-06**: universo de movimentos diferente do histórico autorizado; contagem potencialmente incoerente |
| Últimos movimentos | SQL seleciona empresa+origem OU destino, nomes dos dois depósitos, produto, quantidade, usuário, sem estado/anula_a_id | **F-DASH-06 ALTA** (dados do depósito sem acesso) e **F-DASH-03 MÉDIA** (status omitido); botão detalhe poderá receber 404 |
| CTA e sidebar | KPI cards verificam bloco de permissão, mas links secundários são fixos | **F-DASH-05**, F-DASH-04 |
| CSS desktop | 236/72 px da sidebar como diretriz, topo compacto, KPIs quebram texto | Sem homologação visual; não demandar menu/celular |

## 3. Achados confirmados e qualificação de decisões

### F-DASH-06 — ALTA, NOVO — Dashboard viola a regra explícita de alcance integral de movimento

**Evidência de código:** `lib/dashboard/shared.ts:93–121` usa `(m.deposito_origen_id = ANY($2::uuid[]) OR m.deposito_destino_id = ANY($2::uuid[]))` tanto em gráfico quanto em `ultimos`; na segunda consulta, devolve `dor.nombre`, `dde.nombre`, `sum(l.cantidad)`, produto, `u.usuario` e ID. O contrato canônico de `lib/movimientos/historial.ts:8–12,25–31,88,150–151` é **TODOS os depósitos referidos em alcance**; `app/api/movimientos/[id]/route.ts` usa `leerLineasMovimiento` e devolve 404 fora desse alcance.

**Cenário demonstrável pela lógica SQL (não executado em PG):** usuário U autorizado apenas ao depósito A; transferência da empresa E de A para B (B fora do alcance). O Dashboard inclui a transferência porque A está autorizado, devolve nome B, quantidade, produto, usuário e link; o histórico/detalhe a ocultam por exigirem A E B no alcance. A regra é explícita para evitar revelar metadados/quantidades de depósito não autorizado. **Não é fuga entre empresas** e não prova leitura de saldos de B; é exposição de metadados e quantidades do movimento e quebra de política de escopo dentro da empresa.

**Correção mínima esperada:** aplicar primeiro autorização integral de ambos os depósitos do movimento com o mesmo predicado validado do histórico; aplicar separadamente o filtro de depósito selecionado no Dashboard (origem OU destino selecionado). Não confundir o filtro escolhido no painel com o conjunto de depósitos que U pode acessar, não perder transferências legítimas A→B quando ambos são autorizados, nem mudar histórico, ACL ou migrations. Testes dirigidos: U só A / transferência A→B (nenhuma linha e nenhum efeito em KPI movimento); U A+B (aparece); U sem depósitos; outro tenant; destino inativo histórico conforme política vigente; GET detalhe consistente com Dashboard.

### F-DASH-01 — ALTA histórica, CONFIRMADA NO CÁLCULO; decisão de catálogo pendente

`lib/dashboard/shared.ts:67–78,145–161` inicia `FROM productos p`, restringe apenas o `LEFT JOIN stock_saldos` a `deps` e classifica disponível=0 como `Sin stock`. Produto só existente em B não autorizado, ou ator sem depósitos, ainda entra em produto/KPI `sin` com dado falso para a população local. **Retificação da interpretação:** `lib/stock/shared.ts` documenta que catálogo global pode ser intencional; NÃO afirmar automaticamente que descrições globais são proibidas ou que há exploração/vazamento sensível comprovado. **Gate C24:** responsável define visibilidade do catálogo sem saldo no alcance e distinção de “sem saldo neste recorte” versus “estoque esgotado em depósito relevante”. Não aplicar `INNER JOIN saldo >0` cegamente (apagaria produto legítimo zerado). Não alterar código até essa definição.

### F-DASH-02 — MÉDIA histórica, CONFIRMADA — dados de contexto anterior sob filtro novo

`app/(private)/dashboard/page.tsx:104–140` limpa o erro e aciona carga mas conserva `datos` em troca de período/depósito. `catch` não invalida dados. `periodoInfo` usa filtro corrente enquanto `serie`, `tarjetas` e `alertas` usam resultado antigo. Caso A/7d→B/90d com erro mantém valores A sob rótulo B, inclusive links operáveis. Solução UI: acoplar resposta ao contexto, ocultar/sinalizar explicitamente stale e proibir ações stale em outro filtro; preservar retry e dados do mesmo filtro se identificados. Testes A→B erro, A→B sucesso, A→B→A fora de ordem, refresh atual.

### F-DASH-03 — MÉDIA histórica, CONFIRMADA — estados de anulação omitidos

`lib/dashboard/shared.ts:104–121,179–183` não seleciona `m.estado`, `m.anula_a_id` nem relação inversa e não filtra anulados; `page.tsx:367–385` mostra apenas `TIPOS[m.tipo]`. `MOV_OK` do gráfico omite ANULADO e inversos, logo lista e série têm semânticas diferentes sem indicação. Não eliminar historico de anulação por suposição; se mantiver histórico completo, rotular estado/origem do inverso e explicar diferença para gráfico. Testes REGISTRADO, ANULADO, contrapartida.

### F-DASH-04 — MÉDIA histórica, CONFIRMADA — landing e navegação sem `DASHBOARD.VER`

`components/layout/sidebar/sidebar.tsx:127–147,172–197` exibe duas entradas fixas `/dashboard` para todo usuário; `app/page.tsx` e `components/auth/login-form.tsx` redirecionam usuários empresariais a `/dashboard` mesmo sem `DASHBOARD.VER`. `app/(private)/dashboard/layout.tsx` redireciona administrador de plataforma para Empresas (correto); para perfil comum sem VER não decide destino. `app/api/dashboard/route.ts:17–25` responde 403. Resolver landing por primeira rota permitida e mostrar link conforme papel, sem conceder autorização automática; usuário sem nenhum destino recebe estado de acesso adequado. Teste perfil só CLIENTES.VER, empresa admin, plataforma.

### F-DASH-05 — MÉDIA histórica, CONFIRMADA — CTAs para módulos negados

`page.tsx:234–237,360–363,413–416` sempre renderiza links para Movimientos/Stock, mesmo que `serie`/`ultimos`/`stock` sejam null porque usuário não tem `MOVIMIENTOS.VER`/`STOCK.VER`. Os KPI cards :212–220 já fazem gating correto. Condicionar os três links (e alertas `href` conforme fonte) às permissões do resultado, sem acrescentar grants. Teste Dashboard.VER apenas; Dashboard.VER+MOVIMIENTOS; +STOCK.

### F-DASH-07 — MÉDIA NOVA, defeito de representação potencial — dinheiro convertido a float8

`lib/dashboard/shared.ts:79–81` faz `sum(valor_total)::float8` sobre `inventario_costos.valor_total numeric(18,4)` de NEX-009; `types/dashboard.ts:27` define `valor:number` e `page.tsx:30–35,69–71` formata JS number. Totais `numeric` do Postgres podem exceder a precisão decimal/inteira de `number`, e a conversão silenciosa elimina igualdade exata antes da formatação monetária. **Efeito efetivo em produção não verificado** e apresentações a 0/2 casas podem ser deliberadas; não afirmar divergência observada. Correção pontual se o Dashboard precisa reproduzir valor exato (consistente com padrões monetários dos reportes): transportar total como decimal texto e formatá-lo sem float, mantendo UX PYG=0 casas e outras moedas conforme regra aprovada; não alterar NEX-009 nem custeio. Testes quantidade grande e centésimos/casas limite, acesso e depósito.

### F-DASH-08 — BAIXA NOVA, CONFIRMADA ESTATICAMENTE — validador de período aceita chaves herdadas

`app/api/dashboard/route.ts:27–29` usa `periodo in PERIODOS`. `PERIODOS` é objeto ordinário `lib/dashboard/shared.ts:10–15`; `constructor` e `__proto__` pertencem à cadeia de protótipos e passam no teste, apesar de não serem períodos válidos. Em usuário autenticado com DASHBOARD.VER, `leerDashboard` recebe `dias` indefinido e pode gerar 500 em vez de 400 na geração da data. Não é injeção SQL. Teste `constructor`/`__proto__` deve retornar 400 e 7d/15d/30d/90d devem permanecer válidos. Trocar por teste de propriedade própria/whitelist.

## 4. Observações condicionais — NÃO converter em novas correções sem evidência

- `lib/dashboard/shared.ts:82–89`: lotes vencidos contam `s.cantidad>0` em todos estados/propriedades, enquanto texto fala “retirar del stock disponible”. Alinhar rótulo sem presumir que terceiro/reservado/cuarentena devem ser excluídos da atenção; requer decisão semântica. Não há vazamento sem outra condição.
- `lib/dashboard/shared.ts:94–100,106–109`: soma quantitativos de `movimiento_lineas` de produtos/unidades heterogêneos e mostra “u.” sem discriminar unidades. Investigar semântica com o contrato de unidade-base; não recalcular/normalizar inventário automaticamente.
- `lib/dashboard/shared.ts:52–54,84–85` depende de timezone de sessão PostgreSQL em `current_date`; confirmar parametrização real antes de declarar incorreção de data de Paraguay.
- `Promise.all` no serviço utiliza consultas Pool sem snapshot único; diferenças momentâneas em leitura concorrente são possíveis, mas não reproduzidas no PostgreSQL; não abrir migration/transação como correção presumida.
- `depositosPermitidos` limita a ativos, enquanto histórico Movimientos inclui inativos para consultas históricas; política do Dashboard recente pode ter recorte ativo intencional. Não assumir defeito.
- A especificação visual anterior exigiu sidebar 236/72 px, topo compacto e textos completos. CSS parece refletir a dimensão; não há teste de browser para confirmar corte/foco/zoom. MOBILE deliberadamente fora do escopo; não reabrir NGM-R01-01.
- `T07-reportes-dashboard.sql` valida vistas históricas `v_dashboard_resumen`, não o método atual `leerDashboard`, seus filtros nem ACL. Nenhuma cobertura automatizada dirigida foi executada nesta rodada.

## 5. Ordem de prioridade e autorização

1. **Prioridade de segurança:** F-DASH-06 (ALTA), escopo de Movimientos; pode ser correção isolada e não depende do gate comercial C24.
2. **Gate funcional de Stock:** F-DASH-01/C24 (ALTA) requer regra do responsável antes de mudar universo de produto ou nomes do estoque.
3. **Interações UI:** F-DASH-02, F-DASH-04, F-DASH-05, com testes focais por grupo de arquivos; F-DASH-03 exibição do estado de anulação.
4. **Contrato numérico:** F-DASH-07 (médio/efeito condicional); HTTP validação F-DASH-08 (baixa), correções mínimas.
5. Sem reabrir bugs antigos resolvidos ou redesenhar Dashboard/celular. Não rodar suíte geral/tsc global/Next build/CI manual. Para cada tarefa autorizada: ChatGPT especifica e audita; Claude Code apenas implementa testes focais, commit/push e PARA; responsável aplica/homologa no único ambiente real.

**Nenhum código de aplicação, migration, API, SQL operacional, VM ou configuração foi alterado nesta auditoria.**
