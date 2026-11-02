# NEXIT V1 — FAT-E2: concluir envio ao gateway e confirmação fiscal SIFEN

**Estado:** DEFINIDO — IMPLEMENTAÇÃO AUTORIZADA PELO RESPONSÁVEL EM 14/10/2026; aguarda execução pelo Claude Code, commit/push e auditoria ChatGPT. **Não homologado.**

**Objetivo de negócio:** concluir a experiência «Enviar factura electrónica» para a operação FE V1 **PYG, Contado, Efectivo**, aproveitando o código atual e garantindo que, após o envio ao gateway, o NEXIT distingue **recepção, processamento e aprovação/rejeição fiscal** sem duplicar documentos, numeração nem transmitir em segredo. A aprovação é exclusivamente um estado obtido da **resposta confiável da consulta do gateway/SIFEN**, jamais uma decisão tomada pelo NEXIT. O gateway externo transmite ao SIFEN; não pressupor integração direta com a DNIT.

**Autorizações concretas:** analisar, corrigir, completar código e testes da FAT-E2, versionar no Git e parar para nova auditoria. **Não autorizado:** conexões de envio reais, credenciais de produção em teste, alteração de VM/Docker/PostgreSQL real, aplicar migrations, deploy, aprovação artificial, atualização de XML/JSON fiscal sem prova, merge em main. Após revisão e decisão humana, o responsável executará as operações reais no único ambiente existente.

## 0. Protocolo, baseline e dependências

- Antes de trabalhar, ler os atuais `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-FACTURAS-V1.md`, `documentacao/v1/MATRIZ-FISCAL-FE-E1-2026-10-14.md` e **`documentacao/v1/EVIDENCIAS-FISCAIS-FE-13-XML-2026-10-14.md`**.
- Branch oficial de trabalho: `feature/NEXIT-2026-001-banco-demo`. Sincronizar com segurança e preservar modificações locais. **Não realizar merge em main.**
- Baseline FAT-E1 tecnicamente aceito estaticamente: commit `db80be1d03c627af85281a8f9d75441dcfea4def`; documentos complementares posteriores. P-11 (parcial) e P-12 (JSON proprietário versus XML SIFEN) ainda em aberto.
- Já existem `lib/facturacion/{gateway,envio,emision,estados,payload-fe,calculo}.ts`, endpoints, rotas e funções SQL `fe_documento_*`; **investigar e corrigir o existente, não refazer o serviço**. Referências vigentes no código do gateway: `POST /api/login`, `POST /api/recepcion_de`, `POST /api/consulta_de`. JSON de entrada e retornos proprietários são contrato do fornecedor, não XML SIFEN.
- **FAT-E3 (worker 2 min × 5)** e **FAT-E4 (UI/consulta automática)** não estão autorizadas nesta tarefa. Pode-se validar a consulta manual/serviço existente apenas na medida necessária para provar a transição de estado da FAT-E2; **não** criar agendador, worker, novos downloads, novos tipos DE ou redesenho.
- CI `nexit-banco-ci` falha antes da execução integral por NEX-019 em base limpa; causa confirmada nos logs das execuções `38579656906`, `38590834029` e `38590835356`. Manter pendência separada; **não editar migrations históricas**. Relatar honestamente o impacto na evidência de testes SQL.

## 1. Contrato de resultado — não confundir recepção com aprovação

Estados independentes e auditáveis:
1. **LOCAL** `PENDIENTE_ENVIO | ENVIANDO | ENVIO_INDETERMINADO | ENVIADO | ERROR_ENVIO`.
2. **SIFEN** `SIN_CONSULTA | PENDIENTE | APROBADO | RECHAZADO | CANCELADO | INUTILIZADO | NO_RECONOCIDO`.
3. **E-mail**, se existente, é eixo próprio e não participa da aprovação.

`/api/recepcion_de` com `status:success` + `nro_lote` válido (ou identidade documental coerente) significa **recebido pelo gateway**, ficando **ENVIADO / SIN_CONSULTA ou PENDIENTE**; **NUNCA** APROBADO. Um HTTP 200 sozinho nunca prova aprovação. `/api/consulta_de` pode confirmar APROBADO/RECHAZADO/PENDIENTE se houver identidade compatível, estado reconhecido, resposta semanticamente válida e aplicação segura no banco. Um XML assinado e um CDC isolado também não provam aprovação sem retorno oficial pertinente.

## 2. Regras de negócio FAT-E2

**RN-E2-01 Preflight:** só servidor; empresa/usuário da sessão autenticada, permissão `FACTURACION_ELECTRONICA.CREAR`, empresa/sucursal/punto autorizados, gateway ativo, URL validada, credenciais somente por referência ambiente, timeout bounded. Falta de configuração/credenciais rejeita antes de consumir numerador.

**RN-E2-02 Imutabilidade:** origem fiscal, itens, total, payload e numeração validados no servidor. Persistir e reenviar o MESMO payload de uma intenção já criada; jamais recalcular/reescrever DE numerado após rejeição sem política expressa. Não alterar cálculo NT 13, `dRedon`, P-11 nem P-12 nesta etapa por especulação.

**RN-E2-03 Autenticação:** login por empresa com cache isolado; renovar token vencido **uma vez**; 401/token inválido pode reautenticar; não expor token/segredo no JSON, SQL, log, erro, navegador ou teste. Não duplicar transmissão por loops de login.

**RN-E2-04 Emissão única:** idempotência por empresa + chave de operação e número fiscal; doble clic, retentativa e corrida simultânea não duplicam reserva de número, documento, lote ou POST. Usar guards existentes `fe_documento_iniciar_envio`/`registrar_envio`. Nova tentativa após queda/processo interrompido exige reconciliação, não resend cego.

**RN-E2-05 Recepção reconhecida:** extrair `nro_lote`, eco documental, CDC validado se fornecido, HTTP/status, validações. `status:success` sem lote/identidade, conflito CDC/estabelecimento/punto/número, retorno ilegível, lote excessivo ou HTTP 2xx inconclusivo → **ENVIO_INDETERMINADO**, nunca aprovado.

**RN-E2-06 Rejeição individual:** analisar `status:error` e `response.Rechazados` **somente para o documento cujo número coincide**. Registrar campo + motivo sanitizado. Erro de outro documento não é rejeição do nosso; ambiguidades permanecem indeterminadas. Rejeição de validação do gateway não deve se confundir automaticamente com estado SIFEN=RECHAZADO.

**RN-E2-07 Erros de transporte:** timeout, reset, erro de rede pós-transmissão, 5xx, HTTP 408/409/423/425, mensagem de duplicidade ou falha de gravação do resultado após transmitir → caminho conservador **ENVIO_INDETERMINADO**. Não retransmitir automaticamente. Distinguir erros de autenticação comprovadamente anteriores ao envio.

**RN-E2-08 Consulta posterior:** consultar status do mesmo DE via parâmetros fiscais persistidos; `NO_ENCONTRADO` não é RECHAZADO; resposta com CDC divergente ou identidade insuficiente não atualiza aprovação; aceitar APROBADO/RECHAZADO só com correspondência confiável (inclusive vínculo com documento local) e estado explícito reconhecido. Evitar regressões de estado final para transitório.

**RN-E2-09 Histórico e observabilidade:** gravar cada tentativa e fase de forma auditável: documento/empresa/usuário, timestamps, HTTP, status local, estado gateway/SIFEN, lote, CDC coerente, motivos de validação, erros técnicos sanitizados, origem e resultado da consulta. Nunca guardar credenciais, tokens ou corpo bruto inseguro. Respostas e divergências devem ficar inspecionáveis pelo responsável com suas permissões.

**RN-E2-10 Multiempresa, ACL e concorrência:** nenhuma empresa consulta/envia/consulta retorno de outra; nenhuma consulta por ID ignora filtro `empresa_id`/ACL; recursos com nonce/lock e operações DB são consistentes em concorrência. Não criar bypass técnico para automações nesta etapa.

**RN-E2-11 Código fiscal vs gateway:** as **13 saídas XML** validam cálculos/padrão XML, **não** o JSON de entrada nem respostas do provedor. Se houver erro de contrato comprovado por documentação do fornecedor ou fixture real sanitizada, registrar evidência e impacto antes de alterar chave fiscal. Nunca inferir equivalência direta JSON↔XML para `dTotalGs` (P-02), `dLiqTotIVA5/10` (P-12) ou valores opcionais (P-01); se imprescindível bloquear o avanço, apontar `BLOQUEIO_CONTRATO` precisamente.

**RN-E2-12 Compatibilidade de moeda e arredondamento:** a decisão comercial futura é PYG sem centavos, BRL/USD em regra com 2 casas (até 4 conforme campo); fiscal até 8. Nos XMLs com 47 itens integralmente tributados, arredondar metade para cima na oitava casa reproduz 47/47, truncar isoladamente não. Portanto, nesta FAT-E2 **não alterar `calculo.ts` por truncamento geral**, não desbloquear P-11 sem evidência e manter proteção atual. A mudança funcional de moedas não faz parte de FE V1 PYG.

## 3. Casos mínimos obrigatórios de regressão (sem rede externa)

| ID | Simulação / injeção | Aceite obrigatório |
|---|---|---|
| T-E2-01 | Credenciais ausentes, gateway inativo, empresa fora do alcance | Nenhuma transmissão, nenhuma numeração nova indevida |
| T-E2-02 | Login OK, `recepcion_de` success + lote válido | 1 POST, ENVIADO; SIFEN NÃO APROBADO |
| T-E2-03 | HTTP 200 sem lote, CDC ou eco | ENVIO_INDETERMINADO; sem envio repetido |
| T-E2-04 | HTTP 200 com CDC/eco de outro documento | Bloqueio de falso aceite, evidência divergente |
| T-E2-05 | `status:error`, `Rechazados` identificando só o nosso DE | ERROR_ENVIO/RECHAZO, erro por campo; não declarar RECHAZADO SIFEN |
| T-E2-06 | Rechazados só de outros números; mistura Aceitos/Rechazados | Indeterminado/isolamento correto |
| T-E2-07 | 401, token inválido em HTTP 400, 401 repetido | Renovação uma vez; sem loop e sem segredos |
| T-E2-08 | 429, 408, 409 duplicado, 5xx, timeout, falha de rede | Estados conservadores; nenhum reenvio cego |
| T-E2-09 | Concorrência, dois cliques, retry da mesma chave, crash entre POST e persistência | 1 documento/numero, no máximo uma transmissão sem reconciliação |
| T-E2-10 | Consulta success `Estado: Pendiente` → `Aprobado` com identidade coerente | Persistência PENDIENTE → APROBADO apenas após consulta válida |
| T-E2-11 | Consulta `Rechazado` com `CodRespuesta`/mensagem | RECHAZADO fiscal com histórico, sem mexer no payload original |
| T-E2-12 | Consulta 400 `Documento no encontrado`, CDC divergente, campo `Estado` desconhecido, 2xx sem identidade | Nunca aprovação falsa; guardar resposta/estado adequado |
| T-E2-13 | Duas empresas, usuários sem permissão, documento fora do alcance | Nenhuma leitura/gravação/transmissão cruzada |
| T-E2-14 | Regressão FAT-E1 + 13 vetores sanitizados, ref. 107.300/9.754,54545454 e parcial com resíduo | Nenhuma mudança de cálculo nem desbloqueio artificial |
| T-E2-15 | Respostas maliciosas: token, password, headers, objetos gigantes, mensagens de terceiros | Sanear e limitar persistência, logs e erros UI |

Os testes devem usar interfaces injetáveis de HTTP/tempo/banco já existentes. Documentar quais casos são testes puros, quais exigiriam PostgreSQL descartável (indisponível/CI falhando) e quais dependem de operação humana. Não chamar testes simulados de homologação. Executar `tsc`, lint, build e a bateria local pertinente, reportando N exato de verificações.

## 4. Critérios objetivos de aceite

- **CA-E2-01:** o botão «Enviar factura» emite uma única solicitação autenticada ao gateway com payload fiscal imutável e válido, apenas quando a operação é suportada.
- **CA-E2-02:** o retorno da recepção não mostra «Aprobado»; mantém ENVIADO e estado fiscal separado.
- **CA-E2-03:** consulta fiscal válida atualiza PENDIENTE/APROBADO/RECHAZADO com CDC/identidade coerente, histórico e sem aprovações falsas.
- **CA-E2-04:** falhas, duplicações, timeout, rejeições e estados indeterminados nunca perdem rastreabilidade nem reenviam às cegas.
- **CA-E2-05:** ACL por sessão, escopo de empresa e segurança de credenciais válidos em todas as rotas/serviços/SQL relacionados.
- **CA-E2-06:** regressões de E1 e 13 exemplos fiscais permanecem estáveis; não introduzir ajuste/truncamento fiscal não comprovado.
- **CA-E2-07:** nenhum tipo além FE PYG/Contado/Efectivo, nenhuma migration aplicada, nenhum worker, nenhuma transmissão real, nenhum deploy.
- **CA-E2-08:** commit/push no GitHub, relatório conciso com SHA/testes/limitações; **parar para auditoria**. Somente depois de auditoria estática e decisão humana é permitido planejar um envio real controlado e consulta de confirmação.

## 5. Entregáveis e sequência de execução do Claude

1. Inspecionar endpoints, gateway, envio, consultas, estados, UI já existente e SQL relevante (`NEX-047…051` e incrementais posteriores): produzir identificação pontual das lacunas concretas da FAT-E2. Evitar refatoração ou documentação redundante.
2. Corrigir/aprimorar **somente** as lacunas comprovadas, incluindo SQL incremental novo **apenas se indispensável**; jamais editar migration já aplicada nem executar SQL.
3. Incluir/atualizar regressões mapeadas T-E2-01..15, manter FAT-E1 inalterada; se algum caso depender de contrato externo ainda não demonstrado, bloquear especificamente o cenário e registrar pendência.
4. Executar testes locais, TypeScript, ESLint e build; constatar/relatar separadamente CI NEX-019. Atualizar apenas o progresso existente e a documentação desta etapa quando necessário.
5. Fazer commit/push na branch oficial e **PARAR**. Enviar ao responsável apenas estado, número de verificações, falhas/bloqueios e SHA completo; ChatGPT audita. Não alegar transmissão real nem aprovação SIFEN.

## 6. Critério para operação real, posterior e humana

Após auditoria E2: o responsável decide se libera uma **única fatura de teste controlada** no único ambiente real e confirma as credenciais e o gateway correto. Antes disso, verificar backups/persistência SQL atual, estado de migrations, configuração/credenciais, riscos P-02/P-12 e identidade de receptor; então observar recepção real, consulta e resposta fiscal sem retry cego. Não existe staging nem homologação paralela. Aprovação só quando a consulta registrar APROBADO do documento correto; SIFEN pode rejeitar, e não há garantia de aprovação.

**Nota:** a falha CI NEX-019 é separada da FAT-E2; deve ser resolvida como tarefa específica sem adulterar os checksums de migrations reais. O alcance de FAT-E3 e FAT-E4 continua reservado para autorização posterior.
