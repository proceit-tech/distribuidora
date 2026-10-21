# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R03 — Reauditoria independente PRO-182/MOV-D01

**Data:** 19/10/2026 · **Auditor:** ChatGPT · **Projeto:** NEXIT/DistribuNex, somente desktop.  
**Repositório e branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.  
**Commits funcionais auditados:** `e546276c9d60940f330095bf53c210082ce2f293` (implementação) e `dea120fbed88c99322c73da4eb7c21fadba1266f` (remoção de import não usado nos casos); o segundo era HEAD confirmado da branch durante a revisão.  
**Auditoria predecessora:** [AUD-NEXIT-MOVIMIENTOS-DESKTOP-R02](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R02-2026-10-19.md).

## 1. Parecer independente

**MOV-D01 / PRO-182: CORRIGIDO PARCIALMENTE NO CÓDIGO, mas NÃO ACEITO ESTATICAMENTE — 1 ALTA e 1 MÉDIA residuais.**

Os aspectos centrais estão conformes: `crearControlRegistro` reserva intenção síncrona antes do primeiro `await`, congela payload por `structuredClone`, associa K1 durante POST e respostas indeterminadas, impede reenvios simultâneos, garante retry de payload/K1 original e só gera nova intenção após conclusão ou descarte explícito. O componente adota `fieldset disabled` e guardas no próprio controlador para os inputs editáveis, oferece retry e descarte advertido, e não modificou motor SQL/API/autorização. **Porém**, a interpretação de `RECHAZADO` como prova definitiva da inexistência de registro é falsa **após uma tentativa já indeterminada**, porque um retry pode receber 401/403/409/400 antes de chegar à idempotência SQL. Nesse caso K1 é perdido e uma futura tentativa com K2 pode duplicar o movimento original; além disso, resposta bem-sucedida tardia depois de o usuário abandonar o formulário pode impor navegação automática não solicitada.

**PRO-79 Movimientos: In Review, NÃO HOMOLOGADO.** PRO-183/MOV-D02 e PRO-184/MOV-D03 continuam abertas e intocadas; STK-D03 não foi iniciada. Não marcar nenhum Done.

## 2. Código, testes e invariantes revisados

Inspecionados os dois diffs e o código atual de `app/(private)/movimientos/nuevo/page.tsx`, `lib/movimientos/intento.ts`, `lib/movimientos/cliente-api.ts`, `lib/movimientos/intento.casos.ts`, o runner e casos de regressão `lib/inventario/movimientos.casos.ts` e `lib/stock/stock-reposicion.casos.ts`, além de `lib/ui/proteger-cambios.ts`, `components/ui/campo-fecha.tsx`, `app/api/movimientos/route.ts`, `lib/movimientos/shared.ts`, e contrato SQL `documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql`. Consultados normas atuais `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, auditoria R02 e tarefas oficiais.

**Conformidades estáticas confirmadas:**
- `intento.ts:31–64`: snapshot/clonagem, `intento` reservado antes do primeiro await, `OCUPADO` em concorrência, `INDETERMINADO` conserva K1/payload, `OK` libera com confirmação de número/repetido.
- `nuevo/page.tsx:48–53,99–117,123–163,224–227,345–362,485–499`: vínculo da página com controle, handlers de mudança de tipo/quantidade/custo guardados, `fieldset disabled={bloqueado}`, retry fora do fieldset, descarte expresso advertido, `useProtegerCambios` com mensagem de risco. `CampoFecha` é um input nativo sob o fieldset; callback `cambiar` também recusa mudança.
- `cliente-api.ts:65–87`: resposta `200/201` com número torna-se `OK` (inclusive `repetido`), rede/408/5xx/JSON ilegível de sucesso tornam-se `INDETERMINADO`.
- `app/api/movimientos/route.ts:129–151`: sessão/permissão CREAR, transação BEGIN/COMMIT/ROLLBACK e resposta `repetido` preservadas; `NEX-014:23,333–345` controla idempotência por **mesma** chave.
- Diff não altera `shared.ts`, funções SQL/migrations, ACL, `lib/movimientos/historial.ts`, detalhe, anulação, Stock nem menus adjacentes. MOV-D02 e MOV-D03 não foram alterados.
- Testes do Claude adaptaram assertions estruturais históricas ao novo mecanismo sem desativar o runner; novo arquivo exercita helper/classificador reais contra servidor **simulado**, não banco real.

## 3. Achados corretivos após R03

### MOV-R03-01 — ALTA — RETRY REJEITADO após indeterminação perde K1 e reabre duplicação

**Evidência:** `lib/movimientos/cliente-api.ts:84` converte qualquer status HTTP 4xx, salvo 408, em `{tipo:"RECHAZADO"}`, mesmo se for resposta de retry de tentativa anterior indeterminada. `lib/movimientos/intento.ts:44–61` redefine estado em `ENVIANDO` para executar retry, mas ao receber `RECHAZADO` executa `intento = null` incondicionalmente, descartando K1 e liberando nova chave. `app/(private)/movimientos/nuevo/page.tsx:148–162` aplica esse desbloqueio. O teste `intento.casos.ts:142–152` verifica 4xx apenas como primeira tentativa sem COMMIT; não cobre 4xx após falha indeterminada de tentativa já gravada.

**Cenário demonstrável por contratos (sem execução real):** K1 registra e COMMIT sucede, resposta perde-se e fica INDETERMINADO. No retry com K1, sessão expira ou CREAR é revogado: `app/api/movimientos/route.ts:129–132` devolve 401/403 **antes** de alcançar `inventario_registrar_movimiento`; portanto o 401/403 não demonstra que o registro K1 anterior inexiste. O cliente classifica como RECHAZADO, o controlador apaga K1, libera formulário e uma próxima tentativa K2 pode gravar segundo efeito físico após permissão ser restaurada. Outro cenário válido: preflight de lote/produto em `lib/movimientos/shared.ts:95–135` ocorre antes da checagem de K1 no SQL e pode rejeitar um retry devido a alterações intervenientes, sem negar o COMMIT anterior. Além disso, `mensajeError` converte JSON inválido de erro 4xx em mensagem fallback e a classificação segue RECHAZADO, apesar da promessa de tratar respostas ilegíveis como indeterminadas.

**Impacto:** mantém aberta a condição de duplicação que motivou MOV-D01. Não se afirma que tenha ocorrido em dados reais.

**Aceite futuro limitado:** considerar histórico da **mesma intenção**: após qualquer tentativa indeterminada, um 4xx subsequente não pode automaticamente provar que o COMMIT anterior não ocorreu nem descartar K1. Preservar K1, payload e estado de risco, com mensagem precisa (p.ex. pedir reautenticação/regularização de acesso e consulta do histórico) ou desbloquear **somente diante de confirmação autoritativa de não registro**. Não mascarar 409 de conflito de payload como confirmação de sucesso. 4xx inequivocamente rejeitado na primeira tentativa, sem histórico incerto, pode continuar liberando edição; não enfraquecer validações. Tratar resposta de erro 4xx ilegível de forma conservadora quando seu resultado não puder ser determinado. Testes controlados: COMMIT K1 com resposta perdida → retry 401, 403, 409, 400 por preflight ou 4xx ilegível → **K1 não é descartado**; outra tentativa não recebe K2 automaticamente; primeira tentativa 400 válida libera, e retry após recuperação de sessão com K1 confirma `repetido` se o servidor assim responder. **Sem SQL novo nem PG**.

### MOV-R03-02 — MÉDIA — Sucesso tardio após saída autorizada pode redirecionar usuário de outra tela

**Evidência:** `nuevo/page.tsx:83–84` usa `useProtegerCambios` com mensagem especial durante envio, mas `lib/ui/proteger-cambios.ts:49–64` **permite navegação** depois de `window.confirm` positivo. A função `submit` em `nuevo/page.tsx:148–159` aguarda promessa e, se `OK`, chama `router.push("/movimientos?ok=...")` sem verificar se a instância/contexto ainda está montada ou se o operador já decidiu sair. Um resultado tardio do primeiro POST pode portanto impor nova navegação sobre página de destino escolhida e confirmada pelo operador.

**Cenário:** clicar Registrar K1, escolher «← Movimientos» ou link de outro menu e **confirmar a saída** com aviso de risco; a tela de criação desmonta; chega resposta tardia `OK`; handler assíncrono ainda tenta `router.push` do fluxo abandonado, potencialmente redirecionando novamente a partir da página atual. **Não houve teste React ou browser real**, logo é risco determinado pelo ciclo de callback, não reprodução operacional.

**Aceite futuro:** após desmontagem/abandono, resposta tardia não deve apresentar estado/erro nem navegar automaticamente; isso **não cancela** a gravação no servidor e não deve apagar prova do resultado em curso sem aviso. A confirmação autorizada de saída é mantida. Teste controlado de promessas com saída confirmada antes de resolver POST OK, erro e INDETERMINADO, distinguindo estado da UI do ciclo real da intenção; sem alteração de SQL, permissions ou motor.

**Nota de UI não classificável como outro bug demonstrado:** cabeçalho apresenta «Sin registrar» estaticamente mesmo na fase INDETERMINADO, mas há aviso expresso sobre resultado desconhecido. Registrar melhoria opcional de rótulo após corrigir riscos, sem atribuir nova falha nesta R03.

## 4. Testes e limitações

Claude relatou `intento.casos.ts` **12 verificações/0 falhas**, regressão Movimientos **20/0**, Stock–Reposición **275/0**: **307 verificações/0 falhas reportadas, não reexecutadas por ChatGPT**. ESLint/tipos pontuais reportados sem falhas. `cruzados` mantém asserção preexistente relacionada à última migration NEX-053, não incluída nem alterada no diff.

Novo teste controla promessas e simula o servidor conforme chave e payload; testa K1 perdida/comitada e retry 200 `repetido`, concorrência, bloqueios lógicos, validação e descarte explícito. Porém **não cobre indeterminado→4xx nem saída confirmada→resposta tardia**, e verifica apenas ligações estruturais da tela (regex), não React real, campo nativo disabled no navegador, integração HTTP com autenticação, concorrência SQL ou estado de deployment.

**Auditor executou ZERO testes**, operações no PostgreSQL/VM, SQL, browser, Docker, CI, build ou lint. Não há homologação humana inferível do código versionado.

## 5. Governança e continuidade

- **PRO-182/MOV-D01:** núcleo implementado/conforme estaticamente; status **In Review, CORREÇÃO SOLICITADA** por MOV-R03-01 ALTA e MOV-R03-02 MÉDIA; sem Done nem homologação.
- **PRO-183/MOV-D02 e PRO-184/MOV-D03:** Todo, não tocadas. MOV-O01…O06 permanecem observações da R01/R02, sem recontagem.
- **PRO-79 Movimientos:** In Review, **não homologado**.
- Se autorizado pelo responsável, Claude implementa **apenas os dois resíduos da R03** em rodada dirigida, testa minimamente (sem suíte global/PG/VM/CI/deploy), faz commit/push, e **PARA para a AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04**.
