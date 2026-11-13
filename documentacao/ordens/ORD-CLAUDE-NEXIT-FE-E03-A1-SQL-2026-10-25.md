# ORD-CLAUDE-NEXIT-FE-E03-A1-SQL — ÚNICA ORDEM DE EXECUÇÃO

> **SUPERADA PELA ORDEM CORRETIVA E03-A1-R02 (25/10/2026).** O SQL entregue em `4b1ba2d21ea89924ab4eddade8fe9d4e0d690372` foi auditado como NÃO CONFORME. Nova única ordem: [E03-A1-R02](documentacao/ordens/ORD-CLAUDE-NEXIT-FE-E03-A1-R02-2026-10-25.md); auditoria: [AUD-R01](../testes/AUD-NEXIT-FE-E03-A1-PRO-321-R01-2026-10-25.md). Correções somente NEX-072, quatro achados; sem aplicar SQL, sem testes/VM, E03-A2/B e demais etapas bloqueadas. O restante abaixo é histórico.

**25/10/2026 — AUTORIZADA PELO RESPONSÁVEL após E01/E02 revisadas estaticamente.**
**Issue:** [PRO-321](https://linear.app/proceit/issue/PRO-321/fe-e03-a1-base-sql-inmutable-de-evidencia-http-por-version-fiscal) (subtask de PRO-312).
**Repositório:** `proceit-tech/distribuidora`; **branch existente:** `feature/NEXIT-2026-001-banco-demo`.
**Contrato técnico mandatário:** [ESPEC-E03-R03](../definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md), especialmente §§2–5. R03 supera R01/R02 nas divergências.

## Instrução operacional direta para Claude Code

**Implementar SOMENTE E03-A1 / PRO-321.** Ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes de `PROGRESSO-NEXIT-V1.md`, a especificação E03-R03 completa e os arquivos SQL atuais envolvidos. Confirmar branch e estado Git com segurança (não sobrescrever alterações de terceiros). Criar **um único arquivo de código SQL**:

`documentacao/banco/nexit/v1/migraciones/NEX-072-facturacion-e03-evidencia-envios.sql`

O SQL deve criar **uma tabela de eventos append-only** `documento_electronico_envio_evidencias` com empresa/documento/versão/operação/ator/data, tipos `INICIO`, `POST_INTENTADO`, `HTTP_RESPUESTA`, `NO_TRANSMITIDO`, `ERROR_TRANSMISION`, `CIERRE`, contagem de POSTs, **corpo HTTP exato pretendido** em `text`, SHA256 UTF-8 e bytes, resposta saneada/HTTP/status/tamanho/truncamento e vínculo opcional ao `documento_electronico_intentos` final. FK compostas para documento, versão e intento; raiz `INICIO` autorreferente mesma empresa/documento/versão, eventos imutáveis, UPDATE/DELETE/TRUNCATE proibidos fora reinício DEMO autorizado, índices de histórico e unicidade de `CIERRE` por operação. Tentativa preparada NÃO equivale a recebimento comprovado e não altera estado SIFEN.

Implementar **três funções SECURITY DEFINER**, com permissão `FACTURACION_ELECTRONICA.CREAR`, `sucursal_en_alcance`, isolamento multiempresa e transações seguras, **sem substituir as funções legadas**:
1. `fe_e03_iniciar_envio` envolvendo `fe_documento_iniciar_envio` (NEX-050), com linha fiscal bloqueada, selecionando a versão/hash EXATOS do payload retornado, gravando `INICIO` na mesma transação, gerando `operacion_id`; quando envio não inicia, nenhum POST/evidência falsa.
2. `fe_e03_registrar_evento` para gravar cada POST pretendido ANTES da chamada fetch, com corpo serializado/UTF-8/hash verificado contra a versão, resposta HTTP saneada e suas fases; nunca aceitar credenciais/Authorization nem inventar resposta SIFEN.
3. `fe_e03_cerrar_envio` envolvendo `fe_documento_registrar_envio` (NEX-050) para registrar `CIERRE` e correlacionar a linha de intento efetivamente inserida na MESMA transação; confirmação repetida da mesma operação NÃO cria outro intento; preservar estados, CDC, lote, bloqueios de duplicação e erro do fluxo atual.

Aplicar o padrão `nex_aplicar_grants_facturacion_e03` e integrar ao grant wrapper runtime, preservando todos os grants atuais. **Não executar** a migration. Tratar dependências e existência da tabela com validações, sem editar/apagar migrations anteriores. A tabela é nova e vazia: **não inventar backfill** de envios antigos. Tudo que for necessário está especificado em E03-R03; quando existir incompatibilidade técnica real não coberta (ex.: assinatura existente, não é possível garantir FK/SECURITY DEFINER sem alterar arquivo fora de escopo), **PARE e reporte o bloqueio**, não improvise uma mudança fiscal ou uma alteração fora da ordem.

**ESCOPO PROIBIDO:** `envio.ts`, `gateway.ts`, `shared.ts`, API, UI `Documentos electrónicos`, consultas automáticas SIFEN, edição/reemissão de `RECHAZADO` (E09), NEX-054, NCE, KuDE, numeração, CDC, estoque, perfis, módulos, cancelamentos, alterações de outros arquivos SQL, documentação gerencial, Linear, `CLAUDE.md`, `PROGRESSO`. Nenhuma aplicação de migration ou SQL real. **NÃO criar nem executar testes; NÃO executar lint, typecheck, build, CI manual, navegador, gateway, PostgreSQL, SSH/VM, Docker ou produção.** Não acessar senhas/credenciais. Não declarar homologado.

Ao terminar: **commit e push na branch oficial apenas desse único arquivo**. Resposta curta exatamente no formato:
- `E03-A1: migration SQL versionada; NÃO aplicada ao banco.`
- `Testes: não executados (ordem do responsável).`
- `Bloqueio real: nenhum.` (ou descreva objetivamente se houver).
- `SHA: <commit completo>`.
- `Parado para auditoria ChatGPT.`

**GATE FINAL:** não iniciar E03-A2 (código runtime), E03-B (filtro por versão) nem E09. Esperar auditoria independente de ChatGPT do SHA.
