# AUD-NEXIT-DOC-KUDE-R01 — Auditoria independente PRO-194 / KuDE PDF FE

**Data:** 20/10/2026. **Auditor:** ChatGPT. **Menu:** Facturación → Documentos electrónicos (desktop).  
**Repositório:** `proceit-tech/distribuidora`; branch `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado e HEAD conferido:** `177d80e2ad5730d75c2f8c30c1041af4c3b8c711` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/177d80e2ad5730d75c2f8c30c1041af4c3b8c711)); o commit é um merge, portanto o parecer verifica o **conteúdo final de todos os arquivos relevantes**, não só o patch apresentado para o merge.  
**Requisito:** [REQ-DOC-KUDE-PDF-GATEWAY](../definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md). **Linear:** [PRO-194](https://linear.app/proceit/issue/PRO-194), filha de PRO-91. **PRO-195** (redesign desktop geral) é tarefa separada e não foi implementada.

## 1. Veredito

**PRO-194: PARCIAL — 2 achados de severidade MÉDIA. Sem autorização para declarar homologação ou realizar deploy como versão aceita.** O núcleo exigido está conforme **na leitura estática**: `POST /api/kude` com bearer configurado por empresa, resposta JSON `status:"success", CDC, kude` em Base64, igualdade CDC com FE aprovada persistida, decode e validação PDF, resposta interna binária com headers `no-store`; modal embutida com controlador por ID, reconsulta por cada abertura, fechamento que invalida resultados tardios, descarte de Blob e URL temporária.

Entretanto:
1. **DOC-KUDE-R01-01 — MÉDIA, controle de memória/limite de transporte:** `lib/facturacion/gateway.ts:696–705` faz `await r.arrayBuffer()` antes de conferir o tamanho recebido. `Content-Length` é opcional e não confiável; uma resposta sem cabeçalho ou maior que o declarado é carregada completamente em memória, contrariando o limite de 10 MiB + overhead do contrato. A comparação de tamanho **após** ler não protege consumo de memória/concorrência no Node.
2. **DOC-KUDE-R01-02 — MÉDIA, requisição nova no download:** `lib/facturacion/kude-visor.ts:93–95` chama `dep.descargar(estado.url,estado.nombre)` e `app/(private)/documentos/page.tsx:91–99` cria link `a.href=url` para o Blob previamente aberto. Não realiza nova chamada ao backend/gateway ao clicar `Descargar PDF`, ao contrário do requisito vinculante seção 6, linha 79: `O ato de baixar também deve requisitar a versão corrente, salvo decisão humana posterior` (nenhuma decisão posterior registrada). O download local atual funciona tecnicamente, porém **não atende ao contrato de versão corrente**.

**Outras limitações não classificadas como achados:** `tipOpe` é derivado de `iTiOpe` do snapshot FE conforme `payload-fe.ts:368` e `shared.ts:294–300`, ainda **não confirmado semanticamente pelo fornecedor**; o mesmo bearer do login é reutilizado no KuDE sem teste no fornecedor; a UI/iframe/print() não foi renderizada/testada em navegador real. Não converter esses pontos pendentes em alegação de sucesso operacional. A screenshot Postman prova o corpo JSON mostrado, não a integração NEXIT.

## 2. Evidências positivas do código

| Requisito | Evidência no commit auditado | Estado |
| --- | --- | --- |
| Contrato real JSON/Base64 | `gateway.ts:662–687,712–745`: analisa JSON, exige `status === 'success'`, CDC igual ao persistido, Base64 e PDF; bytes binários retornam via backend | **CONFORME ESTATICAMENTE** |
| Identidade fiscal e isolamento | `shared.ts:313–347`: `leerDocumento(db, empresaId, usuarioId, id)` aplica escopo empresa/sucursal; exige FE APROBADA + CDC e lê número/série/tipOpe da solicitação fiscal persistida; API `GET /api/documentos/[id]/kude` exige `FACTURACION_ELECTRONICA.VER` | **CONFORME ESTATICAMENTE**, sem PG real |
| Retorno PDF seguro | `route.ts:20–29`: PDF válido em bytes, `application/pdf`, `inline/attachment`, filename fiscal saneado, `Cache-Control: private,no-store`, `nosniff` | **CONFORME ESTATICAMENTE** |
| Nova consulta por cada ABERTURA | `kude-visor.ts:42–85,103–114`: `abrir` executa `cargar` com `pedirKudeAlServidor` por ID e `cache:'no-store'`, sem PDF em memória persistente entre fechamentos | **CONFORME ESTATICAMENTE** |
| Cancelar e ignorar resposta tardia | `kude-visor.ts:25–62,86–91`: AbortController/seq, revoga ObjectURL se LISTO; `kude-modal.tsx:58–60` fecha no unmount | **CONFORME ESTATICAMENTE**, sem browser real |
| Modal embutida acessível | `kude-modal.tsx:11–87`: `role=dialog`, aria-modal, Escape, foco inicial/retorno e contenção de Tab, iframe temporário, estados CARGANDO/LISTO/ERROR com `Reintentar` | **CONFORME ESTATICAMENTE**, sujeito a teste de foco/iframe/impressão real |
| Download de versão corrente | `kude-visor.ts:93–95` + `page.tsx:91–99` somente reutiliza Blob/URL já mostrados | **NÃO CONFORME — DOC-KUDE-R01-02** |
| Limite efetivo de transporte do gateway | `gateway.ts:691–709` lê `arrayBuffer()` inteiro antes de medir quando Content-Length falta ou é falso | **NÃO CONFORME — DOC-KUDE-R01-01** |
| Sem persistência KuDE | `shared.ts:313–347`: só SELECT; estado modal tem URL temporária, sem INSERT/UPDATE do KuDE e sem cache do PDF | **CONFORME ESTATICAMENTE** |
| Regressões sem SQL/migrations | Diff do código tem gateway/shared, controlador/modal, tela/testes e progresso; a PRO-195 aparece no merge como documentação separada, não como implementação | **CONFORME NO ESCOPO** |

## 3. Correção dirigida DOC-KUDE-R01-01 — leitura limitada de resposta

**Código:** `lib/facturacion/gateway.ts`, `enviarKude`, linhas 691–709; sobretudo `const bytes=Buffer.from(await r.arrayBuffer())` linha 702. Um Content-Length maior que o limite é rejeitado antes de ler, mas um Content-Length ausente, falso ou menor que a resposta real leva a **consumo integral do corpo no Node antes do check**.

**Aceite:** implementar leitura incremental bounded de `Response.body` com `getReader()` e limite `MAX_KUDE_JSON`, abort/cancel quando ultrapassar limite, no máximo tamanho configurado mesmo sem Content-Length; aproveitar Content-Length apenas como rejeição antecipada, nunca garantia. Preservar timeout/401 e compatibilidade dos mocks/testes. Não armazenar buffers de respostas grandes inteiras na memória, não fazer log do corpo. Testar stream real simulado sem Content-Length, com Content-Length falso baixo, chunk que ultrapassa limite, cancelamento do reader e leituras dentro do limite; observar que o mecanismo não descarrega todo o stream antes de abortar. Resposta grande → erro 502 `DEMASIADO_GRANDE`, não PDF.

## 4. Correção dirigida DOC-KUDE-R01-02 — consulta nova ao clicar download

**Código:** `lib/facturacion/kude-visor.ts:93–95`, `app/(private)/documentos/page.tsx:91–99`, modal ação `Descargar PDF`. Atualmente ela salva o Blob da sessão de visualização, contrariando seção 6 do requisito. Um download pode obter documento de momento diferente do visualizado: o comportamento deve ser comunicado ao operador de modo simples.

**Aceite:** o clique `Descargar PDF` deve gerar nova `GET /api/documentos/{id}/kude?descargar=1` (ou nova GET equivalente, com `cache:no-store`) e, portanto, **nova POST /api/kude**; mesma verificação de ACL+CDC+PDF no backend, sem persistir. Durante download, botão indica progresso e previne cliques simultâneos, mas não estabelece cota de downloads; ao fechar/trocar FE, abortar download em voo e não baixar PDF errado; sem tratar a reutilização da URL visualizada como nova consulta. Ao erro, mostrar feedback sem destruir o PDF já visível; retry faz outra chamada. Testar 1 abertura + 2 downloads → 3 requests externos, outra empresa/sucursal/sessão vencida não baixa. Preservar imprimir da sessão visualizada, que não exige nova consulta. Se o responsável decidir preferir baixar **exatamente o arquivo já exibido** sem refetch, é uma alteração deliberada da especificação e deve ser formalizada antes de aceitar o comportamento atual, não suposta.

## 5. Evidência de testes e limites

**Claude reportou, ChatGPT NÃO reexecutou:** `kude` 70 verificações / 0 falhas; regressões `configuracion-gateway` 60, `gateway-config` 69, `fat-e2` 44, `facturacion` 271, `rediseno` 90, `nce` 205 = **809 verificações adicionais** e **879 verificações totais relatadas / 0 falhas**. `tsc` de projeto de casos e ESLint pontual reportados OK. A auditoria foi feita por leitura GitHub do código e do teste; **sem execução independente de testes, PostgreSQL, navegador/React, gateway real, VM, Docker, CI, build ou deploy**. Não validar impressão com browser a partir de teste unitário de callback.

## 6. Status do projeto e próximo controle

- **PRO-194:** `In Review` após publicação do relatório, aceite **PARCIAL**, com dois achados médias. Não Done/homologado.
- **PRO-91:** `In Review`, ainda não homologado.
- **PRO-195:** `Todo`, **NÃO INICIAR** até correção e auditoria R02 do KuDE.
- Criar duas subtarefas de PRO-194 para os achados. Claude só implementa correções autorizadas, testa e faz push na branch oficial, para para `AUD-NEXIT-DOC-KUDE-R02`. ChatGPT audita; responsável humano executa deploy/validação real após aprovação; nenhuma IA deve operar VM/banco nem inventar mapeamento `tipOpe`.
