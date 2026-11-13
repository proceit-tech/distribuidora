# NEXIT — E03-R03 — Contrato funcional e arquitetura técnica do histórico fiscal

**Data:** 25/10/2026. **Status:** contrato funcional consolidado; implementação somente por ordem individual, sem deployment, homologação ou aplicação de migration.
**Projeto:** NEXIT, interface es-PY; `proceit-tech/distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`.
**Issues:** PRO-312 (épico de evidências), **PRO-321 (E03-A1 SQL)**, PRO-315 (E02 auditada estaticamente), PRO-311 (E09 correção), PRO-309 (gate fiscal).
**Precedência:** este R03 prevalece sobre R01/R02 nos pontos consolidados; R01/R02 mantidos apenas para rastreabilidade das decisões históricas.

## 1. Regras funcionais APROVADAS pelo responsável

**R01 — Documento ≠ revisão ≠ tentativa.** A SIFEN devolve o **estado do documento fiscal**; não existe estado SIFEN individual por POST. O registro `documentos_electronicos` contém a identidade fiscal (empresa, tipo, série, estabelecimento, ponto, número, CDC) e situação consolidada; `documento_electronico_solicitudes` contém snapshots JSON imutáveis numerados; envios HTTP e consultas são eventos auditáveis separados. `ENVIADO` ao gateway NÃO equivale a `APROBADO` por SIFEN.

**R02 — Seguimento sem reenvio cego.** Depois de transmitir, consultar o documento/lote/CDC até resultado fiscal conclusivo. Não reenviar o mesmo JSON/CDC por estar PENDIENTE, por demora ou por TIMEOUT/RED de recepção ambígua. Se falhou **autenticação comprovadamente antes do POST**, evidenciar `NO TRANSMITIDO`; se o POST pôde começar, resultado desconhecido = `ENVIO_INDETERMINADO`, exigindo reconciliação. Erro HTTP técnico não é `RECHAZADO` fiscal.

**R03 — Correção só com rejeição fiscal final.** Se SIFEN devolveu `RECHAZADO` definitivo, o operador poderá corrigir todos os campos **efetivamente permitidos** pela norma/contrato fiscal, incluindo receptor, endereço, itens, quantidades, preços, descontos, tributação e totais. Proibida edição fiscal irrestrita; exigir matriz legal de campos, recálculo, invariantes de CDC e permissões. Se `APROBADO`, não reemitir/corrigir por esse fluxo.

**R04 — Snapshot somente na confirmação.** Na tela `Corregir y reenviar`, o operador edita temporariamente, revisa resumo fiscal e confirma. **Somente no ato da confirmação** a aplicação persiste nova revisão imutável (versão, JSON, hash, ator, data) **ANTES do primeiro HTTP**. Abrir/editar/abandonar não cria versão. Confirmação repetida é idempotente; JSON idêntico não cria V2. Falha de transmissão depois da confirmação NÃO apaga a revisão. Esta funcionalidade é E09/PRO-311, **não** é escopo da ordem E03-A1.

**R05 — Identidade fiscal alterada = outro documento.** Quando a mudança obriga outra identidade/CDC/número segundo DNIT/contrato, criar OUTRO `documentos_electronicos.id`; original e novo aparecem **separados** na lista padrão e conectados por referência navegável. Nunca reescrever documento já transmitido. A correção de mesmo número/CDC só pode ocorrer se for legal e tecnicamente permitida; não está implementada.

**R06 — Listagem es-PY.** `Facturación → Documentos electrónicos`: padrão = UMA LINHA por documento fiscal com sua revisão vigente/mais recente. Checkbox `Mostrar todos los reprocesamientos` **DESMARCADO** ao abrir; marcado = uma linha por **VERSÃO JSON** (V1, V2, ...), **não por POST**. Histórico da revisão: **todas** as tentativas HTTP reais (inclusive idênticas, se houve) e seus resultados/JSON, sem deduplicação; consultas SIFEN pertencem ao documento e são visíveis como eventos sem se converter em linha fiscal. KPIs totais fiscais/stock/faturamento permanecem **por documento**, não multiplicados por versões.

**R07 — Auditoria inalterável.** Toda revisão, solicitação realmente utilizada, tentativas pré-POST, HTTP tentado, HTTP resposta, erros e consultas devem permanecer disponíveis e correlacionáveis. Não reconstruir retroativamente uma transmissão usando apenas uma revisão preparada. Sem tokens/segredos/cabeçalhos Authorization no armazenamento, UI ou logs. Segurança multiempresa e alcance por sucursal/permissão.

## 2. Código existente verificado (branch citada; NÃO é evidência de produção)

- `NEX-047`: `documentos_electronicos`, `documento_electronico_intentos` (append-only; `ENVIO`/`CONSULTA`, HTTP, fase, resposta saneada; NÃO tem versão/JSON do request correlacionado).
- `NEX-048`: `documento_electronico_solicitudes` imutável, PK `(empresa_id,documento_id,version)`, `payload jsonb`, `payload_hash`; prepara JSON, não prova POST.
- `NEX-050`: `fe_documento_iniciar_envio` seleciona maior versão e marca `ENVIANDO` com bloqueio; `fe_documento_registrar_envio` registra intento NO FECHAMENTO. HTTP bem-sucedido retorna `ENVIADO`, não SIFEN aprovado.
- `lib/facturacion/gateway.ts`: `enviar()` faz `body: JSON.stringify(body)` no POST; login e consulta usam mesmo helper. `enviarDocumentoGateway` pode fazer uma segunda chamada `recepcion_de` após HTTP 401 por token. O JSON com serialização exata deve ser capturado **no limite do transporte**, não por inferência do payload salvo.
- `lib/facturacion/envio.ts`: inicia via SQL, envia ao gateway, fecha via SQL; queda no intervalo entre HTTP e fechamento pode perder evidência do corpo tentado.
- `lib/facturacion/shared.ts::consultarEstado`: consulta pela identidade fiscal, grava eventos `CONSULTA` por documento — preservar.
- `NEX-054`: atualmente impede evolução de `RECHAZADO` final. Correção V2 precisará de máquina de estados/versionamento independente em E09, com proteção contra respostas tardias. **E03-A1 não mexe nisso**.
- `lib/facturacion/consulta-automatica.ts`: por padrão `NCE` somente; FE automática é E08.
- `app/(private)/documentos/page.tsx`: E01/E02 já permitem JSON a demanda e histórico keyset de tentativas, mas **não** exibem revisões em linhas com filtro. E01/E02 foram apenas auditadas estaticamente; 0 testes e sem homologação.

## 3. Particionamento de implementação e GATES

| Fase | Issue | Entrega | Autorização |
|---|---|---|---|
| **E03-A1** | **PRO-321** | **SOMENTE nova migration SQL incremental NEX-072**: estruturas e funções de captura de evidências de envio sem modificar fluxo atual da aplicação | **PRIMEIRA ORDEM A CLAUDE APÓS ESTA ESPECIFICAÇÃO**, sem aplicar SQL, auditar commit |
| E03-A2 | PRO-312 | Instrumentar `envio.ts`/`gateway.ts` para usar atomicamente as funções NEX-072, capturar exatamente as strings HTTP, respostas/fases e motivo da ausência de POST; preservar comportamento e restrições existentes | **BLOQUEADA** até auditoria E03-A1 e definição humana da aplicação da migration |
| E03-B | PRO-312 | API/UX da lista por versões, checkbox desligado e detalhe de cada revisão com envios reais; estados e KPIs por documento e preservação E01/E02 | **BLOQUEADA** até E03-A2 auditada |
| E08 | PRO-312 / outras | Consulta FE automática sem navegador e cadência segura, sem reenvio | Fora E03 |
| E09 | PRO-311 | Correção após RECHAZADO, novo JSON V2 após resumo, matriz normativa, CDC/número, NEX-054 e vínculo de novo documento | Fora E03-A1; gate fiscal próprio |

A E03-A1 autoriza apenas **autoria e commit/push** de `NEX-072`, sem aplicar no banco. **Nenhum outro estágio é liberado automaticamente.**

## 4. Desenho técnico FE-E03-A1, pronto para codificação SQL

**Uma única tabela nova** (não criar família desnecessária de tabelas): `public.documento_electronico_envio_evidencias`, um **log append-only de EVENTOS**, agrupados por `operacion_id` e versionados por `(empresa_id,documento_id,version)`.

Campos obrigatórios de identidade/evidência: `id uuid`, `empresa_id uuid`, `documento_id uuid`, `version smallint`, `operacion_id uuid`, `tipo_evento text`, `nro_post smallint NULL`, `solicitud_http_texto text NULL`, `solicitud_sha256 text NULL`, `solicitud_bytes integer NULL`, `http_status integer NULL`, `respuesta_saneada jsonb NULL`, `respuesta_truncada boolean`, `respuesta_bytes integer NULL`, `respuesta_sha256 text NULL`, `intento_id uuid NULL`, `mensaje text NULL`, `actor_id uuid`, `creado_at timestamptz`. Acrescentar FK e índices mínimos para busca por documento/versão/operação/ordem estável.

Eventos válidos: `INICIO`, `POST_INTENTADO`, `HTTP_RESPUESTA`, `NO_TRANSMITIDO`, `ERROR_TRANSMISION`, `CIERRE`. `INICIO` (evento raiz) tem `id = operacion_id`; todos os eventos seguintes têm `operacion_id` apontando à raiz da **mesma empresa, documento e versão**, com FK composta autorreferente e verificação SQL do tipo raiz. `POST_INTENTADO` guarda string HTTP exata (já serializada) e seu SHA-256 de **UTF-8 efetivo** com contagem de bytes; o evento é durável ANTES do fetch e significa **POST que está para ser invocado**, não prova de entrega ao gateway. Cada POST (inclusive segunda chamada após 401) recebe número crescente e evento próprio, sem criar revisão fiscal. `HTTP_RESPUESTA` guarda status e objeto de resposta **saneado**, nunca credenciais/tokens/cabeçalhos. Limite defensivo e marcador de truncamento para resposta grande sem bloquear a reconciliação; conservar hash/tamanho da resposta redigida quando aplicável. `NO_TRANSMITIDO` somente quando comprovado que nenhum POST foi iniciado; `ERROR_TRANSMISION` pode expressar TIMEOUT/RED após POST; `CIERRE` vincula-se à tentativa final do modelo atual. Cada operação **pode ter múltiplos POSTs, mas no máximo um CIERRE**.

Relacionamento mínimo: FK composta `(empresa_id,documento_id)` → `documentos_electronicos`; FK composta `(empresa_id,documento_id,version)` → `documento_electronico_solicitudes`; quando `intento_id` não nulo, FK composta `(empresa_id,documento_id,intento_id)` → `documento_electronico_intentos`, com `UNIQUE(empresa_id,documento_id,id)` adicional seguro na tabela legada se necessário. Não inferir `version` de timestamp; capturar seleção da MESMA transação e o payload que o início existente efetivamente devolveu. `intento_id` legado só se liga ao encerramento validado, nunca retroatribuir evento a intento antigo.

Imutabilidade: trigger BEFORE UPDATE/DELETE/TRUNCATE que impede modificações e exclusões, exceto exclusivamente o caminho DEMO já autorizado via `nex_reinicio_demo_activo` conforme NEX-047; não alterar triggers antigos. Evitar DEFAULTs que fabriquem testemunho de envio. Respostas e strings fiscalmente sensíveis apenas através de funções SECURITY DEFINER com `SET search_path=public,pg_temp` e checagem `usuario_tiene_permiso`, `sucursal_en_alcance`, versão, documento e operação. Nenhum acesso DML direto a `nexit_runtime`; SELECT só no padrão necessário para futura API ACL, sem endpoint nesta etapa.

### Funções SQL novas — NÃO substituir as existentes

1. `fe_e03_iniciar_envio(p_empresa,p_usuario,p_documento,p_confirma_rechazo)`: **envolve** `fe_documento_iniciar_envio` NEX-050 na mesma transação, preserva integralmente as validações e exclusão mútua. Quando `o_resultado=INICIADO`, localiza e valida **exatamente a versão e hash do snapshot devolvido** com a linha do documento bloqueada, insere evento raiz `INICIO` antes do retorno e devolve campos originais + `o_version`, `o_payload_hash`, `o_operacion_id`. Se status for `INDETERMINADO`, não inventar operação nem permitir POST. Não aceitar payload/versão ditados pelo navegador.
2. `fe_e03_registrar_evento(p_empresa,p_usuario,p_documento,p_operacion,p_tipo_evento,...)`: anexa apenas eventos válidos à raiz, com versionamento automático da raiz e verificações de fase/evento, corpo HTTP com `::jsonb` estruturalmente igual ao snapshot armazenado, hash `sha256(convert_to(texto,'UTF8'))` e tamanho calculados **no servidor SQL**; mensagens/respostas saneadas com limite. Bloquear tentativas com raiz inexistente, empresa/sucursal distinta, CIERRE já feito ou evento contraditório. Não inserir/forçar estado fiscal na SIFEN por esse log.
3. `fe_e03_cerrar_envio(p_empresa,p_usuario,p_documento,p_operacion, ... parâmetros originais de fe_documento_registrar_envio)`: **delegar à função original NEX-050** para preservar estado/CDC/lote/guardas e anexar evento `CIERRE` ligado ao `intento ENVIO` realmente inserido por ela, na MESMA transação e sob bloqueio do documento. Dupla confirmação do MESMO `operacion_id` deve retornar fechamento já persistido, sem um segundo intento ou evento. Falha de gravação de evidência implica rollback do fechamento, não fingir ENVIADO. Não alterar `fe_documento_registrar_consulta` da NEX-054.

**Grants:** criar `nex_aplicar_grants_facturacion_e03()` REVOKE DML nas evidências ao runtime e GRANT EXECUTE das 3 funções novas (com revogação PUBLIC). Integrar no wrapper `nex_aplicar_grants_runtime()` somente por `CREATE OR REPLACE` compatível com a sequência corrente e preservando os grants de NEX-071/NCE; verificar as dependências da branch real. Não quebrar a função nem permissões antigas.

**Migração:** número **NEX-072-facturacion-e03-evidencia-envios.sql** (checar antes de escrever que não foi ocupado); prefixo idempotência: preflight de dependências e abortar com erro explícito se a migration estiver aplicada, sem DROP/DELETE/TRUNCATE de dados reais. Migration nova, não reescrever NEX-047/048/049/050/054. Registrar comentário `NO APLICADA` até evidência humana em `schema_migrations`. Não inventar execução nem compatibilidade com VM. Sem backfill dos históricos antigos de payload: sinalizar `EVIDENCIA_TRANSMISION_NO_DISPONIBLE` nas futuras leituras quando não havia rastreio.

**Sem alteração do envio por enquanto:** a instrumentação dos POSTs e a UI ficam para E03-A2/E03-B; a migration inerte não habilita magicamente rastreabilidade HTTP. Claude deverá informar isso claramente.

## 5. Critérios de auditoria ESTÁTICA ChatGPT para o SHA E03-A1

- Apenas `NEX-072...` alterado; sem atualizar migrations antigas, `envio.ts`, `gateway.ts`, `shared.ts`, frontend, `CLAUDE.md`, Linear ou docs gerenciais.
- Guardas SQL tenant/escopo/permiso; FK para versão/identidade fiscal; append-only e DEMO restrito; nenhuma string de autenticação; hash sobre bytes realmente preparados; múltiplos POSTs em uma operação; fechamento exatamente uma vez; índices úteis; sem criação falsa de SIFEN/APROBADO.
- E03-A1 **não aplicada**: auditoria do SQL é estática, **0 testes**, sem banco, sem homologação. Verificação real de `schema_migrations` e backup só pela pessoa responsável ANTES de aplicação.
- Qualquer incompatibilidade entre wrapper `nex_aplicar_grants_runtime`, dependências NEX-071, ou função antiga deve ser apontada como bloqueio e nunca contornada por DROP destrutivo.

## 6. Demais pendências fora do gate atual

Matriz normativa exata de campos corrigíveis, documento novo/CDC e máquina de estados após rejeição (PRO-311/E09), consulta FE automática (E08), reserva e baixa de estoque (PRO-309/P01/P02; E07), perfis/vendedor/data/tipo de transação (etapas próprias). **Não pedir a Claude decidir negócio nem desenvolver tais módulos.**

**REGRA DE PARADA:** Claude faz um commit/push somente da migration, informa SHA e para. ChatGPT audita, atualiza Git/Linear e decide a próxima etapa explicitamente. Sem testes/lint/typecheck/build, sem DB/SQL executado, gateway/VM, e sem simular homologação.
