# AUD-NEXIT-REVALIDACAO-22-MENUS-E-ESCOPO-R01 — Consistência da auditoria desktop e risco de alterações desnecessárias

**Data:** 18/10/2026  
**Projeto exclusivo:** NEXIT / ERP DistribuNex, repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. **NÃO** usar `proceit-tech/proceit-factunex`: produto distinto.  
**Parecer:** REVISÃO DOCUMENTAL/ESTÁTICA DE CONSISTÊNCIA — não equivale a reauditoria linha a linha completa de 22 módulos, testes de navegador ou homologação. **Nenhuma alteração funcional/rollback autorizado por este documento de forma automática.**

## 1. Fontes efetivamente rechecadas nesta rodada
- `CLAUDE.md`; `documentacao/PROTOCOLO-IA.md`; `PROGRESSO-NEXIT-V1.md` (auditorias desktop e etapas C01–C03); `lib/navigation/menu.ts`; `components/layout/sidebar/sidebar.tsx`; `lib/auth/permissions.ts`; guards de Clientes, Productos, Depósitos, Catálogos comerciales e Facturas.
- `documentacao/v1/PLANO-EXECUCAO-CORRECOES-AUDITORIAS-DESKTOP-V1-2026-10-18.md`; `AUD-NEXIT-MENUS-GERAL-R01/R02`; auditorias de Dashboard, Depósitos, Notas de crédito; resumo/índice individual dos 22 menus em PROGRESSO. Esta rodada **não** reabriu integralmente todas as telas, APIs, `lib/**`, migrations nem executou testes.
- Metadados/diffs dos commits funcionais iniciais e residuais de C01 (aeaec74 / ab4cb5d), C02 (c1d1ee4 / f2c9d27), C03 (d9f8595 / 6f70d0e). Comparação `6f70d0e...feature/NEXIT-2026-001-banco-demo`: **4 commits posteriores, apenas** `PROGRESSO-NEXIT-V1.md`, auditoria C03-R03, plano e ficha NCE; nenhum arquivo funcional nessa diferença.

## 2. Controle dos 22 menus ativos da V1 — não duplicar nem executar tarefas em lote

| # | Menu (rota) | Auditoria/pendências existentes; status da revalidação de escopo |
|---|---|---|
| 01 | Panel general (`/dashboard`) | F-DASH-01/05 documentados; F-DASH-01 e C24 dependem de política de visibilidade de produto. CTAs/permissões C17 e estados C36. Mobile fora do escopo. |
| 02 | Clientes (`/clientes`) | CLI-D01/02 (RBAC, conferir contrato CREAR sem VER), CLI-D03 (geografia assíncrona); riscos condicionais não converter em correção automática. |
| 03 | Proveedores (`/proveedores`) | PRV-D01/02 (RBAC, mesmo gate), PRV-D03 (erro geográfico). Preservar retomada de alta/anexos e correções históricas. |
| 04 | Productos (`/productos`) | PRD-D03 concorrência/lost update, PRD-D02/04 retomada de anexos, D06 rascunho; D01/05 política RBAC. Não mudar regras SIFEN/IVA/código. |
| 05 | Catálogos de productos (`/productos/catalogos`) | CAT-D01 concorrência formulário/aba e CAT-D02 aviso de erro; preservar hierarquia Categoría→Familia→Línea, Marca independente. |
| 06 | Listas de precios (`/listas-precio`) | LPR-D01/02 gate RBAC; D03 estados/vigência e D04 falha catálogo obrigatório. Custo médio visível exige decisão, não remoção arbitrária. |
| 07 | Catálogos comerciales (`/catalogos-comerciales`) | CC-D02 mutação/troca de aba; CC-D01 gate RBAC; CC-D03 falha condicional de contrato de moedas, não ocorrência comprovada da API atual. |
| 08 | Stock (`/stock`) | STK-D01/C24 **gate negocial** de catálogo visível vs saldo autorizado; D02 variável de moeda global; D03 snapshot não reproduzido. Preservar leitura sem escrita. |
| 09 | Movimientos (`/movimientos`) | MOV-D01 troca de intenção/chave durante POST é risco prioritário; D02 resultado antigo sob filtro e D03 data virada PY. Preservar motor NEX-014/idempotência. |
| 10 | Depósitos (`/depositos`) | DEP-D01 alteração de formulário durante mutação; D02/D04 **gate RBAC C16**; D03/D05/06/07/08 melhorias com severidades já relatadas, observações de DB não comprovadas. |
| 11 | Reposición (`/reposicion`) | REP-D01/03 coerência da simulação/recarga; REP-D02 **gate** semântica simulação individual × origem compartilhada; D04 snapshot ainda não comprovado. |
| 12 | Reportes operativos (`/reportes`) | RPT-D01/02 compartilhados entre os cinco relatórios: correção/contagem UMA VEZ (C10); D03 texto informativo. |
| 13 | Stock general (`/reportes/stock-general`) | SG-D01/D02 são RPT-D01/D02; SG-D03 agrupamento por nome em lugar de UUID demanda teste focal; não duplicar ticket transversal. |
| 14 | Valorización (`/reportes/valorizacion`) | VZ-D01/D02 herdados; D03/D04 rótulos/alcance; preservar custos registrados e snapshot já existente. |
| 15 | Kardex (`/reportes/kardex`) | KDX-D01/D02 herdados; D03/04 identificação/usuários por escopo e D05 texto; preservar livro imutável e cálculo histórico. |
| 16 | Stock crítico (`/reportes/stock-critico`) | SC-D01/D02 herdados; D03/04 exportação e custo ausente; D05 rótulo. Não alterar motor operacional Reposición por conta do relatório. |
| 17 | Lotes y vencimientos (`/reportes/lotes`) | LOT-D01/D02 herdados; D03 contador antes de resposta válida; JOIN lote/modo observacional não é bug comprovado. |
| 18 | Documentos electrónicos (`/documentos`) | DOC-D01 invalidar listagem/ações antigas; D02/03/04/06/07/08 com evidência de código; D05 snapshot sem reproduzir; X01–X08 são funcionalidades novas sob gates, NÃO correções automáticas. |
| 19 | Facturas (`/facturas`, `/facturas/nueva`) | FAT-D02/C01 e FAT-D01/C02 **aprovados apenas estaticamente** após R03, não reabrir/reverter sem regressão específica; D03 recuperação, D04 snapshot condicional, D05 data PY; C32 apresentação fiscal é projeto com desenho próprio. |
| 20 | Puntos de expedición (`/facturacion/puntos`) | PUN-D01 estado por tipo, D02 série esgotada, D03 refresh; **não** desfazer NEX-063/064/065 nem presumir NEX-065 aplicada na VM. |
| 21 | Notas de crédito (`/notas-credito`) | NCE-D01/C03-R02-01 **corrigido estaticamente** no SHA `6f70d0e`; C03-R03-01 **MÉDIA ainda aberta** (aviso de proposta A pode permanecer sobre cliente B); D02/03/04 seguem pendentes. Preservar a reversão anterior de R04-01 Innominado e a restrição SOMENTE na seleção UI. |
| 22 | Administración → Facturación electrónica (`/configuracion/facturacion-electronica`) | CFG-D01 concorrência SQL requer teste focal antes de alegar falha real; D02/03/04 UI/consistência; **não** confundir com emissão em Facturas, não alterar gestão de credenciais por suposição. |

**Fora dos 22:** Plataforma → Empresas (`/administracion/empresas`) requer auditoria própria; menus em `NAVIGATION_GROUPS` ausentes de `V1_HREFS` são itens previstos/ocultos, **não** módulos V1 implementados a corrigir; Dashboard é entrada adicional já contabilizada. Nenhuma tela V1 é homologada por esse inventário.

## 3. Correções de interpretação obrigatórias antes de enviar Claude

1. **ERP somente DESKTOP:** NGM-R01-01 (menu mobile ≤1024) está formalmente retirado do escopo. Não criar tarefa, teste E2E mobile, CSS/hambúrguer ou rollback de recursos desktop baseado nesse achado. A auditoria histórica R02 tem uma tabela antiga marcada 'aberto', supersedida pela decisão posterior em Dashboard e PROGRESSO.
2. **CREATE-only e VIEW-only:** no código `lib/navigation/menu.ts`, itens de Maestros exigem `VER`, e layouts como Clientes/Productos requerem `VER`; `hasPermission` não implementa implicação universal CREAR⇒VER. A divergência entre CRUD backend e navegação é REAL, mas **se um usuário com somente CREAR deve entrar em tela de alta sem VER é questão de contrato RBAC**. Os itens C11–C16 devem confirmar decisão expressa, privilégios mínimos/visibilidade, retorno pós-alta e cenários reais antes de ampliar acesso. Não afrouxar ACL nem devolver catálogo mais amplo por suposição.
3. **Stock e Dashboard:** diferenciação entre produto pertencente à empresa e visibilidade conforme depósitos é gate C24. Não trocar joins/filtros nem rotular 'vazamento comprovado' sem validar política e autorização; impedir exibição de saldo/custo fora do alcance, mesmo se produto globalmente pesquisável.
4. **Snapshots e transações:** STK-D03, REP-D04, DOC-D05, FAT-D04, DEP-O03 e CFG-D01 são hipóteses de concorrência/consistência não reproduzidas em PG. Permanecem alvo de teste dirigido/decisão, **não** prova de que todo módulo precisa transação nova ou migration.
5. **UX:** confirmações por `window.confirm/alert` não viram automaticamente falhas de segurança; avaliar custo/necessidade do padrão desktop aprovado por ação crítica. C55 não autoriza redesign global nem adoção de suporte mobile.
6. **Fiscal:** preservar NCE Innominado bloqueado APENAS na busca/seleção de cliente na UI; não voltar a introduzir R04-01 no fluxo de correção de NCE rejeitada, nem veto novo na API/SQL. FE/NCE, numeração por tipo, CDC, gateway e migrations têm decisões próprias no Git. FactuNex é produto separado.
7. **Sem rollbacks em massa:** correções C01/C02/C03 foram feitas para condições de corrida concretas em Facturas/NCE e têm testes dirigidos relatados. A confusão entre nomes de repositório ocorreu em conversa posterior e **não produziu commit funcional** na branch NEXIT após `6f70d0e`; logo nenhum revert dessas correções é justificado por ela. Reversão somente com diff e evidência da alteração indevida específica, preservando outros hunks do commit e migrations aplicadas.
8. **Documento de plano é histórico cumulativo:** a linha da tabela C01 que diz 'PRIMEIRA E ÚNICA AUTORIZADA AGORA' foi escrita antes das autorizações posteriores. A autoridade atual é cronologia das seções 8–13 e PROGRESSO: C01/C02 executados e estaticamente aprovados, C03 executado mas C03-R03-01 aberto; **C04 NÃO AUTORIZADA**.

## 4. Critérios obrigatórios de rechecagem para Claude (AUDITORIA, não implementação automática)

Para cada item do quadro, ler auditoria original e regra aprovada, localizar linha atual de tela→API→serviço→SQL/permissão, comparar com SHA da auditoria e último commit, classificar **CONFIRMADO / JÁ CORRIGIDO / EXIGE DECISÃO / CONDICIONAL SEM PROVA / FALSO POSITIVO / SEM EVIDÊNCIA**. Em caso de falso positivo, indicar texto do requisito, trecho real e razão. Repetições RPT-D01/D02 e NCE/Puntos contam uma vez; não criar chamados duplicados. Descrever patch mínimo de reversão **apenas se uma alteração indevida for comprovada**, incluindo teste de não regressão, autorização humana de aplicação e risco de migração. Não tratar mudanças meramente documentais como alteração do sistema.

Ordem de verificação: 22 módulos acima + Plataforma/Empresas separado; confrontar escopo V1, menu e funcionalidades ocultas; depois lista de ações C01–C55, gates e X01–X08. Todo menu marcado 'revisado' neste registro significa somente confronto documental da auditoria anterior e amostra de código/transversal; falta reexecução profunda linha a linha de cada fluxo. Não alegar auditoria exaustiva concluída. Nenhuma autorização para executar C04 ou tarefas seguintes só por existir plano.

**Testes desta revalidação por ChatGPT:** 0 (somente leitura de GitHub). **Nenhum SQL, PostgreSQL, VM, Docker, gateway, navegador, deploy, alteração funcional ou rollback realizados.**