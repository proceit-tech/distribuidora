# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R09 — Reauditoria independente PRO-189 / PRO-190 / MOV-O07

**Data:** 19/10/2026 · **Auditor:** ChatGPT · **Sistema:** NEXIT/DistribuNex V1, exclusivamente desktop.  
**Repositório/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado e confirmado como HEAD:** `ae525f1ba4591da7d41bb6beb60c2f44af2709a2` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/ae525f1ba4591da7d41bb6beb60c2f44af2709a2)).  
**Predecessora:** [AUD-R08](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R08-2026-10-19.md). **Definição vigente:** [REQ-MOV-O07](../definicoes/REQ-MOV-O07-RECUPERACAO-INTENCAO.md).  
**Tarefas:** [PRO-188](https://linear.app/proceit/issue/PRO-188) (principal), [PRO-189](https://linear.app/proceit/issue/PRO-189), [PRO-190](https://linear.app/proceit/issue/PRO-190).

## 1. Veredito

**NÃO APROVADO TECNICAMENTE PARA APLICAÇÃO NA ÚNICA VM REAL**: um achado **ALTA** MOV-R09-01 no reconhecimento de resultado na própria tela e um achado **MÉDIA** MOV-R09-02 de revalidação do alcance de leitura da intenção. O ciclo SQL **RESERVADA → CONFIRMADA ainda não reconhecida → ACK** corrige a lacuna central da AUD-R08 no backend; o POST legado 410 corrige o bypass da auditoria anterior. Mas **a própria UI chama ACK automaticamente antes de apresentar confirmação ao operador**, reabrindo uma janela de duplicação humana caso o navegador seja fechado antes da navegação. O recurso ainda não atende integralmente ao requisito de *ACK explícito*. Há também vazamento de snapshot para o próprio autor com alcance de depósito/permissão de leitura revogados, contrário ao RN-06.

A NEX-066 está **versionada e declarada NÃO APLICADA** pelo Claude. O ChatGPT não pode constatar estado real de VM/banco e não executou SQL, migração, deploy, testes locais nem navegador. **NÃO APLICAR A MIGRATION NEX-066, NÃO DEPLOYAR ESTE COMMIT** antes de corrigir e reauditar. PRO-79 continua In Review / NÃO HOMOLOGADO. Aceites estáticos anteriores R04/R05/R07 de MOV-D01/D02/D03 seguem preservados, exceto pelos efeitos explicitamente identificados neste novo fluxo.

**Testes Claude reportados, não reexecutados pelo auditor:** `intenciones` 53/0, `intento` 30/0, `inicializacion` 17/0, `historial` 15/0, `movimientos` 20/0 e `stock-reposición` 275/0 = **410 verificações/0 falhas reportadas**; tipos/lint pontuais reportados OK. SQL apenas analisado estruturalmente pelo implementador; simulação de banco com locks e rollback, sem PG real/React real/VM. Esses testes não exercitam o ACK automático da tela nem o acesso revogado a depósitos na recuperação.

## 2. Reauditoria dos achados da R08

| Achado anterior | Correção examinada e evidência | Parecer |
| --- | --- | --- |
| MOV-R08-01 / PRO-189: CONFIRMADA invisível após COMMIT e perda HTTP | NEX-066 linhas 34–61 adiciona `reconocida_at`, CHECK, índice parcial `(empresa_id, usuario_id) WHERE reconocida_at IS NULL AND estado IN ('RESERVADA','CONFIRMADA')`; `movimiento_intencion_pendiente` linhas 111–126 devolve CONFIRMADA não reconhecida + número, `movimiento_intencion_reservar` linhas 86–109 serializa e bloqueia nova K2; `movimiento_intencion_reconocer` linhas 161–187 autentica pelos argumentos de sessão, usa MESMO advisory lock, `FOR UPDATE`, prova de movimento K1/autoria, não toca estoque, idempotente. `recuperacion.ts` linhas 69–74 distingue CONFIRMADA e número; UI exibe botão de ACK. Teste T03 agora exige recuperar K1/número, bloquear K2, confirmar ACK e só depois reservar outra | **CORRIGIDO NO BACKEND**, mas aceite final **BLOQUEADO** pela MOV-R09-01 do componente |
| MOV-R08-02 / PRO-190: POST legado grava sem checkpoint | `app/api/movimientos/route.ts:117–124` POST sem argumentos, nenhuma leitura de body/sessão/banco/SQL, apenas `respuestaPostLegado()` com 410; teste usa handler real em nove cenários negativos. Rotas novas continuam reservando/efetivando com snapshot persistido. | **CONFORME ESTATICAMENTE**, sem SQL/PG/browser real |

## 3. MOV-R09-01 — ALTA — ACK automático antes de operador visualizar e reconhecer sucesso

**Requisitos:** RN-02, RN-04, RN-05, RN-08; CA-01, CA-02, CA-03, confirmação explícita descrita no pedido e na PRO-189. **Risco:** retorno do problema MOV-O07 em uma janela pós-COMMIT.

**Código:** `app/(private)/movimientos/nuevo/page.tsx:207–225`, em especial `alRegistrar(numero) { void (async () => { const a = await control.current.reconocer(); ... if (a.ok) { setRegistrado(true); router.push('/movimientos?ok=...'); router.refresh(); } })(); }`. `lib/movimientos/intento.ts:190–194` corretamente mantém `estado = 'CONFIRMADA'` após OK, mas a UI invoca automaticamente o ACK em vez de mostrar o número e aguardar **um clique real** de «Confirmar recepción». O botão existe para casos de recuperação (`nuevo/page.tsx:230–250,604–608`), mas é contornado pelo caminho padrão de sucesso.

**Sequência reprodutível pelo código:**
1. O POST executar com K1 tem COMMIT: M1 registrado e intenção CONFIRMADA, ainda não reconhecida. O navegador recebe o JSON de OK.
2. O callback `alRegistrar` chama ACK **automaticamente**, sem interação adicional nem renderizar o número antes. A função SQL coloca `reconocida_at` e libera reserva K2.
3. Entre o COMMIT do ACK e o `router.push(...?ok=M1)`/renderização do histórico o usuário fecha navegador, a aba é encerrada, processo cai ou conexão de UI é interrompida.
4. Reabertura/relogin: GET de recuperação devolve null (K1 ACKed), UI fica LIBRE e um operador que não viu o M1 pode efetuar K2 com a mesma operação. O banco não consegue saber que o ACK foi disparado automaticamente, logo não bloqueia K2.

**Critério corretivo:** **não realizar ACK automaticamente no callback de sucesso.** Ao receber OK, manter K1 + número em `CONFIRMADA` local e no PostgreSQL, renderizar mensagem visível `El movimiento MOV-... fue registrado correctamente`, e aguardar ação do usuário no botão «Confirmar recepción». Só após clique real disparar `reconocerIntencionApi`; verificar ACK confirmado antes de liberar K2/navegar. Se falhar/rede/fechar antes do clique ou após ACK não entregue, recuperação segura deverá manter a apresentação quando o servidor ainda não recebeu ACK; protocolo idempotente em falhas. Para evitar nova janela, **não iniciar ACK sem o operador ter visto a confirmação**, e não depender exclusivamente da página de histórico que só abre *depois* do ACK. Mantém regra de ACK sem efeito em estoque, titularidade e controle K1. Navegação pode vir após clique e confirmação de ACK, nunca substituir o reconhecimento.

**Testes necessários:** integrar o **callback verdadeiro de `page.tsx`** por extração de helper testável ou teste de componente; simular `OK` → antes do clique não há chamadas `/reconocer`, K2 segue bloqueada, número é apresentado; refresh/close nesse instante → mesma K1+M1 recuperadas; clique ACK → desbloqueio; ACK lost, duplicate click e sucesso. Caso navegador seja fechado depois do ACK clique mas antes da navegação, o ACK é válido porque houve ação humana.

**Severidade ALTA:** cenário central de duplicação humana após confirmação não efetivamente vista. **Bloqueia recomendação de aplicar NEX-066/deploy.**

## 4. MOV-R09-02 — MÉDIA — consulta da intenção expõe snapshot após revogação de alcance de depósito/VER

**Requisito:** RN-06 da REQ-MOV-O07: `MOVIMIENTOS.CREAR` para criar/repetir; `MOVIMIENTOS.VER` e alcance atual de depósito para visualizar detalhes. Ausência de visibilidade não deve liberar K2 nem eliminar a intenção.

**Código:** `documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql:111–125` só chama `usuario_tiene_permiso(...,'MOVIMIENTOS','CREAR')`; `lib/movimientos/intenciones-http.ts:12–27` só exige CREAR no GET; `lib/movimientos/intenciones.ts:46–67` entrega snapshot e número completos. Não há `usuario_puede_deposito` para depósitos de origem/destino e não há checagem de `MOVIMIENTOS.VER` antes de devolver detalhes/custo/motivo/observação. `movimiento_intencion_reconocer` exige CREAR e titularidade, mas tampouco revalida alcance para revelar número.

**Cenário verificável:** operador tinha acesso a depósito A, reservou movimento K1; depois o administrador revoga atribuição de A e deixa CREAR. Ao reabrir tela, GET ainda apresenta snapshot (produto, quantidades, custo, depósito, texto livre, número) fora do alcance atual, contrariando regra de visibilidade. O autor original não é um estranho, porém a política atual de revogação de visibilidade exige escopo vigente.

**Correção esperada:** revalidar alcance atual e permissão de leitura no endpoint/backend antes de retornar qualquer detalhe do snapshot e número, incluindo CONFIRMADA não reconhecida. Em caso de perda de acesso, devolver resultado seguro/neutralizado e estado bloqueante, **sem liberar K2** nem apagar checkpoint; providenciar via fluxo autorizado de suporte/reconciliação a continuidade com permissões restabelecidas. Evitar 404/null (o cliente interpreta null como LIBRE). Garantir que ACK de intenção sem visibilidade não revele número indevido, e avaliar como conciliar operador que perdeu acesso, sem bypass por K1. Se CREAR presente mas VER ausente, respeitar regra de visualização formal; os testes devem cobrir CREAR-only, VER-only, revogação de depósito de origem e/ou destino, depósito inativo, multiempresa e outro usuário. **Não relaxar segurança para melhorar UX.**

**Severidade MÉDIA** (violação de escopo de leitura e possível dado comercial/custo indevido; não demonstra duplicação nova sozinha). Não aprovado enquanto aberto.

## 5. Outros limites e condicionantes

- NEX-066 permanece script ainda não aplicado, versionado sob numeração original. O diff inclui coluna `reconocida_at`, índice parcial com `CONFIRMADA` e nova função `movimiento_intencion_reconocer` sem mudar a NEX-014.
- `verificar-NEX-066.sql` cobre coluna, índice, seis funções, privilégios, motor e ausência de acesso direto de `nexit_runtime`; `reversion-NEX-066.sql` se nega com `RESERVADA` e `CONFIRMADA` sem ACK, além de proteger respaldo pré-existente. **Não foram executados contra PostgreSQL real**.
- `PROCEDIMIENTO-NEX-066.md` ainda deve incorporar sequência de uso **do botão** explícito e observação do bloqueio K2 antes dele; não apenas a existência de ACK.
- Modelo simulado é contratual, não um banco PostgreSQL: nenhuma certificação de sintaxe SQL, transações, autoprivilégios ou performance na VM. Para aplicação futura, primeiro revisão integral da migration e scripts, depois somente o responsável humano aplica no único ambiente operacional, com backup e preflight/read-only, e confere.
- O POST legado 410 impede gravação pela antiga rota, mas outros consumidores externos (se existirem) precisarão migrar à API nova; a revisão do diff não pode atestar todos os consumidores fora do repositório.

## 6. Estado e próxima rodada

- **PRO-190/MOV-R08-02:** **CONFORME ESTATICAMENTE**, In Review, não Done.
- **PRO-189/MOV-R08-01:** **PARCIAL — CORREÇÃO SOLICITADA** por MOV-R09-01 ALTA no fluxo de sucesso da UI.
- **PRO-188/MOV-O07:** In Review / **NÃO APROVADO**, pendente MOV-R09-01 (ALTA) e MOV-R09-02 (MÉDIA).
- **PRO-79 Movimientos:** In Review / **NÃO HOMOLOGADO**. PRO-182/183/184/185/186/187 mantêm aceites estáticos anteriores; risco operacional de MOV-O07 segue aberto.
- Criar tarefas vinculadas a PRO-188 para os dois achados. Claude somente corrige após autorização do responsável, usa branch oficial, testes dirigidos, entrega commit e para para **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R10**.
- **NEX-066 NÃO DEVE SER APLICADA** com esses achados em aberto. Nenhuma IA acessa VM, Docker, PG, CI manual, nem executa SQL/deploy. STK-D03/PRO-179 e outros menus fora do escopo.
