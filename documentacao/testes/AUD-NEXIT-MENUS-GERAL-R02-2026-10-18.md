# AUD-NEXIT-MENUS-GERAL-R02 — Retificação de navegação e aprofundamento do Dashboard

**Data:** 2026-10-18. **SHA de código auditado:** `d1c03b84a2620a23e774017c8919bc3bdfe47b1e`.
**Natureza:** complementação/retificação explícita do relatório histórico `AUD-NEXIT-MENUS-GERAL-R01-2026-10-18.md`. **Não altera o R01**, que registra a triagem inicial.
**Status global:** EM ANDAMENTO; não é auditoria geral final nem homologação em navegador.

## Retificação precisa do achado NGM-R01-02

O R01 comprovou corretamente que o `Sidebar` renderiza sempre um link `/dashboard`, mas **não considerou a camada de layout do Dashboard para administradores de plataforma**, presente em `app/(private)/dashboard/layout.tsx`, linhas 9–15: `if (access.isPlatformAdmin) redirect("/administracion/empresas")`.

Portanto **NÃO** é correto afirmar que o administrador de plataforma chega a Dashboard e vê HTTP 403: o Next.js o redireciona à página Empresas. A afirmação da R01 nesse caso específico fica **RETIFICADA**. O que continua comprovado: o atalho do Sidebar/brand aponta para `/dashboard` quando o único destino operacional permitido da plataforma é Empresas, gerando redirecionamento desnecessário; e, mais relevante, um usuário **empresarial** sem a permissão `DASHBOARD.VER` consegue ver/clicar «Panel general», pois `app/(private)/dashboard/layout.tsx` não testa esse permissionamento (só exclui a plataforma), enquanto `app/api/dashboard/route.ts` linhas 17–23 o exige e retorna 403. Classificação **MEDIA UX/controle de navegação**, **não vazamento de dados**.

**Correção recomendada:** renderizar o destino «Panel general» apenas para quem possui DASHBOARD.VER (ou é admin de empresa), sem conceder o privilégio; para plataforma, a marca aponta diretamente a `/administracion/empresas`. Caso um usuário empresarial não possua acesso ao Dashboard, determinar a landing autorizada pelos módulos efetivos e manter guardas do servidor.

## NGM-R02-01 — MEDIA — Links fixos internos do Dashboard ignoram permissões dos módulos de destino

**Evidência:**
- `app/(private)/dashboard/page.tsx` linhas 55–83 e 212–219: cartões KPI estão corretamente condicionados a `habilitada: !!k?.modulo`. Porém outros CTAs usam `<Link href="/movimientos">` incondicional nas linhas ~234 e ~360, e `<Link href="/stock">` ~413, mesmo quando o painel informa que o ator **não possui permissão** para aquelas seções.
- `app/api/dashboard/route.ts` linhas 33–42 constrói apenas as seções com `hasPermission(access, "MOVIMIENTOS", "VER")` e `hasPermission(access, "STOCK", "VER")`; `lib/dashboard/shared.ts` linhas 62–122 suprime dados sem permissão.
- `app/(private)/movimientos/layout.tsx` usa `guardPage("MOVIMIENTOS","VER")`, gerando 404 para o perfil sem permissão. O link do Dashboard oferece uma ação que não pode funcionar para esse usuário. A existência do endpoint protegido é adequada.

**Impacto:** usuários com `DASHBOARD.VER` mas sem `MOVIMIENTOS.VER` ou `STOCK.VER` veem «Ver movimientos» / «Ver stock» e entram em páginas não autorizadas. A UI dá uma indicação de acesso que o backend contradiz; não constitui bypass de permissão.

**Correção esperada:** ocultar/desabilitar CTA para módulo não autorizado, usando a disponibilidade real já presente em `datos`/contexto; nunca conceder permissões extras. Teste focado com perfil limitado.

## Matriz cumulativa após retificação

| ID | Escopo | Gravidade | Situação |
|---|---|---|---|
| NGM-R01-01 | Menu móvel nunca abre sob ≤1024px | **ALTA** | Aberto; evidência de código confirmada |
| NGM-R01-02 | Link Dashboard visível para perfil empresarial sem DASHBOARD.VER; link da marca da plataforma redireciona via Dashboard | **MEDIA** | Aberto em navegação; **parcela «plataforma recebe 403» retificada** |
| NGM-R01-03 | Dashboard mostra KPIs anteriores sob filtro atual após falha de nova carga | **MEDIA** | Aberto; evidência de código confirmada |
| NGM-R01-04 | Confirmações nativas dispersas em operações críticas | **MEDIA (UX)** | Aberto; linhas e locais no R01 |
| NGM-R02-01 | Dashboard expõe CTAs para módulos sem permissão | **MEDIA** | Novo, aberto |

**Total confirmado no corte transversal A até R02:** cinco achados de navegação/UX, 1 ALTA e 4 MÉDIOS, sem alegação de falha fiscal/segurança não demonstrada.

## Escopo restante, não encerrado

A inspeção inicial fez inventário de **38 páginas** e **94 rotas API**, mas uma auditoria realmente linha-a-linha exige analisar componente, API real, serviços, SQL, permissões e testes por cada um dos **21 hrefs V1** mais Dashboard/Empresas. A primeira rodada de Dashboard foi mais profunda do que a triagem, porém nem ela constitui homologação de API no PostgreSQL. Os módulos Maestros, Inventario, Facturación e Reportes continuam **PENDENTES DE REVISÃO EXAUSTIVA**, mesmo que tenham sido inspecionados estruturalmente. Não entregar comandos genéricos ao Claude nem executar suíte global/VM/DB por causa da auditoria.

**Próxima continuidade:** completar a etapa A com cada dependência Dashboard/shell/perfil e então abrir auditorias por grupo B (Maestros), C (Inventario), D (Facturación), E (Reportes), F (fechamento). Os documentos antigos de auditoria por menu são fontes históricas, não homologações.
