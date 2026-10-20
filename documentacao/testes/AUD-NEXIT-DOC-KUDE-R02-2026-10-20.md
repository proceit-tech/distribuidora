# AUD-NEXIT-DOC-KUDE-R02 — Reauditoria independente PRO-196/197 sob PRO-194

**Data:** 20/10/2026 · **Auditor:** ChatGPT · **Sistema:** NEXIT/DistribuNex V1, desktop · **Menu:** Facturación → Documentos electrónicos.  
**Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional e HEAD verificados:** `506f86bfb8d61e93e03d21752c3ac24af02b5d62` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/506f86bfb8d61e93e03d21752c3ac24af02b5d62)). **Commit de merge**: este parecer analisa o código resultante na branch, não somente os arquivos exibidos no patch do commit de merge.  
**Predecessora:** [AUD-DOC-KUDE-R01](./AUD-NEXIT-DOC-KUDE-R01-2026-10-20.md). **Contrato:** [REQ-DOC-KUDE-PDF-GATEWAY](../definicoes/REQ-DOC-KUDE-PDF-GATEWAY-2026-10-20.md).  
**Linear:** [PRO-194](https://linear.app/proceit/issue/PRO-194) e filhas [PRO-196](https://linear.app/proceit/issue/PRO-196) e [PRO-197](https://linear.app/proceit/issue/PRO-197). Redesign separado: [PRO-195](https://linear.app/proceit/issue/PRO-195), NÃO iniciado.

## 1. Veredito

**PRO-196 / DOC-KUDE-R01-01: CONFORME ESTATICAMENTE. PRO-197 / DOC-KUDE-R01-02: CONFORME ESTATICAMENTE. PRO-194 / KuDE FE: CONFORME ESTATICAMENTE no conjunto AUD-R01–R02, SEM HOMOLOGAÇÃO OPERACIONAL.**

As duas divergências médias da R01 foram corrigidas no código resultante do merge. Não foi identificado novo defeito bloqueante no escopo da alteração dirigida. A decisão não certifica o funcionamento no navegador, a resposta de rede do gateway real, o resultado de impressão, o estado dos acessos reais na VM ou o mapeamento semântico de `tipOpe`.

**A partir da AUD-R02 não resta correção de código obrigatória conhecida no recorte KuDE antes da validação real.** O responsável humano decide e executa build/deploy após revisar o SHA, sem quaisquer comandos VM/DB/Docker executados pela IA. PRO-194/196/197 e PRO-91 continuam **In Review, não Done e não homologados** até a prova real e aceite humano. PRO-195 permanece Todo, redesenho ainda não autorizado para implementação por este parecer.

## 2. Inspeção de código e evidências

Conferi código final dos arquivos `lib/facturacion/gateway.ts`, `kude-visor.ts`, `shared.ts`, `kude.casos.ts`, `app/(private)/documentos/page.tsx`, `kude-modal.tsx` e `app/api/documentos/[id]/kude/route.ts`, especificação e auditoria precedente. O commit `506f86b...` é merge de histórico que inclui a documentação da R01; as conclusões valem para os blobs realmente presentes no HEAD, sem confundir o patch da documentação com alteração funcional.

| Critério | Evidência no HEAD auditado | Parecer |
|---|---|---|
| **PRO-196 — leitura limitada antes de exceder memória** | `gateway.ts:692–717`: `leerCuerpoLimitado` usa `getReader().read()`, acumula chunks até `MAX_KUDE_JSON`, ao ultrapassar `lector.cancel()` e retorna null. `enviarKude:719–740` rejeita Content-Length excessivo sem leitura; aceita ausente/subdeclarado mas mantém limite real durante o streaming. Removeu `await r.arrayBuffer()`. | **CONFORME ESTATICAMENTE** |
| **PRO-196 — erro seguro e timeout** | `gateway.ts:762–775`: `texto:null` vira `DEMASIADO_GRANDE`; AbortController/timeout permanecem, respostas 401 autorizam apenas uma renovação. | **CONFORME ESTATICAMENTE** |
| **PRO-197 — nova consulta por cada download** | `kude-visor.ts:100–132`: a função `descargar()` chama `dep.obtener(docId,control.signal)` de novo em vez de salvar `estado.url`; o cliente `pedirKudeAlServidor` (`kude-visor.ts:139–151`) usa GET interno com `cache:'no-store'`. O servidor `shared.ts:313–347` consulta o gateway novamente e não reutiliza arquivo anterior. | **CONFORME ESTATICAMENTE** |
| **PRO-197 — concorrência, troca de documento, fechamento** | `kude-visor.ts:40–47,49–69,100–132`: estado `descarga:CARGANDO/ERROR/INACTIVA`, sequência própria `secuenciaDescarga`, AbortController para download, invalidado em `liberar`/troca; botão evita clique duplo apenas enquanto carregando. A volta atrasada de A não grava nem baixa na modal B. | **CONFORME ESTATICAMENTE** |
| **PRO-197 — erro sem destruir visor** | `kude-visor.ts:127–131`: erro conserva `estado.LISTO` e `url` da visualização; `kude-modal.tsx:69–75` informa erro, botão permite novo clique para tentar de novo, indica `Preparando descarga…`. | **CONFORME ESTATICAMENTE** |
| **Downloads efêmeros** | `kude-visor.ts:118–125`: cria Blob URL só depois da segunda obtenção, aciona download e agenda `revokeObjectURL` em 60 segundos para compatibilidade com downloads do browser. **Não é persistência em DB/disco/localStorage**; ocorre retenção transitória da URL do download durante esse intervalo, a ser verificada em navegador real. | **CONFORME ESTATICAMENTE COM OBSERVAÇÃO** |
| **Contrato Base64, CDC e ACL preservados** | `gateway.ts:663–688` exige `status === success`, CDC idêntico ao persistido, PDF Base64; `shared.ts:313–347` só aceita FE APROBADA + CDC, consulta escopada a empresa/sucursal, credenciais por empresa; GET `/api/documentos/[id]/kude` exige VER e headers de PDF/no-store/nosniff. | **PRESERVADO ESTATICAMENTE** |
| **Nenhuma persistência de KuDE** | `shared.ts` executa consultas SELECT, controlador só guarda Blob URL enquanto em uso e temporário de download, sem INSERT/UPDATE nem gravação de PDF no banco. | **PRESERVADO ESTATICAMENTE** |
| **Não regressão de impressão** | `kude-visor.ts:133–135` `imprimir()` usa o visor atual sem nova requisição, `page.tsx:100–105` usa `iframe.contentWindow.print()`. | **PRESERVADO ESTATICAMENTE; FUNCIONALIDADE NÃO PROVADA NO BROWSER** |

## 3. Testes e alcance

**Reportados pelo implementador, NÃO reexecutados pelo ChatGPT:** `kude` **96 verificações, 0 falhas**, regressões `configuracion-gateway` 60, `gateway-config` 69, `fat-e2` 44, `facturacion` 271, `rediseno` 90, `nce` 205 → **739 regressões e 835 verificações totais, 0 falhas relatadas**. `tsc` do projeto de casos e ESLint pontual reportados OK. Não alegar certificação de tipos do build global/CI.

Na inspeção do teste `kude.casos.ts:451–503`, a leitura do corpo é exercitada contra streams simulados finitos/infindáveis com headers ausentes, falsos e excessivos, incluindo cancelamento de reader antes de consumir tudo e PDF de 6 MiB intacto. `kude.casos.ts:506–622` executa a **lógica real do controlador** e a orquestração de servidor com gateway mockado: erro→nova consulta, duplo clique, fechamento/download tardio, troca FE A→B, acesso empresa/sucursal e CDC divergente. `kude.casos.ts:624–650` verifica estrutura/rota, **não renderiza React**.

**Limites da auditoria:** nenhuma chamada real `/api/kude`, nenhuma verificação de token com fornecedor, nenhuma consulta de PostgreSQL real, nenhum navegador, PDF viewer, impressão, integração com a VM, build, CI ou deploy. Browser e gateway real devem ser validados exclusivamente pelo responsável.

## 4. Pendências operacionais e critérios de aceite real

O `tipOpe` está sendo obtido de `iTiOpe` (campo fiscal D202) do payload FE imutável, sem `"4"` fixo. Trata-se de **hipótese de equivalência ainda não confirmada pelo fornecedor**. Também falta prova de que o Bearer obtido em `/api/login` funciona no `/api/kude`, embora o Postman do responsável tenha resposta 200 com autenticação configurada. **Verificar isso com uma FE real aprovada antes de declarar homologação.**

Homologação humana dirigida, preferencialmente em ambiente de teste e FE controlada:
1. Confirmar SHA de código efetivamente publicado e gateway configurado para empresa correta.
2. Abrir a FE aprovada com CDC em `/documentos` e visualizar PDF na modal; conferir número, receptor, total, CDC e renderização.
3. Fechar/reabrir a mesma FE **duas vezes** e comprovar duas requisições externas novas, sem PDF antigo persistido.
4. Clicar `Descargar PDF` e comprovar **novo GET ao NEXIT e novo POST ao gateway**, com arquivo válido e nome correto.
5. Confirmar `Imprimir` na navegação real (iframe/browser) sem erro.
6. Fechar durante carregamento e durante download; conferir ausência de arquivo trocado, PDF atrasado ou mensagem de dados sensíveis.
7. Se viável com conta de teste autorizada, conferir isolamento de sucursal/empresa/VER; sem expor documento alheio.
8. Observar respostas 401, 404, timeout, CDC divergente apenas por simulação controlada, sem provocar indisponibilidade do gateway produtivo.
9. Verificar que nenhum PDF/Base64 foi persistido em PostgreSQL, disco, logs ou cache.
10. Registrar evidências e decisão humana: **HOMOLOGADO / CORREÇÃO NECESSÁRIA**.

**Não criar nova tarefa corretiva por cautela quando não há defeito comprovado.** Se um teste real demonstrar erro, registrar achado específico com evidência e somente então autorizar Claude a corrigir, seguindo nova auditoria. A PRO-195 é um redesign separado e só pode começar após decisão do responsável.
