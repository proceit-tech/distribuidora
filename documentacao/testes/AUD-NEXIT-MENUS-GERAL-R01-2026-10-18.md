# AUD-NEXIT-MENUS-GERAL-R01 — Auditoria geral multi-menu, inventário atualizado e achados transversais

**Data:** 2026-10-18.
**Snapshot imutável auditado:** `d1c03b84a2620a23e774017c8919bc3bdfe47b1e` (branch `feature/NEXIT-2026-001-banco-demo`, tree `a6ffbd38bd07a6cce3f44017e518e48605e2eb67`).
**Pedido do responsável:** revisar TODOS os menus do NEXIT, linha a linha, incluindo interface, funções, APIs, permissões, regras e persistência.
**ESTADO DA AUDITORIA:** **EM ANDAMENTO — ESTA R01 É SOMENTE INVENTÁRIO E PRIMEIRA PASSAGEM TRANSVERSAL, NÃO A REVISÃO EXAUSTIVA CONCLUÍDA.** Não apresentar como 100%, aprovada ou homologada.

## 1. Fontes e método desta rodada

Consultados na branch atual: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trecho atual do `PROGRESSO-NEXIT-V1.md`, `lib/navigation/menu.ts` (422 linhas), `components/layout/sidebar/sidebar.tsx` (352 linhas), `components/layout/sidebar/sidebar.module.css` (550 linhas), `components/layout/app-shell/app-shell.tsx` e CSS, `app/(private)/layout.tsx`, `lib/auth/server-context.ts`, `lib/auth/permissions.ts`, `app/api/dashboard/route.ts`, `app/(private)/dashboard/page.tsx`, `app/(private)/administracion/layout.tsx`, várias páginas de cada grupo, documentação histórica `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md` e `documentacao/v1/auditoria-por-menu/README.md`.

**Inventário GitHub confirmado por árvore recursiva (não truncada):** 1.135 entradas, **38** `app/(private)/**/page.tsx`, **94** `app/api/**/route.ts`, além de componentes, serviços, migrations e testes. Foram **enumeradas e inspecionadas de forma estrutural as 38 páginas e as 94 rotas API** (assinaturas, chamadas, presença aparente de guard, fluxos e pontos suspeitos). Isso **NÃO** significa que cada linha de todos os 94 handlers, serviços ou SQL tenha recebido auditoria semântica integral, e tampouco uma validação da execução. Algumas APIs delegam controles a helpers; a falta da palavra `guardApi` no arquivo de rota **NÃO** comprova falta de autenticação. Para cada menu, a auditoria posterior deve acompanhar API → serviço → SQL e testes com casos positivos/negativos.

**Mapa efetivamente exibido na V1 (`V1_HREFS` com 21 rotas):**
- Maestros (6): Clientes; Proveedores; Productos; Catálogos de productos; Listas de precios; Catálogos comerciales.
- Inventario (4): Stock; Movimientos; Depósitos; Reposición.
- Facturación (4): Documentos electrónicos; Facturas; Puntos de expedición; Notas de crédito.
- Reportes (6): Reportes operativos; Stock general; Valorización; Kardex; Stock crítico; Lotes.
- Administración empresarial (1): Facturación electrónica (configuração de gateway).
- Fora dos `V1_HREFS`: **Panel general** é link fixo do Sidebar; usuário de plataforma recebe **Empresas** pela árvore separada. Assim há até **23 entradas** com o contexto apropriado, embora não todas simultaneamente para um mesmo perfil.

**Atenção ao escopo:** os itens definidos mas ocultos (Compras/Recepciones, Ventas, Finanzas, Remisión, Monitor, etc.) não são considerados implementados. `app/(private)/recepciones/layout.tsx` retorna `notFound()` por design; telas legadas de recepção ainda contêm mocks mas **não estão disponíveis** na V1, portanto isto não é classificado como vazamento ou módulo entregue.

## 2. ACHADOS CONCRETOS DESTA PRIMEIRA PASSAGEM

### NGM-R01-01 — ALTA — Sidebar inacessível em telas ≤1024px

**Código:** `components/layout/app-shell/app-shell.tsx`, ~linhas 23–66; `components/layout/sidebar/sidebar.tsx`, ~linhas 105–127; `components/layout/sidebar/sidebar.module.css`, linhas 517–539.

**Prova:** AppShell declara `const [mobileOpen,setMobileOpen] = useState(false)` e apenas passa `setMobileOpen` como `onMobileOpenChange` ao Sidebar. Dentro do Sidebar, a callback só aparece para **fechar** o overlay quando `mobileOpen` já é true, ou em um efeito de troca de pathname que define false. Não existe botão que chame `onMobileOpenChange(true)` nem outro acionador de abertura. Sob `@media(max-width:1024px)`, a sidebar é fixa e fica em `transform: translateX(-100%)`; somente a classe `.mobileOpen` a exibe. Portanto um usuário em tablet/celular não consegue abrir o menu pela interface.

**Impacto:** impede a navegação a todos os módulos em viewport responsivo, inclusive listas, cadastros e faturamento. Não é defeito do conteúdo dos módulos.

**Correção esperada:** botão de menu visível/atingível no AppShell no breakpoint móvel, com `aria-label`/`aria-expanded`, abertura efetiva, close via overlay/Escape/navegação, foco consistente e sem sobreposição de edição de formulários. Teste **focal** de abrir/fechar e passagem 1024↔1025, sem tsc global. **Sem mudança de autorização backend**.

### NGM-R01-02 — MEDIA — Dashboard indevidamente oferecido para usuários sem `DASHBOARD.VER` e administradores de plataforma

**Código:** `components/layout/sidebar/sidebar.tsx`, ~linhas 132–187: link `/dashboard` sempre renderizado, independentemente de `navigation`; marca `<Link href="/dashboard">` ~137. `lib/navigation/menu.ts` ~409–421 separa plataforma de módulos por permissão; `lib/auth/permissions.ts` ~63–75 define `hasPermission` como false para `isPlatformAdmin`; `app/api/dashboard/route.ts` ~17–23 exige `DASHBOARD.VER`.

**Prova:** um usuário de perfil sem DASHBOARD.VER vê «Panel general» e o link da marca, mas o GET da API responde HTTP 403. Um administrador de plataforma só deve navegar pelo menu «Empresas» e `hasPermission` para módulo operacional será sempre false, logo sua tela Dashboard não dispõe de dados autorizados. Isto é **incoerência da navegação**, não vazamento de dados (a API bloqueia).

**Correção esperada:** resolver permissão e destino inicial do menu/brand no servidor ou no contexto do shell; ocultar Dashboard ou redirecionar a destino autorizado (`/administracion/empresas` para plataforma; dashboard somente se permissionado). Cobrir empresa administradora, perfil restrito e plataforma. Não conceder `DASHBOARD.VER` artificialmente.

### NGM-R01-03 — MEDIA — Dashboard mantém KPIs do filtro anterior após erro da nova consulta

**Código:** `app/(private)/dashboard/page.tsx`, ~linhas 102–151, 163–185: `useEffect` altera `cargando`/`error`, requisita `cargarDashboard(periodo,depositoId)`; no `catch`, registra erro mas **não descarta nem distingue `datos` previamente carregados**. O período exibido vem do filtro atual, mas `tarjetas=armarTarjetas(datos)`, `serie=datos?.serie` continuam com resposta anterior.

**Sequência verificável por código:** abrir último 7 dias (carga OK), trocar para 90 dias ou outro depósito (falha de rede/API) → cabeçalho/filtro aponta novo período e mostra erro, porém cartões/gráfico ainda representam o período antigo, sem etiqueta de stale. A interface expõe dados comerciais fora do contexto do filtro selecionado. O controle assíncrono `activo` impede respostas após cleanup, mas não resolve representação de dados antigos.

**Correção esperada:** diferenciar estado de dados pertencentes ao filtro realmente carregado, limpar dados quando alterar consulta ou marcar os dados antigos explicitamente com seu filtro original, impedir interpretação como valores atuais; teste focado com sucesso A → erro B e carregamento atrasado.

### NGM-R01-04 — MEDIA (padrão visual) — Confirmações destrutivas por `window.confirm` e alertas nativos, contrariando padrão profissional

**Provas por arquivo/linha (GitHub atual):**
- `app/(private)/clientes/nuevo/page.tsx`: `window.confirm` nas linhas ~989, 1148, 1192 e 1264; `window.alert` ~2128 (fechamento de alta inicial, descarte/ações relacionadas a documentos).
- `app/(private)/productos/catalogos/page.tsx`: `window.confirm` ~122, 293 (descartar e inativar catálogo).
- `app/(private)/catalogos-comerciales/page.tsx`: `window.confirm` ~116, 294, 320 (descarte, ativação, anulação de cotação).
- `app/(private)/depositos/page.tsx`: `window.confirm` ~83, 228, 266 (descarte, alcance de usuários e inativação).
- `app/(private)/movimientos/[id]/page.tsx`: `window.confirm` ~79 na **anulação crítica e irreversível** de movimento com reversão de estoque/custo.
- `app/(private)/documentos/page.tsx`: `window.confirm` ~229 no reenvio de documento fiscal rejeitado.

**Impacto:** UX e acessibilidade inconsistentes com os formulários/modais NEXIT, especialmente em operações críticas. O uso de `window.confirm` em si **não prova bypass** de confirmação; a confirmação existe, apenas não segue o padrão. Priorizar movimentos fiscais/estoque e anulação de cotação/reenvio sem reduzir avisos, permissões, confirmação e proteção idempotente.

**Correção esperada:** padronizar o modal acessível reutilizável e explicitar consequência e ação, preservando decisão Cancelar/Confirmar, foco e testes leves por menu. Não usar este achado para alterar regras, SQL ou rotas de API em massa.

## 3. RESULTADO PRELIMINAR E COBERTURA REAL

- **Confirmados:** quatro achados transversais acima, dos quais um ALTO e três MÉDIOS. Sem afirmação de que não existam outros.
- **Estruturalmente varridos nesta rodada:** árvore real, 38 telas, 94 arquivos de rotas API, shell/sidebar, autenticação base e casos emblemáticos de Dashboard/Maestros/Inventário/Facturación/Reportes e Plataforma. Ausência de `guardApi` em um arquivo de rota **não foi classificada** como falha: há handlers que reexportam ou chamam serviços autorizados.
- **Ainda NÃO realizada:** auditoria linha-a-linha exaustiva de cada fluxo de cada menu, componentes internos grandes (`clientes/nuevo` sozinho possui 2813 linhas), implementações reais de 94 rotas API, serviços `lib/**`, SQL/migrations atuais, matrizes de permissões por ação, casos negativos de tenancy, conflitos concorrentes, documentação de testes e screenshots por módulo. Essas lacunas impedem qualquer nota «10/10», «sem erros» ou «auditoria geral concluída».
- **NÃO executado:** suíte global, build/tsc global, API real, VM, PostgreSQL, SIFEN, browser. Não foram modificados código, workflows, permissões, migrations ou dados reais.
- **Sem comando genérico para Claude:** esta R01 abre a auditoria e fornece defeitos reais. Claude só implementa correções bem delimitadas depois de decisão do responsável.

## 4. Plano de auditoria exaustiva por menus, sem recomeçar diagnósticos antigos

Cada etapa aprofunda **página + componentes + API/guards + lib/SQL + requisitos + testes** e adiciona evidência por linha. Fichas antigas `documentacao/v1/auditoria-por-menu/AUD-*-V1.md` são históricas e abertas, **não** constituem aprovação. Novas rodadas devem citar SHA fixo e achados verificáveis.

| Ordem | Módulos | Critério de saída |
|---|---|---|
| A | Shell, Dashboard, Plataforma/Empresas, permissões e menu de acesso | mapa real de ações, acesso plataforma/perfil, responsividade, scripts e testes direcionados |
| B | Maestros: Clientes, Proveedores, Productos, Catálogos de productos, Listas de precios, Catálogos comerciales | campos e validações comparados com serviços e PostgreSQL; API create/edit, integração fiscal e testes |
| C | Inventário: Stock, Movimientos, Depósitos, Reposición | alcance, lotes, reservas, transações, anulação, custo, concorrência |
| D | Facturación: Documentos, Facturas, Puntos, NCE, gateway/configuração | idempotência, FE/NCE SIFEN, séries/CDC, retries, estados, permissões, migrações e testes |
| E | Reportes operativos, Stock general, Valorización, Kardex, Stock crítico, Lotes | agregações, filtros, exportação, segurança, ordenação e consistência de totais |
| F | Auditoria de fechamento: rotas API compartilhadas, fluxos cruzados, navegação, evidência por menu, lacunas e priorização | somente depois de todas as etapas completas, emitir parecer final estático; homologação de navegador continua humana |

**IMPORTANTE:** o pedido é de revisão profunda, não de reimplementar o ERP. O índice do Git e a triagem transversais desta R01 não substituem as etapas A–F. A extensão do código exige documentação incremental honesta e verificável.
