# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R08 — Auditoria independente PRO-188 / MOV-O07

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT/DistribuNex V1, apenas desktop.  
**Branch:** `feature/NEXIT-2026-001-banco-demo` · repositório `proceit-tech/distribuidora`.  
**Commit funcional / HEAD auditado:** `f33c212ec5fbbddcf18fa809e6ee69f4bb86b866` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/f33c212ec5fbbddcf18fa809e6ee69f4bb86b866)).  
**Definição aprovada:** [REQ-MOV-O07](../definicoes/REQ-MOV-O07-RECUPERACAO-INTENCAO.md).  
**Antecedente técnico:** [AUD-R07](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R07-2026-10-19.md).

## 1. Veredito

**NÃO APROVADO TECNICAMENTE — 2 ACHADOS ALTA de integridade, MOV-R08-01 e MOV-R08-02. NÃO APLICAR NEX-066 NA VM. NÃO DEPLOYAR O COMMIT FUNCIONAL.** O commit cria boa parte da infraestrutura requerida (NEX-066, checkpoint no PostgreSQL, operações SECURITY DEFINER, recuperação de RESERVADA, retry K1, fluxos fail-closed na tela nova), mas **não elimina o risco de duplicação que motivou MOV-O07**. A aplicação do código novo sem a migration impede registros no formulário novo; por isso a implantação deve ocorrer somente depois de corrigir/auditar os achados, com ordem e scripts revistos. A NEX-066 ainda não foi aplicada, conforme relato do implementador, sem verificação própria da VM.

**Testes reportados pelo Claude, não reexecutados pelo auditor:** intenciones 39/0, intento 30/0, inicializacion 17/0, historial 15/0, movimientos 20/0, stock-reposición 275/0 = **396 verificações/0 falhas relatadas**. Tipos e ESLint pontuais informados OK. Simulação in-memory do contrato SQL, sem execução real da migration, testes de PostgreSQL, nem renderização React. Os resultados não demonstram CA-01/CA-02/CA-03 no cenário de resposta perdida após COMMIT, e um teste codifica o comportamento defeituoso.

## 2. Achado MOV-R08-01 — ALTA — CONFIRMADA sem entrega da resposta fica invisível na recuperação e libera K2

**Violação:** RN-02, RN-04, RN-05, T03, CA-01/02/03 e objetivo central MOV-O07.

**Arquivos e linhas:**
- `documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql:105–119`: `movimiento_intencion_pendiente` retorna **somente** `i.estado = 'RESERVADA'`.
- `lib/movimientos/intenciones.ts:138–158`: o registro com K1 marca `CONFIRMADA` na MESMA transação que o COMMIT do movimento. Correto no banco.
- `lib/movimientos/recuperacion.ts:61–65`: resposta sem pendência libera a criação de intenção nova (`LIBRE`).
- `app/(private)/movimientos/nuevo/page.tsx:76–104`: recupera via GET; após retorno vazio, libera UI.
- `documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql:55–56,95–103`: bloqueio único e recusa de K2 só existem quando há `RESERVADA`, e não há barreira de reconhecimento ao operador após `CONFIRMADA`.

**Sequência comprovada pelo código:**
1. Reserva K1 é commitada; POST `/intencion/ejecutar` registra movimento M1 e atualiza intenção K1 para `CONFIRMADA`; a transação termina em COMMIT.
2. Falha rede/proxy perde resposta de sucesso HTTP; operador nunca vê M1, mas o banco já registrou.
3. Operador faz refresh ou logout/login; `GET /intencion` retorna `intencion:null` porque só busca `RESERVADA`.
4. `recuperarIntencion` interpreta a ausência como `LIBRE`, gera K2 em novo submit, reserva porque índice só restringe RESERVADA, e registra M2 duplicando efeito de estoque.

**Evidência forte de teste insuficiente:** `lib/movimientos/intenciones.casos.ts:282–304` cria exatamente o COMMIT seguido de resposta perdida; o próprio teste T03b **espera `rec.estado = 'LIBRE'` e efeitosStock=1 ANTES de uma nova tentativa**, tratando erroneamente a ausência da pendência como sucesso de recuperação. Ele não tenta K2 após reabrir, e por isso passa mesmo com a vulnerabilidade. `lib/movimientos/intenciones.casos.ts:515–536` também libera intenção local quando GET retorna null após `CONFIRMADA` sem mostrar o número.

**Correção esperada:** separar estado *confirmada no banco* de *resultado entregue/reconhecido pela sessão/operação*. A consulta de recuperação deve apresentar **K1 e número original** após COMMIT com resposta perdida, mesmo que a transação já esteja `CONFIRMADA`; não libertar K2 antes do mecanismo de reconhecimento seguro. Projetar protocolo de acknowledgement/autorização no servidor (ou equivalente à prova de entrega, com janela de entrega explícita e sem desbloqueio tácito), incluindo sessões simultâneas e respostas perdidas; impedir reenvio inadvertido K2 antes de reconhecimento. A prova de confirmação é baseada em `empresa_id + usuario_id + clave + creado_por` e registro existente, sem GET causar nova movimentação. Não exigir ACK eterno em sucesso recebido: solução precisa permitir novo movimento após reconhecimento explícito válido. **Não tratar qualquer `CONFIRMADA` histórica como pendência eterna sem UX de confirmação/ack.**

**Testes corretivos:** efetuar COMMIT M1 e perder resposta; refresh e relogin → GET recupera K1+M1, não `LIBRE`; tentativa K2 bloqueada até operador reconhecer resultado M1; ACK autorizado e idempotente libera nova intenção; dois navegadores/abas, ACK perdido, usuário trocado, depósitos/permissões revogados, reconsulta read-only. Teste contra adapters reais com concorrência controlada; teste negativo que prove que M2 não foi criado.

**Impacto:** duplicação física de stock por repetição humana após sucesso invisível. **ALTA / bloqueia aplicação da NEX-066 e aceite técnico.**

## 3. Achado MOV-R08-02 — ALTA — POST legado pode escrever stock sem reserva NEX-066 e correção não tem lock atômico

**Violação:** RN-01, RN-03, CA-01/02/03, requisito de que *todo registro* possua K1 persistida antes do motor.

**Arquivo/linhas:** `app/api/movimientos/route.ts:141–157`. A implementação faz um SELECT `movimiento_intencion_pendiente(empresa,usuario)`; se existir pendência e a chave fornecida for outra, responde 409. **Se não existir pendência**, segue diretamente para `registrarMovimiento(conexion,...)` depois de `BEGIN` — sem chamar `movimiento_intencion_reservar`, sem persistir snapshot/K1 em `movimientos_intenciones`, sem coordenar o resultado com `movimiento_intencion_confirmar`.

**Reprodução:**
1. Usuário autenticado com `MOVIMIENTOS.CREAR` tem zero pendências; chama diretamente `POST /api/movimientos` com payload válido e K2.
2. `movimiento_intencion_pendiente` retorna vazio.
3. A rota chama o motor NEX-014 e commita movimento M2, embora **não exista** registro K2 em `movimientos_intenciones`.
4. Se resposta for perdida, não há checkpoint para recuperar K2; nova chamada com K3 pode gravar duplicidade. O SELECT antes do `BEGIN` também não impede concorrência com outra aba reservando uma pendência no intervalo.

**Mesmo com pendência da mesma K1**, o ramo atual aceita o POST legado e executa o motor direto, deixando a intenção `RESERVADA` sem confirmação atômica; o GET apresenta evidência, mas a invariância nova de commit+CONFIRMADA é quebrada.

**Correção esperada:** eliminar a possibilidade de mutação pelo endpoint legado sem executar **o mesmo protocolo durável**, ou responder de forma segura (409/410 com instrução de usar `/intencion`), inclusive quando não há pendências; eventuais consumidores legítimos necessitam migração explícita. Se for preservada compatibilidade, usar checkpoint garantido ANTES da mutação e a mesma serialização/confirmacao da intenção, nunca um SELECT seguido de POST sem travas. Restringir o fluxo a sessão/permissão, jamais permitir contornar por K1 arbitrária, garantir que GET sem NEX-066 não libere caminho e que rollback de falhas preserve K1.

**Testes corretivos:** POST legado com 0 pendência (nunca escreve), com pendência mesma K1, com K2 divergente, duas abas concorrentes no SELECT/POST, GET erro/ausência NEX-066 e ausência de sessão, sem efeito de stock em todos os caminhos não reservados. Confirmar que a rota durável segue operacional no contrato. Testes estruturais não bastam: integrar route handler ou extrair política real testável.

**Impacto:** bypass de barreira de idempotência, risco de duplicação de estoque e perda de trilha por usuário. **ALTA / bloqueia aceite técnico.**

## 4. O que foi verificado como conforme ou promissor

- NEX-066 cria `movimientos_intenciones` com unicidade `(empresa_id, clave)`, índice único parcial `(empresa_id, usuario_id) WHERE estado='RESERVADA'`, FK usuário/empresa, snapshot JSON e estado durável.
- `movimiento_intencion_reservar` usa advisory lock por empresa/usuário e COMMIT independente na orquestração `reservarIntencion`.
- `movimiento_intencion_tomar` usa `FOR UPDATE`; `ejecutarIntencion` usa dados do snapshot durável, motor NEX-014 e confirmação atômica em `movimiento_intencion_confirmar`; 422 com `resuelta:RECHAZADA` apenas após rejeição demonstrada.
- Autorização dos novos endpoints deriva empresa/usuário da sessão, valida `MOVIMIENTOS.CREAR` e usa funções `SECURITY DEFINER` com search_path explícito. Tabela nova não recebe grants diretos ao runtime.
- `RECUPERANDO` bloqueia registro até GET; falha de recuperação mantém bloqueado; intent `RESERVADA` recupera K1 e snapshot; 7 dias sinaliza revisão sem limpeza por idade; `Descartar este intento` eliminado.
- Código do histórico PRO-183 e preservação da data/rascunho PRO-184/187 não foram diretamente alterados salvo testes estruturais. NEX-014 permanece sem mudanças, e foi preparada documentação preflight/verificação/reversão.
- **Limitações:** revisão estática da sintaxe, transações, permissões e scripts. Nenhuma prova PostgreSQL real, React real, corrida em ambiente operacional, e não se confirma se NEX-066 está aplicada (Claude afirmou não).

## 5. Matriz de aceite condensada

| Requisito | Resultado |
| --- | --- |
| RN-01 checkpoint durável ANTES de qualquer POST de estoque | **NÃO CONFORME** — POST legado sem reserva |
| RN-02 retry idempotente após COMMIT e resposta perdida | **NÃO CONFORME** — confirmação some da recuperação |
| RN-03 bloqueio cross-tab/K2 por backend | **PARCIAL** — índice protege apenas RESERVADA, rota legada sem serialização |
| RN-04 recuperação após refresh/logout-login | **PARCIAL** — recupera RESERVADA, não CONFIRMADA sem entrega |
| RN-05 prova do resultado original sem falso LIBRE | **NÃO CONFORME** — null após CONFIRMADA interpreta como livre |
| RN-06 isolamento usuário/empresa e permissões | **CONFORME ESTATICAMENTE NOS ENDPOINTS NOVOS** |
| RN-07 prazo de 7 dias não descarta K1 automaticamente | **CONFORME ESTATICAMENTE** |
| RN-08 UX e erro de recuperação fail-closed | **PARCIAL** — saída segura para RESERVADA, mas sucesso perdido abre K2 |
| CA-01, CA-02, CA-03 | **NÃO ATENDIDOS** |
| CA-04, CA-05, CA-06, CA-07, CA-08 | **PARCIAL/ESTÁTICO**, condicionado à resolução e homologação humana |

## 6. Governança / continuidade

- **PRO-188/MOV-O07:** In Review, **CORREÇÃO SOLICITADA**, dois achados ALTA. A NEX-066 está versionada, mas sem aplicação operacional; **NÃO AUTORIZAR aplicação/deploy**.
- Abrir subtarefas **MOV-R08-01** (resultado confirmado sem reconhecimento) e **MOV-R08-02** (bypass da API legada), ambas ALTA e subordinadas ao PRO-188.
- **PRO-79 Movimientos:** In Review, NÃO HOMOLOGADO; todos os aceites estáticos antigos R04/R05/R07 permanecem, mas risco MOV-O07 continua não resolvido.
- Só o Claude implementa correções focais após autorização do responsável; ele cria scripts incrementais/atualiza NEX-066 **ainda não aplicada** ou migration aditiva conforme estado real e regras de versão, nunca executa SQL/VM/containers, e publica commit/push com testes dirigidos. Parar para **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R09**.
- **STK-D03/PRO-179** e outros menus não iniciados. A falha legada `cruzados`/NEX-053 não pertence ao escopo.
