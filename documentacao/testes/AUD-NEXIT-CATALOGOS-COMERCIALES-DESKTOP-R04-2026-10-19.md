# AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R04 — Reauditoria independente PRO-176 / PRO-177

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT / ERP DistribuNex, somente desktop. **Repositório:** `proceit-tech/distribuidora`; **branch:** `feature/NEXIT-2026-001-banco-demo`. **SHA funcional auditado:** `b52eaa293241d6d8a1907f7ac861fe3ba6c5102c`, **pai:** `a05959fe7a076b29c9b64e39b0d3b0ade5095f76`. **HEAD da branch confirmado nesse SHA na abertura da auditoria.**

## Parecer executivo

**PRO-176 / CC-R03-01 MÉDIA: CONFORME EM AUDITORIA ESTÁTICA DIRIGIDA.** Os seis campos editáveis de Catálogos comerciales, no listado e em `/nuevo`, agora ficam desabilitados durante POST/PUT, com proteção adicional nos handlers `actualizar`. `aplicarCambioCampo` impede alteração do rascunho sob exclusão. Em HTTP 409 ou erro de rede, o formulário preserva seus dados e as operações voltam a ficar disponíveis após liberação da exclusão existente.

**PRO-177 / CC-R03-02 BAIXA: CONFORME EM AUDITORIA ESTÁTICA DIRIGIDA.** `listarCambios` distingue `INVALIDA`, autorizando essa finalidade com ação `SESION` (apenas sessão válida), e então responde HTTP 400 sem exigir VER e sem executar consulta SQL. Ausência de sessão continua 401; consulta mínima válida `modo=monedas` continua VER-ou-CREAR, com resposta mínima; listagem e histórico continuam exigindo VER e devolvem 403 quando não autorizado.

**PRO-173, PRO-174 e PRO-175:** aceites prévios preservados no código, sem alteração das regras de câmbio, histórico, versionamento, empresa, POST/PUT ou migrations. **Nenhum novo bloqueio técnico demonstrável neste recorte R02–R04.** A etapa corretiva estática dirigida de **Maestros → Catálogos comerciales** pode ser considerada concluída, mas o **menu NÃO HOMOLOGADO**, e nenhuma issue Done. A validação operacional humana no navegador, API real e PostgreSQL permanece obrigatória.

## 1. Fontes, diff e limite

Foram consultados no GitHub `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` pertinente, `documentacao/testes/AUD-NEXIT-CATALOGOS-COMERCIALES-DESKTOP-R03-2026-10-19.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-CATALOGOS-COMERCIALES-V1.md`, Linear PRO-176/177/174/173/175/71, diff completo e código final de:
- `app/(private)/catalogos-comerciales/_components/catalogos-comerciales.tsx` e `app/(private)/catalogos-comerciales/nuevo/page.tsx` (handlers `actualizar`, POST/PUT, exclusão, bloqueio de campos);
- `components/ui/campo-fecha.tsx` (prop `disabled` alcança `input`);
- `lib/comercial/formulario.ts`, `lib/productos/catalogos-operacion.ts` (helper puro e exclusão síncrona existente);
- `lib/comercial/servidor.ts`, `lib/comercial/acceso-get.ts` e `app/api/catalogos-comerciales/tipos-cambio/route.ts` (cadeia GET/401/400/403/200);
- `lib/comercial/estabilizacion.casos.ts` e relatórios anteriores.

**Commit: seis arquivos modificados, 161 adições/21 exclusões:** componentes de listado/alta, `lib/comercial/{formulario,servidor,estabilizacion.casos}.ts`, `PROGRESSO-NEXIT-V1.md`. Sem novos endpoints ou migrations. Não se modificaram SQL histórico, `lib/comercial/cambio-decimal.ts`, `version.ts`, serviços de Listas, clientes ou inventário.

## 2. Matriz do aceite PRO-176

| Critério | Evidência | Parecer |
|---|---|---|
| Fecha | `CampoFecha` no listado recebe `disabled={corrigiendo || ocupado}`; no alta recebe `disabled={ocupado}`. O componente compartilhado repassa `disabled` ao elemento `input`. | **CONFORME** |
| Moneda | `select` em listado e alta recebe bloqueio pelo estado `ocupado`; correção de câmbio já a bloqueava por `corrigiendo`. | **CONFORME** |
| Cambio, Motivo, Código e Nombre | Cada `input` aplicável recebe `disabled={ocupado}` em ambos os formulários (Motivo é somente edição/correção no listado). | **CONFORME** |
| Handler não admite alteração no envio | `actualizar` retorna imediatamente se `exclusion.current.activa()`; caso contrário usa `aplicarCambioCampo` sobre `form`. O helper devolve a mesma referência quando `bloqueado=true`. | **CONFORME** |
| Concorrência e estado pós-erro | `crearExclusion` já mantém a exclusão de forma síncrona e libera em `finally`; POST/PUT da tela não pode iniciar duas vezes; tratamento de 409/erro não fecha o formulário, e `setOcupado(false)` libera os controles; sucesso fecha ou confirma sem admitir edição posterior ao envio. | **CONFORME NO CÓDIGO** |
| Preservação | Nenhuma mudança nas regras de validação/cotação monetária, versões, autorizações, dados da sessão nem arquivos SQL. | **SEM REGRESSÃO NO DIFF** |

**Limite:** cliques/teclado num React realmente montado não foram testados. O caso puro de `aplicarCambioCampo` e o modelo de `crearExclusion` são evidências comportamentais direcionadas; o vínculo com as telas é inspecionado e complementado por asserts estruturais, não por browser.

## 3. Matriz do aceite PRO-177

| Critério | Evidência | Parecer |
|---|---|---|
| Sem sessão | `preparar("SESION")` chama `sesion()` e responde 401 caso nulo, antes do ramo 400. | **CONFORME** |
| Modo inválido com sessão | `finalidadComercial` identifica `INVALIDA` para `modo=monedas` repetido/misto; `listarCambios` usa `preparar("SESION")` e então retorna JSON 400. A ação SESION não concede VER ou CREAR. | **CONFORME** |
| Consulta mínima | `finalidad===MONEDAS` segue `preparar("VER_O_CREAR")`; somente moedas ativas diferentes de PYG e a flag VER são retornadas. | **CONFORME** |
| Listado/histórico/valores desconhecidos | Demais finalidades seguem `preparar("VER")`, negando 403 sem VER; parâmetros inválidos nunca são interpretados como mínimos. | **CONFORME** |
| Banco | Com finalidade inválida, retorno 400 precede `b.db.query` e não retorna dados comerciais. `preparar("SESION")` importa o módulo do banco antes do 400, mas **não executa SQL** no ramo inválido. | **CONFORME AO CRITÉRIO SEM CONSULTAS SQL** |

**Cobertura do teste:** a nova suíte de estabilização chama efetivamente `listarCambios` por import com mocks de `require.cache` de sessão/permissões/banco, com respostas `NextResponse`; checa 401 sem sessão, 400 inválido sem SQL, 200 de moedas mínimo, 403 listado/histórico sem VER e empresa da sessão em consulta normal. Não foi realizado HTTP por servidor real e não se assume que esses testes cobrem configurações do `DEMO_MODE`/ausência de `DATABASE_URL` em produção.

## 4. Testes informados e limites operacionais

**Testes reportados pelo Claude, não executados pelo ChatGPT:** `comercial/estabilizacion` **75 verificações/0 falhas (12 novas)**; regressões focais `comercial` **61/0** e `listas-comerciales` **93/0**. ESLint e tipos pontuais dos arquivos alterados informados OK. Os novos testes cobrem promessa POST/PUT pendente + digitação recusada, retorno 200/409/erro de rede, os seis campos, wiring estrutural das duas telas e a cadeia real do handler `listarCambios` com mocks de sessão e base. **Os mocks não substituem HTTP real.**

O auditor não executou qualquer teste, não renderizou/clicou componentes React, não realizou HTTP real, PostgreSQL/VM/Docker, SQL/migrations, teste global, build/tsc/lint global, CI manual nem deploy. Não declarar aprovação E2E, conformidade integral de segurança ou homologação.

## 5. Situação canônica e próximo menu

- **PRO-176 / CC-R03-01:** `In Review`, **ACEITO ESTATICAMENTE**, não Done/não homologado.
- **PRO-177 / CC-R03-02:** `In Review`, **ACEITO ESTATICAMENTE**, não Done/não homologado.
- **PRO-174 / CC-D02 e PRO-173 / CC-D01:** `In Review`, os respectivos resíduos PRO-176 e PRO-177 foram sanados estaticamente; não Done/não homologado.
- **PRO-175 / CC-D03:** `In Review`, aceite estático de R03 preservado.
- **PRO-71 / Catálogos comerciales:** `In Review`, **etapa corretiva dirigida R02–R04 sem bloqueio técnico conhecido**, **NÃO HOMOLOGADO** até validação humana operacional. Nenhuma tarefa encerrada em Done.
- O responsável pode solicitar auditoria do próximo menu na sequência acordada, sem transformar aceite estático em homologação. Não iniciar outro menu automaticamente nem criar correção Claude sem achado técnico comprovado.
