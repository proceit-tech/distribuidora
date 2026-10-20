# REQ-DOC-KUDE-PDF-GATEWAY — KuDE/PDF de Factura Electrónica desde Documentos electrónicos

> **CORREÇÃO VINCULANTE DO RESPONSÁVEL — 20/10/2026:** contrato definitivo de REQUISIÇÃO FE e NCE tem **cinco campos**, sem `tipOpe`. A evidência anterior com `tipOpe:"4"` ficou **SUPERADA**. Para KuDE de FE enviar `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc:"FE"`; para KuDE de NCE, o mesmo com `tipoDoc:"NCE"`. Não inferir, calcular, validar ou enviar `tipOpe`. Essa correção se aplica ao código, testes e à issue PRO-194. Ver `REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md`.


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

**Mesmo contrato para NCE — só varia `tipoDoc`:**

```json
{
  "dEst": "001",
  "dPunExp": "003",
  "dNumDoc": "0009001",
  "dSerieNum": null,
  "tipoDoc": "NCE"
}
```

`dEst` e `dPunExp` têm 3 caracteres; `dNumDoc` tem 7 caracteres, **preservar zeros à esquerda e o tipo string**; `dSerieNum` é null se a série persistida for nula. Contrato **confirmado pelo responsável**: `tipoDoc` é `"FE"` ou `"NCE"` e **NÃO existe campo `tipOpe`** na requisição de KuDE. Não introduzir parâmetros extras.

A aba de autorização aparece configurada no Postman, mas **os headers e o token estão ocultos**. O **FORMATO do response foi agora observado como JSON** com campo `kude` Base64; header HTTP `Content-Type` exato não foi mostrado. O gateway NEXIT já autentica por empresa via `/api/login` e Bearer para `/api/consulta_de` e `/api/recepcion_de`; o novo endpoint deverá aproveitar a configuração existente e o mesmo isolamento de credenciais/token, **após confirmar que aceita esse Bearer**, sem credencial fixa/código no browser. Não inventar respostas do fornecedor.

**Evidência adicional recebida:** aba **Response → Body → JSON** com HTTP **200 OK**, campos `{ "status":"success", "CDC":"...", "kude":"JVBER..." }`. Isso comprova o *schema de sucesso apresentado* (Base64); não comprova todos os erros da API nem a configuração de autenticação. **Pendentes**: confirmação de Bearer `/api/login` no `/api/kude`, header Content-Type real se necessário para adaptar o parser. Nunca registrar tokens, RUC/password privados, CDC real completo nem Base64 de PDF de cliente no Git.

## 2. Escopo P0 estrito

O menu `/documentos` atualmente mostra texto `PDF/KuDE y XML: descarga no disponible (endpoint del proveedor sin confirmar)` em `app/(private)/documentos/page.tsx:417`. Agora há evidência de ENDPOINT de KuDE FE, **não há confirmação do resultado**. Implementar caminho isolado para **visualizar/baixar KuDE em PDF de FE existente**, quando elegível e quando o fornecedor efetivamente entregar PDF válido. Conservar XML como não disponível e não prometer cobertura NDE, NRE ou AFE sem requisição/resposta real. A extensão NCE foi autorizada posteriormente com request confirmado pelo responsável; o PDF real ainda exige teste no gateway. Outras melhorias da auditoria DOC-D01…DOC-D08 ficam fora deste escopo. Não mexer na criação/emissão FE/NCE, em contagem/estados fiscais, numeração, CDC, estoque, grants ou migrations.

Fluxo alvo:
1. Operador acessa `Documentos electrónicos` e abre detalhe de uma FE **da empresa e sucursal autorizadas**, preferencialmente `estadoSifen=APROBADO` com CDC coerente para demonstração.
2. O frontend apresenta **`Ver KuDE (PDF)`** e/ou **`Descargar KuDE`** só quando o contrato estiver tecnicamente viável e a FE elegível. Durante carregamento exibe progress/erro (espanhol PY), bloqueia múltiplos cliques, não exibe PDF de outro registro.
3. A chamada é ao **backend autenticado NEXIT por ID imutável do documento** (sugerida `GET /api/documentos/[id]/kude`), sem enviar empresa, número, URL arbitrária ou chave de gateway pelo browser. A API recupera a FE **usando empresa e usuário da sessão + alcance de sucursal + FACTURACION_ELECTRONICA.VER**, aproveitando as funções `prepararFacturacion('VER')` e `obtenerDocumento`/leitura existente, e valida `tipo='FE'`, elegibilidade de estado e identidade fiscal armazenada. Negar acesso cruzado, ID inválido, usuário sem permissão, documento fora do escopo e tipo não suportado. Erros neutros 401/403/404/409/502/503 coerentes; sem revelar dados de outro tenant.
4. Formar POST para `{config.baseUrl}/api/kude` em **backend server-only**, com `dEst`, `dPunExp`, `dNumDoc`, `dSerieNum` do **documento imutável no PostgreSQL**. `tipoDoc='FE'` para factura ou `tipoDoc='NCE'` para nota de crédito, **sem `tipOpe`**. Essa correção foi confirmada posteriormente pelo responsável e substitui o exemplo inicial com `tipOpe`. Usar config e autenticação da empresa (modo `NEXIT_DB` não cai para variáveis globais; tokens isolados). Timeout, uma renovação de token apenas em 401 comprovado, sem registrar segredos.
5. **FORMATO DE SUCESSO AGORA CONFIRMADO:** HTTP 200, objeto JSON com `status:"success"`, `CDC` e `kude` como Base64. No **servidor**, ler o corpo JSON limitado em bytes, rejeitar falha/JSON malformado, exigir `status === "success"`, exigir CDC retornado com **44 dígitos idênticos** ao CDC persistido na FE autorizada, e `kude` string Base64 canônica válida, não vazia. Decodificar com `Buffer.from(valor,"base64")` **somente após validação de alfabeto/padding/limite**; verificar assinatura `%PDF-`, terminador `%%EOF` tolerando whitespace final, tamanho máximo (até 10 MiB de PDF conforme limite atual) e nenhum dado HTML/JSON/texto disfarçado de PDF. Se erro ou CDC divergente, devolver 502 controlado, sem bytes nem conteúdo sensível. Não armazenar arquivo, Base64 ou CDC em logs; não salvar resposta no banco. Se fornecedor eventualmente responder PDF binário, tratar como caminho alternativo permitido **somente se seguro**, mas nunca rejeitar o JSON/Base64 já comprovado. Não seguir URLs arbitrárias (SSRF).
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
- FE autorizada e aprovada, identidade `001/001/0010004`, série null, POST `/api/kude` correto **sem perder zeros**, token da empresa correta, resposta PDF binária mock válida -> 200 PDF + headers corretos + bytes intactos + nome seguro.
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
- **CDC:** o gateway devolve `CDC`, e ele deve coincidir exatamente com o da FE `APROBADO` persistida. Falha => 502 neutro e modal exibe erro; nunca exibir KuDE de outro documento.
- **Prova de sucesso mínima:** mock JSON como `{status:'success',CDC:cdcPersistido,kude:pdf.toString('base64')}` => PDF bytes válidos na API interna e na modal; repetir abertura gera 2 POST distintos; mudança FE A→B, fechamento em voo, modal erro/retentativa, sem cache/persistência. Usar teste comportamental do controlador/hook REAL extraído da UI; não aprovar apenas regex de markup. Sem browser real, declarar limite.

### Revisão do código Claude já publicado

O código inicial da PRO-194, no início desta emenda, possuía `gateway.ts` esperando unicamente `application/pdf` **binário** e `page.tsx` usando `window.open` (nova aba) e `URL.revokeObjectURL` após 60s. **Esses comportamentos NÃO cumprem a evidência nova nem a decisão da modal**, e devem ser substituídos. Não considerar os 40 testes iniciais como prova do novo contrato.

**ATUALIZAÇÃO VINCULANTE POSTERIOR:** a elegibilidade FE APROBADA + CDC e o controle multiempresa+VER+sucursal permanecem; **retira-se `tipOpe` do contrato de requisição para FE e NCE** por definição explícita do responsável. NCE passa a ter tarefa funcional separada para habilitar o mesmo visor, mantendo XML fora de escopo. Projeto de redesign desktop segue separado.
