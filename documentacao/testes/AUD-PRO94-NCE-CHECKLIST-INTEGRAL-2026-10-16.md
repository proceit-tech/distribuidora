# PRO-94 — Checklist integral de tudo que foi pedido para NCE V1

**Revisão transversal solicitada pelo responsável em 16/10/2026. Não é reexecução de testes nem substitui R04.**  
**Fonte de requisitos:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` (RN-01..24 e CA-01..23), decisões registradas e protocolo `CLAUDE.md` / `documentacao/PROTOCOLO-IA.md`.  
**Código inspecionado:** branch `feature/NEXIT-2026-001-banco-demo`, conteúdo de código correspondente ao SHA [`d635580140399bc7a7a6e8ea8ec0e990b2c4ddba`](https://github.com/proceit-tech/distribuidora/commit/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba); auditorias de correção posteriores são apenas documentação.  
**Situação:** **não homologado; NEX-062 NÃO aplicada, T26 NÃO executada em PostgreSQL, sem validação real do gateway/SIFEN/browser**.

## 1. Legenda e contagem

- **✅ CÓDIGO:** existe implementação correspondente, verificada por inspeção estática; **não** significa teste real ou homologação.
- **⚠️ PARCIAL:** há uma parte concreta do requisito não coberta pela UI/SQL, ou funcionalidade expressamente futura.
- **◇ NÃO COMPROVADO:** implementação presente, mas depende de evidência operacional/provedor ou execução SQL que a IA não realizou; não confundir com falha demonstrada.

**Regras:** {"E":14,"P":6,"V":4} (**24**). **Critérios:** {"E":13,"P":4,"V":6} (**23**). A classificação é por linha de requisito e não representa porcentagem de aprovação operacional.

## 2. Matriz integral — 24 regras de negócio

| ID | Estado | Exigência e confronto | Evidência / referência |
|---|---|---|---|
| RN-01 | ✅ CÓDIGO | Somente FE NEXIT aprovada, CDC, cliente/empresa/alcance, consulta de FE pendente | `nce.ts:119–143,196–254; reconciliarFacturasPendientes` |
| RN-02 | ⚠️ PARCIAL | Lista paginada, mais recente, saldo e aviso NCE pendente; busca de CDC completo e refresh da lista precisam de ajuste | `nce.ts:223–255; page.tsx:274–300` |
| RN-03 | ✅ CÓDIGO | Uma FE por NCE, CDC associado; iTiDE=5 e CDC novo | `payload-nce.ts:238–264; NEX-062:175–181` |
| RN-04 | ✅ CÓDIGO | Quatro motivos 2/3/4/8 no catálogo/UI/SQL; validação fiscal de 3/4/8 é dependência externa | `payload-nce.ts:17–19; page.tsx:317–320` |
| RN-05 | ✅ CÓDIGO | Primeira NCE APROBADO fixa motivo; CANCELADO preserva motivo; rejeitada não fixa | `nce.ts:75–86; NEX-062:191–196` |
| RN-06 | ✅ CÓDIGO | Múltiplas NCE do mesmo motivo e lock da FE; PostgreSQL não executado | `NEX-062:164–169,185–219` |
| RN-07 | ✅ CÓDIGO | APROBADO consome, RECHAZADO/CANCELADO liberam, outros bloqueiam; sem descartar indeterminados | `NEX-062:90–100,185–219` |
| RN-08 | ⚠️ PARCIAL | Snapshot FE persistido, linhas por ordinal e receptor copiado; SQL só confere parte dos campos fiscais do receptor | `nce.ts:119–189; NEX-062:175–181` |
| RN-09 | ⚠️ PARCIAL | Tabela mostra saldo de quantidades e montos, mas NÃO apresenta código do produto, tributação/IVA da linha e monto já creditado | `page.tsx:348–373` |
| RN-10 | ✅ CÓDIGO | Devolución começa com linhas disponíveis e permite remover/reduzir; preços/IVA imutáveis na API | `nce-entradas.ts; payload-nce.ts:134–142` |
| RN-11 | ◇ NÃO COMPROVADO | Crédito total IVA incluso por linha implementado; representação fiscal de 3/4/8 (qtd=1/preço=monto) sem confirmação real | `payload-nce.ts:143–155` |
| RN-12 | ✅ CÓDIGO | Validação decimal, IVA, limites por linha, total; falta execução SQL e prova com SIFEN | `payload-nce.ts:166–207; NEX-062:198–222` |
| RN-13 | ◇ NÃO COMPROVADO | Mesma moeda e câmbio original sem edição; conformidade de USD/BRL ainda não comprovada em gateway/SIFEN | `nce.ts:140–143; payload-nce.ts:169–173,258–260` |
| RN-14 | ✅ CÓDIGO | Data/hora do servidor America/Asuncion no momento da emissão | `NEX-062:240–245` |
| RN-15 | ✅ CÓDIGO | Observación opcional em dInfAdic; tamanho e caracteres de controle validados | `payload-nce.ts:174–175,248–262` |
| RN-16 | ⚠️ PARCIAL | Ponto único + sequências independentes FE/NCE; tela não permite configurar NDE/NRE/AFE (tipos futuros declarados) | `NEX-062:352–405; puntos/page.tsx:191–258` |
| RN-17 | ✅ CÓDIGO | Modal antes da reserva e checagem SQL transacional/idempotência; concorrência real não exercitada | `nce.ts:299–380; NEX-062:145–256` |
| RN-18 | ◇ NÃO COMPROVADO | Envio e consulta FE/NCE pelo gateway; tratamento conservador de indeterminados; gateway real não testado | `gateway.ts:340–622; envio.ts; nce-emision.ts` |
| RN-19 | ⚠️ PARCIAL | Pós-envio/histórico/correção e refresh de Documentos implementados; lista de FE na tela NCE fica desatualizada sem ação manual | `page.tsx:86–99,129–156; documentos/page.tsx:134–170` |
| RN-20 | ◇ NÃO COMPROVADO | Worker Node com lease, backoff e sem navegador versionado; execução/ativação real não comprovada; cadência global é futura | `instrumentation.ts; consulta-automatica.ts` |
| RN-21 | ✅ CÓDIGO | Corregir y emitir nueva precarga nova proposta; rejeitada histórica preservada | `nce.ts:387–422; page.tsx:137–156` |
| RN-22 | ✅ CÓDIGO | Cancelamento só reconhecido via consulta oficial; saldo liberado e motivo histórico preservado; sem solicitação de cancelamento V1 | `NEX-062:92–100,191–196; NEX-054` |
| RN-23 | ⚠️ PARCIAL | Sessão, tenant/alcance e SECURITY DEFINER; reforçar comparação SQL de todo receptor e detalhes fiscais com FE imutável | `servidor.ts; NEX-062:129–220,411–468` |
| RN-24 | ✅ CÓDIGO | Sem lançamentos automáticos em estoque, financeiro ou pagamentos | `rotas e NEX-062 (sem escrita inventário/financeiro)` |

## 3. Matriz integral — 23 critérios de aceite

| ID | Estado | Exigência e confronto | Evidência / referência |
|---|---|---|---|
| CA-01 | ✅ CÓDIGO | Menu abre formulário; histórico separado | `page.tsx; menu.ts` |
| CA-02 | ⚠️ PARCIAL | FE elegível e filtros; campo UI com maxLength 40 não recebe CDC completo de 44 | `page.tsx:277–289; nce.ts:223–254` |
| CA-03 | ⚠️ PARCIAL | NCE pendiente desabilitada; lista não atualiza em background enquanto aberta | `page.tsx:86–99,274–300` |
| CA-04 | ⚠️ PARCIAL | Snapshot original usado pela aplicação; integridade fiscal completa não conferida pelo SQL | `nce.ts:119–189; NEX-062:175–181` |
| CA-05 | ✅ CÓDIGO | Produtos repetidos por ordinal FE não se juntam | `payload-nce.ts:64–103; nce_lineas PK ordinal` |
| CA-06 | ✅ CÓDIGO | Devolución com valores máximos/remoção/redução | `nce-entradas.ts; page.tsx:101–121,348–381` |
| CA-07 | ◇ NÃO COMPROVADO | Crédito monetário por linha no código; formato dos motivos 3/4/8 sem NCE real aprovada | `payload-nce.ts:143–155` |
| CA-08 | ✅ CÓDIGO | Motivo fixado no primeiro APROBADO, inclusive CANCELADO | `NEX-062:191–196` |
| CA-09 | ✅ CÓDIGO | Parciais múltiplas e limite por linha | `NEX-062:198–222` |
| CA-10 | ✅ CÓDIGO | Bloqueio para indeterminadas/pendentes e lock da FE | `NEX-062:164–169,185–189` |
| CA-11 | ✅ CÓDIGO | Cancelamento reconhecido libera saldo, mantém histórico/motivo | `NEX-062:92–100,191–196` |
| CA-12 | ⚠️ PARCIAL | Ponto único e FE/NCE independentes; tipos futuros só previstos no modelo | `puntos/page.tsx:191–258; NEX-060/062` |
| CA-13 | ◇ NÃO COMPROVADO | Moeda e FX originais; norma USD/BRL não verificada externamente | `payload-nce.ts:171–173,258–260` |
| CA-14 | ✅ CÓDIGO | Hora Paraguai do servidor, observação fiscal | `NEX-062:240–251; payload-nce.ts:261` |
| CA-15 | ✅ CÓDIGO | Modal preflight/idempotência; SQL revalida quantidade/monto e reserva uma vez | `nce.ts:299–380; NEX-062:164–256` |
| CA-16 | ◇ NÃO COMPROVADO | iTiDE=5/iMotEmi/CDC/Detalhes/Subtotais gerados; esquema 3/4/8 e contrato real não confirmados | `payload-nce.ts:238–289` |
| CA-17 | ✅ CÓDIGO | Redirect e consulta SIFEN separados de HTTP 200; resultado real não provado | `page.tsx:196–212; gateway.ts` |
| CA-18 | ◇ NÃO COMPROVADO | Worker e refresh projetados; navegador/Node/VM reais não testados | `instrumentation.ts; consulta-automatica.ts` |
| CA-19 | ✅ CÓDIGO | Correção de rejeitada inicia NCE nova mantendo histórico | `nce.ts:387–422` |
| CA-20 | ✅ CÓDIGO | Sem efeito sobre estoque/financeiro, tenant vinculado | `NEX-062; rotas` |
| CA-21 | ◇ NÃO COMPROVADO | Migration NEX-062, rollback e runner existem; não aplicados/validados em PostgreSQL | `NEX-062, reversion-NEX-062, aplicar-migraciones.sh` |
| CA-22 | ◇ NÃO COMPROVADO | Suites pontuais relatadas aprovadas; testes SQL T26 e fluxos reais não executados | `nce.casos.ts; T26; PROGRESSO-NEXIT-V1.md` |
| CA-23 | ✅ CÓDIGO | Auditorias pós-push R01..R04 versionadas; checklist atual amplia escopo | `documentacao/testes/AUD-PRO94-NCE-R04-2026-10-16.md` |

## 4. Divergências concretas demonstradas por inspeção (não repetir testes sem necessidade)

### GAP-INTEGRAL-01 · MÉDIA — tabela de produtos não mostra todos os dados fiscais exigidos
**RN-09 / CA-04, CA-06.** O backend devolve `codigoInterno`, `afectacion`, `tasa`, `montoAcreditado`. Entretanto a tabela em [`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L348) (cabeçalhos linha 352, células 359–373) apresenta ordinal/descrição, quantidade/preço/total, quantidade já creditada/disponível e saldo monetário, **omitindo código do produto, tributação (afectación/tasa IVA) e monto já creditado**. O tipo de linha da página ([`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L19)) sequer declara `afectacion/tasa/montoAcreditado` (exceto `montoAcreditado` declarado), embora o serviço [`lib/facturacion/nce.ts`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/lib/facturacion/nce.ts#L157) os forneça. A modal de confirmação também não mostra IVA por linha. Não é perda fiscal no payload, mas não satisfaz a conferência que o operador solicitou.

### GAP-INTEGRAL-02 · MÉDIA — campo de busca não permite CDC inteiro
**RN-02 / CA-02.** [`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L277) usa um campo `Buscar por número` com `maxLength={40}` (linha 278). O CDC tem **44 dígitos**. O backend [`lib/facturacion/nce.ts`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/lib/facturacion/nce.ts#L241) pesquisa de fato número, CDC e data. Ao usuário, porém, a UI **não permite informar um CDC completo** e tampouco indica que aceita CDC/data. Uma busca por 40 dígitos iniciais pode funcionar por coincidência de prefixo, mas não equivale à pesquisa exata solicitada por CDC completo.

### GAP-INTEGRAL-03 · MÉDIA — estado pendente da FE não é atualizado automaticamente na seleção
**RN-02/RN-19, CA-03.** Na tela NCE, a busca `cargarFacturas` é chamada ao selecionar cliente, clicar Buscar ou trocar página, e **não possui atualização recorrente nem callback ao resultado do worker** ([`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L86), [`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L129), [`app/(private)/notas-credito/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/notas-credito/page.tsx#L274)). Se o gateway confirma NCE enquanto a lista está aberta, a factura continua `NCE pendiente` desabilitada até nova consulta do usuário; diferente da atualização já implementada em **Documentos electrónicos**. Corrigir com refresh leve condicionado/visibilidade, sem novo worker, sem disparar reenvios e sem consultas de gateway excessivas.

### GAP-INTEGRAL-04 · MÉDIA de defesa em profundidade — SQL só confere parte do snapshot/itens
**RN-08/RN-23, CA-04.** O backend TypeScript copia o receptor e calcula `Detalles/Subtotales` a partir do JSON FE emitido. Porém a função `SECURITY DEFINER fe_documento_crear_nce` [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L175) só compara no payload NCE o **nome, RUC, natureza, moeda e câmbio**; não valida igualdade de **DV, endereço, país e demais campos receptor imutáveis**, e tampouco confronta todo `p_payload.Detalles` com as linhas e IVA de `p_lineas` (a soma `p_total` é conferida separadamente). **No fluxo normal**, o serializador calcula esses valores corretamente; **na fronteira de confiança da função SQL** não há defesa completa contra payload fiscal adulterado ou desacoplado da relação de crédito. Defeito de defesa em profundidade; não afirmar que é explorável pela UI atual sem prova. Reforçar invariantes com estratégia proporcional e manter FE operativa.

### ALCANCE-FUTURO-01 · PARCIAL, não bloqueante para emissão FE/NCE
O modelo `fe_punto_secuencias` permite diferentes tipos no **mesmo ponto** (a regra central do responsável). A UI [`app/(private)/facturacion/puntos/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/app/(private)/facturacion/puntos/page.tsx#L258) explicita que **NDE/NRE/AFE ainda não estão disponíveis** e a função [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L368) configura apenas NCE (FE por função preexistente). Portanto, **não criar pontos duplicados ou um ponto exclusivo por tipo**. Não exigir implementar emissão de NDE/NRE/AFE nesta NCE V1; apenas reconhecer que o catálogo multi-tipo completo permanece futuro.

## 5. Dependências não demonstradas, não confundir com defeito

1. **Motivos 3/4/8 no gateway/SIFEN:** o código usa `dCantProSer=1`, `dPUniProSer=monto total`. Só há amostra fornecida de **Devolución (motivo 2) aprovada**. Não declarar aprovação real de Descuento/Bonificación/Ajuste de precio. O exemplo autorizado do gateway contém `iTipTra`; o builder NCE não o inclui ([`lib/facturacion/payload-nce.ts`](https://github.com/proceit-tech/distribuidora/blob/d635580140399bc7a7a6e8ea8ec0e990b2c4ddba/lib/facturacion/payload-nce.ts#L252)): a diferença deve ser **validada contra contrato/Manual Técnico**, sem inventar obrigatoriedade/rejeição.
2. **PYG/USD/BRL e câmbio original:** política implementada, mas conformidade efetiva do campo cambial e valores fiscalizados em operações estrangeiras não comprovada junto ao provedor.
3. **NEX-062/T26:** SQL/rollback e scripts versionados, porém nenhum teste com PostgreSQL. `T26` insere dados artificiais e **NÃO pode rodar na única base real**. Não supor ambiente de staging existente.
4. **Worker sem navegador:** `instrumentation.ts` e lease estão codificados; não se comprovou arranque real sob configuração Docker/Node/VM, nem entrega/conectividade SIFEN real. Cadência/horizonte GLOBAL FE/NCE/outros foi expressamente adiado pelo responsável; não reabrir entrevista para isso.
5. **KuDE/PDF/XML:** gateway real ainda sem contrato confirmado para recuperação destes arquivos; não assumir entrega nem adicionar endpoint inventado à V1.
6. **Outros limites:** auth, logs, mutações e concorrência SQL não foram comprovados em PostgreSQL em execução; testes focados reportados por Claude são evidência de sua execução local, mas ChatGPT não os repetiu.

## 6. Resultado e continuidade

**A R04 aprovou estáticamente a última correção de CDC; não certificou a totalidade das 47 exigências.** Este checklist registra **4 diferenças verificáveis**, uma extensão futura do catálogo de tipos e pendências de evidência fiscal/operacional. Não substituir essa constatação por “tudo pronto” nem anular as correções anteriores.

**Nenhuma ação executada no ambiente real. Nenhum teste solicitado/repetido ao Claude por este checklist.** A decisão sobre um único ciclo **focado em preencher as lacunas demonstradas**, sem repassar testes já executados, é do responsável. O planejamento da execução SQL e do deploy é separado, condicionado ao aceite explícito do responsável, com backup e procedimento versionado.

**Estado do PRO-94:** `CHECKLIST_INTEGRAL_CON_LACUNAS`; `NCE_V1_NO_HOMOLOGADA`. Aprovado estáticamente em R04 **apenas quanto ao ajuste de CDC**.
