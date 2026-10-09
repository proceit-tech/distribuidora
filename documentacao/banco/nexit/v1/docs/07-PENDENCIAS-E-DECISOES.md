# 07 — Pendências e decisões que dependem da PROCEIT

## A. Regras de negócio (D-C1…D-C9)
As definições originais de D-C1…D-C9 **não estão no repositório**; o banco usa só os valores provisórios abaixo, **nenhum é definitivo**. Os demais (D-C1, D-C3, D-C4, D-C6, D-C7, D-C9) **não foram implementados como regra**: confirmar o enunciado original antes de decidir.
| ID | Tema (como aparece nos testes) | Implementado hoje (provisório) | Teste |
|---|---|---|---|
| D-C2 | reservado × físico | opção A: o físico próprio inclui o reservado; reserva não altera valor | T09 |
| D-C5 | anulação de movimento | opção A: movimento inverso; saída reverte ao **custo congelado**; entrada anulada sai ao promedio vigente | T09 |
| D-C8 | saldo de abertura | origem `ABERTURA` com custo exato informado | T09 |
| D-C1, 3, 4, 6, 7, 9 | (enunciado a reconfirmar) | sem regra definitiva; custo médio móvel por produto×depósito (P007), estoque negativo **proibido** por padrão | T04/T09 |

## B. Outras decisões
1. **Fonte de "Ventas al costo"** — ver 06 (A/B/C).
2. `condiciones_pago`: catálogo **global** (hoje) ou por empresa.
3. Algoritmo do **dígito verificador do RUC**: hoje exige DV não vazio para RUC, sem cálculo; definir se valida módulo 11.
4. Formato do hash: banco exige bcrypt `$2a$` custo ≥ 10; confirmar que a app gera esse prefixo (ou autorizar `$2b$`).
5. **RLS** (isolamento adicional no banco): ativar na V1 ou depois (exige `SET nex.empresa_id` por conexão na app).
6. Geografia/UM/impostos em S-001 são **referência ilustrativa**, não carga oficial SIFEN/DNIT: carga oficial pendente.
7. Mecanismo de implantação: conexão (IAP/IP fixo/runner próprio), usuário na VM (docker = root efetivo), bucket de cópia externa.
8. Dados reais: nome/RUC/razão social da empresa e do administrador (a senha será definida por quem a usa; nunca no Git).

## C. Arquivos a localizar
- Migration **003** (incorporar ao GitHub), **018–021** (comparar, não aplicar), DOCX funcional v1.0.

## D. Código da aplicação (PR separada — não incluída aqui)
F-01 (`$32::uuid`), remover `admin/admin123` da UI, `DEMO_MODE=false`, APIs de Stock/Movimientos/Reportes/Dashboard sobre as funções/views novas, permissões por menu, filtro por empresa em toda consulta, XLSX, testes E2E.

## E. Riscos / itens abertos
PR #5 com `app-lint` vermelho; AUD-REQ-2026-002-R05 (achado anterior) a reconferir; testes E2E reais não executados; vazão de numeração por empresa; restauração real em contêiner e `gs://` não provadas.
