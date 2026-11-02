# AUD-NEXIT-MOVIMIENTOS-DESKTOP-R05 — Reauditoria independente PRO-183 / MOV-D02

**Data:** 19/10/2026 · **Auditor:** ChatGPT · **Sistema:** NEXIT/DistribuNex V1, apenas desktop.  
**Repositório:** `proceit-tech/distribuidora` · **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado e confirmado HEAD:** `a484a1fe13296b13f394d4798c8dc1593393bcbe` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/a484a1fe13296b13f394d4798c8dc1593393bcbe)).  
**Antecedentes:** [AUD-R02 (origem MOV-D02)](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R02-2026-10-19.md), [AUD-R04 (MOV-D01)](./AUD-NEXIT-MOVIMIENTOS-DESKTOP-R04-2026-10-19.md); tarefa [PRO-183](https://linear.app/proceit/issue/PRO-183).

## 1. Parecer

**PRO-183 / MOV-D02 — CONFORME ESTATICAMENTE.** A implementação remove a exposição de linhas, resumos, links, permissões e paginação de uma resposta anterior quando a chave da consulta exibida é diferente da chave vigente. Respostas e erros tardios de consultas anteriores são descartados. **Não foi identificado novo defeito corretivo ALTA/MÉDIA no escopo do diff.** Este é um aceite da correção estática, **não é homologação operacional** e não autoriza fechar PRO-79 nem avançar autonomamente.

**PRO-184 / MOV-D03 (MÉDIA)** segue Todo, não corrigida; MOV-D01/PRO-182 e PRO-185/186 conservam aceite estático R04 com risco **MOV-O07** de K1 perdida ao sair/recarregar página indeterminada. **PRO-79 Movimientos permanece In Review, NÃO HOMOLOGADO.**

## 2. Escopo e fontes examinadas

Leitura no GitHub da branch, commit/diff e código completo dos novos `lib/movimientos/vista-historial.ts` e `lib/movimientos/historial.casos.ts`, `app/(private)/movimientos/page.tsx`, alterações de `scripts/casos-clientes/run.js`, `lib/stock/stock-reposicion.casos.ts`, `PROGRESSO-NEXIT-V1.md`; leitura de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, AUD-R04, contrato da API/serviço `app/api/movimientos/route.ts`, `lib/movimientos/cliente-api.ts` e estado do Linear.

O commit altera **seis arquivos**: `app/(private)/movimientos/page.tsx`, `lib/movimientos/vista-historial.ts`, `lib/movimientos/historial.casos.ts`, `lib/stock/stock-reposicion.casos.ts`, `scripts/casos-clientes/run.js`, `PROGRESSO-NEXIT-V1.md`. **Sem alterações** no GET/POST da API, SQL/migrations, autorização, formulário de registro, idempotência e demais menus.

## 3. Matriz de verificação

| Critério | Evidência estática e correspondência | Parecer |
| --- | --- | --- |
| Dados apenas da consulta vigente | `vista-historial.ts:14–18`: `derivarVista` devolve `datos=null` e `error=""` se `resultado.clave !== claveConsulta` ou lista ainda não pronta; `page.tsx:125–131` obtém `filas`, `resumen`, totais e paginação somente da vista derivada | **CONFORME** |
| Linhas e links não são reutilizados em filtro novo | `page.tsx:280–367` constrói linhas/links só de `filas`, que vêm de `derivarVista`; `Cargando movimientos...` em `cargando` | **CONFORME** |
| Resumos neutros sem 0 fictício | `page.tsx:183–207` mostra `—` para KPIs sem `resumen`; zeros reais só se o servidor retornar dados de resposta vigente | **CONFORME** |
| Paginação coerente | `page.tsx:372–388`: `Mostrando —`, página `—` e botões `disabled={!datos || ...}` em carga/erro | **CONFORME** |
| Respostas e erros atrasados | `vista-historial.ts:20–34`: `lanzarConsulta` com flag local `activo` e cleanup, somente publica resultado ativo; o próprio vínculo por chave impede apresentação fora do contexto | **CONFORME ESTATICAMENTE** |
| Erro da consulta vigente e retry | `derivarVista` conserva `error` quando chave coincide e `datos=null`; `page.tsx:259–265` mostra erro e aumenta `recarga`, parte de `claveConsulta`, mascarando imediatamente resultado anterior | **CONFORME** |
| Vazio legítimo não confundido com carregamento/erro | `page.tsx:345–364`: prioridade `cargando`, depois `errorCarga`, depois estado vazio, com CTA restrito a `datos?.permisos?.crear` | **CONFORME** |
| CTA «Nuevo movimiento» da resposta atual | `page.tsx:175–180,359–363`: a permissão é retirada de `datos` vigente; API preserva `MOVIMIENTOS.VER` e autorização para criação | **CONFORME** |
| Confirmação pós-registro `?ok` | `page.tsx:48–71,84–114`: `pendienteConfirmar` integra consulta server-side; só `r.datos?.confirmado===true` gera mensagem de sucesso e erro não a gera. `app/api/movimientos/route.ts:104–111` preserva `movimientoExiste` com alcance autorizado | **CONFORME NO DIFF** |
| Debounce e busca/ordenação/página | `page.tsx:73–82,133–137`: debounce 300 ms, filtro efetivo com `busquedaAplicada`, chave considera filtros, página e recarga; serviço continua paginado no servidor | **CONFORME** |

## 4. Limites de prova e observações

**Claude reportou testes, não reexecutados pelo ChatGPT:** `historial.casos.ts` **15 verificações/0 falhas** (helpers reais com promises controladas e cabeamento de tela simulado); regressão `intento` **30/0**, `movimientos` **20/0**, `stock-reposición` **275/0**, total **340/0**. Tipos pontuais reportados OK; ESLint sem erros e warning antigo em `lib/movimientos/intento.casos.ts:240` sobre parâmetro `m` sem uso (fora do diff). Falha preexistente `cruzados.casos.ts` relacionada à migration NEX-053 intocada.

Os 15 testes cobrem A→B, resposta A tardia, A→B→C com erro tardio, página, ordenação, falha/retry, vazio/carregando/erro, CREAR vigente, total de linhas vs movimentos distintos e desmontagem. Uma asserção estrutural verifica a ligação da UI e confirmação; **não equivale a renderização React nem browser**. O debounce de pesquisa tem fase de 300 ms em que o texto digitado pode diferir temporariamente do filtro **aplicado**; o escopo aprovado mantém esse comportamento, não é bug MOV-D02 reaberto. Consultas com o mesmo identificador após uma alternância rápida não foram testadas em React real, sem evidência de regressão.

**Testes executados pelo ChatGPT: ZERO.** Sem SQL/PG real, HTTP integrado, navegador, VM/Docker, build/CI/lint/tsc global, migrations ou deploy. Não afirmar ausência de dados obsoletos em todos os cenários runtime como fato operacional.

## 5. Estado e próximos passos

- **PRO-183/MOV-D02:** aceite técnico estático, **In Review**, não Done, não homologado.
- **PRO-79 Movimientos:** In Review, **NÃO HOMOLOGADO**; a pendência corretiva funcional remanescente é **PRO-184/MOV-D03** (perda de borrador ao atravessar meia-noite no timezone America/Asuncion).
- **PRO-182/MOV-D01 e PRO-185/186:** aceite estático R04 preservado. **MOV-O07:** K1 indeterminada só na memória da instância; saída/reload exige consulta do histórico antes de iniciar nova intenção. Não abrir persistência cross-page sem decisão do responsável.
- **PRO-179/STK-D03:** investigação distinta; não iniciada.
- Implementação de PRO-184 somente após autorização humana expressa, testes focais, commit/push e **AUD-NEXIT-MOVIMIENTOS-DESKTOP-R06** independente. Não iniciar outros menus automaticamente.
