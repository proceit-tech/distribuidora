# PRO-342-D01 — Auditoria fiscal integral CASA MINGO (envio → lote → consulta → histórico → KuDE)

**Data:** 11/11/2026 · **Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo` · **HEAD inspecionado:** `7bc65e4878bf79324011c91df327c06af9cbfc1f`
**Ordem:** `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-342-P0-AUDITORIA-INTEGRAL-ENVIO-CONSULTA-KUDE-2026-11-11.md` · **Fonte obrigatória:** `documentacao/testes/AUD-NEXIT-P0-FLUJO-FISCAL-INTEGRAL-ENVIO-CONSULTA-KUDE-2026-11-11.md`
**Natureza:** SOMENTE leitura estática de código, SQL versionado, histórico Git e documentação do repositório. **Nada foi executado:** nenhum teste, SQL, migration, chamada ao gateway, VM, deploy, reenvio ou alteração de CDC/lote/série/estado. Nenhum arquivo do repositório foi modificado; nenhum commit.

> **ERRATA E1 (publicação no Git, 11/11/2026):** a versão entregue no chat afirmava que o rótulo «CDC distinto del registrado» só existia entre `373fe58` e `53c8204`. Conferindo com `git grep` por commit, o rótulo existe desde `3eada02` (12/10/2026); `373fe58` apenas acrescentou ocorrências. **A conclusão «produção anterior à R03» não muda**; o limite inferior da janela passa a ser `3eada02` (na prática, posterior ao código de séries NEX-063, já que a FE tem série AA). Consequência: não se pode afirmar que o worker de produção inclua FE. Somente os dois trechos marcados «Errata E1» foram alterados; o restante do conteúdo técnico é o mesmo do relatório entregue. O roteiro de leitura e a matriz comprovado/hipótese/pendente alinhada ao parecer ChatGPT estão em `PRO-342-D01-complemento-roteiro-leitura.md`.

Legenda de evidência usada em todo o relatório:
- **[CAPTURA]** fato observado pelo responsável (não verificado por Claude).
- **[FONTE]** confirmado lendo o código/SQL/Git citado.
- **[INFERÊNCIA FORTE]** dedução que decorre necessariamente da fonte + captura, mas ainda sem dado real do banco.
- **[HIPÓTESE]** causa possível, a confirmar.
- **[NÃO COMPROVADO]** depende de SELECT/log/proveedor ainda não fornecidos.

---

## 0. Resumo executivo

1. **Versão em produção identificada por evidência indireta [INFERÊNCIA FORTE — ver Errata E1]:** o rótulo «CDC distinto del registrado» da captura existe no código desde `3eada02` (12/10) e foi removido em `53c8204` (PRO-338-R03, 11/11 08:35 -03). Logo a VM roda uma versão **anterior à R03**, isto é, com o `sinSecretos` antigo que substitui a senha da API em **todo o JSON serializado** do resultado (envio e consulta). As correções R03–R05 estão só no Git. **Não comprovado sem o SHA real da VM** (roteiro §B.1).
2. **O lote `[omitido]-1-001-001-0000001-20261111091028-793231042` foi mutilado pelo próprio NEXIT [FONTE + INFERÊNCIA FORTE].** O formato real do lote do provedor, documentado com exemplo real (`80020653-1-001-001-0017009-20261012151546-212066495`), é `RUC_EMISOR-iTiDE-EEE-PPP-NNNNNNN-AAAAMMDDhhmmss-aleatório`. O segmento substituído é exatamente o **RUC emissor** ⇒ a **senha da API é idêntica ao RUC emissor** sob o qual o gateway registrou o lote. Timestamp `20261111091028` e número `001-001-0000001` correspondem a este envio (09:10:28): o lote é desta FE, mas **não carrega a série AA**.
3. **`CDC_DIVERGENTE` na consulta de 09:30:57 é, com alta probabilidade, o mesmo defeito [INFERÊNCIA FORTE, a confirmar pela S2b]:** o CDC traz o RUC emissor nas posições 3–10; se a senha = RUC, o `sinSecretos` antigo transforma o CDC em `01[omitido]…`, `fe_cdc_coherente` falha e a SQL grava `CDC_DIVERGENTE` sem mexer no documento ⇒ `SIN_CONSULTA` permanece. A alternativa (o provedor devolveu o CDC de **outro número**) é distinguível pela SELECT S2b sem expor segredos.
4. **«XML firmado» é estado intermediário do provedor [FONTE]:** `estadoSifenDesdeGateway` o mapeia a `NO_RECONOCIDO` (correto: não é aprovação). Isso também explica, como **hipótese forte**, por que a FE não aparece no portal com **«Ocultar pendientes»** marcado: um documento só firmado é pendente para o portal.
5. **O endpoint configurado é o endpoint de TESTE do provedor [FONTE].** `https://gateway.e-factura-hub.com` está declarado no código como «Endpoint de TEST del proveedor» (`lib/facturacion/gateway-credenciales.ts:14-19`, PROGRESSO 20/10). A decisão REQ de 20/10 registra que, nesse ambiente de teste, o KuDE FE da CASA MINGO **sai com o nome «DISTRIBUIDORA DEL PARAGUAY» e dados do prestador** e que isso não devia ser alterado (`documentacao/definicoes/REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md:10-12`). Em 21/10 o PDF de uma NCE CASA MINGO mostrou RUC emissor **80020653-3** (não 80003314-0) (`INC-NEXIT-NCE-KUDE-GATEWAY-2026-10-21.md:5,14`). **A conta API usada pela CASA MINGO nesse host já esteve, comprovadamente, associada a um emissor de teste distinto (80020653).** Se a CASA MINGO está emitindo faturas reais, o destino precisa ser decidido pelo responsável e pelo provedor; o código não sabe distinguir teste de produção.
6. **KuDE de outro emissor [FONTE para a falha do NEXIT; NÃO COMPROVADO para a causa no provedor]:** o NEXIT pede o KuDE com a identidade completa e correta (`dSerieNum:"AA"`), mas desde PRO-326 aceita **qualquer** PDF válido e **ignora o campo `CDC` que o próprio `/api/kude` devolve** — justamente o dado que permitiria verificar o emissor. A causa no provedor (ignorar `dSerieNum`, documento antigo `001-001-0000001` do emissor de teste 80020653/DISTRIBUIDORA na mesma conta, ou vazamento entre contas) só o provedor pode demonstrar.
7. **A identidade do emissor não entra em nenhuma verificação [FONTE]:** o JSON enviado não contém emissor nem timbrado (o gateway os resolve pela conta autenticada — `payload-fe.ts:13`), e `cdcCoherente`/`fe_cdc_coherente` não comparam RUC/DV nem a data embutida no CDC. Com o código atual (R05), um CDC de outro emissor com o mesmo `EEE-PPP-NNNNNNN` seria **gravado de forma permanente** no documento CASA MINGO (risco P0 latente, ainda não materializado segundo as capturas).
8. **Rastreabilidade insuficiente [FONTE]:** nenhum intento guarda URL, `credencial_ref`, `credenciales_version`, usuário API ou identificador do provedor; o `request_id` é um UUID local que nunca é enviado ao gateway. **Não é possível provar, só pelo histórico, qual URL/credencial foi usada às 09:10.** Pode-se apenas mostrar, pela bitácora `fe_gateway_config_log`, se houve mudança entre 08:45 e 10:00 (S3).

**Conclusão:** a cadeia NEXIT tem **três defeitos já demonstrados por fonte** que explicam lote mutilado, `CDC_DIVERGENTE` e `SIN_CONSULTA` (versão pré-R03 em produção + verificação de identidade incompleta + histórico sem snapshot), e **um defeito de apresentação demonstrado** (KuDE aceito sem correlação). A pergunta «a FE chegou à conta certa?» não pode ser respondida só pelo código: depende de S2b/S3c e da resposta do provedor (§6). **Recomendação mantida da auditoria:** suspender novas emissões CASA MINGO, não reenviar, não reconsultar em massa e não alterar CDC/lote/estado até a correlação.

---

## 1. Cronologia (11/11/2026, horário de Assunção)

| Hora | Evento | Tipo de evidência |
|---|---|---|
| 08:35 / 08:59 / 09:12 | Commits R03 `53c8204`, R04 `aa056e3`, R05 `75ea452` publicados **no Git** (não há registro de deploy) | [FONTE] `git log` |
| 09:10:27 | FE `001-001-0000001 (AA)`, JOSE FRANCO, PYG 1.000 criada (`fe_documento_crear_fe` NEX-063/073: reserva série AA nº 1, `dFeEmiDE` local) | [CAPTURA]; caminho [FONTE] |
| 09:10:28 | `POST /api/login` + `POST /api/recepcion_de` → `status:success` + `nro_lote` → `ENVIADO` | lote com timestamp 091028 [CAPTURA]; regra [FONTE] `gateway.ts:674` |
| 09:10:28 | Resultado saneado pela versão pré-R03 → lote gravado como `[omitido]-1-…` em `documento_electronico_intentos.lote` e `documentos_electronicos.lote` | [INFERÊNCIA FORTE]; S2/S2b confirmam |
| 09:17 | «Probar conexión» OK (só `/api/login`, `configuracion-gateway.ts:170-196`) | [CAPTURA]; posterior ao envio, **não prova o envio** |
| 09:30:57 | `POST /api/consulta_de` → HTTP 200, `Estado: XML firmado`, CDC informado → intento `CDC_DIVERGENTE`; documento só atualiza `ultima_consulta_*`; `estado_sifen` continua `SIN_CONSULTA` | [CAPTURA]; comportamento [FONTE] NEX-054 |
| depois | KuDE da mesma FE abre PDF de DISTRIBUIDORA DEL PARAGUAY S.A., outra data/valores | [CAPTURA] |
| depois | Portal CASA MINGO (filtros + «Ocultar pendientes») mostra 5 FE rejeitadas e não mostra a nova | [CAPTURA] |

FE anteriores `001-003-0009018..0009021` (10/11): mesmo padrão — HTTP 200 `Rechazado 1101 Número de timbrado inválido`, intento `CDC_DIVERGENTE`, documento `PENDIENTE`/`SIN_CONSULTA` (relatório D03). KuDE de `0009020` mostra CASA MINGO corretamente [CAPTURA]. **Cronologia real das tentativas (incluindo se o worker automático consultou) = NÃO COMPROVADO** até S2/S8.

---

## 2. Sequência do fluxo (código atual do Git; diferenças da versão em produção anotadas)

```
Operador ─▶ POST /api/facturas (emitirFactura, envio.ts:195)
  │ 1 configuracionGateway (envio.ts:71)  ── SELECT fe_gateway_config WHERE empresa_id AND activo
  │      └ adjuntarCredencialesDeBase (gateway-credenciales.ts:23) ── fe_gateway_credenciales_leer  [só se credencial_ref='NEXIT_DB'; senão env NEXIT_FE_<REF>_*]
  │ 2 crearFacturaElectronica → fe_documento_crear_fe (NEX-073) → fe_secuencia_reservar (NEX-063/065)
  │      └ JSON = payload || {dEst,dPunExp,dNumDoc,dSerieNum:'AA',dFeEmiDE}  → documento_electronico_solicitudes v1 (payload_hash)
  │      └ JSON NÃO contém RUC/DV emissor nem timbrado (payload-fe.ts:13)
  │ 3 enviarDocumento (envio.ts:160): configuracionGateway DE NOVO (2ª leitura, sem snapshot)
  │      └ fe_documento_iniciar_envio (NEX-050/062) → ENVIANDO, devolve payload
  │ 4 enviarDocumentoGateway (gateway.ts:688)
  │      ├ obtenerToken: POST {base}/api/login {ruc,password}  (cache por empresa|url|ref|sha256(ruc:pw), gateway.ts:309)
  │      └ POST {base}/api/recepcion_de  Bearer + JSON
  │ 5 interpretarRecepcion (gateway.ts:599): success + nro_lote (≤60) ⇒ ENVIADO  [sem eco de emissor/série]
  │ 6 resultadoFiscalSinSecretos (gateway.ts:733)   [PRODUÇÃO pré-R03: sinSecretos = replace(senha) no JSON inteiro ⇒ lote mutilado]
  │ 7 cerrarEnvio (envio.ts:127): request_id = crypto.randomUUID() LOCAL ─▶ fe_documento_registrar_envio (NEX-050)
  │      └ intento ENVIO (fase, http, estado_gateway, lote, cdc_informado, mensaje, respuesta)  — SEM url/ref/versão/usuário API
  ▼
Operador/worker ─▶ consultarEstado (shared.ts:378)
  │ config ATUAL + credenciais ATUAIS ─▶ POST {base}/api/consulta_de {dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}  (sem CDC)
  │ interpretarConsulta (gateway.ts:240): Estado, DE.CDC, Retorno ─▶ estadoSifenDesdeGateway: «XML firmado» ⇒ NO_RECONOCIDO
  │ resultadoFiscalSinSecretos (gateway.ts:441)   [PRODUÇÃO pré-R03: CDC «01[omitido]…»]
  │ decidirConsulta (reconciliacion.ts:19) ─▶ fe_documento_registrar_consulta (NEX-054) | _flujo_nce (NEX-062) | _auto (NEX-077)
  │      └ CDC não coerente (tipo/EEE/PPP/NNN) ⇒ intento CDC_DIVERGENTE; documento só ultima_consulta_*; estado_sifen inalterado
  ▼
Operador ─▶ GET /api/documentos/[id]/kude ─▶ obtenerKude (shared.ts:429)
       config ATUAL ─▶ POST {base}/api/kude {dEst,dPunExp,dNumDoc,dSerieNum:'AA',tipoDoc:'FE'}
       interpretarKude (gateway.ts:816): status success + Base64 + %PDF…%%EOF ⇒ exibe; campo CDC da resposta IGNORADO (PRO-326)
       kude-modal.tsx:70 título = identidade NEXIT do documento, não do PDF
```

---

## 3. Matriz código/SQL — regras cumpridas e falhas

| # | Etapa | Arquivo · função · linhas | Campos | Regra | Situação |
|---|---|---|---|---|---|
| C1 | Config do envio | `envio.ts::configuracionGateway` 71-86 | `fe_gateway_config.base_url, credencial_ref, timeout_ms, activo` | Lê config da empresa da sessão | **CUMPRE** isolamento por empresa |
| C2 | Config da tela | `configuracion-gateway.ts::leerConfiguracion` 118-141 / `fe_gateway_config_ver` NEX-061:82 | `base_url, api_usuario, activo` | Tela = mesma fonte do envio | **PARCIAL:** a tela não mostra `credencial_ref` nem bloqueia por `activo`; se não houver linha mostra `URL_GATEWAY_PRUEBA` como se fosse configurada |
| C3 | Fonte da credencial | `gateway.ts::credencialesDe` 54-58, `leerCredenciales` 60-67 | `credencial_ref` | NEXIT_DB exclusivo | **CUMPRE** para NEXIT_DB; com ref legada (ex. `CASAMINGO`) usa **variáveis de ambiente** enquanto a tela mostra o usuário da base. `fe_gateway_config_guardar` (NEX-069:55-58) sempre grava `NEXIT_DB` ao salvar ⇒ risco baixo, verificar S3 |
| C4 | Token | `gateway.ts::claveToken/obtenerToken` 309-376 | cache por empresa+URL+ref+hash | Não compartilhar sessão entre empresas | **CUMPRE** (descarta troca de token entre tenants no NEXIT) |
| C5 | Prova de conexão | `probarLoginGateway` 384-398; `probarConexion` 170-196 | `ultima_prueba_*`, log PROBAR | Só login | **CUMPRE**, mas **não prova** `recepcion_de` nem o emissor da conta |
| C6 | JSON/série | NEX-063:174-178, NEX-073:112-113 | `dEst,dPunExp,dNumDoc,dSerieNum,dFeEmiDE` | Identidade completa com série | **CUMPRE** (inclui AA); **não inclui emissor** (resolvido pelo gateway) |
| C7 | Recepção | `gateway.ts::interpretarRecepcion` 599-682 | `nro_lote`, `Rechazados` | ENVIADO = recepção | **CUMPRE** semântica; **FALHA de correlação:** `DocumentoRecepcion` (462) não tem série nem emissor; `Rechazados` casa só `EEE-PPP-NNNNNNN` (616-617); lote aceito sem validar que o segmento RUC/tipo/número/timestamp corresponde ao documento |
| C8 | Saneamento | produção pré-R03 `sinSecretos` (`53c8204^:gateway.ts:79-88`) | todo o resultado | Nunca alterar identificador fiscal | **FALHA DEMONSTRADA** (lote e CDC mutilados quando senha = RUC). Git R05 (`gateway.ts:120-188`) corrige lote/`cdc`, mas R05-F001 (CDC aninhado) segue aberto |
| C9 | Persistência do envio | `envio.ts::cerrarEnvio` 127-157; NEX-050 `fe_documento_registrar_envio` | `request_id, lote, cdc_informado, respuesta` | Evidência auditável | **FALHA:** `request_id` local nunca transmitido; sem URL/ref/versão/usuário API/hash do corpo enviado; SQL aceita lote com `[omitido]` (só checa ≤60) |
| C10 | Consulta | `shared.ts::consultarEstado` 378-415; `gateway.ts::consultarDocumentoGateway` 417-445 | corpo sem CDC | CDC só da API | **CUMPRE**; usa config/credencial **atuais** (sem vínculo com as do envio) |
| C11 | Estado | `estados.ts::estadoSifenDesdeGateway` ~82-99 | `Estado` | Texto desconhecido ≠ aprovado | **CUMPRE** («XML firmado» → `NO_RECONOCIDO`) |
| C12 | Coerência CDC | `gateway.ts::cdcCoherente` 495-497; NEX-047 `fe_cdc_coherente` | pos. 1-2, 12-24 | Identidade do documento | **FALHA (P0-EST-02):** não compara RUC (3-10), DV (11) nem data (26-33) |
| C13 | Registro consulta manual | NEX-054 `fe_documento_registrar_consulta` | `cdc_informado` | Evidência do CDC recebido | **FALHA:** não grava `cdc_informado` (só NEX-077 grava); com OK + `NO_RECONOCIDO` + CDC coerente **fixa o CDC para sempre** (`cdc = coalesce(d.cdc, p_cdc)`), mesmo de outro emissor |
| C14 | Apresentação | `presentacion-sifen.ts` / `documentos/page.tsx` | último intento × estado | Distinguir «consultado e descartado» de «nunca consultado» | **PARCIAL (P0-EST-01):** R03 melhorou o texto no Git; produção mostra rótulo antigo enganoso |
| C15 | Worker | `instrumentation.ts`; `consulta-automatica.ts` 81-86, 151-154 | NEX-077 | Consulta automática real | **CONDICIONAL:** código R02+ exige NEX-077 (não aplicada) ⇒ loga «desactivada» e não consulta. Se produção estiver entre `373fe58` e `19e4ce3`, usa NEX-062 e pode consultar FE; se for anterior a `373fe58`, o worker só consulta NCE (Errata E1). **NÃO COMPROVADO** (S8 + logs) |
| C16 | KuDE | `shared.ts::obtenerKude` 429-457; `gateway.ts::cuerpoKudeGateway` 757-761, `interpretarKude` 816-837 | `dSerieNum`, `CDC` da resposta | Nunca exibir PDF de terceiro | **FALHA DEMONSTRADA (P0-KUDE-01):** aceita qualquer PDF; ignora o `CDC` devolvido; título do modal vem do NEXIT |
| C17 | Documentação de código | `gateway.ts:6-15` | — | Contrato atual | Comentário desatualizado (diz que recepção/KuDE não existem e credenciais só por env) |

---

## 4. Respostas às seis perguntas

**4.1 Qual configuração real foi usada às 09:10?** **NÃO COMPROVADO.** Pelo código, o envio usou a linha **ativa** de `fe_gateway_config` da CASA MINGO lida duas vezes no mesmo request (`envio.ts:196` e `:161`) e as credenciais de `fe_gateway_credenciales` se `credencial_ref='NEXIT_DB'`. Nada disso é registrado no intento. Prova possível: (a) S3 mostra se houve `GUARDAR` entre 08:45 e 10:00 (sem `GUARDAR` no intervalo, a config de 09:10 é a atual, por exclusão — não por prova direta); (b) S3 mostra `credencial_ref`; (c) S3c mostra, só como booleanos, se a senha é igual ao RUC CASA MINGO ou a 80020653 — o que, combinado com §4.3, revela o emissor do lote.

**4.2 Quem recebeu e devolveu o lote?** O host configurado (provavelmente `gateway.e-factura-hub.com`, endpoint de teste) devolveu `status:success` e um lote cujo número/timestamp correspondem a esta FE [INFERÊNCIA FORTE]. O **emissor** do lote é o RUC apagado pelo saneamento; ele é **igual à senha da API** [INFERÊNCIA FORTE]. Se S3c indicar senha = `80003314`, o lote foi registrado sob CASA MINGO; se = `80020653`, sob o emissor de teste (DISTRIBUIDORA). Só o provedor pode confirmar a conta e o RUC (§6.4).

**4.3 Houve corrupção do lote?** **SIM, pelo NEXIT [FONTE + INFERÊNCIA FORTE].** A substituição `[omitido]` só existe no NEXIT (`omitirEn`/`sinSecretos`); o gateway não a produz. A versão pré-R03 aplicava `split(senha).join("[omitido]")` sobre o JSON do resultado inteiro, inclusive `lote` e `respuesta.nro_lote`. O valor original **não é recuperável** do banco e **não deve ser reconstruído**; só o provedor tem o lote íntegro.

**4.4 Que CDC/estado devolveu a consulta?** Estado bruto `XML firmado` (intermediário, `NO_RECONOCIDO`) [CAPTURA + FONTE]. O CDC está em `respuesta #>> '{response,DE,CDC}'` do intento de 09:30:57 (a consulta manual NEX-054 **não** grava `cdc_informado`). Duas possibilidades, separadas pela S2b: **(A)** CDC mutilado no segmento RUC (`^[0-9]{2}\[omitido\][0-9]{34}$`) ⇒ falsa divergência pelo defeito C8 (o resto do CDC mostrará EEE/PPP/NNN `001/001/0000001` e data `20261111`); **(B)** CDC íntegro com EEE/PPP/NNN diferente ⇒ o provedor respondeu sobre **outro documento**. Nenhum estado SIFEN final foi informado.

**4.5 O worker está realmente ativo?** **NÃO COMPROVADO.** O código existe (tick 60 s), mas desliga com `NEXIT_CONSULTA_AUTOMATICA=0`, `DEMO_MODE=true`, sem `DATABASE_URL` ou — na versão R02+ — sem NEX-077 («Consulta automática desactivada: falta la migración NEX-077»). Com a cadência 60/120/300/600 s, um worker ativo teria registrado consultas por volta de 09:11, 09:13, 09:18, 09:28; a S8 mostra o ator e a hora de cada intento. O refresco da lista (GET) não consulta SIFEN.

**4.6 Quem emitiu o KuDE?** O PDF é de DISTRIBUIDORA DEL PARAGUAY S.A. [CAPTURA]. O NEXIT pediu `001-001-0000001` **com** `dSerieNum:"AA"` às credenciais CASA MINGO [FONTE] e exibiu o que veio. Fatos históricos [FONTE documental]: esse nome é o do prestador no KuDE FE do ambiente de teste da CASA MINGO (REQ 20/10) e a conta já gerou PDF com RUC 80020653-3 (INC 21/10). **Hipóteses [NÃO COMPROVADAS]:** H-K1 o provedor ignora `dSerieNum` e devolve um `001-001-0000001` antigo (sem série) da mesma conta/emissor de teste; H-K2 a conta 80003314 nesse host está vinculada a mais de um emissor (80003314 e 80020653) e a busca não filtra por emissor; H-K3 busca do provedor sem isolamento entre contas. H-K1/H-K2 são mais compatíveis com o histórico. **H-K4 (NEXIT pediu a identidade errada) é descartada pela fonte**, salvo se `documentos_electronicos.serie` não for `AA` no banco (S1).

---

## 5. Resultados das SELECTs

**Nenhum resultado foi fornecido pelo operador. Todos os pontos que dependem do banco real estão NÃO COMPROVADOS.** As consultas abaixo são só leitura, não foram executadas e substituem `'<UUID_EMPRESA>'` pelo ID real (o repositório documenta CASA MINGO = `12463e0f-55f7-4a0c-aad1-dc0681ca68b7`, código/RUC `80003314`; confirmar antes de usar). Não copiar CDC completo, payload, token ou senha para fora do ambiente autorizado.

### S1 — Identidade, estado, lote e série (= ordem §3.1, sem mudanças)
Usar exatamente a SELECT 3.1 da ordem. Verificar: `serie='AA'`, `lote_mutilado`, `estado_local='ENVIADO'`, `estado_sifen='SIN_CONSULTA'`, `ultima_consulta_resultado='CDC_DIVERGENTE'`, `tiene_cdc=false`.

### S2 — Intentos (= ordem §3.2) + ator e request_id
Usar a SELECT 3.2 da ordem acrescentando `i.actor_id, i.request_id` na lista. O `request_id` é local; serve só para correlacionar com logs do NEXIT, não com o provedor.

### S2b — Estrutura da mutilação (lote e CDC) sem expor RUC/senha/CDC completo
```sql
SELECT d.punto_expedicion, d.numero, d.serie, i.tipo, i.creado_at, i.resultado,
       -- LOTE: formato RUC-iTiDE-EEE-PPP-NNNNNNN-AAAAMMDDhhmmss-aleatório
       i.lote ~ '^\[omitido\]-[0-9]+-[0-9]{3}-[0-9]{3}-[0-9]{7}-[0-9]{14}-[0-9]+$' AS lote_omitido_so_no_ruc,
       split_part(i.lote, '-', 2) AS lote_tipo_de,
       split_part(i.lote, '-', 3) || '-' || split_part(i.lote, '-', 4) || '-' || split_part(i.lote, '-', 5) AS lote_numero_fiscal,
       split_part(i.lote, '-', 6) AS lote_timestamp,
       coalesce(i.respuesta->>'nro_lote', '') = coalesce(i.lote, '') AS lote_igual_json,
       -- CDC da consulta (response.DE.CDC) e coluna cdc_informado
       c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$'          AS cdc_omitido_exatamente_no_ruc,
       position('[omitido]' IN coalesce(c.t, ''))       AS pos_omitido_cdc,
       c.t ~ '^[0-9]{44}$'                               AS cdc_integro,
       left(c.t, 2)                                      AS cdc_tipo,
       CASE WHEN c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$' THEN substr(c.t, 13, 3) || '-' || substr(c.t, 16, 3) || '-' || substr(c.t, 19, 7)
            WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 12, 3) || '-' || substr(c.t, 15, 3) || '-' || substr(c.t, 18, 7) END AS cdc_numero_fiscal,
       CASE WHEN c.t ~ '^[0-9]{2}\[omitido\][0-9]{34}$' THEN substr(c.t, 27, 8)
            WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 26, 8) END AS cdc_fecha_aaaammdd,
       CASE WHEN c.t ~ '^[0-9]{44}$' THEN substr(c.t, 3, 8) = e.ruc AND substr(c.t, 11, 1) = e.dv END AS cdc_integro_ruc_dv_igual_empresa,
       i.cdc_informado IS NOT NULL AND substr(i.cdc_informado, 3, 8) = e.ruc AS cdc_informado_ruc_igual_empresa
FROM public.documento_electronico_intentos i
JOIN public.documentos_electronicos d ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
JOIN public.empresas e ON e.id = d.empresa_id
CROSS JOIN LATERAL (SELECT i.respuesta #>> '{response,DE,CDC}' AS t) c
WHERE d.empresa_id = '<UUID_EMPRESA>'::uuid AND d.tipo = 'FE'
  AND ((d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
    OR (d.establecimiento = '001' AND d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
ORDER BY d.numero, i.creado_at, i.id;
```
(Na posição «mutilada», `[omitido]` ocupa 9 caracteres no lugar dos 8 do RUC; por isso os deslocamentos +1. Se o RUC da empresa tiver menos de 8 dígitos, ajustar com `lpad(e.ruc, 8, '0')`.)

### S3 — Configuração atual e bitácora (= ordem §3.3) + detalhes de PROBAR
Usar as duas SELECTs 3.3 da ordem e acrescentar na segunda:
`detalle->>'estado' AS prueba_estado, detalle->>'credenciales_guardadas' AS prueba_guardadas, detalle->>'version_probada' AS version_probada, detalle->>'aplicada' AS prueba_aplicada, usuario_id`.
Ampliar a janela para desde o último `GUARDAR` anterior (sem limite inferior), para saber a versão vigente às 09:10.

### S3c — OPCIONAL, só com autorização expressa e papel proprietário (a tabela de credenciais é inacessível ao `nexit_runtime`). Devolve SOMENTE booleanos.
```sql
SELECT (c.api_password = c.api_usuario)      AS clave_igual_usuario_api,
       (c.api_password = e.ruc)              AS clave_igual_ruc_empresa,
       (c.api_password = '80020653')         AS clave_igual_ruc_80020653,
       (c.api_usuario = e.ruc)               AS usuario_igual_ruc_empresa,
       EXISTS (SELECT 1 FROM public.documentos_electronicos d
                WHERE d.empresa_id = c.empresa_id AND d.tipo = 'FE' AND d.establecimiento = '001'
                  AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA'
                  AND replace(d.lote, '[omitido]', c.api_password) LIKE e.ruc || '-%') AS lote_original_comeca_com_ruc_empresa
FROM public.fe_gateway_credenciales c JOIN public.empresas e ON e.id = c.empresa_id
WHERE c.empresa_id = '<UUID_EMPRESA>'::uuid;
```

### S4 — JSON de emissão (= ordem §3.4) + ausência de emissor
Acrescentar: `s.payload ?| array['dRucEm','dDVEmi','dNumTim','iTipCont','dRucRec'] AS payload_tem_campos_emissor_ou_receptor_ruc, (SELECT count(*) FROM public.documento_electronico_solicitudes s2 WHERE s2.empresa_id = s.empresa_id AND s2.documento_id = s.documento_id) AS versoes`.

### S5 — Versão real das funções e colunas (só catálogo; não chama funções)
```sql
SELECT p.oid::regprocedure AS funcao, md5(pg_get_functiondef(p.oid)) AS md5_definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fe_documento_registrar_envio','fe_documento_iniciar_envio','fe_documento_registrar_consulta',
  'fe_documento_registrar_consulta_flujo_nce','fe_documento_registrar_consulta_auto','fe_consulta_reservar','fe_consulta_reservar_token',
  'fe_gateway_config_guardar','fe_documento_crear_fe','fe_secuencia_reservar','fe_cdc_coherente')
ORDER BY 1;

SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND ((table_name = 'documentos_electronicos' AND column_name IN ('consulta_lease_token','proxima_consulta_at','consultas_auto','lote','serie'))
   OR (table_name = 'empresas' AND column_name = 'fe_max_lineas')
   OR (table_name = 'documento_electronico_intentos' AND column_name IN ('cdc_informado','fase','lote')));

SELECT version, nombre, checksum FROM public.schema_migrations WHERE version >= 'NEX-045' ORDER BY version;
```
(`md5` serve para o ChatGPT comparar com o texto das migrations do Git; não revela dados.)

### S6 — Secuencia FE do ponto 001 e por que a série AA
```sql
SELECT pe.codigo AS punto, s.tipo_documento, s.serie, s.ultimo_numero, s.activo, s.actualizado_at
FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion pe ON pe.empresa_id = s.empresa_id AND pe.id = s.punto_id
WHERE s.empresa_id = '<UUID_EMPRESA>'::uuid AND s.tipo_documento = 'FE' ORDER BY pe.codigo;
```
+ `fe_puntos_expedicion_log` do mesmo ponto (ações e datas, sem dados pessoais). Pela regra NEX-063, a 1ª numeração de uma identidade é **sem série**; `AA-0000001` só surge por esgotamento ou por **configuração manual** — confirmar quem/quando configurou.

### S7 — Colisão de número dentro do NEXIT (só contagens)
```sql
SELECT (d.empresa_id = '<UUID_EMPRESA>'::uuid) AS propria, d.serie IS NULL AS sem_serie, d.estado_sifen, count(*)
FROM public.documentos_electronicos d
WHERE d.tipo = 'FE' AND d.establecimiento = '001' AND d.punto_expedicion = '001' AND d.numero = '0000001'
GROUP BY 1, 2, 3;
```

### S8 — Worker / ator das consultas
```sql
SELECT d.numero, d.serie, i.creado_at, i.tipo, i.resultado, i.actor_id, (i.request_id IS NOT NULL) AS tem_request_id
FROM public.documento_electronico_intentos i JOIN public.documentos_electronicos d ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
WHERE i.empresa_id = '<UUID_EMPRESA>'::uuid AND i.tipo = 'CONSULTA' AND i.creado_at >= '2026-11-10 00:00:00-03'::timestamptz
ORDER BY i.creado_at;
```
+ (se S5 mostrar as colunas) `proxima_consulta_at, consultas_auto, consulta_lease_hasta` desses documentos; + logs do contêiner `app` filtrando «Consulta automática» / «Planificador» (só presença e hora); + booleanos de `NEXIT_CONSULTA_AUTOMATICA`, `DEMO_MODE`, `DATABASE_URL` definidos; + **SHA do código implantado** (`git rev-parse HEAD` no diretório de build ou rótulo da imagem).

---

## 6. Proposta técnica integral (NÃO implementar até aprovação explícita)

Princípio: **uma única entrega coordenada** (código + 1 migration incremental nova + casos), não patches Rxx isolados. Ordem de prioridade dentro da mesma entrega:

### 6.1 Contenção operacional imediata (responsável, sem código)
1. Suspender emissões CASA MINGO até P1–P3 abaixo; não reenviar nem reconsultar em massa.
2. Confirmar com o provedor se `gateway.e-factura-hub.com` é **teste** ou **produção** para CASA MINGO e qual RUC emissor está vinculado ao usuário 80003314 (§6.4). Se for teste, as FE emitidas lá **não têm valor fiscal real**: decisão de negócio do responsável.
3. Trocar a senha da API para um valor que **não** seja o RUC (reduz a mutilação mesmo em versões antigas; não substitui a correção).
4. Implantar no máximo a versão que contenha R03–R05 **só depois** da auditoria R06/P0, para não fixar CDC de outro emissor (ver P2).

### 6.2 Correções de código/SQL (uma ordem, uma migration NEX-079 versionada)
- **P1 — Identidade do emissor como invariante fiscal.** Fonte confiável: `empresas.ruc/dv` (ou, se o responsável decidir, um campo explícito «RUC emissor autorizado no gateway» por empresa na config). Em `cdcCoherente` (TS) e numa função SQL nova `fe_cdc_coherente_emisor(tipo, est, pun, num, fecha, ruc, dv, cdc)`: exigir tipo, RUC (3-10), DV (11), EEE/PPP/NNN e **data (26-33) = data de `dFeEmiDE`**. Usar em envio, consulta manual/fluxo/auto (NEX-050/054/062/077 por funções novas, sem editar migrations aplicadas). CDC de outro emissor ⇒ novo resultado `CDC_EMISOR_DISTINTO`: grava evidência, **nunca** grava `documentos_electronicos.cdc` nem estado. Não gera, completa nem corrige CDC.
- **P2 — Saneamento separado do dado fiscal (fechar R05-F001).** Manter R05 (exceção por rota fiscal) e concluir R06: operacional e evidência guardam CDC/lote **íntegros**; segredos são omitidos só em texto livre. Proibir no SQL a gravação de `lote`/`cdc_informado` contendo `[omitido]` (CHECK por função de registro, não por UPDATE retroativo).
- **P3 — Correlação da recepção.** `DocumentoRecepcion` passa a incluir `serie` e `rucEmisor`. Validar o lote contra o padrão documentado `RUC-iTiDE-EEE-PPP-NNNNNNN-ts-aleatório`: RUC = emissor confiável, iTiDE e número = documento. Divergência ⇒ `ENVIO_INDETERMINADO` («recepción no correlacionada»), nunca `ENVIADO`. `Rechazados` com chave sem série continua não atribuível a documento com série se houver ambiguidade.
- **P4 — Snapshot imutável por intento (ENVIO, CONSULTA, KUDE).** Nova coluna/tabela append-only com: `base_url`, `credencial_ref`, `credenciales_version`, `api_usuario` (não secreto), `sha256` do corpo enviado, `request_id` **e se foi transmitido**, identificador do provedor se existir, HTTP, `estado_gateway` bruto, `codRespuesta`, timestamps de início/fim. Ler a config **uma vez** por operação e propagar o mesmo objeto (eliminar a 2ª leitura em `enviarDocumento`). Registrar também as aberturas de KuDE (hoje não deixam rastro).
- **P5 — Consulta: evidência completa e estado consolidado.** Função de registro manual nova que grava `cdc_informado` (como NEX-077) e o estado bruto sempre; o documento passa a expor «último estado do gateway + data + resultado técnico» separado de `estado_sifen` confirmado. `NO_RECONOCIDO` com CDC **não** fixa CDC no documento até estado final com identidade completa (P1), evitando CDC permanente de documento ainda não validado.
- **P6 — KuDE com titularidade verificável (exige decisão do responsável, pois revisa PRO-326).** Manter «KuDE sem exigir APROBADO nem CDC local», mas exigir que o `CDC` **devolvido pelo `/api/kude`** tenha RUC/DV = emissor confiável, EEE/PPP/NNN = documento e data = `dFeEmiDE`. Sem CDC na resposta ou com divergência ⇒ não exibir; mensagem «No se pudo verificar que el KuDE pertenezca a este documento». O CDC da resposta só é comparado, nunca gravado. Alternativa, se o provedor confirmar outro contrato: metadado de emissor/conta na resposta.
- **P7 — Configuração explícita do ambiente.** Mostrar na tela de configuração `credencial_ref`, `activo` e o ambiente (TESTE/PRODUÇÃO) declarado; não exibir `URL_GATEWAY_PRUEBA` como se estivesse salva; prova de conexão grava a versão (já existe) e o resultado indica que só valida login.
- **P8 — Worker.** Nenhum cron novo. Expor no log/estado se o planificador está ativo e se NEX-077 existe; a ativação real depende do gate NEX-077.
- **P9 — Higiene:** atualizar o comentário de contrato `gateway.ts:6-15`.

Fora do escopo desta proposta: reconstruir lote/CDC antigos, UPDATE de estados históricos, PRO-340, NEX-078.

### 6.3 Plano de testes (escrever; executar só com autorização)
Funções reais com fetch/DB sintéticos: CASA MINGO × emissor 80020653 com o mesmo `001-001-0000001`; série AA × sem série; senha = RUC (lote/CDC íntegros e evidência sem segredo em texto livre); lote com RUC/tipo/número/timestamp divergente; `XML firmado`, `Rechazado 1101`, `Aprobado` com CDC de outro emissor e com data diferente; consulta manual e automática (com e sem NEX-077); troca de credencial entre envio e consulta (snapshot distinto); KuDE com CDC próprio, alheio, ausente; idempotência de reenvio. Depois, homologação real controlada pelo responsável com **um** documento de teste e confirmação do provedor.

### 6.4 Perguntas ao provedor (só com autorização; sem senhas, tokens, certificados ou dados completos de clientes)
1. O host `gateway.e-factura-hub.com` é teste ou produção? Qual RUC/DV emissor e timbrado estão vinculados ao usuário API `80003314`? Houve mudança de emissor desde 21/10 (80020653-3 ↔ 80003314-0)?
2. Lote íntegro recebido em 11/11/2026 09:10:28 para `001-001-0000001` série `AA`: conta, RUC, hash/identificador do JSON, estado atual («XML firmado»?), envio ao SIFEN e resposta.
3. `/api/consulta_de` e `/api/kude` filtram por `dSerieNum` **e** pela conta/emissor autenticado? Por que `/api/kude` com `001-001-0000001`/`AA` devolve PDF de DISTRIBUIDORA DEL PARAGUAY S.A.? Qual CDC veio nessa resposta?
4. O formato do `nro_lote` é contratual (`RUC-iTiDE-EEE-PPP-NNNNNNN-timestamp-aleatório`)? Existe um identificador de transação por requisição que o NEXIT possa enviar/receber?
5. O portal oculta documentos «XML firmado» com «Ocultar pendientes»? Procurar a FE sem filtros.

---

## 7. Limites desta auditoria
- Não houve acesso ao banco, VM, logs, portal ou provedor; os SHA em produção e o estado das migrations são inferidos (§0.1, §5).
- A afirmação «senha = RUC emissor do lote» decorre do formato documentado do lote e do algoritmo de saneamento; confirmar com S2b/S3c.
- `kude-visor.ts`, `kude-modal.tsx` e `documentos/page.tsx` foram lidos só nos trechos relevantes (título, lote, rótulos); `presentacion-sifen.ts` e `payload-fe.ts` não foram lidos integralmente (C14 e C6 se apoiam no Git/SQL citados).
- As SELECTs S2b–S8 usam colunas verificadas nas migrations do Git; se a base real divergir (S5), ajustar antes de rodar.
- PRO-338-R06 permanece em espera; PRO-340 não iniciada.
