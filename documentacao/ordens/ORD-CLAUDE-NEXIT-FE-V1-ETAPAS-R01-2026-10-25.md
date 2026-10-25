# ORD-CLAUDE-NEXIT-FE-V1-ETAPAS-R01 — Sequência controlada e auditoria independente

> **ORDEM VIGENTE APÓS E01-R02 — 25/10/2026:** auditoria [AUD-E01-R02](../testes/AUD-NEXIT-FE-E01-PRO-314-R02-2026-10-25.md) conferiu o SHA `86d6961706ffed2c6ec071a63958001bc1b0a5f7`, **F-001 e F-002 FECHADOS ESTATICAMENTE**, testes 0, sem homologação. **PRÓXIMA E ÚNICA ETAPA AUTORIZADA A CLAUDE: E02/PRO-315**, histórico completo paginado de envíos/consultas existentes (somente leitura); tarefa técnica em [Linear PRO-315](https://linear.app/proceit/issue/PRO-315). A seção de ordem E01 original e a R02 anterior são **HISTÓRICAS, não executar novamente**. Nenhuma etapa E03–E10 autorizada; o gate PRO-309 e regras de segurança continuam pendentes quando aplicáveis.

> **AUDITORIA E01-R01 (25/10/2026) / SOBREPÕE-SE À ORDEM E01 ORIGINAL:** Claude já entregou o commit `2f8dbceddd97416b42ae1316a18272aa268a243d`. A auditoria [AUD-E01-R01](../testes/AUD-NEXIT-FE-E01-PRO-314-R01-2026-10-25.md) encontrou F-001 ALTA (JSON fora de ordem) e F-002 MEDIA (reabrir painel após fechar). **ORDEM VIGENTE AGORA: SOMENTE CORRIGIR F-001/F-002 EM E01/PRO-314**, `app/(private)/documentos/page.tsx`, mantendo ACL/endpoints/dados/fluxos atuais intactos. **Sem testes** por ordem do responsável, commit/push, SHA, **PARAR** para reauditoria ChatGPT. **Não repetir a implementação inicial nem iniciar E02.**

**Data:** 25/10/2026. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Projeto:** NEXIT multiempresa (es-PY). **Gestão:** ChatGPT/Linear; **desenvolvimento:** Claude Code; **VM, deploy, banco real e homologação:** responsável humano.

**AUTORIZAÇÃO ATUAL: SOMENTE E01 / PRO-314.** Etapas E02–E10 são roteiro NÃO AUTORIZADO; nunca executá-las automaticamente nem deduzir respostas P01/P02/P04/P05/P06/P07 da preferência técnica registrada na auditoria. MASTER/E2/PRO-293 continua bloqueado pelo próprio gate PRO-304.

## Regra EXPRESSA desta sequência — economia de tokens (decisão do responsável, 25/10/2026)

- **Claude SOMENTE implementa, faz commit/push e para. NÃO criar testes, NÃO executar testes, NÃO executar lint, typecheck, build, suite completa, migrations, SQL, consultas reais a PostgreSQL, UI browser, gateway, VM ou CI manual.** Não disparar nem acompanhar CI manual; não alterar workflows/proteções existentes. Se GitHub Actions automático rodar pelo push, não reivindicar que passou sem evidência.
- **ChatGPT audita cada commit/diff e LÊ arquivos completos relacionados** (inclusive backend/SQL/permissões) antes de emitir AUD-RNN, corrigir o escopo da próxima etapa e atualizar Linear/PROGRESSO. Auditoria estática **não equivale a testes executados nem homologação**. Erros ou riscos bloqueantes geram ordem CURTA de correção ao Claude e nova auditoria antes de prosseguir.
- ChatGPT pode executar verificações próprias quando as ferramentas permitirem, mas nunca alegar execução do que não foi executado. Testes reais de concorrência, SQL, emissão fiscal e operação ficam **pendentes de homologação do responsável**, particularmente em módulos críticos. A decisão de não executar testes pelo Claude **não revoga** verificações indispensáveis antes de produção.
- Claude não cria/edita Linear, PROGRESSO, especificações, auditorias, documentos gerenciais, relatórios ou planos TST. Só versionar SQL/documentação técnica **quando indispensável à etapa futura explicitamente autorizada**.
- Resposta final de Claude: **uma frase do resultado + “Testes: não executados (ordem do responsável)” + bloqueio real se houver + SHA completo**. Não listar diffs/código/arquivos, não gastar tokens em relatórios.
- Claude usa `git status`, confirma branch e sincroniza Git com segurança (sem forçar/desfazer trabalho alheio), lê somente `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seções relevantes de `PROGRESSO-NEXIT-V1.md`, esta ordem e os arquivos necessários. Antes de cada etapa nova, ChatGPT relê os documentos atuais e verifica o SHA anterior.
- Nenhuma migration na VM por IA; verificar estado real de `schema_migrations` antes de planejar aplicar SQL. Não modificar tabelas da Distribuidora original fora do NEXIT, NCE ou outro projeto por proximidade de nomes.

## Cronograma de entregas com gates

| Etapa | Linear | Uma entrega isolada | Gate / estado |
|---|---|---|---|
| **E01** | **PRO-314** relacionado a PRO-312 | **Documentos: visualização READ-ONLY de JSON fiscal persistido e JSON de resposta de cada intento existente, sob demanda e ACL** | **AUTORIZADA AGORA**; somente código, sem migration/testes; commit e PARA |
| E02 | PRO-312 | Completar **paginação de intentos** e acesso seguro a JSON de uma tentativa por vez, sem truncar história em 100; preservar fases reais | **AGUARDA auditoria E01**. Somente leitura; não implementar captura de novos eventos nesta etapa |
| E03 | PRO-312 | Persistir solicitação efetivamente transmitida **por tentativa/versão**, correlação e fases do gateway realmente retornadas; SQL incremental se indispensável | **BLOQUEADA** até auditoria E02, schema real/SQL e desenho de versão; não inventar fase de firma |
| E04 | PRO-294 | `Fecha de emisión` editável (-30/+5): UI, revisão, validação fiscal e SQL/JSON coerentes | **BLOQUEADA por P06/PRO-309 + verificação gateway e NEX-048** |
| E05 | PRO-307/PRO-72 | Combo `Vendedor` e valor selecionado em `dInfAdic`; preservar emissor/observações/snapshot | **BLOQUEADA por P05/PRO-309** e arquitetura de usuários (PRO-304/293) |
| E06 | PRO-134 | Combo com 13 tipos e validação por tipo, com campos extras obrigatórios quando aplicáveis | **BLOQUEADA por P07/PRO-309** e contratos de operação fiscal |
| E07 | PRO-310/PRO-113 | Modelar/versionar **reserva** (FE enviada → SALIDA PENDIENTE, não baixa real), concorrência e disponibilidades por depósito/lote | **BLOQUEADA por P01/P02, auditoria `schema_migrations` e substituição segura de NEX-067**. Dividir em SQL (sem aplicar) e serviço em ordens separadas |
| E08 | PRO-310/PRO-312/PRO-97 | Conciliar FE automaticamente sem navegador e efetivar **SALIDA única na aprovação SIFEN**, recuperável sob falha | **BLOQUEADA até E07 auditada** e desenho de evento/status/autorização |
| E09 | PRO-311 | Rejeitada → **Corregir y reenviar** com versões imutáveis, CDC/número conforme DNIT e controle da reserva | **BLOQUEADA por P04/PRO-309 + E07/E08 e contrato de provedor**. Não sobrescrever RECHAZADO fiscal final |
| E10 | PRO-313 | Botão `Cancelar documento` para FE aprovada **somente desabilitado** sem API, 48h desde aprovação fiscal verificável | **BLOQUEADA até fonte confiável do horário de APROBADO**; não incluir chamada de cancelamento nem estorno (PRO-199 suspenso) |

**Ordem obrigatória após qualquer etapa:** Claude COMMIT+PUSH → informa SHA e PARA → ChatGPT lê diff/arquivos completos, emite AUD-RNN e atualiza Linear/Git → somente então nova ordem específica. Se alguma etapa estiver bloqueada, não "pular" gate criando regra por conta própria; prosseguir por etapa independente apenas com ordem específica de ChatGPT após avaliação.

## ORDEM IMEDIATA PARA CLAUDE — E01 / PRO-314 (pode copiar sem ajustes)

> **EXECUTAR SOMENTE PRO-314 — E01 (JSON existente em Documentos, somente leitura).**
>
> Repositório `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. Ler os protocolos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, o progresso relevante, esta ordem e apenas os arquivos necessários. Não tocar outras branches/VM.
>
> Na tela já existente **`Facturación → Documentos electrónicos`**, acrescentar **`Ver JSON de solicitud`** (JSON fiscal persistido em `documento_electronico_solicitudes`, identificando `version` e `payload_hash`) e **`Ver JSON de respuesta`** para cada tentativa `documento_electronico_intentos` que já tenha `respuesta`. Exibição textual formatada (sem HTML dinâmico), espanhol PY, **somente sob demanda** ao clicar e leitura individual para não carregar JSON de todos os documentos no listado. Reutilizar visual/estrutura atual, sem nova tela, sem alterar fluxos NCE/FE/KuDE/consulta.
>
> Backend: GET protegido pelo `prepararFacturacion("VER")` atual e pelo `leerDocumento(db, empresaId, usuarioId, id)` **ANTES** de ler payload/intent; empresa, sucursal e autorização vêm da sessão. Acesso cross-tenant/fora de alcance deve retornar 404 sem conteúdo. Para intent, exigir correlação `empresa_id + documento_id + intento_id`; para solicitação, `empresa_id + documento_id + version`. Usar SQL parametrizado; sem endpoint que aceite `empresa_id` do navegador. Só expor JSON fiscal e `respuesta` já saneada, não tokens/password/headers/certificados. Não misturar o payload de um documento com outro. Não expor JSON nos GET de listagem.
>
> Separar claramente `Solicitud registrada (no necesariamente transmitida)` e `Respuesta registrada`. Se JSON está ausente, exibir `No hay JSON registrado para este intento` sem inventar payload. Manter os 100 intentos atuais nesta E01 (paginação é E02), sem refazer lista, filtros, CRUD ou tabelas.
>
> **Proibido criar/rodar testes, build, lint, typecheck, migrations, scripts SQL, VM, gateway, enviar FE real, CI manual.** Não tocar `NEX-067`, estoque, tipos de transação, vendedor, data fiscal, correção, cancelamento, MASTER/usuários, `PROGRESSO-NEXIT-V1.md` ou Linear. Não programar E02 nem qualquer etapa seguinte.
>
> Após implementação, **um commit e push**. Resposta curta: resultado; `Testes: não executados (ordem do responsável)`; eventual bloqueio real; SHA completo; **PARAR para auditoria ChatGPT**.

## Fonte de especificação e auditoria

- `documentacao/definicoes/REQ-NEXIT-FE-V1-ESTADOS-RESERVA-CORRECCION-2026-10-25.md`
- `documentacao/analises/AUD-NEXIT-FE-V1-R01-REVISAO-INTEGRAL-PERGUNTAS-2026-10-25.md`
- Linear PRO-309 (decisões abertas), PRO-310/311/312/313 (entregas), PRO-314 (E01 autorizada).


## ORDEM IMEDIATA PARA CLAUDE — E02 / PRO-315 (ÚNICA ORDEM ATUAL)

> Executar **somente E02 / PRO-315** na branch `feature/NEXIT-2026-001-banco-demo` de `proceit-tech/distribuidora`. Ler `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, esta ordem e os arquivos envolvidos. Partir da E01-R02 já entregue `86d6961706ffed2c6ec071a63958001bc1b0a5f7` e **NÃO regredir F-001/F-002**. A auditoria `documentacao/testes/AUD-NEXIT-FE-E01-PRO-314-R02-2026-10-25.md` aprovou E01 somente estaticamente; **não mexer nela fora do necessário para E02**.
>
> Em `Facturación → Documentos electrónicos`, a tabela existente `Historial de consultas` lista ENVIO e CONSULTA, mas `lib/facturacion/shared.ts:listarIntentos` só retorna os últimos 100. Implementar leitura **PAGINADA/INCREMENTAL de todo o histórico existente**, preferencialmente por cursor estável `(creado_at, id)` em ordem decrescente, no máximo **100 tentativas por página**. A UI deve carregar primeiras tentativas como hoje, mostrar **`Cargar intentos anteriores`** quando há mais, e poder continuar até o último registro. Atualizar título para **`Historial de envíos y consultas`**. Sem resposta registrada, manter o aviso atual. Não inventar contador total sem evidência.
>
> Backend: consulta parametrizada com cursor estritamente validado, filtrada por `empresa_id` e `documento_id`, sem levar JSON das respostas na lista. **Toda API GET adicional deve chamar `prepararFacturacion("VER")` e verificar `leerDocumento(db,empresaId,usuarioId,id)` antes de acessar os intentos**, respeitando `sucursal_en_alcance` e 404 fora de alcance. Preservar contratos atuais de `/api/documentos/[id]`, `/enviar` e `/consultar`, que esperam array `intentos`; adicionar metadados de paginação de forma compatível ou endpoint GET específico protegido. Evitar duplicatas após eventos novos, manter ordenação `creado_at DESC, id DESC`.
>
> UI: preservar botões `Ver JSON de solicitud` / `Ver JSON de respuesta` por tentativa/versão, leitor sob demanda e invalidação E01-R02 ao fechar/colapsar/trocar seleção. Não permitir resposta de página anterior/tardia reabrir painel, sobrescrever histórico mais recente ou injetar dados de outro documento. Tratar estado de carregamento/erro da paginação e evitar repetição da mesma página. **Sem carregar `respuesta`/payloads em massa**.
>
> **Escopo proibido:** criar/modificar tabela, migration ou SQL de escrita; modificar emissão, SIFEN, assinatura, `gateway.ts`, envio/reenvio, correção, estoque, módulos, perfis, data, vendedor, NCE/KuDE ou qualquer etapa E03+. **Não criar nem executar testes, lint, build, typecheck, scripts SQL, CI manual, navegador, VM ou gateway. Não atualizar Linear, PROGRESSO ou documentação gerencial.** Claude faz código mínimo, commit/push e para. Resposta apenas resultado, `Testes: não executados (ordem do responsável)`, bloqueio real e SHA completo. **PARAR para auditoria E02-R01 de ChatGPT.**
