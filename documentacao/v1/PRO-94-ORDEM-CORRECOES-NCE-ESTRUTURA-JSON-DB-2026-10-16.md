# PRO-94 — Ordem de implementação Claude Code: auditoria estrutural NCE V1 (CDC, JSON, banco, precisão)

**Data:** 2026-10-16  
**Autorização:** responsável autorizou **Claude Code a implementar em um ciclo** as 4 correções comprovadas pela auditoria estrutural.  
**Divisão:** Claude Code desenvolve, realiza exclusivamente verificações focadas, commita/pusha e **PARA**; ChatGPT faz auditoria técnica independente **AUD-PRO94-NCE-ESTRUTURA-R01** do SHA; responsável humano aprova/aplica SQL, deploy e homologa no ambiente real.  
**Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Fonte normativa:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` — RN-03, RN-07/08, RN-12, RN-17/18/19, RN-23; CA-04, CA-09/10, CA-15/16/17/20/21/23.  
**Auditoria e evidência canônicas:** `documentacao/testes/AUD-PRO94-NCE-ESTRUTURA-JSON-DB-ENDTOEND-2026-10-16.md`.  
**Protocolos obrigatórios:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, contexto PRO-94 de `PROGRESSO-NEXIT-V1.md`.  
**Estado:** `NEX-062 NÃO aplicada`; `T26 NÃO executado em PostgreSQL`; `NCE NÃO homologada`.

## 1. Escopo fechado e matriz de aceite

| ID | Severidade | Problema comprovado | Entrega de código exigida |
|---|---|---|---|
| **NCE-DB-01** | Alta | Devolución PYG com quantidade fracionária pode produzir **total PYG fracionário**, proibido na RN-12. | Validar integridade de total PYG no cálculo do servidor **e na fronteira SQL**, antes de consumir numeração. Nunca truncar/arredondar silenciosamente. |
| **NCE-DB-02** | Alta | `documentos_electronicos.total numeric(20,4)` pode arredondar NCE com 5–8 decimais; `nce_lineas.monto numeric(24,8)` e JSON não arredondam. | Garantir **correspondência exata** de total principal, linhas e JSON; bloquear escala não representável em `numeric(20,4)` antes da reserva. Se demonstrada necessidade de 5–8 decimais no total do documento principal, documentar a incompatibilidade e propor migration **nova e isolada**, sem executá-la nem alterar NEX-047. |
| **NCE-UI-03** | Média | `Documentos electrónicos` não exibe `nce_origen.fe_cdc`, apesar de mostrar o CDC da NCE e número da FE. | Exibir separadamente **«CDC de la factura original»** e **«CDC de la nota de crédito»**, rotulados corretamente e obtidos do banco. |
| **NCE-DB-04** | Baixa | `nce_lineas.fe_id` pode divergir do `nce_origen.fe_id` porque a FK atual só cobre `empresa_id,nce_id`. | Fortalecer integridade relacional **na NEX-062 ainda não aplicada** (preferir FK composta ao pai com chave única compatível), preservando empresa e ordinal. |

**Não** declarar implementação concluída antes de registrar as quatro correções e verificar seus critérios dirigidos. Os 4 achados não implicam que houve falha real no PostgreSQL: a NEX-062 ainda não foi aplicada.

## 2. NCE-DB-01 — PYG sem centavos no TOTAL

**Causa:** `lib/facturacion/payload-nce.ts` → `validarEntradaNce` aceita devolução `cantidad` até 4 decimais; a multiplicação pelo preço histórico pode gerar centavos. No fluxo monetário 3/4/8 o valor digitado em PYG já exige inteiro, mas isso não cobre motivo 2.

**Ajustes:**
- No validador central, após calcular todos os itens e `Subtotales`, quando `cMoneOpe='PYG'`, exigir `dTotGralOpe` inteiro segundo o contrato do motor FE; fornecer mensagem útil na API/modal (por exemplo, ajustar quantidade) e bloquear emissão antes da reserva. Não converter para inteiro por truncamento, arredondamento ou novo preço.
- Na `fe_documento_crear_nce` da **NEX-062**, repetir a guarda no `p_total` e `Subtotales` recalculados, **antes de buscar/alterar a sequência**. Caso contrário um chamador privilegiado pode contornar o backend.
- Não alterar `calcularItem` geral, a FE já existente, ou as bases/IVA que legitimamente levam até 8 decimais. Verificar se existe regra mais estrita de importes por linha nos documentos PYG e aplicar apenas se confirmada pela especificação/motor já versionado; não inventar nova norma.

**Aceite PYG-01:** devolução 1 unidade × Gs. 1.000 com devolução de `0.0001` ⇒ total `0.1` PYG: API/validador rejeitam, e SQL tem guarda equivalente para bloquear pré-reserva.  
**Aceite PYG-02:** quantidade 1 × Gs. 1.000, motivo 2, aceita; desconto monetário 3/4/8 com PYG inteiro continua válido.  
**Aceite PYG-03:** IVA/bases 8 decimais preservados; nenhuma mutação no saldo, número, JSON ou crédito quando rejeitado.

## 3. NCE-DB-02 — Precisão exata do total persistido

**Causa:** esquema legado compartilhado NEX-047 define `documentos_electronicos.total numeric(20,4)`; a NEX-062 insere `p_total` calculado com precisão de até 8 decimais. PostgreSQL **arredonda na atribuição** valores com escala superior a 4, enquanto `nce_lineas.monto` e `documento_electronico_solicitudes.payload` mantêm até 8.

**Decisão técnica mínima autorizada:** **fail-fast por representabilidade**, preservando a coluna já aplicada: se o total exato da NCE não cabe em `numeric(20,4)`, rejeitar **antes de reservar a numeração**. O sistema jamais pode emitir um documento cujo total principal e JSON/linhas divergem por coerção. Não aumentar o limite de forma oculta e não refatorar toda a FE.

**Ajustes:**
- Validar no `validarEntradaNce` a **representabilidade exata** do total NCE em 4 casas decimais e em `numeric(20,4)`; para PYG aplicar também a exigência de inteiro da seção 2.
- Validar novamente `p_total` e `Subtotales.dTotGralOpe` na NEX-062 antes da reserva, sem depender apenas do tipo de coluna no momento do `INSERT`. A comparação deve ser feita sobre o valor original com precisão integral, sem arredondamento prévio.
- Conferir coerência `Σnce_lineas.monto = dTotGralOpe = documentos_electronicos.total` e consistência com o JSON imutável. Não impedir campos de base/IVA/quantidade que devem continuar a 8 decimais.
- Se a leitura do código e da especificação SIFEN provar que há **obrigação funcional** de aceitar total NCE com >4 casas, **não editar NEX-047**: registrar explicitamente como bloqueio de arquitetura e propor **migration incremental adicional**, com análise de impacto global FE/relatórios e rollback, para autorização futura separada. Não executar uma migration nova por iniciativa própria.

**Aceite PREC-01:** NCE em USD/BRL com total `0.0010` é representável; com `0.0010001` não é — bloquear sem consumir número; moeda/câmbio originais e F023 devem continuar válidos.  
**Aceite PREC-02:** total `0.0001` (estritamente positivo) representável; `0.00001` não, mesmo que item/base/IVA possam ser representados a 8 decimais.  
**Aceite PREC-03:** `p_total`, subtotal do JSON, soma dos itens e total gravado não divergem; mesmas validações no servidor e na função SQL.  
**Aceite PREC-04:** FE, FAT-E2, idempotência, limites de `numeric(20,4)`, sequências e créditos anteriores não sofrem regressão. Sem mudança em NEX-047.

## 4. NCE-UI-03 — Diferenciar CDC original de CDC próprio

**Causa:** `lib/facturacion/shared.ts` → `COLUMNAS_NCE` retorna `feNumero`, `feId`, `nceMotivo`, mas não `o.fe_cdc`. `app/(private)/documentos/page.tsx` mostra a FE original pelo número, mas campo `CDC` é o CDC **da NCE**.

**Ajustes:**
- Retornar `o.fe_cdc AS "feCdc"` **somente** no SELECT NCE já escopado por empresa/sucursal; não realizar consulta livre por CDC sem filtro de tenant.
- No detalhe de **Documentos electrónicos**, para NCE mostrar separadamente `Factura original: número + CDC de la factura original` e `CDC de la nota de crédito`, mesmo que a NCE ainda não tenha CDC próprio (valor `Aún no informado`). FE normais conservam seu campo CDC sem mudanças.
- Opcional mostrar ambos na linha resumida de NCE somente se o layout continuar compacto; detalhe do documento é obrigatório. CDC original não deve ser adivinhado do CDC próprio nem criado artificialmente.

**Aceite UI-01:** NCE com `fe_cdc=44 dígitos` exibe FE nº, CDC original e CDC próprio distintos e corretos.  
**Aceite UI-02:** NCE pendente ainda sem CDC próprio mostra o original e a indicação de pendência, sem fingir aprovação.  
**Aceite UI-03:** uma FE normal e empresas fora do alcance não expõem relação de outro tenant; nenhuma quebra se NEX-062 ainda não está presente (fallback seguro existente sem feCdc).

## 5. NCE-DB-04 — Restrição relacional completa nas linhas creditadas

**Causa:** `nce_lineas(empresa_id,nce_id,fe_id,linea)` tem somente FK `(empresa_id,nce_id)` para `nce_origen`. A função de criação grava `p_fe` corretamente nas duas, mas o esquema isolado ainda permite `nce_lineas.fe_id` distinto do `nce_origen.fe_id` se inserido fora desse caminho.

**Ajustes:**
- Na **NEX-062 ainda não aplicada**, fortalecer a relação com uma constraint **sem nullable bypass**, preferencialmente `UNIQUE(empresa_id,nce_id,fe_id)` no `nce_origen` + `FOREIGN KEY (empresa_id,nce_id,fe_id)` em `nce_lineas`; analisar índices/exclusividade/performance e evitar constraints duplicadas desnecessárias.
- Respeitar triggers de imutabilidade de `nce_origen` e `nce_lineas`, FKs compostas existentes, isolamento multiempresa, `ON DELETE CASCADE` apenas nas exceções já autorizadas de reinício DEMO. Não afrouxar regras para resolver T26.

**Aceite DB-04-01:** `fe_id` igual ao vínculo NCE original é permitido; `fe_id` diferente é rejeitado; mesma UUID de outra empresa não atravessa FK; regravar UPDATE/DELETE continua proibido.  
**Aceite DB-04-02:** T26 versionado cobre cenário correto e incorreto, mas **NÃO é executado em PostgreSQL operacional**. A auditoria humana de migration verificará efeito real antes do deploy.

## 6. Integridade do JSON e contrato do gateway — NÃO INVENTAR CÓDIGO OU PROVA

A auditoria estrutural apontou **dependências de confirmação externa**, não erros de payload provados. Claude deve **verificar de forma estática e documentar lacunas reais**, sem alterar o contrato gateway por suposição:

- `iTiDE=5`, motivos `iMotEmi=2/3/4/8`, `DocumentosAsociados[0].dCdCDERef = fe_cdc`, `Detalles[]`, `Subtotales[]` e `dInfAdic` opcional: garantir preservação, sem importar dados de emissor antigos em vez de dados atualizados do gateway.
- MT/SIFEN exige no XML `dDesMotEmi` (E402), mas o cliente gateway atual envia só `iMotEmi`; **não adicionar campo plano nem inventar endpoint** sem evidência do contrato do gateway. Registrar claramente como dependência de transformação JSON→XML a homologar.
- Uma única amostra de NCE motivo **2 Devolución** foi fornecida como efetivamente aprovada; não alegar que 3/4/8, USD/BRL ou PDF/KuDE/XML foram aprovados. Manter a representação monetária aprovada em produto até prova externa.
- Validações de tamanho atuais: 44 CDC, 3 est/pun, 7 número, obs `dInfAdic` até 5000, número itens ≤999, `payload` em DB `pg_column_size(payload) <262144`, totais e bases até 8 decimais na calculadora, `documentos_electronicos.total numeric(20,4)`, resposta gateway sanitizada. **Não alterar limites sem referência normativa**; conferir se um JSON com até 999 linhas pode estourar o teto em bytes e se falha em pré-validação pode deixar número reservado. Se houver defeito demonstrável, registrar e corrigir somente dentro da emissão NCE e sem refatoração transversal não autorizada.
- CDC próprio pertence a `documentos_electronicos.cdc` da NCE quando informado de modo coerente; original a `nce_origen.fe_cdc`. `ENVIADO` por HTTP/lote não significa `APROBADO`; não reenviar timeout nem NCE com resposta indeterminada.

**Critério documental:** resultado da comparação do contrato/limites deve ficar **apenas no progresso canônico** com prova ou impedimento explícito, não em novo relatório paralelo. Não fazer solicitações externas/gateway para completar a análise.

## 7. Testes focados, migração e saída

1. Antes de qualquer mudança: `git status`, verificar branch e arquivos locais; `git fetch` e sincronização fast-forward segura. Ler **integralmente** `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`, além das seções PRO-94 do progresso, requisito NCE e auditoria estrutural; esta ordem é a referência. Preservar arquivos e modificações locais; conflitos implicam parar.
2. **Uma única entrega:** implementar quatro ajustes e actualizar T26/rollback quando necessário, **somente a NEX-062 ainda não aplicada**. Não editar NEX-047, NEX-048, NEX-049, NEX-050, NEX-054 ou migrations antigas aplicadas; se uma mudança em schema aplicado for tecnicamente indispensável, registrar bloqueio e aguardar autorização humana, não criar ALTER silencioso.
3. **Testes mínimos**: ampliar `nce.casos` com casos PYG fracionário e válido; total estrangeiro 4 versus >4 casas; contrato de seleção `feCdc` e layout de detalhe; checks estáticos da FK composta. Atualizar **somente cenários relevantes** de T26 (incluindo valores válidos, inválidos e ausência de reserva); **NÃO executar T26/SQL em PostgreSQL real**. Não repetir suítes amplas anteriores, `tsc` geral, build, lint global, CI manual, VM/SSH/Docker/gateway/SIFEN. Verificação sintática localizada é suficiente quando necessária.
4. Preservar saldos, créditos aprovados, motivos fixos, idempotência, bloqueio por NCE pendente, quantidade fracionária legítima sem fração monetária inválida, isolamento tenant/sucursal, fe_cdc original, novo CDC NCE, numeração NCE independente FE no mesmo ponto e todas as regras RN-01..RN-24 que não estão em escopo.
5. Registrar somente status das correções, resultados **realmente executados** e limites em `PROGRESSO-NEXIT-V1.md`. Fazer commit e push da branch oficial; **não mergear em main**; não editar `AUD-*`. Informar ao responsável **SHA completo, número de testes focados, estado dos bloqueios e NEX-062 NÃO APLICADA**. **PARAR** para ChatGPT realizar `AUD-PRO94-NCE-ESTRUTURA-R01` por inspeção independente do SHA.
6. **NEX-062 continua não aplicada e NCE não homologada.** Nenhuma ordem de implantação ou teste com PostgreSQL operacional é autorizada nesta tarefa. Responsável humano decide aplicação/homologação em oportunidade separada.

## 8. Checklist do auditor (ChatGPT após SHA)

- [ ] PYG Devolución: total inteiro, positivos válidos, bloqueio pré-numeração tanto TypeScript quanto SQL; bases/IVA com 8 decimais intactos.
- [ ] Total NCE representável exatamente em `numeric(20,4)` na API e NEX-062; sem divergência entre doc, JSON e linhas; sem alteração de tabela FE legada.
- [ ] `feCdc` original de 44 dígitos e `cdc` NCE próprio aparecem rotulados corretamente na consulta/documento; resposta segura quando NEX-062 ausente.
- [ ] FK `nce_lineas.fe_id` → `nce_origen.fe_id` e compostas por empresa, imutabilidade e rollback/grants/T26 íntegros.
- [ ] Gateway JSON/estados/tentativas/CDC e controle de duplicidade intactos; eventuais lacunas de contrato identificadas como **não homologadas**.
- [ ] Testes pontuais relatados, sem SQL/VM/gateway real; parar sem encadear tarefa e sem declarar `100% homologado`.

**Veredito necessário após a implementação:** somente com SHA auditado, sem presumir aprovação de PostgreSQL ou SIFEN.
