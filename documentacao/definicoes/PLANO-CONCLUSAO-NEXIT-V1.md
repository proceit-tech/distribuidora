# PLANO-CONCLUSAO-NEXIT-V1

**Status:** PROPOSTA — aguarda sua aprovação antes de programar. Resultado final exigido: Nexit V1 funcionando com PostgreSQL, PROCEIT administradora global e CASA MINGO empresa cliente, sem dados fictícios no ambiente real.

## Princípios (valem para todas as fases)
- Trabalhar sobre a branch atual do GitHub; **PR de código separada** da PR de banco (#7), a partir de `feature/NEXIT-2026-001-banco-demo` ou nova branch `feature/NEXIT-2026-002-app-funcional` (sua escolha).
- Migrations novas só **NEX-017+**; nunca editar NEX-001…016. Cada migration nova é testada na bateria antes de ir à VM; **você aplica/autoriza** na VM.
- **Modo real nunca usa mock**: remover o fallback `!DATABASE_URL` das APIs; falha de conexão = erro HTTP 503, não dados fictícios. Telas de modo real não importam `lib/mocks`. O modo DEMO fica restrito à empresa DEMO do banco (nunca `localStorage`).
- Toda API: (1) sessão válida, (2) `empresa_id` **da sessão** (jamais do corpo/URL), (3) permissão verificada no servidor (`usuario_tiene_permiso`), (4) auditoria em `eventos_seguridad` nas mutações sensíveis.
- Dependência transversal: trocar a conexão da app de `nexit_app` para `nexit_runtime` (menor privilégio) — **exige sua autorização** e a senha do papel definida pelo fluxo `definir-clave-runtime`.
- Cada fase termina com commit + push, lista de arquivos alterados, testes executados, pendências; **não avanço sem sua validação**.
- Critério geral de "COMPLETO": leitura, gravação e persistência demonstradas por teste de integração contra PostgreSQL + checagem manual na tela.

## Fase 0 — Preparação (curta, antes da Fase 1)
Arquivos: `lib/auth/session.ts`, `lib/db/index.ts`, `.env.example`, `package.json` (scripts `typecheck`, `test`), `.github/workflows/` (CI da app: typecheck + lint + build + testes de integração com PG de serviço). Corrigir o npm/CI (a instalação falhou aqui; investigar). Remover `admin/admin123`/credenciais demo da UI e o fallback demo das APIs. **Aceitação:** `tsc`, `eslint` e `next build` verdes em CI; app sem `DATABASE_URL` retorna 503.

## Fase 1 — Autenticação e empresas
**Escopo:** login real; PROCEIT administradora global; CASA MINGO cliente; sessões; permissões; menus por perfil; administração global funcional.
- **Migration NEX-017** (dependência de decisão): seeds de permissões por recurso/ação para os módulos da V1 (CLIENTES, PROVEEDORES, PRODUCTOS, LISTAS_PRECIO, MOVIMIENTOS, STOCK, REPORTES, DASHBOARD, ADMIN_PLATAFORMA…), perfis padrão por empresa (ADMIN, e outros que você definir) e funções administrativas (`plataforma_*`) SECURITY DEFINER para criar/ativar/suspender empresa, criar/bloquear usuário e redefinir senha, restritas a `administradores_plataforma` ativo; sem tocar dados existentes.
- **Código:** `lib/auth/server-context.ts` (permissões reais da sessão; corrigir "Administrador null"; remover fallback `casa_mingo`), `lib/auth/permissions.ts` (`requirePermission`, `requirePlatformAdmin`), `lib/navigation/menu.ts` (filtrar por permissão, remover "mostrar tudo"), todas as rotas `app/api/**`, novas páginas `app/(private)/administracion/{empresas,usuarios,roles}` e `app/api/admin/**`; guarda de rota: itens de menu sem página não aparecem.
- **Dependências:** definição dos perfis/permissões de CASA MINGO (decisão sua); confirmar `DEMO_MODE=false`.
- **Aceitação:** PROCEIT vê Administração global e lista ambas as empresas; `cliente` de CASA MINGO **não** vê nem consegue chamar `/api/admin/**` (403 comprovado por teste HTTP); menu de CASA MINGO só mostra módulos permitidos; troca de senha e logout funcionam; tentativa com `empresa_id` forjado é ignorada.
- **Testes:** integração (login ok/errado/bloqueio/expirada), isolamento PROCEIT×CASA MINGO por API, permissões por perfil, regressão SQL (bateria + novo T12 para NEX-016/017).

## Fase 2 — Cadastros operacionais
Clientes, Proveedores, Productos, Listas de precios.
- **Código:** completar `app/api/{clientes,proveedores,productos}/route.ts` (+ `[id]/route.ts` com GET/PUT/inativar), corrigir F-01 (`$32::uuid`), criar `app/api/listas-precio/**`; ligar telas existentes (`clientes/page`, `[id]`, `proveedores/*`, `productos/*`, `listas-precio/*`) trocando `lib/mocks/*-storage` por `fetch` às APIs, **sem refazer o layout**; remover os mocks desses módulos.
- **Migration:** só se um teste revelar lacuna (NEX-018+).
- **Aceitação (por módulo):** criar → listar → abrir → editar → inativar, persistido após reiniciar a app; dados de CASA MINGO invisíveis para outra empresa; validações de RUC/documento; permissões CLIENTES.VER/CREAR/EDITAR.
- **Testes:** integração por módulo + isolamento + permissões.

## Fase 3 — Estoque
Movimientos (entrada, salida, transferencia, ajuste), Stock real, custos e valorização.
- **Código:** `app/api/movimientos/**` e `app/api/stock/**` chamando **apenas** `inventario_registrar_movimiento`/`inventario_anular_movimiento` e views `v_stock_*`, `v_kardex`; idempotência (chave gerada no cliente); telas `movimientos/*`, `stock/*` ligadas; remover `MARKUP_DEMO`/valores de venda fictícios do Stock.
- **Dependências:** Fase 2 (produtos/depósitos reais); saldo de apertura (D-C8) e demais D-C do doc 07 — **valores provisórios não são apresentados como aprovados** (rótulo na tela).
- **Aceitação:** entrada com custo → saldo e custo médio corretos; saída sem saldo recusada; transferência conserva valor; anulação gera movimento inverso; repetir a mesma chave não duplica; kardex coincide com saldo.
- **Testes:** os 27 de concorrência do banco + integração via API (duplo clique, duas abas).

## Fase 4 — Operações e relatórios
- **Ventas al costo:** só após sua decisão sobre a fonte (doc 06: A/B/C). Até lá, tela marcada como "provisória" ou ocultada.
- **Código:** `app/api/reportes/**`, `app/api/dashboard/**` sobre `v_dashboard_*`, `v_valoracion_stock`, `v_ventas_al_costo`; exportação XLSX **gerada no servidor a partir da mesma consulta filtrada** (lib `xlsx` já está no projeto); `app/(private)/reportes/page.tsx`; dashboard sem literais.
- **Aceitação:** XLSX = soma da tela filtrada; dashboard muda ao registrar movimento; nenhum número fixo no código.
- **Testes:** conciliação valor×kardex, snapshot de totais, isolamento.

## Fase 5 — Homologação e implantação
Testes integrados por módulo, isolamento PROCEIT/CASA MINGO, permissões, E2E (Playwright) dos fluxos críticos, `next build` de produção, imagem Docker publicada, checklist de verificação do ambiente (leitura apenas). Troca para `nexit_runtime`, `DEMO_MODE=false` confirmados na VM **com sua autorização**. Entrega: relatório de homologação com evidências.

## Decisões suas necessárias (bloqueiam fases)
1. Branch/PR para o código da app. 2. Perfis e permissões de CASA MINGO (Fase 1). 3. Autorização para a app usar `nexit_runtime` (Fase 0/5). 4. Fonte de "Ventas al costo" e D-C1…D-C9 (Fases 3–4). 5. Se `facturas`/`recepciones`/telas fora da V1 ficam ocultas no menu real.

## Estimativa de arquivos por fase (referência)
F0: ~6 · F1: ~15 + 1 migration · F2: ~20 · F3: ~12 · F4: ~10 · F5: CI/E2E. Estimativa de ordem de grandeza, a refinar ao iniciar cada fase.
