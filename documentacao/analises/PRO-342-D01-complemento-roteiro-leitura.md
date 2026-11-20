# PRO-342-D01 — Complemento: conformidade dos SELECTs, roteiro único de leitura, classificação da evidência e proposta consolidada

**Data:** 11/11/2026 · **Branch:** `feature/NEXIT-2026-001-banco-demo` (base `1a3eb0c`) · **Atende:** pedido do responsável após o [PARECER CHATGPT PRO-342-D01 CONDICIONAL](../testes/PARECER-CHATGPT-PRO-342-D01-REVISAO-CONDICIONAL-2026-11-11.md)
**Documentos irmãos:** [relatório D01 integral](PRO-342-D01-auditoria-fiscal-integral-casa-mingo.md) (publicado sem alterar o conteúdo técnico, apenas com a Errata E1) · [script SQL único de leitura](../banco/nexit/v1/scripts/diagnostico-PRO-342-D01-SOLO-LECTURA.sql)
**Natureza:** documentação apenas. **Nada foi executado** por Claude: nenhum SQL, teste, build, migration, VM, Docker, gateway, deploy, reenvio, nem alteração de CDC/lote/série/estado/configuração. Nenhum arquivo de código funcional foi modificado.

---

## A. Conformidade dos SELECTs com o schema versionado

Conferência feita contra as migrations do Git (`documentacao/banco/nexit/v1/migraciones/`) e contra o código que monta os JSON. «OK» = tabela/coluna/função/chave JSON existe exatamente com esse nome na versão indicada.

### A.1 SELECTs da ordem (§3.1–§3.5)

| Ordem | Objeto | Resultado | Dependência real de migration / observação |
|---|---|---|---|
| §3.1 | `documentos_electronicos`: `id, empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, estado_local, estado_sifen, ultima_consulta_resultado, ultima_consulta_at, estado_gateway_texto, cod_respuesta, cdc` | OK | NEX-047. `numero` é `text` `^[0-9]{7}$` e `serie` `^[A-Z]{2}$` ⇒ os literais `'0000001'`, `'AA'` estão corretos. |
| §3.1 | `documentos_electronicos.lote` | OK | Coluna criada em **NEX-049** (não NEX-047). |
| §3.2 | `documento_electronico_intentos`: `id, tipo, creado_at, resultado, http_status, estado_gateway, estado_sifen, cod_respuesta, mensaje, respuesta, actor_id, request_id` | OK | NEX-047; `tipo IN ('CONSULTA','ENVIO')`. |
| §3.2 | `intentos.fase`, `intentos.lote` | OK | NEX-049. |
| §3.2 | `intentos.cdc_informado` | OK | NEX-050. Atenção: só é preenchido no **ENVIO** (NEX-050) e na consulta automática NEX-077; a consulta manual NEX-054 **não** o grava ⇒ `cdc_informado_presente=false` em CONSULTA manual é esperado, não prova ausência de CDC na resposta. |
| §3.2 | `respuesta #>> '{response,DE,CDC}'`, `'{response,Estado}'` | OK para **CONSULTA** | Caminho do contrato `/api/consulta_de` (`gateway.ts::interpretarConsulta`). Em linhas **ENVIO** essas expressões devolvem NULL por construção; o lote do ENVIO está em `i.lote` e em `respuesta->>'nro_lote'`. |
| §3.2 | `respuesta #>> '{status}'` | OK | Corpo `/api/recepcion_de` traz `status`; na consulta pode faltar. O alias da ordem `status_http_body` é o campo `status` do **corpo**, não o HTTP (que é `http_status`). |
| §3.3 | `fe_gateway_config`: `empresa_id, base_url, credencial_ref, activo, actualizado_at` | OK | NEX-047. |
| §3.3 | `fe_gateway_config`: `credenciales_version, ultima_prueba_at, ultima_prueba_estado` | OK | NEX-061 (redefinidas em NEX-069). Se NEX-061 não estiver aplicada, o SELECT falha — por isso o script roda sem `ON_ERROR_STOP`. |
| §3.3 | `fe_gateway_config_log`: `accion, creado_at, detalle` | OK | NEX-061; `accion IN ('GUARDAR','PROBAR')`. |
| §3.3 | `detalle->>'base_url'`, `'usuario_api_cambio'`, `'clave_cambio'` | OK | Gravadas pelo `GUARDAR` de NEX-061 (linha 144). |
| §3.3 | `detalle->>'base_url_anterior'`, `'url_cambio'` | OK **só com NEX-069** | Se o `GUARDAR` foi gravado pela versão NEX-061, essas chaves vêm NULL — não é erro, é sinal de qual versão gravou. |
| §3.3 | Janela 08:45–10:00 `-03` | OK | Paraguai = UTC−3 sem horário de verão desde 2024 ⇒ `-03` correto. O script amplia a janela a partir de 01/11 e acrescenta o último `GUARDAR` anterior a 09:10:27 (configuração vigente no envio, por exclusão). |
| §3.4 | `documento_electronico_solicitudes`: `version, creado_at, payload_hash, payload` | OK | NEX-048. |
| §3.4 | `payload->>'dEst'`, `'dPunExp'`, `'dNumDoc'`, `'dSerieNum'`, `'dFeEmiDE'` | OK | Chaves na **raiz** do JSON: `payload-fe.ts:12` declara que são completadas pela SQL `fe_documento_crear_fe` ao reservar número; `iTiDE` também na raiz (`payload-fe.ts:450`). |
| §3.5 | `to_regprocedure(...)` | OK com assinatura exata | Ex.: `fe_consulta_reservar(integer,integer,text[])` (NEX-062:415). Para funções com várias sobrecargas/assinaturas longas o script usa `pg_proc.proname` em vez de adivinhar a assinatura. |
| §3.5 | NEX-077: `documentos_electronicos.consulta_lease_token`, `fe_consulta_reservar_token`, `fe_consulta_programar_token`, `fe_documento_registrar_consulta_auto` | OK | NEX-077:29/34/66/82. |
| §3.5 | NEX-078: `empresas.fe_max_lineas` | OK | NEX-078:25. |
| §3.5 | `md5(pg_get_functiondef(oid))` | OK, **com limite** | `pg_get_functiondef` devolve o texto **normalizado** pelo PostgreSQL, que não é byte a byte o arquivo do Git. O md5 serve para comparar ambientes entre si ou contra um banco de referência onde a migration foi aplicada, **não** contra o hash do arquivo `.sql`. |

**Conclusão A.1:** todos os nomes usados na ordem existem no schema versionado. Não há coluna inventada. Pontos de interpretação (não de erro): `cdc_informado` vazio na consulta manual, caminho `{response,DE,CDC}` só em CONSULTA, chaves NEX-069 ausentes se o `GUARDAR` for anterior.

### A.2 SELECTs acrescentados pelo relatório D01 (S2b, S3c, S5–S8) e pelo script

| Item | Objetos usados | Resultado |
|---|---|---|
| Empresa | `empresas.id, codigo, razon_social, ruc, dv` | OK (NEX-002). `ruc` é `text` sem formato fixo ⇒ comparações usam `e.ruc` e `lpad(e.ruc,8,'0')`. |
| Migrations | `schema_migrations(version, nombre, checksum, aplicada_at, aplicada_por)` | OK (NEX-001:13). |
| S6 secuencia | `fe_punto_secuencias(empresa_id, punto_id, tipo_documento, ultimo_numero, origen, actualizado_at)` | OK (NEX-060); `serie` e `activo` só com **NEX-063**. |
| S6 bitácora | `fe_puntos_expedicion_log(punto_id, usuario_id, accion, anterior, nuevo, creado_at)`; `fe_puntos_expedicion.codigo` | OK (NEX-057); ação `SECUENCIA` admitida a partir de NEX-062:458. |
| S8 worker | `documentos_electronicos.proxima_consulta_at, consulta_lease_hasta, consultas_auto` | OK (NEX-062:408-410). |
| S8 ator | `usuarios(empresa_id, id, nombre, apellido)` | OK (NEX-002). |
| S3 PROBAR | `detalle->>'estado'`, `'credenciales_guardadas'`, `'version_probada'`, `'aplicada'` | OK (NEX-061:220). |
| S3c credenciais | `fe_gateway_credenciales(empresa_id, api_usuario, api_password)` | OK (NEX-061:40). Seção **opcional**, devolve só booleanos e exige papel com SELECT na tabela. |
| Huella | `fe_documento_registrar_envio, fe_documento_iniciar_envio, fe_documento_registrar_consulta, fe_documento_registrar_consulta_flujo_nce, fe_documento_registrar_consulta_auto, fe_consulta_reservar, fe_consulta_reservar_token, fe_gateway_config_guardar, fe_gateway_credenciales_leer, fe_documento_crear_fe, fe_secuencia_reservar, fe_cdc_coherente, fe_gateway_url_valida` | Todos existem em alguma migration (NEX-047…NEX-077). Função ausente = linha ausente na saída, não erro. |

---

## B. Roteiro operacional único — SOMENTE LEITURA

**Quem executa:** apenas o responsável/operador autorizado. **Claude não executa nenhum passo.** Nenhum passo grava, reinicia, reenvia, consulta o gateway ou altera configuração.

### B.0 Antes de começar
1. Não emitir nem reenviar FE de CASA MINGO até concluir o roteiro (parecer §5).
2. Não reiniciar `nexit-app` antes do passo B.1: o reinício apaga o carimbo de início e o log em memória do container.
3. Guardar toda saída em arquivos locais na VM; revisar antes de compartilhar (seção B.5).

### B.1 Versão efetivamente implantada na VM
Fonte dos nomes: `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (clone `/tmp/nexit-instalacao`, stack `/srv/stacks/distribuidora`, containers `nexit-app`/`nexit-db`, imagem `nexit-app:teste`, WORKDIR `/app`).

```sh
# 1) Quando a imagem foi construída e quando o container começou (não altera nada)
docker inspect -f 'image={{.Image}} created={{.Created}} started={{.State.StartedAt}}' nexit-app
docker image inspect -f 'id={{.Id}} created={{.Created}}' nexit-app:teste
# 2) Commit que estava no clone (só indica o que FOI baixado; não prova que foi o construído)
git -C /tmp/nexit-instalacao log -1 --format='%H %ci %s'
git -C /tmp/nexit-instalacao reflog -n 10 --date=iso
# 3) Marcadores de versão DENTRO do build em execução (contagem de arquivos; 0 = ausente)
for m in "CDC distinto del registrado" "CDC informado inconsistente con el documento" "NEX-077 (reserva con token)" "fe_max_lineas" "pertenece a un emisor distinto"; do
  printf '%s => ' "$m"; docker exec nexit-app sh -c "grep -rlF -- \"$m\" /app/.next 2>/dev/null | wc -l"; done
# 4) Flags do worker (valores só destas duas; das demais apenas presença/nome — nunca valores)
docker exec nexit-app sh -c 'echo NEXIT_CONSULTA_AUTOMATICA=${NEXIT_CONSULTA_AUTOMATICA-<sin definir>}; echo DEMO_MODE=${DEMO_MODE-<sin definir>}; [ -n "$DATABASE_URL" ] && echo DATABASE_URL=presente || echo DATABASE_URL=ausente; env | cut -d= -f1 | grep -E "^NEXIT_FE_" | sort'
# 5) Log do worker no dia do incidente (só linhas do planificador, truncadas)
docker logs -t --since 2026-11-11T11:00:00Z --until 2026-11-11T14:00:00Z nexit-app 2>&1 | grep -E "desactivada|Planificador|Consulta autom" | cut -c1-200 | head -50
```

Interpretação dos marcadores (verificada por `git grep` em cada commit):

| Marcador encontrado no build | Significa |
|---|---|
| «CDC distinto del registrado» > 0 e «CDC informado inconsistente…» = 0 | Build entre `3eada02` (12/10) e `53c8204^` ⇒ **anterior à PRO-338-R03**, `sinSecretos` global ativo. |
| «CDC informado inconsistente con el documento» > 0 | Build `53c8204` ou posterior (R03+). |
| «NEX-077 (reserva con token)» > 0 | Build `19e4ce3` ou posterior (worker exige NEX-077). |
| «fe_max_lineas» > 0 | Build `1ab9d1d` (PRO-339) ou posterior ⇒ **sem NEX-078 aplicada, toda FE nova falha 422**. |
| «pertenece a un emisor distinto» > 0 | Build entre `bf7231c` e `d22fa7d^` (antes da PRO-326). |

### B.2 Banco — script único
```sh
cd /tmp/nexit-instalacao && git pull --ff-only   # só para obter o script; NÃO rebuild, NÃO deploy
docker exec -i nexit-db psql -U nexit_app -d nexit -X -v empresa=<UUID_CASA_MINGO> \
  < documentacao/banco/nexit/v1/scripts/diagnostico-PRO-342-D01-SOLO-LECTURA.sql > /tmp/PRO-342-D01-salida.txt 2>&1
```
- A sessão é forçada a `READ ONLY` (seção 0 deve mostrar `read_only = on`) com `statement_timeout = 30s`. Sem `-v empresa` o script aborta antes de qualquer consulta.
- Sem `ON_ERROR_STOP`: seções que dependem de NEX-061/063/077 falham sozinhas; **a própria mensagem de erro é evidência** de migration ausente.
- A seção 13 (booleans sobre a senha da API) só roda com `-v incluir_credenciales=1`, **autorização expressa** e um papel que já tenha SELECT em `fe_gateway_credenciales`. Não conceder permissão nova para isso.

Mapa script → item pedido pelo responsável:

| Pedido | Seções do script / passo |
|---|---|
| Versão implantada | B.1 (VM) + seções 2, 3, 4 (migrations, objetos, huella de funções) |
| Configuração do gateway usada no envio | seção 9 (config atual, bitácora desde 01/11, último GUARDAR antes de 09:10:27) + B.4 provedor |
| JSON original e lote retornado | seções 8 (identidade do payload, sem payload completo) e 6/7 (lote, `nro_lote` do corpo, estrutura) |
| Histórico de consultas e respostas SIFEN | seções 6 e 12 (cronologia, ator, estado bruto, código, mensagem truncada) |
| CDC retornado e corrupção `[omitido]` | seção 7 (`cdc_omitido_exactamente_en_ruc`, posição, número/fecha fiscal, RUC/DV só como booleano) |
| NEX-077 / NEX-078 | seções 2 e 3 |
| Identidade e origem do KuDE alheio | seções 1, 11 (colisão do número 001-001-0000001 dentro do NEXIT) + B.4 provedor (o NEXIT não guarda o PDF nem o `CDC` do `/api/kude`) |

### B.3 Logs da aplicação para o KuDE
O NEXIT **não persiste** a chamada `/api/kude` (sem intento, sem CDC devolvido). O único rastro local possível é o log do container:
```sh
docker logs -t --since 2026-11-11T12:00:00Z --until 2026-11-11T14:00:00Z nexit-app 2>&1 | grep -iE "kude" | cut -c1-160 | head -30
```
Ausência de linhas é esperada e não prova nada.

### B.4 Provedor (por escrito, sem enviar senha, token, certificado nem JSON completo)
1. Para o usuário de API da CASA MINGO (informar só o usuário, nunca a senha): o endpoint `https://gateway.e-factura-hub.com` é ambiente de **teste ou produção**? Em que conta/emissor (RUC) esse usuário está autorizado?
2. Recepção de 11/11 ≈09:10:28 −03, identidade FE `001-001-0000001` série `AA`: em qual conta/emissor ela entrou? Qual o `nro_lote` completo devolvido? Qual o estado atual do DE (firmado/aprobado/rechazado) e o CDC?
3. Por que `/api/kude` com `{dEst:001, dPunExp:001, dNumDoc:0000001, dSerieNum:AA}` devolveu PDF de DISTRIBUIDORA DEL PARAGUAY S.A.? O campo `CDC` daquela resposta pertence a qual RUC?
4. «XML firmado» é estado intermediário? O portal o oculta com «Ocultar pendientes»?
5. As FE `001-003-0009018…21`: conta, CDC e motivo 1101 registrados no provedor.

No portal: desmarcar «Ocultar pendientes» e limpar filtros antes de concluir que a FE não existe.

### B.5 O que devolver para auditoria (sem dados sensíveis)
- Saída de B.1 completa (não contém segredos se o passo 4 foi seguido: só nomes de variáveis `NEXIT_FE_*`).
- `/tmp/PRO-342-D01-salida.txt` **revisado**: pode conter `mensaje_resumido` com texto do provedor; se houver algo parecido com token/senha, substituir por `[retirado]` antes de enviar. O script não imprime CDC completo, lote completo, senha nem payload.
- Resposta escrita do provedor e captura do portal sem filtros.
- **Nunca** enviar: senha/token, `.env`, `DATABASE_URL`, CDC completo, PDF do KuDE de terceiro, payload JSON completo.

---

## C. Classificação da evidência (alinhada ao parecer ChatGPT)

O relatório D01 publicado mantém suas etiquetas originais. Onde o parecer reclassificou uma afirmação, **vale a classificação abaixo**; isto não altera o conteúdo técnico do relatório, apenas fixa o grau de prova.

### C.1 Defeitos COMPROVADOS (fonte/SQL versionados; independem do ambiente)

| # | Defeito | Prova |
|---|---|---|
| D1 | `sinSecretos` anterior à R03 substituía a senha em **todo** o JSON do resultado; se a senha coincidir com parte do lote ou do CDC, o valor operacional é mutilado antes de persistir. | `gateway.ts` em `3eada02…53c8204^` (relatório §2/§3). |
| D2 | `interpretarKude` aceita qualquer PDF válido e ignora o `CDC` da resposta; não há verificação de emissor, série ou número. | `gateway.ts::interpretarKude`/`obtenerKudeGateway`; `shared.ts::obtenerKude`. |
| D3 | Nenhum intento (ENVIO/CONSULTA/KUDE) guarda snapshot de `base_url`, usuário de API, `credenciales_version`; KuDE nem gera intento. | NEX-047/049/050/054; `envio.ts::cerrarEnvio`. |
| D4 | `cdcCoherente` (TS) e `fe_cdc_coherente` (SQL) só checam tipo/EEE/PPP/número — **não RUC/DV do emissor**. | `gateway.ts:495-497`; NEX-047:68. |
| D5 | «XML firmado» → `NO_RECONOCIDO` (correto não ser aprovação); com `CDC_DIVERGENTE` o documento fica `SIN_CONSULTA`, escondendo que houve consulta técnica. | `estados.ts`; NEX-054. |
| D6 | Consulta manual (NEX-054) não grava `cdc_informado`; a evidência do CDC recebido fica só no JSON `respuesta`, sujeito a D1. | NEX-054 vs NEX-077. |
| D7 | `ENVIADO` é gravado com `status:success` + lote, sem validar que o lote corresponde ao emissor/série enviados. | `gateway.ts::interpretarRecepcion`; NEX-050. |
| D8 | Worker de consulta depende de NEX-077; sem ela não consulta (comportamento de código, não de produção). | `consulta-automatica.ts`, `instrumentation.ts`. |

### C.2 HIPÓTESES (plausíveis, **não** provadas)

| # | Hipótese | Grau | O que a confirma ou derruba |
|---|---|---|---|
| H1 | A VM roda build anterior à R03 (`3eada02…53c8204^`). | Forte (captura mostra rótulo removido em R03) | B.1 marcadores. |
| H2 | A senha da API é igual ao RUC que encabeça o lote. | Plausível (só a máscara do lote) | Seção 7 `lote_omitido_solo_en_ruc`; seção 13 booleana, se autorizada. |
| H3 | O mesmo D1 causou o lote `[omitido]` e o `CDC_DIVERGENTE` de 09:30:57. | Plausível | Seção 7 `cdc_omitido_exactamente_en_ruc` na CONSULTA de 09:30:57. |
| H4 | `gateway.e-factura-hub.com` é ambiente de teste. | **Não demonstrado** (nome de constante e comentário não bastam; relatório §0 item 5 fica rebaixado a hipótese) | B.4 pergunta 1. |
| H5 | A FE foi recebida em conta de outro emissor. | Não provado | B.4 perguntas 1–2; seção 7 `lote_ruc_igual_empresa` (só se o lote não estiver mutilado — se estiver, só H2/seção 13 resolvem). |
| H6 | A FE não aparece no portal por estar «XML firmado» e «Ocultar pendientes» marcado. | Plausível | Portal sem filtros; B.4 pergunta 4. |
| H7 | O KuDE alheio veio de colisão de identidade `001-001-0000001` em outra conta do provedor. | Plausível | B.4 pergunta 3; seção 11 só mostra colisões **dentro** do NEXIT. |
| H8 | Worker parado em produção. | Não provado | B.1 passos 4–5 + seções 3 e 12. |

### C.3 EVIDÊNCIA PENDENTE (quem fornece)

| Evidência | Fonte | Passo |
|---|---|---|
| SHA/build real e flags | Operador (VM) | B.1 |
| Migrations aplicadas e huella das funções | Operador (DB) | B.2 seções 2–4 |
| Intentos ENVIO/CONSULTA com marcadores de mutilação | Operador (DB) | B.2 seções 5–7, 12 |
| Identidade do JSON (série AA, fecha) | Operador (DB) | B.2 seção 8 |
| Configuração/bitácora antes e depois de 09:10/09:17 | Operador (DB) | B.2 seção 9 |
| Ambiente, conta, lote completo, estado e KuDE no provedor | Provedor | B.4 |
| Senha = RUC (só booleano) | Operador, com autorização expressa | B.2 seção 13 |

---

## D. Proposta consolidada de correção — ENVIO → LOTE → CONSULTA → HISTÓRICO → KUDE

**Não iniciar.** Uma única ordem integral, depois da evidência C.3 e da auditoria ChatGPT. Detalhamento técnico de cada item em relatório D01 §6.2 (P1–P9); aqui fica a sequência, o critério de aceite e a dependência de evidência.

| Etapa | Mudança | Itens D01 | Critério de aceite (a escrever como casos; executar só com autorização) | Depende de |
|---|---|---|---|---|
| 0. Base | Implantar build ≥ R05 (saneamento por rota) **só depois** de NEX-077 e NEX-078 verificadas/aplicadas pelo responsável; ou manter o build atual com emissão suspensa. | — | Marcadores B.1 conferidos após deploy. | H1, seções 2–3 |
| 1. Identidade do emissor | Invariante única «RUC/DV emissor da empresa» (`empresas.ruc/dv` ou campo explícito decidido pelo responsável), usada por ENVIO, CONSULTA e KUDE. | P1 | CDC com RUC/DV ≠ empresa nunca vira CDC do documento nem estado fiscal; vira alerta de identidade. DV/fecha só se validados pela estrutura oficial (parecer §3). | Decisão do responsável sobre a fonte |
| 2. ENVIO | Snapshot imutável por intento: `base_url`, `credencial_ref`, `credenciales_version`, usuário de API (não secreto), `payload_hash`, carimbos. `ENVIADO` só se o lote corresponder ao emissor/tipo/EEE/PPP/número enviados; senão `ENVIO_INDETERMINADO` com alerta. | P3, P4 | Recepção com lote de outro RUC/número ⇒ não `ENVIADO`. Cada intento mostra o destino efetivo. | D3, D7 |
| 3. LOTE | Persistir o `nro_lote` **exato**; mascarar só cópias de log/evidência, nunca o campo operacional. Estrutura `RUC-iTiDE-EEE-PPP-NNNNNNN-ts-aleatório` validada como no item 2. | P2 (fecha R05-F001/R06) | Senha sintética = RUC ⇒ lote e CDC operacionais íntegros; segredo ausente de `mensaje`/logs. | D1, H2 |
| 4. CONSULTA | Registro manual passa a gravar `cdc_informado` (como NEX-077) e o estado bruto sempre; estados intermediários do provedor (ex.: «XML firmado») classificados como pendentes do provedor, não `NO_RECONOCIDO`/`SIN_CONSULTA`. Primeiro CDC só fixado com identidade completa (item 1); CDC diferente do já registrado nunca sobrescreve (invariante CDC). | P5, P8 | Consulta com «XML firmado» ⇒ documento pendente visível; CDC mutilado/alheio ⇒ alerta, sem estado fiscal. Worker: nenhum cron novo. | D4–D6, D8 |
| 5. HISTÓRICO | Intentos append-only com resultado técnico, estado bruto, estado fiscal validado e snapshot; UI separa «última resposta técnica» de «estado fiscal». Sem UPDATE/reconstrução de históricos mutilados (ficam marcados como tal). | P4, P5 | Histórico de 11/11 continua legível e marcado; nenhum dado antigo reescrito. | — |
| 6. KUDE | Manter PRO-326 (sem exigir APROBADO nem CDC local), mas exigir titularidade: `CDC` devolvido pelo `/api/kude` com RUC/DV da empresa e EEE/PPP/número/série do documento; registrar intento KUDE com snapshot. Sem correlação ⇒ mensagem de incerteza, **nunca** o PDF alheio sob o título do documento. | P6 (revisa PRO-326 ⇒ decisão do responsável) | KuDE com CDC de outro RUC ⇒ bloqueado com aviso; KuDE próprio sem CDC local ⇒ exibido. | D2, H7, decisão |
| 7. Configuração | Tela de configuração mostra ambiente declarado (teste/produção) e `credencial_ref`; deixar de exibir `URL_GATEWAY_PRUEBA` como padrão de produção. | P7, P9 | Operador vê com qual ambiente/conta emitirá antes de emitir. | H4 (provedor) |
| Operacional (responsável) | Se H2 confirmada: rotacionar a senha da API com o provedor (senha = RUC público é fraca e é o gatilho de D1). Não reconstruir lotes/CDCs antigos. | §6.1 | — | H2 |

Migration: uma única NEX-079 incremental, só versionada (não aplicada pela IA), cobrindo snapshot por intento, `cdc_informado` na consulta manual e intento KUDE. Nenhuma alteração em NEX-047…NEX-078 já existentes.

Fora do escopo desta proposta: PRO-340 (bloqueada), reenvio/cancelamento de FE, correção manual de estados, mudanças de numeração/série.
