# AUD-PRO94-NCE-ZERO — Revisão integral independente do zero

**Data:** 2026-10-16 · **Área:** NEXIT V1 / NCE · **Revisor:** ChatGPT.  
**Código-base:** `proceit-tech/distribuidora`, `feature/NEXIT-2026-001-banco-demo`; código de emissão NCE revisado desde entrega [`ba340c6601d30058265ecf3aed4d9a10eb2ba5f1`](https://github.com/proceit-tech/distribuidora/commit/ba340c6601d30058265ecf3aed4d9a10eb2ba5f1), mais auditorias documentais posteriores.  
**Fonte canônica:** `documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md` (24 RN, 23 CA), `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` e progresso relevante do PRO-94.  
**Método:** leitura independente do fluxo UI → rotas → serviços → cálculo → SQL → gateway → worker → histórico, **sem considerar a aprovação R06 prova de conformidade**. Nenhum acesso a VM, PostgreSQL, navegador ou provedor, nenhuma suíte de testes executada por esta auditoria. **NEX-062 permanece não aplicada e T26 não executado em PostgreSQL.**

## Parecer executivo

**NÃO LIBERAR implantação NCE automaticamente.** Há **2 lacunas de código confirmadas**, **1 inconsistência condicional de listagem** e **1 limitação operacional na descoberta de cancelamentos**; além disso, há evidências externas ainda não obtidas para gateway/SIFEN, câmbio e SQL real. Não é necessário repetir a suíte geral de testes local do Claude. **Não abrir ordem de desenvolvimento automaticamente sem autorização humana.**

### ZERO-01 — ALTA: worker não consegue consultar NCE emitida por perfil CREAR-only quando falta ator EDITAR

**Evidências:** [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:391`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L391)–409 e [`lib/facturacion/consulta-automatica.ts:43`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/consulta-automatica.ts#L43)–71, comparadas com [`app/api/notas-credito/route.ts:8`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/api/notas-credito/route.ts#L8)–13 e [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:479`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L479)–506.

**Prova estática:** emissão NCE exige só `FACTURACION_ELECTRONICA.CREAR` e o serviço de consulta acionado pela tela aceita `CREAR` via `fe_documento_registrar_consulta_flujo_nce`. O worker, contudo, reserva NCE pela `fe_consulta_reservar`, que escolhe o criador ou outro usuário ativo **exclusivamente** com `EDITAR` e alcance da sucursal. Quando tal usuário não existe, `o_actor=NULL` e `ejecutarLote` contabiliza `sinActor`, **não chama o gateway**. Resultado: uma NCE emitida por operador com CREAR-only pode permanecer pendente quando se fecha o browser, contrariando RN-20/CA-18. Não se trata de falta de worker ou de UI; é um buraco no critério de escolha/autorização de ator.

**Correção esperada:** alinhar worker à política de consulta pendente de FE/NCE, preservando actorId real, escopo, log e segurança; não inventar usuário fictício nem elevar privilégios. Se passar a usar o fluxo permitido para CREAR, limitar estritamente a casos/estados que sua função SQL autoriza; não modificar NEX-054 aplicada. Caso direcionado: tenant cujo único operador autorizado tem CREAR, sem EDITAR, NCE pendente, janela fechada → consulta gravada com identidade e alcance corretos.

### ZERO-02 — MÉDIA: F023 / `dTotalGs` estrangeiro não validado na função SQL

**Evidências:** [`lib/facturacion/payload-nce.ts:244`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/payload-nce.ts#L244)–285 e [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:273`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L273)–288.

**Prova estática:** o TypeScript calcula `dTotalGs` de NCE USD/BRL a partir do total e câmbio original, mas o novo bloco de validação fiscal SQL só compara `Subtotales[0].dTotalGs` com o total **quando `p_moneda='PYG'`**. Para USD/BRL, é possível fornecer ao `fe_documento_crear_nce` um payload com `dTotalGs` arbitrário, mantendo `dTotGralOpe`, moeda, `dTiCam` original, IVA, quantidade e linhas corretas: passa pela lógica de subtotais da função. Na rota normal o construtor TypeScript fornece valores certos, mas a fronteira SQL não confirma a integridade de F023. Não foi demonstrado acesso HTTP para injetar esse payload; é uma falha de defesa em profundidade.

**Correção esperada:** validar `dTotalGs` em USD/BRL com o **mesmo contrato de precisão/representabilidade do cálculo existente**, e `dCondTiCam` quando aplicável, antes da reserva, com caso T26 dirigido e positivo, **sem alterar migrations aplicadas**. Validar conformidade SIFEN das operações reais de USD/BRL separadamente.

### ZERO-03 — MÉDIA CONDICIONAL: saldo da lista soma todas as versões fiscais da FE

**Evidência:** [`lib/facturacion/nce.ts:223`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L223)–255, especialmente subquery de `original` na linha 237, comparada com [`lib/facturacion/nce.ts:122`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/nce.ts#L122)–136, que lê `ORDER BY version DESC LIMIT 1`.

**Prova:** a subquery usada na listagem soma `dTotOpeItem` de `documento_electronico_solicitudes` para o ID da FE **sem restringir uma versão**. No detalhe, o sistema considera só o último snapshot. Se uma FE tiver duas versões, por exemplo com totais 100 e 120, a lista apresenta original 220, mas a nota realmente poderá acreditar no máximo 120 segundo o snapshot escolhido no detalhe/SQL. O esquema admite `version` (NEX-048); os emissores atuais gravam v1, então **não há demonstração de FE com duas versões em produção**. Não classificar como corrupção já ocorrida.

**Correção esperada:** computar original/saldo da lista sobre **a mesma versão efetiva** do payload selecionado no detalhe e na função de criação; caso dirigido sintético com duas versões (sem rodar em produção). Revisar se a versão enviada é sempre a máxima, em vez de presumir.

### ZERO-04 — RISCO OPERACIONAL (não alegar violação automática do requisito): cancelamento externo após APROBADO não é redescoberto pelo worker

**Evidência:** [`documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql:384`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql#L384)–398 e [`lib/facturacion/consulta-automatica.ts:20`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/lib/facturacion/consulta-automatica.ts#L20)–22; comparação com [`app/(private)/documentos/page.tsx:437`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/app/(private)/documentos/page.tsx#L437)–440, [`documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql:52`](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql#L52)–78.

**Fato:** o worker seleciona apenas `SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO`, não NCE já `APROBADO`; a tela oferece consulta manual a quem tem `EDITAR`. A função de consulta suporta a evolução `APROBADO→CANCELADO` e depois libera saldo por `fe_nce_clasificar`. Portanto a detecção **é implementada via consulta manual**, mas não é automática depois da aprovação. Se cancelamentos externos precisarem ser descobertos sem intervenção, será necessária política separada; não presumir que a especificação obrigou um cron contínuo sobre aprovadas, pois a cadência global está deliberadamente adiada.

## Matriz de verificação **de novo** (não usar percentuais da antiga R06)

Legenda: **CÓDIGO** = comportamento identificável estaticamente, ainda sem prova de execução em ambiente real; **PARCIAL / RISCO** = limitação demonstrada ou requisito condicionado; **SEM PROVA EXTERNA** = implementado, mas só SIFEN/PostgreSQL/gateway/browser pode comprovar. Essa matriz não equivale a “XX% homologado”.

### 24 regras de negócio

| Regra | Estado | Evidência da revisão |
|---|---|---|
| RN-01 | CÓDIGO | FE NEXIT aprovada, CDC, cliente e alcance; reconciliação FE enviada limitada |
| RN-02 | PARCIAL / RISCO | Busca, saldo e paginação presentes; agregado de saldo considera todas as versões de solicitação (ZERO-03) |
| RN-03 | CÓDIGO | NCE vinculada a única FE e CDC associado; iTiDE 5 |
| RN-04 | CÓDIGO | Catálogo 2/3/4/8 com bloqueio de outros motivos |
| RN-05 | CÓDIGO | Primeira NCE aprovada fixa motivo mesmo após CANCELADO; rejeitada não fixa |
| RN-06 | CÓDIGO | Créditos múltiplos mesmo motivo; lock FOR UPDATE na FE |
| RN-07 | CÓDIGO | Consumo/bloqueio/liberação conforme estados, sem liberar indeterminados |
| RN-08 | CÓDIGO | Payload FE original versionado, receptor imutável, ordinal por item |
| RN-09 | CÓDIGO | Todas as linhas (inclusive agotadas), código, IVA, cantidades e saldos |
| RN-10 | CÓDIGO | Devolución inicia selecionada com saldo e reduz/exclui quantidades |
| RN-11 | SEM PROVA EXTERNA | Créditos monetários 3/4/8 por linha implementados; representação real do provedor/SIFEN não validada |
| RN-12 | CÓDIGO | Limites quantidade/monto, cálculo decimal, IVA e subtotais confrontados antes do número |
| RN-13 | PARCIAL / RISCO | Moeda/câmbio FE preservados no servidor, mas F023 estrangeiro não é conferido no SQL (ZERO-02) |
| RN-14 | CÓDIGO | Data/hora nova do servidor na zona America/Asuncion |
| RN-15 | CÓDIGO | Observación opcional em dInfAdic |
| RN-16 | CÓDIGO | Ponto único FE/NCE e séries independentes; NDE/NRE/AFE futuros, fora desta emissão |
| RN-17 | CÓDIGO | Modal antes de emissão; preflight; lock, reserva e idempotência |
| RN-18 | SEM PROVA EXTERNA | Gateway recepcion_de/consulta_de e tentativa durável; nenhum fluxo real NCE demonstrado |
| RN-19 | CÓDIGO | Documentos electrónicos, estados e histórico, correção de rejeitada |
| RN-20 | PARCIAL / RISCO | Worker Node/lease existe, mas não consulta sem ator EDITAR ativo no alcance (ZERO-01) |
| RN-21 | CÓDIGO | Corregir y emitir nueva sem alterar rejeitada |
| RN-22 | PARCIAL / RISCO | Cancelamento oficial reconhecível pela consulta manual, sem busca automática após APROBADO (ZERO-04) |
| RN-23 | CÓDIGO | Sessão real, tenant/sucursal, SECRET em servidor, SQL SECURITY DEFINER |
| RN-24 | CÓDIGO | Não cria movimentação de estoque ou lançamentos financeiros |

**Totais:** 18 com implementação identificada; 4 parciais/risco; 2 sem prova externa.

### 23 critérios de aceite

| Critério | Estado | Evidência da revisão |
|---|---|---|
| CA-01 | CÓDIGO | Menu abre formulário; histórico separado |
| CA-02 | PARCIAL / RISCO | Elegibilidade/filtros/CDC com validação; saldo de lista pode inflar quando FE tem versões múltiplas (ZERO-03) |
| CA-03 | CÓDIGO | Pendências listadas/desabilitadas e refresh de leitura |
| CA-04 | CÓDIGO | Snapshot original independe de cadastros atuais |
| CA-05 | CÓDIGO | Ordinal de linha preserva produtos repetidos |
| CA-06 | CÓDIGO | Devolución pré-selecionada, parcial/fracionária, dados fiscais imutáveis |
| CA-07 | SEM PROVA EXTERNA | Crédito monetário por linha está implementado, sem verificação fiscal real dos motivos 3/4/8 |
| CA-08 | CÓDIGO | Motivo historicamente fixo após primeira APROBADO |
| CA-09 | CÓDIGO | Múltiplas NCE mesmo motivo e limites de crédito |
| CA-10 | CÓDIGO | Bloqueio de pendência/indeterminado, exclusão mútua SQL |
| CA-11 | PARCIAL / RISCO | Saldo se libera após CANCELADO gravado, mas worker não redescobre automaticamente cancelamento após aprovação |
| CA-12 | CÓDIGO | FE/NCE numeração independente no mesmo ponto, último NCE explícito |
| CA-13 | PARCIAL / RISCO | Moneda/cambio original, mas F023 em USD/BRL sem validação SQL e gateway não confirmado |
| CA-14 | CÓDIGO | Timestamp Paraguay e dInfAdic |
| CA-15 | CÓDIGO | Modal, revalidação, hash e numeração idempotente |
| CA-16 | SEM PROVA EXTERNA | JSON/NCE e matemática interna coerentes; gateway/SIFEN 3/4/8 sem validação real |
| CA-17 | SEM PROVA EXTERNA | Redirect, gateway e consulta codificados; comportamento externo real não verificado |
| CA-18 | PARCIAL / RISCO | Scheduler server-side, lease e backoff; depende de ator EDITAR para operar sem browser |
| CA-19 | CÓDIGO | Correção de rejeitada gera nova NCE sem apagar histórico |
| CA-20 | CÓDIGO | Sem impacto físico/financeiro e controle de tenant no código |
| CA-21 | SEM PROVA EXTERNA | Migration/rollback/runner versionados; aplicação e PostgreSQL não verificados |
| CA-22 | SEM PROVA EXTERNA | Testes locais relatados, não execução PostgreSQL T26/gateway/navegador |
| CA-23 | CÓDIGO | Auditorias R01–R06 e esta revisão independente após push |

**Totais:** 14 com implementação identificada; 4 parciais/risco; 5 sem prova externa.

## Verificações de segurança/arquitetura feitas nesta revisão

- Rotas `/api/notas-credito`, `clientes`, `facturas`, `facturas/[id]`, `previa`, `correccion/[id]` exigem sessão e CREAR via `prepararFacturacion`. Tenant/usuario vem da sessão, não do corpo; SQL `fe_documento_crear_nce` revisita permissão e alcance.
- Receptor e itens NCE derivam do payload FE persistido, não do cadastro vigente; lines por ordinal, associação única a CDC FE. SQL trava FE original (`FOR UPDATE`), bloqueia pendências e motivo incompatível, soma créditos aprovados e valida subtotais antes de reservar sequência NCE.
- Worker em `instrumentation.ts` no runtime Node usa lease/lock e nunca chama `recepcion_de`; só consulta e registra, com uma limitação de ator descrita em ZERO-01.
- `Documentos electrónicos` oferece correção de rejeitada e consulta manual. `CANCELADO` informado oficialmente libera saldo por classificação; não inferir cancelamento por timeout.
- NCE e FE compartilham ponto com sequências independentes; NDE/NRE/AFE são tipos futuros, **fora do escopo de emissão NCE V1**. Não exigir duplicação de ponto.
- Contrato gateway `/api/recepcion_de` e `/api/consulta_de` implementado; `iMotEmi=3/4/8` utiliza quantidade 1/preço igual ao crédito, **ainda sem resposta SIFEN aprovada de referência**; não declarar homologação.

## Etapa operacional pendente — sem execução por IA

**NEX-062 não aplicada e T26 não executado em PostgreSQL; FE e NCE não homologadas por esta revisão**. As verificações locais reportadas `nce.casos`, `facturacion.casos`, ESLint e `tsc` não equivalem a execução SQL, navegador ou SIFEN. Não executar T26 (usa fixtures sintéticos e SQL de escrita) no único PostgreSQL operacional. O responsável humano decide qualquer avanço de deployment/backup/consulta real; as IAs não acessam VM/SSH/Docker.

**Parecer:** `AUD-PRO94-NCE-ZERO = CORRECOES_IDENTIFICADAS` (ZERO-01 ALTA, ZERO-02 MÉDIA, ZERO-03 MÉDIA CONDICIONAL; ZERO-04 risco de política). Manter **PRO-94 In Progress**; **não instruir Claude a implementar ou repetir testes até autorização explícita do responsável para este novo escopo**.
