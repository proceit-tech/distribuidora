# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R11 — Reauditoria independente PRO-193 / MOV-R10-01

**Data:** 20/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT/DistribuNex V1 — menu Inventario → Movimientos, desktop.  
**Repositório/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional e HEAD conferido:** `2d6d2fcd87b99d849e456c748f191623de9c7c84` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/2d6d2fcd87b99d849e456c748f191623de9c7c84)).  
**Auditoria precedente:** [AUD-R10](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R10-2026-10-19.md). **Especificação:** [REQ-MOV-O07](../definicoes/REQ-MOV-O07-RECUPERACAO-INTENCAO.md).  
**Tarefas:** [PRO-193](https://linear.app/proceit/issue/PRO-193) filha de [PRO-192](https://linear.app/proceit/issue/PRO-192), sob [PRO-188](https://linear.app/proceit/issue/PRO-188).

## 1. Parecer

**PRO-193 / MOV-R10-01: CONFORME ESTATICAMENTE — CORREÇÃO ACEITA.** O único achado da AUD-R10 foi corrigido: a função PostgreSQL `movimiento_intencion_reservar` passa a aplicar `movimiento_intencion_visible` à intenção já armazenada **após conferir empresa, titularidade e hash, mas antes de retornar snapshot, estado ou quaisquer dados**. Sem visibilidade, o servidor envia resposta 409 neutra sem dados e o frontend adota `PENDIENTE_NO_VISIBLE`, permanecendo `RECUPERACION_ERROR`, com K2 bloqueada. Não foram identificados novos defeitos bloqueantes ALTA/MÉDIA no diff restrito da correção.

**PRO-192 / MOV-R09-02: CONFORME ESTATICAMENTE NO ESCOPO DE VISIBILIDADE**, incluindo rotas de consulta, execução, ACK e repetição de reserva K1. **PRO-191/MOV-R09-01 continua CONFORME ESTATICAMENTE** (ACK somente por clique), e **PRO-190/MOV-R08-02 continua CONFORME ESTATICAMENTE** (POST legado 410); as alterações não tocam seus arquivos. **PRO-188/MOV-O07: ESCOPO DE PROTEÇÃO DURÁVEL CONFORME ESTATICAMENTE NO CONJUNTO R08–R11, porém NÃO HOMOLOGADO OPERACIONALMENTE.**

**Não confundir:** estática conforme não prova SQL de NEX-066 funcionando em PostgreSQL real, comportamento React/browser, permissões no banco da VM, concorrência real nem rollout seguro. A NEX-066 é **declarada NÃO APLICADA** pelo implementador, **não verificada operacionalmente pelo auditor**. A ausência de novos achados estáticos nesta rodada libera **a análise humana de pré-verificação e plano controlado**, não constitui ordem ou autorização automática para executar migration, atualizar VM ou fazer deploy. PRO-79 segue In Review, NÃO HOMOLOGADO.

## 2. Auditoria do commit e da cadeia SQL → servidor → cliente

O diff funcional altera apenas quatro arquivos: `documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql`, `lib/movimientos/intenciones.ts`, `lib/movimientos/intenciones.casos.ts` e `PROGRESSO-NEXIT-V1.md`. HEAD da branch oficial conferido no SHA informado. Revisados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso, AUD-R10, script versionado, implementação do servidor/cliente, controlador, tela, rotas, teste de simulação e scripts/procedimento da NEX-066.

| Invariante | Evidência | Parecer |
| --- | --- | --- |
| Repetição mesma K1 só revela snapshot autorizado | `NEX-066-movimientos-intenciones.sql:101–113`: após `usuario_id` e `huella` correspondentes, `IF NOT public.movimiento_intencion_visible(...,v_prev.snapshot) THEN RAISE ... 42501 / NEX:INTENCION_SIN_VISIBILIDAD`, antes do `RETURN QUERY`. Aplica-se a `RESERVADA` e `CONFIRMADA` | **CONFORME** |
| Sem alterar intenção ou estoque com erro de visibilidade | Ramo contém apenas SELECT, guarda e RAISE antes de RETURN; erro reverte transação de reserva e preserva K1, estado, `reconocida_at`, número e estoque | **CONFORME NO DIFF** |
| Neutralidade do erro HTTP | `lib/movimientos/intenciones.ts:105–129`: reconhece SQLSTATE 42501 + detalhe `NEX:INTENCION_SIN_VISIBILIDAD` **antes** de erro genérico e devolve `ErrorIntencion` HTTP 409 com `pendiente:true, intencion:null, sinVisibilidad:true` e mensagem neutra; não devolve K1, snapshot ou número | **CONFORME** |
| Falha fechada no cliente | `lib/movimientos/cliente-api.ts:161–170`: 409 + `pendiente:true/sinVisibilidad:true` vira `PENDIENTE_NO_VISIBLE`; `lib/movimientos/intento.ts:164–170`: seta `RECUPERACION_ERROR`, recusa novas operações; DB também impõe índice único de RESERVADA/CONFIRMADA sem ACK | **CONFORME** |
| Conflito de K1/hash distinto não vaza dados | SQL continua comparando `usuario_id` e `huella` antes da visibilidade e devolvendo `NEX:INTENCION_CONFLICTO` neutro, sem snapshot | **PRESERVADO** |
| Idempotência da K1 autorizada | Após permissão/escopo restaurados, `movimiento_intencion_visible` permite retorno de intenção existente, `o_nueva=false`, sem novo efeito de estoque | **PRESERVADO** |
| Permissão e depósitos | `movimiento_intencion_visible` usa `usuario_tiene_permiso(MOVIMIENTOS,VER)` e `usuario_puede_deposito` da NEX-014 para ambos os depósitos relevantes (depósito ativo e dentro do alcance) | **PRESERVADO** |
| ACK explícito e POST legado | `nuevo/page.tsx:207–233`: `alRegistrar` só mostra mensagem, botão chama `confirmarRecepcionOperador`; `app/api/movimientos/route.ts:117–124`: POST legado responde 410. Ambos fora do diff | **PRESERVADO** |
| NEX-014, schema e scripts | NEX-014 não mudou, NEX-066 **não aplicada**, numeração preservada. Scripts preflight/verificação/reversão e procedimento foram lidos; não exigem edição para a checagem adicional em função existente | **SEM NOVA ALTERAÇÃO** |

## 3. Testes dirigidos e limites

**Números reportados pelo Claude, não executados pelo ChatGPT:** `intenciones` **120 verificações, 0 falhas**; regressões `intento` **30/0**, `inicializacion` **17/0**, `historial` **15/0**, `movimientos` **20/0**, `stock-reposición` **275/0** — **477 verificações, 0 falhas reportadas**.

O teste usa `bdSimulada` com orquestração real do servidor e cliente de reserva; no ramo correspondente da base simulada reproduz agora `if (!visible(empresa,usuario,previa.snapshot)) throw sinVisibilidad()`. Para os cinco cenários de mutação de acesso (VER, CREAR, depósito de origem, depósito de destino e depósito inativo/fora do alcance), testa `RESERVADA` e `CONFIRMADA` sem ACK, POST reserva com mesma K1 e mesmo snapshot, resposta sem dados, K2 bloqueada, estoque intocado, conflito com hash diferente e restabelecimento de autorização/idempotência. Testes do caso sem CREAR esperam 403, os de revogação de visibilidade com CREAR esperam 409.

**Limitações expressas:** PostgreSQL real não executado; nenhuma prova real de sintaxe, plano SQL, índice, locking/isolamento ou grants. Browser/React não renderizado; o teste da tela é indireto/estrutural. O `tsc` do projeto de casos compilou conforme implementador; ESLint/tsc pontuais dos arquivos não foram executados. Falha antiga `cruzados`/NEX-053 não alterada. Não se executaram VM, Docker, SQL, migration, deploy, CI manual, bateria global ou teste PostgreSQL por esta auditoria. Números acima são **reportados**, não verificados por execução independente.

## 4. Próxima etapa sob responsabilidade humana

Não resta correção de código autorizada neste recorte depois do aceite da PRO-193. `PRO-193`, `PRO-192`, `PRO-191` e `PRO-190` mantêm estado **In Review, conforme estaticamente, NÃO Done**; `PRO-188` também **In Review, conforme estaticamente no conjunto da proteção**, condicionado à validação operacional; `PRO-79` **In Review, NÃO HOMOLOGADO**.

O responsável humano deverá, quando decidir iniciar a implantação, observar procedimento oficial `documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-066.md`, conferir backup e pré-verificação read-only, versão real das migrations e função/permissões, avaliar a implantação *primeiro migration e só depois código* e executar validação real e visual guiada. Sem pré-verificação e aceite humano explícito, não aplicar NEX-066/deploy. Não afirmar que a migration está aplicada antes de evidência. Não avançar automaticamente STK-D03/PRO-179 nem outro menu.
