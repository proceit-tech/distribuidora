# AUD-PRO94-NCE-ESTRUTURA — revisão independente de banco, vínculos, JSON, envio, estados e comprimentos

**Data:** 2026-10-16 · **Auditor:** ChatGPT · **Escopo solicitado pelo responsável:** revisar NCE V1 novamente, do zero, com foco em associação pelo CDC, armazenamento de NCE enviadas, limites dos campos, JSON e integração de envio/consulta.  
**Repositório:** `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. Código inspecionado inclui as alterações do commit `10a508178a3705a00d0cd859f8336c2d7e469137` e auditoria documental posterior.  
**Fonte funcional:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md`, RN-01..24 e CA-01..23. Normas `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` e progresso PRO-94 consultados.  
**Referência normativa externa seletiva:** [Manual Técnico DNIT/SIFEN versão 150](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf), campos E401/E402 e J003. **Não presumir que o JSON proprietário do gateway mapeia diretamente para XML SIFEN.**

## Parecer

**NCE V1 NÃO ESTÁ PRONTA PARA APLICAÇÃO/HOMOLOGAÇÃO.** O desenho relacional NCE→FE pelo CDC existe em código e a cadeia de gateway está implementada, mas a revisão identificou **2 divergências monetárias concretas** (uma de validação PYG e uma de precisão do banco), **1 deficiência de rastreabilidade visual** e **1 fragilidade relacional defensiva**. Persistem dependências do contrato real do gateway/SIFEN nos quatro motivos, XML e campos derivados.

**Base operacional:** NEX-062 **não aplicada** (conforme progresso atual). Esta auditoria **não executou** SQL, T26, migração, VM, Docker, navegador ou gateway/SIFEN; não informa que a tabela existe fisicamente no PostgreSQL. Não solicitar novos testes gerais ao Claude por reflexo desta auditoria.

## 1. Resposta direta: há tabela própria para NCE enviada associada pelo CDC?

**SIM, há relacionamento específico, mas NÃO uma tabela monolítica exclusiva de «NCE enviadas».** O projeto emprega 5 estruturas, cada uma com responsabilidade diferente:

| Tabela | Guarda | Relacionamento |
|---|---|---|
| `documentos_electronicos` (NEX-047) | Um registro para cada FE e NCE, `tipo`, estabelecimento/ponto/número, **CDC próprio** da NCE quando informado, data, receptor, moeda, total, `estado_local`, `estado_sifen`, lote, erros e momentos | `id` UUID, `empresa_id`, tipo NCE. Contém pendentes, enviadas, aprovadas e rejeitadas. |
| `nce_origen` (NEX-062) | Vínculo específico **NCE→FE**, `nce_id`, `fe_id`, **`fe_cdc` (44 dígitos)**, motivo 2/3/4/8, observação, data | PK `(empresa_id,nce_id)`; FK composta para o documento NCE e para a FE. Trigger confere `tipo=NCE`, `tipo=FE` e `fe_cdc=cdc` da FE; índice `(empresa_id,fe_id)`. |
| `nce_lineas` (NEX-062) | Crédito por linha original: ordinal `linea`, quantidade devolvida e valor creditado | PK `(empresa_id,nce_id,linea)`; vincula-se a `nce_origen`. |
| `documento_electronico_solicitudes` (NEX-048) | JSON fiscal emitido NCE/FE (imutável), versão, `payload_hash`, `entrada_hash`, usuário e data | FK composta para `documentos_electronicos`; a função de criar NCE insere sua versão 1. |
| `documento_electronico_intentos` (NEX-047/049/050) | Tentativas de **ENVIO/CONSULTA**, resultado, HTTP, lote, CDC informado, status SIFEN, mensagens e usuário real | FK ao mesmo documento UUID da NCE. Evidência imutável. |

**Evidências:** [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:35`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L35), [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:79`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L79), [`documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql:76`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql#L76), [`documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql:50`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql#L50).

**Relação prática:** `nce_origen.fe_cdc` é o **CDC da FE original**; `documentos_electronicos.cdc` na linha `tipo='NCE'` é o **CDC da própria NCE**, quando recebido validamente. No JSON, `DocumentosAsociados[0].dCdCDERef` usa o CDC original. O registro em `nce_origen` é criado **antes** do envio, portanto não significa que o gateway o recebeu: a condição `ENVIADO/APROBADO/RECHAZADO` é lida nos estados da tabela geral.

## 2. Auditoria da cadeia completa

| Etapa | Evidência | Veredito estático |
|---|---|---|
| FE original elegível | NEXIT FE `APROBADO`, CDC de 44 dígitos, snapshot original, cliente/alcance; [`lib/facturacion/nce.ts:118`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L118) | Implementado; não confunde ENVIADO com APROBADO. |
| Tela NCE | Cliente, FE, quatro motivos, ponto NCE, linhas e saldos, prévia, modal, histórico [`app/(private)/notas-credito/page.tsx:300`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/notas-credito/page.tsx#L300) | Implementado; há divergência na rastreabilidade CDC na tela de histórico, item 5. |
| Validar/preparar | `leerCuerpoNce` → `prepararNce` → `validarEntradaNce`, cálculo IVA/NT13 [`lib/facturacion/nce.ts:304`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L304) | Falha de limite monetário para devolução PYG, item 3. |
| JSON NCE | `iTiDE=5`, `iMotEmi`, receptor FE (19 campos), mesmo câmbio, referência CDC, detalhes e subtotais, `dInfAdic`; [`lib/facturacion/payload-nce.ts:238`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L238) | Estrutura presente; serialização dos motivos 3/4/8 e geração de E402 pelo gateway **não comprovadas em produção**. |
| Criar/persistir | `fe_documento_crear_nce` garante lock FE, crédito por linha, motivo, ponto, sequência independente, JSON e vínculos na mesma transação [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:104`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L104) | Implementado; campo principal `total` tem apenas 4 decimais (item 4). |
| Envio | Preflight → documento persistido → `fe_documento_iniciar_envio` → POST `/api/recepcion_de` → persistir tentativa [`lib/facturacion/nce-emision.ts:58`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce-emision.ts#L58), [`lib/facturacion/envio.ts:160`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/envio.ts#L160) | Implementado; indeterminado sem reenvio cego; gateway NCE não exercitado. |
| Consulta/status | POST `/api/consulta_de` `tipoDoc:"NCE"`; função SQL registra tentativas e CDC coerente; worker server-side [`lib/facturacion/gateway.ts:311`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/gateway.ts#L311), [`lib/facturacion/consulta-automatica.ts:43`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/consulta-automatica.ts#L43) | Implementado; HTTP 200 não implica APROBADO; worker real ainda não validado. |
| Histórico/correção | `Documentos electrónicos`, estado NCE, motivo, FE relacionada e `Corregir y emitir nueva` [`lib/facturacion/shared.ts:78`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/shared.ts#L78), [`app/(private)/documentos/page.tsx:406`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L406) | Parcial: exibe número da FE, mas não o CDC original armazenado em `nce_origen`. |
| Cancelamento externo posterior | Consulta manual ao gateway pode detectar `APROBADO→CANCELADO`; worker só monitora pendentes | Sem reconsulta automática de NCE já aprovada; a cadência global permanece fora da V1 por decisão do responsável. |

## 3. Achado NCE-DB-01 — ALTA: devolução PYG permite montante fracionário

**Evidências:** [`lib/facturacion/payload-nce.ts:117`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L117)–164, [`lib/facturacion/payload-nce.ts:167`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L167)–209, [`documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md:42`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md#L42) (RN-12).

- Para **motivos 3/4/8**, o valor digitado em PYG é lido com `parseDec(...,0)` e não admite frações.
- Na **Devolución (motivo 2)**, a quantidade permite até 4 casas e `calcularItem` multiplica pela unidade de preço original (até 8 casas), produzindo valores fracionários. `validarEntradaNce` exige exatidão e total positivo, mas **não exige que o TOTAL PYG seja inteiro**.
- **Exemplo demonstrativo válido pela lógica estática:** FE PYG de 1 unidade × Gs. 1.000, devolução de 0,0001 unidade ⇒ crédito calculado Gs. **0,10**, que passa pela validação decimal da NCE (saldo suficiente, quantidade <= disponível, >0), apesar da regra interna explícita **PYG sem centavos nos totais**. Não foi enviado ao gateway.
- Impacto: JSON e saldo fiscais PYG com fração, potencial desacordo com a política do sistema e possível rejeição pelo provedor. Bloquear tal resultado **antes de reservar número**, com erro claro; não arredondar silenciosamente nem alterar FE histórica.

**Correção a especificar depois da autorização:** validar `sub.dTotGralOpe` e cada importe monetário PYG conforme regra vigente de representabilidade de FE, em especial em devoluções parciais. Uma alternativa legítima pode exigir outra quantidade de devolução — a IA não deve impor arredondamento que exceda saldo. Provar ao menos 1 exemplo positivo e 1 negativo no cálculo puro.

## 4. Achado NCE-DB-02 — ALTA/MÉDIA: precisão da tabela de documento diverge do JSON e das linhas

**Evidências:** [`documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql:76`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql#L76) `documentos_electronicos.total numeric(20,4)`, [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:55`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L55) `nce_lineas.monto numeric(24,8)`, [`lib/facturacion/payload-nce.ts:123`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L123) e [`lib/facturacion/nce.ts:375`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L375).

- O JSON/linhas NCE podem levar até 8 decimais. O registro principal `documentos_electronicos.total` tem somente **4 casas decimais**, que o PostgreSQL arredonda ao inserir valores com mais casas; a coluna não tem `CHECK` comparando total principal com linha/JSON.
- **Exemplo lógico estrangeiro:** uma FE USD já aprovada com quantidade original 1 e preço 10,001; devolução de 0,0001 unidade ⇒ crédito 0,0010001 USD (7 casas), dentro da precisão fiscal dos cálculos; com câmbio histórico 7300, F023 é 7,30073, também exato. `nce_lineas.monto` e JSON comportam `0,0010001`, mas `documentos_electronicos.total numeric(20,4)` persistirá `0,0010`. O sistema pode exibir total arredondado enquanto o crédito real contábil fiscal segue exato.
- Isto não demonstra perda efetiva de documento em produção (NEX-062 não aplicada), mas revela **contrato de precisão inconsistente e reproduzível por análise estática**.

**Correção segura depende de decisão técnica de compatibilidade:** opção A, **bloquear previamente** NCE cuja magnitude/escala não cabe exatamente em `numeric(20,4)`; opção B, **nova migration incremental** para alargar a precisão da coluna principal se o contrato fiscal exigir 8 casas, sem alterar retrospectivamente NEX-047 aplicada. Não aceitar persistência silenciosamente arredondada nem aplicar ALTER automaticamente na VM. A correção deve preservar FE e estado/financeiro.

## 5. Achado NCE-UI-03 — MÉDIA: CDC original existe no banco, mas falta no histórico visual

**Evidências:** [`lib/facturacion/shared.ts:78`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/shared.ts#L78) `COLUMNAS_NCE` seleciona `feNumero`, `feId`, `nceMotivo`, porém **não** `o.fe_cdc`. [`app/(private)/documentos/page.tsx:406`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L406) mostra número da FE e [`app/(private)/documentos/page.tsx:407`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L407) mostra o `d.cdc` da NCE — não o `fe_cdc` original.
- O vínculo por CDC está corretamente persistido em `nce_origen.fe_cdc` e no `DocumentosAsociados[0].dCdCDERef`.
- **Falta apenas expor** «CDC de la factura original» com o valor real guardado, separado de «CDC de la nota de crédito», na vista de histórico/detalhe NCE, mantendo isolamento por empresa e sucursal; não inventar CDC quando não informado.
- Em consultas e auditorias, confundir os dois CDC prejudica rastreabilidade mesmo sem dano ao vínculo.

## 6. Achado NCE-DB-04 — BAIXA (defesa em profundidade): fe_id redundante em nce_lineas sem relação composta ao pai

**Evidência:** [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:50`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L50).
- `nce_lineas` inclui `fe_id` e FK `(empresa_id,nce_id)` para `nce_origen`, mas não há FK/constraint garantindo que `nce_lineas.fe_id` **seja igual** a `nce_origen.fe_id` da mesma NCE.
- A função única de criação já grava os dois com `p_fe`, e a role runtime não tem escrita direta; **não há evidência de linha incoerente real**. É uma brecha apenas na defesa do modelo em eventual importação administrativa/alteração de função no futuro.
- Reforçar, se aprovado, com regra relacional apropriada (FK composta com UNIQUE compatível no pai ou trigger imutável específico), sem tocar dados já registrados; não é urgente frente aos valores monetários.

## 7. Dimensões/limites do banco versus JSON

| Campo/elemento | Tamanho em código/schema | Situação |
|---|---|---|
| `documentos_electronicos.establecimiento`, `punto_expedicion` | **3 dígitos** cada | CHECK regex. |
| `documentos_electronicos.numero` | **7 dígitos** | CHECK regex + sequência NCE independente da FE. |
| `documentos_electronicos.cdc`, `nce_origen.fe_cdc` | **44 dígitos** | CHECK; próprio NCE e original FE distintos. |
| `nce_origen.motivo` | `smallint` valores 2,3,4,8 | Alinhado à V1. |
| `nce_origen.observacion` / `dInfAdic` | **0–5000 caracteres**, com campo opcional; frontend/servidor limitam a 5000 | Manual DNIT J003: **1–5000 quando preenchido**, fora da assinatura fiscal, não integra DTE enviado ao SIFEN; confirmar adaptação do gateway. |
| `nce_lineas.linea` | ordinal **1…999** | PK por NCE+ordinal; não mescla produtos repetidos. |
| `nce_lineas.cantidad` | `numeric(20,8)` | API de devolução aceita entrada com até 4 casas, registros com 8. |
| `nce_lineas.monto` | `numeric(24,8)` | 8 casas — divergente de `documentos_electronicos.total` em alguns casos. |
| `documentos_electronicos.total` | `numeric(20,4)` | **PRECISÃO INCOMPATÍVEL** com certos valores gerados pela NCE. |
| `documento_electronico_solicitudes.payload` | `jsonb`, **menos de 262.144 bytes** `pg_column_size` | Limite real do snapshot persistido; 999 linhas não garantem caber em JSON, depende do tamanho efetivo. |
| `payload_hash`, `entrada_hash` | **64 caracteres hexadecimais** cada | Hashes imutáveis. |
| `clave_idempotencia` | **8–120 caracteres** | Validada na API e SQL. |
| `documentos_electronicos.lote` | **1–60 caracteres** quando presente | Preserva retorno gateway aceito. |
| `mensaje_respuesta` / tentativa `mensaje` | **máx. 500 caracteres** | Sanitiza e limita mensagens. |
| `documento_electronico_intentos.request_id` | **máx. 80 caracteres** | Auditoria do envio/consulta. |
| `documento_electronico_intentos.respuesta` | `jsonb` < **65.536 bytes**, e servidor sanitiza/trunca JSON longo (>30.000 caracteres) | Registro durável resumido, **não** cópia integral garantida do bruto do gateway. |
| `dTotalGs` F023 USD/BRL | **≤8 decimais, até 15 dígitos inteiros** por validação SQL/TS | Preserva câmbio FE, sem arredondamento; execução SQL/gateway não comprovada. |

**Fontes de schema:** NEX-047 (documentos/tentativas), NEX-048 (solicitações), NEX-049/050 (envio), NEX-062 (relações/precisão), `payload-nce.ts`, `gateway.ts`. Notar que **nem todos os campos textuais fiscais internos do JSON têm um CHECK de comprimento individual em PostgreSQL**: muitos são herdados do snapshot FE aprovada. Não afirmar que todos os máximos normativos SIFEN foram executados/testados só porque o JSON está serializado.

## 8. Contrato JSON/SIFEN — pontos que precisam de prova e não devem ser reportados como bug confirmado

1. **Motivos 2/3/4/8:** `construirPayloadNCE` envia `iTiDE=5`, `iMotEmi` e para motivos 3/4/8 usa `dCantProSer=1` e `dPUniProSer` como valor integral do crédito por linha. Somente a NCE **Devolución (motivo 2)** foi fornecida como exemplo aprovado pelo gateway, conforme requisito. Não consta homologação real de 3/4/8.
2. **E402 obrigatório no XML:** Manual Técnico v150 DNIT grupo E5: `dDesMotEmi` descrição 6–30 caracteres, ocorrência 1–1, coerente com E401. O JSON cliente construído usa `iMotEmi` sem `dDesMotEmi`. Isto **não prova falha**, porque o gateway proprietário pode gerar descrição/grupo XML automaticamente. **É obrigatório verificar o JSON→XML produzido pelo gateway**, não confundir campos planos da API com XML assinado.
3. **Emissor/credencial:** `dInfoEmi/dInfoFisc` não são copiados da FE; enviados como NULL para gateway preencher conforme contrato do provedor. Não comprova que a NCE saiu assinada até um retorno real/exemplo sanitizado.
4. **Associados:** `DocumentosAsociados[0]` contém `iTipDocAso=1` e CDC da FE original; limites/tratamento de outros campos fiscais H dependem do mapeamento real do gateway. Uma NCE usa uma única FE.
5. **`dInfAdic`:** no Manual SIFEN v150 (J003) a informação adicional é opcional 1–5000 caracteres, **não vai ao SIFEN como parte assinada do DTE**. A propriedade plana é entregue ao gateway para tratamento; cabe confirmar que o provedor a deixa onde corresponde.
6. **Completude de anexos:** o histórico indica que PDF/KuDE/XML não podem ser baixados pelo NEXIT porque os endpoints ainda não foram confirmados com o provedor. Não inventar uma API de download.
7. **Retornos:** backend distingue HTTP/lote (recebido) de APROBADO, registra CDC quando coerente, rejeição definitiva e tentativas, não reenvia timeout/indeterminado às cegas. A resposta de gateway sanitizada pode perder o JSON bruto grande por desenho — evidência resumida, não XML original garantido.

## 9. Escopo operacional e encaminhamento

**Código:** não declarar `100%`, `homologado`, nem `pronto para aplicar` antes de resolver DB-01, DB-02 e verificar contrato gateway. Visualização do CDC original (UI-03) é correção de rastreabilidade; DB-04 é hardening opcional.

**Banco:** NEX-062 NÃO aplicada. Se a solução de DB-02 exigir alterar precisão de `documentos_electronicos.total`, isso envolve tabela preexistente e demanda **migration incremental nova**, pré-verificação, backup e plano de reversão, **nunca editar migration aplicada nem executar por IA**. Se optar por restringir a NCE a 4 decimais, validar previamente no TypeScript e SQL de NEX-062 e documentar o limite funcional; não permitir arredondamento silencioso.

**Testes:** a auditoria inspecionou GitHub, SQL/TypeScript e Manual DNIT. **Nenhuma suíte/SQL/VM executados**. T26 contém dados sintéticos e nunca deve executar no PostgreSQL operacional. O responsável decide se autoriza Claude a programar correções focadas; o ChatGPT audita após SHA, sem disparar testes globais.

**Parecer:** `AUD-PRO94-NCE-ESTRUTURA = AJUSTES_PENDENTES`, `PRO-94 = In Progress`, `NEX-062 = NÃO APLICADA`, `NCE = NÃO HOMOLOGADA`.
