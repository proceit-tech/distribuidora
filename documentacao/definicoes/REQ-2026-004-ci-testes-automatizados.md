# REQ-2026-004 — CI e testes automatizados

Status: **EM INÍCIO (rascunho para auditoria)** · Origem: `AUD-REQ-2026-001-R02` (lint/testes em CI), `AUD-REQ-2026-003-R01/R02` (F-005/F-004) · Base: PR #4 (`0a01662`) · Branch: `feature/REQ-2026-004-ci-testes-automatizados`

## 1. Objetivo
Executar automaticamente, a cada PR, (a) as propostas SQL P001–P007 e seus testes em PostgreSQL descartável e (b) o lint do aplicativo, publicando logs como artefato. Substitui a evidência "executado manualmente" por evidência verificável.

## 2. Escopo
| Item | Incluído | Observação |
|---|---|---|
| Job `sql-propostas` | Sim | `postgres:16` como serviço do runner; `executar-propostas.sh` (up/down/up + TESTE-Pn); logs em artefato `sql-logs` |
| Gate de versão | Sim | O script aborta se `server_version_num` < 150000 (P007 usa `security_invoker`) |
| Job `app-lint` | Sim | `npm ci` + `npm run lint` (único script existente) |
| Typecheck / testes de API / build | **Não ainda** | Não existem scripts; criar em PR próprio com os módulos (I-0 em diante) |
| Banco real, segredos, deploy | **Nunca** | O CI só usa o PostgreSQL efêmero do runner |
| Matriz de versões do PostgreSQL (15, 16, 17) | Proposta | Só depois de saber a versão do banco real (G0) |

## 3. Critérios de aceite
- CA-01 O workflow roda em `pull_request` sem segredos e termina verde com P001–P007 (816 verificações OK, mesma contagem do `REPRODUCAO-TESTES.md`).
- CA-02 Falha de qualquer caso SQL falha o job (código de saída ≠ 0) e o log aparece no artefato.
- CA-03 Em PostgreSQL < 15 o script falha de forma explícita.
- CA-04 Nenhuma ação usa credencial real; senha do serviço é descartável.
- CA-05 Lint do app roda com `npm ci` (lockfile) — **evidência pendente** (ver §5).

## 4. Riscos
- O ambiente de execução do Actions não foi exercitado por mim; a evidência é a simulação local dos mesmos comandos.
- `npm ci` no CI depende do registro npm; não foi possível confirmar neste ambiente.
- Versões de actions fixadas por tag maior (`@v4`); endurecer por SHA se a política da PROCEIT exigir.
- Publicar o workflow em `main` só depois da aprovação; o PR pode ser stacked sobre o PR #4 (o script de testes ainda não está em `main`).

## 5. Evidência
`documentacao/testes/TST-REQ-2026-004.md`.
