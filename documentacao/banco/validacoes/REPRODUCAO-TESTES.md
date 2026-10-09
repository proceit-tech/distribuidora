# REPRODUÇÃO DOS TESTES SQL — P001..P007

Requisito: REQ-2026-003 · PR #4 · Resposta a **AUD-REQ-2026-003-R01 / F-005**. Tudo roda em **PostgreSQL descartável**, nunca no banco real, sem dados de cliente.

## 1. Ambiente usado na evidência

| Item | Valor |
|---|---|
| PostgreSQL | 16.15 (Linux), instância temporária em soquete Unix, porta 54329, sem escutar TCP |
| Extensões | `dblink` (contrib; necessária para os testes de concorrência de P005 e P007) (`gen_random_uuid()` é nativo do PG ≥ 13; `pgcrypto` não é necessário) |
| Versão mínima | **15** (views `security_invoker` de P007); em PG ≤ 14 a P007 falha de forma explícita |
| Papel de teste | `dn_app_test`: `NOSUPERUSER NOBYPASSRLS`; os testes de RLS usam `SET LOCAL ROLE dn_app_test` (o superusuário contorna RLS e **não prova nada**) |

## 2. Comandos exatos

```bash
# 1) instância descartável (exemplo; ajuste caminhos)
initdb -D /tmp/dn-test/data -U postgres
pg_ctl -D /tmp/dn-test/data -o '-p 54329 -k /tmp -c listen_addresses=' -l /tmp/dn-test/pg.log -w start
export PGHOST=/tmp PGPORT=54329 PGUSER=postgres

# 2) cadeia completa: para cada Pn cria o banco chk_Pn, aplica P001..Pn, roda down(Pn) -> up(Pn) e TESTE-Pn
cd documentacao/banco/validacoes
./executar-propostas.sh            # sai com 0 se tudo passou; 1 se algo falhou; logs no diretório impresso na última linha
# variável opcional: LOG_DIR=/caminho para guardar os logs

# 3) um teste isolado (banco já com P001..Pn aplicados e papel dn_app_test criado)
psql -v ON_ERROR_STOP=1 -d chk_P007 -f TESTE-P007-custeio.sql

# 4) encerrar
pg_ctl -D /tmp/dn-test/data -m fast stop
```

Falha de um caso = exceção `TESTE FALHOU [nome]: ...` e `psql` com código ≠ 0.

## 3. Resultado registrado (execução de 2026-10-09, PG 16.15)

```
P001: ciclo up/down/up OK | tabelas acumuladas=12 | teste rc=0 | verificações OK=22
P002: ciclo up/down/up OK | tabelas acumuladas=31 | teste rc=0 | verificações OK=157
P003: ciclo up/down/up OK | tabelas acumuladas=48 | teste rc=0 | verificações OK=178
P004: ciclo up/down/up OK | tabelas acumuladas=52 | teste rc=0 | verificações OK=85
P005: ciclo up/down/up OK | tabelas acumuladas=58 | teste rc=0 | verificações OK=141
P006: ciclo up/down/up OK | tabelas acumuladas=65 | teste rc=0 | verificações OK=172
P007: ciclo up/down/up OK | tabelas acumuladas=66 | teste rc=0 | verificações OK=61
```

"Verificações OK" = linhas `NOTICE: OK [...]` emitidas pelos helpers (`expect_error`, `expect_count`, `expect_affected`, `expect_true`); soma **816**. Isto conta *casos executados* e não mede cobertura. O que cada caso verifica está nos próprios arquivos `TESTE-Pn-*.sql` e em `documentacao/testes/TST-REQ-2026-003.md`.

## 4. O que a evidência prova e o que não prova

- **Prova** (no esquema *proposto*): as propostas aplicam, revertem e reaplicam em cadeia; constraints, triggers, RLS (com papel sem `BYPASSRLS`), isolamento entre empresas, bloqueios, fórmulas do custo médio, custo congelado, conservação em transferência e concorrência real (duas conexões) se comportam como descrito.
- **Não prova**: nada sobre o banco real (F-001 externo: depende de o responsável executar `CONSULTAS-CATALOGO-SOMENTE-LEITURA.sql`); desempenho/volume; integração com API ou XLSX (não existem); PostgreSQL < 15.
- Os testes de P002–P006 pré-existentes foram **reaproveitados sem reescrita**; ajustes de semente feitos nas rodadas anteriores estão em `TST-REQ-2026-003.md`.

## 5. CI (REQ-2026-004)

Ainda **não há job de CI** que rode estes testes (REQ-2026-004 não iniciado). Quando existir, o job mínimo é: serviço `postgres:16`, `apt/contrib` com `dblink`, `./executar-propostas.sh`. Até lá, a evidência é a execução manual acima — registrada como tal, sem alegar integração contínua.
