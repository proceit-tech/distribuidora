# 07 — Pendências e decisões que dependem da PROCEIT

## A. Regras de custeio (D-C1…D-C9)
Fonte das definições: branch `docs/REQ-2026-003-mapeamento-banco` (`CUSTEIO-V1.md`, `DECISOES-PENDENTES-CUSTEIO-REQ-2026-003.md`). **Todas seguem pendentes de aprovação**; o banco usa só os defaults provisórios abaixo.
| ID | Decisão | Default provisório implementado | Teste |
|---|---|---|---|
| D-C1 | custo por produto×depósito ou só produto | produto × depósito | T04 |
| D-C2 | físico ou só disponível no valor | físico próprio (inclui reservado/quarentena); reserva não altera valor | T09 |
| D-C3 | IVA recuperável/frete/despesas no custo | custo informado pelo chamador (nada é somado) | — |
| D-C4 | moeda base e câmbio | custo na moeda informada; **sem tabela de câmbio**; margem só se mesma moeda | T07 |
| D-C5 | anulação/devolução/correção retroativa | movimento inverso ao custo congelado da saída; entrada anulada sai ao promedio vigente | T09 |
| D-C6 | custo por lote | por produto/depósito (lotes existem como atributo de saldo, sem custo próprio) | — |
| D-C7 | mercadoria de terceiros | movimenta saldo, **fora do valor** | T04 |
| D-C8 | corte e custo de abertura | origem `ABERTURA` com custo exato informado | T09 |
| D-C9 | base da margem (com/sem IVA) | margem simples venda − custo, só mesma moeda (provisória) | T07 |

## B. Outras decisões
1. **Fonte de "Ventas al costo"** — ver 06 (A/B/C).
2. `condiciones_pago`: catálogo **global** (hoje) ou por empresa.
3. Algoritmo do **dígito verificador do RUC**: hoje exige DV não vazio para RUC, sem cálculo; definir se valida módulo 11.
4. Formato do hash: banco exige bcrypt `$2a$` custo ≥ 10; confirmar que a app gera esse prefixo (ou autorizar `$2b$`).
5. **RLS** (isolamento adicional no banco): ativar na V1 ou depois (exige `SET nex.empresa_id` por conexão na app).
6. Geografia/UM/impostos em S-001 são **referência ilustrativa**, não carga oficial SIFEN/DNIT: carga oficial pendente.
7. Mecanismo de implantação: conexão (IAP/IP fixo/runner próprio), usuário na VM (docker = root efetivo), bucket de cópia externa.
8. **Productos (NEX-017)**: S-004 (51 famílias / 203 linhas) **confirmado como dados reais fornecidos pela CASA MINGO (Excel)**; aplicar NEX-017 + S-004 no banco `nexit` é passo humano/autorizado (ver 08); pendentes: telas administrativas de Famílias, Linhas, Categorias e Marcas; permissão específica para preço de referência (hoje `PRODUCTOS.EDITAR`).
9. Dados reais: nome/RUC/razão social da empresa e do administrador (a senha será definida por quem a usa; nunca no Git).

## C. Arquivos a localizar
- Migration **003** (incorporar ao GitHub), **018–021** (comparar, não aplicar), DOCX funcional v1.0.

## D. Código da aplicação (PR separada — não incluída aqui)
F-01 (`$32::uuid`), remover a credencial pública antiga da UI, `DEMO_MODE=false`, APIs de Stock/Movimientos/Reportes/Dashboard sobre as funções/views novas, permissões por menu, filtro por empresa em toda consulta, XLSX, testes E2E.

## E. Riscos / itens abertos
PR #5 com `app-lint` vermelho; AUD-REQ-2026-002-R05 (achado anterior) a reconferir; testes E2E reais não executados; vazão de numeração por empresa; restauração real em contêiner e `gs://` não provadas.
