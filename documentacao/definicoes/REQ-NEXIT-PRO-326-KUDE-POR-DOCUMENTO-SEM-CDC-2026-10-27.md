# PRO-326 / CASA MINGO — KuDE por documento selecionado, SEM exigência de CDC
**Data:** 27/10/2026 · **Decisão EXPRESSA do responsável**, posterior à análise anterior que exigia conferência CDC↔RUC. Esta especificação **prevalece** sobre a análise e ordem antigas em arquivos com «EMISOR-RUC» ou «EMISOR-CANONICO».
**Área:** Facturación → Documentos electrónicos → Ver KuDE (PDF) · **Prioridade:** P0 funcional para V1.

## 1. Regra de negócio definitivamente estabelecida
O usuário escolhe o documento na listagem do NEXIT. **A identificação fiscal selecionada — tipo do documento + estabelecimento + ponto de expedição + número + série — é o critério para solicitar seu KuDE ao gateway.** O documento pode estar APROBADO, RECHAZADO, PENDIENTE, ENVIADO, SIN_CONSULTA ou outro estado fiscal: **nenhum estado SIFEN e nenhum CDC local é pré-requisito para VISUALIZAR KuDE**. Estado de transmissão/retorno do gateway é separado do estado fiscal SIFEN.

**O CDC, mesmo quando o gateway devolve um CDC, NÃO é critério de autorização/seleção/validação para apresentar o KuDE solicitado.** Ele é metadado fiscal independente; se presente na resposta, não comparar com CDC do PostgreSQL, com outros CDCs, com RUC/DV do emissor nem com o número do documento como condição do PDF. Não gravar CDC de KuDE no PostgreSQL nem modificar estado fiscal ao visualizar.
- FE: body de cinco campos confirmados: `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc:"FE"`. Sem `tipOpe`.
- NCE: corpo confirmado de seis campos: `tipOpe:"4"`, `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum`, `tipoDoc:"ncr"` (minúsculas). A interface permanece NCE.
- Identificadores são strings persistidas pelo NEXIT; preservar zeros iniciais e `dSerieNum:null` quando aplicável. Não enviar ID de outra empresa/URL/credencial desde browser.
- Se o gateway autenticado da empresa retorna resposta de sucesso do contrato e campo `kude` contendo PDF Base64 íntegro e válido, mostrar PDF na modal e permitir baixar/imprimir. Rejeição fiscal da FE/NCE NÃO torna o PDF indisponível. Se gateway realmente não devolve KuDE, mostrar erro coerente, sem criar PDF artificial.

## 2. O que se elimina do código atual
**Falha A — `lib/facturacion/shared.ts::obtenerKude()`:** após `obtenerKudeGateway`, se documento não tem CDC, o código atual lê `SELECT DISTINCT substr(cdc,3,9) FROM documentos_electronicos ... APROBADO ... LIMIT 10` e compara `r.cdc.slice(2,11)`. Esse veto causa exatamente a mensagem das capturas 27/10 e **NÃO faz parte do contrato KuDE**. Remover esse bloco integralmente; não substituir por validação de RUC/DV contra CDC, nem introduzir outra comparação de emissor para o visor.
**Falha B — `lib/facturacion/gateway.ts::interpretarKude()`:** exige que JSON tenha CDC com 44 dígitos, que seja `cdcCoherente` em relação a tipo/est/ponto/número, e igualdade com `doc.cdc` quando persistido; caso contrário recusa PDF. **KuDE é requisitado pelo número, não pelo CDC**. Retirar esse veto **somente do caminho KuDE**. CDC pode continuar em outros fluxos fiscais (envio/consulta/persistência); **não modificar `cdcCoherente` de emissão/consulta nem contratos SIFEN**. No caminho `ResultadoKude` avaliar se é necessário remover CDC da resposta interna para deixar claro que não se usa como autorização (ajustar tipos/consumidores focalmente).
**Falha C — testes `lib/facturacion/kude.casos.ts`:** cenários antigos que exigem CDC, rejeitam CDC divergente, confiam em outros emissores ou se apoiam no histórico APROBADO estão superados na operação KuDE. Atualizar cenários para basear sucesso em documento correto solicitado + resposta válida com PDF, inclusive sem CDC/CDC diferente e FE RECHAZADA, mantendo asserts de segregação sessão/empresa/sucursal e segurança do parser.

## 3. Segurança que CONTINUA obrigatória
- GET interno `/api/documentos/[id]/kude` verifica sessão, `FACTURACION_ELECTRONICA.VER` e `sucursal_en_alcance`, buscando documento por `empresa_id` e id imutável. Usuário não fornece outra identidade fiscal, base URL, token nem RUC.
- Configuração, autenticação `/api/login` e token isolados por empresa, HTTPS/SSRF como já implementados. O gateway é a fonte do PDF para a requisição fiscal efetuada com credenciais da empresa. **É uma decisão explícita de confiar na resposta do serviço autorizado após os controles de acesso, e não comparar CDC como veto.** Eventual conteúdo incorreto devolvido pelo gateway é uma anomalia externa e precisa diagnóstico próprio; não reconstruir documento nem exibir PDF de outro ID em corrida de requisições do frontend.
- Limites de tamanho, JSON de sucesso, Base64 estrito, assinatura `%PDF-`, trailer `%%EOF`, proteção contra HTML/script, `Cache-Control: private,no-store`, `X-Content-Type-Options: nosniff`, download como nova consulta, iframe e revogação de Blob permanecem.
- Não gravar PDFs, Base64, CDC da resposta, dados privados nem tokens em banco/log/disco/localStorage. Não atualizar o estado do documento ao visualizar.
- Sem alterações em NEX migrations, reservas, FE/NCE emitidas, timbrado, estoque, reprocessamentos ou provider. O KuDE com estado RECHAZADO pode ser visualizado **se o gateway retornar o PDF**; não implica SIFEN aprovada nem autoriza envio/correção.

## 4. Cenários de aceitação obrigatórios — somente prova estática até autorização
1. FE 001-003-0009011, status RECHAZADO, `doc.cdc=NULL`, POST FE por documento -> HTTP200 `status:'success'`, `kude` PDF íntegro, CDC ausente -> **mostrar PDF**.
2. A mesma FE com CDC da resposta divergente do cadastro/outro histórico -> **mostrar PDF válido**, pois CDC não é critério de KuDE.
3. FE APROBADA com CDC persistido diferente do campo CDC retornado, mas PDF válido solicitado pelo número -> **mostrar PDF** (não alterar CDC persistido nem aprovar documento).
4. NCE RECHAZADA com payload `tipoDoc:'ncr',tipOpe:'4'`, PDF válido -> mostrar.
5. Documento não existe na empresa do usuário, sem permissão VER ou sucursal não autorizada -> negar antes de chamar gateway; nenhum PDF cruzado por troca de modal/resposta tardia.
6. Resposta sem `kude`, `status:'error'`, HTTP não sucesso, Base64/PDF inválidos, tamanho excessivo, timeout/401-2ª falha -> erro seguro e sem PDF.
7. Nova abertura/baixar = nova chamada, sem guardar PDF; FE e NCE com os respectivos payloads sem mudanças.
8. Nenhum SELECT de histórico APROBADO para comparar CDC e nenhum SELECT de `empresas.ruc/dv` para vetar KuDE.

## 5. Evidência e governança
Capturas do responsável: no portal do fornecedor PDF FE `001-003-0009011` está visível; no NEXIT, mesmo documento gera veto por «emisor distinto». Esse veto está localizado no código e não foi produzido pelo provedor. **Não inferir resposta de rede ou conteúdo de CDC real** sem evidência.
Claude faz correção focal de código e casos sem executar testes/build/SQL/VM/deploy (padrão atual de autorização), commit/push e PARA para auditoria ChatGPT. A análise/ordem antigas de «comparar CDC com RUC canônico» estão expressamente REVOGADAS pelo responsável.
