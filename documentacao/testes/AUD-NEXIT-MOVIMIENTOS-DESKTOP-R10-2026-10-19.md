# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R10 — Reauditoria independente PRO-191 / PRO-192

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional e HEAD auditado:** `0f43b6268a6f9fc79c0f69ed37404fbbf6f5c3fb` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/0f43b6268a6f9fc79c0f69ed37404fbbf6f5c3fb)).  
**Revisão anterior:** [AUD-R09](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R09-2026-10-19.md). **Definição:** [REQ-MOV-O07](../definicoes/REQ-MOV-O07-RECUPERACAO-INTENCAO.md).  
**Tarefas:** [PRO-188](https://linear.app/proceit/issue/PRO-188), [PRO-191](https://linear.app/proceit/issue/PRO-191), [PRO-192](https://linear.app/proceit/issue/PRO-192).

## 1. Veredito

**PRO-191/MOV-R09-01: CONFORME ESTATICAMENTE. PRO-192/MOV-R09-02: PARCIAL — 1 ACHADO MÉDIA DE SEGURANÇA, MOV-R10-01. PRO-188/MOV-O07: AINDA NÃO APROVADO PARA ROLLOUT.** A implementação agora mantém CONFIRMADA sem ACK até *clique real* do operador e o SQL verifica visibilidade em `movimiento_intencion_pendiente`, `tomar` e `reconocer`. Porém a função SQL `movimiento_intencion_reservar` ainda retorna uma K1 existente e seu snapshot após conferir apenas empresa, usuário e hash da solicitação, **sem verificar `MOVIMIENTOS.VER` ou escopo atual de depósitos**. Isso permite ler novamente dados originalmente conhecidos pela mesma pessoa depois de a autorização de leitura ter sido revogada. Não foi demonstrado novo caminho de duplicação, mas a política RN-06/PRO-192 não está totalmente cumprida.

**NEX-066 permanece NÃO APLICADA** segundo relato do Claude, não verificado na VM pelo auditor. **NÃO RECOMENDAR APLICAÇÃO DA MIGRATION NEX-066 NEM DEPLOY** com o achado aberto. PRO-79 permanece In Review / NÃO HOMOLOGADO. PRO-190 permanece conforme estático (POST legado 410). Aceites prévios PRO-182/183/184/185/186/187 são preservados no escopo não alterado.

## 2. Código auditado e matriz da rodada

Lidos o commit/diff na branch, `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, AUD-R09, especificação REQ-MOV-O07 e arquivos `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/recuperacion.ts`, `lib/movimientos/intento.ts`, `lib/movimientos/cliente-api.ts`, `lib/movimientos/intenciones.ts`, `lib/movimientos/intenciones-http.ts`, as rotas de intenção, `documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql`, scripts de verificação/reversão e testes. Conferida semântica da função oficial `usuario_puede_deposito` na NEX-014: valida depósito ativo e atribuição/alcance do usuário.

| Critério | Evidência real | Parecer |
| --- | --- | --- |
| ACK após sucesso **só por clique humano** | `nuevo/page.tsx:207–215`: `alRegistrar` apenas `setAvisoRecuperacion(MENSAJE_SIN_ACK(numero))`; `confirmarRecepcion` chama `confirmarRecepcionOperador` separadamente (`page.tsx:218–233`), ligado ao botão «Confirmar recepción». Nenhum ACK/navegação no callback de OK | **CONFORME ESTATICAMENTE** |
| Sem K2 antes do ACK | `intento.ts` mantém estado `CONFIRMADA` e bloqueio; NEX-066 índice único parcial cobre RESERVADA e CONFIRMADA com `reconocida_at IS NULL`, junto com lock da reserva | **CONFORME ESTATICAMENTE** |
| Duplo clique, ACK tardio após unmount | `recuperacion.ts:81–107` mantém Promise por controlador em WeakMap, deduplica handlers e só aplica callbacks com `vigente() = true`. ACK já confirmado por clique pode produzir resultado no banco depois da saída, aceitável | **CONFORME ESTATICAMENTE** |
| Leitura de pendência após revogação | NEX-066 `movimiento_intencion_pendiente:123–144`: recupera pendência do usuário e, antes de devolver snapshot/número, exige `movimiento_intencion_visible`; erro 42501 + detalhe seguro. `cliente-api` não interpreta erro como null/LIBRE | **CONFORME ESTATICAMENTE** |
| Execução/retry e ACK com visibilidade | NEX-066 `tomar:147–163`, `reconocer:184–211`: exigem visibilidade antes de devolver dados/número; escopo também é revalidado pelo motor oficial. `intenciones.ts` traduz erro para 403 neutro | **CONFORME ESTATICAMENTE** |
| Visibilidade real por depósito e VER | NEX-066 `movimiento_intencion_visible:68–74` confere `MOVIMIENTOS.VER` e `usuario_puede_deposito` para chaves canônicas `origenId`/`destinoId`; NEX-014 define `usuario_puede_deposito` com depósito ativo e atribuição ou `TODOS`; snapshot em `intenciones.ts:25–31` usa essas chaves | **CONFORME NA FUNÇÃO** |
| Reserva com a mesma K1 e snapshot existentes após revogação | NEX-066 `movimiento_intencion_reservar:101–109` lê registro por empresa/chave, valida titularidade/hash e **retorna snapshot sem chamar `visible`**; servidor `intenciones.ts:95–105` publica DTO do resultado | **NÃO CONFORME — MOV-R10-01** |
| NEX-066 sem execução + NEX-014 intacta | Diff altera script NEX-066 versionado e scripts, não NEX-014; testes PG reais ausentes | **CONFORME QUANTO AO DIFF, SEM HOMOLOGAÇÃO** |

## 3. MOV-R10-01 — MÉDIA — o replay da reserva existente devolve snapshot mesmo após perda de visibilidade

**Requisito violado:** RN-06 (a autorização de leitura atual limita exposição do snapshot) e o aceite corretivo da PRO-192 em todos os endpoints, inclusive POST `/api/movimientos/intencion`. **Causa concreta:**

- `NEX-066-movimientos-intenciones.sql:101–109`: na função SECURITY DEFINER `movimiento_intencion_reservar`, depois do lock de empresa/usuário, `SELECT * INTO v_prev ... WHERE empresa_id=p_empresa AND clave=p_clave`. Se `v_prev.usuario_id=p_usuario` e `v_prev.huella=md5(p_snapshot::text)`, executa diretamente `RETURN QUERY SELECT v_prev.clave, v_prev.estado, v_prev.snapshot, v_prev.creado_at, false`.
- **Não existe `IF NOT public.movimiento_intencion_visible(p_empresa,p_usuario,v_prev.snapshot)` antes desse RETURN.** A função só confere `MOVIMIENTOS.CREAR`, enquanto a nova regra exige também `MOVIMIENTOS.VER` e escopo corrente.
- `lib/movimientos/intenciones.ts:95–105`: a reserva chama a função SQL e devolve DTO com `snapshot` na API `POST /api/movimientos/intencion` (route.ts:32–35); o GET e o POST de retry/ACK já aplicam a política, mas **esta via alternativa não**.

**Cenário:**
1. Operador da empresa E com CREAR + VER + depósito A cria intenção K1 para A (ou K1 CONFIRMADA sem ACK), conhecendo K1 e dados originais.
2. Administrador remove `MOVIMIENTOS.VER` ou o alcance do depósito A, mantendo CREAR.
3. GET de recuperação e execução/ACK rejeitam com 403 e não revelam snapshot, como esperado.
4. O mesmo operador envia `POST /api/movimientos/intencion` com K1 original e snapshot canônico igual ao originalmente reservado.
5. O código SQL encontra a K1 e devolve `v_prev.snapshot` sem revisar visibilidade; a API publica o snapshot persistido ao usuário agora sem autorização de leitura.

**Impacto:** quebra da revogação de leitura em endpoint alternativo, sem comprovação de novo movimento duplicado. Conhecer K1 + snapshot antes da revogação **não autoriza** leitura posterior no backend. **Severidade MÉDIA**, mesmo enquadramento PRO-192; bloqueio do aceite de segurança e da recomendação de migrar.

**Correção dirigida:** colocar uma verificação de visibilidade no ramo `IF FOUND` de `movimiento_intencion_reservar` **antes de devolver qualquer campo**, com erro PostgreSQL `42501` + DETAIL `NEX:INTENCION_SIN_VISIBILIDAD`, respeitando neutralidade e preservando K1. Traduzir o erro de reserva no servidor para resposta segura (403 ou mecanismo seguro equivalente, nunca DTO completo, nunca `intencion:null`, nunca liberação de K2); não permitir que um 403 genérico de reserva seja tratado como liberação se já há intenção pendente: retorno em modo fail-closed e instrução de restabelecer acesso. Cuidar do comportamento do aplicativo em erro após revogação. Manter idempotência para quem ainda possui visibilidade e a lógica de bloqueio de pendência diferente. **Teste com a função REAL de reserva e simulação de DB, não apenas SELECT/GET:** estado RESERVADA e CONFIRMADA sem ACK, mesma K1/hash, revogação só VER e depois só depósito, POST reserva retorna sem dados; conferir K1 e estoque inalterados, K2 bloqueada e recuperação após restabelecimento. Regressões do ACK explícito e duas abas devem permanecer.

A NEX-066 é declarada **não aplicada**: editar o mesmo script versionado com numeração NEX-066 é aceitável sob a política do projeto. Atualizar scripts de validação e docs apenas se necessário; **não aplicar SQL na VM**.

## 4. Evidências de teste e limites

**Claude reportou, ChatGPT não reexecutou:** `intenciones` **90/0**, `intento` **30/0**, `inicializacion` **17/0**, `historial` **15/0**, `movimientos` **20/0**, `stock-reposición` **275/0** = **447/0 verificações relatadas**. Tipos pontuais OK e ESLint sem erros, avisos preexistentes. Testes agora compartilham `confirmarRecepcionOperador` e controladores reais e cobrem simulação de clique, perda de conexão, ACK e revogação nos endpoints de consulta/execução/ACK. Ainda não há renderização React/browser nem PostgreSQL de verdade; testes de SQL são estruturais e base simulada. **Faltou testar justamente o ramo de replay de reserva com a mesma K1 após revogação**, que está no SQL mas não integra as verificações negativas relatadas.

ChatGPT não fez VM, Docker, SQL, migration, CI, deploy ou execução de teste. `cruzados` / NEX-053 é falha legada não relacionada e não foi alterada.

## 5. Governança / continuidade

- **PRO-191/MOV-R09-01:** **CONFORME ESTATICAMENTE**, In Review, não Done.
- **PRO-192/MOV-R09-02:** **PARCIAL / CORREÇÃO SOLICITADA**, In Review, devido a MOV-R10-01 MÉDIA.
- **PRO-188/MOV-O07:** In Review, **NÃO APROVADO PARA ROLLOUT** até correção e reauditoria.
- **PRO-190/MOV-R08-02:** conforme estático desde AUD-R09; POST legado 410 preservado.
- **PRO-79 Movimientos:** In Review / NÃO HOMOLOGADO; manter aceites estáticos anteriores para demais módulos, sem avançar STK-D03/PRO-179 nem outros menus.
- Registrar subtarefa própria MOV-R10-01 vinculada à PRO-192. Após autorização humana Claude corrige exclusivamente isso, commit/push na branch oficial e para para **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R11**. Não marcar Done nem homologado. **NÃO APLICAR NEX-066 e NÃO DEPLOYAR** até novo parecer; toda aplicação/validação real em PG/VM é exclusiva do humano responsável.
