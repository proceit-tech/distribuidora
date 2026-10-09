# Nexit — análise técnica e plano de migrations + empresa DEMO (para aprovação)

Data: 2026-10-09 · Branch: `feature/NEXIT-2026-001-banco-demo` (base `main` @ `0dbb013`) · Referências: PR #6 (`07a9b5c`: `ESTADO-REAL-NEXIT-GOOGLE-CLOUD-2026-10-09.md`, `REQUISITOS-CLAUDE-NEXIT-DEMO-E-BANCO-2026-10-09.md`, `infra/nexit/`), PR #4 (`PRIORIDADE-V1-RELATORIOS-CUSTO-ESTOQUE.md`, mapeamento do banco).

> **Esta PR contém apenas o plano.** Nenhum SQL foi escrito para a VM, nenhum SQL foi executado, nenhum código funcional foi alterado e a infraestrutura (`nexit-db`, `nexit_pgdata`, `nexit_app`, `nexit-app`, Caddy) não foi tocada. Os SQL serão uma segunda etapa, nesta mesma PR, **só depois** das respostas da seção 7.

## 1. Constatações que mudam o plano

| # | Constatação | Evidência | Consequência |
|---|---|---|---|
| C1 | A imagem implantada (`0437fed`) tem o mesmo código de `main` e consulta o **esquema legado em espanhol** (`empresas`, `usuarios`, `clientes`, `productos`…, 46 tabelas distintas no SQL de `app/api` e `lib/auth`). | `git grep` de `FROM/JOIN/INTO/UPDATE` em `app/api` e `lib` | As propostas **P001–P007 (inglês) não servem** para este código: o banco `nexit` precisa de um esquema compatível com o que a app já executa. As P001–P007 continuam como destino futuro (expand/contract), não como esta migration. |
| C2 | O login real exige `pgcrypto` (`crypt()`, `gen_salt('bf',12)`) e 6 tabelas: `empresas`, `usuarios`, `perfiles`, `usuario_perfil`, `sesiones_usuario`, `eventos_seguridad`. O README cita migrations 001–017 (incl. `017_administrador_inicial.sql`) que **não estão no repositório**. | `app/api/auth/login/route.ts`, `lib/auth/session.ts`, `README.md` | Pergunta P1 (seção 7): essas 17 migrations existem em algum lugar? Se sim, usamos como base em vez de inferir o esquema do SQL da aplicação. |
| C3 | **Só 4 grupos de rotas usam banco**: `auth`, `clientes`, `productos`, `proveedores` (GET/POST). Nas telas, **só `clientes/nuevo`** chama API; listados, fichas, Listas de precios, Stock, Movimientos, Recepciones, Facturas ficam em `localStorage` (`lib/mocks/*-storage.ts`) e o Dashboard tem números literais. | `git grep "/api/"` fora de `app/api`; 10 arquivos com `localStorage` | Com `DEMO_MODE=false`, o usuário logado verá dados fictícios **do navegador**, não do PostgreSQL. Dados "persistidos no PostgreSQL" exigem **mudança de código** (telas → API) nos menus aprovados. SQL sozinho não entrega a demo. |
| C4 | Credenciais públicas: o formulário de login **pré-preenche** `admin`/`admin123`, mostra "Acceso demo: admin / admin123" e fixa a empresa `CASA_MINGO`; a rota de login com `DEMO_MODE=true` compara com essa senha no servidor e o cookie demo é um valor **fixo** (`demo-casa-mingo`, forjável). | `components/auth/login-form.tsx`, `app/api/auth/login/route.ts`, `lib/auth/session.ts` | Em produção com `DEMO_MODE=false` o caminho do cookie fixo fica inalcançável, mas a senha e a empresa **continuam expostas no bundle público**. Correção de código necessária (seção 5). |
| C5 | A sessão real entrega `permissions: []` e `resolveNavigation([])` mostra **todos os menus**; 24 dos 32 itens do menu não têm página (404). Nome da empresa real aparece como "Empresa activa". | `lib/auth/server-context.ts`, `lib/navigation/menu.ts` | Menus fora do escopo precisam ficar ocultos ou marcados "No disponible" (código). Permissões server-side não existem ainda (REQ-002). |
| C6 | `POSTGRES_USER=nexit_app` no `compose.yml` faz de `nexit_app` o **superusuário** do contêiner; a app conecta com ele. Superusuário **ignora RLS** e pode tudo. | `infra/nexit/compose.yml`, `app.env.example` | Decisão P4: manter `nexit_app` como dono/migrador e criar um papel de execução sem privilégio para a app (muda o `DATABASE_URL` da VM — só com combinação prévia). |
| C7 | O código **não usa RLS nem `SET LOCAL` de empresa**; o isolamento hoje é só `WHERE empresa_id = sessão` em cada query. | SQL das 3 APIs | Esta etapa terá isolamento **por código e por FK composta**, sem RLS ativo (ligar RLS quebraria a app atual). Aceitável **apenas** com dados fictícios; RLS entra com a camada de dados (REQ-002 I-0). |

## 2. Menus: escopo, prontidão e dependências

Fonte de aprovação encontrada no Git: **só** `PRIORIDADE-V1-RELATORIOS-CUSTO-ESTOQUE.md` (PR #4, ordem do responsável em 2026-10-09), que define o que entra na V1 e o que fica **adiado**. Nenhum documento do Git lista "menus aprovados para o Nexit" explicitamente; onde não há texto, marco **A CONFIRMAR** e não implemento.

Legenda de prontidão: **Código** = o que existe; **Banco hoje** = persistência real; **Falta** = o que impede uma demo real.

| Menu (ES) | Aprovação no Git | Código hoje | Banco hoje | Falta para demo real |
|---|---|---|---|---|
| Login / sesión / empresa | V1 §1 (segurança mínima) | Real (bcrypt `crypt`, sessão por token, bloqueio após 5 falhas, eventos) | Tabelas **inexistentes** | Migrations de segurança; seed da empresa/usuário DEMO; remover credenciais da UI (C4); mostrar nome real da empresa |
| Clientes | V1 §2 | API `GET`/`POST` real; **Nuevo quebra** com banco real (DIV-01/02: não envia `paisNombre`; catálogo de países ausente); listado e ficha em `localStorage` | Inexistente | Migrations (clientes + hijas + catálogos + geo); corrigir Nuevo; ligar listado/ficha à API; `PUT`/baixa |
| Proveedores | V1 §2 | API `GET`/`POST` real; nenhuma tela a chama | Inexistente | Migrations; ligar telas à API; `PUT` |
| Productos | V1 §2 | API `GET`/`POST` real; telas em `localStorage`; custo médio **digitado** | Inexistente | Migrations (productos + hijas + categorías/marcas/unidades/impuestos); ligar telas |
| Listas de precios | V1 §2 ("conforme necessidade") | Só `localStorage`; **sem API** | Só `listas_precio` (6 colunas provadas pelo SQL de clientes) | **A CONFIRMAR** se entra na demo; exigiria API + tabelas (P004 em espanhol) |
| Depósitos | V1 §1 (depósitos) | **Sem página**; tabela `depositos` lida por Productos | Inexistente | Mínimo: tabela + seed; tela só se confirmado |
| Stock / Movimientos | V1 §3 | Só `localStorage`; **sem API**; não há tabela no SQL | Inexistente | **Implementação nova** (tabelas + API + transação). Não é "só seed". Depende de decisões D-C (custeio) |
| Reportes (ventas al costo, stock valorizado) | V1 §4-6 | **Inexistentes** | — | Bloqueados por D-C1..D-C9 e por Stock/Movimientos reais |
| Dashboard | Sem aprovação explícita | Números literais | — | **A CONFIRMAR**: sugerido ocultar ou trocar por contadores reais dos menus aprovados |
| Vendedores, Zonas y rutas | Sem aprovação como menu; tabelas `vendedores`, `zonas_comerciales`, `rutas_entrega`, `canales_venta` são **lookups lidos pela API de Clientes** | Sem página | Inexistente | Só tabelas+seed mínimos como dependência de Clientes; tela **fora** salvo confirmação |
| Recepciones (Compras) | Não citada; V1 adia solicitações/ordens/devoluções | `localStorage` | — | **A CONFIRMAR** |
| Facturas | V1: "facturação existente não deve ser apresentada como persistente" | `localStorage`; SIFEN simulado | — | **A CONFIRMAR**; sem SIFEN real em nenhuma hipótese |
| Solicitudes, Órdenes, Devoluciones, Pedidos, Ventas, Entregas, Finanzas (5), Notas de crédito/remisión, Todos los documentos, Monitor SIFEN | **Adiados** (V1) ou sem aprovação | Sem página (404) | — | **Fora do escopo**: ocultar ou "No disponible"; nada será criado |
| Usuarios, Roles y permisos, Configuración, Auditoría | REQ-002 (desenho; não implementado) | Sem página | — | **Fora do escopo** agora |

**Resposta direta: "o que já está operacional?"** Hoje **nenhum menu está operacional de ponta a ponta com o PostgreSQL**; o banco está vazio e as telas usam dados do navegador. Mais próximos: **Login** (código real, falta banco) e as **APIs** de Clientes/Proveedores/Productos (código real, falta banco e as telas as usarem).

## 3. Recomendação de escopo mínimo para a primeira demo (proposta, depende da seção 7)

1. Login real + empresa **NEXIT DEMO S.A.** + usuário demo (sem credencial pública).
2. **Clientes, Proveedores, Productos** persistindo no PostgreSQL (criar, listar, abrir, editar) com dados fictícios identificados.
3. Todo o resto: oculto ou "No disponible" visível. Listas de precios, Depósitos, Stock, Movimientos e Reportes **só entram se você confirmar** e como PRs/etapas separadas, porque exigem desenvolvimento novo, não apenas SQL.

## 4. Plano de migrations (esquema compatível com a app implantada; nada executado)

Local no Git: `documentacao/banco/nexit/` — `migraciones/`, `seeds/`, `README.md` (ordem, pré-requisitos, checksum, rollback, restore, aceite). Todo arquivo com cabeçalho (requisito, objetivo, dependências, impacto, rollback), idempotente quando possível (`IF NOT EXISTS`), uma transação por arquivo e **tabela de controle `schema_migrations`** (versão + checksum) para saber exatamente o que foi aplicado.

| Arquivo | Conteúdo | Depende de |
|---|---|---|
| `NEX-001-base.sql` | `pgcrypto`, `schema_migrations`, função `actualizar_fecha()` | — |
| `NEX-002-seguridad.sql` | `empresas` (+ `es_demo`, `demo_expira_at`), `usuarios`, `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil`, `sesiones_usuario`, `eventos_seguridad` | 001 |
| `NEX-003-catalogos-globales.sql` | geografia PY (países, departamentos, ciudades, distritos), `monedas`, `impuestos`, `medios_pago`, `incoterms`, `unidades_medida` | 001 |
| `NEX-004-catalogos-empresa.sql` | `condiciones_pago`, `grupos_cliente`, `grupos_proveedor`, `zonas_comerciales`, `rutas_entrega`, `canales_venta`, `vendedores`, `categorias_producto`, `marcas_producto`, `listas_precio` (mínimo lido por Clientes) | 002, 003 |
| `NEX-005-clientes.sql` | `clientes`, `direcciones_cliente`, `cliente_contactos`, `cliente_documentos` | 004 |
| `NEX-006-proveedores.sql` | `proveedores` e filhas (direcciones, contactos, cuentas bancarias, documentos, retenciones) | 004 |
| `NEX-007-productos.sql` | `depositos`, `productos` e filhas (códigos, unidades, proveedores, depósito/configuración, documentos, componentes, alternativos) | 004, 006 |
| `NEX-008-demo-ciclo-vida.sql` | funciones `demo_reiniciar(empresa)` e `demo_crear_prospecto(...)` que **só operam em empresas `es_demo = true`** (guardas e auditoria) | 002–007 |
| `NEX-009-rol-ejecucion.sql` (se P4 = sim) | papel `nexit_runtime` sem superusuário, só DML nas tabelas de negócio | 002–008 |
| Seeds `S-001` catálogos reales (países/deptos PY, PYG, IVA 10/5/0, unidades) · `S-002` empresa DEMO + perfil + permisos mínimos · `S-003` usuário demo (**senha fornecida na execução, nunca no Git**) · `S-004` dados fictícios (clientes, proveedores, productos) marcados `DEMO` | | 001–008 |

Estas colunas/constraints serão derivadas **do SQL da própria app** (única fonte provada) e do mapeamento do PR #4; o que a app não prova fica registrado como inferência. Migrations de Listas de precios, Stock, Movimientos e Reportes **não** estão no plano até a seção 7 ser respondida.

**Ensaios (antes de qualquer VM):** PostgreSQL 16 descartável (como o CI do REQ-2026-004): aplicar 001→008 do zero, reaplicar (idempotência), seed, as consultas **literais da app** contra o esquema (login, GET/POST de clientes/proveedores/productos) e teste de isolamento A/B por `empresa_id`. Relatório de resultados no `TST-NEXIT-...md`, sem alegar o que não foi executado.

## 5. Código que precisa mudar (PR separada, depois de aprovada a seção 3)

- **Login seguro:** remover valor padrão `admin123` e a dica "Acceso demo"; empresa digitável (ou por link de convite); apagar o caminho do cookie fixo `demo-casa-mingo` e a senha no servidor; manter bloqueio por falhas e eventos.
- **Shell:** mostrar o nome real da empresa; filtrar o menu pelos itens aprovados (resto "No disponible").
- **Telas dos menus aprovados:** trocar `localStorage` por API (GET/POST/PUT) em Clientes, Proveedores, Productos; corrigir Nuevo (DIV-01/02).
- **Demo:** faixa fixa "ENTORNO DE DEMOSTRACIÓN — datos ficticios", bloqueio de exportação de dados e de qualquer SIFEN/pagamento/mensagem real.
- Testes E2E antes de chamar qualquer tela de "operacional".

## 6. Ciclo de vida da DEMO: opções (pedido de aprovação)

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Tenant demo compartilhado** | Uma empresa `NEXIT DEMO S.A.`; reset noturno | Simples | Prospects veem dados uns dos outros; abuso de cadastro; acesso compartilhado |
| **B. Tenant temporário por prospect** | Operador cria `NEXIT DEMO – <prospecto>` (função `demo_crear_prospecto`), validade de N dias, usuário próprio, clone dos dados fictícios | Isolamento real entre prospects, reset por prospect, revogação | Mais SQL/operação |
| **C. A + B** | Tenant "modelo" fixo (só leitura, origem do clone) + um tenant por prospect | Melhor isolamento, reset = reclonar | Mais complexo |

**Recomendação: B (com o modelo guardado como seed S-004).** Acesso sem senha pública: o operador gera um **link de convite de uso único e curto** (ou envia a senha por canal privado); a senha inicial é definida na execução, trocada no primeiro login, e expira com a demo. **Reset:** `demo_reiniciar(empresa_id)` apaga e recarrega apenas dados de empresas com `es_demo = true` (nunca toca em empresa real: recusa por guarda e é auditada). Limites: tamanho de campos já validado pela API; cota de registros por demo; limpeza de dados pessoais ao expirar.

## 7. Perguntas que preciso que você responda antes de eu escrever os SQL

1. **P1 — Migrations 001–017:** existem? Onde (máquina do dev, outro repositório)? Se sim, você as envia (sem dados) e eu as uso como base; se não, derivo do SQL da app (recomendado confirmar).
2. **P2 — Escopo da primeira demo:** confirma só **Login + Clientes + Proveedores + Productos**? Entram também Listas de precios, Depósitos, Stock/Movimientos, Dashboard, Recepciones ou Facturas (cada um é desenvolvimento novo)?
3. **P3 — Esquema:** aceita esquema **em espanhol compatível com a app implantada** nesta etapa, com a migração para inglês (P001–P007) depois, por domínio? (A alternativa — inglês agora — exige reescrever as 3 APIs e o login.)
4. **P4 — Papel de execução:** aceita criar `nexit_runtime` (sem superusuário) e, em etapa combinada, trocar o `DATABASE_URL` da VM? `nexit_app` seguiria como dono/migrador.
5. **P5 — Modelo da demo:** A, B ou C (seção 6)?
6. **P6 — Quem executa** os SQL na VM e quando existe backup externo verificado (a PR #6 diz que não há)? Sem backup + restore comprovado, a recomendação é **não receber dados reais**; para dados fictícios o risco é baixo mas o procedimento de recuperação precisa existir (dump agendado + teste de restore).

## 8. Recuperação (a detalhar no README de execução)

Antes de cada aplicação: `pg_dump -Fc` do banco `nexit` fora do volume + checksum + restore testado em contêiner descartável. Rollback por migration: arquivos `-down.sql` só para ambientes **descartáveis**; na VM, o rollback é **restore do dump**, nunca `down -v`, nunca remover `nexit_pgdata`.

## 9. Não escopo desta PR

Qualquer SQL ou execução; alteração de `infra/nexit/`; módulos fora da seção 3; SIFEN real, pagamentos ou mensagens; relatórios de custo; P008.
