# AUD-PRO94-NCE-ESTRUTURA-R01 — revisão das quatro correções estruturais

**Data:** 2026-10-16. **Revisor:** ChatGPT. **Commit auditado:** [`690544d3d739669055543fa7417fdeb91168abec`](https://github.com/proceit-tech/distribuidora/commit/690544d3d739669055543fa7417fdeb91168abec). **Branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Referências:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/PRO-94-ORDEM-CORRECOES-NCE-ESTRUTURA-JSON-DB-2026-10-16.md`, `documentacao/testes/AUD-PRO94-NCE-ESTRUTURA-JSON-DB-ENDTOEND-2026-10-16.md`.  
**Método:** revisão estática do commit e arquivos de produção/SQL e teste; nenhuma execução de testes, PostgreSQL, VM, navegador ou gateway pelo auditor.

## Parecer

**CORREÇÃO SOLICITADA — 1 achado MÉDIO na suíte SQL T26 (não em código de emissão).** As quatro correções funcionais estão **ENCERRADAS POR INSPEÇÃO ESTÁTICA** do código, mas o T26 recém-ampliado tem um erro de fixture concreto: o teste positivo de NCE PYG referencia CDC da **factura errada**, e seu negativo também pode passar pelo motivo errado. Este teste **NÃO pode ser utilizado como evidência futura** até ser corrigido. Não liberar implantação/homologação.

| ID | Avaliação | Evidência |
|---|---|---|
| NCE-DB-01 · total PYG inteiro | **Implementado estaticamente** | [`lib/facturacion/payload-nce.ts:192`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/lib/facturacion/payload-nce.ts#L192)–196 exige total inteiro PYG; [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:284`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L284)–286 impõe mesma regra antes da reserva. Não altera bases/IVA fracionários. |
| NCE-DB-02 · correspondência total principal/JSON/linhas | **Implementado estaticamente** | TypeScript verifica múltiplo exato de 10^-4; [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:284`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L284)–320 exige `p_total` representável exatamente em `numeric(20,4)`, igual ao total calculado e à soma das linhas. NEX-047 não foi alterada. |
| NCE-UI-03 · CDC original/NCE próprio | **Implementado estaticamente** | [`lib/facturacion/shared.ts:78`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/lib/facturacion/shared.ts#L78) devolve `o.fe_cdc AS "feCdc"` em SELECT NCE escopado; [`app/(private)/documentos/page.tsx:406`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/app/(private)/documentos/page.tsx#L406)–410 apresenta o CDC original e o CDC próprio separados e mostra `Aún no informado` quando não há CDC próprio. Fallback para SELECT legado foi preservado. |
| NCE-DB-04 · vínculo FE em linhas NCE | **Implementado estaticamente** | [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:34`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L34)–61 adiciona `UNIQUE(empresa_id,nce_id,fe_id)` e FK da linha nas três colunas, com `NOT NULL`. Triggers de imutabilidade permanecem. |
| LIM-01 · JSON grande | **Proteção preventiva adicional presente; equivalência banco pendente** | [`lib/facturacion/nce.ts:353`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/lib/facturacion/nce.ts#L353)–355 mede JSON UTF-8 antes da reserva e rejeita acima de 240000 bytes com 422; NEX-048 limita `pg_column_size(jsonb)<262144`. O tamanho do texto UTF-8 não é a mesma métrica do JSONB físico e há campos adicionados no SQL. A pré-validação é uma **guarda conservadora**, não prova matemática de que todo JSON aceito caberá no PostgreSQL. Uma falha no INSERT transacional deve reverter numeração; nenhum SQL real executado. |

## R01-01 — MÉDIA · fixture T26 utiliza CDC antigo ao criar NCE de segunda factura

### Evidência concreta, independente de execução

1. O T26 criou sua **primeira FE** `v_fe` número `0000001` e gravou seu CDC na variável `v_cdc` ([`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:55`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L55)–58).
2. O JSON base `v_pay` recebeu `DocumentosAsociados[0].dCdCDERef = v_cdc` ([`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:61`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L61)–62).
3. O helper `pg_temp.pay` modifica somente `iMotEmi`, `Subtotales` e `Detalles`, **não** atualiza `DocumentosAsociados` ([`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:25`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L25)).
4. Na seção recém-adicionada, criou-se **segunda FE** `v_f11` número `0000011` com CDC diferente ([`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:175`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L175)–181).
5. Os casos `clave-t26-py01` e `clave-t26-py02` agora passam `p_fe=v_f11`, mas continuam gerando o payload com `pg_temp.pay(v_pay,v_sol,...)`, portanto a NCE aponta **CDC da FE 0000001** ([`documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql:183`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql#L183)–185).
6. A função de produção exige expressamente `DocumentosAsociados[0].dCdCDERef = v_fe.cdc` e lança `NEX:ASOCIACION_INVALIDA` se divergir **antes** de conferir o total monetário ([`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:187`](https://github.com/proceit-tech/distribuidora/blob/690544d3d739669055543fa7417fdeb91168abec/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L187)–195).

### Consequência

- O caso negativo `PYG-01` pode retornar SQLSTATE `P0001` devido ao **CDC errado**, não devido a total fracionário. Sua expectativa não identifica a causa real; **falso positivo** de cobertura.
- O caso positivo `PYG-02` (devolução inteira, total 5000) será rejeitado em `ASOCIACION_INVALIDA` e **não criará** a NCE esperada.
- As verificações `DB-04` subsequentes dependem da NCE positiva e deixam de ser evidência confiável.

**Correção mínima requerida, EXCLUSIVAMENTE no T26:** logo após inserir `v_f11`, obter seu CDC de 44 dígitos e construir uma cópia base do payload associada a **esse** CDC, sem modificar o `v_pay` de outros testes. Usar essa cópia em `PYG-01`/`PYG-02`. Reforçar a afirmação negativa para verificar não só SQLSTATE `P0001`, mas o erro específico `NEX:PAYLOAD_INVALIDO` do total fracionário, se o helper de testes oferecer conferência de `DETAIL`; senão criar asserção pontual pequena e isolada que não mascare erro por associação. Não afrouxar nem alterar `fe_documento_crear_nce`, FKs ou validações fiscais, pois a rejeição desse CDC inconsistente é **correta**.

**Checagem futura restrita:** inspecionar diff T26 e o fluxo `v_f11` → payload com `DocumentosAsociados` correto; não solicitar ao Claude uma nova rodada de suites TS, FAT-E2, build, lint, `tsc` ou acesso PostgreSQL. **T26 não pode rodar no PostgreSQL operacional único.** Parar para `AUD-PRO94-NCE-ESTRUTURA-R02` após push de correção mínima.

## Limites e estado

- Claude reportou `nce.casos`, Facturación, FAT-E2, ESLint e `tsc` sem falhas; **não repetidos pelo auditor**. Testes TypeScript da integridade monetária são reais conforme relato do executor; os testes de SQL T26 e as FKs foram apenas versionados e inspecionados, **não executados em PostgreSQL**.
- `dDesMotEmi` necessário no XML SIFEN é gerado ou não pelo gateway de acordo com contrato externo **ainda sem prova**. Só existe amostra NCE aprovada motivo 2. Sem validação real motivos 3/4/8, moeda USD/BRL, navegador, KuDE/XML/PDF nem worker da VM.
- **NEX-062 não aplicada; NCE não homologada; PRO-94 permanece In Progress.** Nenhuma instrução desta auditoria autoriza deploy, migration ou T26 na base real.

**Veredito:** `AUD-PRO94-NCE-ESTRUTURA-R01 = CORRECAO_PONTUAL_T26` (1 MÉDIA; 0 falhas de aplicação confirmadas no escopo dos 4 GAPs).
