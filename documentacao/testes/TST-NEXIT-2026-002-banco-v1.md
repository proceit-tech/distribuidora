# TST-NEXIT-2026-002 — Banco Nexit V1 (NEX-001…015): execução de testes

**Data:** 2026-10-09 · **Ambiente:** PostgreSQL 16.15 descartável (clúster local, socket, sem rede) · **Comando:** `APP_REPO=<repo> documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh` · **Resultado:** **319 verificações PASS, 0 falhas** (execução completa final, após o último ajuste de SQL). Nada foi executado na VM nem no banco `nexit`.

| Teste | Prova | Verif. |
|---|---|---:|
| M1 | criação do zero, 15 migrations em ordem | 15 |
| M2 | reexecução: 0 mudanças (idempotente) | 15 |
| M3 | migration editada → aborta (checksum, código 4) | 1 |
| M4 | recusa operar na base `nexit` sem flag | 1 |
| M5 | duas execuções simultâneas do runner: 15/15, sem duplicar | 1 |
| S1–S3 | semente S-001 (e reexecução); S-002 modelo; S-003 sem hash aborta | 3 |
| T01 | estrutura esperada | 8 |
| T02 | login/sessão (hash, bloqueio, expiração, revogação) | 9 |
| T03 | isolamento entre duas empresas e FKs compostas | 21 |
| T04 | custo médio móvel, valor conservado, resíduo, imutabilidade, anulação | 21 |
| T05 | ciclo de vida DEMO (criar, reiniciar, eliminar, isolamento) | 20 |
| T06 / T06b | política `nexit_runtime`; conexão real com o papel | 31 / 5 |
| T07 | views de relatórios e dashboard | 15 |
| T08 | RLS opcional em cópia | 5 |
| T09 | movimentos: permissões, escopo de depósito, idempotência, anulação, reserva/quarentena, apertura, terceiros, kardex, conciliação | 65 |
| T10 | empresa real: inicialização, rejeição `demo-*`, hash inválido, reset, isolamento | 37 |
| T11 | concorrência: corrida de idempotência, sem sobrevenda, valor conservado, numeração única, anulação concorrente, sem deadlocks (estável em 5 execuções) | 27 |
| I1 | scripts de inicialização/reset de senha (gerador simulado) | 7 |
| V1 / V2 | `verificar-instalacion.sh` completo e `--produccion` | 38 / 4 |
| B1 | backup `pg_dump -Fc` + restauração: md5 por tabela, migrações, conciliação, runtime | 6 |
| G1 | sem segredos/credenciais no código | — |
| C1 | 66 consultas literais da app × esquema: 78 variantes OK, 0 falhas, 1 correção de código (F-01) | — |

## Ensaio do script de implantação (separado da bateria)
Modo `local`, PG16 descartável: recibir → planificar → respaldar → probar-restauracion → copiar-externo → migrar → sembrar-catalogos → inicializar-empresa → verificar produccion → pruebas-post → definir-clave-runtime. Resultados: `migrar` **recusado** sem respaldo/restauração vigentes (rc 73); re-migrar = "ya aplicada"; sha e subcomando inválidos rejeitados (rc 64); `verificar produccion` falha corretamente sem empresa real e passa após inicializá-la; `nexit_runtime` criado sem superusuário, com senha definida; nenhum hash/senha em logs.

## Falhas encontradas e corrigidas durante o trabalho
Anulação via UPDATE direto permitia ANULADO sem inverso (guard endurecido em NEX-014); verificador marcava citext e views indevidamente; `read` sem newline abortava `definir-clave-runtime`; restauração em base vazia e verificação de estrutura pré-migração (ajustadas). Erros de expectativa em testes T09/T11 corrigidos (valores calculados à mão).

## NÃO provado / pendente
- **E2E com a aplicação Next.js** (APIs de Stock/Movimientos/Reportes/Dashboard ainda não existem; F-01 aberto no código).
- Compatibilidade das consultas é por `PREPARE` + testes SQL, não por execução da app.
- Bcrypt real: os testes usam gerador pgcrypto (`$2a$`) e um hook de teste; a CI instala bcrypt real, mas **os workflows nunca rodaram no GitHub** (YAML validado só sintaticamente).
- Modo `docker`, `gs://`, SSH com comando forçado, IAP: não testados; shellcheck não executado localmente.
- Carga, vazão e backup de volume real; restauração da base `nexit` real.
