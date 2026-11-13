# AUDITORIA-ENTREGAS-NEXIT-V1 — o que existia, o que foi feito, o que falta

**Data:** 2026-10-09 · **Base auditada:** `origin/feature/NEXIT-2026-001-banco-demo` @ `f02eb8c` (inclui os commits feitos diretamente no GitHub). **Método:** histórico Git (`git log`, autoria por caminho), leitura dos arquivos, execução da bateria SQL em PostgreSQL 16 descartável. **Limites:** não tenho acesso à VM nem à aplicação publicada — tudo sobre a VM é *informação relatada*. `npm ci`/`tsc`/`next build` **não puderam ser executados** nesta sessão (o npm falhou com erro interno ao instalar dependências), portanto **TypeScript, lint e build NÃO foram validados por mim**.

**Nota sobre autoria:** o Git só mostra duas identidades: `Claude` e `PROCEIT`. `PROCEIT` é a conta do proprietário; **não é possível saber pelo Git** se um commit dessa conta foi escrito por ele, por outra IA ou por outra ferramenta. Onde isso importa está marcado *(autoria não identificável além da conta)*.

## 1. O que já existia antes de eu começar (fornecido por você)
- **Toda a aplicação Next.js** (`app/`, `components/`, `lib/`, `types/`): commit inicial 2026-08-24 "Versão inicial DistribuNex" e evoluções até 2026-09-18 (Vercel, logout demo, Excel no Stock). Todas as telas, os mockups (`lib/mocks/*`), a sessão demo, o menu (`lib/navigation/menu.ts`), as 3 APIs (`clientes`, `productos`, `proveedores`) e a de login/logout.
- **SQLs históricos** 001–017 e 022–025 (arquivados em `fontes-historicas/` por commits da conta PROCEIT), mais a documentação de definição (REQ-2026-001/002, INFRA-2026-001).
- Em 2026-10-09, **commits diretos seus no GitHub** (autoria não identificável além da conta): NEX-016, login multiempresa sem credenciais precarregadas, empresa autenticada no shell, Dockerfile/.dockerignore/standalone, ajustes do fluxo de implantação (`nexit-banco-deploy.yml`, `nexit-db-remote.sh`), padrão `PROCEIT-STD-DEPLOY-…`, `PROCEIT-CASA-MINGO-NEX-016.md`.

## 2. O que eu realmente criei
Apenas **documentação, SQL, scripts, testes e workflows** — **nenhum commit meu altera `app/`, `lib/`, `components/`, `types/`, `Dockerfile` ou `next.config.ts`** (verificado: `git log --author=Claude -- app lib components types Dockerfile` = 0).
- `documentacao/banco/nexit/v1/`: migrations **NEX-001…NEX-015**, seeds S-001/002/003, scripts (runner, bateria, inicialização de empresa, reset de senha, verificação), testes T01–T11, ferramentas de compatibilidade, docs 01–07, `implantacion/vm/nexit-db-remote.sh` (versão original) e os workflows `nexit-banco-ci.yml`/`nexit-banco-deploy.yml` (versão original).
- Relatórios: análise V1, plano, TST-001, TST-002, relatório final, definições D-C1…D-C9 (branch REQ-2026-003).

## 3. O que apenas reorganizei, adaptei ou corrigi
- Os 20 SQLs históricos foram **mantidos sem alteração** (arquivados por você; eu só os comparei e os li).
- NEX-001…015 foram **derivadas do código implantado** (nomes de tabelas/colunas que as 3 APIs e `lib/auth` consultam) e das propostas P001–P007 da branch REQ-2026-003 — **não são uma tradução dos SQLs históricos**; reaproveitam conceitos e regras (cadastros SIFEN, geografia PY, listas, kits). Os SQLs 010 e 023 fornecidos por você referenciam `depositos.empresa_id`, coluna inexistente na 001, que **não** foram portados.
- Nesta rodada corrigi **duas falhas da minha própria bateria** causadas por mudanças posteriores: T01 esperava exatamente 15 migrations (NEX-016 a quebrou) e uma frase minha no doc 07 repetia o literal proibido pelo verificador de segredos. Resultado após correção: **320 PASS, 0 falhas** (a bateria não cobre NEX-016 além de "registrada com checksum").

## 4. Migrations: novas × derivadas
| Migration | Origem |
|---|---|
| 001–017, 022–025 históricas | fornecidas por você; **não executadas na V1**; 003 e 018–021 não localizadas no GitHub |
| NEX-001…013 | **criadas por mim**, derivadas do código da app + propostas P001–P007 |
| NEX-014, NEX-015 | **criadas por mim** nesta V1 (movimentos operativos; empresa real) |
| NEX-016 | **sua** (administradores de plataforma); *autoria não identificável além da conta PROCEIT*; não passou por testes meus |
Segundo você, NEX-001…016 estão instaladas na VM (relatado, não verificado).

## 5. APIs que funcionam com PostgreSQL (por leitura de código; **não testadas contra a app rodando**)
| API | Evidência | Observações |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout` | usa `empresas`, `usuarios`, `crypt()` bcrypt, `sesiones_usuario`, `eventos_seguridad`, bloqueio por 5 falhas | real; você relata que PROCEIT autentica |
| `GET/POST /api/clientes` | consulta/grava com `empresa_id` da sessão | **única tela que a chama:** `clientes/nuevo`. F-01 (`$32::uuid`) segue aberto |
| `GET/POST /api/productos`, `GET/POST /api/proveedores` | idem | **nenhuma tela as chama** |
Não existe nenhuma API de: PUT/DELETE de cadastros, listas de preços, movimientos, stock, ventas al costo, reportes, dashboard, XLSX, administração global. **Nenhuma API verifica permissão:** `userHasPermission` (`lib/auth/permissions.ts`) não é chamado por ninguém; as APIs só exigem sessão válida.
Defeito grave de política: as 3 APIs de cadastro têm `DEMO_MODE = DEMO_MODE==="true" || !DATABASE_URL` — **sem `DATABASE_URL` respondem com dados vazios/201 fictício** em vez de falhar (contraria "não substituir erro de conexão por dados fictícios").

## 6. Telas que ainda usam mock, localStorage, dados fixos ou funções simuladas
| Tela | Fonte atual |
|---|---|
| `clientes` (lista, detalhe `[id]`) | `obtenerClientesDemo()` / localStorage |
| `proveedores`, `productos`, `listas-precio` (lista, nuevo, detalhe, formulários) | `lib/mocks/*-storage` (localStorage) |
| `movimientos` (lista, nuevo, detalhe) | `obtenerMovimientosStockDemo()` |
| `stock` (lista, detalhe, **exportação Excel**) | `obtenerStockDemo()`; markup fixo 20 % `MARKUP_DEMO`; rótulo "VALOR VENTA DEMO" |
| `dashboard` | KPIs e gráficos **literais no arquivo** (Gs. 48.650.000 etc.) + etiqueta DEMO |
| `facturas`, `recepciones` (fora do escopo V1) | mocks |
| `lib/auth/demo-session.ts`, `session.ts` | sessão/usuário demo com `DEMO_MODE=true`; `getShellContext` ainda cai em `"casa_mingo"`/`"CASA MINGO S.A."` fixos no modo demo |
| Menu (`resolveNavigation`) | `permissions: []` ⇒ comentário "Para el mockup: si no recibimos permisos, mostramos todo el menú" — **todos veem tudo**; 24 destinos do menu **não têm página** (incl. `/administracion/*`, `/reportes`, `/ventas`) |
| "Administrador null" | causa provável (não reproduzida): `${nombre} ${apellido}` com `apellido` NULL em `server-context.ts` |

## 7. Matriz por módulo
| Módulo | Tela existente | API existente | PostgreSQL conectado | CRUD real | Estado | Pendências |
|---|---|---|---|---|---|---|
| Login e empresas | sim | login/logout | sim (leitura de código; relatado funcionando p/ PROCEIT) | n/a | **PARCIAL** | menu não filtra por perfil; "Administrador null"; sem troca de senha; sem teste CASA MINGO; `DEMO_MODE` ainda existe |
| Clientes | lista/detalhe mock; `nuevo` real | GET/POST | só `nuevo` e catálogos | só criar | **PARCIAL** | lista, detalhe, edição, inativação reais; F-01; permissão no backend |
| Proveedores | mock | GET/POST (sem tela) | API sim, tela não | não | **PARCIAL** | ligar telas; PUT; permissões |
| Productos | mock | GET/POST (sem tela) | API sim, tela não | não | **PARCIAL** | idem |
| Listas de precios | mock | não | não (tabelas NEX-008 existem) | não | **NÃO IMPLEMENTADO** | API + telas |
| Movimientos | mock | não | não (funções NEX-014 existem) | não | **NÃO IMPLEMENTADO** | API sobre `inventario_registrar_movimiento` |
| Stock | mock + Excel | não | não (views existem) | não | **NÃO IMPLEMENTADO** | API, kardex, XLSX real |
| Ventas al costo | não | não | não | não | **NÃO IMPLEMENTADO** | fonte da venda pendente de decisão (doc 06) |
| Reportes / XLSX | só Excel sobre mock no Stock | não | não | não | **NÃO IMPLEMENTADO** | views existem; falta API e geração |
| Dashboard | sim (fixo) | não | não | n/a | **NÃO IMPLEMENTADO** | views `v_dashboard_*` existem |
| Administração global | não | não | tabela `administradores_plataforma` existe | não | **NÃO IMPLEMENTADO** | telas e API de empresas/usuários |
Nenhum módulo atende "COMPLETO" (leitura + gravação + persistência demonstradas ponta a ponta).

## 8. Testes que realmente executei
- Bateria SQL em PG16 descartável: **320 PASS, 0 falhas** (migrations 001–016 do zero, idempotência, checksum, isolamento entre 2 empresas, permissões, custo médio, concorrência, backup/restore, `nexit_runtime`, DEMO, compatibilidade das 66 consultas por `PREPARE`). Detalhe: `documentacao/testes/TST-NEXIT-2026-002-banco-v1.md`.
- Ensaio local do script de implantação (modo `local`).
- **Limitações:** nenhum teste executou a aplicação Next.js; nenhum E2E; nenhuma chamada HTTP; typecheck/lint/build não executados; workflows nunca rodaram por mim; modo `docker`, `gs://`, SSH real não testados; nenhum teste de CASA MINGO vs PROCEIT *na aplicação*. NEX-016 não tem teste próprio meu. A aplicação publicada hoje usa, segundo o relato, o usuário `nexit_app`; a política `nexit_runtime` (sem escrita direta em estoque) **ainda não está em uso** pela app.

## 9. Integrações que faltam para a V1 funcional
(1) filtro de menu e verificação de permissão no backend em toda API; (2) administração global (empresas/usuários/perfis); (3) telas de cadastros ligadas às APIs e CRUD completo; (4) APIs/telas de listas de preços; (5) APIs/telas de movimentos e stock sobre as funções NEX-014; (6) relatórios/XLSX/dashboard sobre as views; (7) remover mocks do modo real e o fallback `!DATABASE_URL`; (8) trocar a conexão da app para `nexit_runtime` (autorização sua); (9) testes de integração/E2E, isolamento e permissões; (10) decisões de negócio pendentes (doc 07 do banco).
