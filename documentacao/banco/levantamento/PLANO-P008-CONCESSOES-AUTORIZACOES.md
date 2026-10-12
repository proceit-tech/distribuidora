# PLANO P008 — concessões, autorizações por operação e auditoria de acesso (REQ-2026-002 v5)

Requisito: REQ-2026-003 / REQ-2026-002 · PR #4 · Resposta a **R02-F-002 e R01-F-006** · Status: **PLANO — nenhum SQL de P008 existe ainda**. Fonte: `DESENHO-REQ-2026-002-multiempresa.md` v5 (SHA `58352ad`, branch do PR #3, auditoria R05 pendente) e `MATRIZ-PERMISOS-REQ-2026-002.md` v5.

> Não desenhar P008 definitivo antes da R05 e das decisões abertas (validade da autorização por operação — proposta 72 h —, janela de aviso de expiração, revisão periódica, D-04 revisão de área, D-07 validação jurídica). O que segue prepara a escrita para quando houver SHA estável do desenho, **sem duplicar** estruturas já existentes em P001.

## 1. Escopo (só o que P001 não tem)

| Grupo | Entidades (nomes em inglês, propostos) | Origem no desenho v5 |
|---|---|---|
| Concessões controladas | `permission_grants`, `permission_grant_events` | `concesiones_permiso(+_eventos)` §4.7 (D-09/D-10) |
| Autorização por operação (D-11) | `operation_authorizations` (uso único, `object_fingerprint`, estados SOLICITADA→AUTORIZADA/RECHAZADA/CANCELADA/EXPIRADA/CONSUMIDA) | `autorizaciones_operacion` §4.7.11 |
| Parâmetros de prazo (D-12) | `grant_parameters`, `grant_parameter_history` (padrões 180/365/7/7 com limites rígidos) | §4.7.8 |
| Antiguidade do poder de aprovar | `user_power_events` (só inserção) | `usuario_poder_eventos` |
| Auditoria de acesso | `access_audit` (só inserção; antes/depois/motivo/ator/IP; retenção D-07) — **substitui/estende** `security_events` de P001 | `auditoria_acceso` §9 |
| Plataforma PROCEIT | `platform_users` (MFA), `support_accesses` (prazo) | §4.6 |
| Catálogo de permissões | carga das 142 permissões (39 recursos) + 8 de plataforma, com `class` (D-06: `PRODUCTOS_COSTO.VER` = `DATO_SENSIBLE`) | matriz v5 |

Não alterar P001 (já auditada e testada). Alterações em `users`/`roles` entram como `ALTER` dentro de P008 ou são adiadas se a introspecção real exigir outro caminho.

## 2. Fases

| Fase | Entrega | Pré-requisito | Evidência |
|---|---|---|---|
| P008.0 | Congelar o desenho: SHA aprovado da R05 + decisões abertas respondidas | Resultado da R05 | Documento de decisões |
| P008.1 | `permission_grants` + eventos + `user_power_events` + `grant_parameters` (up/down) | P008.0 | `TESTE-P008-*.sql`: estados, expiração, revogação, aprovador ≠ solicitante, antiguidade, só-inserção |
| P008.2 | `operation_authorizations` (uso único, impressão digital do objeto, consumo atômico, expiração) | P008.1 | Testes de reuso, concorrência (duas conexões) e expiração |
| P008.3 | `access_audit` imutável e `platform_users`/`support_accesses` | P008.1 | Teste de imutabilidade (UPDATE/DELETE negados) e retenção |
| P008.4 | Carga do catálogo de permissões e funções de checagem (`user_has_permission`, `grant_is_valid`) | P008.1–3 | Teste gerado da matriz (um por permissão/ação sensível) |
| P008.5 | Camada de dados (`withTenantTx`, `access.ts`) aplicando a checagem **antes** das views de custo | P008.4 + PR de código | Testes de API: sem concessão → negado; revogado → negado; outra sucursal/depósito → negado |

Cada fase repete o padrão da P001–P007: up/down/up, papel `NOBYPASSRLS`, RLS FORCE, composta `(company_id, x_id)`, `executar-propostas.sh` estendido.

## 3. Efeito sobre os relatórios de custo (gate)

- Enquanto P008.4–P008.5 não existirem, **nenhum relatório de custo (estoque valorizado ou vendas ao custo) pode ser exposto a usuários** — nem por perfil comum nem por view. As views da P007 não são autorização.
- Quando existirem: o endpoint do relatório exige `PRODUCTOS_COSTO.VER` **concedido** (D-06, sem herança por perfil), dentro do alcance de sucursal/depósito do usuário, verifica revogação a cada requisição e registra `access_audit` da consulta e da exportação XLSX.
- Compromisso provisório até lá (decisão do responsável): relatórios somente para o **operador único** com autorização formal D-11, ou não liberar.

## 4. Riscos

- Desenho ainda pode mudar após a R05 (atrasa P008.1).
- Empresas com único operador (D-11): autorização PROCEIT por operação é requisito operacional além do SQL.
- Banco real pode já ter nomes/estruturas conflitantes (F-001): P008 só se fecha após a introspecção.
