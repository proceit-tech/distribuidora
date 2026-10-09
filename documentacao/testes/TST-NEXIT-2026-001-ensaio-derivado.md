# TST-NEXIT-2026-001 — Ensaio da proposta derivada do código (PostgreSQL 16 descartável)

Data: 2026-10-09 · Escopo: `documentacao/banco/nexit/v1/` · Nenhum SQL na VM.

| Bloco | Resultado |
|---|---|
| M1–M4 migrations do zero (13), idempotência, detecção de checksum alterado, recusa de operar na base `nexit` | OK |
| S1–S3 seeds (re-executáveis; sem hash aborta) | OK |
| T01 estrutura (tabelas do app, triggers, FKs ancoradas em empresa_id, sem nomes em inglês) | OK 8 |
| T02 login/sessão/logout/permissões com as consultas literais do app, como `nexit_runtime` | OK 9 |
| T03 isolamento A/B, FKs compostas, herança de empresa_id em filhos, códigos CLI/PRV, kits, ESC-13 | OK 21 |
| T04 estoque e custo médio ponderado móvel (valores calculados à mão), imutabilidade | OK 20 |
| T05 ciclo DEMO (criar, reiniciar sem afetar outra, eliminar, proteção de empresa real) | OK 20 |
| T06/T06b privilégios mínimos de `nexit_runtime` (SET ROLE e conexão real) | OK 21 + 5 |
| T07 vistas de stock/relatórios/dashboard derivadas de dados (dashboard muda com os dados) | OK 15 |
| T08 RLS opcional em cópia | OK 5 |
| B1 backup `pg_dump` + restauração + comparação de contagens | OK |
| G1 varredura estática de segredos | OK |
| C1 66 consultas SQL do app (78 variantes) vs esquema | OK; 1 correção necessária no código (F-01) |

Total: 125 verificações PASS, 0 falhas. **Limites:** prova o SQL, não as telas/APIs (ainda não adaptadas); custo/margem usam defaults provisórios D-C1..D-C9 não decididos; a fonte de "vendas" sem Facturas (SALIDA/VENTA com preço) é proposta pendente de decisão.
