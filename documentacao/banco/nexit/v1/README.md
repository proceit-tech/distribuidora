# Nexit V1 — banco de dados oficial (candidato, pendente de auditoria e aprovação)

**Estrutura única e oficial da V1:** `migraciones/NEX-001…NEX-015` (+ `migraciones/opcional/` RLS, não aplicada). Os SQLs históricos em `../fontes-historicas/` são só referência e **não** são executados. Decisão e razões: `docs/01-DECISAO-ESTRUTURA-OFICIAL.md`.

| Pasta | Conteúdo |
|---|---|
| `migraciones/` | NEX-001…015 (schema_migrations com checksum SHA-256) |
| `seeds/` | S-001 catálogos globais (referência), S-002/003 DEMO (só hash, nunca senha) |
| `scripts/` | runner, bateria `ejecutar-pruebas.sh`, inicializar empresa real, reset de senha, verificação de instalação, verificação de segredos |
| `pruebas/` | T01–T11 (SQL e concorrência) |
| `herramientas/` | compatibilidade das consultas da app (`verificar-consultas-app.py`, `matriz-compatibilidad.py`) |
| `implantacion/vm/` | `nexit-db-remote.sh` (comando forçado SSH) — **não instalado nem executado** |
| `docs/` | 01 decisão · 02 legado · 03 APIs · 04 segurança · 05 implantação · 06 Ventas al costo · 07 pendências |

Workflows: `.github/workflows/nexit-banco-ci.yml` e `nexit-banco-deploy.yml` (manual, ambiente protegido; nunca executados).

Testes: `APP_REPO=<repo> scripts/ejecutar-pruebas.sh` em PostgreSQL 16 **descartável** → 319 PASS, 0 falhas (`../../../testes/TST-NEXIT-2026-002-banco-v1.md`). Relatório final: `../../../definicoes/NEXIT-V1-BANCO-RELATORIO-FINAL-2026-10-09.md`.

Nada foi executado na VM nem no banco `nexit`. Nenhuma senha/hash real no repositório.
