# REQ-DOC-KUDE-PDF-GATEWAY — KuDE/PDF de Factura Electrónica desde Documentos electrónicos

> **DECISÃO FINAL DO RESPONSÁVEL, 27/10/2026 — PREVALECE SOBRE TODAS AS EXIGÊNCIAS ANTIGAS DE CDC PARA KUDE NESTE ARQUIVO:** o KuDE de FE/NCE se solicita por tipo do documento, estabelecimento, ponto de expedição, número e série que estão gravados no registro do NEXIT. O documento pode ser **RECHAZADO**, PENDIENTE ou APROBADO, com ou sem CDC gravado; se o gateway entrega **PDF válido**, apresentar. O campo **CDC da resposta do gateway NÃO é obrigatório e NÃO deve ser comparado** com CDC gravado, RUC/DV da empresa, número como parte do CDC, nem emissores de outras FEs APROBADO para decidir se o PDF será exibido. Preservar autenticação e escopo da empresa/sucursal, corpo POST FE (5 campos) e NCE (6 campos com `ncr`), verificação de PDF, no-store e segregação. **Norma vigente:** [REQ-NEXIT-PRO-326-KUDE-POR-DOCUMENTO-SEM-CDC-2026-10-27.md](REQ-NEXIT-PRO-326-KUDE-POR-DOCUMENTO-SEM-CDC-2026-10-27.md). **Ordem única atual:** `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-326-KUDE-POR-NUMERO-SEM-CDC-2026-10-27.md`. Toda regra abaixo exigindo CDC coincidente é HISTÓRICA E REVOGADA APENAS PARA A EXIBIÇÃO DE KUDE; a emissão/consulta SIFEN não é alterada.

> **ACTUALIZACIÓN VINCULANTE 21/10/2026 — POSTMAN NCR (REVISA LA DECISIÓN DEL 20/10):** El responsable confirmó mediante captura real **HTTP 200 OK** del endpoint `POST https://gateway.e-factura-hub.com/api/kude` para la NCE 001-003-0090004 con **SEIS** claves: `tipOpe:"4"`, `dEst:"001"`, `dPunExp:"003"`, `dNumDoc:"0090004"`, `dSerieNum:null` y **`tipoDoc:"ncr"` en minúsculas**. El JSON de respuesta contiene `status:"success"`, `CDC` y `kude` Base64. Este contrato **sustituye exclusivamente para NCE/NCR** al anterior `tipoDoc:"NCE"` sin `tipOpe`. **FE conserva el contrato anterior de cinco campos `tipoDoc:"FE"` sin `tipOpe`**; no cambiar su emisión/consulta/KuDE por analogía. El host mostrado en la captura no autoriza cambiar la URL configurada por empresa: confirmar la discrepancia con la configuración actual antes de alterar endpoints. No escribir el CDC real, tokens ni Base64 en Git; el PDF 200 no acredita aprobación SIFEN.


> **REVISÃO DEFINITIVA 21/10/2026:** para KuDE **FE e NCE** o gateway é a fonte da disponibilidade; não exigir `APROBADA` nem CDC local na tentativa. Se entregar PDF válido do documento, exibir independentemente do estado. O histórico de demonstração apenas com FE aprovada abaixo não define mais elegibilidade. Cancelamento e estorno de estoque foram adiados em especificação separada, sem API.

> **HISTÓRICO SUPERADO PARCIALMENTE — 20/10/2026 (FE segue vigente; NCE substituída pela atualização Postman 21/10):** contrato de REQUISIÇÃO FE e NCE tem **cinco campos**, sem `tipOpe`. A evidência anterior com `tipOpe:"4"` ficou **SUPERADA**. Para KuDE de FE enviar `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc:"FE"`; para KuDE de NCE, o mesmo com `tipoDoc:"NCE"`. Não inferir, calcular, validar ou enviar `tipOpe`. Essa correção se aplica ao código, testes e à issue PRO-194. Ver `REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md`.


**Data:** 20/10/2026 · **Prioridade:** P0, demonstração próxima.  
**Origem:** evidência fornecida pelo responsável — captura Postman de POST `https://gateway-bebidas-py.e-factura-hub.com/api/kude`.  
**Status atualizado 20/10/2026:** **REQUISIÇÃO FE e estrutura JSON de SUCESSO observadas no Postman** — HTTP **200 OK**, resposta JSON com `status:"success"`, `CDC` e `kude` (string Base64 de PDF, prefixo visível `JVBER...`, compatível com `%PDF-`). Ainda **NÃO** são confirmados header Content-Type exato, aceitação do mesmo Bearer e operação integrada no NEXIT; o parâmetro `tipOpe` foi explicitamente retirado pelo responsável. Evidência visual apresentada pelo responsável; não publicar CDC completo nem Base64 real.  
**Menu alvo:** `Facturación → Documentos electrónicos`, `/documentos`.  
**Tarefa Linear:** a ser vinculada à issue P0, filha de PRO-91.  
**Governança:** Claude desenvolve somente sob ordem do responsável; ChatGPT audita commit; responsável executa VM, build, deploy, credenciais, prova real e homologação. Sistema desktop.

## 1. Evidência concreta (Postman)

**Método:** `POST`.  
**Endpoint apresentado pelo responsável:** `https://gateway-bebidas-py.e-factura-hub.com/api/kude`.  
**Body JSON do caso FE exibido na captura:**

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "FE"
}
```

**Exemplo HISTÓRICO OBSOLETO para NCE — não utilizar; válido só antes da correção Postman de 21/10:**

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "NCE"
}
```

**Para NCE/NCR atual, usar seis campos, com `tipOpe:"4"` e `tipoDoc:"ncr"`, não o JSON histórico acima.** `dEst` e `dPunExp` têm 3 caracteres; `dNumDoc` tem 7 caracteres, **preservar zeros à esquerda e o tipo string**; `dSerieNum` é null se a série persistida for nula. Contrato **confirmado pelo responsável**: `tipoDoc` é `"FE"` ou `"NCE"` e **NÃO existe campo `tipOpe`** na requisição de KuDE. Não introduzir parâmetros extras.

A aba de autorização aparece configurada no Postman, mas **os headers e o token estão ocultos**. O **FORMATO do response foi agora observado como JSON** com campo `kude` Base64; header HTTP `Content-Type` exato não foi mostrado. O gateway NEXIT já autentica por empresa via `/api/login` e Bearer para `/api/consulta_de` e `/api/recepcion_de`; o novo endpoint deverá aproveitar a configuração existente e o mesmo isolamento de credenciais/token, **após confirmar que aceita esse Bearer**, sem credencial fixa/código no browser. Não inventar respostas do fornecedor.

**Evidência adicional recebida:** aba **Response → Body → JSON** com HTTP **200 OK**, campos `{ "status":"success", "CDC":"...", "kude":"JVBER..." }`. Isso comprova o *schema de sucesso apresentado* (Base64); não comprova todos os erros da API nem a configuração de autenticação. **Pendentes**: confirmação de Bearer `/api/login` no `/api/kude`, header Content-Type real se necessário para adaptar o parser. Nunca registrar tokens, RUC/password privados, CDC real completo nem Base64 de PDF de cliente no Git.

## 2. Escopo P0 estrito

O menu `/documentos` atualmente mostra texto `PDF/KuDE y XML: descarga no disponible (endpoint del proveedor sin confirmar)` em `app/(private)/documentos/page.tsx:417`. Agora há evidência de ENDPOINT de KuDE FE, **não há confirmação do resultado**. Implementar caminho isolado para **visualizar/baixar KuDE em PDF de FE existente**, quando elegível e quando o fornecedor efetivamente entregar PDF válido. Conservar XML como não disponível e não prometer cobertura NDE, NRE ou AFE sem requisição/resposta real. A extensão NCE foi autorizada posteriormente com request confirmado pelo responsável; o PDF real ainda exige teste no gateway. Outras melhorias da auditoria DOC-D01…DOC-D08 ficam fora deste escopo. Não mexer na criação/emissão FE/NCE, em contagem/estados fiscais, numeração, CDC, estoque, grants ou migrations.

Fluxo alvo:
1. Operador acessa `Documentos electrónicos` e abre detalhe de FE **ou NCE da empresa e sucursal autorizadas**, qualquer que seja o estado fiscal. **Não exigir APROBADO nem CDC pré-persistido** para tentar o KuDE; se a API devolver PDF válido do documento, mostrar.
2. O frontend apresenta **`Ver KuDE (PDF)`** para FE/NCE acessíveis com identidade fiscal suficiente para formular o pedido, sem bloquear por `estadoSifen` ou CDC local. Durante carregamento exibe progresso/erro (espanhol PY), bloqueia múltiplos cliques e não exibe PDF de outro registro. Se a API não devolver PDF válido, mostrar indisponibilidade.
3. A chamada é ao **backend autenticado NEXIT por ID imutável do documento** (sugerida `GET /api/documentos/[id]/kude`), sem enviar empresa, número, URL arbitrária ou chave de gateway pelo browser. A API recupera a FE ou NCE **usando empresa e usuário da sessão + alcance de sucursal + FACTURACION_ELECTRONICA.VER**, aproveitando as funções `prepararFacturacion('VER')` e `obtenerDocumento`/leitura existente, validando tipo FE/NCE e os identificadores fiscais necessários, **sem veto por estado de aprovação ou falta de CDC local**. Negar acesso cruzado, ID inválido, usuário sem permissão, documento fora do escopo e tipo não suportado. Erros neutros 401/403/404/409/502/503 coerentes; sem revelar dados de outro tenant.
4. Formar POST para `{config.baseUrl}/api/kude` em **backend server-only**, com `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum` do **documento imutável no PostgreSQL**. `tipoDoc='FE'` para factura ou `tipoDoc='NCE'` para nota de crédito, **sem `tipOpe`**. Essa correção foi confirmada posteriormente pelo responsável e substitui o exemplo inicial com `tipOpe`. Usar config e autenticação da empresa (modo `NEXIT_DB` não cai para variáveis globais; tokens isolados). Timeout, uma renovação de token apenas em 401 comprovado, sem registrar segredos.
5. **FORMATO DE SUCESSO AGORA CONFIRMADO:** HTTP 200, objeto JSON com `status:"success"`, `CDC` e `kude` como Base64. No **servidor**, ler o corpo JSON limitado em bytes, rejeitar falha/JSON malformado, exigir `status === "success"`, quando houver CDC persistido exigir que o CDC retornado coincida, **mas não bloquear a chamada ou o PDF válido apenas porque a FE/NCE não possui CDC local**; verificar correspondência segura com os identificadores do documento solicitado, e `kude` string Base64 canônica válida, não vazia. Decodificar com `Buffer.from(valor,"base64")` **somente após validação de alfabeto/padding/limite**; verificar assinatura `%PDF-`, terminador `%%EOF` tolerando whitespace final, tamanho máximo (até 10 MiB de PDF conforme limite atual) e nenhum dado HTML/JSON/texto disfarçado de PDF. Se erro ou CDC divergente, devolver 502 controlado, sem bytes nem conteúdo sensível. Não armazenar arquivo, Base64 ou CDC em logs; não salvar resposta no banco. Se fornecedor eventualmente responder PDF binário, tratar como caminho alternativo permitido **somente se seguro**, mas nunca rejeitar o JSON/Base64 já comprovado. Não seguir URLs arbitrárias (SSRF).
6. Devolver o **PDF binário decodificado** ao navegador via API interna com `Content-Type: application/pdf`, `Content-Disposition: inline` ou `attachment`, nome derivado **exclusivamente da identidade fiscal saneada** (por exemplo `KuDE-FE-001-001-0010004.pdf`), `Cache-Control: private, no-store`, `Pragma: no-cache` e `X-Content-Type-Options: nosniff`. **Proibido persistir PDF, Base64 ou Blob no banco, disco, localStorage, Cache API ou logs**. Não expor baseURL/token no frontend, não criar link externo direto ao gateway.
7. Caso não exista prova do formato de resposta antes do prazo, entregar backend/UI em modo **seguro e não operacional**, documentando a evidência faltante; não inventar sucesso nem entregar um PDF inválido.

## 3. Arquivos/código a examinar antes de editar

- `app/(private)/documentos/page.tsx` e CSS local (somente para botão e estados).
- `app/api/documentos/[id]/route.ts`, `/consultar/route.ts`, `app/api/documentos/route.ts`.
- `lib/facturacion/shared.ts`, `servidor.ts`, `gateway.ts`, `gateway-credenciales.ts`, `gateway-estado.ts`.
- `documentacao/banco/nexit/v1/migraciones/NEX-047-...sql` e `NEX-048-...sql`: `documentos_electronicos` guarda empresa, sucursal, tipo, estabelecimento/ponto/número/serie, CDC, estados; `documento_electronico_solicitudes.payload` é snapshot fiscal imutável. Só **ler** essas migrations, já aplicadas conforme histórico, nunca modificá-las.
- `documentacao/testes/AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01-2026-10-18.md` GAP-01; `documentacao/v1/auditoria-por-menu/AUD-DOCUMENTOS-ELECTRONICOS-V1.md`.

## 4. Aceite dirigido, testes e segurança

**Provar com testes direcionados**, por mock de gateway e handlers reais quando possível:
- FE/NCE autorizada de **qualquer estado** (inclusive pendente/rejeitada), identidade `001/001/0010004`, série null, POST `/api/kude` correto **sem perder zeros**, token da empresa correta, resposta PDF mock válida do documento → 200 PDF + headers corretos + bytes intactos + nome seguro; **sem CDC local** não impede tentativa.
- Exigir **ausência total do campo `tipOpe`** na requisição. Validar exatamente os cinco campos, para FE e NCE; `tipoDoc` é o único discriminador.
- Outra empresa, sucursal sem alcance, VER ausente, sessão expirada, documento inexistente, tipo diferente de FE, status inelegível, credenciais ausentes -> sem chamada externa e sem vazamento.
- Gateway 401/403, timeout, 404, 500, PDF inválido, content-type inesperado, JSON sem schema confirmado, PDF excessivo, token renovado uma vez -> erro controlado, nunca download falso.
- Dois documentos abertos na UI, múltiplos cliques, erro/retry, fechamento da visualização; nenhum KuDE trocado entre IDs.
- Nenhuma mutação de estados SIFEN, envio, número, saldos, lote, idempotência ou estoque; XML permanece explícito como não disponível.
- Regressões só de Documentos / autenticação gateway, lint/tsc **pontuais** (sem suíte/build global/CI, sem PostgreSQL real, VM ou navegador por Claude).
- Separar 'contrato demonstrado por Postman' de 'teste de mock' e 'validação real pelo responsável'. Não marcar homologado.

## 5. Entrega e parada

Claude pode implementar somente **esta funcionalidade P0 autorizada**, mantendo branch oficial `feature/NEXIT-2026-001-banco-demo`, editando arquivos mínimos, testes dirigidos e documentação. Relatar quais pontos impedem habilitar PDF real por falta de resposta do fornecedor, com exemplo de retorno necessário; não solicitar nem registrar tokens/senhas. Commit/push SHA completo, atualizar progresso e Linear em In Review, parar para **AUD-DOC-KUDE-R01 independente pelo ChatGPT**. **Nenhuma IA executa DB/VM/Docker/deploy; só o responsável.**

## 6. Emenda vinculante — visualizador MODAL e consulta sempre nova (20/10/2026)

**Decisão do responsável:** cada abertura de KuDE consulta novamente `POST /api/kude` via backend autenticado. **Não existe limite de quantidade de aberturas imposto pelo NEXIT**. Respeitar timeout, falhas HTTP e limites de tamanho/conexões simultâneas por segurança, mas **não implementar contador, cota diária, número máximo por operador, cache de PDF ou reuso de resposta antiga**. Mesmo documento FE aberto duas vezes sucessivamente => **duas chamadas distintas** ao gateway. Nova tentativa após erro => nova chamada. O ato de baixar também deve requisitar a versão corrente, salvo decisão humana posterior.

### Modal desktop — comportamento obrigatório

- Substituir a estratégia atual de `window.open`/nova aba: abrir **modal grande centralizada, dentro do NEXIT**, com backdrop, cabeçalho `KuDE · Factura 001-001-0010004`, nome do receptor/sucursal se autorizado, e indicador de carregamento enquanto o fetch está pendente. O PDF aparece num visualizador incorporado `iframe/object` com URL Blob temporária **criada somente a partir dos bytes PDF autenticados** recebidos da API interna (nunca iframe com URL da API externa). Fornecer mensagens `No fue posible cargar el KuDE`, `Reintentar`, `Cerrar`, `Descargar PDF` e `Imprimir` apenas quando visualização válida e com interação funcional. O fechamento pode ser por botão/Escape; acessibilidade `role=dialog`, `aria-modal`, foco inicial/retorno/focus trap.
- **Um único documento por modal:** a abertura de FE B enquanto A ainda carrega deve cancelar/invalidar o contexto de A; retorno tardio de A não pode substituir B nem abrir blob obsoleto. Ao fechar/desmontar, abortar requisição, remover iframe, `URL.revokeObjectURL`, apagar bytes do estado e restaurar foco. Blobs são transitórios apenas na memória, nunca persistidos.
- **Toda reabertura** (inclusive após fechar A e abrir A) faz `fetch('/api/documentos/[id]/kude', {cache:'no-store'})` **NOVO**, que sempre chama `POST /api/kude` sem cache no servidor. Usar `Cache-Control: no-store` de ponta a ponta. Não guardar arquivo no DB e não reutilizar versão anterior. Se precisar imprimir, usar Blob da sessão visualizada com ação do operador, sem gravar e sem envio fiscal.
- **Download:** botão no modal pode disparar download a partir de **nova chamada** ou fluxo servidor `?descargar=1`, sem persistência. Nome seguro. Não exibir botão que baixe um JSON como PDF.
- **CDC e identidade:** se o documento FE/NCE possuir CDC local, validar correspondência com CDC retornado. **Se não houver CDC local, não bloquear automaticamente:** validar a associação segura do retorno aos identificadores fiscais solicitados e a integridade PDF. Divergência inequívoca => 502 neutro. Nunca exibir KuDE de outro documento.
- **Prova de sucesso mínima:** mock JSON como `{status:'success',CDC:cdcPersistido,kude:pdf.toString('base64')}` => PDF bytes válidos na API interna e na modal; repetir abertura gera 2 POST distintos; mudança FE A→B, fechamento em voo, modal erro/retentativa, sem cache/persistência. Usar teste comportamental do controlador/hook REAL extraído da UI; não aprovar apenas regex de markup. Sem browser real, declarar limite.

### Revisão do código Claude já publicado

O código inicial da PRO-194, no início desta emenda, possuía `gateway.ts` esperando unicamente `application/pdf` **binário** e `page.tsx` usando `window.open` (nova aba) e `URL.revokeObjectURL` após 60s. **Esses comportamentos NÃO cumprem a evidência nova nem a decisão da modal**, e devem ser substituídos. Não considerar os 40 testes iniciais como prova do novo contrato.

**ATUALIZAÇÃO VINCULANTE 21/10/2026:** **RETIRADA a condição FE/NCE `APROBADA + CDC local`**. Para ambos os tipos, a ação de KuDE permite consultar o gateway mesmo pendente/rejeitado ou sem CDC persistido; **se o serviço retornar PDF válido e vinculado ao documento, visualizar, imprimir e baixar**. Mantêm-se autorização multiempresa+VER+sucursal, validação de identidade, segurança PDF e rejeição de divergências CDC quando conhecido. **Retira-se `tipOpe`** e usam-se cinco campos, com `tipoDoc` FE/NCE. XML e redesign seguem fora de escopo.
